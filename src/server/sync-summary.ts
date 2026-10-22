import { formatDecimal } from "@/lib/format";
import { markNotified } from "./log";
import type { RunError } from "./sync-run-context";
import type { SyncCounts, SyncScope, SyncStatus } from "./sync-runs";
import { sendTelegramMessage } from "./telegram";

export type RunSummary = {
  scope: SyncScope;
  status: SyncStatus;
  durationMs: number;
  counts: SyncCounts;
  errors: RunError[];
};

const STATUS_LABEL: Record<SyncStatus, string> = {
  running: "läuft",
  success: "erfolgreich",
  partial: "teilweise",
  failed: "fehlgeschlagen",
};

/**
 * Gemeldet wird ein Lauf nur bei Fehlern: nicht glatt gelaufen, neue bzw.
 * wiederkehrende Fehler oder Notbremse. Erfolgreiche Läufe bleiben still,
 * ihre Zahlen stehen im Admin-Bereich (/admin/sync).
 */
export function shouldReport({ status, counts, errors }: RunSummary) {
  return (
    status !== "success" ||
    counts.massRemoval ||
    errors.some((e) => e.noteworthy)
  );
}

/** Fehlermeldung zum Lauf: Status, Notbremse und neue Fehler */
export function formatSummary({
  scope,
  status,
  durationMs,
  counts,
  errors,
}: RunSummary): string {
  const lines = [
    `Sync ${scope}: ${STATUS_LABEL[status]} (${formatDecimal(durationMs / 1000)} s)`,
  ];
  if (counts.massRemoval) {
    lines.push("Notbremse gezogen – keine Ausgaben entfernt.");
  }
  const noteworthy = errors.filter((e) => e.noteworthy);
  if (noteworthy.length > 0) {
    lines.push("", "Fehler:");
    for (const e of noteworthy) {
      const times = e.occurrences > 1 ? ` ×${e.occurrences}` : "";
      lines.push(`• [${e.source}] ${e.message}${times}`);
    }
  }
  return lines.join("\n");
}

/** Schickt die Meldung, falls der Lauf Fehler hatte, und merkt sich das */
export async function reportSyncRun(summary: RunSummary): Promise<void> {
  if (!shouldReport(summary)) {
    return;
  }
  await sendTelegramMessage(formatSummary(summary));
  await markNotified(
    summary.errors.filter((e) => e.noteworthy).map((e) => e.fingerprint)
  );
}
