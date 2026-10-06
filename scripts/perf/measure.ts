/**
 * Framework-unabhängige Performance-Messung für Speisly.
 *
 * Misst für eine feste Menge repräsentativer URLs:
 *  - Server: TTFB/Latenz p50/p95/p99 + Durchsatz unter Last, DB-Queries pro Request
 *  - Payload: HTML-Größe (roh + gzip)
 *  - Browser (Chromium via playwright-core): JS-Bytes, Anzahl JS-Dateien,
 *    Folge-Requests an den eigenen Server (z. B. Server Actions),
 *    DB-Queries pro echtem Seitenaufruf (inkl. Prefetches/Actions), Hydration-/Konsolenfehler
 *  - optional Lighthouse (mobil, simuliertes Throttling)
 *
 * Aufruf:
 *   DATABASE_URL=… bun scripts/perf/measure.ts --base http://localhost:3000 --label next \
 *     [--duration 15] [--concurrency 10] [--lighthouse] [--out docs/perf/next.json]
 *
 * Voraussetzung: Datenbank mit `scripts/dev/seed.ts` befüllt, Server läuft,
 * Postgres mit `pg_stat_statements` (siehe docs/perf-baseline.md).
 */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { parseArgs, promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { Pool } from "pg";
import { chromium } from "playwright-core";

const { values: args } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:3000" },
    label: { type: "string", default: "run" },
    duration: { type: "string", default: "15" },
    concurrency: { type: "string", default: "10" },
    lighthouse: { type: "boolean", default: false },
    out: { type: "string" },
    chromium: {
      type: "string",
      default: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
    },
  },
});

const BASE = args.base.replace(/\/$/, "");
const DURATION_MS = Number(args.duration) * 1000;
const CONCURRENCY = Number(args.concurrency);
const DB_NAME = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Total executed statements in the app DB. Uses pg_stat_statements, which is
 * updated synchronously (pg_stat_database lags up to 10 s behind).
 * Requires `shared_preload_libraries=pg_stat_statements` + `create extension pg_stat_statements`.
 */
async function dbQueries(): Promise<number> {
  await sleep(300);
  const res = await pool.query<{ n: string | null }>(
    `select sum(s.calls) as n from pg_stat_statements s
       join pg_database d on d.oid = s.dbid
      where d.datname = $1 and s.query not ilike '%pg_stat_statements%'`,
    [DB_NAME]
  );
  return Number(res.rows[0].n ?? 0);
}

async function discoverUrls() {
  const q = async (sql: string) => (await pool.query(sql)).rows[0];
  const future = await q(
    "select to_char(min(date), 'YYYY-MM-DD') as d from mensa_meal where date > current_date"
  );
  const past = await q(
    "select to_char(max(date), 'YYYY-MM-DD') as d from mensa_meal where date <= current_date - interval '30 days'"
  );
  const mealRow = await q(
    `select mm.meal_id, mm.id as mmid from mensa_meal mm
       where mm.date = (select max(date) from mensa_meal where date <= current_date)
       order by mm.id limit 1`
  );
  return [
    { name: "home", path: "/" },
    { name: "day-future", path: `/day/${future.d}` },
    { name: "day-past", path: `/day/${past.d}` },
    {
      name: "meal-detail",
      path: `/meal/${mealRow.meal_id}?mmid=${mealRow.mmid}`,
    },
    { name: "static", path: "/datenschutz" },
  ];
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) {
    return 0;
  }
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1
  );
  return sorted[Math.max(0, idx)];
}

async function timedFetch(url: string) {
  const start = performance.now();
  const res = await fetch(url, { redirect: "manual" });
  const ttfb = performance.now() - start;
  const body = await res.arrayBuffer();
  return {
    ttfb,
    total: performance.now() - start,
    status: res.status,
    bytes: body.byteLength,
    body,
    headers: res.headers,
  };
}

async function loadTest(url: string) {
  const latencies: number[] = [];
  const statuses: Record<number, number> = {};
  const deadline = performance.now() + DURATION_MS;
  const worker = async () => {
    while (performance.now() < deadline) {
      const r = await timedFetch(url);
      latencies.push(r.ttfb);
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
    }
  };
  const start = performance.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const elapsed = (performance.now() - start) / 1000;
  latencies.sort((a, b) => a - b);
  return {
    requests: latencies.length,
    rps: Math.round(latencies.length / elapsed),
    ttfbP50: Math.round(percentile(latencies, 50) * 10) / 10,
    ttfbP95: Math.round(percentile(latencies, 95) * 10) / 10,
    ttfbP99: Math.round(percentile(latencies, 99) * 10) / 10,
    statuses,
  };
}

