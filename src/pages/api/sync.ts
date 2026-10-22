import { API_BEARER_TOKEN } from "astro:env/server";
import type { APIRoute } from "astro";
import { syncImages } from "@/server/images";
import { prewarm } from "@/server/prewarm";
import { handleSync } from "@/server/sync";
import { createSyncHandler } from "@/server/sync-endpoint";
import { finishSyncRun, startSyncRun } from "@/server/sync-runs";
import { reportSyncRun } from "@/server/sync-summary";

/**
 * Daten-Sync mit meine-mensa.de und gezielte Cache-Invalidierung.
 *
 * Danach erzeugt er fehlende Bildvarianten (src/server/images). Jeder Aufruf
 * landet als Lauf in `sync_run` (src/server/sync-runs.ts), meldenswerte Läufe
 * als Zusammenfassung per Telegram (src/server/sync-summary.ts).
 *
 *   POST /api/sync?scope=today     Speiseplan von heute (tagsüber)
 *   POST /api/sync?scope=week      heute bis +7 Tage (nachts)
 *   POST /api/sync?scope=midnight  kein Sync: nur Startseite neu + Pre-Warm
 *   POST /api/sync?scope=warm      nur Pre-Warm (nach dem Serverstart)
 *
 * Authorization: Bearer <API_BEARER_TOKEN>
 * Content-Type: application/json  (ohne Content-Type blockt Astros
 * CSRF-Schutz `checkOrigin` POSTs ohne Origin-Header mit 403)
 */
export const prerender = false;

export const POST: APIRoute = createSyncHandler({
  token: API_BEARER_TOKEN,
  handleSync,
  syncImages,
  prewarm,
  runs: { start: startSyncRun, finish: finishSyncRun },
  report: reportSyncRun,
});
