/**
 * Filter (Mensen, vegetarisch/vegan) werden rein per CSS angewendet: Die Seite
 * ist für alle gleich (gecacht), der Filterzustand lebt in Cookies.
 *
 * `filterBoot` wird als Inline-Script im <head> ausgeführt (siehe
 * layouts/plan-layout.astro), also vor dem ersten Paint – kein Flackern. Es
 * setzt `data-diet`, `data-filter-veggie/-vegan`, `data-filter-allergens` und
 * `data-filter-active` auf <html> und erzeugt CSS für die Mensa-Auswahl
 * (Gruppen und Sprungmarken), die Allergene (Karten mit `data-allergens`,
 * meal-card.astro) und die Chips „N Mensen“ / „Ohne N Allergene“ (statische
 * Regeln: styles/components.css). `hints` füllt je Mensa den Hinweis
 * „X Gerichte ausgeblendet“ (meal/hidden-meals-note.astro) und blendet
 * Bereiche ohne sichtbares Gericht aus; weil das Script im <head> läuft, ruft
 * meal-list.astro dafür nach der Liste `speislyFilters.refresh()` auf. Außerdem
 * stellt es `window.speislyFilters` bereit, über das der Store
 * (stores/filters.ts) Änderungen anwendet. Die Funktion muss in sich geschlossen sein, weil sie
 * per `toString()` inline eingebettet wird.
 */
export function filterBoot() {
  const COOKIES = {
    mensen: "speisly_mensa_preferences",
    veggie: "speisly_veggie_filter",
    vegan: "speisly_vegan_filter",
    allergens: "speisly_allergen_filter",
  };
  // biome-ignore lint/performance/useTopLevelRegex: Funktion muss in sich geschlossen sein (toString)
  const SAFE_ID = /^[A-Za-z0-9_-]+$/;
  // Allergen-Gruppen A–N (lib/allergens.ts)
  // biome-ignore lint/performance/useTopLevelRegex: Funktion muss in sich geschlossen sein (toString)
  const ALLERGEN = /^[A-N]$/;

  const readCookie = (key: string): string | null => {
    const parts = `; ${document.cookie}`.split(`; ${key}=`);
    return parts.length === 2 ? (parts.pop()?.split(";")[0] ?? null) : null;
  };

  const parseList = (raw: string | null): string[] => {
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
    selectedMensen: parseList(readCookie(COOKIES.mensen)),
    showVeggie: readCookie(COOKIES.veggie) === "true",
    showVegan: readCookie(COOKIES.vegan) === "true",
    hiddenAllergens: parseList(readCookie(COOKIES.allergens))
      .filter((code) => ALLERGEN.test(code))
      .sort(),
  };

  let current = state;

  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;

  // Hinweis je Mensa: Gerichte zählen, die Ernährungs- oder Allergen-Filter
  // ausblenden. Nur sichtbar, wenn > 0.
  const hints = () => {
    const diet = current.showVegan
      ? "vegan"
      : current.showVeggie
        ? "veggie"
        : "";
    const allergens = current.hiddenAllergens;
    for (const group of document.querySelectorAll<HTMLElement>(
      "[data-mensa-group]"
    )) {
      let total = 0;
      for (const block of group.querySelectorAll<HTMLElement>(
        "[data-meal-block]"
      )) {
        let visible = 0;
        for (const meal of block.querySelectorAll<HTMLElement>("[data-meal]")) {
          if (
            (diet && !meal.hasAttribute(`data-${diet}`)) ||
            (meal.dataset.allergens ?? "")
              .split(" ")
              .some((code) => allergens.includes(code))
          ) {
            total += 1;
          } else {
            visible += 1;
          }
        }
        block.toggleAttribute("data-all-hidden", visible === 0);
      }
      if (total === 0) {
        group.removeAttribute("data-show-all");
      }
      const note = group.querySelector<HTMLElement>("[data-hidden-note]");
      const text = note?.querySelector("[data-hidden-text]");
      const toggle = note?.querySelector("[data-hidden-toggle]");
      if (!(note && text && toggle)) {
        continue;
      }
      note.hidden = total === 0;
      if (group.hasAttribute("data-show-all")) {
        text.textContent =
          total === 1
            ? "1 ausgeblendetes Gericht wird angezeigt"
            : `${total} ausgeblendete Gerichte werden angezeigt`;
        toggle.textContent = "Wieder ausblenden";
      } else {
        text.textContent = `${plural(total, "Gericht", "Gerichte")} ausgeblendet`;
        toggle.textContent = "Anzeigen";
      }
    }
  };

  const apply = (next: typeof state) => {
    current = next;
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
        `:is([data-mensa-group],[data-mensa-jump]):not(:is(${sel})){display:none!important}` +
        `${none} :is(#mealslist,[data-mensa-nav]){display:none!important}` +
        `${none} [data-filter-empty]{display:contents!important}`;
    }
    // Chip „N Mensen“ (nicht bei „alle Mensen“ ausgewählt) und Punkt am
    // Filter-Button
    const count = next.selectedMensen.length;
    const mensaChip = count > 0 && count !== 7;
    if (mensaChip) {
      css += `[data-chip="mensen"]{display:inline-flex!important}[data-chip="mensen"] [data-chip-label]::before{content:"${count} ${count === 1 ? "Mensa" : "Mensen"}"}`;
    }
    // Allergene: Karten mit einer der Gruppen ausblenden, Chip „Ohne N Allergene“
    const allergens = next.hiddenAllergens.filter((code) =>
      ALLERGEN.test(code)
    );
    root.toggleAttribute("data-filter-allergens", allergens.length > 0);
    if (allergens.length > 0) {
      const sel = allergens
        .map((code) => `[data-allergens~="${code}"]`)
        .join(",");
      css +=
        `[data-meal]:is(${sel}):not([data-show-all] *){display:none!important}` +
        `[data-chip="allergens"]{display:inline-flex!important}[data-chip="allergens"] [data-chip-label]::before{content:"${allergens.length} ${allergens.length === 1 ? "Allergen" : "Allergene"}"}`;
    }
    root.toggleAttribute(
      "data-filter-active",
      mensaChip || next.showVeggie || next.showVegan || allergens.length > 0
    );
    let style = document.getElementById("speisly-mensa-filter");
    if (!style) {
      style = document.createElement("style");
      style.id = "speisly-mensa-filter";
      document.head.append(style);
    }
    style.textContent = css;
    // Geänderte Filter gelten wieder überall („Anzeigen“ endet)
    for (const group of document.querySelectorAll("[data-show-all]")) {
      group.removeAttribute("data-show-all");
    }
    hints();
  };

  apply(state);
  (window as Window & { speislyFilters?: unknown }).speislyFilters = {
    initial: state,
    apply,
    refresh: hints,
    cookies: COOKIES,
  };
}
