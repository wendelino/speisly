/**
 * /api/sync: Auth, Scopes und gezielte Invalidierung. Sync und Pre-Warm werden
 * als Fakes übergeben (ein echter Sync über heute…+7 würde mit der Stub-API
 * die Seed-Daten entfernen; der Sync selbst ist in
 * src/server/sync/sync.test.ts getestet). Protokoll und Zusammenfassung
 * ebenfalls als Fakes; sie sind in src/server/log.test.ts und
 * src/server/sync-summary.test.ts getestet.
 */
import { describe, expect, test } from "bun:test";
import type { APIContext } from "astro";
import type { SyncStats } from "@/server/sync";
import { createSyncHandler } from "@/server/sync-endpoint";
import type { SyncCounts, SyncStatus } from "@/server/sync-runs";
import type { RunSummary } from "@/server/sync-summary";

const TOKEN = "test-token";
const syncCalls: unknown[] = [];
const syncOptions: unknown[] = [];
const imageCalls: unknown[] = [];
const finished: {
  status: SyncStatus;
  counts: SyncCounts;
  error?: string | null;
}[] = [];
const reports: RunSummary[] = [];
const STATS: SyncStats = {
  newMeals: 1,
  changedMeals: 0,
  newServings: 2,
  changedServings: 0,
  removedServings: 0,
  keptServings: 0,
  massRemoval: false,
};
let syncResult: () => Promise<{
  changedDates: string[];
  changedMealIds: string[];
  stats: SyncStats;
}> = () =>
  Promise.resolve({
    changedDates: ["2026-10-07"],
    changedMealIds: ["m1"],
    stats: STATS,
  });
let imagesResult: () => Promise<{
  changedDates: string[];
  changedMealIds: string[];
  created: number;
  failed: number;
}> = () =>
  Promise.resolve({
    changedDates: [],
    changedMealIds: [],
    created: 0,
    failed: 0,
  });
const POST = createSyncHandler({
  token: TOKEN,
  handleSync: (date, options) => {
    syncCalls.push(date);
    syncOptions.push(options);
    return syncResult();
  },
  syncImages: (range) => {
    imageCalls.push(range);
    return imagesResult();
  },
  prewarm: () => Promise.resolve([]),
  runs: {
    start: () => Promise.resolve("run-1"),
    finish: (_id, result) => {
      finished.push(result);
      return Promise.resolve({ durationMs: 1234 });
    },
  },
  report: (summary) => {
    reports.push(summary);
    return Promise.resolve();
  },
});

async function call(scope: string, token = TOKEN) {
  const invalidated: string[][] = [];
  const url = new URL(`http://localhost:4321/api/sync?scope=${scope}`);
  const ctx = {
    request: new Request(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    }),
    url,
    cache: {
      enabled: true,
      invalidate: ({ tags }: { tags: string[] }) => {
        invalidated.push(tags);
        return Promise.resolve();
      },
    },
  } as unknown as APIContext;
  const res = await POST(ctx);
  return { res, body: await res.json(), invalidated };
}

