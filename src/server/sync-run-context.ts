import { AsyncLocalStorage } from "node:async_hooks";

/** Ein Fehler, wie er während eines Sync-Laufs aufgetreten ist */
export type RunError = {
  fingerprint: string;
  source: string;
  message: string;
  level: "error" | "warn";
  /** Auftreten in diesem Lauf */
  occurrences: number;
  /** neu, wieder aufgetreten oder lange nicht gemeldet (log.ts) */
  noteworthy: boolean;
};

type RunContext = {
  id: string;
  errors: Map<string, RunError>;
  /** laufende DB-Schreibvorgänge von logError */
  pending: Promise<unknown>[];
};

const storage = new AsyncLocalStorage<RunContext>();

/**
 * Führt `fn` im Kontext eines Sync-Laufs aus: `logError` verknüpft Fehler
 * dann mit dem Lauf und sammelt sie für die Zusammenfassung, statt sie
 * einzeln an Telegram zu schicken (src/server/sync-summary.ts).
 */
export function runWithSyncRun<T>(
  id: string,
  fn: () => Promise<T>
): Promise<T> {
  return storage.run({ id, errors: new Map(), pending: [] }, fn);
}

export function currentSyncRun(): RunContext | undefined {
  return storage.getStore();
}

/** Fehler des Laufs, nachdem alle Schreibvorgänge abgeschlossen sind */
export async function collectRunErrors(run: RunContext): Promise<RunError[]> {
  await Promise.allSettled(run.pending);
  return [...run.errors.values()];
}
