"use server";

import { and, eq, inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { logError } from "@/actions/error";
import { db } from "@/lib/db";
import { meal, mensa, mensaMeal } from "@/lib/db/schema/schema";
import { transformMeal } from "@/lib/helpers";

async function _getMealsForDate(
  mensaId?: string,
  date?: Date
): Promise<MensaMealGroup[]> {
  try {
    const inputDate = date || new Date();
    const targetDate = new Date(
      Date.UTC(
        inputDate.getFullYear(),
        inputDate.getMonth(),
        inputDate.getDate(),
        0,
        0,
        0,
        0
      )
    );

    const conditions = [eq(mensaMeal.date, targetDate)];

    if (mensaId) {
      conditions.push(eq(mensa.id, mensaId));
    }

    const query = db
      .select({
        mensaId: mensa.id,
        mensaName: mensa.name,
        mensaSlug: mensa.slug,
        mealId: meal.id,
        mealName: meal.name,
        mealSubtitle: meal.subtitle,
        mealImgPath: meal.imgPath,
        mealIngredients: mensaMeal.ingredients,
        mealExtras: mensaMeal.extras,
        mealPriceStud: meal.priceStud,
        mealPriceWork: meal.priceWork,
        mealPriceGuest: meal.priceGuest,
        mensaMealId: mensaMeal.id,
        date: mensaMeal.date,
      })
      .from(mensaMeal)
      .innerJoin(mensa, eq(mensaMeal.mensaId, mensa.id))
      .innerJoin(meal, eq(mensaMeal.mealId, meal.id))
      .where(and(...conditions));

    const results = await query;

    // Gruppiere nach Mensa
    const grouped: Record<
      string,
      {
        id: string;
        name: string;
        slug: string;
        meals: Meal[];
      }
    > = {};

    for (const row of results) {
      if (!grouped[row.mensaId]) {
        grouped[row.mensaId] = {
          id: row.mensaId,
          name: row.mensaName,
          slug: row.mensaSlug,
          meals: [],
        };
      }
      grouped[row.mensaId].meals.push(
        transformMeal({
          id: row.mealId,
          name: row.mealName,
          subtitle: row.mealSubtitle,
          imgPath: row.mealImgPath,
          ingredients: row.mealIngredients,
          priceStud: row.mealPriceStud,
          priceWork: row.mealPriceWork,
          priceGuest: row.mealPriceGuest,
          mensaMealId: row.mensaMealId,
          date: row.date,
          extras: row.mealExtras,
        })
      );
    }

    return Object.values(grouped);
  } catch (error) {
    await logError({
      message: "Error getting meals for date",
      ctx: { mensaId, date, error },
    });
    return [];
  }
}

export async function getMealsForDate({
  date,
  mensaId,
}: {
  date: Date;
  mensaId?: string;
}): Promise<MensaMealGroup[]> {
  // Normalize date for cache key
  const inputDate = date || new Date();
  const dateKey = `${inputDate.getFullYear()}-${inputDate.getMonth()}-${inputDate.getDate()}`;

  // Create cache key array with parameters
  const cacheKey = ["getTodayMeals", mensaId || "all", dateKey];

  // Create cached function with dynamic key
  const cachedFn = unstable_cache(
    async () => await _getMealsForDate(mensaId, date),
    cacheKey,
    {
      revalidate: 1800, // Revalidierung alle 1800 Sekunden (30 Minuten) für ISR
      tags: ["meals"],
    }
  );

  return await cachedFn();
}

export async function getMealsBySrcIDs({ srcIds }: { srcIds: string[] }) {
  const res = await db
    .select({
      name: meal.name,
      id: meal.id,
      imgPath: meal.imgPath,
      priceStud: meal.priceStud,
      priceWork: meal.priceWork,
      priceGuest: meal.priceGuest,
      subtitle: meal.subtitle,
      srcId: meal.srcId,
    })
    .from(meal)
    .where(inArray(meal.srcId, srcIds));
  return res;
}