describe("POST /api/sync", () => {
  test("rejects wrong tokens", async () => {
    const { res, invalidated } = await call("week", "falsch");
    expect(res.status).toBe(401);
    expect(invalidated).toEqual([]);
  });

  test("rejects unknown scopes", async () => {
    expect((await call("alles")).res.status).toBe(400);
  });

  test("week: syncs 8 days and invalidates only what changed", async () => {
    syncCalls.length = 0;
    const { res, body, invalidated } = await call("week");
    expect(res.status).toBe(200);
    expect(syncCalls).toHaveLength(1);
    expect(syncCalls[0]).toMatchObject({
      from: expect.any(String),
      to: expect.any(String),
    });
    expect(invalidated).toEqual([
      ["day:2026-10-07", "meal:m1", "meal-stats:m1"],
    ]);
    expect(body.changedDates).toEqual(["2026-10-07"]);
  });

  test("pages with new image variants are invalidated too", async () => {
    imagesResult = () =>
      Promise.resolve({
        changedDates: ["2026-10-07", "2026-10-08"],
        changedMealIds: ["m2"],
        created: 1,
        failed: 0,
      });
    imageCalls.length = 0;
    const { body, invalidated } = await call("today");
    expect(imageCalls).toHaveLength(1);
    expect(imageCalls[0]).toMatchObject({ from: expect.any(String) });
    expect(invalidated).toEqual([
      [
        "day:2026-10-07",
        "day:2026-10-08",
        "meal:m1",
        "meal-stats:m1",
        "meal:m2",
        "meal-stats:m2",
      ],
    ]);
    expect(body.images).toEqual({ created: 1, failed: 0 });
  });

  test("failing image sync does not fail the sync", async () => {
    imagesResult = () => Promise.reject(new Error("sharp kaputt"));
    const { res, invalidated } = await call("week");
    expect(res.status).toBe(200);
    expect(invalidated).toEqual([
      ["day:2026-10-07", "meal:m1", "meal-stats:m1"],
    ]);
  });

  test("midnight: no sync, only the home page", async () => {
    syncCalls.length = 0;
    imageCalls.length = 0;
    const { body, invalidated } = await call("midnight");
    expect(syncCalls).toHaveLength(0);
    expect(imageCalls).toHaveLength(0);
    expect(invalidated).toEqual([["home"]]);
    expect(body.invalidatedTags).toEqual(["home"]);
  });

  test("warm: no sync, no invalidation, only prewarm", async () => {
    syncCalls.length = 0;
    imageCalls.length = 0;
    const { res, body, invalidated } = await call("warm");
    expect(res.status).toBe(200);
    expect(syncCalls).toHaveLength(0);
    expect(imageCalls).toHaveLength(0);
    expect(invalidated).toEqual([]);
    expect(body.invalidatedTags).toEqual([]);
  });

  test("force=1 lifts the mass-removal brake", async () => {
    syncOptions.length = 0;
    await call("today");
    await call("today&force=1");
    expect(syncOptions).toEqual([
      { allowMassRemoval: false },
      { allowMassRemoval: true },
    ]);
  });

  test("every run is recorded and reported with its counts", async () => {
    finished.length = 0;
    reports.length = 0;
    imagesResult = () =>
      Promise.resolve({
        changedDates: [],
        changedMealIds: [],
        created: 3,
        failed: 1,
      });
    const { body } = await call("week");
    expect(body).toMatchObject({ runId: "run-1", status: "success" });
    expect(finished).toEqual([
      {
        status: "success",
        counts: { ...STATS, imagesCreated: 3, imagesFailed: 1 },
        error: null,
      },
    ]);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      scope: "week",
      status: "success",
      durationMs: 1234,
      errors: [],
    });
  });

  test("failing images or the mass-removal brake make a run partial", async () => {
    finished.length = 0;
    imagesResult = () => Promise.reject(new Error("sharp kaputt"));
    await call("today");
    imagesResult = () =>
      Promise.resolve({
        changedDates: [],
        changedMealIds: [],
        created: 0,
        failed: 0,
      });
    syncResult = () =>
      Promise.resolve({
        changedDates: [],
        changedMealIds: [],
        stats: { ...STATS, massRemoval: true },
      });
    await call("today");
    expect(finished.map((f) => f.status)).toEqual(["partial", "partial"]);
  });

  test("a failing sync is recorded as failed and answers 500", async () => {
    finished.length = 0;
    reports.length = 0;
    syncResult = () => Promise.reject(new Error("API down"));
    const { res, body, invalidated } = await call("week");
    expect(res.status).toBe(500);
    expect(body.runId).toBe("run-1");
    expect(invalidated).toEqual([]);
    expect(finished).toEqual([
      { status: "failed", counts: expect.any(Object), error: "API down" },
    ]);
    expect(reports[0].status).toBe("failed");
    expect(reports[0].errors.map((e) => e.message)).toEqual([
      "Error syncing data",
    ]);
  });
});
