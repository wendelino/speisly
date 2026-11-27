// @ts-check
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders, memoryCache } from "astro/config";
import { envSchema } from "./env-schema.mjs";

/**
 * Kennung dieses Builds (Service-Worker-Version, src/pages/sw.js.ts). Die
 * einzige Angabe, die beim Build entsteht: Alle Einstellungen (URLs, Schlüssel,
 * Analytics) liest der Server erst beim Start aus der Umgebung, ein Image
 * läuft so unverändert in Produktion und Preview.
 */
const BUILD_ID = Date.now().toString(36);

// Migrationsplan: docs/astro-migration-plan.md
export default defineConfig({
  // Alles wird auf dem Server gerendert, nichts beim Build: Seiten enthalten
  // Werte aus der Umgebung (SITE_URL, Umami, VAPID), die beim Build nicht
  // feststehen. Gecacht wird im Route Cache (src/server/cache-policy.ts).
  output: "server",
  adapter: node({ mode: "standalone" }),
  // Eigener CSRF-Schutz in src/middleware.ts: Astros Origin-Prüfung vergleicht
  // mit der Request-URL, die hinter dem Proxy http:// und der Host aus SITE_URL ist, und
  // lehnt deshalb jedes Formular ab (src/server/origin-check.ts)
  security: { checkOrigin: false },
  integrations: [react()],
  // Route Cache: gerenderte Seiten und Server Islands liegen im Speicher des
  // Server-Prozesses (Cache-HIT = kein Render, keine DB). TTLs und Tags setzen
  // die Seiten selbst (src/server/cache-policy.ts); invalidiert wird gezielt
  // nach dem Sync (src/pages/api/sync.ts) und bei Bewertungen.
  // Nur diese Query-Parameter zählen zum Key, alle anderen werden ignoriert.
  // Sonst erzeugt jeder ausgedachte Parameter (`/?x=1`, `/?x=2` …) einen
  // eigenen Eintrag samt Render: verdrängt vorgewärmte Seiten und lässt sich
  // für teure Renders (OG-Bild) missbrauchen. Neue Parameter hier eintragen.
  // mmid: Ausgabe auf /meal/[id], v: Version von /og/meal/[id].jpg,
  // e/p/s: Export, Props und Slots der Server Islands (Astro-intern)
  cache: {
    provider: memoryCache({
      max: 2000,
      query: { include: ["mmid", "v", "e", "p", "s"] },
    }),
  },
  vite: {
    plugins: [tailwindcss()],
    define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  },
  // Prefetch nur bei Nutzerabsicht (Hover/Touch) für Links mit
  // data-astro-prefetch, nicht alles im Viewport
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
  // Keine Remote-Domains für astro:assets: Gerichtsbilder werden beim Sync
  // vorberechnet (src/server/images), `/_image` rechnet nichts Fremdes.
  // Fließtext in der Systemschrift, Überschriften und Preise in Bricolage
  // Grotesque (eine variable Datei, Latin inkl. Umlaute und €). Self-hosted aus
  // node_modules, kein Netzwerk beim Build.
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Bricolage Grotesque",
      cssVariable: "--font-bricolage",
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          {
            src: [
              "@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
            ],
            weight: "200 800",
            style: "normal",
          },
        ],
      },
    },
  ],
  // Umgebungsvariablen (Pflicht/optional, Bedeutung): env-schema.mjs
  env: { schema: envSchema },
});
