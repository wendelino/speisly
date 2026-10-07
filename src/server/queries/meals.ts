import { and, asc, eq, type SQL } from "drizzle-orm";
import { meal, mensa, mensaMeal } from "@/lib/db/schema/schema";
import { transformMeal } from "@/lib/meal-flags";
import { toUtcDate } from "../dates";
import { db } from "../db";
import { logError } from "../log";

function selectMealsOfDay(conditions: SQL[]) {
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
      date: mensaMeal.date,
    })
    .from(mensaMeal)
    .innerJoin(mensa, eq(mensaMeal.mensaId, mensa.id))
    .innerJoin(meal, eq(mensaMeal.mealId, meal.id))
    .where(and(...conditions))
    .orderBy(asc(mensa.name), asc(meal.name));
}

/**
 * Speiseplan eines Tages, gruppiert nach Mensa (alphabetisch).
 *
 * Wirft bei DB-Fehlern, statt `[]` zurückzugeben: Eine leere Seite darf nicht
 * im Route Cache landen.
 */
export async function getMealsForDate(
  isoDay: string,
  mensaId?: string
): Promise<MensaMealGroup[]> {
  const conditions = [eq(mensaMeal.date, toUtcDate(isoDay))];
  if (mensaId) {
    conditions.push(eq(mensa.id, mensaId));
  }

  let rows: Awaited<ReturnType<typeof selectMealsOfDay>>;
  try {
    rows = await selectMealsOfDay(conditions);
  } catch (error) {
    logError({
      message: "Error getting meals for date",
      ctx: { isoDay, mensaId, error },
    });
    throw error;
  }

  const groups = new Map<string, MensaMealGroup>();
  for (const { mensaId: id, mensaName, mensaSlug, ...row } of rows) {
    let group = groups.get(id);
    if (!group) {
      group = { id, name: mensaName, slug: mensaSlug, meals: [] };
      groups.set(id, group);
    }
    group.meals.push(transformMeal(row));
  }
  return [...groups.values()];
}
