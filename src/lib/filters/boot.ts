/**
 * Filter (Mensen, vegetarisch/vegan) werden rein per CSS angewendet: Die Seite
 * ist für alle gleich (gecacht), der Filterzustand lebt in Cookies.
 *
 * `filterBoot` wird als Inline-Script im <head> ausgeführt (siehe
 * filter-head.astro), also vor dem ersten Paint – kein Flackern. Es setzt
 * `data-diet` und `data-filter-veggie/-vegan` auf <html> und erzeugt CSS für
 * die Mensa-Auswahl und den Mensa-Chip. Außerdem stellt
 * es `window.speislyFilters` bereit, über das der Store (stores/filters.ts)
 * Änderungen anwendet. Die Funktion muss in sich geschlossen sein, weil sie
 * per `toString()` inline eingebettet wird.
 */
export function filterBoot() {
  const COOKIES = {
    mensen: "speisly_mensa_preferences",
    veggie: "speisly_veggie_filter",
    vegan: "speisly_vegan_filter",
  };
  // biome-ignore lint/performance/useTopLevelRegex: Funktion muss in sich geschlossen sein (toString)
  const SAFE_ID = /^[A-Za-z0-9_-]+$/;

  const readCookie = (key: string): string | null => {
    const parts = `; ${document.cookie}`.split(`; ${key}=`);
    return parts.length === 2 ? (parts.pop()?.split(";")[0] ?? null) : null;
  };

  const parseMensen = (raw: string | null): string[] => {
    if (!raw) {
      return [];
    }
    for (const candidate of [raw, decodeURIComponent(raw)]) {
      try {
        const value: unknown = JSON.parse(candidate);
        if (Array.isArray(value)) {
          return value.filter((v): v is string => typeof v === "string");
        }
      } catch {
        // nächste Variante probieren
      }
    }
    return [];
  };

  const state = {
    selectedMensen: parseMensen(readCookie(COOKIES.mensen)),
    showVeggie: readCookie(COOKIES.veggie) === "true",
    showVegan: readCookie(COOKIES.vegan) === "true",
  };

  const apply = (next: typeof state) => {
    const root = document.documentElement;
    const diet = next.showVegan ? "vegan" : next.showVeggie ? "veggie" : "";
    if (diet) {
      root.dataset.diet = diet;
    } else {
      delete root.dataset.diet;
    }
    // Chips am Filter-Button (filter-fab.astro)
    root.toggleAttribute("data-filter-veggie", next.showVeggie);
    root.toggleAttribute("data-filter-vegan", next.showVegan);

    const ids = next.selectedMensen.filter((id) => SAFE_ID.test(id));
    let css = "";
    if (ids.length > 0) {
      const sel = ids.map((id) => `[data-mensa-id="${id}"]`).join(",");
      const none = `html:not(:has(#mealslist :is(${sel})))`;
      css =
        `[data-mensa-group]:not(:is(${sel})){display:none!important}` +
        `${none} #mealslist{display:none!important}` +
        `${none} [data-filter-empty]{display:contents!important}`;
    }
    // Chip „N Mensen“ (nicht bei „alle Mensen“ ausgewählt)
    const count = next.selectedMensen.length;
    if (count > 0 && count !== 7) {
      css += `[data-chip="mensen"]{display:inline-flex!important}[data-chip-label]::before{content:"${count} Mensen "}`;
    }
    let style = document.getElementById("speisly-mensa-filter");
    if (!style) {
      style = document.createElement("style");
      style.id = "speisly-mensa-filter";
      document.head.append(style);
    }
    style.textContent = css;
  };

  apply(state);
  (window as Window & { speislyFilters?: unknown }).speislyFilters = {
    initial: state,
    apply,
    cookies: COOKIES,
  };
}
