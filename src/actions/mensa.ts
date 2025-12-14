"use server";

import { db } from "@/lib/db";
import { mensa } from "@/lib/db/schema/schema";
import { genId } from "@/lib/db/utils";

export async function getAllMensen() {
  const results = await db.select().from(mensa).orderBy(mensa.name);
  return results;
}
export async function createMensa({
  name,
  slug,
}: {
  name: string;
  slug: string;
}): Promise<typeof mensa.$inferSelect> {
  const newMensa = await db
    .insert(mensa)
    .values({ id: genId(), name, slug })
    .returning();
  return newMensa[0];
}
