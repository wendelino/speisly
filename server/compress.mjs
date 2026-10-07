import { createHash } from "node:crypto";
import { promisify } from "node:util";
import zlib from "node:zlib";

/**
 * Antwort-Komprimierung (Brotli/gzip) für den Start-Wrapper (server/index.mjs).
 * `@astrojs/node` komprimiert nicht selbst; Next tat es, darum war das HTML in
 * Produktion bisher komprimiert.
 *
 * Gecachte Seiten sind zwischen zwei Aufrufen Byte für Byte gleich. Die
 * komprimierte Fassung wird deshalb über einen Hash des Inhalts in einem
 * kleinen LRU gehalten: Ein Cache-HIT kostet so nur den Hash (~0,3 ms)
 * statt einer neuen Komprimierung (~1,5–2,5 ms für 300 KB HTML).
 */

const COMPRESSIBLE =
  /^(text\/|application\/(json|javascript|manifest\+json|xml)|image\/svg\+xml)/i;
const VARY_ACCEPT_ENCODING = /accept-encoding/i;
const MIN_BYTES = 1024;
/** Größere Antworten werden komprimiert, aber nicht im LRU gehalten */
const MAX_CACHEABLE_BYTES = 2 * 1024 * 1024;

/**
 * Inhalts-Hash als LRU-Schlüssel. Unter Bun wyhash (64 Bit, ~30 µs für
 * 300 KB), sonst SHA-1 (~350 µs).
 * @type {(body: Buffer) => string}
 */
const contentHash =
  typeof globalThis.Bun?.hash === "function"
    ? (body) => `${globalThis.Bun.hash(body).toString(36)}.${body.length}`
    : (body) => createHash("sha1").update(body).digest("base64");

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

/**
 * Wählt die Kodierung aus `Accept-Encoding` (Brotli vor gzip, `q=0` = nein).
 * @param {string | undefined} header
 * @returns {"br" | "gzip" | null}
 */
export function negotiateEncoding(header) {
  if (!header) {
    return null;
  }
  /** @type {Map<string, number>} */
  const accepted = new Map();
  for (const part of header.toLowerCase().split(",")) {
    const [name, ...params] = part.trim().split(";");
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    accepted.set(name.trim(), q ? Number(q.slice(2)) : 1);
  }
  const ok = (/** @type {string} */ enc) =>
    (accepted.get(enc) ?? accepted.get("*") ?? 0) > 0;
  if (ok("br")) {
    return "br";
  }
  if (ok("gzip")) {
    return "gzip";
  }
  return null;
}

/**
 * @param {"br" | "gzip"} encoding
 * @param {Buffer} body
 */
function compressBody(encoding, body) {
  return encoding === "br"
    ? brotli(body, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length,
        },
      })
    : gzip(body, { level: 6 });
}

/**
 * @param {{ maxEntries?: number, maxBytes?: number }} [options]
 */
