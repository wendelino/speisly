/**
 * /api/sync: Auth, Scopes und gezielte Invalidierung. Sync und Pre-Warm werden
 * als Fakes übergeben (ein echter Sync über heute…+7 würde mit der Stub-API
 * die Seed-Daten entfernen; der Sync selbst ist in
 * src/server/sync/sync.test.ts getestet).
 */
import { describe, expect, test } from "bun:test";
import type { APIContext } from "astro";
import { createSyncHandler } from "@/server/sync-endpoint";

const TOKEN = "test-token";
const syncCalls: unknown[] = [];
const imageCalls: unknown[] = [];
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
  handleSync: (date) => {
    syncCalls.push(date);
    return Promise.resolve({
      changedDates: ["2026-10-07"],
      changedMealIds: ["m1"],
    });
  },
  syncImages: (range) => {
    imageCalls.push(range);
    return imagesResult();
  },
  prewarm: () => Promise.resolve([]),
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
});
