/**
 * Inline-Script für Seiten mit Gerichten (BaseLayout `mealAssets`): markiert
 * fertig geladene Gerichtsbilder (`.m-photo`) mit `data-loaded`, fehlerhafte
 * zusätzlich mit `data-error` (Skeleton aus bzw. Platzhalter, meal.css). Ein
 * Capture-Listener statt onload/onerror an jedem Bild; er steht im <head> und
 * ist damit vor dem ersten <img> registriert.
 *
 * Vor `data-error` lädt einmal das Original aus `data-fallback`
 * (meal-image.astro), falls die WebP-Variante nicht lädt: Im
 * iOS-Blockierungsmodus (Lockdown Mode) war WebP in einzelnen Versionen
 * blockiert.
 * Muss in sich geschlossen sein (wird per toString eingebettet).
 */
export function mealImageBoot() {
  const mark = (event: Event) => {
    const img = event.target;
    if (
      !(img instanceof HTMLImageElement && img.classList.contains("m-photo"))
    ) {
      return;
    }
    if (event.type === "error") {
      const fallback = img.dataset.fallback;
      if (fallback) {
        img.removeAttribute("data-fallback");
        img.src = fallback;
        return;
      }
      img.dataset.error = "";
    }
    img.dataset.loaded = "";
  };
  // am document, nicht am window: load-Events von Elementen erreichen das
  // window laut HTML-Spezifikation nicht (auch nicht in der Capture-Phase)
  document.addEventListener("load", mark, true);
  document.addEventListener("error", mark, true);
}
