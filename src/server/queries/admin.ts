import {
  and,
  avg,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { apiResponse } from "@/lib/db/schema/api-response";
import type { mealChangeField } from "@/lib/db/schema/enums";
import { errorLog } from "@/lib/db/schema/error-log";
import { feedback } from "@/lib/db/schema/feedback";
import {
  meal,
  mealChange,
  mealRating,
  mensa,
  mensaMeal,
  servingRemoval,
} from "@/lib/db/schema/schema";
import { syncRun } from "@/lib/db/schema/sync-run";
import { db } from "../db";
import {
  type Location,
  MEAL_SRC_ID_MAPPINGS,
  type MeineMensaFoodPlanItem,
  type MeineMensaResponse,
} from "../sync/types";
import { normalizeSrcId } from "../sync/utils";

/** Abfragen für den Admin-Bereich (src/pages/admin), nie gecacht */

export type MealChangeField = (typeof mealChangeField.enumValues)[number];
export type DoneFilter = "open" | "done" | "all";

const PAGE = 100;

/** Offene Fehler und offenes Feedback (Übersicht und Navigation) */
export async function openCounts() {
  const [[errors], [openFeedback]] = await Promise.all([
    db
      .select({ count: count() })
      .from(errorLog)
      .where(isNull(errorLog.resolvedAt)),
    db
      .select({ count: count() })
      .from(feedback)
      .where(eq(feedback.status, "open")),
  ]);
  return { openErrors: errors.count, openFeedback: openFeedback.count };
}

export async function adminOverview() {
  const [counts, latest] = await Promise.all([
    openCounts(),
    // letzter Lauf je Scope
    db
      .selectDistinctOn([syncRun.scope])
      .from(syncRun)
      .orderBy(syncRun.scope, desc(syncRun.startedAt)),
  ]);
  return { ...counts, latestRuns: latest };
}

export function listSyncRuns(limit = PAGE) {
  return db
    .select()
    .from(syncRun)
    .orderBy(desc(syncRun.startedAt))
    .limit(limit);
}

export async function getSyncRun(id: string) {
  const [run] = await db.select().from(syncRun).where(eq(syncRun.id, id));
  if (!run) {
    return null;
  }
  const [changes, removals, errors, responses] = await Promise.all([
    db
      .select({
        id: mealChange.id,
        mealId: mealChange.mealId,
        mealName: meal.name,
        field: mealChange.field,
        prev: mealChange.prev,
        next: mealChange.next,
      })
      .from(mealChange)
      .innerJoin(meal, eq(meal.id, mealChange.mealId))
      .where(eq(mealChange.syncRunId, id))
      .orderBy(meal.name),
    db
      .select({
        id: servingRemoval.id,
        mealId: servingRemoval.mealId,
        mealName: meal.name,
        mensaName: mensa.name,
        date: servingRemoval.date,
      })
      .from(servingRemoval)
      .innerJoin(meal, eq(meal.id, servingRemoval.mealId))
      .leftJoin(mensa, eq(mensa.id, servingRemoval.mensaId))
      .where(eq(servingRemoval.syncRunId, id))
      .orderBy(servingRemoval.date, meal.name),
    // Fehler, die zuletzt in diesem Lauf aufgetreten sind
    db
      .select()
      .from(errorLog)
      .where(eq(errorLog.lastSyncRunId, id))
      .orderBy(desc(errorLog.lastSeenAt)),
    // rohe API-Antworten, ohne Body (der kann mehrere MB groß sein)
    db
      .select({
        id: apiResponse.id,
        url: apiResponse.url,
        status: apiResponse.status,
        durationMs: apiResponse.durationMs,
        bytes: sql<number>`octet_length(${apiResponse.body})`,
        createdAt: apiResponse.createdAt,
      })
      .from(apiResponse)
      .where(eq(apiResponse.syncRunId, id))
      .orderBy(apiResponse.createdAt),
  ]);
  return { run, changes, removals, errors, responses };
}

/** Eine rohe API-Antwort samt Body (src/pages/admin/api-response/[id].astro) */
export async function getApiResponse(id: string) {
  const [row] = await db
    .select()
    .from(apiResponse)
    .where(eq(apiResponse.id, id));
  return row ?? null;
}

/** Ein Eintrag aus `/food_plans` mit dem Namen der Mensa (`/locations`) */
export type OriginalItem = MeineMensaFoodPlanItem & { locationName?: string };

/**
 * Die Einträge eines Gerichts in den rohen API-Antworten eines Laufs
 * (Zuordnung wie im Sync über `normalizeSrcId`). `null`: keine Antwort
 * gespeichert, z. B. bei Läufen vor `api_response`.
 */
async function originalItems(
  syncRunId: string,
  srcId: string
): Promise<OriginalItem[] | null> {
  const rows = await db
    .select({ url: apiResponse.url, body: apiResponse.body })
    .from(apiResponse)
    .where(
      and(eq(apiResponse.syncRunId, syncRunId), eq(apiResponse.status, 200))
    );
  const plans = rows.filter((r) => r.url.includes("/food_plans?"));
  if (plans.length === 0) {
    return null;
  }
  const names = new Map<number, string>();
  for (const row of rows.filter((r) => r.url.endsWith("/locations"))) {
    for (const location of JSON.parse(row.body) as Location[]) {
      names.set(location.id, location.name);
    }
  }
  return plans
    .flatMap((row) => (JSON.parse(row.body) as MeineMensaResponse).data)
    .filter(
      (item) => normalizeSrcId(item.food.id, MEAL_SRC_ID_MAPPINGS) === srcId
    )
    .map((item) => ({ ...item, locationName: names.get(item.location_id) }))
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.location_id - b.location_id
    );
}

