import { logError } from "@/actions/error";
import type {
  GetMealDataParams,
  GetMealDataResult,
  Location,
  MealData,
  MeineMensaFoodPlanItem,
  MeineMensaResponse,
  MeineMensaResponseMeta,
} from "./types";
import { MEAL_SRC_ID_MAPPINGS, MEINE_MENSA_BASE_URL } from "./types";
import { fetchJson, normalizeDateRange, normalizeSrcId, toSlug } from "./utils";

const MAX_FOOD_PLANS = 999;

/**
 * Fetches food plans from the Meine Mensa API
 */
function fetchFoodPlans(
  dateFrom: string,
  dateTo: string,
  locationId?: string
): Promise<MeineMensaResponse> {
  const params = new URLSearchParams();
  params.set("date_from", dateFrom);
  params.set("date_to", dateTo);
  if (locationId) {
    params.set("location_id", locationId);
  }
  const url = `${MEINE_MENSA_BASE_URL}/food_plans?${params}`;
  return fetchJson<MeineMensaResponse>(url);
}

/**
 * Fetches all locations from the Meine Mensa API
 */
function getLocations(): Promise<Location[]> {
  const url = `${MEINE_MENSA_BASE_URL}/locations`;
  return fetchJson<Location[]>(url);
}

/**
 * Transforms ingredient codes into human-readable format
 */
function transformIngredients(
  ingredients: string[],
  meta: MeineMensaResponseMeta
): string[] {
  return ingredients.map(
    (ingredient) =>
      `${ingredient}:${meta.ingredients[ingredient] ?? meta.markers[ingredient] ?? "Unbekannt"}`
  );
}

/**
 * Extracts extras from food data, filtering out empty values
 */
function extractExtras(food: MeineMensaFoodPlanItem["food"]): string[] {
  return [food.extra_1, food.extra_2, food.extra_3, food.extra_4].filter(
    (extra): extra is string => Boolean(extra)
  );
}

/**
 * Creates a new meal data entry from food data
 */
function createMealDataFromFood(
  food: MeineMensaFoodPlanItem["food"],
  foodId: number
): MealData {
  const srcId = normalizeSrcId(foodId, MEAL_SRC_ID_MAPPINGS);

  return {
    src_id: srcId,
    name: food.name ?? "unbekannt",
    subtitle: food.name_2 ?? "",
    imgPath: food.image_url,
    priceStud: food.price_1,
    priceWork: food.price_2,
    priceGuest: food.price_3,
    availability: [],
  };
}

/**
 * Adds availability information to a meal
 */
async function addAvailabilityToMeal(
  mealData: MealData,
  item: MeineMensaFoodPlanItem,
  locations: Location[],
  meta: MeineMensaResponseMeta
) {
  const mensaInfo = locations.find(
    (location) => location.id === item.location_id
  );

  if (!mensaInfo) {
    const { food: _unused, ...rest } = item;
    await logError({
      message: "Mensa not found",
      ctx: rest,
    });
    return;
  }
  const EXCLUDED_LOCATION_IDS = [7, 8, 13, 16, 22] as const;
  const id = mensaInfo.id;
  if (
    EXCLUDED_LOCATION_IDS.includes(id as (typeof EXCLUDED_LOCATION_IDS)[number])
  ) {
    return;
  }

  const ingredients = transformIngredients(item.food.ingredients, meta);
  const extras = extractExtras(item.food);

  mealData.availability.push({
    date: item.date,
    src_mensaId: String(mensaInfo.id),
    mensaSlug: toSlug(mensaInfo.name),
    mensaName: mensaInfo.name,
    ingredients,
    extras,
  });
}

/**
 * Maps API response to internal meal data format
 */
async function existingMeals(
  foodPlans: MeineMensaResponse,
  locations: Location[]
): Promise<MealData[]> {
  const mealMap = new Map<number, MealData>();

  for (const item of foodPlans.data) {
    const foodId = item.food.id;

    if (!mealMap.has(foodId)) {
      mealMap.set(foodId, createMealDataFromFood(item.food, foodId));
    }

    const mealData = mealMap.get(foodId)!;
    await addAvailabilityToMeal(mealData, item, locations, foodPlans.meta);
  }

  return Array.from(mealMap.values());
}

/**
 * Validates food plans data and returns error if invalid
 */
function validateFoodPlans(foodPlans: MeineMensaResponse): {
  isValid: boolean;
  error?: string;
} {
  if (foodPlans.data.length === 0) {
    return { isValid: false, error: "No food plans found" };
  }

  if (foodPlans.data.length > MAX_FOOD_PLANS) {
    return {
      isValid: false,
      error: "Too many food plans found",
    };
  }

  return { isValid: true };
}

/**
 * Fetches meal data from the Meine Mensa API
 */
export default async function getMealData({
  date,
  locationId,
}: GetMealDataParams): Promise<GetMealDataResult> {
  const { from: dateFrom, to: dateTo } = normalizeDateRange(date);

  const foodPlans = await fetchFoodPlans(dateFrom, dateTo, locationId);

  const validation = validateFoodPlans(foodPlans);
  if (!validation.isValid) {
    if (validation.error === "Too many food plans found") {
      await logError({
        message: validation.error,
        ctx: { dateFrom, dateTo, locationId },
      });
    }
    return { data: [], length: 0 };
  }

  const locations = await getLocations();
  locations.push({ id: 20, name: "unbekannt" }); // API ist nicht korrekt und gibt keine Location für id 20 zurück
  const meals = await existingMeals(foodPlans, locations);

  return {
    data: meals,
    length: meals.flatMap((meal) => meal.availability).length,
  };
}
