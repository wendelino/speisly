import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { uuid } from "../utils";
import { syncScope, syncStatus } from "./enums";

/** Ein Aufruf von /api/sync mit Ergebnis (src/server/sync-runs.ts) */
export const syncRun = pgTable(
  "sync_run",
  {
    ...uuid,
    scope: syncScope("scope").notNull(),
    status: syncStatus("status").notNull().default("running"),
    rangeFrom: date("range_from"),
    rangeTo: date("range_to"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    newMeals: integer("new_meals").notNull().default(0),
    changedMeals: integer("changed_meals").notNull().default(0),
    newServings: integer("new_servings").notNull().default(0),
    removedServings: integer("removed_servings").notNull().default(0),
    keptServings: integer("kept_servings").notNull().default(0),
    imagesCreated: integer("images_created").notNull().default(0),
    imagesFailed: integer("images_failed").notNull().default(0),
    massRemoval: boolean("mass_removal").notNull().default(false),
    error: text("error"),
  },
  (t) => [index("sync_run_started_at_idx").on(t.startedAt)]
);
