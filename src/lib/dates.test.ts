import { describe, expect, test } from "bun:test";
import {
  addDays,
  berlinMidnight,
  diffDays,
  isIsoDay,
  parseDayParam,
  secondsUntilBerlinMidnight,
  todayBerlin,
  toIsoDay,
  toUtcDate,
} from "./dates";

describe("todayBerlin", () => {
  test("uses Berlin date, not UTC, around midnight", () => {
    // 22:30 UTC = 00:30 Berlin (CEST) on the next day
    expect(todayBerlin(new Date("2026-10-05T22:30:00Z"))).toBe("2026-10-06");
    expect(todayBerlin(new Date("2026-10-05T21:59:59Z"))).toBe("2026-10-05");
    // winter time: 23:30 UTC = 00:30 CET
    expect(todayBerlin(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-02");
  });
});

describe("iso day helpers", () => {
  test("round-trips through UTC midnight", () => {
    expect(toUtcDate("2026-10-06").toISOString()).toBe(
      "2026-10-06T00:00:00.000Z"
    );
    expect(toIsoDay(toUtcDate("2026-02-28"))).toBe("2026-02-28");
  });

  test("addDays and diffDays cross month and DST boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(diffDays("2026-10-06", "2026-10-20")).toBe(14);
    expect(diffDays("2026-10-06", "2025-10-06")).toBe(-365);
  });

  test("isIsoDay rejects malformed and impossible dates", () => {
    expect(isIsoDay("2026-10-06")).toBe(true);
    expect(isIsoDay("2028-02-29")).toBe(true);
    expect(isIsoDay("2026-02-29")).toBe(false);
    expect(isIsoDay("2026-13-01")).toBe(false);
    expect(isIsoDay("2026-10-6")).toBe(false);
    expect(isIsoDay("heute")).toBe(false);
    expect(isIsoDay("2026-10-06T00:00")).toBe(false);
  });
});

describe("parseDayParam", () => {
  const today = "2026-10-06";

  test("accepts dates inside the window", () => {
    expect(parseDayParam("2026-10-06", today)).toBe("2026-10-06");
    expect(parseDayParam("2026-10-20", today)).toBe("2026-10-20");
    expect(parseDayParam("2025-10-06", today)).toBe("2025-10-06");
  });

  test("rejects dates outside the window", () => {
    expect(parseDayParam("2026-10-21", today)).toBeNull();
    expect(parseDayParam("2025-10-05", today)).toBeNull();
    expect(parseDayParam("2099-01-01", today)).toBeNull();
  });

  test("rejects non-dates", () => {
    expect(parseDayParam(undefined, today)).toBeNull();
    expect(parseDayParam("", today)).toBeNull();
    expect(parseDayParam("heute", today)).toBeNull();
    expect(parseDayParam("2026-02-30", today)).toBeNull();
  });
});

describe("berlinMidnight / secondsUntilBerlinMidnight", () => {
  test("midnight in summer and winter time", () => {
    expect(new Date(berlinMidnight("2026-10-06")).toISOString()).toBe(
      "2026-10-05T22:00:00.000Z"
    );
    expect(new Date(berlinMidnight("2026-12-02")).toISOString()).toBe(
      "2026-12-01T23:00:00.000Z"
    );
  });

  test("midnight right before and after DST changes", () => {
    // DST starts 2026-03-29 02:00 CET, ends 2026-10-25 03:00 CEST
    expect(new Date(berlinMidnight("2026-03-29")).toISOString()).toBe(
      "2026-03-28T23:00:00.000Z"
    );
    expect(new Date(berlinMidnight("2026-03-30")).toISOString()).toBe(
      "2026-03-29T22:00:00.000Z"
    );
    expect(new Date(berlinMidnight("2026-10-25")).toISOString()).toBe(
      "2026-10-24T22:00:00.000Z"
    );
    expect(new Date(berlinMidnight("2026-10-26")).toISOString()).toBe(
      "2026-10-25T23:00:00.000Z"
    );
  });

  test("counts real seconds, including 23h and 25h days", () => {
    // 12:00 CEST → 12 h
    expect(secondsUntilBerlinMidnight(new Date("2026-10-06T10:00:00Z"))).toBe(
      12 * 3600
    );
    // 00:30 CET on the 23h day (2026-03-29) → 22.5 h
    expect(secondsUntilBerlinMidnight(new Date("2026-03-28T23:30:00Z"))).toBe(
      22.5 * 3600
    );
    // 00:30 CEST on the 25h day (2026-10-25) → 24.5 h
    expect(secondsUntilBerlinMidnight(new Date("2026-10-24T22:30:00Z"))).toBe(
      24.5 * 3600
    );
    // one second before midnight
    expect(secondsUntilBerlinMidnight(new Date("2026-10-06T21:59:59Z"))).toBe(
      1
    );
  });
});
