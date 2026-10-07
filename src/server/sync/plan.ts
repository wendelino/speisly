import { toIsoDay } from "@/lib/dates";
import type { meal } from "@/lib/db/schema/schema";
import { genId } from "@/lib/db/utils";
import type {
  MealData,
  MealRecord,
  MealUpdateLog,
  MensaMealRecord,
  MensaRecord,
} from "./types";

/**
 * Plant einen Sync vollständig im Speicher: Was muss angelegt, geändert und
 * entfernt werden? Keine DB-Zugriffe; `applySyncPlan` (./db.ts) schreibt den
 * Plan danach in einer Transaktion mit wenigen Batch-Statements.
 *
 * Die Regeln sind dieselben wie im bisherigen Sync (Gericht für Gericht):
 * - Gerichte mit Preis 0 werden übersprungen.
 * - Bestehende Gerichte (per `src_id`) werden aktualisiert, wenn sich Bild,
 *   Name, Untertitel oder Preise geändert haben, jeweils mit Änderungslog.
 * - Neue Ausgaben (Mensa + Gericht + Tag) werden angelegt, bestehende nicht
 *   verändert (Zutaten/Extras bleiben wie beim ersten Sync).
 * - Ausgaben im Zeitraum, die die API nicht mehr liefert, werden entfernt –
 *   aber nur mit Schutzregeln (siehe `guardRemovals`), denn mit einer Ausgabe
 *   verschwinden per Cascade auch ihre Bewertungen.
 */

/**
 * Notbremse: Würde ein Sync mehr als diesen Anteil der bestehenden Ausgaben
 * im Zeitraum entfernen (und mindestens `MASS_REMOVAL_MIN`), wird gar nichts
 * entfernt und Alarm geschlagen. Überschreiben: `/api/sync?force=1`.
 */
const MASS_REMOVAL_RATIO = 0.5;
export const MASS_REMOVAL_MIN = 20;

type KeptReason = "day-not-in-api" | "rated" | "mass-removal";

type ExistingMeal = MealRecord & { srcId: string };

type MealValues = Pick<
  typeof meal.$inferInsert,
  "name" | "subtitle" | "imgPath" | "priceStud" | "priceWork" | "priceGuest"
>;

export type NewMeal = MealValues & {
  id: string;
  srcId: string;
  dataSourceSlug: string;
};

export type MealChange = {
  mealId: string;
  /** vollständiger neuer Stand (für das Batch-Update) */
  values: MealValues;
  fields: Partial<MealValues>;
  logs: MealUpdateLog[];
  /** Tage dieses Syncs, an denen das Gericht angeboten wird */
  dates: string[];
};

type NewServing = {
  id: string;
  mensaId: string;
  mealId: string;
  date: Date;
  ingredients: string[];
  extras: string[];
};

export type SyncPlan = {
  newMensen: MensaRecord[];
  newMeals: NewMeal[];
  mealChanges: MealChange[];
  newServings: NewServing[];
  removedServings: MensaMealRecord[];
  /** fehlen in der API, werden aber zum Schutz nicht entfernt */
  keptServings: { serving: MensaMealRecord; reason: KeptReason }[];
  /** Notbremse gezogen: wie viele wären entfernt worden, von wie vielen */
  massRemoval: { wouldRemove: number; existing: number } | null;
  /** Gerichte mit Preis 0 (werden geloggt, nicht übernommen) */
  invalidMeals: MealData[];
};

function toCents(price: number): number {
  return Math.round(price * 100);
}

function valuesFrom(data: MealData): MealValues {
  return {
    name: data.name,
    subtitle: data.subtitle,
    imgPath: data.imgPath,
    priceStud: toCents(data.priceStud),
    priceWork: toCents(data.priceWork),
    priceGuest: toCents(data.priceGuest),
  };
}

/** Unterschiede zwischen DB-Stand und API-Daten (Felder + Logeinträge) */
function diffMeal(
  current: MealValues,
  next: MealValues
): { fields: Partial<MealValues>; logs: MealUpdateLog[] } {
  const fields: Partial<MealValues> = {};
  const logs: MealUpdateLog[] = [];

  if (current.imgPath !== next.imgPath) {
    logs.push({
      prev: current.imgPath ?? "",
      new: next.imgPath ?? "",
      key: "imgPath",
    });
    fields.imgPath = next.imgPath;
  }
  if (current.name !== next.name) {
    logs.push({ prev: current.name, new: next.name, key: "name" });
    fields.name = next.name;
  }
  if (current.subtitle !== next.subtitle) {
    logs.push({
      prev: current.subtitle ?? "",
      new: next.subtitle ?? "",
      key: "subtitle",
    });
    fields.subtitle = next.subtitle;
  }
  if (
    current.priceStud !== next.priceStud ||
    current.priceWork !== next.priceWork ||
    current.priceGuest !== next.priceGuest
  ) {
    logs.push({
      prev: `${current.priceStud} / ${current.priceWork} / ${current.priceGuest}`,
      new: `${next.priceStud} / ${next.priceWork} / ${next.priceGuest}`,
      key: "price",
    });
    fields.priceStud = next.priceStud;
    fields.priceWork = next.priceWork;
    fields.priceGuest = next.priceGuest;
  }
  return { fields, logs };
}

function servingKey(mealId: string, mensaId: string, date: Date): string {
  return `${mealId}|${mensaId}|${date.toISOString()}`;
}