/**
 * Eine Änderung oder entfernte Ausgabe (gleicher ID-Raum, `genId`) mit
 * Gericht, Sync-Lauf und den Originaldaten aus der API
 * (src/pages/admin/change/[id].astro)
 */
export async function getChangeDetail(id: string) {
  const [change] = await db
    .select({
      id: mealChange.id,
      field: mealChange.field,
      prev: mealChange.prev,
      next: mealChange.next,
      createdAt: mealChange.createdAt,
      syncRunId: mealChange.syncRunId,
      mealId: meal.id,
      mealName: meal.name,
      srcId: meal.srcId,
      mensaMealId: mealChange.mensaMealId,
      servingDate: mensaMeal.date,
      mensaName: mensa.name,
    })
    .from(mealChange)
    .innerJoin(meal, eq(meal.id, mealChange.mealId))
    .leftJoin(mensaMeal, eq(mensaMeal.id, mealChange.mensaMealId))
    .leftJoin(mensa, eq(mensa.id, mensaMeal.mensaId))
    .where(eq(mealChange.id, id));
  const [removal] = change
    ? []
    : await db
        .select({
          id: servingRemoval.id,
          date: servingRemoval.date,
          createdAt: servingRemoval.createdAt,
          syncRunId: servingRemoval.syncRunId,
          mealId: meal.id,
          mealName: meal.name,
          srcId: meal.srcId,
          mensaName: mensa.name,
        })
        .from(servingRemoval)
        .innerJoin(meal, eq(meal.id, servingRemoval.mealId))
        .leftJoin(mensa, eq(mensa.id, servingRemoval.mensaId))
        .where(eq(servingRemoval.id, id));
  const entry = change ?? removal;
  if (!entry) {
    return null;
  }
  const [run, original] = entry.syncRunId
    ? await Promise.all([
        getSyncRun(entry.syncRunId),
        originalItems(entry.syncRunId, entry.srcId),
      ])
    : [null, null];
  return {
    change: change ?? null,
    removal: removal ?? null,
    run: run && { ...run.run, responses: run.responses },
    original,
  };
}

/**
 * Ein Gericht mit allem, was der Admin-Bereich dazu weiß: Änderungsverlauf,
 * Ausgaben (vorhandene und vom Sync entfernte), Bewertungen und Fehler, deren
 * letzter Kontext das Gericht nennt (src/lib/admin-format.ts `mealIdOf`)
 */
