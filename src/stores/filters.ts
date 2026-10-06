import { atom } from "nanostores";

export type FilterState = {
  selectedMensen: string[];
  showVeggie: boolean;
  showVegan: boolean;
};

type FilterRuntime = {
  initial: FilterState;
  apply: (state: FilterState) => void;
  cookies: { mensen: string; veggie: string; vegan: string };
};

export const EMPTY_FILTERS: FilterState = {
  selectedMensen: [],
  showVeggie: false,
  showVegan: false,
};

/** Vom Inline-Script in filter-head.astro bereitgestellt (nur im Browser) */
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

const ONE_YEAR_DAYS = 365;

function writeCookie(key: string, value: string) {
  const expires = new Date(Date.now() + ONE_YEAR_DAYS * 86_400_000);
  // Format wie bisher (use-cookies.tsx), damit bestehende Cookies gültig bleiben
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API ist nicht überall verfügbar
  document.cookie = `${key}=${value};expires=${expires.toUTCString()};path=/`;
}

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
  rt.apply(next);
}

export const setSelectedMensen = (selectedMensen: string[]) =>
  update({ selectedMensen });
export const setShowVeggie = (showVeggie: boolean) => update({ showVeggie });
export const setShowVegan = (showVegan: boolean) => update({ showVegan });
