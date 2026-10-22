import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { errorLog } from "@/lib/db/schema/error-log";
import { syncRun } from "@/lib/db/schema/sync-run";
import { db } from "./db";
import { errorFingerprint, flushErrorLog, logError, shouldNotify } from "./log";
import {
  collectRunErrors,
  currentSyncRun,
  runWithSyncRun,
} from "./sync-run-context";
import { startSyncRun } from "./sync-runs";

describe("shouldNotify", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  const known = { inserted: false, wasResolved: false };

  test("new, reopened or never reported errors", () => {
    expect(
      shouldNotify({ ...known, inserted: true, notifiedAt: now }, now)
    ).toBe(true);
    expect(
      shouldNotify({ ...known, wasResolved: true, notifiedAt: now }, now)
    ).toBe(true);
    expect(shouldNotify({ ...known, notifiedAt: null }, now)).toBe(true);
  });

  test("known errors at most once a day", () => {
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
    expect(shouldNotify({ ...known, notifiedAt: hoursAgo(2) }, now)).toBe(
      false
    );
    expect(shouldNotify({ ...known, notifiedAt: hoursAgo(24) }, now)).toBe(
      true
    );
  });
});

describe.skipIf(!process.env.DATABASE_URL)("logError (integration)", () => {
  const message = `Testfehler ${crypto.randomUUID()}`;
  const fingerprint = errorFingerprint("cache", message);
  const row = async () =>
    (
      await db
        .select()
        .from(errorLog)
        .where(eq(errorLog.fingerprint, fingerprint))
    )[0];

  afterAll(async () => {
    await db.delete(errorLog).where(eq(errorLog.fingerprint, fingerprint));
  });

  test("groups repeated errors into one row", async () => {
    logError({ message, ctx: { attempt: 1 }, source: "cache" });
    await flushErrorLog();
    const first = await row();
    expect(first).toMatchObject({ count: 1, source: "cache", level: "error" });
    // neu → gemeldet (Telegram ist im Test nicht konfiguriert)
    expect(first.notifiedAt).not.toBeNull();

    logError({
      message,
      ctx: { attempt: 2, error: new Error("kaputt") },
      source: "cache",
    });
    await flushErrorLog();
    const second = await row();
    expect(second.count).toBe(2);
    expect(second.lastCtx).toMatchObject({
      attempt: 2,
      error: { name: "Error", message: "kaputt" },
    });
    expect(second.firstSeenAt).toEqual(first.firstSeenAt);
    // innerhalb eines Tages nicht erneut gemeldet
    expect(second.notifiedAt).toEqual(first.notifiedAt);
  });

  test("a resolved error is reopened when it occurs again", async () => {
    await db
      .update(errorLog)
      .set({ resolvedAt: new Date() })
      .where(eq(errorLog.fingerprint, fingerprint));
    logError({ message, ctx: null, source: "cache" });
    await flushErrorLog();
    const reopened = await row();
    expect(reopened.resolvedAt).toBeNull();
    expect(reopened.count).toBe(3);
  });

  test("inside a sync run errors are collected instead of reported", async () => {
    const before = (await row()).notifiedAt;
    await db
      .update(errorLog)
      .set({ resolvedAt: new Date() })
      .where(eq(errorLog.fingerprint, fingerprint));
    const runId = await startSyncRun("today", null);
    const errors = await runWithSyncRun(runId, async () => {
      logError({ message, ctx: null, source: "cache" });
      logError({ message, ctx: null, source: "cache" });
      const run = currentSyncRun();
      return run ? await collectRunErrors(run) : [];
    });
    expect(errors).toEqual([
      {
        fingerprint,
        source: "cache",
        message,
        level: "error",
        occurrences: 2,
        noteworthy: true,
      },
    ]);
    // gemeldet wird erst mit der Zusammenfassung
    const after = await row();
    expect(after.notifiedAt).toEqual(before);
    expect(after.lastSyncRunId).toBe(runId);
    await db.delete(syncRun).where(eq(syncRun.id, runId));
  });
});
