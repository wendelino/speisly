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

// Migrationsplan: docs/astro-migration-plan.md
export default defineConfig({
  site: "https://speisly.de",
  // Default `output: "static"`: alles wird prerendered, außer Seiten mit
  // `export const prerender = false` (die laufen über den Node-Adapter).
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  // Route Cache: gerenderte Seiten und Server Islands liegen im Speicher des
  // Server-Prozesses (Cache-HIT = kein Render, keine DB). TTLs und Tags setzen
  // die Seiten selbst (src/server/cache-policy.ts); invalidiert wird gezielt
  // nach dem Sync (src/pages/api/sync.ts) und bei Bewertungen.
  // Query-Parameter zählen zum Key (z. B. ?mmid=), Tracking-Parameter nicht.
  cache: {
    provider: memoryCache({ max: 2000 }),
  },
  vite: {
    plugins: [tailwindcss()],
  },
  // Prefetch nur bei Nutzerabsicht (Hover/Touch) für Links mit
  // data-astro-prefetch – nicht wie bei Next alles im Viewport
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
  // Keine Remote-Domains für astro:assets: Gerichtsbilder werden beim Sync
  // vorberechnet (src/server/images), `/_image` rechnet nichts Fremdes.
  // Schrift wie bisher in Produktion: Fließtext in der Systemschrift (Geist Sans
  // war in der Next-Version nie aktiv, siehe globals.css), Geist Mono nur für
  // `font-mono`. Self-hosted aus node_modules, kein Netzwerk beim Build.
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Geist Mono",
      cssVariable: "--font-geist-mono",
      fallbacks: ["monospace"],
      options: {
        variants: [
          {
            src: [
              "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
            ],
            weight: "100 900",
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