export async function getAdminMeal(id: string) {
  const [row] = await db.select().from(meal).where(eq(meal.id, id));
  if (!row) {
    return null;
  }
  const [changes, servings, removals, [ratings], errors] = await Promise.all([
    db
      .select({
        id: mealChange.id,
        field: mealChange.field,
        prev: mealChange.prev,
        next: mealChange.next,
        syncRunId: mealChange.syncRunId,
        createdAt: mealChange.createdAt,
        // Zutaten/Extras: zu welcher Ausgabe
        mensaMealId: mealChange.mensaMealId,
        servingDate: mensaMeal.date,
        mensaName: mensa.name,
      })
      .from(mealChange)
      .leftJoin(mensaMeal, eq(mensaMeal.id, mealChange.mensaMealId))
      .leftJoin(mensa, eq(mensa.id, mensaMeal.mensaId))
      .where(eq(mealChange.mealId, id))
      .orderBy(desc(mealChange.createdAt)),
    db
      .select({
        id: mensaMeal.id,
        date: mensaMeal.date,
        mensaName: mensa.name,
      })
      .from(mensaMeal)
      .innerJoin(mensa, eq(mensa.id, mensaMeal.mensaId))
      .where(eq(mensaMeal.mealId, id))
      .orderBy(desc(mensaMeal.date))
      .limit(PAGE),
    db
      .select({
        id: servingRemoval.id,
        date: servingRemoval.date,
        mensaName: mensa.name,
        syncRunId: servingRemoval.syncRunId,
      })
      .from(servingRemoval)
      .leftJoin(mensa, eq(mensa.id, servingRemoval.mensaId))
      .where(eq(servingRemoval.mealId, id))
      .orderBy(desc(servingRemoval.date)),
    db
      .select({ count: count(), avg: avg(mealRating.value) })
      .from(mealRating)
      .where(eq(mealRating.mealId, id)),
    db
      .select()
      .from(errorLog)
      .where(
        or(
          sql`${errorLog.lastCtx}->>'mealId' = ${id}`,
          sql`${errorLog.lastCtx}->'change'->>'mealId' = ${id}`
        )
      )
      .orderBy(desc(errorLog.lastSeenAt)),
  ]);
  return {
    meal: row,
    changes,
    servings,
    removals,
    ratings: {
      count: ratings?.count ?? 0,
      avg: ratings?.avg ? Number(ratings.avg) : null,
    },
    errors,
  };
}

function doneCondition<T extends Parameters<typeof isNull>[0]>(
  column: T,
  filter: DoneFilter
) {
  if (filter === "open") {
    return isNull(column);
  }
  return filter === "done" ? isNotNull(column) : undefined;
}

export function listErrors(filter: DoneFilter = "open", limit = PAGE) {
  return db
    .select()
    .from(errorLog)
    .where(doneCondition(errorLog.resolvedAt, filter))
    .orderBy(desc(errorLog.lastSeenAt))
    .limit(limit);
}

export function listMealChanges(
  field: MealChangeField | null = null,
  limit = PAGE
) {
  return db
    .select({
      id: mealChange.id,
      mealId: mealChange.mealId,
      mealName: meal.name,
      field: mealChange.field,
      prev: mealChange.prev,
      next: mealChange.next,
      syncRunId: mealChange.syncRunId,
      createdAt: mealChange.createdAt,
    })
    .from(mealChange)
    .innerJoin(meal, eq(meal.id, mealChange.mealId))
    .where(field ? eq(mealChange.field, field) : undefined)
    .orderBy(desc(mealChange.createdAt))
    .limit(limit);
}

/** Entfernte Ausgaben, neueste zuerst (src/pages/admin/changes.astro) */
export function listServingRemovals(limit = PAGE) {
  return db
    .select({
      id: servingRemoval.id,
      mealId: servingRemoval.mealId,
      mealName: meal.name,
      mensaName: mensa.name,
      date: servingRemoval.date,
      syncRunId: servingRemoval.syncRunId,
      createdAt: servingRemoval.createdAt,
    })
    .from(servingRemoval)
    .innerJoin(meal, eq(meal.id, servingRemoval.mealId))
    .leftJoin(mensa, eq(mensa.id, servingRemoval.mensaId))
    .orderBy(desc(servingRemoval.createdAt))
    .limit(limit);
}

export function listFeedback(filter: DoneFilter = "open", limit = PAGE) {
  return db
    .select()
    .from(feedback)
    .where(filter === "all" ? undefined : eq(feedback.status, filter))
    .orderBy(desc(feedback.createdAt))
    .limit(limit);
}

