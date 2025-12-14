"use server";

import { and, eq } from "drizzle-orm";
import { logError } from "@/actions/error";
import { db } from "@/lib/db";
import { meal, mensa, mensaMeal } from "@/lib/db/schema/schema";
import { genId } from "@/lib/db/utils";
import { generateFlags } from "@/lib/helpers";
import { getMealRatingStats } from "./rating";

type FindMealProps =
  | {
      mealId: string;
      mensaMealId?: string;
    }
  | {
      mealName: string;
      mensaMealId?: string;
    };

export async function findMeal(
  props: FindMealProps
): Promise<DetailedMeal | null> {
  const condition =
    "mealId" in props
      ? eq(meal.id, props.mealId)
      : eq(meal.name, props.mealName);

  try {
    const conditions = [condition];
    if (props.mensaMealId) {
      conditions.push(eq(mensaMeal.id, props.mensaMealId));
    }

    const results = await db
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
      })
      .from(meal)
      .innerJoin(mensaMeal, eq(meal.id, mensaMeal.mealId))
      .where(conditions.length === 1 ? condition : and(...conditions));

    if (results.length === 0) {
      return null;
    }

    const result = results[0];
    const avgRating = await getMealRatingStats(result.id);

    const ingredients = result.ingredients || [];
    const extras = result.extras || [];

    return {
      flags: generateFlags({
        name: result.name,
        subtitle: result.subtitle,
        ingredients,
      }),
      ...result,
      extras,
      ...avgRating,
    };
  } catch (error) {
    await logError({
      message: "Error getting meal",
      ctx: { props, error },
    });
    return null;
  }
}

export async function createMeal(
  data: Omit<
    typeof meal.$inferInsert,
    "id" | "updateLog" | "createdAt" | "updatedAt"
  >
): Promise<typeof meal.$inferSelect> {
  const id = genId();
  const newMeal = await db
    .insert(meal)
    .values({
      id,
      ...data,
    })
    .returning();
  return newMeal[0];
}

export async function getMealAvailability({ mealId }: { mealId: string }) {
  const availability = await db
    .select({
      date: mensaMeal.date,
      mensaId: mensa.id,
      mensaName: mensa.name,
      mensaSlug: mensa.slug,
    })
    .from(mensaMeal)
    .where(eq(mensaMeal.mealId, mealId))
    .innerJoin(mensa, eq(mensaMeal.mensaId, mensa.id));
  return availability;
}
