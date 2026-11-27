import {
  SITE_URL,
  VAPID_PRIVATE_KEY,
  VAPID_PUBLIC_KEY,
  VAPID_SUBJECT,
} from "astro:env/server";
import webpush from "web-push";

/**
 * Gemeinsame Web-Push-Grundlage für Favoriten (./push.ts) und Admin-Meldungen
 * (./admin-notify.ts). Ohne Imports aus ./log.ts, damit das Melden von
 * Fehlern keinen Import-Zyklus bildet. Ohne VAPID-Schlüssel abgeschaltet.
 */

/**
 * Ungültige Angaben (z. B. Subject `http://localhost` statt https:/mailto:)
 * schalten Push ab, statt jede Seite scheitern zu lassen: Das Layout liest
 * `pushEnabled` (components/layout/public-config.astro).
 */
function configureVapid(): boolean {
  if (!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)) {
    return false;
  }
  try {
    webpush.setVapidDetails(
      VAPID_SUBJECT || SITE_URL,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
    return true;
  } catch (error) {
    console.error("[push] VAPID ungültig, Web-Push ist abgeschaltet:", error);
    return false;
  }
}

export const pushEnabled = configureVapid();

/**
 * Hosts der Push-Dienste der Browser (Chrome/Edge/Samsung/Opera über FCM,
 * Firefox, Safari, Windows). Nur an diese sendet der Server; sonst könnte
 * ein Abo mit `https://10.0.0.5/…` den Cron interne Adressen aufrufen lassen.
 */
const PUSH_HOSTS =
  /(?:^|\.)(?:googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

/** `true` für https-URLs eines bekannten Push-Dienstes (Standard-Port) */
export function isPushEndpoint(endpoint: string): boolean {
  if (!URL.canParse(endpoint)) {
    return false;
  }
  const url = new URL(endpoint);
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    PUSH_HOSTS.test(url.hostname)
  );
}

/** Höchstens so lange auf einen Push-Dienst warten */
export const SEND_TIMEOUT_MS = 10_000;

/** Sendet eine Benachrichtigung über `web-push` (VAPID ist oben gesetzt) */
export function sendWebPush(
  ...args: Parameters<typeof webpush.sendNotification>
): ReturnType<typeof webpush.sendNotification> {
  return webpush.sendNotification(...args);
}
