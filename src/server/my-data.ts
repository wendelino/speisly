import { desc, eq, sql } from "drizzle-orm";
import { toIsoDay } from "@/lib/dates";
import {
  commentLike,
  meal,
  mealRating,
  mensa,
  mensaMeal,
  user,
} from "@/lib/db/schema/schema";
import { TAG } from "./cache-tags";
import { db } from "./db";

/**
 * „Meine Daten“ (/meine-daten): alles, was unter der pseudonymen Kennung
 * eines Browsers gespeichert ist, zum Ansehen, Exportieren (Art. 15/20
 * DSGVO) und Löschen (Art. 17 DSGVO). Nie gecacht, nur per Action.
 */

export type MyRating = {
  id: string;
  mealId: string;
  mealName: string;
  /** Ausgabe, für die bewertet wurde (Link auf die Detailseite) */
  mensaMealId: string;
  date: string;
  mensaName: string;
  value: number;
  valuePrice: number | null;
  valueQuantity: number | null;
  valueTaste: number | null;
  comment: string | null;
  commentStatus: "pending" | "approved" | "rejected" | null;
  /** erhaltene „Gefällt mir“ (nur bei freigegebenen Kommentaren möglich) */
  likes: number;
  createdAt: string;
  updatedAt: string;
};

export type MyLike = {
  ratingId: string;
  mealId: string;
  mealName: string;
  likedAt: string;
};

export type MyData = {
  /** seit wann es die Kennung gibt */
  since: string;
  ratings: MyRating[];
  likes: MyLike[];
};

export async function getMyData(userId: string): Promise<MyData | null> {
  const [account] = await db
    .select({ createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!account) {
    return null;
  }
  const [ratings, likes] = await Promise.all([
    db
      .select({
        id: mealRating.id,
        mealId: mealRating.mealId,
        mealName: meal.name,
        mensaMealId: mealRating.mensaMealId,
        date: mensaMeal.date,
        mensaName: mensa.name,
        value: mealRating.value,
        valuePrice: mealRating.value_price,
        valueQuantity: mealRating.value_quantity,
        valueTaste: mealRating.value_taste,
        comment: mealRating.comment,
        commentStatus: mealRating.commentStatus,
        likes: sql<number>`(select count(*) from ${commentLike} where ${commentLike.ratingId} = ${mealRating.id})::int`,
        createdAt: mealRating.createdAt,
        updatedAt: mealRating.updatedAt,
      })
      .from(mealRating)
      .innerJoin(meal, eq(mealRating.mealId, meal.id))
      .innerJoin(mensaMeal, eq(mealRating.mensaMealId, mensaMeal.id))
      .innerJoin(mensa, eq(mensaMeal.mensaId, mensa.id))
      .where(eq(mealRating.userId, userId))
      .orderBy(desc(mealRating.updatedAt)),
    db
      .select({
        ratingId: commentLike.ratingId,
        mealId: mealRating.mealId,
        mealName: meal.name,
        likedAt: commentLike.createdAt,
      })
      .from(commentLike)
      .innerJoin(mealRating, eq(commentLike.ratingId, mealRating.id))
      .innerJoin(meal, eq(mealRating.mealId, meal.id))
      .where(eq(commentLike.userId, userId))
      .orderBy(desc(commentLike.createdAt)),
  ]);

  return {
    since: account.createdAt.toISOString(),
    ratings: ratings.map((row) => ({
      ...row,
      date: toIsoDay(row.date),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    likes: likes.map((row) => ({
      ...row,
      likedAt: row.likedAt.toISOString(),
    })),
  };
}

/**
 * Löscht den Nutzer; Bewertungen, Kommentare und vergebene Likes hängen per
 * `on delete cascade` daran. Gibt die Cache-Tags zurück, die danach
 * invalidiert werden müssen (Bewertungen in Speiseplänen und Detailseiten,
 * Like-Zahlen an fremden Kommentaren), oder `null`, wenn es ihn nicht gab.
 */
export async function deleteMyData(userId: string): Promise<string[] | null> {
  return await db.transaction(async (tx) => {
    const [rated, liked] = await Promise.all([
      tx
        .selectDistinct({ mealId: mealRating.mealId })
        .from(mealRating)
        .where(eq(mealRating.userId, userId)),
      tx
        .selectDistinct({ mealId: mealRating.mealId })
        .from(commentLike)
        .innerJoin(mealRating, eq(commentLike.ratingId, mealRating.id))
        .where(eq(commentLike.userId, userId)),
    ]);
    const deleted = await tx
      .delete(user)
      .where(eq(user.id, userId))
      .returning({ id: user.id });
    if (deleted.length === 0) {
      return null;
    }
    return [
      ...rated.map((row) => TAG.ratings(row.mealId)),
      ...liked.map((row) => TAG.comments(row.mealId)),
    ];
  });
}
