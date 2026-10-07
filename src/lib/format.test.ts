import { describe, expect, test } from "bun:test";
import { formatDecimal, formatEuro, formatRelativeDay } from "./format";

describe("formatRelativeDay", () => {
  const today = "2026-10-06"; // Dienstag

  test("relative labels around today", () => {
    expect(formatRelativeDay("2026-10-04", today)).toBe("Vorgestern");
    expect(formatRelativeDay("2026-10-05", today)).toBe("Gestern");
    expect(formatRelativeDay("2026-10-06", today)).toBe("Heute");
    expect(formatRelativeDay("2026-10-07", today)).toBe("Morgen");
    expect(formatRelativeDay("2026-10-08", today)).toBe("Übermorgen");
  });

  test("weekday within the last week, weekday and date otherwise", () => {
    expect(formatRelativeDay("2026-10-01", today)).toBe("Donnerstag");
    expect(formatRelativeDay("2026-09-30", today)).toBe("Mittwoch");
    expect(formatRelativeDay("2026-09-29", today)).toBe("Dienstag, 29.09.26");
    expect(formatRelativeDay("2026-10-10", today)).toBe("Samstag, 10.10.26");
  });
});

describe("number formats", () => {
  test("decimal comma", () => {
    expect(formatDecimal(4.25)).toBe("4,3");
    expect(formatDecimal(3)).toBe("3,0");
  });

  test("euro from cents", () => {
    expect(formatEuro(526)).toBe("5,26");
    expect(formatEuro(90)).toBe("0,90");
  });
});
