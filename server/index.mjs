/**
 * Produktionsstart (`bun run start`), ersetzt src/_boot.ts.
 *
 * - startet den Astro-Server (`@astrojs/node`, Build in dist/) mit eigenem
 *   HTTP-Server, damit Antworten komprimiert werden (./compress.mjs)
 * - wärmt nach dem Start die wichtigsten Seiten vor (der Route Cache lebt im
 *   Speicher und ist nach jedem Neustart leer)
 * - registriert die Cron-Jobs für den Daten-Sync (./cron.mjs)
 *
 * Umgebung: PORT (Default 4321), HOST (Default 0.0.0.0), API_BEARER_TOKEN,
 * SITE_HOST (Default speisly.de, einheitlicher Host für den Cache-Schlüssel),
 * CRON_DISABLED=1 schaltet Cron und Pre-Warm ab (z. B. für eine zweite
 * Instanz oder lokale Tests).
 */
import http from "node:http";
import { createCompression } from "./compress.mjs";
import { startCron, triggerSync } from "./cron.mjs";

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

// Astros Route Cache verwendet den Host als Teil des Schlüssels. Ohne
// Vereinheitlichung landen Pre-Warm und Cron (127.0.0.1) und Besucher (über den
// Reverse Proxy, je nach Proxy mit `speisly.de` oder der Upstream-Adresse) in
// verschiedenen Einträgen, und das Vorwärmen wäre wirkungslos. Die App nutzt
// den Host sonst nirgends (absolute URLs kommen aus `site` in astro.config).
const canonicalHost = process.env.SITE_HOST || "speisly.de";

const compression = createCompression();
const server = http.createServer((req, res) => {
  req.headers.host = canonicalHost;
  compression(req, res, () => handler(req, res));
});
server.keepAliveTimeout = 65_000;

/** @type {{ stop: () => void } | undefined} */
let cron;

server.listen(port, host, () => {
  console.log(`[server] listening on http://${host}:${port}`);
  if (process.env.CRON_DISABLED === "1") {
    console.log("[server] CRON_DISABLED=1: kein Cron, kein Pre-Warm");
    return;
  }
  const token = process.env.API_BEARER_TOKEN;
  if (!token) {
    console.error("[server] API_BEARER_TOKEN fehlt: kein Cron, kein Pre-Warm");
    return;
  }
  // Pre-Warm im Hintergrund, der Server nimmt sofort Anfragen an
  triggerSync({ baseUrl, token, scope: "warm" });
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
