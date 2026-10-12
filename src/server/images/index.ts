import { IMAGE_DIR } from "astro:env/server";
import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { toIsoDay, toUtcDate } from "@/lib/dates";
import { meal, mensaMeal } from "@/lib/db/schema/schema";
import { db } from "../db";
import { logError } from "../log";
import type { SyncResult } from "../sync";
import { createImageStore, type ImageStore } from "./store";

export const images = createImageStore({ dir: IMAGE_DIR });

/**
 * Sorgt dafür, dass alle Bilder der Gerichte im Zeitraum Varianten haben.
 * Prüft jedes Mal den ganzen Zeitraum (nicht nur Geändertes), damit ein
 * fehlgeschlagener Download beim nächsten Sync nachgeholt wird.
 *
 * Gibt Tage und Gerichte zurück, für die neue Varianten entstanden sind: Deren
 * gecachte Seiten zeigen noch das Original und werden invalidiert.
 */
export async function syncImages(
  range: { from: string; to: string },
  store: ImageStore = images
): Promise<SyncResult & { created: number; failed: number }> {
  const rows = await db
    .selectDistinct({
      mealId: meal.id,
      imgPath: meal.imgPath,
      date: mensaMeal.date,
    })
    .from(mensaMeal)
    .innerJoin(meal, eq(mensaMeal.mealId, meal.id))
    .where(
      and(
        gte(mensaMeal.date, toUtcDate(range.from)),
        lte(mensaMeal.date, toUtcDate(range.to)),
        isNotNull(meal.imgPath)
      )
    );

  const byUrl = new Map<string, { mealIds: Set<string>; dates: Set<string> }>();
  for (const row of rows) {
    if (!row.imgPath) {
      continue;
    }
    let entry = byUrl.get(row.imgPath);
    if (!entry) {
      entry = { mealIds: new Set(), dates: new Set() };
      byUrl.set(row.imgPath, entry);
    }
    entry.mealIds.add(row.mealId);
    entry.dates.add(toIsoDay(row.date));
  }

  const dates = new Set<string>();
  const mealIds = new Set<string>();
  let created = 0;
  let failed = 0;
  // nacheinander: Bildberechnung soll laufende Requests nicht ausbremsen
  for (const [url, entry] of byUrl) {
    const { result, error } = await store.ensure(url);
    if (result === "created") {
      created += 1;
      for (const d of entry.dates) {
        dates.add(d);
      }
      for (const id of entry.mealIds) {
        mealIds.add(id);
      }
    } else if (result === "failed") {
      failed += 1;
      logError({
        message: "Image variants failed",
        ctx: { url, error },
        disableTelegram: true,
      });
    }
  }

  return {
    changedDates: [...dates].sort(),
    changedMealIds: [...mealIds].sort(),
    created,
    failed,
  };
}
