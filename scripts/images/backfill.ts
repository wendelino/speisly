/**
 * Erzeugt Bildvarianten für alle Gerichtsbilder in der DB (einmalig beim
 * Umstieg bzw. nach Verlust des Volumes). Laufende Syncs erzeugen nur die
 * Varianten für heute…+7 Tage.
 *
 *   DATABASE_URL=… IMAGE_DIR=/data/img bun scripts/images/backfill.ts [--since 2026-01-01]
 *
 * Bereits vorhandene Varianten werden übersprungen, das Skript kann also
 * jederzeit erneut laufen. Danach den Server neu starten (oder warten, bis die
 * gecachten Seiten ablaufen), damit die Seiten auf die Varianten zeigen.
 */
import { parseArgs } from "node:util";
import { Pool } from "pg";
import { createImageStore } from "../../src/server/images/store";

const { values: args } = parseArgs({
  options: { since: { type: "string" } },
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const store = createImageStore({
  dir: process.env.IMAGE_DIR ?? "./data/img",
});

const { rows } = await pool.query<{ img_path: string }>(
  `select distinct m.img_path from meal m
     join mensa_meal mm on mm.meal_id = m.id
    where m.img_path is not null and ($1::date is null or mm.date >= $1::date)`,
  [args.since ?? null]
);
await pool.end();

const counts: Record<string, number> = {};
for (const [i, { img_path: url }] of rows.entries()) {
  const { result, error } = await store.ensure(url);
  counts[result] = (counts[result] ?? 0) + 1;
  if (error) {
    console.error(`[backfill] ${url}: ${String(error)}`);
  }
  if ((i + 1) % 50 === 0) {
    console.error(`[backfill] ${i + 1}/${rows.length}`);
  }
}
console.log(`[backfill] ${rows.length} Bilder in ${store.dir}:`, counts);
