import { asc, eq, inArray, sql } from "drizzle-orm";
import { toUtcDate } from "@/lib/dates";
import { meal, mealRating, mensa, mensaMeal } from "@/lib/db/schema/schema";
import { generateFlags } from "@/lib/meal-flags";
import { db } from "../db";
import { logError } from "../log";

function selectMealsOfDay(isoDay: string) {
  const day = toUtcDate(isoDay);
  // Durchschnittsbewertung je Gericht (für Anzeige und Sortierung), nur für
  // die Gerichte dieses Tages
  const ratings = db
    .select({
      mealId: mealRating.mealId,
      avg: sql<string>`avg(${mealRating.value})`.as("rating_avg"),
      count: sql<number>`count(*)::int`.as("rating_count"),
    })
    .from(mealRating)
    .where(
      inArray(
        mealRating.mealId,
        db
          .select({ id: mensaMeal.mealId })
          .from(mensaMeal)
          .where(eq(mensaMeal.date, day))
      )
    )
    .groupBy(mealRating.mealId)
    .as("ratings");
  return db
    .select({
      mensaId: mensa.id,
      mensaName: mensa.name,
      mensaSlug: mensa.slug,
      id: meal.id,
      name: meal.name,
      subtitle: meal.subtitle,
      imgPath: meal.imgPath,
      ingredients: mensaMeal.ingredients,
      extras: mensaMeal.extras,
      priceStud: meal.priceStud,
      priceWork: meal.priceWork,
      priceGuest: meal.priceGuest,
      mensaMealId: mensaMeal.id,
      ratingAvg: ratings.avg,
      ratingCount: ratings.count,
    })
    .from(mensaMeal)
    .innerJoin(mensa, eq(mensaMeal.mensaId, mensa.id))
    .innerJoin(meal, eq(mensaMeal.mealId, meal.id))
    .leftJoin(ratings, eq(ratings.mealId, meal.id))
    .where(eq(mensaMeal.date, day))
    .orderBy(asc(mensa.name), asc(meal.name));
}

/**
 * Speiseplan eines Tages, gruppiert nach Mensa (alphabetisch).
 *
 * Wirft bei DB-Fehlern, statt `[]` zurückzugeben: Eine leere Seite darf nicht
 * im Route Cache landen.
 */
export async function getMealsForDate(
  isoDay: string
): Promise<MensaMealGroup[]> {
  let rows: Awaited<ReturnType<typeof selectMealsOfDay>>;
  try {
    rows = await selectMealsOfDay(isoDay);
  } catch (error) {
    logError({
      message: "Error getting meals for date",
      ctx: { isoDay, error },
      source: "queries",
    });
    throw error;
  }

  const groups = new Map<string, MensaMealGroup>();
  for (const {
    mensaId: id,
    mensaName,
    mensaSlug,
    ratingAvg,
    ratingCount,
    ...row
  } of rows) {
    let group = groups.get(id);
    if (!group) {
      group = { id, name: mensaName, slug: mensaSlug, meals: [] };
      groups.set(id, group);
    }
    const rating =
      ratingAvg && ratingCount
        ? { value: Math.round(Number(ratingAvg) * 10) / 10, count: ratingCount }
        : null;
    group.meals.push({ ...row, rating, flags: generateFlags(row) });
  }
  return [...groups.values()];
}
