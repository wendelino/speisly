import { mountOnce } from "@/components/on-demand";
import { Toaster } from "@/components/ui/toaster";
import { $cookiePreferencesOpen } from "@/stores/ui";
import { useAtom } from "@/stores/use-atom";
import { ConsentDialog } from "./consent-dialog";

function CookiePreferences() {
  const open = useAtom($cookiePreferencesOpen);
  const close = () => $cookiePreferencesOpen.set(false);
  return (
    <>
      <ConsentDialog
        onConsent={close}
        onDismiss={close}
        open={open}
        returnFocus="[data-cookie-preferences]"
      />
      <Toaster position="top-right" />
    </>
  );
}

/** Lädt Consent-Dialog und Toaster beim ersten Öffnen */
export function openCookiePreferences(): void {
  mountOnce("cookie-preferences", () => <CookiePreferences />);
  $cookiePreferencesOpen.set(true);
}
