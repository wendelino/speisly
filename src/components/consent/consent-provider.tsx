import { Cookie } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { type ConsentState, readConsent } from "@/lib/cookies";
import { ConsentDialog } from "./consent-dialog";

/**
 * Zeigt `children` nur mit Cookie-Zustimmung (Bewerten). Ohne Entscheidung
 * fragt der Consent-Dialog, nach einer Ablehnung steht ein Hinweis mit dem
 * Weg zurück zu den Einstellungen da.
 */
export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentState>(readConsent);

  return (
    <>
      {consent === "accepted" ? children : null}
      {consent === "rejected" ? (
        <ConsentRequired onReset={() => setConsent("pending")} />
      ) : null}
      {/* bleibt gemountet, damit der Drawer animiert schließen kann */}
      <ConsentDialog
        onConsent={(accepted) => setConsent(accepted ? "accepted" : "rejected")}
        onDismiss={() => setConsent("rejected")}
        open={consent === "pending"}
      />
    </>
  );
}

function ConsentRequired({ onReset }: { onReset: () => void }) {
  return (
    <div className="w-full space-y-5 text-center">
      <div className="mx-auto inline-flex size-16 rotate-6 items-center justify-center rounded-blob bg-rose-soft text-rose">
        <Cookie className="size-8" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-bold font-display text-xl">
          Zustimmung erforderlich
        </h2>
        <p className="text-muted-foreground text-sm">
          Um Gerichte zu bewerten, brauchen wir deine Zustimmung für Cookies.
        </p>
      </div>
      <Button className="w-full" onClick={onReset}>
        Cookie-Einstellungen öffnen
      </Button>
    </div>
  );
}
