import { and, eq, sql } from "drizzle-orm";
import { commentLike, mealRating } from "@/lib/db/schema/schema";
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
      commentStatus: mealRating.commentStatus,
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
  // Leere Kommentare zählen als kein Kommentar; neue oder geänderte
  // Kommentare müssen im Admin (/admin/comments) freigegeben werden
  const comment =
    input.comment === undefined ? undefined : input.comment.trim() || null;
  const commentStatus = comment ? ("pending" as const) : null;
  const unchanged = sql`${mealRating.comment} is not distinct from ${comment ?? null}`;
  const [row] = await db
    .insert(mealRating)
    .values({
      id: genId(),
      mealId: input.mealId,
      mensaMealId: input.mensaMealId,
      userId,
      ...values,
      comment: comment ?? null,
      commentStatus,
    })
    .onConflictDoUpdate({
      target: [mealRating.mealId, mealRating.userId],
      // ohne Kommentar im Input bleibt der alte stehen (undefined wird ignoriert)
      set:
        comment === undefined
          ? values
          : {
              ...values,
              comment,
              // unveränderter Kommentar behält seine Freigabe
              commentStatus: sql`case when ${unchanged} then ${mealRating.commentStatus} else ${commentStatus}::comment_status end`,
              commentModeratedAt: sql`case when ${unchanged} then ${mealRating.commentModeratedAt} else null end`,
            },
    })
    // xmax = 0 nur bei frisch eingefügten Zeilen
    .returning({
      id: mealRating.id,
      status: mealRating.commentStatus,
      created: sql<boolean>`xmax = 0`,
    });
  // Likes gelten dem freigegebenen Text: neuer (wieder ungeprüfter) oder
  // entfernter Kommentar startet ohne
  if (row && !row.created && row.status !== "approved") {
    await db.delete(commentLike).where(eq(commentLike.ratingId, row.id));
  }
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
