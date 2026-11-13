import { describe, expect, test } from "bun:test";
import { clientIp, RENEW_AFTER_SECONDS, shouldRenew } from "./user";

const headers = (xff?: string) =>
  new Headers(xff === undefined ? {} : { "x-forwarded-for": xff });

describe("clientIp", () => {
  test("Traefik default: the single entry Traefik set", () => {
    expect(clientIp(headers("203.0.113.7"))).toBe("203.0.113.7");
  });

  test("ignores entries the client sent itself (last one wins)", () => {
    // Client schickt „1.2.3.4“, Traefik hängt die echte Adresse an
    expect(clientIp(headers("1.2.3.4, 203.0.113.7"))).toBe("203.0.113.7");
    expect(clientIp(headers("1.2.3.4,203.0.113.7 , "))).toBe("203.0.113.7");
  });

  test("without proxy: socket address, else 'unknown'", () => {
    expect(clientIp(headers(), "127.0.0.1")).toBe("127.0.0.1");
    expect(clientIp(headers(""), "127.0.0.1")).toBe("127.0.0.1");
    expect(clientIp(headers())).toBe("unknown");
  });
});

describe("shouldRenew", () => {
  const now = Date.UTC(2026, 10, 13);
  const issued = (secondsAgo: number) => now / 1000 - secondsAgo;

  test("keeps fresh cookies", () => {
    expect(shouldRenew(issued(60), now)).toBe(false);
    expect(shouldRenew(issued(RENEW_AFTER_SECONDS - 1), now)).toBe(false);
  });

  test("renews cookies older than the threshold (else they expire after a year)", () => {
    expect(shouldRenew(issued(RENEW_AFTER_SECONDS + 1), now)).toBe(true);
    // ohne iat (alte Tokens) immer erneuern
    expect(shouldRenew(0, now)).toBe(true);
  });
});
