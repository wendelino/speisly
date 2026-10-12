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
        TELEGRAM_BOT_TOKEN: undefined,
        TELEGRAM_CHAT_ID: undefined,
      },
    }));
    build.module("astro:env/client", () => ({
      loader: "object",
      exports: {
        PUBLIC_COOKIE_CONSENT_NAME: "speisly-cookie-consent",
        PUBLIC_PRIVACY_POLICY_PATH: "/datenschutz",
        PUBLIC_UMAMI_WEBSITE_ID: "test",
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
