import { and, avg, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { toIsoDay } from "@/lib/dates";
import { commentLike, mealRating, mensa } from "@/lib/db/schema/schema";
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
      likes: sql<number>`(select count(*) from ${commentLike} where ${commentLike.ratingId} = ${mealRating.id})::int`,
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

/**
 * Bewertungen eines Gerichts nach Mensa und nach Ausgabe (Mensa + Tag), für
 * die Aufschlüsselung auf der Detailseite. Öffentlich, cachebar über
 * TAG.ratings. Ausgaben neueste zuerst, höchstens `servingLimit`.
 */
export async function getRatingBreakdown(
  mealId: string,
  servingLimit = 6
): Promise<MealRatingBreakdown> {
  // Mensa und Tag aus der Bewertung selbst: zählt auch Ausgaben, die der
  // Sync inzwischen entfernt hat
  const rows = await db
    .select({
      mensaId: mensa.id,
      mensaName: mensa.name,
      date: mealRating.servingDate,
      count: count(mealRating.id),
      sum: sql<number>`sum(${mealRating.value})::int`,
    })
    .from(mealRating)
    .innerJoin(mensa, eq(mealRating.mensaId, mensa.id))
    .where(eq(mealRating.mealId, mealId))
    .groupBy(mensa.id, mensa.name, mealRating.servingDate)
    .orderBy(desc(mealRating.servingDate), mensa.name);
  return summarizeBreakdown(rows, servingLimit);
}

type BreakdownRow = {
  mensaId: string;
  mensaName: string;
  date: Date;
  count: number;
  sum: number;
};

const avgOf = (sum: number, n: number) => Math.round((sum / n) * 10) / 10;

/** Fasst Ausgaben zu Mensen zusammen (Zeilen: neueste Ausgabe zuerst) */
export function summarizeBreakdown(
  rows: BreakdownRow[],
  servingLimit: number
): MealRatingBreakdown {
  const mensen = new Map<
    string,
    { name: string; count: number; sum: number }
  >();
  for (const row of rows) {
    const entry = mensen.get(row.mensaId) ?? {
      name: row.mensaName,
      count: 0,
      sum: 0,
    };
    entry.count += row.count;
    entry.sum += row.sum;
    mensen.set(row.mensaId, entry);
  }
  return {
    byMensa: [...mensen.values()]
      .map(({ name, count: n, sum }) => ({
        mensaName: name,
        count: n,
        value: avgOf(sum, n),
      }))
      .sort(
        (a, b) => b.count - a.count || a.mensaName.localeCompare(b.mensaName)
      ),
    byServing: rows.slice(0, servingLimit).map((row) => ({
      mensaName: row.mensaName,
      date: toIsoDay(row.date),
      count: row.count,
      value: avgOf(row.sum, row.count),
    })),
    servingCount: rows.length,
  };
}
