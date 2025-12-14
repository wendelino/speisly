"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Types
type AlertOptions = {
  title?: string;
  message: string;
  confirmText?: string;
};

type ConfirmOptions = AlertOptions & {
  cancelText?: string;
  variant?: "default" | "destructive";
};

type AlertState = {
  type: "alert" | "confirm";
  options: AlertOptions | ConfirmOptions;
  resolve: (value: boolean) => void;
} | null;

type AlertContextType = {
  alert: (message: string | AlertOptions) => Promise<void>;
  confirm: (message: string | ConfirmOptions) => Promise<boolean>;
};

// Context
const AlertContext = createContext<AlertContextType | null>(null);

// Hook
export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlert must be used within an AlertProvider");
  }
  return context;
}

// Global store for imperative API
let globalAlert: AlertContextType["alert"] | null = null;
let globalConfirm: AlertContextType["confirm"] | null = null;

/**
 * Imperative alert function - works like window.alert() but with shadcn dialog
 * @example
 * await alert("Something happened!");
 * await alert({ title: "Error", message: "Something went wrong" });
 */
export function alert(message: string | AlertOptions): Promise<void> {
  if (!globalAlert) {
    console.warn("AlertProvider not mounted. Falling back to window.alert()");
    throw new Error("AlertProvider not mounted");
  }
  return globalAlert(message);
}

/**
 * Imperative confirm function - works like window.confirm() but with shadcn dialog
 * @example
 * const confirmed = await confirm("Are you sure?");
 * const confirmed = await confirm({ title: "Delete", message: "Are you sure?", variant: "destructive" });
 */
export function confirm(message: string | ConfirmOptions): Promise<boolean> {
  if (!globalConfirm) {
    console.warn("AlertProvider not mounted. Falling back to window.confirm()");
    throw new Error("AlertProvider not mounted");
  }
  return globalConfirm(message);
}

// Provider Component
export function AlertProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AlertState>(null);

  const handleAlert = useCallback(
    (message: string | AlertOptions): Promise<void> =>
      new Promise((resolve) => {
        const options: AlertOptions =
          typeof message === "string" ? { message } : message;
        setState({
          type: "alert",
          options,
          resolve: () => resolve(),
        });
      }),
    []
  );

  const handleConfirm = useCallback(
    (message: string | ConfirmOptions): Promise<boolean> =>
      new Promise((resolve) => {
        const options: ConfirmOptions =
          typeof message === "string" ? { message } : message;
        setState({
          type: "confirm",
          options,
          resolve,
        });
      }),
    []
  );

  // Set global references
  globalAlert = handleAlert;
  globalConfirm = handleConfirm;

  const handleClose = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  const isConfirm = state?.type === "confirm";
  const options = state?.options;
  const confirmOptions = options as ConfirmOptions | undefined;

  return (
    <AlertContext.Provider
      value={{ alert: handleAlert, confirm: handleConfirm }}
    >
      {children}
      <Dialog
        onOpenChange={(open) => !open && handleClose(false)}
        open={!!state}
      >
        <DialogContent className="max-w-80" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className={options?.title ? "" : "sr-only"}>
              {options?.title || (isConfirm ? "Bestätigung" : "Hinweis")}
            </DialogTitle>
            <DialogDescription className={options?.title ? "" : "text-base"}>
              {options?.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {isConfirm ? (
              <Button onClick={() => handleClose(false)} variant="outline">
                {confirmOptions?.cancelText ?? "Abbrechen"}
              </Button>
            ) : null}
            <Button
              autoFocus
              onClick={() => handleClose(true)}
              variant={confirmOptions?.variant ?? "default"}
            >
              {options?.confirmText ?? "OK"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AlertContext.Provider>
  );
}
