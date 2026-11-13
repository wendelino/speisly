import { and, count, eq, isNotNull } from "drizzle-orm";
import { commentLike, mealRating } from "@/lib/db/schema/schema";
import { db } from "./db";

export type LikeResult =
  | { ok: true; mealId: string; likes: number }
  | { ok: false; reason: "not-found" | "own" };

/**
 * Setzt (`liked`) oder entfernt das Like eines Nutzers an einem Kommentar.
 * Nur freigegebene Kommentare, nie der eigene. Gibt die neue Anzahl zurück.
 */
export async function setCommentLike(
  userId: string,
  ratingId: string,
  liked: boolean
): Promise<LikeResult> {
  const [rating] = await db
    .select({ mealId: mealRating.mealId, userId: mealRating.userId })
    .from(mealRating)
    .where(
      and(
        eq(mealRating.id, ratingId),
        eq(mealRating.commentStatus, "approved"),
        isNotNull(mealRating.comment)
      )
    )
    .limit(1);
  if (!rating) {
    return { ok: false, reason: "not-found" };
  }
  if (rating.userId === userId) {
    return { ok: false, reason: "own" };
  }

  if (liked) {
    await db
      .insert(commentLike)
      .values({ ratingId, userId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(commentLike)
      .where(
        and(eq(commentLike.ratingId, ratingId), eq(commentLike.userId, userId))
      );
  }

  const [row] = await db
    .select({ likes: count() })
    .from(commentLike)
    .where(eq(commentLike.ratingId, ratingId));
  return { ok: true, mealId: rating.mealId, likes: row?.likes ?? 0 };
}

/**
 * Kommentare eines Gerichts, die der Nutzer geliked hat, und sein eigener
 * Kommentar (den kann er nicht liken).
 */
export async function getOwnCommentState(
  userId: string,
  mealId: string
): Promise<{ liked: string[]; own: string | null }> {
  const [liked, [own]] = await Promise.all([
    db
      .select({ ratingId: commentLike.ratingId })
      .from(commentLike)
      .innerJoin(mealRating, eq(commentLike.ratingId, mealRating.id))
      .where(
        and(eq(commentLike.userId, userId), eq(mealRating.mealId, mealId))
      ),
    db
      .select({ id: mealRating.id })
      .from(mealRating)
      .where(and(eq(mealRating.userId, userId), eq(mealRating.mealId, mealId)))
      .limit(1),
  ]);
  return { liked: liked.map((row) => row.ratingId), own: own?.id ?? null };
}
