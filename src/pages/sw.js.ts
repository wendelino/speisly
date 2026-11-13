import type { APIRoute } from "astro";
import source from "@/service-worker/sw.js?raw";

/**
 * Service Worker unter /sw.js (Scope „/“). Prerendered; die Version ist der
 * Build-Zeitpunkt, so räumt jeder Deploy die Seiten- und Asset-Caches ab
 * (src/service-worker/sw.js). Kein Hash im Namen: Browser prüfen /sw.js bei
 * jeder Navigation selbst auf Updates.
 */
const VERSION = Date.now().toString(36);

export const GET: APIRoute = () =>
  new Response(source.replace("__SW_VERSION__", VERSION), {
    headers: { "Content-Type": "text/javascript; charset=utf-8" },
  });
