import { count, desc, eq, max, min } from "drizzle-orm";
import { toIsoDay } from "@/lib/dates";
import { mensa, mensaMeal } from "@/lib/db/schema/schema";
import { db } from "../db";
import { logError } from "../log";

export type MealServingStats = {
  totalServings: number;
  mensaCount: number;
  /** `YYYY-MM-DD` */
  firstServed: string | null;
  /** `YYYY-MM-DD` */
  lastServed: string | null;
  byMensa: {
    mensaName: string;
    servingCount: number;
    firstServed: string;
    lastServed: string;
  }[];
};

/** Angebotshistorie eines Gerichts pro Mensa (eine Query). */
export async function getMealServingStats(
  mealId: string
): Promise<MealServingStats> {
  let rows: {
    mensaName: string;
    servingCount: number;
    firstServed: Date | null;
    lastServed: Date | null;
  }[];
  try {
    rows = await db
      .select({
        mensaName: mensa.name,
        servingCount: count(mensaMeal.id),
        firstServed: min(mensaMeal.date),
        lastServed: max(mensaMeal.date),
      })
      .from(mensaMeal)
      .innerJoin(mensa, eq(mensaMeal.mensaId, mensa.id))
      .where(eq(mensaMeal.mealId, mealId))
      .groupBy(mensa.id, mensa.name)
      .orderBy(desc(count(mensaMeal.id)), mensa.name);
  } catch (error) {
    logError({
      message: "Error getting meal serving stats",
      ctx: { mealId, error },
    });
    throw error;
  }

  const byMensa = rows.flatMap((row) =>
    row.firstServed && row.lastServed
      ? [
          {
            mensaName: row.mensaName,
            servingCount: row.servingCount,
            firstServed: toIsoDay(row.firstServed),
            lastServed: toIsoDay(row.lastServed),
          },
        ]
      : []
  );

  // ISO-Strings sind lexikografisch sortierbar
  const firsts = byMensa.map((m) => m.firstServed).sort();
  const lasts = byMensa.map((m) => m.lastServed).sort();

  return {
    totalServings: byMensa.reduce((sum, m) => sum + m.servingCount, 0),
    mensaCount: byMensa.length,
    firstServed: firsts[0] ?? null,
    lastServed: lasts.at(-1) ?? null,
    byMensa,
  };
}
