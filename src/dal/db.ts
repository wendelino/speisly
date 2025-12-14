import { and, eq, gte, lte } from "drizzle-orm";
import { logError } from "@/actions/error";
import { db } from "@/lib/db";
import { dataSource } from "@/lib/db/schema/dataSource";
import { meal, mealUpdate, mensaMeal } from "@/lib/db/schema/schema";
import { genId } from "@/lib/db/utils";
import type {
  DataSourceRecord,
  GetExistingMensaMealsParams,
  GetOrCreateMealParams,
  GetOrCreateMensaMealParams,
  MealRecord,
  MealUpdateLog,
  MensaMealRecord,
} from "./types";
import { normalizeDateRange, toSlug } from "./utils";

/**
 * Gets an existing data source or creates a new one
 */
export async function getOrCreateDataSource(
  name: string
): Promise<DataSourceRecord> {
  const existingSource = await db
    .select({ slug: dataSource.slug })
    .from(dataSource)
    .where(eq(dataSource.name, name))
    .limit(1);

  if (existingSource.length > 0) {
    return existingSource[0];
  }

  const newDataSourceId = genId();
  const newDataSource = await db
    .insert(dataSource)
    .values({
      id: newDataSourceId,
      name,
      slug: toSlug(name),
    })
    .returning({ slug: dataSource.slug });

  return newDataSource[0];
}

/**
 * Finds an existing meal by source ID
 */
