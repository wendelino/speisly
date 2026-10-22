import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { ID_LENGTH, uuid } from "../utils";
import { logLevel } from "./enums";
import { syncRun } from "./sync-run";

/**
 * Gruppierte Fehler (src/server/log.ts): eine Zeile je Quelle und Meldung,
 * jedes weitere Auftreten zählt hoch und überschreibt den letzten Kontext.
 */
export const errorLog = pgTable(
  "error_log",
  {
    ...uuid,
    /** md5(`${source}:${message}`) */
    fingerprint: varchar("fingerprint", { length: 32 }).notNull().unique(),
    level: logLevel("level").notNull().default("error"),
    source: varchar("source", { length: 32 }).notNull(),
    message: text("message").notNull(),
    count: integer("count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastCtx: jsonb("last_ctx"),
    lastSyncRunId: varchar("last_sync_run_id", {
      length: ID_LENGTH,
    }).references(() => syncRun.id, { onDelete: "set null" }),
    /** zuletzt per Telegram gemeldet */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    /** als erledigt markiert; erneutes Auftreten öffnet den Fehler wieder */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("error_log_last_seen_at_idx").on(t.lastSeenAt)]
);
