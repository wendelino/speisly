import { Cookie, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { type ConsentState, readConsent } from "@/lib/cookies";
import { cn } from "@/lib/utils";
import { ConsentDialog } from "./consent-dialog";

type ConsentProviderProps = {
  children: React.ReactNode;
  disableStyling?: boolean;
};

export const ConsentProvider = ({
  children,
  disableStyling = false,
}: ConsentProviderProps) => {
  const [consentState, setConsentState] = useState<ConsentState>(readConsent);

  const handleConsent = useCallback((accepted: boolean) => {
    setConsentState(accepted ? "accepted" : "rejected");
  }, []);

  const handleReset = useCallback(() => {
    setConsentState("pending");
  }, []);

  // Show dialog if consent is pending
  if (consentState === "pending") {
    return (
      <ConsentDialog
        onConsent={handleConsent}
        onEarlyExit={() => setConsentState("rejected")}
      />
    );
  }

  // Show rejection message if consent was rejected
  if (consentState === "rejected") {
    return (
      <ConsentRequired disableStyling={disableStyling} onReset={handleReset} />
    );
  }

  if (consentState === "accepted") {
    return children;
  }
  return (
    <div className="flex h-full min-h-32 items-center justify-center">
      <Loader2 className="animate-spin" />
    </div>
  );
};

type ConsentRequiredProps = {
  onReset: () => void;
  disableStyling?: boolean;
};

const ConsentRequired = ({
  onReset,
  disableStyling = false,
}: ConsentRequiredProps) => (
  <div
    className={cn(
      !disableStyling &&
        "rounded-3xl bg-card p-8 shadow-soft ring-1 ring-border/70",
      "w-full space-y-5 text-center"
    )}
  >
    <div className="mx-auto inline-flex size-16 rotate-6 items-center justify-center rounded-[42%_58%_63%_37%/41%_44%_56%_59%] bg-rose-soft text-rose">
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
