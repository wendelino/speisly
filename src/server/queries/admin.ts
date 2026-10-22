import { and, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { mealChangeField } from "@/lib/db/schema/enums";
import { errorLog } from "@/lib/db/schema/error-log";
import { feedback } from "@/lib/db/schema/feedback";
import {
  meal,
  mealChange,
  mensa,
  servingRemoval,
} from "@/lib/db/schema/schema";
import { syncRun } from "@/lib/db/schema/sync-run";
import { db } from "../db";

/** Abfragen für den Admin-Bereich (src/pages/admin), nie gecacht */

export type MealChangeField = (typeof mealChangeField.enumValues)[number];
export type DoneFilter = "open" | "done" | "all";

const PAGE = 100;

export async function adminOverview() {
  const [[errors], [openFeedback], latest] = await Promise.all([
    db
      .select({ count: count() })
      .from(errorLog)
      .where(isNull(errorLog.resolvedAt)),
    db
      .select({ count: count() })
      .from(feedback)
      .where(eq(feedback.status, "open")),
    // letzter Lauf je Scope
    db
      .selectDistinctOn([syncRun.scope])
      .from(syncRun)
      .orderBy(syncRun.scope, desc(syncRun.startedAt)),
  ]);
  return {
    openErrors: errors.count,
    openFeedback: openFeedback.count,
    latestRuns: latest,
  };
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
  const [changes, removals, errors] = await Promise.all([
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
  ]);
  return { run, changes, removals, errors };
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
