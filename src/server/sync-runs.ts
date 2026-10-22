import { eq, sql } from "drizzle-orm";
import type { syncScope, syncStatus } from "@/lib/db/schema/enums";
import { syncRun } from "@/lib/db/schema/sync-run";
import { genId } from "@/lib/db/utils";
import { db } from "./db";

export type SyncScope = (typeof syncScope.enumValues)[number];
export type SyncStatus = (typeof syncStatus.enumValues)[number];

/** Zähler eines Laufs (Spalten von `sync_run`) */
export type SyncCounts = {
  newMeals: number;
  changedMeals: number;
  newServings: number;
  changedServings: number;
  removedServings: number;
  keptServings: number;
  imagesCreated: number;
  imagesFailed: number;
  massRemoval: boolean;
};

export const EMPTY_COUNTS: SyncCounts = {
  newMeals: 0,
  changedMeals: 0,
  newServings: 0,
  changedServings: 0,
  removedServings: 0,
  keptServings: 0,
  imagesCreated: 0,
  imagesFailed: 0,
  massRemoval: false,
};

export async function startSyncRun(
  scope: SyncScope,
  range: { from: string; to: string } | null
): Promise<string> {
  const id = genId();
  await db.insert(syncRun).values({
    id,
    scope,
    rangeFrom: range?.from ?? null,
    rangeTo: range?.to ?? null,
  });
  return id;
}

export async function finishSyncRun(
  id: string,
  {
    status,
    counts,
    error = null,
  }: { status: SyncStatus; counts: SyncCounts; error?: string | null }
): Promise<{ durationMs: number }> {
  const [row] = await db
    .update(syncRun)
    .set({
      ...counts,
      status,
      error,
      finishedAt: sql`now()`,
      durationMs: sql`(extract(epoch from now() - ${syncRun.startedAt}) * 1000)::integer`,
    })
    .where(eq(syncRun.id, id))
    .returning({ durationMs: syncRun.durationMs });
  return { durationMs: row?.durationMs ?? 0 };
}
