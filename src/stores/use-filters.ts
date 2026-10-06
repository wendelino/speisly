import { $filters, EMPTY_FILTERS, type FilterState } from "./filters";
import { useAtom } from "./use-atom";

/**
 * Filterzustand für React-Komponenten. Ein Server-Render sieht den leeren
 * Zustand (die gecachte Seite kennt keine Cookies), im Browser gilt der echte.
 */
export function useFilterState(): FilterState {
  return useAtom($filters, EMPTY_FILTERS);
}
