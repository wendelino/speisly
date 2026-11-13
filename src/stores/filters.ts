import { atom } from "nanostores";
import type { AllergenCode } from "@/lib/allergens";
import { writeCookie } from "@/lib/cookies";

/** Sortierung der Gerichte je Mensa (CSS `order`, meal.css) */
export type SortMode = "default" | "price-asc" | "price-desc" | "rating";
export const SORT_MODES: readonly SortMode[] = [
  "default",
  "price-asc",
  "price-desc",
  "rating",
];

export type FilterState = {
  selectedMensen: string[];
  showVeggie: boolean;
  showVegan: boolean;
  /** Allergen-Gruppen (Buchstabencodes), deren Gerichte ausgeblendet sind */
  hiddenAllergens: AllergenCode[];
  sort: SortMode;
};

type FilterRuntime = {
  initial: FilterState;
  apply: (state: FilterState) => void;
  cookies: {
    mensen: string;
    veggie: string;
    vegan: string;
    allergens: string;
    sort: string;
  };
};

const EMPTY_FILTERS: FilterState = {
  selectedMensen: [],
  showVeggie: false,
  showVegan: false,
  hiddenAllergens: [],
  sort: "default",
};

/** Vom Inline-Script in layouts/plan-layout.astro bereitgestellt (nur im Browser) */
function runtime(): FilterRuntime | undefined {
  return typeof window === "undefined"
    ? undefined
    : (window as Window & { speislyFilters?: FilterRuntime }).speislyFilters;
}

/**
 * Gemeinsamer Filterzustand für alle Islands und Scripts einer Seite.
 * Ersetzt den React-Context (Islands sind getrennte React-Roots).
 */
export const $filters = atom<FilterState>(runtime()?.initial ?? EMPTY_FILTERS);

function update(patch: Partial<FilterState>) {
  const next = { ...$filters.get(), ...patch };
  $filters.set(next);
  const rt = runtime();
  if (!rt) {
    return;
  }
  writeCookie(rt.cookies.mensen, JSON.stringify(next.selectedMensen));
  writeCookie(rt.cookies.veggie, next.showVeggie ? "true" : "false");
  writeCookie(rt.cookies.vegan, next.showVegan ? "true" : "false");
  writeCookie(rt.cookies.allergens, JSON.stringify(next.hiddenAllergens));
  writeCookie(rt.cookies.sort, next.sort);
  rt.apply(next);
}

export const setSelectedMensen = (selectedMensen: string[]) =>
  update({ selectedMensen });
export const setShowVeggie = (showVeggie: boolean) => update({ showVeggie });
export const setShowVegan = (showVegan: boolean) => update({ showVegan });
export const setHiddenAllergens = (hiddenAllergens: AllergenCode[]) =>
  update({ hiddenAllergens: [...new Set(hiddenAllergens)].sort() });
export const setSort = (sort: SortMode) => update({ sort });
