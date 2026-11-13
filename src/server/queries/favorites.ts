import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { addDays, toIsoDay, toUtcDate } from "@/lib/dates";
import { meal, mensa, mensaMeal } from "@/lib/db/schema/schema";
import { db } from "../db";

export type FavoriteMeal = {
  id: string;
  name: string;
  subtitle: string;
  imgPath: string | null;
  /** nächster Termin ab heute (Tag, Mensen, eine Ausgabe für den Link) */
  next: { date: string; mensen: string[]; mensaMealId: string } | null;
  /** letzter Termin vor heute */
  last: string | null;
};

/** Wie weit „nächster Termin“ in die Zukunft schaut (Sync: heute bis +7) */
const LOOKAHEAD_DAYS = 14;

/**
 * Lieblingsgerichte mit nächstem und letztem Termin (für /favoriten). Die
 * IDs kommen aus dem Browser; unbekannte fallen weg. Reihenfolge wie `ids`.
 */
export async function getFavoriteMeals(
  ids: string[],
  today: string
): Promise<FavoriteMeal[]> {
  if (ids.length === 0) {
    return [];
  }
  const from = toUtcDate(today);
  const [meals, upcoming, past] = await Promise.all([
    db
      .select({
        id: meal.id,
        name: meal.name,
        subtitle: meal.subtitle,
        imgPath: meal.imgPath,
      })
      .from(meal)
      .where(inArray(meal.id, ids)),
    db
      .select({
        mealId: mensaMeal.mealId,
        mensaMealId: mensaMeal.id,
        date: mensaMeal.date,
        mensaName: mensa.name,
      })
      .from(mensaMeal)
      .innerJoin(mensa, eq(mensaMeal.mensaId, mensa.id))
      .where(
        and(
          inArray(mensaMeal.mealId, ids),
          gte(mensaMeal.date, from),
          lt(mensaMeal.date, toUtcDate(addDays(today, LOOKAHEAD_DAYS)))
        )
      )
      .orderBy(asc(mensaMeal.date), asc(mensa.name)),
    db
      .selectDistinctOn([mensaMeal.mealId], {
        mealId: mensaMeal.mealId,
        date: mensaMeal.date,
      })
      .from(mensaMeal)
      .where(and(inArray(mensaMeal.mealId, ids), lt(mensaMeal.date, from)))
      .orderBy(mensaMeal.mealId, desc(mensaMeal.date)),
  ]);

  const next = new Map<string, NonNullable<FavoriteMeal["next"]>>();
  for (const row of upcoming) {
    const date = toIsoDay(row.date);
    const entry = next.get(row.mealId);
    if (!entry) {
      next.set(row.mealId, {
        date,
        mensen: [row.mensaName],
        mensaMealId: row.mensaMealId,
      });
    } else if (entry.date === date && !entry.mensen.includes(row.mensaName)) {
      entry.mensen.push(row.mensaName);
    }
  }
  const last = new Map(past.map((row) => [row.mealId, toIsoDay(row.date)]));
  const byId = new Map(meals.map((row) => [row.id, row]));

  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row
      ? [{ ...row, next: next.get(id) ?? null, last: last.get(id) ?? null }]
      : [];
  });
}
