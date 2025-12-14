import { createHash } from "crypto";
import { timestamp, varchar } from "drizzle-orm/pg-core";

export const ID_LENGTH = 32;

export function genId(): string {
  return createHash("sha256")
    .update(Math.random().toString() + Date.now().toString())
    .digest("hex")
    .substring(0, ID_LENGTH);
}

export const timeStampUtils = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
export const uuid = {
  id: varchar("id", { length: ID_LENGTH }).primaryKey(),
};
