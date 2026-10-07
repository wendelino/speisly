import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
};

type PendingConfirm = {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

let openConfirm: ((options: ConfirmOptions) => Promise<boolean>) | null = null;

/**
 * Bestätigungsdialog wie `window.confirm()`, aber im Stil der Seite.
 * Setzt einen gemounteten `<ConfirmProvider>` voraus.
 * @example if (await confirm("Wirklich löschen?")) { … }
 */
export function confirm(message: string | ConfirmOptions): Promise<boolean> {
  if (!openConfirm) {
    throw new Error("ConfirmProvider not mounted");
  }
  return openConfirm(typeof message === "string" ? { message } : message);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  openConfirm = (next) =>
    new Promise((resolve) => setPending({ options: next, resolve }));

  const close = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };
  const options = pending?.options;

  return (
    <>
      {children}
      <Dialog
        onOpenChange={(open) => !open && close(false)}
        open={pending !== null}
      >
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className={options?.title ? "" : "sr-only"}>
              {options?.title ?? "Bestätigung"}
            </DialogTitle>
            <DialogDescription className={options?.title ? "" : "text-base"}>
              {options?.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => close(false)} variant="outline">
              {options?.cancelText ?? "Abbrechen"}
            </Button>
            <Button
              autoFocus
              onClick={() => close(true)}
              variant={options?.variant ?? "default"}
            >
              {options?.confirmText ?? "OK"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
