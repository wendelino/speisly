import { DATABASE_URL } from "astro:env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Ein Pool pro Prozess. `globalThis` schützt vor zusätzlichen Pools durch
// Vite-HMR im Dev-Server.
const globalForDb = globalThis as typeof globalThis & {
  __speislyPool?: Pool;
};

const pool =
  globalForDb.__speislyPool ??
  new Pool({
    connectionString: DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5000,
  });

if (!globalForDb.__speislyPool) {
  globalForDb.__speislyPool = pool;
  pool.on("error", (error) => {
    // Fehler auf idle Clients dürfen den Prozess nicht beenden
    console.error("[db] idle client error", error);
  });
}

export const db = drizzle({ client: pool });

/** Schließt den Pool (für Skripte und Tests, nicht im Server verwenden). */
export function closeDb(): Promise<void> {
  globalForDb.__speislyPool = undefined;
  return pool.end();
}
