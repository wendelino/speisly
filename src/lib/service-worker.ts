/**
 * Registriert den Service Worker (/sw.js aus src/service-worker/sw.js:
 * Offline-Modus und Push-Benachrichtigungen). Im Dev-Server nicht automatisch, damit kein
 * Cache bei der Entwicklung stört; für Push wird er dort auf Anfrage
 * registriert.
 */
export async function registerServiceWorker(): Promise<
  ServiceWorkerRegistration | undefined
> {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return await navigator.serviceWorker.ready;
  } catch (error) {
    console.error("Service worker registration failed:", error);
    return;
  }
}

/** Nach dem Laden registrieren und die Speisepläne vorhalten lassen */
export function bootServiceWorker(): void {
  if (!(import.meta.env.PROD && "serviceWorker" in navigator)) {
    return;
  }
  const start = async () => {
    const registration = await registerServiceWorker();
    // heute und die nächsten Tage für offline vorhalten (sw.js „warm“)
    registration?.active?.postMessage({ type: "warm" });
  };
  if (document.readyState === "complete") {
    start();
  } else {
    window.addEventListener("load", start, { once: true });
  }
}
