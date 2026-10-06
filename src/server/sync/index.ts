import { toIsoDay } from "../dates";
import { logError } from "../log";
import { createMensa, listMensen } from "../queries/mensen";
import {
  getExistingMensaMeals,
  getMealsBySrcIds,
  getOrCreateDataSource,
  getOrCreateMeal,
  getOrCreateMensaMeal,
  removeMeals,
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

/** Was ein Sync geändert hat – Grundlage für die gezielte Cache-Invalidierung */
export type SyncResult = {
  /** Tage (`YYYY-MM-DD`), deren Speiseplan sich geändert hat */
  changedDates: string[];
  /** Gerichte mit neuen/entfernten Ausgaben oder geänderten Daten */
  changedMealIds: string[];
};

type SyncChanges = { dates: Set<string>; mealIds: Set<string> };

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
  const out = existingMensaMeals.find(
    (mensaMeal) =>
      mensaMeal.mealId === mealId &&
      mensaMeal.mensaId === mensaId &&
      mensaMeal.date.toISOString() === availabilityDate
  );

  if (out) {
    existingMensaMeals.splice(existingMensaMeals.indexOf(out), 1);
  }

  return out;
}

/**
 * Processes a single meal's availability entries
 */
async function processMealAvailability({
  mealRecord,
  availability,
  mensen,
  existingMensaMeals,
  changes,
}: {
  mealRecord: { id: string };
  availability: MealAvailability[];
  mensen: MensaRecord[];
  existingMensaMeals: MensaMealRecord[];
  changes: SyncChanges;
}): Promise<void> {
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

    const created = await getOrCreateMensaMeal({
      mensaRecord,
      mealRecord,
      availability: {
        date: avail.date,
        ingredients: avail.ingredients,
        extras: avail.extras,
      },
      existing: existingMensaMeal,
    });
    if (created) {
      changes.dates.add(toIsoDay(new Date(avail.date)));
      changes.mealIds.add(mealRecord.id);
    }
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
  changes,
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
  changes: SyncChanges;
}): Promise<void> {
  if (!hasValidPrices(mealData)) {
    logError({
      message: "Price is 0",
      ctx: { mealData },
      disableTelegram: true,
    });
    return;
  }

  const initialMeal = existingMeals.find(
    (meal) => meal.srcId === mealData.src_id
  );

  const mealRecord = await getOrCreateMeal(
    {
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
    },
    (mealId) => {
      // Name/Preis/Bild geändert: alle Tage dieses Syncs mit dem Gericht
      changes.mealIds.add(mealId);
      for (const avail of mealData.availability) {
        changes.dates.add(toIsoDay(new Date(avail.date)));
      }
    }
  );

  if (!mealRecord) {
    return;
  }

  await processMealAvailability({
    mealRecord,
    availability: mealData.availability,
    mensen,
    existingMensaMeals,
    changes,
  });
}

/**
 * Executes the cron job to sync meal data
 */
export async function handleSync(
  date: string | DateRange
): Promise<SyncResult> {
  const start = performance.now();
  const changes: SyncChanges = { dates: new Set(), mealIds: new Set() };
  const { slug: dataSourceSlug } =
    await getOrCreateDataSource(DATA_SOURCE_NAME);
  const mensen = await listMensen();
  const { data, length: _l } = await getMealData({ date });

  const srcIds = data.map((item) => item.src_id);
  const meals = await getMealsBySrcIds(srcIds);
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
      changes,
    });
  }

  if (existingMensaMeals.length > 0) {
    console.warn("Meals in DB but not in API: ", existingMensaMeals.length);
    await removeMeals(existingMensaMeals);
    for (const removed of existingMensaMeals) {
      changes.dates.add(toIsoDay(removed.date));
      changes.mealIds.add(removed.mealId);
    }
  }

  const timeTaken = Math.round(performance.now() - start);
  const formattedTime = formatPerformanceTime(timeTaken);
  console.log(`\n[DAL] Sync completed in ${formattedTime}`);

  return {
    changedDates: [...changes.dates].sort(),
    changedMealIds: [...changes.mealIds].sort(),
  };
}
