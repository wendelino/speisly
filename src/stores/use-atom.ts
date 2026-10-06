import type { ReadableAtom } from "nanostores";
import { useSyncExternalStore } from "react";

/** Minimaler React-Hook für nanostores-Atoms (Server-Snapshot = Initialwert) */
export function useAtom<T>(store: ReadableAtom<T>, serverValue: T): T {
  return useSyncExternalStore(
    (onChange) => store.listen(onChange),
    () => store.get(),
    () => serverValue
  );
}
