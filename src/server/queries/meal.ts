import { and, desc, eq } from "drizzle-orm";
import { meal, mensa, mensaMeal } from "@/lib/db/schema/schema";
import { generateFlags } from "@/lib/meal-flags";
import { toIsoDay } from "../dates";
import { db } from "../db";
import { logError } from "../log";

/** Gericht inkl. Zutaten einer Ausgabe – ohne Bewertungen (eigene Query). */
export type MealDetail = Omit<Meal, "mensaMealId" | "date"> & {
  /** Die Ausgabe, deren Zutaten/Extras angezeigt werden */
  mensaMealId: string;
  servedOn: string;
  mensaName: string;
};

/**
 * Lädt ein Gericht mit **einer** Query. Ohne `mensaMealId` werden Zutaten und
 * Extras der neuesten Ausgabe verwendet (deterministisch, damit die Seite
 * unabhängig von `?mmid` gecacht werden kann).
 */
export async function findMeal(
  mealId: string,
  mensaMealId?: string
): Promise<MealDetail | null> {
  const conditions = [eq(meal.id, mealId)];
  if (mensaMealId) {
    conditions.push(eq(mensaMeal.id, mensaMealId));
  }

  try {
    const [row] = await db
      .select({
        id: meal.id,
        name: meal.name,
        subtitle: meal.subtitle,
        imgPath: meal.imgPath,
        priceStud: meal.priceStud,
        priceWork: meal.priceWork,
        priceGuest: meal.priceGuest,
        ingredients: mensaMeal.ingredients,
        extras: mensaMeal.extras,
        mensaMealId: mensaMeal.id,
        date: mensaMeal.date,
        mensaName: mensa.name,
      })
      .from(meal)
      .innerJoin(mensaMeal, eq(meal.id, mensaMeal.mealId))
      .innerJoin(mensa, eq(mensa.id, mensaMeal.mensaId))
      .where(and(...conditions))
      .orderBy(desc(mensaMeal.date))
      .limit(1);

    if (!row) {
      return null;
    }
    const { date, ...rest } = row;
    return {
      ...rest,
      servedOn: toIsoDay(date),
      flags: generateFlags(rest),
    };
  } catch (error) {
    logError({
      message: "Error getting meal",
      ctx: { mealId, mensaMealId, error },
    });
    throw error;
  }
}
