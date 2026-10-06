import { PUBLIC_COOKIE_CONSENT_NAME } from "astro:env/client";
import type { AstroCookies } from "astro";
import type { ConsentCookieData } from "@/lnio/types/cookie-props";

/** Liest das Consent-Cookie (gleiches Format wie bisher). `null` = keine Angabe */
export function hasConsent(cookies: AstroCookies): boolean | null {
  const raw = cookies.get(PUBLIC_COOKIE_CONSENT_NAME)?.value;
  if (!raw) {
    return null;
  }
  let data: Partial<ConsentCookieData>;
  try {
    data = JSON.parse(raw);
  } catch {
    try {
      data = JSON.parse(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }
  if (
    typeof data !== "object" ||
    data === null ||
    typeof data.accepted !== "boolean" ||
    typeof data.timestamp !== "string"
  ) {
    return null;
  }
  return data.accepted;
}
