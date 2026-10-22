import { pgEnum } from "drizzle-orm/pg-core";

/** Aufruf von /api/sync (src/server/sync-endpoint.ts) */
export const syncScope = pgEnum("sync_scope", [
  "today",
  "week",
  "midnight",
  "warm",
]);
export const syncStatus = pgEnum("sync_status", [
  "running",
  "success",
  /** Sync übernommen, aber Bilder fehlgeschlagen oder Notbremse gezogen */
  "partial",
  "failed",
]);
export const mealChangeField = pgEnum("meal_change_field", [
  "name",
  "subtitle",
  "img_path",
  "price",
]);
export const logLevel = pgEnum("log_level", ["error", "warn"]);
export const feedbackType = pgEnum("feedback_type", ["contact", "feedback"]);
export const feedbackStatus = pgEnum("feedback_status", ["open", "done"]);
