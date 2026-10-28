import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { feedbackStatus, feedbackType } from "./enums";

export const feedback = pgTable("feedback", {
  id: text("id").primaryKey(),
  type: feedbackType("type").notNull().default("feedback"),
  status: feedbackStatus("status").notNull().default("open"),
  message: text("message").notNull(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  handledAt: timestamp("handled_at", { withTimezone: true }),
});
