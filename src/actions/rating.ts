"use server";

import { and, avg, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getOrCreateUser, getUserId } from "@/actions/user";
import { hasConsent } from "@/lib/cookie/actions";
import { db } from "@/lib/db";
import { mealRating } from "@/lib/db/schema/schema";
import { genId } from "@/lib/db/utils";

export async function getMealRatingStats(
  mealId: string
): Promise<MealRatingStats> {
  const allRatings = await db
    .select({
      ratingCount: count(mealRating.id),
      value: avg(mealRating.value),
      value_price: avg(mealRating.value_price),
      value_quantity: avg(mealRating.value_quantity),
      value_taste: avg(mealRating.value_taste),
    })
    .from(mealRating)
    .where(eq(mealRating.mealId, mealId))
    .groupBy(mealRating.mealId);

  const transformRating = (s: string | null) =>
    s ? Math.round(Number(s) * 10) / 10 : null;

  if (allRatings.length === 0) {
    return {
      ratingCount: 0,
      avgRating: {
        value: null,
        value_price: null,
        value_quantity: null,
        value_taste: null,
      },
    };
  }

  const v = allRatings[0];

  return {
    ratingCount: v.ratingCount,
    avgRating: {
      value: transformRating(v.value),
      value_price: transformRating(v.value_price),
      value_quantity: transformRating(v.value_quantity),
      value_taste: transformRating(v.value_taste),
    },
  };
}

export async function getUserRating(mealId: string) {
  const userId = await getUserId();
  if (!userId) {
    return null;
  }

  const result = await db
    .select()
    .from(mealRating)
    .where(and(eq(mealRating.mealId, mealId), eq(mealRating.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

type SubmitRatingParams = {
  mealId: string;
  mensaMealId: string;
  value: number;
  valuePrice?: number;
  valueQuantity?: number;
  valueTaste?: number;
  comment?: string;
};
export async function submitRating({
  mealId,
  mensaMealId,
  value,
  valuePrice,
  valueQuantity,
  valueTaste,
  comment,
}: SubmitRatingParams) {
  try {
    // Prüfe ob Consent gegeben wurde - Bewertungen sind nur mit Consent möglich
    if (!(await hasConsent())) {
      return {
        success: false,
        message: "Bewertungen sind nur mit Cookie-Consent möglich",
      };
    }

    const userId = await getOrCreateUser();

    // Prüfe ob bereits eine Bewertung existiert
    const existingRating = await db
      .select()
      .from(mealRating)
      .where(and(eq(mealRating.mealId, mealId), eq(mealRating.userId, userId)))
      .limit(1);

    let message = "";

    if (existingRating.length > 0) {
      // Update existing rating
      await db
        .update(mealRating)
        .set({
          value,
          value_price: valuePrice ?? null,
          value_quantity: valueQuantity ?? null,
          value_taste: valueTaste ?? null,
          comment,
        })
        .where(eq(mealRating.id, existingRating[0].id));

      message = "Bewertung aktualisiert";
    } else {
      // Create new rating
      const ratingId = genId();
      await db.insert(mealRating).values({
        id: ratingId,
        mealId,
        mensaMealId,
        userId,
        value,
        value_price: valuePrice ?? null,
        value_quantity: valueQuantity ?? null,
        value_taste: valueTaste ?? null,
        comment: comment ?? null,
      });
      message = "Bewertung erstellt";
    }

    revalidatePath(`/meal/${mealId}`);
    return {
      success: true,
      message,
      updatedAt: new Date(),
    };
  } catch (error) {
    console.error("Error submitting rating:", error);
    return {
      success: false,
      message: "Fehler beim Speichern der Bewertung",
    };
  }
}

export async function deleteRating(mealId: string) {
  try {
    if (!(await hasConsent())) {
      return {
        success: false,
        message: "Bewertungen sind nur mit Cookie-Consent möglich",
      };
    }

    const userId = await getUserId();
    if (!userId) {
      return {
        success: false,
        message: "Keine Bewertung gefunden",
      };
    }

    // Lösche die Bewertung
    const { rowCount } = await db
      .delete(mealRating)
      .where(and(eq(mealRating.mealId, mealId), eq(mealRating.userId, userId)));

    if (rowCount !== 1) {
      return {
        success: false,
        message: "Fehler beim Löschen der Bewertung",
      };
    }

    revalidatePath(`/meal/${mealId}`);

    return { success: true, message: "Bewertung gelöscht" };
  } catch (error) {
    console.error("Error deleting rating:", error);
    return {
      success: false,
      message: "Fehler beim Löschen der Bewertung",
    };
  }
}
