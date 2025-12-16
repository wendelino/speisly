import { logError } from "@/actions/error";
import { getMealsBySrcIDs } from "@/actions/meals";
import { createMensa, getAllMensen } from "@/actions/mensa";
import {
  getExistingMensaMeals,
  getOrCreateDataSource,
  getOrCreateMeal,
  getOrCreateMensaMeal,
} from "./db";
import getMealData from "./meine-mensa";
import type {
  DateRange,
  MealAvailability,
  MealData,
  MensaMealRecord,
  MensaRecord,
} from "./types";
import { DATA_SOURCE_NAME } from "./types";
import { formatPerformanceTime } from "./utils";

/**
 * Validates meal prices are not zero
 */
function hasValidPrices(mealData: MealData): boolean {
  return (
    mealData.priceStud !== 0 &&
    mealData.priceWork !== 0 &&
    mealData.priceGuest !== 0
  );
}

/**
 * Finds or creates a mensa record
 */
async function getOrCreateMensa(
  mensaSlug: string,
  mensaName: string,
  existingMensen: MensaRecord[]
): Promise<MensaRecord> {
  const existingMensa = existingMensen.find((m) => m.slug === mensaSlug);
  if (existingMensa) {
    return existingMensa;
  }

  const newMensa = await createMensa({
    name: mensaName,
    slug: mensaSlug,
  });

  existingMensen.push(newMensa);
  return newMensa;
}

/**
 * Finds an existing mensa meal by matching criteria
 */
function findExistingMensaMeal(
  existingMensaMeals: MensaMealRecord[],
  mealId: string,
  mensaId: string,
  date: string
): MensaMealRecord | undefined {
  const availabilityDate = new Date(date).toISOString();
  return existingMensaMeals.find(
    (mensaMeal) =>
      mensaMeal.mealId === mealId &&
      mensaMeal.mensaId === mensaId &&
      mensaMeal.date.toISOString() === availabilityDate
  );
}

/**
 * Processes a single meal's availability entries
 */
async function processMealAvailability(
  mealRecord: { id: string },
  availability: MealAvailability[],
  mensen: MensaRecord[],
  existingMensaMeals: MensaMealRecord[]
): Promise<void> {
  for (const avail of availability) {
    const mensaRecord = await getOrCreateMensa(
      avail.mensaSlug,
      avail.mensaName,
      mensen
    );

    const existingMensaMeal = findExistingMensaMeal(
      existingMensaMeals,
      mealRecord.id,
      mensaRecord.id,
      avail.date
    );

    await getOrCreateMensaMeal({
      mensaRecord,
      mealRecord,
      availability: {
        date: avail.date,
        ingredients: avail.ingredients,
        extras: avail.extras,
      },
      existing: existingMensaMeal,
    });
  }
}

/**
 * Processes a single meal data item
 */
async function processMeal({
  mealData,
  dataSourceSlug,
  existingMeals,
  mensen,
  existingMensaMeals,
}: {
  mealData: MealData;
  dataSourceSlug: string;
  existingMeals: Array<{
    id: string;
    srcId: string;
    name: string;
    imgPath: string | null;
    priceStud: number;
    priceWork: number;
    priceGuest: number;
    subtitle: string;
  }>;
  mensen: MensaRecord[];
  existingMensaMeals: MensaMealRecord[];
}): Promise<void> {
  if (!hasValidPrices(mealData)) {
    await logError({
      message: "Price is 0",
      ctx: { mealData },
    });
    return;
  }

  const initialMeal = existingMeals.find(
    (meal) => meal.srcId === mealData.src_id
  );

  const mealRecord = await getOrCreateMeal({
    mealData,
    dataSourceSlug,
    initialMeal: initialMeal
      ? {
          id: initialMeal.id,
          name: initialMeal.name,
          imgPath: initialMeal.imgPath,
          priceStud: initialMeal.priceStud,
          priceWork: initialMeal.priceWork,
          priceGuest: initialMeal.priceGuest,
          subtitle: initialMeal.subtitle,
        }
      : undefined,
  });

  if (!mealRecord) {
    return;
  }

  await processMealAvailability(
    mealRecord,
    mealData.availability,
    mensen,
    existingMensaMeals
  );
}

/**
 * Executes the cron job to sync meal data
 */
export async function handleSync(date: string | DateRange): Promise<void> {
  const start = performance.now();
  const { slug: dataSourceSlug } =
    await getOrCreateDataSource(DATA_SOURCE_NAME);
  const mensen = await getAllMensen();
  const { data, length: _l } = await getMealData({ date });

  const srcIds = data.map((item) => item.src_id);
  const meals = await getMealsBySrcIDs({ srcIds });
  const existingMensaMeals = await getExistingMensaMeals({ date });

  // console.log("Amount API: ", _l);
  // console.log("Amount DB : ", existingMensaMeals.length);

  for (const mealData of data) {
    await processMeal({
      mealData,
      dataSourceSlug,
      existingMeals: meals,
      mensen,
      existingMensaMeals,
    });
  }

  const timeTaken = Math.round(performance.now() - start);
  const formattedTime = formatPerformanceTime(timeTaken);
  console.log(`\n[DAL] Sync completed in ${formattedTime}`);
}
