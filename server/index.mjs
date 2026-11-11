/**
 * Produktionsstart (`bun run start`), ersetzt src/_boot.ts.
 *
 * - startet den Astro-Server (`@astrojs/node`, Build in dist/) mit eigenem
 *   HTTP-Server, damit Antworten komprimiert werden (./compress.mjs)
 * - synchronisiert nach dem Start heute bis +7 Tage (Daten und Bildvarianten)
 *   und wärmt danach die wichtigsten Seiten vor (der Route Cache lebt im
 *   Speicher und ist nach jedem Neustart leer)
 * - registriert die Cron-Jobs für den Daten-Sync (./cron.mjs)
 *
 * Umgebung: PORT (Default 4321), HOST (Default 0.0.0.0), API_BEARER_TOKEN,
 * SITE_URL (Pflicht, öffentliche Basis-URL; ohne sie Exit-Code 1),
 * CRON_DISABLED=1 schaltet Cron und den Start-Sync ab (z. B. für eine zweite
 * Instanz oder lokale Tests).
 */
import http from "node:http";
import { createCompression } from "./compress.mjs";
import { startCron, triggerSync } from "./cron.mjs";

// Pflicht, siehe requireSiteUrl(); vor allem anderen prüfen
requireSiteUrl(process.env.SITE_URL);

// Der Standalone-Server des Adapters soll nicht selbst starten, wir nutzen
// seinen Handler (statische Dateien + SSR) in unserem Server
process.env.ASTRO_NODE_AUTOSTART = "disabled";
const { handler } = await import("../dist/server/entry.mjs");

const port = Number(process.env.PORT || 4321);
const host = process.env.HOST || "0.0.0.0";
const localHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
const baseUrl = `http://${localHost.includes(":") ? `[${localHost}]` : localHost}:${port}`;
// der Sync-Endpoint wärmt über PORT vor (src/server/sync-endpoint.ts)
process.env.PORT = String(port);

// Astros Route Cache verwendet den Origin der Request-URL als Teil des
// Schlüssels. Ohne `security.allowedDomains` ignoriert Astro Host und
// X-Forwarded-* und baut die URL immer als http://localhost:<port>: Pre-Warm,
// Cron und Besucher landen so im selben Eintrag, und kein Client kann über
// einen gefälschten Host eigene Einträge anlegen. Wer allowedDomains setzt,
// muss den Host hier wieder vereinheitlichen (`req.headers.host = …`).
// Absolute URLs kommen aus SITE_URL, nie aus der Request-URL.

/** Ohne gültige http(s)-URL in SITE_URL startet der Server nicht */
function requireSiteUrl(/** @type {string | undefined} */ raw) {
  try {
    if (raw) {
      const url = new URL(raw);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return;
      }
    }
  } catch {
    // unten
  }
  console.error(
    `[server] SITE_URL fehlt oder ist keine gültige http(s)-URL: ${raw ?? "(leer)"}`
  );
  process.exit(1);
}

// Dateien aus public/ haben keinen Hash im Namen; der Adapter liefert sie mit
// `max-age=0` aus, was der Browser bei jedem Seitenaufruf neu prüft. Icons
// und Manifest ändern sich praktisch nie: ein Tag frisch, danach im
// Hintergrund neu (`send` übernimmt einen schon gesetzten Header).
const PUBLIC_FILES =
  /^\/(favicon\.ico|apple-touch-icon\.png|logo_full\.png|manifest\.webmanifest|icons\/[\w-]+\.png)(\?|$)/;
const PUBLIC_CACHE_CONTROL =
  "public, max-age=86400, stale-while-revalidate=604800";

const compression = createCompression();
const server = http.createServer((req, res) => {
  if (PUBLIC_FILES.test(req.url ?? "")) {
    res.setHeader("Cache-Control", PUBLIC_CACHE_CONTROL);
  }
  compression(req, res, () => handler(req, res));
});
server.keepAliveTimeout = 65_000;

/** @type {{ stop: () => void } | undefined} */
let cron;

server.listen(port, host, () => {
  console.log(`[server] listening on http://${host}:${port}`);
  if (process.env.CRON_DISABLED === "1") {
    console.log("[server] CRON_DISABLED=1: kein Cron, kein Start-Sync");
    return;
  }
  const token = process.env.API_BEARER_TOKEN;
  if (!token) {
    console.error(
      "[server] API_BEARER_TOKEN fehlt: kein Cron, kein Start-Sync"
    );
    return;
  }
  // Sync heute…+7 und Pre-Warm im Hintergrund, der Server nimmt sofort Anfragen an
  triggerSync({ baseUrl, token, scope: "week" });
  cron = startCron({ baseUrl, token });
});

let shuttingDown = false;
function shutdown(/** @type {string} */ signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[server] ${signal}: fahre herunter`);
  cron?.stop();
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  // laufende Requests bekommen 10 s
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
