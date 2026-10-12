import { PUBLIC_COOKIE_CONSENT_NAME } from "astro:env/client";
import type { AstroCookies } from "astro";
import { parseConsent } from "@/lib/cookies";

/** Liest das Consent-Cookie. `null` = keine (gültige) Angabe */
export function hasConsent(cookies: AstroCookies): boolean | null {
  const state = parseConsent(cookies.get(PUBLIC_COOKIE_CONSENT_NAME)?.value);
  return state === "pending" ? null : state === "accepted";
}
