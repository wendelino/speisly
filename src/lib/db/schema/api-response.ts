import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { ID_LENGTH, uuid } from "../utils";
import { syncRun } from "./sync-run";

/**
 * Rohe Antworten der Meine-Mensa-API, unverändert wie geliefert
 * (src/server/sync/utils.ts), zum Nachvollziehen eines Sync-Laufs.
 */
export const apiResponse = pgTable(
  "api_response",
  {
    ...uuid,
    syncRunId: varchar("sync_run_id", { length: ID_LENGTH }).references(
      () => syncRun.id,
      { onDelete: "set null" }
    ),
    url: text("url").notNull(),
    status: integer("status").notNull(),
    durationMs: integer("duration_ms").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("api_response_sync_run_id_idx").on(t.syncRunId),
    index("api_response_created_at_idx").on(t.createdAt),
  ]
);
