import { PUBLIC_VAPID_PUBLIC_KEY } from "astro:env/client";
import { SITE_URL, VAPID_PRIVATE_KEY, VAPID_SUBJECT } from "astro:env/server";
import webpush from "web-push";

/**
 * Gemeinsame Web-Push-Grundlage für Favoriten (./push.ts) und Admin-Meldungen
 * (./admin-notify.ts). Ohne Imports aus ./log.ts, damit das Melden von
 * Fehlern keinen Import-Zyklus bildet. Ohne VAPID-Schlüssel abgeschaltet.
 */

export const pushEnabled = Boolean(
  PUBLIC_VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY
);

if (pushEnabled) {
  webpush.setVapidDetails(
    VAPID_SUBJECT || SITE_URL,
    PUBLIC_VAPID_PUBLIC_KEY as string,
    VAPID_PRIVATE_KEY as string
  );
}

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
