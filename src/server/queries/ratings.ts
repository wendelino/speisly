import { and, avg, count, desc, eq, isNotNull } from "drizzle-orm";
import { mealRating } from "@/lib/db/schema/schema";
import { db } from "../db";

const round1 = (value: string | null) =>
  value ? Math.round(Number(value) * 10) / 10 : null;

/** Durchschnittsbewertungen eines Gerichts (öffentlich, cachebar). */
export async function getMealRatingStats(
  mealId: string
): Promise<MealRatingStats> {
  const [row] = await db
    .select({
      ratingCount: count(mealRating.id),
      value: avg(mealRating.value),
      value_price: avg(mealRating.value_price),
      value_quantity: avg(mealRating.value_quantity),
      value_taste: avg(mealRating.value_taste),
    })
    .from(mealRating)
    .where(eq(mealRating.mealId, mealId));

  return {
    ratingCount: row?.ratingCount ?? 0,
    avgRating: {
      value: round1(row?.value ?? null),
      value_price: round1(row?.value_price ?? null),
      value_quantity: round1(row?.value_quantity ?? null),
      value_taste: round1(row?.value_taste ?? null),
    },
  };
}

/**
 * Freigegebene Kommentare eines Gerichts, neueste zuerst (öffentlich,
 * cachebar über TAG.ratings). Nie ungeprüfte Kommentare ausliefern.
 */
export function getApprovedComments(
  mealId: string,
  limit = 20
): Promise<MealComment[]> {
  return db
    .select({
      id: mealRating.id,
      value: mealRating.value,
      comment: mealRating.comment,
      updatedAt: mealRating.updatedAt,
    })
    .from(mealRating)
    .where(
      and(
        eq(mealRating.mealId, mealId),
        eq(mealRating.commentStatus, "approved"),
        isNotNull(mealRating.comment)
      )
    )
    .orderBy(desc(mealRating.updatedAt))
    .limit(limit) as Promise<MealComment[]>;
}
