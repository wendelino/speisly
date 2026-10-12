import { MEINE_MENSA_API_URL } from "astro:env/server";
import { toIsoDay } from "@/lib/dates";
import { logError } from "../log";
import type {
  GetMealDataParams,
  GetMealDataResult,
  Location,
  MealData,
  MeineMensaFoodPlanItem,
  MeineMensaResponse,
  MeineMensaResponseMeta,
} from "./types";
import { MEAL_SRC_ID_MAPPINGS } from "./types";
import { fetchJson, normalizeDateRange, normalizeSrcId, toSlug } from "./utils";

const MAX_FOOD_PLANS = 999;
/** Standorte der API, die keine Mensen im Sinne von Speisly sind */
const EXCLUDED_LOCATION_IDS = new Set([7, 8, 13, 16, 22]);
/** aus der Umgebung (MEINE_MENSA_API_URL), ohne „/“ am Ende */
const API_URL = MEINE_MENSA_API_URL.replace(/\/+$/, "");

/**
 * Fetches food plans from the Meine Mensa API
 */
function fetchFoodPlans(
  dateFrom: string,
  dateTo: string
): Promise<MeineMensaResponse> {
  const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  return fetchJson<MeineMensaResponse>(`${API_URL}/food_plans?${params}`);
}

/**
 * Fetches all locations from the Meine Mensa API
 */
function getLocations(): Promise<Location[]> {
  return fetchJson<Location[]>(`${API_URL}/locations`);
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
function addAvailabilityToMeal(
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
    logError({
      message: "Mensa not found",
      ctx: rest,
    });
    return;
  }
  if (EXCLUDED_LOCATION_IDS.has(mensaInfo.id)) {
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
function toMealData(
  foodPlans: MeineMensaResponse,
  locations: Location[]
): MealData[] {
  const mealMap = new Map<number, MealData>();

  for (const item of foodPlans.data) {
    const foodId = item.food.id;

    if (!mealMap.has(foodId)) {
      mealMap.set(foodId, createMealDataFromFood(item.food, foodId));
    }

    const mealData = mealMap.get(foodId)!;
    addAvailabilityToMeal(mealData, item, locations, foodPlans.meta);
  }

  return Array.from(mealMap.values());
}

/**
 * Fetches meal data from the Meine Mensa API. Leere und verdächtig große
 * Antworten (> MAX_FOOD_PLANS) ergeben keine Daten.
 */
export default async function getMealData({
  date,
}: GetMealDataParams): Promise<GetMealDataResult> {
  const { from: dateFrom, to: dateTo } = normalizeDateRange(date);

  const foodPlans = await fetchFoodPlans(dateFrom, dateTo);
  const count = foodPlans.data.length;
  if (count === 0 || count > MAX_FOOD_PLANS) {
    if (count > MAX_FOOD_PLANS) {
      logError({
        message: "Too many food plans found",
        ctx: { dateFrom, dateTo, count },
      });
    }
    return { data: [], dates: [] };
  }

  const locations = await getLocations();
  locations.push({ id: 20, name: "unbekannt" }); // API ist nicht korrekt und gibt keine Location für id 20 zurück
  const meals = toMealData(foodPlans, locations);

  return {
    data: meals,
    dates: [
      ...new Set(foodPlans.data.map((item) => toIsoDay(new Date(item.date)))),
    ].sort(),
  };
}
