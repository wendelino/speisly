import { describe, expect, test } from "bun:test";
import { formatIsoDay } from "./format-day";

describe("formatIsoDay", () => {
  const today = "2026-10-06"; // Dienstag

  test("relative labels around today", () => {
    expect(formatIsoDay("2026-10-04", today)).toBe("Vorgestern");
    expect(formatIsoDay("2026-10-05", today)).toBe("Gestern");
    expect(formatIsoDay("2026-10-06", today)).toBe("Heute");
    expect(formatIsoDay("2026-10-07", today)).toBe("Morgen");
    expect(formatIsoDay("2026-10-08", today)).toBe("Übermorgen");
  });

  test("weekday within the last week, date otherwise", () => {
    expect(formatIsoDay("2026-10-01", today)).toBe("Donnerstag");
    expect(formatIsoDay("2026-09-30", today)).toBe("Mittwoch");
    expect(formatIsoDay("2026-09-29", today, "EEEE, dd.MM.yy")).toBe(
      "Dienstag, 29.09.26"
    );
    expect(formatIsoDay("2026-10-10", today, "EEEE, dd.MM.yy")).toBe(
      "Samstag, 10.10.26"
    );
  });
});
