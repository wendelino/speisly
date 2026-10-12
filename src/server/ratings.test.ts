import { afterAll, describe, expect, test } from "bun:test";
import type { AstroCookies } from "astro";
import { eq, sql } from "drizzle-orm";
import { user } from "@/lib/db/schema/schema";
import { hasConsent } from "./consent";
import { db } from "./db";
import { deleteUserRating, getUserRating, upsertRating } from "./ratings";

const cookies = (value?: string) =>
  ({
    get: (name: string) =>
      name === "speisly-cookie-consent" && value !== undefined
        ? { value }
        : undefined,
  }) as unknown as AstroCookies;

describe("hasConsent", () => {
  const json = (accepted: boolean) =>
    JSON.stringify({ accepted, timestamp: "2026-10-06T10:00:00.000Z" });

  test("reads raw and URL-encoded cookie values", () => {
    expect(hasConsent(cookies(json(true)))).toBe(true);
    expect(hasConsent(cookies(encodeURIComponent(json(true))))).toBe(true);
    expect(hasConsent(cookies(json(false)))).toBe(false);
  });

  test("returns null for missing or malformed cookies", () => {
    expect(hasConsent(cookies())).toBeNull();
    expect(hasConsent(cookies("kaputt"))).toBeNull();
    expect(hasConsent(cookies(JSON.stringify({ accepted: "ja" })))).toBeNull();
  });
});

describe.skipIf(!process.env.DATABASE_URL)("ratings (integration)", () => {
  const userId = "test_user_ratings_00000000000000";
  let mealId: string;
  let mensaMealId: string;

  afterAll(async () => {
    await db.delete(user).where(eq(user.id, userId));
  });

  test("create, update, read and delete", async () => {
    const serving = (
      await db.execute(
        sql`select id, meal_id from mensa_meal order by id limit 1`
      )
    ).rows[0] as { id: string; meal_id: string };
    mealId = serving.meal_id;
    mensaMealId = serving.id;
    await db
      .insert(user)
      .values({ id: userId, ipHash: "test", cookieHash: userId })
      .onConflictDoNothing();

    expect(await upsertRating(userId, { mealId, mensaMealId, value: 3 })).toBe(
      "created"
    );
    expect(
      await upsertRating(userId, {
        mealId,
        mensaMealId,
        value: 5,
        valueTaste: 4,
        comment: "gut",
      })
    ).toBe("updated");

    const mine = await getUserRating(userId, mealId);
    expect(mine).toMatchObject({ value: 5, value_taste: 4, comment: "gut" });

    expect(await deleteUserRating(userId, mealId)).toBe(true);
    expect(await getUserRating(userId, mealId)).toBeNull();
    expect(await deleteUserRating(userId, mealId)).toBe(false);
  });
});