async function findMealBySrcId(srcId: string): Promise<MealRecord | null> {
  const result = await db
    .select({
      name: meal.name,
      id: meal.id,
      imgPath: meal.imgPath,
      priceStud: meal.priceStud,
      priceWork: meal.priceWork,
      priceGuest: meal.priceGuest,
      subtitle: meal.subtitle,
    })
    .from(meal)
    .where(eq(meal.srcId, srcId))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Converts price from decimal to cents
 */
function convertPriceToCents(price: number): number {
  return Math.round(price * 100);
}

/**
 * Detects changes between existing meal and new meal data
 */
function detectMealChanges(
  existing: MealRecord,
  newData: GetOrCreateMealParams["mealData"]
): {
  logs: MealUpdateLog[];
  updateFields: Partial<typeof meal.$inferSelect>;
} {
  const logs: MealUpdateLog[] = [];
  const updateFields: Partial<typeof meal.$inferSelect> = {};

  if (existing.imgPath !== newData.imgPath) {
    logs.push({
      prev: existing.imgPath ?? "",
      new: newData.imgPath ?? "",
      key: "imgPath",
    });
    updateFields.imgPath = newData.imgPath;
  }

  if (existing.name !== newData.name) {
    logs.push({
      prev: existing.name,
      new: newData.name,
      key: "name",
    });
    updateFields.name = newData.name;
  }

  if (existing.subtitle !== newData.subtitle) {
    logs.push({
      prev: existing.subtitle,
      new: newData.subtitle,
      key: "subtitle",
    });
    updateFields.subtitle = newData.subtitle;
  }

  const newPriceStud = convertPriceToCents(newData.priceStud);
  const newPriceWork = convertPriceToCents(newData.priceWork);
  const newPriceGuest = convertPriceToCents(newData.priceGuest);

  const pricesChanged =
    existing.priceStud !== newPriceStud ||
    existing.priceWork !== newPriceWork ||
    existing.priceGuest !== newPriceGuest;

  if (pricesChanged) {
    logs.push({
      prev: `${existing.priceStud} / ${existing.priceWork} / ${existing.priceGuest}`,
      new: `${newPriceStud} / ${newPriceWork} / ${newPriceGuest}`,
      key: "price",
    });
    updateFields.priceStud = newPriceStud;
    updateFields.priceWork = newPriceWork;
    updateFields.priceGuest = newPriceGuest;
  }

  return { logs, updateFields };
}

/**
 * Updates an existing meal with new data and logs changes
 */
async function updateMeal(
  mealId: string,
  logs: MealUpdateLog[],
  updateFields: Partial<typeof meal.$inferSelect>
): Promise<void> {
  if (logs.length === 0) {
    return;
  }

  await db.insert(mealUpdate).values(
    logs.map((log) => ({
      id: genId(),
      prev: log.prev,
      new: log.new,
      key: log.key,
      mealId,
    }))
  );

  await db.update(meal).set(updateFields).where(eq(meal.id, mealId));
}

/**
 * Creates a new meal record
 */
async function createMeal(
  mealData: GetOrCreateMealParams["mealData"],
  dataSourceSlug: string
): Promise<Pick<
  MealRecord,
  "id" | "imgPath" | "priceStud" | "priceWork" | "priceGuest"
> | null> {
  try {
    const newMeal = await db
      .insert(meal)
      .values({
        id: genId(),
        srcId: mealData.src_id,
        dataSourceSlug,
        name: mealData.name,
        subtitle: mealData.subtitle,
        imgPath: mealData.imgPath,
        priceStud: convertPriceToCents(mealData.priceStud),
        priceWork: convertPriceToCents(mealData.priceWork),
        priceGuest: convertPriceToCents(mealData.priceGuest),
      })
      .returning({
        id: meal.id,
        imgPath: meal.imgPath,
        priceStud: meal.priceStud,
        priceWork: meal.priceWork,
        priceGuest: meal.priceGuest,
      });

    return newMeal[0];
  } catch (error) {
    await logError({
      message: "Error creating meal",
      ctx: { mealData, error },
    });
    return null;
  }
}

/**
 * Gets an existing meal or creates a new one, updating if necessary
 */
export async function getOrCreateMeal({
  mealData,
  dataSourceSlug,
  initialMeal,
}: GetOrCreateMealParams): Promise<Pick<
  MealRecord,
  "id" | "imgPath" | "priceStud" | "priceWork" | "priceGuest"
> | null> {
  const existingMeal = initialMeal ?? (await findMealBySrcId(mealData.src_id));

  if (existingMeal) {
    const { logs, updateFields } = detectMealChanges(existingMeal, mealData);
    await updateMeal(existingMeal.id, logs, updateFields);

    return {
      id: existingMeal.id,
      imgPath: existingMeal.imgPath,
      priceStud: existingMeal.priceStud,
      priceWork: existingMeal.priceWork,
      priceGuest: existingMeal.priceGuest,
    };
  }

  return createMeal(mealData, dataSourceSlug);
}

/**
 * Finds an existing mensa meal by mensa, meal, and date
 */
async function findMensaMeal(
  mensaId: string,
  mealId: string,
  date: Date
): Promise<MensaMealRecord | null> {
  const result = await db
    .select()
    .from(mensaMeal)
    .where(
      and(
        eq(mensaMeal.mensaId, mensaId),
        eq(mensaMeal.mealId, mealId),
        eq(mensaMeal.date, date)
      )
    )
    .limit(1);

  return result[0] ?? null;
}

/**
 * Creates a new mensa meal entry
 */
async function createMensaMeal(
  props: typeof mensaMeal.$inferInsert
): Promise<void> {
  await db.insert(mensaMeal).values(props);
}

/**
 * Gets an existing mensa meal or creates a new one
 */
export async function getOrCreateMensaMeal({
  mensaRecord,
  mealRecord,
  availability,
  existing,
}: GetOrCreateMensaMealParams): Promise<void> {
  const availabilityDate = new Date(availability.date);
  const existingMensaMeal =
    existing ??
    (await findMensaMeal(mensaRecord.id, mealRecord.id, availabilityDate));

  if (!existingMensaMeal) {
    await createMensaMeal({
      id: genId(),
      mensaId: mensaRecord.id,
      mealId: mealRecord.id,
      date: availabilityDate,
      ingredients: availability.ingredients,
      extras: availability.extras,
    });
  }
}

/**
 * Gets all existing mensa meals within a date range
 */
export async function getExistingMensaMeals({
  date,
}: GetExistingMensaMealsParams): Promise<MensaMealRecord[]> {
  const { from, to } = normalizeDateRange(date);
  const existingMensaMeals = await db
    .select()
    .from(mensaMeal)
    .where(
      and(
        gte(mensaMeal.date, new Date(from)),
        lte(mensaMeal.date, new Date(to))
      )
    );

  return existingMensaMeals;
}
