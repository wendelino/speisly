"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConsentDialog } from "./consent-dialog";
import { type ConsentState, useCookies } from "./use-cookies";

type ConsentProviderProps = {
  children: React.ReactNode;
  disableStyling?: boolean;
};

export const ConsentProvider = ({
  children,
  disableStyling = false,
}: ConsentProviderProps) => {
  const { hasConsent } = useCookies();
  const [consentState, setConsentState] = useState<ConsentState>(hasConsent());

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
      !disableStyling && "rounded-lg border bg-card p-8 shadow-lg",
      "w-full max-w-md space-y-6 pt-2 text-center"
    )}
  >
    <div className="flex justify-center">
      <div className="rounded-full bg-destructive/10 p-2">
        <AlertCircle className="size-7 text-destructive" />
      </div>
    </div>

    <div className="space-y-2">
      <h2 className="font-bold text-xl tracking-tight">
        Zustimmung erforderlich
      </h2>
      <p className="text-muted-foreground text-sm">
        Um diese Funktion zu nutzen, musst du uns deine Zustimmung für Cookies
        geben.
      </p>
    </div>

    <Button className="w-full" onClick={onReset} variant="default">
      Cookie-Einstellungen öffnen
    </Button>
  </div>
);
