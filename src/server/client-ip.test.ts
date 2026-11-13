import { describe, expect, test } from "bun:test";
import { clientIp } from "./user";

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
