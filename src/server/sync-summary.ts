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
 * Gemeldet wird ein Lauf, wenn er nicht glatt lief, neue bzw. wiederkehrende
 * Fehler hatte oder die Notbremse gezogen hat – der nächtliche Wochen-Sync
 * immer. Ruhige Läufe tagsüber bleiben still.
 */
export function shouldReport({ scope, status, counts, errors }: RunSummary) {
  return (
    status !== "success" ||
    counts.massRemoval ||
    errors.some((e) => e.noteworthy) ||
    scope === "week"
  );
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function formatSummary({
  scope,
  status,
  durationMs,
  counts: c,
  errors,
}: RunSummary): string {
  const lines = [
    `Sync ${scope}: ${STATUS_LABEL[status]} (${formatDecimal(durationMs / 1000)} s)`,
  ];
  if (scope === "today" || scope === "week") {
    lines.push(
      `Neu: ${plural(c.newMeals, "Gericht", "Gerichte")}, ${plural(c.newServings, "Ausgabe", "Ausgaben")}`,
      `Geändert: ${plural(c.changedMeals, "Gericht", "Gerichte")}`,
      `Entfernt: ${plural(c.removedServings, "Ausgabe", "Ausgaben")} (${c.keptServings} behalten)`,
      `Bilder: ${c.imagesCreated} neu, ${c.imagesFailed} fehlgeschlagen`
    );
  }
  if (c.massRemoval) {
    lines.push("Notbremse gezogen – keine Ausgaben entfernt.");
  }
  const noteworthy = errors.filter((e) => e.noteworthy);
  const known = errors.length - noteworthy.length;
  if (errors.length > 0) {
    lines.push("", "Fehler:");
    for (const e of noteworthy) {
      const times = e.occurrences > 1 ? ` ×${e.occurrences}` : "";
      lines.push(`• [${e.source}] ${e.message}${times}`);
    }
    if (known > 0) {
      lines.push(
        `+ ${plural(known, "bekannte Meldung", "bekannte Meldungen")}`
      );
    }
  }
  return lines.join("\n");
}

/** Schickt die Zusammenfassung, falls meldenswert, und merkt sich das */
export async function reportSyncRun(summary: RunSummary): Promise<void> {
  if (!shouldReport(summary)) {
    return;
  }
  await sendTelegramMessage(formatSummary(summary));
  await markNotified(
    summary.errors.filter((e) => e.noteworthy).map((e) => e.fingerprint)
  );
}
