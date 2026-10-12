import { asc, eq } from "drizzle-orm";
import { toUtcDate } from "@/lib/dates";
import { meal, mensa, mensaMeal } from "@/lib/db/schema/schema";
import { generateFlags } from "@/lib/meal-flags";
import { db } from "../db";
import { logError } from "../log";

function selectMealsOfDay(isoDay: string) {
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
    })
    .from(mensaMeal)
    .innerJoin(mensa, eq(mensaMeal.mensaId, mensa.id))
    .innerJoin(meal, eq(mensaMeal.mealId, meal.id))
    .where(eq(mensaMeal.date, toUtcDate(isoDay)))
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
    group.meals.push({ ...row, flags: generateFlags(row) });
  }
  return [...groups.values()];
}
