// @ts-check
/**
 * Umgebungsvariablen: eine Liste für Astro (`env.schema` in astro.config.mjs,
 * Zugriff über `astro:env/server`) und für den Start (server/index.mjs prüft
 * sie, bevor der Server Anfragen annimmt). Astro selbst prüft erst beim
 * ersten Zugriff, der Server würde sonst starten und mit 500 antworten.
 *
 * Alle Werte werden erst zur Laufzeit gelesen, keiner beim Build: Ein Image
 * läuft so unverändert in Produktion und Preview. Vorlage: `.env.example`.
 *
 * Pflicht ist alles ohne `optional`/`default`; fehlt etwas, startet der Server
 * nicht. Optionale Dienste (Telegram, Web-Push, Umami, Admin-Login) sind ohne
 * ihre Werte einfach abgeschaltet.
 *
 * Bewusst ohne Import aus `astro/config` (`envField` liefert dieselben
 * Objekte), damit der Start nicht Astros Konfigurations-Code lädt.
 */

/**
 * @param {{ optional?: boolean, default?: string, url?: boolean, startsWith?: string }} [options]
 * @returns {{ type: "string", context: "server", access: "secret", optional?: boolean, default?: string, url?: boolean, startsWith?: string }}
 */
const secret = (options = {}) => ({
  type: "string",
  context: "server",
  access: "secret",
  ...options,
});

export const envSchema = {
  // Öffentliche Basis-URL, z. B. https://speisly.de oder die eines Previews:
  // absolute URLs (OpenGraph), OIDC-Redirects, Origin-Prüfung, Analytics-Domain
  SITE_URL: secret({ url: true, startsWith: "http" }),
  DATABASE_URL: secret(),
  JWT_SECRET: secret(),
  JWT_ALGORITHM: secret({ default: "HS256" }),
  API_BEARER_TOKEN: secret(),
  // Basis-URL der Speiseplan-API (meine-mensa.de), z. B. https://…/api
  MEINE_MENSA_API_URL: secret({ url: true }),
  // Nur Bilder unter dieser URL lädt der Sync (Origin + Pfad-Präfix der
  // Mediathek, src/server/images/store.ts), z. B. https://…/mediathek/
  IMAGE_SOURCE_URL: secret({ url: true, startsWith: "https://" }),
  // Bildvarianten aus dem Sync (persistentes Volume in Produktion)
  IMAGE_DIR: secret({ default: "./data/img" }),
  // „Mehr zu Inhaltsstoffen und Allergenen“ auf der Detailseite
  ALLERGEN_INFO_URL: secret({ url: true }),

  // Telegram (Alarme des Syncs, Fehler): ohne beide Werte abgeschaltet
  TELEGRAM_BOT_TOKEN: secret({ optional: true }),
  TELEGRAM_CHAT_ID: secret({ optional: true }),

  // Admin-Bereich (/admin): Login über den eigenen OIDC-Provider. Ohne
  // Issuer, Client-ID und Secret ist /admin abgeschaltet (src/server/admin.ts).
  OIDC_ISSUER: secret({ url: true, optional: true }),
  OIDC_CLIENT_ID: secret({ optional: true }),
  OIDC_CLIENT_SECRET: secret({ optional: true }),
  // Nur Mitglieder dieser Gruppe (Claim `groups`) kommen hinein
  ADMIN_GROUP: secret({ default: "speisly-admin" }),

  // Web-Push (Favorit morgen auf dem Plan, Admin-Meldungen). Schlüssel:
  // `bunx web-push generate-vapid-keys`. Ohne beide Schlüssel abgeschaltet.
  // Den öffentlichen gibt der Server im HTML an den Browser weiter
  // (lib/public-config.ts), er steht nicht im Bundle.
  VAPID_PUBLIC_KEY: secret({ optional: true }),
  VAPID_PRIVATE_KEY: secret({ optional: true }),
  // Kontakt für Push-Dienste (mailto: oder https:), Default SITE_URL
  VAPID_SUBJECT: secret({ optional: true }),

  // Analytics (Umami, nur im Production-Build). Ohne Script-URL oder
  // Website-ID kein Tracking. Gezählt wird nur auf dem Host von SITE_URL.
  UMAMI_SCRIPT_URL: secret({ url: true, optional: true }),
  UMAMI_WEBSITE_ID: secret({ optional: true }),
};
