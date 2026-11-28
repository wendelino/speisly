import type { AstroCookies } from "astro";
import { CONSENT_COOKIE, parseConsent } from "@/lib/cookies";

/** Liest das Consent-Cookie. `null` = keine (gültige) Angabe */
export function hasConsent(cookies: AstroCookies): boolean | null {
  const state = parseConsent(cookies.get(CONSENT_COOKIE)?.value);
  return state === "pending" ? null : state === "accepted";
}
