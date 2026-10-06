import { mensa } from "@/lib/db/schema/schema";
import { genId } from "@/lib/db/utils";
import { db } from "../db";
import { memoize } from "../memo";

const HIDDEN_MENSA_NAMES = new Set(["unbekannt"]);
const ONE_HOUR_MS = 3_600_000;

/** Alle Mensen, ungecacht (für den Sync). */
export function listMensen(): Promise<Mensa[]> {
  return db
    .select({ id: mensa.id, name: mensa.name, slug: mensa.slug })
    .from(mensa)
    .orderBy(mensa.name);
}

/**
 * Mensen für Filter und Anzeige (ohne „unbekannt“). Ändert sich praktisch nie,
 * daher 1 h im Prozess gecacht statt einer Query pro Seitenaufruf.
 */
export const getVisibleMensen = memoize(async () => {
  const all = await listMensen();
  return all.filter(
    (m) => !HIDDEN_MENSA_NAMES.has(m.name.trim().toLowerCase())
  );
}, ONE_HOUR_MS);

export async function createMensa({
  name,
  slug,
}: {
  name: string;
  slug: string;
}): Promise<Mensa> {
  const [created] = await db
    .insert(mensa)
    .values({ id: genId(), name, slug })
    .returning({ id: mensa.id, name: mensa.name, slug: mensa.slug });
  getVisibleMensen.clear();
  return created;
}
