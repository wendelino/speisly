/**
 * Lokaler gzip-Proxy für Messungen: simuliert den komprimierenden Reverse
 * Proxy der Produktion vor @astrojs/node (der selbst nicht komprimiert).
 *
 * Aufruf: bun scripts/perf/compress-proxy.ts --upstream http://127.0.0.1:4321 --port 4322
 */
import { parseArgs } from "node:util";
import { serve } from "bun";

const { values: args } = parseArgs({
  options: {
    upstream: { type: "string", default: "http://127.0.0.1:4321" },
    port: { type: "string", default: "4322" },
  },
});

const COMPRESSIBLE =
  /^(text\/|application\/(javascript|json|manifest\+json|xml))/;
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-length",
];

serve({
  port: Number(args.port),
  async fetch(request) {
    const url = new URL(request.url);
    const upstream = await fetch(args.upstream + url.pathname + url.search, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual",
      // Bun soll die Upstream-Antwort nicht selbst dekomprimieren
      decompress: false,
    } as RequestInit);

    const headers = new Headers(upstream.headers);
    for (const header of HOP_BY_HOP) {
      headers.delete(header);
    }
    const type = headers.get("content-type") ?? "";
    const accepts = request.headers.get("accept-encoding")?.includes("gzip");
    if (
      !(accepts && upstream.body && COMPRESSIBLE.test(type)) ||
      headers.has("content-encoding")
    ) {
      return new Response(upstream.body, { status: upstream.status, headers });
    }
    headers.set("content-encoding", "gzip");
    headers.append("vary", "accept-encoding");
    return new Response(
      upstream.body.pipeThrough(new CompressionStream("gzip")),
      {
        status: upstream.status,
        headers,
      }
    );
  },
});
console.error(`[compress-proxy] :${args.port} -> ${args.upstream}`);
