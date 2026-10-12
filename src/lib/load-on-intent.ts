type Options<T> = {
  /** Modul schon im Leerlauf nach dem Seitenaufbau laden statt erst bei Absicht */
  idle?: boolean;
  /** Nach dem Laden ausführen, z. B. den Dialog geschlossen vorab rendern */
  warm?: (module: T) => void;
};

/**
 * Lädt ein Modul (z. B. einen React-Dialog) erst bei Bedarf: vorgeladen bei
 * Nutzerabsicht (Hover, Touch, Fokus auf dem Trigger) oder optional im
 * Leerlauf, beim Klick bekommt `open` das geladene Modul.
 */
export function loadOnIntent<T>(
  trigger: HTMLElement,
  load: () => Promise<T>,
  open: (module: T) => void,
  { idle = false, warm }: Options<T> = {}
): void {
  let pending: Promise<T> | undefined;
  const preload = () => {
    pending ??= load().then((module) => {
      warm?.(module);
      return module;
    });
    return pending;
  };

  for (const event of ["pointerenter", "touchstart", "focus"]) {
    trigger.addEventListener(event, preload, { once: true, passive: true });
  }
  trigger.addEventListener("click", async () => open(await preload()));

  if (idle) {
    const schedule =
      window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
    const start = () => schedule(preload, { timeout: 2000 });
    if (document.readyState === "complete") {
      start();
    } else {
      window.addEventListener("load", start, { once: true });
    }
  }
}
