/**
 * Start-Wrapper (server/): Komprimierung und Cron-Aufrufe. Der Zusammenbau
 * mit dem echten Astro-Build wird E2E geprüft (docs, Phase 9).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { createCompression, negotiateEncoding } from "../server/compress.mjs";
import { SCHEDULES, startCron, triggerSync } from "../server/cron.mjs";

describe("negotiateEncoding", () => {
  test("prefers brotli, respects q=0", () => {
    expect(negotiateEncoding("gzip, deflate, br, zstd")).toBe("br");
    expect(negotiateEncoding("gzip")).toBe("gzip");
    expect(negotiateEncoding("br;q=0, gzip;q=0.5")).toBe("gzip");
    expect(negotiateEncoding("identity")).toBeNull();
    expect(negotiateEncoding("*")).toBe("br");
    expect(negotiateEncoding(undefined)).toBeNull();
  });
});

describe("compression middleware", () => {
  const html = `<!doctype html><p>${"Speiseplan ".repeat(2000)}</p>`;
  const compression = createCompression();
  let server: http.Server;
  let base: string;

  beforeAll(async () => {
    server = http.createServer((req, res) =>
      compression(req, res, () => {
        if (req.url === "/html") {
          // wie Astro: writeHead mit Header-Objekt, dann Chunks
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.write(html.slice(0, 5000));
          res.write(Buffer.from(html.slice(5000)));
          res.end();
        } else if (req.url === "/small") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end('{"ok":true}');
        } else if (req.url === "/image") {
          // wie send: setHeader + Stream
          res.setHeader("Content-Type", "image/avif");
          res.setHeader("Content-Length", "3000");
          res.end(Buffer.alloc(3000, 1));
        } else if (req.url === "/redirect") {
          res.writeHead(301, { location: "/" });
          res.end();
        } else {
          res.writeHead(500, { "content-type": "text/html" });
          res.end(html);
        }
      })
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  async function get(path: string, encoding?: string) {
    const res = await new Promise<http.IncomingMessage>((resolve) =>
      http.get(
        `${base}${path}`,
        { headers: encoding ? { "accept-encoding": encoding } : {} },
        resolve
      )
    );
    const chunks: Buffer[] = [];
    for await (const c of res) {
      chunks.push(c as Buffer);
    }
    return { res, raw: Buffer.concat(chunks) };
  }

  test("brotli and gzip, identical content, Vary + Content-Length", async () => {
    const br = await get("/html", "gzip, br");
    expect(br.res.headers["content-encoding"]).toBe("br");
    expect(br.res.headers.vary).toBe("Accept-Encoding");
    expect(Number(br.res.headers["content-length"])).toBe(br.raw.length);
    expect(zlib.brotliDecompressSync(br.raw).toString()).toBe(html);
    expect(br.raw.length).toBeLessThan(html.length / 10);

    const gz = await get("/html", "gzip");
    expect(gz.res.headers["content-encoding"]).toBe("gzip");
    expect(zlib.gunzipSync(gz.raw).toString()).toBe(html);
  });

  test("identical bodies come from the LRU", async () => {
    const before = compression.stats.lruHits;
    await get("/html", "br");
    await get("/html", "br");
    expect(compression.stats.lruHits).toBe(before + 2);
  });

  test("no compression without Accept-Encoding, for small bodies, images, redirects, errors", async () => {
    const plain = await get("/html");
    expect(plain.res.headers["content-encoding"]).toBeUndefined();
    expect(plain.raw.toString()).toBe(html);

    const small = await get("/small", "br");
    expect(small.res.headers["content-encoding"]).toBeUndefined();
    expect(small.raw.toString()).toBe('{"ok":true}');

    const image = await get("/image", "br");
    expect(image.res.headers["content-encoding"]).toBeUndefined();
    expect(image.raw.length).toBe(3000);

    const redirect = await get("/redirect", "br");
    expect(redirect.res.statusCode).toBe(301);
    expect(redirect.res.headers.location).toBe("/");

    const error = await get("/error", "br");
    expect(error.res.statusCode).toBe(500);
    expect(error.res.headers["content-encoding"]).toBeUndefined();
    expect(error.raw.toString()).toBe(html);
  });
});

describe("cron", () => {
  test("schedules match the previous _boot.ts", () => {
    expect(SCHEDULES).toEqual([
      { cron: "17 7,10,17 * * 1-5", scope: "today" },
      { cron: "17 2 * * 0-4", scope: "week" },
      { cron: "1 0 * * *", scope: "midnight" },
    ]);
  });

  test("triggerSync posts with bearer token and JSON content type", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(
        Response.json({ changedDates: ["2026-10-07"], changedMealIds: [] })
      );
    }) as unknown as typeof fetch;
    const ok = await triggerSync({
      baseUrl: "http://127.0.0.1:4321",
      token: "geheim",
      scope: "today",
      fetch: fake,
    });
    expect(ok).toBe(true);
    expect(calls[0].url).toBe("http://127.0.0.1:4321/api/sync?scope=today");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toEqual({
      Authorization: "Bearer geheim",
      "Content-Type": "application/json",
    });
  });

  test("triggerSync reports failures instead of throwing", async () => {
    const failing = (() =>
      Promise.resolve(
        Response.json({ error: "x" }, { status: 500 })
      )) as unknown as typeof fetch;
    expect(
      await triggerSync({
        baseUrl: "",
        token: "",
        scope: "week",
        fetch: failing,
      })
    ).toBe(false);
    const throwing = (() =>
      Promise.reject(new Error("down"))) as unknown as typeof fetch;
    expect(
      await triggerSync({
        baseUrl: "",
        token: "",
        scope: "week",
        fetch: throwing,
      })
    ).toBe(false);
  });

  test("startCron registers three jobs in Berlin time", () => {
    const cron = startCron({ baseUrl: "http://127.0.0.1:1", token: "x" });
    expect(cron.jobs).toHaveLength(3);
    const midnight = cron.jobs[2].nextDate().setZone("Europe/Berlin");
    expect([midnight.hour, midnight.minute]).toEqual([0, 1]);
    cron.stop();
    expect(cron.jobs.every((j) => !j.isActive)).toBe(true);
  });
});
