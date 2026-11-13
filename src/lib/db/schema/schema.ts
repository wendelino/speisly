import {
  type AnyPgColumn,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { ID_LENGTH, timeStampUtils, uuid } from "../utils";
import { dataSource } from "./data-source";
import { commentStatus, mealChangeField } from "./enums";
import { syncRun } from "./sync-run";

/**
 * Pseudonyme Nutzer des Bewertungssystems. Erkannt werden sie nur am
 * signierten Cookie (src/server/user.ts); `ip_hash` ist eine Notiz zur
 * Missbrauchserkennung und dient nicht der Wiedererkennung.
 */
export const user = pgTable("user", {
  ...uuid,
  ipHash: varchar("ip_hash", { length: 255 }).notNull(),
  ...timeStampUtils,
});

// Mensa table
export const mensa = pgTable("mensa", {
  ...uuid,
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  /** Sync-Lauf, der die Mensa angelegt hat (null: vor 0009 angelegt) */
  syncRunId: varchar("sync_run_id", { length: ID_LENGTH }).references(
    () => syncRun.id,
    { onDelete: "set null" }
  ),
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
    /** Sync-Lauf, der das Gericht angelegt hat (null: vor 0009 angelegt) */
    syncRunId: varchar("sync_run_id", { length: ID_LENGTH }).references(
      () => syncRun.id,
      { onDelete: "set null" }
    ),
    ...timeStampUtils,
  },
  (t) => [
    index("meal_sync_run_id_idx").on(t.syncRunId),
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
    /** Sync-Lauf, der die Ausgabe angelegt hat (null: vor 0009 angelegt) */
    syncRunId: varchar("sync_run_id", { length: ID_LENGTH }).references(
      () => syncRun.id,
      { onDelete: "set null" }
    ),
    ...timeStampUtils,
  },
  (table) => [
    index("mensa_meal_sync_run_id_idx").on(table.syncRunId),
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

/**
 * Bewertungen. Mensa und Tag der Ausgabe stehen in der Bewertung selbst
 * (`mensa_id`, `serving_date`): Entfernt der Sync die Ausgabe, weil die API
 * sie nicht mehr liefert, bleibt die Bewertung samt Aufschlüsselung erhalten
 * (`mensa_meal_id` wird dann NULL). Nur mit dem Gericht verschwindet sie.
 */
export const mealRating = pgTable(
  "meal_rating",
  {
    ...uuid,
    mealId: varchar("meal_id", { length: ID_LENGTH })
      .notNull()
      .references(() => meal.id, { onDelete: "cascade" }),
    /** bewertete Ausgabe, solange es sie gibt */
    mensaMealId: varchar("mensa_meal_id", { length: ID_LENGTH }).references(
      () => mensaMeal.id,
      { onDelete: "set null" }
    ),
    mensaId: varchar("mensa_id", { length: ID_LENGTH }).references(
      () => mensa.id,
      { onDelete: "set null" }
    ),
    /** Tag der bewerteten Ausgabe (wie `mensa_meal.date`) */
    servingDate: timestamp("serving_date").notNull(),
    userId: varchar("user_id", { length: ID_LENGTH })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    value: integer("value").notNull(),
    value_price: integer("value_price"),
    value_quantity: integer("value_quantity"),
    value_taste: integer("value_taste"),
    comment: text("comment"),
    /** Kommentare erscheinen erst nach Freigabe im Admin (/admin/comments) */
    commentStatus: commentStatus("comment_status"),
    commentModeratedAt: timestamp("comment_moderated_at", {
      withTimezone: true,
    }),
    ...timeStampUtils,
  },
  (table) => [
    uniqueIndex("meal_rating_meal_user_idx").on(table.mealId, table.userId),
    index("meal_rating_comment_status_idx").on(table.commentStatus),
    index("meal_rating_mensa_meal_id_idx").on(table.mensaMealId),
  ]
);

/**
 * „Gefällt mir“ an freigegebenen Kommentaren (eine Bewertung mit Kommentar).
 * Ein Like je Nutzer und Kommentar; eigene Kommentare kann man nicht liken.
 */
export const commentLike = pgTable(
  "comment_like",
  {
    ratingId: varchar("rating_id", { length: ID_LENGTH })
      .notNull()
      .references(() => mealRating.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: ID_LENGTH })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ratingId, table.userId] }),
    index("comment_like_user_id_idx").on(table.userId),
  ]
);

/**
 * Web-Push-Abos für „Favorit morgen auf dem Plan“ (src/server/push.ts).
 * Unabhängig vom Nutzer-Cookie: das Abo selbst ist die Einwilligung. Die
 * Favoriten (Gericht-IDs) und die gewählten Mensen (leer = alle) schickt
 * der Browser bei jeder Änderung mit.
 */
export const pushSubscription = pgTable("push_subscription", {
  ...uuid,
  endpoint: text("endpoint").notNull().unique(),
  p256dh: varchar("p256dh", { length: 255 }).notNull(),
  auth: varchar("auth", { length: 255 }).notNull(),
  favorites: varchar("favorites", { length: ID_LENGTH })
    .array()
    .notNull()
    .default([]),
  mensaIds: varchar("mensa_ids", { length: ID_LENGTH })
    .array()
    .notNull()
    .default([]),
  /** Tag (`YYYY-MM-DD`), für den zuletzt benachrichtigt wurde (keine Doppelten) */
  lastNotifiedFor: date("last_notified_for"),
  ...timeStampUtils,
});
