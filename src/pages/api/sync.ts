import { API_BEARER_TOKEN } from "astro:env/server";
import type { APIRoute } from "astro";
import { prewarm } from "@/server/prewarm";
import { handleSync } from "@/server/sync";
import { createSyncHandler } from "@/server/sync-endpoint";

/**
 * Daten-Sync mit meine-mensa.de und gezielte Cache-Invalidierung.
 * Ersetzt src/app/api/sync und src/app/api/revalidate.
 *
 *   POST /api/sync?scope=today     Speiseplan von heute (tagsüber)
 *   POST /api/sync?scope=week      heute bis +7 Tage (nachts)
 *   POST /api/sync?scope=midnight  kein Sync: nur Startseite neu + Pre-Warm
 *
 * Authorization: Bearer <API_BEARER_TOKEN>
 * Content-Type: application/json  (ohne Content-Type blockt Astros
 * CSRF-Schutz `checkOrigin` POSTs ohne Origin-Header mit 403)
 */
export const prerender = false;

export const POST: APIRoute = createSyncHandler({
  token: API_BEARER_TOKEN,
  handleSync,
  prewarm,
});
