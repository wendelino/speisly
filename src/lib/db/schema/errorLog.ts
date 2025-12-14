import { pgTable, text } from "drizzle-orm/pg-core";
import { timeStampUtils, uuid } from "../utils";

export const errorLog = pgTable("error_log", {
  ...uuid,
  message: text("message").notNull(),
  ctx: text("ctx").notNull(),
  ...timeStampUtils,
});
