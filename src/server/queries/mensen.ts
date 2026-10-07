import { mensa } from "@/lib/db/schema/schema";
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
