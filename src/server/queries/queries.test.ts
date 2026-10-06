/**
 * Integrationstests gegen eine mit `scripts/dev/seed.ts` befüllte Datenbank.
 * Ohne DATABASE_URL werden sie übersprungen.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { findMeal } from "./meal";
import { getMealsForDate } from "./meals";
import { getVisibleMensen, listMensen } from "./mensen";
import { getMealRatingStats } from "./ratings";
import { getMealServingStats } from "./serving-stats";

const hasDb = Boolean(process.env.DATABASE_URL);

async function one<T>(query: ReturnType<typeof sql>): Promise<T> {
  const result = await db.execute(query);
  return result.rows[0] as T;
}

describe.skipIf(!hasDb)("queries (integration)", () => {
  let servedDay: string;
  let weekendDay: string | null;
  let mealId: string;
  let olderServingId: string;

  beforeAll(async () => {
    ({ d: servedDay } = await one<{ d: string }>(
      sql`select to_char(max(date), 'YYYY-MM-DD') as d from mensa_meal where date <= now()`
    ));
    ({ d: weekendDay } = await one<{ d: string | null }>(
      sql`select to_char(d, 'YYYY-MM-DD') as d
            from generate_series(now() - interval '14 days', now(), interval '1 day') d
           where extract(isodow from d) = 6 limit 1`
    ));
    ({ meal_id: mealId } = await one<{ meal_id: string }>(
      sql`select meal_id from mensa_meal group by meal_id
           having count(*) > 3 order by count(*) desc, meal_id limit 1`
    ));
    ({ id: olderServingId } = await one<{ id: string }>(
      sql`select id from mensa_meal where meal_id = ${mealId} order by date asc limit 1`
    ));
  });

  describe("getMealsForDate", () => {
    test("returns every serving of the day, grouped by mensa", async () => {
      const groups = await getMealsForDate(servedDay);
      const { n } = await one<{ n: string }>(
        sql`select count(*) as n from mensa_meal where date = ${`${servedDay} 00:00:00`}::timestamp`
      );
      const total = groups.reduce((sum, g) => sum + g.meals.length, 0);
      expect(total).toBe(Number(n));
      expect(groups.length).toBeGreaterThan(0);
      expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length);
    });

    test("is deterministic: mensen alphabetically, flags computed", async () => {
      const groups = await getMealsForDate(servedDay);
      const names = groups.map((g) => g.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
      for (const meal of groups[0].meals) {
        expect(meal.flags).toBeDefined();
        expect(typeof meal.flags.isSmall).toBe("boolean");
        expect(meal.date.toISOString().slice(0, 10)).toBe(servedDay);
      }
      expect(await getMealsForDate(servedDay)).toEqual(groups);
    });

    test("filters by mensa", async () => {
      const [first] = await getMealsForDate(servedDay);
      const filtered = await getMealsForDate(servedDay, first.id);
      expect(filtered).toEqual([first]);
    });

    test("returns [] for days without servings", async () => {
      expect(weekendDay).not.toBeNull();
      expect(await getMealsForDate(weekendDay as string)).toEqual([]);
    });
  });

  describe("findMeal", () => {
    test("uses the latest serving when no mensaMealId is given", async () => {
      const meal = await findMeal(mealId);
      const { d } = await one<{ d: string }>(
        sql`select to_char(max(date), 'YYYY-MM-DD') as d from mensa_meal where meal_id = ${mealId}`
      );
      expect(meal?.id).toBe(mealId);
      expect(meal?.servedOn).toBe(d);
      expect(meal?.flags).toBeDefined();
    });

    test("uses the given serving", async () => {
      const meal = await findMeal(mealId, olderServingId);
      expect(meal?.mensaMealId).toBe(olderServingId);
    });

    test("returns null for unknown meals or mismatched servings", async () => {
      expect(await findMeal("does-not-exist")).toBeNull();
      const { id: otherServing } = await one<{ id: string }>(
        sql`select id from mensa_meal where meal_id <> ${mealId} limit 1`
      );
      expect(await findMeal(mealId, otherServing)).toBeNull();
    });
  });

  describe("getMealServingStats", () => {
    test("matches a direct aggregate", async () => {
      const stats = await getMealServingStats(mealId);
      const expected = await one<{
        n: string;
        mensen: string;
        first: string;
        last: string;
      }>(
        sql`select count(*) as n, count(distinct mensa_id) as mensen,
                   to_char(min(date), 'YYYY-MM-DD') as first,
                   to_char(max(date), 'YYYY-MM-DD') as last
              from mensa_meal where meal_id = ${mealId}`
      );
      expect(stats.totalServings).toBe(Number(expected.n));
      expect(stats.mensaCount).toBe(Number(expected.mensen));
      expect(stats.firstServed).toBe(expected.first);
      expect(stats.lastServed).toBe(expected.last);
      const counts = stats.byMensa.map((m) => m.servingCount);
      expect(counts).toEqual([...counts].sort((a, b) => b - a));
    });

    test("is empty for unknown meals", async () => {
      expect(await getMealServingStats("does-not-exist")).toEqual({
        totalServings: 0,
        mensaCount: 0,
        firstServed: null,
        lastServed: null,
        byMensa: [],
      });
    });
  });

  describe("getMealRatingStats", () => {
    test("matches a direct aggregate", async () => {
      const { meal_id: ratedMeal, n } = await one<{
        meal_id: string;
        n: string;
      }>(
        sql`select meal_id, count(*) as n from meal_rating group by meal_id
             order by count(*) desc, meal_id limit 1`
      );
      const stats = await getMealRatingStats(ratedMeal);
      expect(stats.ratingCount).toBe(Number(n));
      expect(stats.avgRating.value).toBeGreaterThanOrEqual(1);
      expect(stats.avgRating.value).toBeLessThanOrEqual(5);
    });

    test("returns zero/null without ratings", async () => {
      expect(await getMealRatingStats("does-not-exist")).toEqual({
        ratingCount: 0,
        avgRating: {
          value: null,
          value_price: null,
          value_quantity: null,
          value_taste: null,
        },
      });
    });
  });

  describe("mensen", () => {
    test("getVisibleMensen hides 'unbekannt' and is memoized", async () => {
      const all = await listMensen();
      const visible = await getVisibleMensen();
      expect(visible.every((m) => m.name.toLowerCase() !== "unbekannt")).toBe(
        true
      );
      expect(visible.length).toBe(
        all.filter((m) => m.name.toLowerCase() !== "unbekannt").length
      );
      expect(await getVisibleMensen()).toBe(visible);
    });
  });
});