/** Fehler erledigt bzw. wieder offen */
export async function setErrorResolved(id: string, resolved: boolean) {
  const rows = await db
    .update(errorLog)
    .set({ resolvedAt: resolved ? sql`now()` : null })
    .where(eq(errorLog.id, id))
    .returning({ id: errorLog.id });
  return rows.length > 0;
}

export async function setFeedbackDone(id: string, done: boolean) {
  const rows = await db
    .update(feedback)
    .set({
      status: done ? "done" : "open",
      handledAt: done ? sql`now()` : null,
    })
    .where(and(eq(feedback.id, id)))
    .returning({ id: feedback.id });
  return rows.length > 0;
}

/**
 * Sucht eine ID in allen Tabellen des Admin-Bereichs (Suche im Header,
 * src/pages/admin/search.astro). Gerichte auch per `src_id`, Mensen per Slug,
 * Fehler auch, wenn ihr letzter Kontext die ID nennt (z. B. `servings` aus
 * dem Sync).
 */
export async function searchById(query: string) {
  const id = query.trim();
  const ratingCount = sql<number>`(select count(*)::int from ${mealRating} where ${mealRating.mensaMealId} = ${mensaMeal.id})`;
  const [
    meals,
    servings,
    removals,
    ratings,
    mensen,
    runs,
    changes,
    feedbacks,
    errors,
  ] = await Promise.all([
    db
      .select({
        id: meal.id,
        name: meal.name,
        srcId: meal.srcId,
        imgPath: meal.imgPath,
      })
      .from(meal)
      .where(or(eq(meal.id, id), eq(meal.srcId, id))),
    db
      .select({
        id: mensaMeal.id,
        date: mensaMeal.date,
        mealId: mensaMeal.mealId,
        mealName: meal.name,
        mensaName: mensa.name,
        ratings: ratingCount,
      })
      .from(mensaMeal)
      .innerJoin(meal, eq(meal.id, mensaMeal.mealId))
      .innerJoin(mensa, eq(mensa.id, mensaMeal.mensaId))
      .where(eq(mensaMeal.id, id)),
    db
      .select({
        id: servingRemoval.id,
        date: servingRemoval.date,
        mealId: servingRemoval.mealId,
        mealName: meal.name,
        mensaName: mensa.name,
        syncRunId: servingRemoval.syncRunId,
      })
      .from(servingRemoval)
      .innerJoin(meal, eq(meal.id, servingRemoval.mealId))
      .leftJoin(mensa, eq(mensa.id, servingRemoval.mensaId))
      .where(eq(servingRemoval.id, id)),
    db
      .select({
        id: mealRating.id,
        mealId: mealRating.mealId,
        mealName: meal.name,
        mensaMealId: mealRating.mensaMealId,
        value: mealRating.value,
        comment: mealRating.comment,
        createdAt: mealRating.createdAt,
      })
      .from(mealRating)
      .innerJoin(meal, eq(meal.id, mealRating.mealId))
      .where(eq(mealRating.id, id)),
    db
      .select({ id: mensa.id, name: mensa.name, slug: mensa.slug })
      .from(mensa)
      .where(or(eq(mensa.id, id), eq(mensa.slug, id))),
    db.select().from(syncRun).where(eq(syncRun.id, id)),
    db
      .select({
        id: mealChange.id,
        mealId: mealChange.mealId,
        mealName: meal.name,
        field: mealChange.field,
        createdAt: mealChange.createdAt,
      })
      .from(mealChange)
      .innerJoin(meal, eq(meal.id, mealChange.mealId))
      .where(eq(mealChange.id, id)),
    db.select().from(feedback).where(eq(feedback.id, id)),
    db
      .select()
      .from(errorLog)
      .where(
        or(
          eq(errorLog.id, id),
          eq(errorLog.fingerprint, id),
          // kurze Suchbegriffe träfen fast jeden Kontext
          id.length >= 8
            ? sql`position(${id} in ${errorLog.lastCtx}::text) > 0`
            : undefined
        )
      )
      .orderBy(desc(errorLog.lastSeenAt))
      .limit(PAGE),
  ]);
  return {
    meals,
    servings,
    removals,
    ratings,
    mensen,
    runs,
    changes,
    feedbacks,
    errors,
  };
}
