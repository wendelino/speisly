import { afterAll, describe, expect, test } from "bun:test";
import type { AstroCookies } from "astro";
import { eq, sql } from "drizzle-orm";
import { user } from "@/lib/db/schema/schema";
import { moderateByToken } from "./comment-notify";
import { hasConsent } from "./consent";
import { db } from "./db";
import { signModerationToken } from "./moderation-token";
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
        sql`select id, meal_id, mensa_id, date from mensa_meal order by id limit 1`
      )
    ).rows[0] as { id: string; meal_id: string; mensa_id: string; date: Date };
    mealId = serving.meal_id;
    mensaMealId = serving.id;
    const rated = { mensaId: serving.mensa_id, date: new Date(serving.date) };
    const rate = (input: Parameters<typeof upsertRating>[1]) =>
      upsertRating(userId, input, rated).then((r) => r.result);
    await db
      .insert(user)
      .values({ id: userId, ipHash: "test" })
      .onConflictDoNothing();

    expect(await rate({ mealId, mensaMealId, value: 3 })).toBe("created");
    expect(
      await rate({
        mealId,
        mensaMealId,
        value: 5,
        valueTaste: 4,
        comment: "gut",
      })
    ).toBe("updated");

    // unauffälliger Kommentar: sofort öffentlich (im Admin noch ungeprüft)
    const mine = await getUserRating(userId, mealId);
    expect(mine).toMatchObject({
      value: 5,
      value_taste: 4,
      comment: "gut",
      commentStatus: "approved",
    });

    // gleicher Kommentar behält seinen Status, ohne neue Meldung
    const kept = await upsertRating(
      userId,
      { mealId, mensaMealId, value: 4, comment: "gut" },
      rated
    );
    expect(kept.heldComment).toBeNull();

    // Treffer im Wortfilter: zurückgehalten, Admins werden benachrichtigt
    const flagged = "Der Koch ist ein Vollidiot";
    const held = await upsertRating(
      userId,
      { mealId, mensaMealId, value: 1, comment: flagged },
      rated
    );
    expect(held.heldComment).toEqual({
      comment: flagged,
      words: ["vollidiot"],
    });
    expect(await getUserRating(userId, mealId)).toMatchObject({
      commentStatus: "pending",
    });

    // Freigabe aus der Benachrichtigung gilt nur für genau diesen Text
    const cache = { enabled: false } as Parameters<typeof moderateByToken>[0];
    const stale = await signModerationToken(held.ratingId, "gut", "approved");
    expect(await moderateByToken(cache, stale)).toEqual({
      ok: false,
      reason: "changed",
    });
    expect(await moderateByToken(cache, "kaputt")).toEqual({
      ok: false,
      reason: "invalid",
    });
    const reject = await signModerationToken(
      held.ratingId,
      flagged,
      "rejected"
    );
    expect(await moderateByToken(cache, reject)).toEqual({
      ok: true,
      action: "rejected",
    });
    expect(await getUserRating(userId, mealId)).toMatchObject({
      commentStatus: "rejected",
    });

    // geänderter, unauffälliger Text ist wieder öffentlich
    const fixed = await upsertRating(
      userId,
      { mealId, mensaMealId, value: 2, comment: "Leider kalt" },
      rated
    );
    expect(fixed.heldComment).toBeNull();
    expect(await getUserRating(userId, mealId)).toMatchObject({
      commentStatus: "approved",
    });
    await rate({
      mealId,
      mensaMealId,
      value: 4,
      comment: "  ",
    });
    expect(await getUserRating(userId, mealId)).toMatchObject({
      comment: null,
      commentStatus: null,
    });

    expect(await deleteUserRating(userId, mealId)).toBe(true);
    expect(await getUserRating(userId, mealId)).toBeNull();
    expect(await deleteUserRating(userId, mealId)).toBe(false);
  });
});
