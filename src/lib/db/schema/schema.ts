import {
  type AnyPgColumn,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { ID_LENGTH, timeStampUtils, uuid } from "../utils";
import { dataSource } from "./data-source";
import { mealChangeField } from "./enums";
import { syncRun } from "./sync-run";

export const user = pgTable(
  "user",
  {
    ...uuid,
    ipHash: varchar("ip_hash", { length: 255 }).notNull(),
    cookieHash: varchar("cookie_hash", { length: 255 }),
    ...timeStampUtils,
  },
  // Lookup per IP-Hash bei Bewertungen (getUserId/getOrCreateUser)
  (table) => [index("user_ip_hash_idx").on(table.ipHash)]
);

// Mensa table
export const mensa = pgTable("mensa", {
  ...uuid,
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  ...timeStampUtils,
});
// Meal table
export const meal = pgTable(
  "meal",
  {
    ...uuid,
    srcId: varchar("src_id", { length: ID_LENGTH }).notNull(),
    dataSourceSlug: varchar("data_source_slug", { length: ID_LENGTH })
      .notNull()
      .references(() => dataSource.slug, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    subtitle: varchar("subtitle", { length: 255 }).notNull().default(""),
    imgPath: varchar("img_path", { length: 500 }),
    priceStud: integer("price_stud").notNull(),
    priceWork: integer("price_work").notNull(),
    priceGuest: integer("price_guest").notNull(),
    ...timeStampUtils,
  },
  (t) => [
    uniqueIndex("meal_unique").on(
      t.name,
      t.dataSourceSlug,
      t.subtitle,
      t.imgPath
    ),
    uniqueIndex("meal_src_id_unique").on(t.srcId, t.dataSourceSlug),
  ]
);

/** Preise in Cent, wie in `meal` */
export type MealPrices = { stud: number; work: number; guest: number };

/**
 * Änderungen an Gerichten durch den Sync. `prev`/`next`: Text, bei `price`
 * ein `MealPrices`-Objekt, bei `ingredients`/`extras` eine Liste; diese
 * gehören zu einer Ausgabe (`mensa_meal_id`, null nach deren Löschen).
 */
export const mealChange = pgTable(
  "meal_change",
  {
    ...uuid,
    mealId: varchar("meal_id", { length: ID_LENGTH })
      .notNull()
      .references(() => meal.id, { onDelete: "cascade" }),
    syncRunId: varchar("sync_run_id", { length: ID_LENGTH }).references(
      () => syncRun.id,
      { onDelete: "set null" }
    ),
    mensaMealId: varchar("mensa_meal_id", { length: ID_LENGTH }).references(
      (): AnyPgColumn => mensaMeal.id,
      { onDelete: "set null" }
    ),
    field: mealChangeField("field").notNull(),
    prev: jsonb("prev").$type<string | string[] | MealPrices>().notNull(),
    next: jsonb("next").$type<string | string[] | MealPrices>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("meal_change_meal_id_idx").on(t.mealId),
    index("meal_change_sync_run_id_idx").on(t.syncRunId),
  ]
);

/**
 * Ausgaben, die der Sync entfernt hat, weil die API sie nicht mehr liefert
 * (die Zeile in `mensa_meal` ist danach weg). `mensa_id` fehlt bei
 * migrierten Altdaten.
 */
export const servingRemoval = pgTable(
  "serving_removal",
  {
    ...uuid,
    mealId: varchar("meal_id", { length: ID_LENGTH })
      .notNull()
      .references(() => meal.id, { onDelete: "cascade" }),
    mensaId: varchar("mensa_id", { length: ID_LENGTH }).references(
      () => mensa.id,
      { onDelete: "set null" }
    ),
    date: date("date").notNull(),
    syncRunId: varchar("sync_run_id", { length: ID_LENGTH }).references(
      () => syncRun.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("serving_removal_meal_id_idx").on(t.mealId),
    index("serving_removal_sync_run_id_idx").on(t.syncRunId),
  ]
);

// MensaMeal junction table
export const mensaMeal = pgTable(
  "mensa_meal",
  {
    ...uuid,
    mensaId: varchar("mensa_id", { length: ID_LENGTH })
      .notNull()
      .references(() => mensa.id, { onDelete: "cascade" }),
    mealId: varchar("meal_id", { length: ID_LENGTH })
      .notNull()
      .references(() => meal.id, { onDelete: "cascade" }),
    date: timestamp("date").notNull(),
    ingredients: text("ingredients").array().notNull().default([]),
    extras: text("extras").array().notNull().default([]),
    ...timeStampUtils,
  },
  (table) => [
    uniqueIndex("mensa_meal_unique_idx").on(
      table.mensaId,
      table.mealId,
      table.date
    ),
    index("mensa_meal_date_idx").on(table.date),
    index("mensa_meal_mensa_id_idx").on(table.mensaId),
    // Detailseite (neueste Ausgabe) und Angebotshistorie eines Gerichts
    index("mensa_meal_meal_id_date_idx").on(table.mealId, table.date),
  ]
);

// MealRating table
export const mealRating = pgTable(
  "meal_rating",
  {
    ...uuid,
    mealId: varchar("meal_id", { length: ID_LENGTH })
      .notNull()
      .references(() => meal.id, { onDelete: "cascade" }),
    mensaMealId: varchar("mensa_meal_id", { length: ID_LENGTH })
      .notNull()
      .references(() => mensaMeal.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: ID_LENGTH })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    value: integer("value").notNull(),
    value_price: integer("value_price"),
    value_quantity: integer("value_quantity"),
    value_taste: integer("value_taste"),
    comment: text("comment"),
    ...timeStampUtils,
  },
  (table) => [
    uniqueIndex("meal_rating_meal_user_idx").on(table.mealId, table.userId),
  ]
);
