/** Ernährungs-Badges der Gerichte (Farben: `.ib-<typ>` in styles/meal.css) */
export type IngredientType = "vegan" | "veggie" | "meat" | "fish" | "notVeggie";

export const INGREDIENT_LABELS: Record<IngredientType, string> = {
  vegan: "Vegan",
  veggie: "Vegetarisch",
  meat: "Fleisch",
  fish: "Fisch",
  notVeggie: "Tierischer Lab",
};

/** Welche Badges ein Gericht zeigt, in fester Reihenfolge */
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
