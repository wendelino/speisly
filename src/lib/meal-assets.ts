/**
 * Inline-Script für Seiten mit Gerichten (BaseLayout `mealAssets`): markiert
 * geladene Gerichtsbilder mit `data-loaded` (Skeleton aus, Bild ein, siehe
 * meal-image.astro). Ein Capture-Listener statt onload/onerror an jedem Bild;
 * er steht im <head> und ist damit vor dem ersten <img> registriert.
 * Muss in sich geschlossen sein (wird per toString eingebettet).
 */
export function mealImageBoot() {
  const mark = (event: Event) => {
    const img = event.target;
    if (img instanceof HTMLImageElement && "mealImg" in img.dataset) {
      img.dataset.loaded = "";
    }
  };
  // am document, nicht am window: load-Events von Elementen erreichen das
  // window laut HTML-Spezifikation nicht (auch nicht in der Capture-Phase)
  document.addEventListener("load", mark, true);
  document.addEventListener("error", mark, true);
}
