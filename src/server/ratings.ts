import { and, eq, sql } from "drizzle-orm";
import { commentLike, mealRating } from "@/lib/db/schema/schema";
import { genId } from "@/lib/db/utils";
import { findFlaggedWords } from "./comment-filter";
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
/** Mensa und Tag der bewerteten Ausgabe (bleiben, auch wenn sie entfernt wird) */
export type RatedServing = { mensaId: string; date: Date };

export type UpsertRatingResult = {
  result: "created" | "updated";
  ratingId: string;
  /**
   * Neuer bzw. geänderter Kommentar, den der Wortfilter zurückhält: die
   * Admins werden benachrichtigt (actions/index.ts). Sonst `null`.
   */
  heldComment: { comment: string; words: string[] } | null;
};

/**
 * Status eines neuen oder geänderten Kommentars: ohne Treffer im Wortfilter
 * sofort öffentlich (`approved`), mit Treffer zurückgehalten (`pending`).
 * `comment_moderated_at` bleibt in beiden Fällen leer: Im Admin
 * (/admin/comments) steht er als „ungeprüft“, bis ihn jemand bestätigt.
 */
function statusFor(comment: string | null) {
  if (!comment) {
    return { status: null, words: [] };
  }
  const words = findFlaggedWords(comment);
  return {
    status: words.length > 0 ? ("pending" as const) : ("approved" as const),
    words,
  };
}

export async function upsertRating(
  userId: string,
  input: RatingInput,
  serving: RatedServing
): Promise<UpsertRatingResult> {
  const values = {
    value: input.value,
    value_price: input.valuePrice ?? null,
    value_quantity: input.valueQuantity ?? null,
    value_taste: input.valueTaste ?? null,
  };
  // Leere Kommentare zählen als kein Kommentar
  const comment =
    input.comment === undefined ? undefined : input.comment.trim() || null;
  const { status: commentStatus, words } = statusFor(comment ?? null);
  // vorheriger Text: entscheidet über Likes und Benachrichtigung
  const [previous] =
    comment === undefined
      ? []
      : await db
          .select({ comment: mealRating.comment })
          .from(mealRating)
          .where(byUser(userId, input.mealId))
          .limit(1);
  const unchanged = sql`${mealRating.comment} is not distinct from ${comment ?? null}`;
  const [row] = await db
    .insert(mealRating)
    .values({
      id: genId(),
      mealId: input.mealId,
      mensaMealId: input.mensaMealId,
      mensaId: serving.mensaId,
      servingDate: serving.date,
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
              // unveränderter Kommentar behält Status und Prüfung
              commentStatus: sql`case when ${unchanged} then ${mealRating.commentStatus} else ${commentStatus}::comment_status end`,
              commentModeratedAt: sql`case when ${unchanged} then ${mealRating.commentModeratedAt} else null end`,
            },
    })
    // xmax = 0 nur bei frisch eingefügten Zeilen
    .returning({
      id: mealRating.id,
      created: sql<boolean>`xmax = 0`,
    });
  const changed =
    comment !== undefined &&
    (row?.created || (previous?.comment ?? null) !== comment);
  // Likes gelten dem Text: ein neuer oder entfernter Kommentar startet ohne
  if (row && !row.created && changed) {
    await db.delete(commentLike).where(eq(commentLike.ratingId, row.id));
  }
  return {
    result: row?.created ? "created" : "updated",
    ratingId: row?.id ?? "",
    heldComment:
      changed && comment && commentStatus === "pending"
        ? { comment, words }
        : null,
  };
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
