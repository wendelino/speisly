import { describe, expect, test } from "bun:test";
import { isForbiddenCrossSite, originsOf } from "./origin-check";

// so sieht die Request-URL hinter dem Proxy aus (server/index.mjs)
const ALLOWED = originsOf(
  "http://speisly.de/admin/errors",
  "https://speisly.de",
  undefined
);
const FORM = "application/x-www-form-urlencoded";

function post(headers: Record<string, string>) {
  return new Request("http://speisly.de/admin/errors", {
    method: "POST",
    headers,
  });
}

describe("isForbiddenCrossSite", () => {
  test("form from the site itself behind the proxy", () => {
    expect(
      isForbiddenCrossSite(
        post({ "content-type": FORM, origin: "https://speisly.de" }),
        ALLOWED
      )
    ).toBe(false);
  });

  test("Sec-Fetch-Site same-origin counts (e.g. localhost)", () => {
    expect(
      isForbiddenCrossSite(
        post({
          "content-type": FORM,
          origin: "http://localhost:4321",
          "sec-fetch-site": "same-origin",
        }),
        ALLOWED
      )
    ).toBe(false);
  });

  test("forms from other sites are forbidden", () => {
    expect(
      isForbiddenCrossSite(
        post({
          "content-type": FORM,
          origin: "https://evil.test",
          "sec-fetch-site": "cross-site",
        }),
        ALLOWED
      )
    ).toBe(true);
    expect(
      isForbiddenCrossSite(
        post({
          "content-type": "multipart/form-data; boundary=x",
          origin: "https://stats.speisly.de",
          "sec-fetch-site": "same-site",
        }),
        ALLOWED
      )
    ).toBe(true);
    // ohne Content-Type und ohne Origin wie bei Astro verboten
    expect(isForbiddenCrossSite(post({}), ALLOWED)).toBe(true);
  });

  test("JSON and safe methods are not checked", () => {
    expect(
      isForbiddenCrossSite(post({ "content-type": "application/json" }), [])
    ).toBe(false);
    expect(
      isForbiddenCrossSite(new Request("http://speisly.de/admin"), [])
    ).toBe(false);
  });
});
