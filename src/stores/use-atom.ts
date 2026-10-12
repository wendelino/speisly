import type { ReadableAtom } from "nanostores";
import { useSyncExternalStore } from "react";

/**
 * Minimaler React-Hook für nanostores-Atoms. Die React-Teile werden nur im
 * Browser gemountet (components/on-demand.tsx), daher kein eigener
 * Server-Snapshot.
 */
export function useAtom<T>(store: ReadableAtom<T>): T {
  const get = () => store.get();
  return useSyncExternalStore((onChange) => store.listen(onChange), get, get);
}
