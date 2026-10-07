import { logError } from "../log";
import { getVisibleMensen, listMensen } from "../queries/mensen";
import {
  applySyncPlan,
  getExistingMensaMeals,
  getMealsBySrcIds,
  getOrCreateDataSource,
} from "./db";
import getMealData from "./meine-mensa";
import { planSync } from "./plan";
import type { DateRange } from "./types";
import { DATA_SOURCE_NAME } from "./types";
import { formatPerformanceTime } from "./utils";

/** Was ein Sync geändert hat – Grundlage für die gezielte Cache-Invalidierung */
export type SyncResult = {
  /** Tage (`YYYY-MM-DD`), deren Speiseplan sich geändert hat */
  changedDates: string[];
  /** Gerichte mit neuen/entfernten Ausgaben oder geänderten Daten */
  changedMealIds: string[];
};

/**
 * Gleicht den Speiseplan im Zeitraum mit meine-mensa.de ab.
 *
 * Ablauf: API und bestehende Daten lesen (3 Queries), Änderungen im Speicher
 * planen (./plan.ts), dann alles in einer Transaktion schreiben (./db.ts).
 */
export async function handleSync(
  date: string | DateRange,
  /** `allowMassRemoval`: Notbremse aus plan.ts übergehen (`?force=1`) */
  options: { allowMassRemoval?: boolean } = {}
): Promise<SyncResult> {
  const start = performance.now();
  const { slug: dataSourceSlug } =
    await getOrCreateDataSource(DATA_SOURCE_NAME);
  const { data, dates: apiDates } = await getMealData({ date });

  const [mensen, existingMeals, existingServings] = await Promise.all([
    listMensen(),
    getMealsBySrcIds(data.map((item) => item.src_id)),
    getExistingMensaMeals({ date }),
  ]);

  const plan = planSync({
    data,
    dataSourceSlug,
    mensen,
    existingMeals,
    existingServings,
    apiDates: new Set(apiDates),
    allowMassRemoval: options.allowMassRemoval,
  });
  for (const mealData of plan.invalidMeals) {
    logError({
      message: "Price is 0",
      ctx: { mealData },
      disableTelegram: true,
    });
  }
  if (plan.removedServings.length > 0) {
    console.warn("Meals in DB but not in API: ", plan.removedServings.length);
  }
  if (plan.massRemoval) {
    // mit Telegram: hier muss jemand nachsehen
    logError({
      message: `Sync: ${plan.massRemoval.wouldRemove} von ${plan.massRemoval.existing} Ausgaben würden entfernt – Notbremse, nichts entfernt. Prüfen und ggf. /api/sync?force=1`,
      ctx: { date, massRemoval: plan.massRemoval },
    });
  }
  const keptRated = plan.keptServings.filter((k) => k.reason === "rated");
  if (keptRated.length > 0) {
    logError({
      message:
        "Sync: bewertete Ausgaben fehlen in der API und bleiben erhalten",
      ctx: { date, servings: keptRated.map((k) => k.serving.id) },
      disableTelegram: true,
    });
  }

  const { dates, mealIds, newMensen } = await applySyncPlan(plan);
  if (newMensen > 0) {
    getVisibleMensen.clear();
  }

  const formattedTime = formatPerformanceTime(
    Math.round(performance.now() - start)
  );
  console.log(
    `\n[DAL] Sync completed in ${formattedTime} (${plan.newMeals.length} new meals, ${plan.mealChanges.length} changed, ${plan.newServings.length} new / ${plan.removedServings.length} removed servings, ${plan.keptServings.length} kept)`
  );

  return {
    changedDates: [...dates].sort(),
    changedMealIds: [...mealIds].sort(),
  };
}
