import { describe, expect, test } from "bun:test";
import { summarizeBreakdown } from "./ratings";

const row = (mensaId: string, date: string, count: number, sum: number) => ({
  mensaId,
  mensaName: mensaId === "wb" ? "Weinberg" : "Harzmensa",
  date: new Date(`${date}T00:00:00Z`),
  count,
  sum,
});

describe("summarizeBreakdown", () => {
  test("aggregates servings per mensa with weighted averages", () => {
    const result = summarizeBreakdown(
      [
        row("wb", "2026-11-12", 2, 9),
        row("hs", "2026-11-12", 1, 3),
        row("wb", "2026-11-05", 1, 2),
      ],
      2
    );
    expect(result.byMensa).toEqual([
      { mensaName: "Weinberg", count: 3, value: 3.7 },
      { mensaName: "Harzmensa", count: 1, value: 3 },
    ]);
    expect(result.byServing).toEqual([
      { mensaName: "Weinberg", date: "2026-11-12", count: 2, value: 4.5 },
      { mensaName: "Harzmensa", date: "2026-11-12", count: 1, value: 3 },
    ]);
    expect(result.servingCount).toBe(3);
  });

  test("empty input", () => {
    expect(summarizeBreakdown([], 6)).toEqual({
      byMensa: [],
      byServing: [],
      servingCount: 0,
    });
  });
});
