/** Chromium-Event für den nativen Installations-Dialog (nicht in lib.dom) */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallPromptWindow = Window & {
  speislyInstallPrompt?: BeforeInstallPromptEvent | null;
};

/**
 * Fängt `beforeinstallprompt` ab, bevor der Browser sein eigenes Banner
 * zeigt, und hebt das Event für den Install-Hinweis (components/install)
 * auf. Läuft als Inline-Script im <head>, weil das Event früh feuern kann;
 * muss daher in sich geschlossen sein (wird per toString eingebettet).
 */
export function installPromptBoot() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    (window as InstallPromptWindow).speislyInstallPrompt =
      event as BeforeInstallPromptEvent;
  });
}

/** Aufgehobener nativer Prompt, falls der Browser einen angeboten hat */
export function takeInstallPrompt(): BeforeInstallPromptEvent | null {
  return (window as InstallPromptWindow).speislyInstallPrompt ?? null;
}

/** Ein Prompt lässt sich nur einmal zeigen */
export function clearInstallPrompt(): void {
  (window as InstallPromptWindow).speislyInstallPrompt = null;
}
