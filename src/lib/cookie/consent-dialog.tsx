"use client";

import { Cookie } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCookies } from "./use-cookies";

type ConsentDialogProps = {
  onConsent: (accepted: boolean) => void;
  onEarlyExit: () => void;
};

const PRIVACY_POLICY_PATH =
  process.env.NEXT_PUBLIC_PRIVACY_POLICY_PATH || "/datenschutz";

export function ConsentDialog({ onConsent, onEarlyExit }: ConsentDialogProps) {
  const [open, setOpen] = useState(true);
  const { setConsent } = useCookies();
  const handleOpenChange = (v: boolean) => {
    onEarlyExit();
    setOpen(v);
  };

  const handleConsent = (accepted: boolean) => {
    setConsent(accepted);
    onConsent(accepted);
    setOpen(false);
    toast.success(
      accepted
        ? "Cookie-Einstellungen gespeichert"
        : "Cookie-Einstellungen aktualisiert"
    );
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />
              <div className="relative rounded-full bg-primary/10 p-4">
                <Cookie className="h-12 w-12 text-primary" />
              </div>
            </div>
          </div>
          <div className="space-y-2 text-center">
            <DialogTitle className="font-bold text-2xl">
              Cookie-Einstellungen
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Wir nutzen Cookies, um deine Bewertungen zu speichern und dir eine
              bessere Erfahrung zu bieten. Mehr Infos findest du in unserer{" "}
              <Link
                className="text-primary underline"
                href={PRIVACY_POLICY_PATH}
              >
                Datenschutzerklärung
              </Link>
              .
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-3 sm:gap-2">
          <Button
            className="flex-1 sm:flex-initial"
            onClick={() => handleConsent(false)}
            variant="outline"
          >
            Ablehnen
          </Button>
          <Button
            className="flex-1 sm:flex-initial"
            onClick={() => handleConsent(true)}
          >
            Akzeptieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
