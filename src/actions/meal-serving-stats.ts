"use server";

import { count, desc, eq, max, min } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { logError } from "@/actions/error";
import { db } from "@/lib/db";
import { mensa, mensaMeal } from "@/lib/db/schema/schema";

export type MealServingStats = {
  totalServings: number;
  mensaCount: number;
  firstServed: Date | null;
  lastServed: Date | null;
  byMensa: {
    mensaId: string;
    mensaName: string;
    mensaSlug: string;
    servingCount: number;
    firstServed: Date;
    lastServed: Date;
  }[];
};

const ONE_DAY_IN_SECONDS = 86_400;

async function _getMealServingStats(mealId: string): Promise<MealServingStats> {
  try {
    const byMensa = await db
      .select({
        mensaId: mensa.id,
        mensaName: mensa.name,
        mensaSlug: mensa.slug,
        servingCount: count(mensaMeal.id),
        firstServed: min(mensaMeal.date),
        lastServed: max(mensaMeal.date),
      })
      .from(mensaMeal)
      .innerJoin(mensa, eq(mensaMeal.mensaId, mensa.id))
      .where(eq(mensaMeal.mealId, mealId))
      .groupBy(mensa.id, mensa.name, mensa.slug)
      .orderBy(desc(count(mensaMeal.id)));

    if (byMensa.length === 0) {
      return {
        totalServings: 0,
        mensaCount: 0,
        firstServed: null,
        lastServed: null,
        byMensa: [],
      };
    }

    const totalServings = byMensa.reduce(
      (sum, row) => sum + row.servingCount,
      0
    );

    const firstServed = byMensa.reduce<Date | null>((earliest, row) => {
      if (!row.firstServed) {
        return earliest;
      }
      if (!earliest || row.firstServed < earliest) {
        return row.firstServed;
      }
      return earliest;
    }, null);

    const lastServed = byMensa.reduce<Date | null>((latest, row) => {
      if (!row.lastServed) {
        return latest;
      }
      if (!latest || row.lastServed > latest) {
        return row.lastServed;
      }
      return latest;
    }, null);

    return {
      totalServings,
      mensaCount: byMensa.length,
      firstServed,
      lastServed,
      byMensa: byMensa.map((row) => ({
        mensaId: row.mensaId,
        mensaName: row.mensaName,
        mensaSlug: row.mensaSlug,
        servingCount: row.servingCount,
        firstServed: row.firstServed!,
        lastServed: row.lastServed!,
      })),
    };
  } catch (error) {
    await logError({
      message: "Error getting meal serving stats",
      ctx: { mealId, error },
    });
    return {
      totalServings: 0,
      mensaCount: 0,
      firstServed: null,
      lastServed: null,
      byMensa: [],
    };
  }
}

export async function getMealServingStats({
  mealId,
}: {
  mealId: string;
}): Promise<MealServingStats> {
  const dateKey = new Date().toISOString().slice(0, 10);

  const cachedFn = unstable_cache(
    async () => await _getMealServingStats(mealId),
    ["meal-serving-stats", mealId, dateKey],
    {
      revalidate: ONE_DAY_IN_SECONDS,
      tags: [`meal-serving-stats-${mealId}`],
    }
  );

  return await cachedFn();
}
