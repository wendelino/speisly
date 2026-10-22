import { describe, expect, test } from "bun:test";
import { EMPTY_COUNTS } from "./sync-runs";
import { formatSummary, type RunSummary, shouldReport } from "./sync-summary";

const quiet: RunSummary = {
  scope: "today",
  status: "success",
  durationMs: 2345,
  counts: EMPTY_COUNTS,
  errors: [],
};
const error = (message: string, noteworthy: boolean, occurrences = 1) => ({
  fingerprint: message,
  source: "sync",
  message,
  level: "error" as const,
  occurrences,
  noteworthy,
});

describe("shouldReport", () => {
  test("quiet daytime runs stay silent", () => {
    expect(shouldReport(quiet)).toBe(false);
    expect(
      shouldReport({ ...quiet, errors: [error("Price is 0", false)] })
    ).toBe(false);
  });

  test("failures, the brake, new errors and the weekly sync are reported", () => {
    expect(shouldReport({ ...quiet, status: "failed" })).toBe(true);
    expect(shouldReport({ ...quiet, status: "partial" })).toBe(true);
    expect(
      shouldReport({ ...quiet, counts: { ...EMPTY_COUNTS, massRemoval: true } })
    ).toBe(true);
    expect(shouldReport({ ...quiet, errors: [error("Neu", true)] })).toBe(true);
    expect(shouldReport({ ...quiet, scope: "week" })).toBe(true);
  });
});

describe("formatSummary", () => {
  test("counts, new errors and a hint for known ones", () => {
    const text = formatSummary({
      scope: "week",
      status: "partial",
      durationMs: 12_345,
      counts: {
        ...EMPTY_COUNTS,
        newMeals: 1,
        newServings: 40,
        changedMeals: 3,
        removedServings: 2,
        keptServings: 1,
        imagesCreated: 4,
        imagesFailed: 1,
        massRemoval: true,
      },
      errors: [
        error("Error creating meal", true, 2),
        error("Price is 0", false, 5),
        error("Mensa not found", false),
      ],
    });
    expect(text).toBe(
      [
        "Sync week: teilweise (12,3 s)",
        "Neu: 1 Gericht, 40 Ausgaben",
        "Geändert: 3 Gerichte",
        "Entfernt: 2 Ausgaben (1 behalten)",
        "Bilder: 4 neu, 1 fehlgeschlagen",
        "Notbremse gezogen – keine Ausgaben entfernt.",
        "",
        "Fehler:",
        "• [sync] Error creating meal ×2",
        "+ 2 bekannte Meldungen",
      ].join("\n")
    );
  });

  test("runs without a data sync only show the status", () => {
    expect(
      formatSummary({ ...quiet, scope: "midnight", status: "failed" })
    ).toBe("Sync midnight: fehlgeschlagen (2,3 s)");
  });
});
