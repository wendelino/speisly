import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { dataSource } from "@/lib/db/schema/dataSource";
import { meal, mealUpdate, mensa, mensaMeal } from "@/lib/db/schema/schema";
import { genId } from "@/lib/db/utils";
import { toIsoDay } from "../dates";
import { db } from "../db";
import { logError } from "../log";
import type { MealChange, NewMeal, SyncPlan } from "./plan";
import type {
  DataSourceRecord,
  GetExistingMensaMealsParams,
  MealUpdateLog,
  MensaMealRecord,
} from "./types";
import { normalizeDateRange, toSlug } from "./utils";

/** Zeilen pro INSERT (Postgres erlaubt max. 65 535 Parameter je Statement) */
const CHUNK = 500;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Gets an existing data source or creates a new one
 */
export async function getOrCreateDataSource(
  name: string
): Promise<DataSourceRecord> {
  const existingSource = await db
    .select({ slug: dataSource.slug })
    .from(dataSource)
    .where(eq(dataSource.name, name))
    .limit(1);

  if (existingSource.length > 0) {
    return existingSource[0];
  }

  const newDataSource = await db
    .insert(dataSource)
    .values({ id: genId(), name, slug: toSlug(name) })
    .returning({ slug: dataSource.slug });

  return newDataSource[0];
}

/**
 * Gets all existing mensa meals within a date range
 */
export function getExistingMensaMeals({
  date,
}: GetExistingMensaMealsParams): Promise<MensaMealRecord[]> {
  const { from, to } = normalizeDateRange(date);
  return db
    .select({
      id: mensaMeal.id,
      mensaId: mensaMeal.mensaId,
      mealId: mensaMeal.mealId,
      date: mensaMeal.date,
      ingredients: mensaMeal.ingredients,
      extras: mensaMeal.extras,
      // bewertete Ausgaben löscht der Sync nie automatisch (plan.ts)
      rated: sql<boolean>`exists (select 1 from "meal_rating" r where r."mensa_meal_id" = "mensa_meal"."id")`,
    })
    .from(mensaMeal)
    .where(
      and(
        gte(mensaMeal.date, new Date(from)),
        lte(mensaMeal.date, new Date(to))
      )
    );
}

/**
 * Lädt bestehende Gerichte zu den Quell-IDs der API (nur für den Sync)
 */
export function getMealsBySrcIds(srcIds: string[]) {
  if (srcIds.length === 0) {
    return Promise.resolve([]);
  }
  return db
    .select({
      name: meal.name,
      id: meal.id,
      imgPath: meal.imgPath,
      priceStud: meal.priceStud,
      priceWork: meal.priceWork,
      priceGuest: meal.priceGuest,
      subtitle: meal.subtitle,
      srcId: meal.srcId,
    })
    .from(meal)
    .where(inArray(meal.srcId, srcIds));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Ein UPDATE … FROM (VALUES …) für viele Gerichte */
function batchUpdate(tx: Tx, changes: MealChange[]) {
  const rows = changes.map(
    ({ mealId, values: v }) =>
      sql`(${mealId}, ${v.name}, ${v.subtitle ?? ""}, ${v.imgPath ?? null}, ${v.priceStud}::integer, ${v.priceWork}::integer, ${v.priceGuest}::integer)`
  );
  return tx.execute(sql`
    update ${meal} set
      name = v.name, subtitle = v.subtitle, img_path = v.img_path,
      price_stud = v.price_stud, price_work = v.price_work,
      price_guest = v.price_guest, updated_at = now()
    from (values ${sql.join(rows, sql`, `)})
      as v(id, name, subtitle, img_path, price_stud, price_work, price_guest)
    where ${meal.id} = v.id`);
}

/**
 * Aktualisiert geänderte Gerichte, im Normalfall mit einem Statement pro
 * 500 Gerichte. Scheitert das (z. B. Konflikt auf `meal_unique`), einzeln
 * mit Savepoint, damit nur das betroffene Gericht ausfällt.
 */
async function updateMeals(
  tx: Tx,
  changes: MealChange[]
): Promise<MealChange[]> {
  const applied: MealChange[] = [];
  for (const batch of chunks(changes)) {
    try {
      await tx.transaction((sp) => batchUpdate(sp, batch));
      applied.push(...batch);
      continue;
    } catch {
      // einzeln weiter
    }
    for (const change of batch) {
      try {
        await tx.transaction((sp) => batchUpdate(sp, [change]));
        applied.push(change);
      } catch (error) {
        // Die Ausgaben des Gerichts werden trotzdem abgeglichen. Vorher
        // fielen sie dabei heraus und wurden als „nicht mehr in der API“
        // gelöscht.
        logError({ message: "Error updating meal", ctx: { change, error } });
      }
    }
  }
  return applied;
}

function insertMealRows(tx: Tx, rows: NewMeal[]) {
  return tx
    .insert(meal)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: meal.id });
}

