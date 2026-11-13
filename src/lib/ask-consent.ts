import { readConsent } from "@/lib/cookies";
import { loadReactModule } from "@/lib/react-dev-preamble";
import { $cookiePreferencesOpen } from "@/stores/ui";

/**
 * Fragt nach Cookie-Consent (Consent-Dialog, bei Bedarf geladen) und
 * liefert, ob danach zugestimmt ist. Für statische Buttons außerhalb von
 * React, z. B. Likes an Kommentaren.
 */
export async function askConsent(): Promise<boolean> {
  if (readConsent() === "accepted") {
    return true;
  }
  const { openCookiePreferences } = await loadReactModule(
    () => import("@/components/consent/cookie-preferences.mount")
  );
  openCookiePreferences();
  await new Promise<void>((resolve) => {
    const stop = $cookiePreferencesOpen.listen((open) => {
      if (!open) {
        stop();
        resolve();
      }
    });
  });
  return readConsent() === "accepted";
}
