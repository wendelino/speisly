const I_MAP = {
  vegan: "52",
  veggie: "51",
  schwein: "45",
  rind: "46",
  gefluegel: "47",
  fisch: "48",
  tierischerLab: "67",
};
const SMALL_MEAL_REGEX = /(100\s*g|vom Büfett)/i;
export function generateFlags(meal: {
  name: string;
  subtitle: string;
  ingredients: string[];
}): MealFlags {
  const flags: MealFlags = {
    isSmall: SMALL_MEAL_REGEX.test(meal.name + meal.subtitle),
  };

  for (const ingredient of meal.ingredients) {
    const ing = ingredient.toLowerCase();
    if (ing.includes(I_MAP.vegan)) {
      flags.isVegan = true;
      flags.isVeggie = true;
      continue;
    }
    if (ing.includes(I_MAP.veggie)) {
      flags.isVeggie = true;
      continue;
    }
    if (
      ing.includes(I_MAP.schwein) ||
      ing.includes(I_MAP.rind) ||
      ing.includes(I_MAP.gefluegel)
    ) {
      flags.containsMeat = true;
      continue;
    }
    if (ing.includes(I_MAP.fisch)) {
      flags.containsFish = true;
      continue;
    }
    if (ing.includes(I_MAP.tierischerLab)) {
      flags.notVeggie = true;
    }
  }
  return flags;
}

export function transformMeal(meal: DB_Meal): Meal {
  const flags: MealFlags = generateFlags(meal);

  return { ...meal, flags };
}