/**
 * Legt neue Gerichte an und gibt die IDs der tatsächlich angelegten zurück.
 * Übersprungen (und geloggt) werden wie bisher Gerichte, die gegen
 * `meal_unique` verstoßen (gleicher Name, Untertitel und Bild unter anderer
 * src_id) oder die die DB ablehnt (z. B. zu langer Name). Ein einzelnes
 * fehlerhaftes Gericht blockiert so nicht den ganzen Sync.
 */
async function insertMeals(tx: Tx, meals: NewMeal[]): Promise<Set<string>> {
  const inserted = new Set<string>();
  const failed = new Set<string>();
  for (const batch of chunks(meals)) {
    let rows: { id: string }[] = [];
    try {
      rows = await tx.transaction((sp) => insertMealRows(sp, batch));
    } catch {
      for (const row of batch) {
        try {
          rows.push(
            ...(await tx.transaction((sp) => insertMealRows(sp, [row])))
          );
        } catch (error) {
          failed.add(row.id);
          logError({
            message: "Error creating meal",
            ctx: { meal: row, error },
          });
        }
      }
    }
    for (const row of rows) {
      inserted.add(row.id);
    }
  }
  for (const m of meals) {
    if (!(inserted.has(m.id) || failed.has(m.id))) {
      logError({
        message: "Error creating meal",
        ctx: { meal: m, reason: "meal_unique" },
      });
    }
  }
  return inserted;
}

function updateRows(mealId: string, logs: MealUpdateLog[]) {
  return logs.map((log) => ({ id: genId(), mealId, ...log }));
}

export type ApplyResult = {
  dates: Set<string>;
  mealIds: Set<string>;
  newMensen: number;
};

/**
 * Schreibt einen Sync-Plan in **einer** Transaktion: Entweder ist der ganze
 * Sync übernommen oder nichts (vorher blieb bei einem Fehler ein halber
 * Speiseplan stehen). Statt ein bis zwei Queries pro Ausgabe sind es wenige
 * Batch-Statements.
 */
export function applySyncPlan(plan: SyncPlan): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    const dates = new Set<string>();
    const mealIds = new Set<string>();
    const changed = (day: string, mealId: string) => {
      dates.add(day);
      mealIds.add(mealId);
    };

    if (plan.newMensen.length > 0) {
      await tx.insert(mensa).values(plan.newMensen);
    }

    const inserted = await insertMeals(tx, plan.newMeals);
    const skippedMeals = new Set(
      plan.newMeals.filter((m) => !inserted.has(m.id)).map((m) => m.id)
    );

    const logRows: ReturnType<typeof updateRows> = [];
    for (const change of await updateMeals(tx, plan.mealChanges)) {
      logRows.push(...updateRows(change.mealId, change.logs));
      for (const day of change.dates) {
        changed(day, change.mealId);
      }
    }

    // Neue Ausgaben. ON CONFLICT: existiert die Ausgabe schon (z. B. außerhalb
    // des abgefragten Zeitraums), bleibt sie unverändert und zählt nicht als
    // Änderung.
    const servings = plan.newServings.filter(
      (s) => !skippedMeals.has(s.mealId)
    );
    for (const batch of chunks(servings)) {
      const rows = await tx
        .insert(mensaMeal)
        .values(batch)
        .onConflictDoNothing()
        .returning({ mealId: mensaMeal.mealId, date: mensaMeal.date });
      for (const row of rows) {
        changed(toIsoDay(row.date), row.mealId);
      }
    }

    // Ausgaben, die die API nicht mehr liefert
    if (plan.removedServings.length > 0) {
      for (const batch of chunks(plan.removedServings)) {
        await tx.delete(mensaMeal).where(
          inArray(
            mensaMeal.id,
            batch.map((s) => s.id)
          )
        );
      }
      for (const s of plan.removedServings) {
        logRows.push({
          id: genId(),
          mealId: s.mealId,
          prev: toIsoDay(s.date),
          new: "Entfernt",
          key: "remove",
        });
        changed(toIsoDay(s.date), s.mealId);
      }
    }

    for (const batch of chunks(logRows)) {
      await tx.insert(mealUpdate).values(batch);
    }

    return { dates, mealIds, newMensen: plan.newMensen.length };
  });
}