export function createCompression({
  maxEntries = 500,
  maxBytes = 32 * 1024 * 1024,
} = {}) {
  /** @type {Map<string, Buffer>} */
  const lru = new Map();
  let lruBytes = 0;
  const stats = { compressed: 0, lruHits: 0, passthrough: 0 };

  /**
   * @param {"br" | "gzip"} encoding
   * @param {Buffer} body
   */
  async function compressCached(encoding, body) {
    if (body.length > MAX_CACHEABLE_BYTES) {
      return compressBody(encoding, body);
    }
    const key = `${encoding}:${contentHash(body)}`;
    const hit = lru.get(key);
    if (hit) {
      lru.delete(key);
      lru.set(key, hit);
      stats.lruHits += 1;
      return hit;
    }
    const out = await compressBody(encoding, body);
    lru.set(key, out);
    lruBytes += out.length;
    for (const [oldKey, old] of lru) {
      if (lru.size <= maxEntries && lruBytes <= maxBytes) {
        break;
      }
      lru.delete(oldKey);
      lruBytes -= old.length;
    }
    return out;
  }

  /**
   * Middleware im Node-Stil: fängt writeHead/write/end der Antwort ab,
   * puffert komprimierbare Antworten und sendet sie komprimiert.
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   * @param {() => void} next
   */
  function middleware(req, res, next) {
    const encoding =
      req.method === "GET"
        ? negotiateEncoding(req.headers["accept-encoding"])
        : null;
    if (!encoding) {
      next();
      return;
    }

    const original = {
      writeHead: res.writeHead,
      write: res.write,
      end: res.end,
    };
    /** @type {"buffer" | "pass" | null} */
    let mode = null;
    /** @type {Buffer[]} */
    const chunks = [];

    const restore = () => {
      res.writeHead = original.writeHead;
      res.write = original.write;
      res.end = original.end;
    };

    const decide = () => {
      if (mode) {
        return mode;
      }
      const type = String(res.getHeader("content-type") ?? "");
      const cacheControl = String(res.getHeader("cache-control") ?? "");
      const compressible =
        (res.statusCode === 200 || res.statusCode === 404) &&
        COMPRESSIBLE.test(type) &&
        !res.getHeader("content-encoding") &&
        !cacheControl.includes("no-transform");
      mode = compressible ? "buffer" : "pass";
      if (mode === "pass") {
        stats.passthrough += 1;
        restore();
      }
      return mode;
    };

    /** @param {unknown} chunk @param {unknown} [enc] */
    const toBuffer = (chunk, enc) =>
      Buffer.isBuffer(chunk)
        ? chunk
        : typeof chunk === "string"
          ? Buffer.from(
              chunk,
              /** @type {BufferEncoding} */ (
                typeof enc === "string" ? enc : "utf8"
              )
            )
          : Buffer.from(/** @type {Uint8Array} */ (chunk));

    // Header aus writeHead() sofort übernehmen, gesendet wird erst später
    /** @type {any} */
    const patchedWriteHead = (
      /** @type {number} */ status,
      /** @type {any} */ a,
      /** @type {any} */ b
    ) => {
      res.statusCode = status;
      let headers = a;
      if (typeof a === "string") {
        res.statusMessage = a;
        headers = b;
      }
      if (Array.isArray(headers)) {
        for (let i = 0; i + 1 < headers.length; i += 2) {
          res.setHeader(headers[i], headers[i + 1]);
        }
      } else if (headers) {
        for (const [key, value] of Object.entries(headers)) {
          if (value !== undefined) {
            res.setHeader(key, value);
          }
        }
      }
      return res;
    };
    res.writeHead = patchedWriteHead;

    /** @type {any} */
    const patchedWrite = (
      /** @type {unknown} */ chunk,
      /** @type {unknown} */ enc,
      /** @type {unknown} */ cb
    ) => {
      if (decide() === "pass") {
        return res.write(
          /** @type {any} */ (chunk),
          /** @type {any} */ (enc),
          /** @type {any} */ (cb)
        );
      }
      chunks.push(toBuffer(chunk, enc));
      const callback = typeof enc === "function" ? enc : cb;
      if (typeof callback === "function") {
        process.nextTick(callback);
      }
      return true;
    };
    res.write = patchedWrite;

    /** @type {any} */
    const patchedEnd = (
      /** @type {unknown} */ chunk,
      /** @type {unknown} */ enc,
      /** @type {unknown} */ cb
    ) => {
      if (decide() === "pass") {
        return res.end(
          /** @type {any} */ (chunk),
          /** @type {any} */ (enc),
          /** @type {any} */ (cb)
        );
      }
      if (
        chunk !== null &&
        chunk !== undefined &&
        typeof chunk !== "function"
      ) {
        chunks.push(toBuffer(chunk, enc));
      }
      restore();
      const body = Buffer.concat(chunks);
      const vary = String(res.getHeader("vary") ?? "");
      if (!VARY_ACCEPT_ENCODING.test(vary)) {
        res.setHeader(
          "Vary",
          vary ? `${vary}, Accept-Encoding` : "Accept-Encoding"
        );
      }
      if (body.length < MIN_BYTES) {
        res.setHeader("Content-Length", body.length);
        res.end(body);
        return res;
      }
      compressCached(encoding, body).then(
        (out) => {
          stats.compressed += 1;
          res.setHeader("Content-Encoding", encoding);
          res.setHeader("Content-Length", out.length);
          res.end(out);
        },
        (error) => {
          console.error("[compress] failed, sending uncompressed", error);
          res.setHeader("Content-Length", body.length);
          res.end(body);
        }
      );
      return res;
    };
    res.end = patchedEnd;

    next();
  }

  return Object.assign(middleware, { stats, lru });
}
