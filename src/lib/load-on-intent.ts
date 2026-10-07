/**
 * Lädt ein Modul (z. B. einen React-Dialog) erst bei Bedarf: vorgeladen bei
 * Nutzerabsicht (Hover, Touch, Fokus auf dem Trigger), beim Klick bekommt
 * `open` das geladene Modul.
 */
export function loadOnIntent<T>(
  trigger: HTMLElement,
  load: () => Promise<T>,
  open: (module: T) => void
): void {
  for (const event of ["pointerenter", "touchstart", "focus"]) {
    trigger.addEventListener(event, load, { once: true, passive: true });
  }
  trigger.addEventListener("click", async () => open(await load()));
}
