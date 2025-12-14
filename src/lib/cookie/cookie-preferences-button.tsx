"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConsentDialog } from "./consent-dialog";

export function CookiePreferencesButton() {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <Button
        className="mt-4"
        onClick={() => setShowDialog(true)}
        variant="outline"
      >
        Cookie-Einstellungen ändern
      </Button>
      {showDialog ? (
        <ConsentDialog
          onConsent={() => setShowDialog(false)}
          onEarlyExit={() => setShowDialog(false)}
        />
      ) : null}
    </>
  );
}
