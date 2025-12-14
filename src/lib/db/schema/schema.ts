import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { ID_LENGTH, timeStampUtils, uuid } from "../utils";
import { dataSource } from "./dataSource";

export const user = pgTable("user", {
  ...uuid,
  ipHash: varchar("ip_hash", { length: 255 }).notNull(),
  cookieHash: varchar("cookie_hash", { length: 255 }),
  ...timeStampUtils, // s s
});

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

export const mealUpdate = pgTable("meal_update", {
  ...uuid,
  mealId: varchar("meal_id", { length: ID_LENGTH })
    .notNull()
    .references(() => meal.id, { onDelete: "cascade" }),
  prev: text("prev").notNull(),
  new: text("new").notNull(),
  key: varchar("key", { length: 255 }).notNull(),
  ...timeStampUtils,
});
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

export const userRelations = relations(user, ({ many }) => ({
  mealRatings: many(mealRating),
}));

// Relations
export const mensaRelations = relations(mensa, ({ many }) => ({
  mensaMeals: many(mensaMeal),
}));

export const mealRelations = relations(meal, ({ many }) => ({
  ratings: many(mealRating),
  mensaMeals: many(mensaMeal),
  updates: many(mealUpdate),
}));

export const mensaMealRelations = relations(mensaMeal, ({ one }) => ({
  mensa: one(mensa, {
    fields: [mensaMeal.mensaId],
    references: [mensa.id],
  }),
  meal: one(meal, {
    fields: [mensaMeal.mealId],
    references: [meal.id],
  }),
}));

export const mealRatingRelations = relations(mealRating, ({ one }) => ({
  meal: one(meal, {
    fields: [mealRating.mealId],
    references: [meal.id],
  }),
  mensaMeal: one(mensaMeal, {
    fields: [mealRating.mensaMealId],
    references: [mensaMeal.id],
  }),
}));
