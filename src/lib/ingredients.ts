/** Darstellung der Ernährungs-Badges (gemeinsam für React-Islands und Astro) */
export type IngredientType = "vegan" | "veggie" | "meat" | "fish" | "notVeggie";

export const INGREDIENT_STYLES: Record<
  IngredientType,
  { tailwind: string; label: string; chartColor: string }
> = {
  vegan: {
    tailwind:
      "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 border border-green-200 dark:border-green-800",
    label: "Vegan",
    chartColor: "#16a34a", // green-600
  },
  veggie: {
    tailwind:
      "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800",
    label: "Vegetarisch",
    chartColor: "#ca8a04", // yellow-600
  },
  meat: {
    tailwind:
      "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400 border border-red-200 dark:border-red-800",
    label: "Fleisch",
    chartColor: "#dc2626", // red-600
  },
  fish: {
    tailwind:
      "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400 border border-blue-200 dark:border-blue-800",
    label: "Fisch",
    chartColor: "#2563eb", // blue-600
  },
  notVeggie: {
    tailwind:
      "bg-gray-50 text-gray-700 dark:bg-gray-950 dark:text-gray-400 border border-gray-200 dark:border-gray-800",
    label: "Tierischer Lab",
    chartColor: "#525252", // gray-600
  },
};

/** Welche Badges eine Karte zeigt (Reihenfolge wie bisher) */
export function visibleIngredientTypes(flags: MealFlags): IngredientType[] {
  const { isVegan, isVeggie, containsMeat, containsFish, notVeggie } = flags;
  const entries: [IngredientType, boolean | undefined][] = [
    ["vegan", isVegan],
    ["veggie", isVeggie && !isVegan],
    ["meat", containsMeat],
    ["fish", containsFish],
    ["notVeggie", notVeggie && !containsMeat],
  ];
  return entries.filter(([, show]) => show).map(([type]) => type);
}

export const INGREDIENT_BADGE_BASE =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-xs";
