import { PUBLIC_PRIVACY_POLICY_PATH } from "astro:env/client";
import { Cookie } from "lucide-react";
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
import { writeConsent } from "@/lib/cookies";

type ConsentDialogProps = {
  onConsent: (accepted: boolean) => void;
  onEarlyExit: () => void;
};

export function ConsentDialog({ onConsent, onEarlyExit }: ConsentDialogProps) {
  const [open, setOpen] = useState(true);
  const handleOpenChange = (v: boolean) => {
    onEarlyExit();
    setOpen(v);
  };

  const handleConsent = (accepted: boolean) => {
    writeConsent(accepted);
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
        <DialogHeader className="items-center gap-3 text-center sm:text-center">
          <div className="-rotate-6 inline-flex size-20 animate-float items-center justify-center rounded-[42%_58%_63%_37%/41%_44%_56%_59%] bg-sun-soft text-sun">
            <Cookie className="size-10" />
          </div>
          <DialogTitle className="text-2xl">Kekse gefällig?</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Wir nutzen Cookies, um deine Bewertungen zu speichern und dir eine
            bessere Erfahrung zu bieten. Mehr Infos findest du in unserer{" "}
            <a
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href={PUBLIC_PRIVACY_POLICY_PATH}
            >
              Datenschutzerklärung
            </a>
            .
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row gap-2 sm:justify-center">
          <Button
            className="flex-1"
            onClick={() => handleConsent(false)}
            variant="outline"
          >
            Ablehnen
          </Button>
          <Button className="flex-1" onClick={() => handleConsent(true)}>
            Akzeptieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
