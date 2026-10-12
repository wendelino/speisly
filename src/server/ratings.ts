import { and, eq, sql } from "drizzle-orm";
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

/** Die Bewertung eines Nutzers zu einem Gericht (eindeutig per Index) */
const byUser = (userId: string, mealId: string) =>
  and(eq(mealRating.mealId, mealId), eq(mealRating.userId, userId));

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
    .where(byUser(userId, mealId))
    .limit(1);
  return existing ?? null;
}

/**
 * Legt eine Bewertung an oder aktualisiert sie (eine Query über den
 * Unique-Index Gericht + Nutzer). Gibt zurück, was passiert ist.
 */
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
  const [row] = await db
    .insert(mealRating)
    .values({
      id: genId(),
      mealId: input.mealId,
      mensaMealId: input.mensaMealId,
      userId,
      ...values,
      comment: input.comment ?? null,
    })
    .onConflictDoUpdate({
      target: [mealRating.mealId, mealRating.userId],
      // ohne Kommentar im Input bleibt der alte stehen (undefined wird ignoriert)
      set: { ...values, comment: input.comment },
    })
    // xmax = 0 nur bei frisch eingefügten Zeilen
    .returning({ created: sql<boolean>`xmax = 0` });
  return row?.created ? "created" : "updated";
}

/** Löscht die Bewertung des Nutzers. `true`, wenn genau eine gelöscht wurde. */
export async function deleteUserRating(
  userId: string,
  mealId: string
): Promise<boolean> {
  const { rowCount } = await db
    .delete(mealRating)
    .where(byUser(userId, mealId));
  return rowCount === 1;
}
