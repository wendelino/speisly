import { logError } from "../log";
import { getVisibleMensen, listMensen } from "../queries/mensen";
import { applySyncPlan, getExistingMensaMeals, getMealsBySrcIds } from "./db";
import getMealData from "./meine-mensa";
import { planSync } from "./plan";
import type { DateRange } from "./types";
import { DATA_SOURCE_SLUG } from "./types";
import { formatPerformanceTime } from "./utils";

/** Was ein Sync geändert hat – Grundlage für die gezielte Cache-Invalidierung */
export type SyncResult = {
  /** Tage (`YYYY-MM-DD`), deren Speiseplan sich geändert hat */
  changedDates: string[];
  /** Gerichte mit neuen/entfernten Ausgaben oder geänderten Daten */
  changedMealIds: string[];
};

/** Zahlen eines Daten-Syncs für das Protokoll (src/server/sync-runs.ts) */
export type SyncStats = {
  newMeals: number;
  changedMeals: number;
  newServings: number;
  changedServings: number;
  removedServings: number;
  keptServings: number;
  massRemoval: boolean;
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
): Promise<SyncResult & { stats: SyncStats }> {
  const start = performance.now();
  const { data, dates: apiDates } = await getMealData({ date });

  const [mensen, existingMeals, existingServings] = await Promise.all([
    listMensen(),
    getMealsBySrcIds(data.map((item) => item.src_id)),
    getExistingMensaMeals({ date }),
  ]);

  const plan = planSync({
    data,
    dataSourceSlug: DATA_SOURCE_SLUG,
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
      source: "sync",
      level: "warn",
      notify: false,
    });
  }
  if (plan.removedServings.length > 0) {
    console.warn("Meals in DB but not in API: ", plan.removedServings.length);
  }
  if (plan.massRemoval) {
    // sofort per Telegram: hier muss jemand nachsehen (Zahlen im ctx)
    logError({
      message:
        "Notbremse: zu viele Ausgaben würden entfernt, nichts entfernt. Prüfen und ggf. /api/sync?force=1",
      ctx: { date, massRemoval: plan.massRemoval },
      source: "sync",
      notify: "immediate",
    });
  }
  const keptRated = plan.keptServings.filter((k) => k.reason === "rated");
  if (keptRated.length > 0) {
    logError({
      message:
        "Sync: bewertete Ausgaben fehlen in der API und bleiben erhalten",
      ctx: { date, servings: keptRated.map((k) => k.serving.id) },
      source: "sync",
      level: "warn",
      notify: false,
    });
  }

  const { dates, mealIds, newMensen, counts } = await applySyncPlan(plan);
  if (newMensen > 0) {
    getVisibleMensen.clear();
  }

  const formattedTime = formatPerformanceTime(
    Math.round(performance.now() - start)
  );
  console.log(
    `\n[DAL] Sync completed in ${formattedTime} (${plan.newMeals.length} new meals, ${plan.mealChanges.length} changed, ${plan.newServings.length} new / ${plan.servingChanges.length} changed / ${plan.removedServings.length} removed servings, ${plan.keptServings.length} kept)`
  );

  return {
    changedDates: [...dates].sort(),
    changedMealIds: [...mealIds].sort(),
    stats: {
      ...counts,
      keptServings: plan.keptServings.length,
      massRemoval: plan.massRemoval !== null,
    },
  };
}
