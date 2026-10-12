import { pgTable, text, varchar } from "drizzle-orm/pg-core";
import { ID_LENGTH, timeStampUtils, uuid } from "../utils";

export const dataSource = pgTable("data_source", {
  ...uuid,
  name: text("name").notNull(),
  slug: varchar("slug", { length: ID_LENGTH }).notNull().unique(),
  ...timeStampUtils,
});
