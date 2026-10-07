/**
 * Cache-Tags für den Route Cache (siehe docs/astro-migration-plan.md §2.3).
 * Zentral definiert, damit Seiten, Islands und Invalidierung dieselben Namen nutzen.
 */
export const TAG = {
  /** Alles, was vom aktuellen Speiseplan abhängt */
  meals: "meals",
  /** Die Startseite `/` */
  home: "home",
  /** `/day/YYYY-MM-DD` (und `/`, wenn heute) */
  day: (isoDay: string) => `day:${isoDay}`,
  /** Shell der Detailseite `/meal/[id]` */
  meal: (mealId: string) => `meal:${mealId}`,
  /** Server Island „Angebotshistorie“ */
  mealStats: (mealId: string) => `meal-stats:${mealId}`,
  /** Server Island „Bewertungsübersicht“ */
  ratings: (mealId: string) => `ratings:${mealId}`,
} as const;
