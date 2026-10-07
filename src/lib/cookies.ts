import { PUBLIC_COOKIE_CONSENT_NAME } from "astro:env/client";

/**
 * Cookie-Consent, gemeinsam für Browser und Server. Name und Format des
 * Cookies dürfen sich nicht ändern, sonst ist der Consent aller Nutzer weg.
 */
type ConsentCookie = { accepted: boolean; timestamp: string };
export type ConsentState = "pending" | "accepted" | "rejected";

const ONE_YEAR_DAYS = 365;

/** Rohwert des Cookies → Zustand. Akzeptiert JSON roh oder URI-kodiert. */
export function parseConsent(raw: string | null | undefined): ConsentState {
  if (!raw) {
    return "pending";
  }
  for (const decode of [(v: string) => v, decodeURIComponent]) {
    try {
      const data: Partial<ConsentCookie> | null = JSON.parse(decode(raw));
      if (
        typeof data?.accepted === "boolean" &&
        typeof data.timestamp === "string"
      ) {
        return data.accepted ? "accepted" : "rejected";
      }
      return "pending";
    } catch {
      // nächste Variante probieren
    }
  }
  return "pending";
}

/** Wert eines Cookies aus `document.cookie` (nur im Browser) */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const parts = `; ${document.cookie}`.split(`; ${name}=`);
  return parts.length === 2 ? (parts.pop()?.split(";")[0] ?? null) : null;
}

/** Setzt ein Cookie für die ganze Seite (Format kompatibel zu bestehenden Cookies) */
export function writeCookie(name: string, value: string, days = ONE_YEAR_DAYS) {
  const expires = new Date(Date.now() + days * 86_400_000);
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API ist nicht überall verfügbar
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

export function readConsent(): ConsentState {
  return parseConsent(readCookie(PUBLIC_COOKIE_CONSENT_NAME));
}

export function writeConsent(accepted: boolean) {
  const value: ConsentCookie = {
    accepted,
    timestamp: new Date().toISOString(),
  };
  writeCookie(PUBLIC_COOKIE_CONSENT_NAME, JSON.stringify(value));
}
