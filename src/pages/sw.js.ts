import type { APIRoute } from "astro";
import source from "@/service-worker/sw.js?raw";

/**
 * Service Worker unter /sw.js (Scope „/“). Die Version ist die Build-ID
 * (astro.config.mjs), so räumt jeder Deploy die Seiten- und Asset-Caches ab
 * (src/service-worker/sw.js), ein Neustart desselben Images nicht. Kein Hash
 * im Namen: Browser prüfen /sw.js bei jeder Navigation selbst auf Updates.
 */
const body = source.replace("__SW_VERSION__", __BUILD_ID__);

export const GET: APIRoute = () =>
  new Response(body, {
    headers: { "Content-Type": "text/javascript; charset=utf-8" },
  });
