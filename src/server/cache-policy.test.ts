import { describe, expect, test } from "bun:test";
import {
  dayPolicy,
  homePolicy,
  mealPolicy,
  tagsForSync,
  untilMidnight,
} from "./cache-policy";

// 2026-10-06 12:00 Berlin (CEST) = 10:00 UTC → 12 h bis Mitternacht
const noon = new Date("2026-10-06T10:00:00Z");
// 23:30 Berlin → 30 min bis Mitternacht
const lateEvening = new Date("2026-10-06T21:30:00Z");
const today = "2026-10-06";

describe("untilMidnight", () => {
  test("keeps rules that end before midnight", () => {
    expect(untilMidnight({ maxAge: 3600, swr: 600, tags: [] }, noon)).toEqual({
      maxAge: 3600,
      swr: 600,
      tags: [],
    });
  });

  test("caps maxAge and drops swr crossing midnight", () => {
    expect(
      untilMidnight({ maxAge: 6 * 3600, swr: 3600, tags: [] }, lateEvening)
    ).toEqual({ maxAge: 1800, tags: [] });
    // swr nur so weit, wie bis Mitternacht Platz ist
    expect(
      untilMidnight({ maxAge: 1200, swr: 3600, tags: [] }, lateEvening)
    ).toEqual({ maxAge: 1200, swr: 600, tags: [] });
  });
});

describe("page policies", () => {
  test("home expires at midnight", () => {
    expect(homePolicy(today, noon)).toEqual({
      maxAge: 12 * 3600,
      tags: ["meals", "home", "day:2026-10-06"],
    });
  });

  test("past days: long-lived but never past midnight", () => {
    expect(dayPolicy("2026-09-01", today, noon)).toEqual({
      maxAge: 12 * 3600,
      tags: ["day:2026-09-01"],
    });
  });

  test("today and future: 6h + 1h swr, capped at midnight", () => {
    expect(dayPolicy("2026-10-08", today, noon)).toEqual({
      maxAge: 6 * 3600,
      swr: 3600,
      tags: ["meals", "day:2026-10-08"],
    });
    expect(dayPolicy(today, today, lateEvening)).toEqual({
      maxAge: 1800,
      tags: ["meals", "day:2026-10-06"],
    });
  });

  test("meal page is tagged for sync and ratings", () => {
    expect(mealPolicy("m1").tags).toEqual(["meal:m1", "ratings:m1"]);
  });

  test("tags for a sync result", () => {
    expect(
      tagsForSync({ changedDates: ["2026-10-07"], changedMealIds: ["m1"] })
    ).toEqual(["day:2026-10-07", "meal:m1", "meal-stats:m1"]);
  });
});
