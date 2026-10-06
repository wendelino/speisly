import { and, eq } from "drizzle-orm";
import { mealRating } from "@/lib/db/schema/schema";
import { genId } from "@/lib/db/utils";
import { db } from "./db";

export type RatingInput = {
  mealId: string;
  mensaMealId: string;
  value: number;
  valuePrice?: number;
  valueQuantity?: number;
  valueTaste?: number;
  comment?: string;
};

export async function getUserRating(userId: string, mealId: string) {
  const [existing] = await db
    .select({
      value: mealRating.value,
      value_price: mealRating.value_price,
      value_quantity: mealRating.value_quantity,
      value_taste: mealRating.value_taste,
      comment: mealRating.comment,
      updatedAt: mealRating.updatedAt,
    })
    .from(mealRating)
    .where(and(eq(mealRating.mealId, mealId), eq(mealRating.userId, userId)))
    .limit(1);
  return existing ?? null;
}

/** Legt eine Bewertung an oder aktualisiert sie. Gibt zurück, was passiert ist. */
export async function upsertRating(
  userId: string,
  input: RatingInput
): Promise<"created" | "updated"> {
  const values = {
    value: input.value,
    value_price: input.valuePrice ?? null,
    value_quantity: input.valueQuantity ?? null,
    value_taste: input.valueTaste ?? null,
  };
  const [existing] = await db
    .select({ id: mealRating.id })
    .from(mealRating)
    .where(
      and(eq(mealRating.mealId, input.mealId), eq(mealRating.userId, userId))
    )
    .limit(1);

  if (existing) {
    await db
      .update(mealRating)
      .set({ ...values, comment: input.comment })
      .where(eq(mealRating.id, existing.id));
    return "updated";
  }
  await db.insert(mealRating).values({
    id: genId(),
    mealId: input.mealId,
    mensaMealId: input.mensaMealId,
    userId,
    ...values,
    comment: input.comment ?? null,
  });
  return "created";
}

/** Löscht die Bewertung des Nutzers. `true`, wenn genau eine gelöscht wurde. */
export async function deleteUserRating(
  userId: string,
  mealId: string
): Promise<boolean> {
  const { rowCount } = await db
    .delete(mealRating)
    .where(and(eq(mealRating.mealId, mealId), eq(mealRating.userId, userId)));
  return rowCount === 1;
}