async function serverMetrics(path: string) {
  const url = BASE + path;
  for (let i = 0; i < 5; i++) {
    await timedFetch(url);
  }
  const sample = await timedFetch(url);
  const html = new Uint8Array(sample.body);

  const SEQ = 20;
  const before = await dbQueries();
  for (let i = 0; i < SEQ; i++) {
    await timedFetch(url);
  }
  const after = await dbQueries();

  return {
    status: sample.status,
    htmlBytes: html.byteLength,
    htmlGzipBytes: gzipSync(html).byteLength,
    cacheControl: sample.headers.get("cache-control"),
    dbQueriesPerRequest: Math.round(((after - before) / SEQ) * 10) / 10,
    load: await loadTest(url),
  };
}

async function browserMetrics(path: string) {
  const browser = await chromium.launch({ executablePath: args.chromium });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const origin = new URL(BASE).origin;

  // External requests (analytics, remote images) don't count and must not hang.
  await page.route("**/*", (route) =>
    route.request().url().startsWith(origin)
      ? route.continue()
      : route.fulfill({ status: 204, body: "" })
  );

  const scripts: { url: string; bytes: number }[] = [];
  const followUps: string[] = [];
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text().slice(0, 200));
    }
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message.slice(0, 200)));
  page.on("requestfinished", async (req) => {
    if (!req.url().startsWith(origin)) {
      return;
    }
    const sizes = await req.sizes().catch(() => null);
    if (req.resourceType() === "script") {
      scripts.push({ url: req.url(), bytes: sizes?.responseBodySize ?? 0 });
    }
    if (req.resourceType() === "fetch" || req.resourceType() === "xhr") {
      followUps.push(`${req.method()} ${new URL(req.url()).pathname}`);
    }
  });

  const before = await dbQueries();
  const start = performance.now();
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  const loadMs = Math.round(performance.now() - start);
  // let late effects (prefetches, server actions in useEffect) finish
  await sleep(3000);
  const after = await dbQueries();
  await browser.close();

  return {
    loadMs,
    jsFiles: scripts.length,
    jsBytes: scripts.reduce((sum, s) => sum + s.bytes, 0),
    followUpRequests: followUps,
    dbQueriesPerPageView: after - before,
    consoleErrors,
  };
}

async function lighthouse(path: string) {
  const { stdout } = await promisify(execFile)(
    "npx",
    [
      "-y",
      "lighthouse@12",
      BASE + path,
      "--quiet",
      "--output=json",
      "--only-categories=performance",
      "--chrome-flags=--headless=new --no-sandbox",
      // block analytics so runs are comparable
      "--blocked-url-patterns=*stats.speisly.de*",
    ],
    {
      env: { ...process.env, CHROME_PATH: args.chromium },
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  const report = JSON.parse(stdout);
  const a = report.audits;
  const scriptBytes = a["resource-summary"].details.items.find(
    (i: { resourceType: string }) => i.resourceType === "script"
  );
  return {
    score: Math.round(report.categories.performance.score * 100),
    fcpMs: Math.round(a["first-contentful-paint"].numericValue),
    lcpMs: Math.round(a["largest-contentful-paint"].numericValue),
    tbtMs: Math.round(a["total-blocking-time"].numericValue),
    cls: Math.round(a["cumulative-layout-shift"].numericValue * 1000) / 1000,
    scriptTransferBytes: scriptBytes?.transferSize ?? null,
  };
}

const urls = await discoverUrls();
const results: Record<string, unknown> = {
  label: args.label,
  base: BASE,
  date: new Date().toISOString(),
  concurrency: CONCURRENCY,
  durationS: DURATION_MS / 1000,
  pages: {},
};

for (const { name, path } of urls) {
  console.error(`[measure] ${name} ${path}`);
  const server = await serverMetrics(path);
  const browser = await browserMetrics(path);
  const lh = args.lighthouse ? await lighthouse(path) : undefined;
  (results.pages as Record<string, unknown>)[name] = {
    path,
    server,
    browser,
    lighthouse: lh,
  };
}

await pool.end();
const json = JSON.stringify(results, null, 2);
if (args.out) {
  await writeFile(args.out, `${json}\n`);
  console.error(`[measure] written to ${args.out}`);
} else {
  console.log(json);
}
