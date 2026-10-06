// @ts-check
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, envField, fontProviders } from "astro/config";

// Migrationsplan: docs/astro-migration-plan.md
// Caching (cache provider + routeRules) folgt in Phase 6.
export default defineConfig({
  site: "https://speisly.de",
  // Default `output: "static"`: alles wird prerendered, außer Seiten mit
  // `export const prerender = false` (die laufen über den Node-Adapter).
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  image: {
    domains: ["meine-mensa.de"],
  },
  // Geist wird aus node_modules (@fontsource-variable/*) self-hosted: der Build
  // hängt so nicht von Google Fonts oder einem CDN ab. Latin-Subset wie bisher
  // mit next/font (enthält Umlaute und €).
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Geist",
      cssVariable: "--font-geist-sans",
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          {
            src: [
              "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
            ],
            weight: "100 900",
            style: "normal",
          },
        ],
      },
    },
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
