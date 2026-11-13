import { describe, expect, test } from "bun:test";
import { createRateLimiter, RATE_LIMITS } from "./rate-limit";

describe("createRateLimiter", () => {
  const rule = { limit: 3, windowMs: 1000 };

  test("allows up to the limit per window", () => {
    let time = 0;
    const limiter = createRateLimiter(() => time);
    expect(limiter.take("a", rule)).toBe(true);
    expect(limiter.take("a", rule)).toBe(true);
    expect(limiter.take("a", rule)).toBe(true);
    expect(limiter.take("a", rule)).toBe(false);
    // andere Schlüssel sind unabhängig
    expect(limiter.take("b", rule)).toBe(true);
    time = 500;
    expect(limiter.take("a", rule)).toBe(false);
  });

  test("frees slots as the window slides", () => {
    let time = 0;
    const limiter = createRateLimiter(() => time);
    limiter.take("a", rule);
    time = 400;
    limiter.take("a", rule);
    limiter.take("a", rule);
    expect(limiter.take("a", rule)).toBe(false);
    // der erste Aufruf (t=0) fällt aus dem Fenster
    time = 1001;
    expect(limiter.take("a", rule)).toBe(true);
    expect(limiter.take("a", rule)).toBe(false);
  });

  test("rejected calls do not extend the block", () => {
    let time = 0;
    const limiter = createRateLimiter(() => time);
    for (let i = 0; i < 3; i++) {
      limiter.take("a", rule);
    }
    time = 900;
    expect(limiter.take("a", rule)).toBe(false);
    time = 1001;
    expect(limiter.take("a", rule)).toBe(true);
  });

  test("caps the number of keys, evicting the least recently used", () => {
    const limiter = createRateLimiter(() => 0, 3);
    limiter.take("a", rule);
    limiter.take("b", rule);
    limiter.take("c", rule);
    // "a" wieder benutzt: jetzt ist "b" der älteste
    limiter.take("a", rule);
    limiter.take("d", rule);
    expect(limiter.size).toBe(3);
    // "b" ist rausgeflogen und startet wieder bei null
    for (let i = 0; i < 3; i++) {
      expect(limiter.take("b", rule)).toBe(true);
    }
  });

  test("sweeps expired keys at most once per minute", () => {
    let time = 0;
    const limiter = createRateLimiter(() => time);
    limiter.take("a", rule);
    limiter.take("b", rule);
    const longest = Math.max(
      ...Object.values(RATE_LIMITS).map((r) => r.windowMs)
    );
    time = longest + 61_000;
    limiter.take("c", rule);
    expect(limiter.size).toBe(1);
  });
});
