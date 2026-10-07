import { PUBLIC_PRIVACY_POLICY_PATH } from "astro:env/client";
import { Cookie } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { writeConsent } from "@/lib/cookies";

type ConsentDialogProps = {
  open: boolean;
  /** Zustimmung oder Ablehnung (Cookie ist dann gesetzt) */
  onConsent: (accepted: boolean) => void;
  /** ohne Entscheidung geschlossen (Wegziehen, Escape, Schließen-Button) */
  onDismiss: () => void;
  /** Fokus nach dem Schließen (siehe DrawerContent) */
  returnFocus?: string;
};

export function ConsentDialog({
  open,
  onConsent,
  onDismiss,
  returnFocus,
}: ConsentDialogProps) {
  const handleConsent = (accepted: boolean) => {
    writeConsent(accepted);
    onConsent(accepted);
    toast.success(
      accepted
        ? "Cookie-Einstellungen gespeichert"
        : "Cookie-Einstellungen aktualisiert"
    );
  };

  return (
    <Drawer
      onOpenChange={(next) => {
        if (!next) {
          onDismiss();
        }
      }}
      open={open}
    >
      <DrawerContent returnFocus={returnFocus}>
        <DrawerHeader className="items-center gap-3 pr-0 text-center">
          <div className="-rotate-6 inline-flex size-20 animate-float items-center justify-center rounded-blob bg-sun-soft text-sun">
            <Cookie className="size-10" />
          </div>
          <DrawerTitle className="text-2xl">Kekse gefällig?</DrawerTitle>
          <DrawerDescription className="leading-relaxed">
            Wir nutzen Cookies, um deine Bewertungen zu speichern und dir eine
            bessere Erfahrung zu bieten. Mehr Infos findest du in unserer{" "}
            <a
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href={PUBLIC_PRIVACY_POLICY_PATH}
            >
              Datenschutzerklärung
            </a>
            .
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="flex-row">
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
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
