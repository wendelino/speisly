/**
 * Integrationstest der ID-Suche (`searchById`) gegen die Seed-Datenbank.
 * Ohne DATABASE_URL übersprungen.
 */
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { searchById } from "./admin";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("searchById (integration)", () => {
  test("finds a serving with its meal, and a meal by id and src_id", async () => {
    const { rows } = await db.execute(
      sql`select mm.id, mm.meal_id, m.src_id from mensa_meal mm join meal m on m.id = mm.meal_id limit 1`
    );
    const row = rows[0] as { id: string; meal_id: string; src_id: string };

    const byServing = await searchById(` ${row.id} `);
    expect(byServing.servings.map((s) => s.mealId)).toEqual([row.meal_id]);
    expect(byServing.meals).toEqual([]);

    const byMeal = await searchById(row.meal_id);
    expect(byMeal.meals.map((m) => m.id)).toEqual([row.meal_id]);
    const bySrcId = await searchById(row.src_id);
    expect(bySrcId.meals.map((m) => m.id)).toContain(row.meal_id);
  });

  test("unknown id finds nothing", async () => {
    const result = await searchById("0".repeat(32));
    expect(Object.values(result).every((rows) => rows.length === 0)).toBe(true);
  });
});
