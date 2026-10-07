import { Cookie } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConsentDialog } from "./consent-dialog";

export function CookiePreferencesButton() {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <Button
        className="mt-2"
        onClick={() => setShowDialog(true)}
        variant="outline"
      >
        <Cookie className="size-4" />
        Cookie-Einstellungen ändern
      </Button>
      <ConsentDialog
        onConsent={() => setShowDialog(false)}
        onDismiss={() => setShowDialog(false)}
        open={showDialog}
      />
    </>
  );
}
