import { drizzle } from "drizzle-orm/node-postgres";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import journal from "./meta/_journal.json";

const migrationsFolder = import.meta.dir;

// Datenbanken, die früher per `db:push` angelegt wurden, haben das Schema bis
// 0005, aber keine Einträge in drizzle.__drizzle_migrations. migrate() würde
// dort bei 0000 beginnen und an bereits vorhandenen Tabellen scheitern.
const FIRST_UNPUSHED = "0006_sync_runs_and_logs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function baselinePushedSchema() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await client.query(`CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`);
    const { rows } = await client.query(`SELECT
      EXISTS (SELECT 1 FROM "drizzle"."__drizzle_migrations") AS "tracked",
      to_regclass('public.data_source') IS NOT NULL AS "pushed",
      to_regclass('public.sync_run') IS NOT NULL AS "current"`);
    const { tracked, pushed, current } = rows[0];
    if (tracked || !pushed) {
      await client.query("COMMIT");
      return;
    }

    const migrations = readMigrationFiles({ migrationsFolder });
    const cut = current ? migrations.length : journal.entries.findIndex((e) => e.tag === FIRST_UNPUSHED);
    if (cut < 0) throw new Error(`Migration ${FIRST_UNPUSHED} nicht im Journal gefunden`);

    for (const m of migrations.slice(0, cut)) {
      await client.query(`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)`, [
        m.hash,
        m.folderMillis,
      ]);
    }
    await client.query("COMMIT");
    console.log(`baseline: ${cut} Migration(en) als angewendet markiert`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

try {
  await baselinePushedSchema();
  await migrate(drizzle(pool), { migrationsFolder });
  console.log("done");
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
