// @ts-check
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import {
  defineConfig,
  envField,
  fontProviders,
  memoryCache,
} from "astro/config";
import { loadEnv } from "vite";

/**
 * Öffentliche Basis-URL (z. B. https://speisly.de oder die eines Previews).
 * Pflicht: daraus entstehen alle absoluten URLs (OpenGraph, OIDC-Redirects,
 * Origin-Prüfung, Host für den Seiten-Cache). Fehlt sie, bricht der Start
 * mit Exit-Code 1 ab statt still auf eine falsche Domain zu zeigen.
 */
function requireSiteUrl() {
  const mode = process.env.NODE_ENV ?? "production";
  const raw = process.env.SITE_URL || loadEnv(mode, process.cwd(), "").SITE_URL;
  let url;
  try {
    url = raw ? new URL(raw) : undefined;
  } catch {
    url = undefined;
  }
  if (!(url && (url.protocol === "https:" || url.protocol === "http:"))) {
    console.error(
      `[config] SITE_URL fehlt oder ist keine gültige http(s)-URL: ${raw ?? "(leer)"}`
    );
    process.exit(1);
  }
  return url.origin;
}

// Migrationsplan: docs/astro-migration-plan.md
export default defineConfig({
  site: requireSiteUrl(),
  // Default `output: "static"`: alles wird prerendered, außer Seiten mit
  // `export const prerender = false` (die laufen über den Node-Adapter).
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
  env: {
    schema: {
      DATABASE_URL: envField.string({ context: "server", access: "secret" }),
      JWT_SECRET: envField.string({ context: "server", access: "secret" }),
      JWT_ALGORITHM: envField.string({
        context: "server",
        access: "secret",
        default: "HS256",
      }),
      API_BEARER_TOKEN: envField.string({
        context: "server",
        access: "secret",
      }),
      // Basis-URL der Speiseplan-API (meine-mensa.de), z. B. https://…/api
      MEINE_MENSA_API_URL: envField.string({
        context: "server",
        access: "secret",
      }),
      // Bildvarianten aus dem Sync (persistentes Volume in Produktion)
      IMAGE_DIR: envField.string({
        context: "server",
        access: "secret",
        default: "./data/img",
      }),
      TELEGRAM_BOT_TOKEN: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      TELEGRAM_CHAT_ID: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      // Admin-Bereich (/admin): Login über den eigenen OIDC-Provider. Ohne
      // Client-ID/Secret ist /admin abgeschaltet (src/server/admin.ts).
      OIDC_ISSUER: envField.string({
        context: "server",
        access: "secret",
        default: "https://sso.lnio.de",
      }),
      OIDC_CLIENT_ID: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      OIDC_CLIENT_SECRET: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      // Nur Mitglieder dieser Gruppe (Claim `groups`) kommen hinein
      ADMIN_GROUP: envField.string({
        context: "server",
        access: "secret",
        default: "speisly-admin",
      }),
      // Öffentliche Basis-URL (Pflicht, siehe requireSiteUrl): absolute
      // URLs, OIDC-Redirects, Origin-Prüfung, Host für den Seiten-Cache
      SITE_URL: envField.string({
        context: "server",
        access: "secret",
        url: true,
      }),
      PUBLIC_COOKIE_CONSENT_NAME: envField.string({
        context: "client",
        access: "public",
        default: "speisly-cookie-consent",
      }),
      PUBLIC_PRIVACY_POLICY_PATH: envField.string({
        context: "client",
        access: "public",
        default: "/datenschutz",
      }),
      PUBLIC_UMAMI_WEBSITE_ID: envField.string({
        context: "client",
        access: "public",
        default: "d6c44311-0001-4b07-a1c0-75bee4883fb1",
      }),
    },
  },
});
