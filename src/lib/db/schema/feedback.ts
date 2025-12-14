import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const feedback = pgTable("feedback", {
  id: text("id").primaryKey(),
  message: text("message").notNull(),
  email: text("email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