/**
 * Entscheidet, welche fehlenden Ausgaben wirklich entfernt werden:
 * 1. nur an Tagen, für die die API überhaupt Einträge geliefert hat. Eine
 *    leere oder lückenhafte Antwort (Störung, Feiertag) löscht nichts.
 * 2. nie Ausgaben mit Bewertungen: Wer bewertet hat, hat das Gericht gegessen.
 * 3. Notbremse bei Massenlöschung (siehe `MASS_REMOVAL_RATIO`).
 */
function guardRemovals(
  missing: MensaMealRecord[],
  {
    apiDates,
    existingCount,
    allowMassRemoval = false,
  }: {
    apiDates: Set<string>;
    existingCount: number;
    allowMassRemoval?: boolean;
  }
): Pick<SyncPlan, "removedServings" | "keptServings" | "massRemoval"> {
  const kept: SyncPlan["keptServings"] = [];
  let candidates: MensaMealRecord[] = [];
  for (const serving of missing) {
    if (!apiDates.has(toIsoDay(serving.date))) {
      kept.push({ serving, reason: "day-not-in-api" });
    } else if (serving.rated) {
      kept.push({ serving, reason: "rated" });
    } else {
      candidates.push(serving);
    }
  }
  let massRemoval: SyncPlan["massRemoval"] = null;
  if (
    !allowMassRemoval &&
    candidates.length >= MASS_REMOVAL_MIN &&
    candidates.length > existingCount * MASS_REMOVAL_RATIO
  ) {
    massRemoval = { wouldRemove: candidates.length, existing: existingCount };
    kept.push(
      ...candidates.map((serving) => ({
        serving,
        reason: "mass-removal" as const,
      }))
    );
    candidates = [];
  }
  return { removedServings: candidates, keptServings: kept, massRemoval };
}

export function planSync({
  data,
  dataSourceSlug,
  mensen,
  existingMeals,
  existingServings,
  apiDates,
  allowMassRemoval = false,
}: {
  data: MealData[];
  dataSourceSlug: string;
  mensen: MensaRecord[];
  existingMeals: ExistingMeal[];
  existingServings: MensaMealRecord[];
  /** Tage mit API-Einträgen; Default: alle Tage aus `data` */
  apiDates?: Set<string>;
  allowMassRemoval?: boolean;
}): SyncPlan {
  const plan: SyncPlan = {
    newMensen: [],
    newMeals: [],
    mealChanges: [],
    newServings: [],
    removedServings: [],
    keptServings: [],
    massRemoval: null,
    invalidMeals: [],
  };

  const mensaBySlug = new Map(mensen.map((m) => [m.slug, m]));
  const mealBySrcId = new Map<string, { id: string; values: MealValues }>();
  for (const m of existingMeals) {
    if (!mealBySrcId.has(m.srcId)) {
      mealBySrcId.set(m.srcId, { id: m.id, values: m });
    }
  }
  // src_ids, deren Gerichtsdaten dieser Sync schon übernommen hat
  const handledSrcIds = new Set<string>();

  const unmatched = new Map(
    existingServings.map((s) => [servingKey(s.mealId, s.mensaId, s.date), s])
  );
  const seen = new Set<string>();

  for (const mealData of data) {
    const next = valuesFrom(mealData);
    if (next.priceStud === 0 || next.priceWork === 0 || next.priceGuest === 0) {
      plan.invalidMeals.push(mealData);
      continue;
    }

    let current = mealBySrcId.get(mealData.src_id);
    if (handledSrcIds.has(mealData.src_id) && current) {
      // Mehrere API-Gerichte mit derselben src_id (MEAL_SRC_ID_MAPPINGS):
      // Name/Preis/Bild kommen vom ersten, die weiteren liefern nur Ausgaben.
      // Vorher überschrieb jedes das vorige, und weil der Vergleich auf einem
      // veralteten Stand lief, wechselte der Name bei jedem Sync hin und her
      // (jeweils mit Änderungslog).
    } else if (current) {
      const { fields, logs } = diffMeal(current.values, next);
      if (logs.length > 0) {
        current.values = { ...current.values, ...fields };
        plan.mealChanges.push({
          mealId: current.id,
          values: current.values,
          fields,
          logs,
          dates: mealData.availability.map((a) => toIsoDay(new Date(a.date))),
        });
      }
    } else {
      const created: NewMeal = {
        id: genId(),
        srcId: mealData.src_id,
        dataSourceSlug,
        ...next,
      };
      plan.newMeals.push(created);
      current = { id: created.id, values: next };
      mealBySrcId.set(mealData.src_id, current);
    }
    handledSrcIds.add(mealData.src_id);

    for (const avail of mealData.availability) {
      let mensaRecord = mensaBySlug.get(avail.mensaSlug);
      if (!mensaRecord) {
        mensaRecord = {
          id: genId(),
          slug: avail.mensaSlug,
          name: avail.mensaName,
        };
        mensaBySlug.set(avail.mensaSlug, mensaRecord);
        plan.newMensen.push(mensaRecord);
      }
      const date = new Date(avail.date);
      const key = servingKey(current.id, mensaRecord.id, date);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (unmatched.delete(key)) {
        continue;
      }
      plan.newServings.push({
        id: genId(),
        mensaId: mensaRecord.id,
        mealId: current.id,
        date,
        ingredients: avail.ingredients,
        extras: avail.extras,
      });
    }
  }

  const knownDates =
    apiDates ??
    new Set(
      data.flatMap((m) => m.availability.map((a) => toIsoDay(new Date(a.date))))
    );
  Object.assign(
    plan,
    guardRemovals([...unmatched.values()], {
      apiDates: knownDates,
      existingCount: existingServings.length,
      allowMassRemoval,
    })
  );
  return plan;
}
