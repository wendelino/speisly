/**
 * Preload für `bun test`: stellt die virtuellen Astro-Module bereit, die es
 * nur innerhalb von Vite/Astro gibt. Werte kommen aus der Umgebung
 * (Bun lädt `.env`/`.env.local` automatisch).
 */

import { afterAll } from "bun:test";
import { plugin } from "bun";

const env = process.env;

plugin({
  name: "astro-env-for-tests",
  setup(build) {
    build.module("astro:env/server", () => ({
      loader: "object",
      exports: {
        DATABASE_URL: env.DATABASE_URL,
        JWT_SECRET: env.JWT_SECRET ?? "test-secret",
        JWT_ALGORITHM: env.JWT_ALGORITHM ?? "HS256",
        API_BEARER_TOKEN: env.API_BEARER_TOKEN ?? "test-token",
        MEINE_MENSA_API_URL:
          env.MEINE_MENSA_API_URL ?? "https://api.example.test",
        IMAGE_DIR: env.IMAGE_DIR ?? "./data/img-test",
        IMAGE_SOURCE_URL: "https://meine-mensa.de/mediathek/",
        ALLERGEN_INFO_URL: "https://allergene.example.test/",
        TELEGRAM_BOT_TOKEN: undefined,
        TELEGRAM_CHAT_ID: undefined,
        OIDC_ISSUER: "https://sso.example.test",
        OIDC_CLIENT_ID: "speisly-test",
        OIDC_CLIENT_SECRET: "test-client-secret",
        ADMIN_GROUP: "speisly-admin",
        SITE_URL: env.SITE_URL ?? "https://speisly.de",
        VAPID_PRIVATE_KEY: undefined,
        VAPID_PUBLIC_KEY: undefined,
        VAPID_SUBJECT: undefined,
        UMAMI_SCRIPT_URL: undefined,
        UMAMI_WEBSITE_ID: undefined,
      },
    }));
  },
});

// Alle Testdateien teilen sich den DB-Pool (src/server/db.ts); einmal am Ende schließen.
afterAll(async () => {
  const pool = (globalThis as { __speislyPool?: { end: () => Promise<void> } })
    .__speislyPool;
  await pool?.end();
});
