/**
 * TEMPORÄR (Branch tmp/simulate-sync): spielt die Sync-Läufe eines Jahres
 * nach, wie der Cron sie in Produktion auslöst (server/cron.mjs), und lässt
 * sie gegen die echte meine-mensa-API und eine echte Datenbank laufen.
 * Danach zeigt der Admin-Bereich (/admin/sync, /admin/errors,
 * /admin/changes), was dabei an Läufen, Fehlern und Änderungen entsteht.
 *
 *   DATABASE_URL=… MEINE_MENSA_API_URL=… bun scripts/dev/simulate-sync.ts --yes
 *
 * Optionen:
 *   --from YYYY-MM-DD   erster simulierter Tag (Default: heute − 365)
 *   --to YYYY-MM-DD     letzter simulierter Tag (Default: heute)
 *   --scopes a,b        welche Cron-Jobs (Default: week,today,midnight)
 *   --delay ms          Pause nach jedem API-Aufruf (Default: 300)
 *   --images            Bildvarianten wirklich erzeugen (Default: aus)
 *   --no-backdate       Zeitstempel nicht auf die simulierte Zeit setzen
 *   --yes               wirklich schreiben (ohne: nur Plan anzeigen)
 *
 * Ablauf je Termin: Die Uhr des Prozesses (`Date`) wird auf den Termin
 * gestellt, dann läuft der echte Handler von /api/sync
 * (createSyncHandler mit handleSync, sync_run-Protokoll, logError,
 * Zusammenfassung). Telegram ist abgeschaltet, die Meldungen stehen in der
 * Konsole und im Bericht. Cache und Pre-Warm entfallen (kein Server).
 * Anschließend werden die Zeitstempel der in diesem Lauf geschriebenen
 * Zeilen (DB-`now()`) auf die simulierte Zeit verschoben, damit die Läufe im
 * Admin-Bereich chronologisch erscheinen.
 *
 * ACHTUNG: schreibt in die Datenbank. Nur gegen eine Kopie bzw. lokale DB
 * laufen lassen, nicht gegen Produktion – und nicht, während dort ein Server
 * schreibt (das Rückdatieren erfasst alle Zeilen ab Laufbeginn).
 *
 * Abbrechen mit Strg+C: der aktuelle Lauf wird noch beendet.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { plugin } from "bun";
import {
  addDays,
  berlinMidnight,
  diffDays,
  isIsoDay,
  todayBerlin,
} from "../../src/lib/dates";

// --- Optionen -------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    from: { type: "string" },
    to: { type: "string" },
    scopes: { type: "string", default: "week,today,midnight" },
    delay: { type: "string", default: "300" },
    images: { type: "boolean", default: false },
    "no-backdate": { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
  },
});

const realToday = todayBerlin();
const from = args.from ?? addDays(realToday, -365);
const to = args.to ?? realToday;
const scopes = new Set(args.scopes.split(",").map((s) => s.trim()));
const delayMs = Number(args.delay);
const backdate = !args["no-backdate"];

for (const [name, value] of [
  ["--from", from],
  ["--to", to],
] as const) {
  if (!isIsoDay(value)) {
    throw new Error(`${name}: kein Datum (YYYY-MM-DD): ${value}`);
  }
}
if (diffDays(from, to) < 0) {
  throw new Error("--from liegt nach --to");
}

const { DATABASE_URL, MEINE_MENSA_API_URL } = process.env;
if (!(DATABASE_URL && MEINE_MENSA_API_URL)) {
  throw new Error("DATABASE_URL und MEINE_MENSA_API_URL müssen gesetzt sein");
}

// --- Cron-Termine (wie server/cron.mjs, Europe/Berlin) -----------------------

type Scope = "today" | "week" | "midnight";
type Slot = { day: string; time: string; scope: Scope; at: number };

/** Wochentag in Berlin (0 = Sonntag) – Tage als UTC-Mitternacht, daher UTC */
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const WEEKDAY = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const SCHEDULE: { time: string; scope: Scope; days: number[] }[] = [
  { time: "00:01", scope: "midnight", days: [0, 1, 2, 3, 4, 5, 6] },
  { time: "02:17", scope: "week", days: [0, 1, 2, 3, 4] },
  { time: "07:17", scope: "today", days: [1, 2, 3, 4, 5] },
  { time: "10:17", scope: "today", days: [1, 2, 3, 4, 5] },
  { time: "17:17", scope: "today", days: [1, 2, 3, 4, 5] },
];

function slotsFor(day: string): Slot[] {
  return SCHEDULE.filter(
    (s) => scopes.has(s.scope) && s.days.includes(weekday(day))
  ).map(({ time, scope }) => {
    const [h, m] = time.split(":").map(Number);
    return {
      day,
      time,
      scope,
      at: berlinMidnight(day) + h * 3_600_000 + m * 60_000,
    };
  });
}

const slots: Slot[] = [];
for (let day = from; diffDays(day, to) >= 0; day = addDays(day, 1)) {
  slots.push(...slotsFor(day));
}
// heute nur Termine, die schon vorbei sind
const cutoff = Date.now();
const plannedSlots = slots.filter((s) => s.at <= cutoff);

const byScope = (scope: Scope) =>
  plannedSlots.filter((s) => s.scope === scope).length;
const dbTarget = DATABASE_URL.replace(/\/\/([^:/@]+):[^@]*@/, "//$1:***@");
console.log(`Simulation ${from} … ${to}
  Datenbank: ${dbTarget}
  API:       ${MEINE_MENSA_API_URL}
  Läufe:     ${plannedSlots.length} (week ${byScope("week")}, today ${byScope("today")}, midnight ${byScope("midnight")})
  Bilder:    ${args.images ? "ja" : "nein"} · Rückdatieren: ${backdate ? "ja" : "nein"} · Pause: ${delayMs} ms
`);
if (!args.yes) {
  console.log("Nichts geschrieben. Mit --yes starten.");
  process.exit(0);
}

// --- Astro-Umgebung und simulierte Uhr -------------------------------------

const TOKEN = "simulate-sync";

plugin({
  name: "astro-env-for-simulation",
  setup(build) {
    build.module("astro:env/server", () => ({
      loader: "object",
      exports: {
        DATABASE_URL,
        MEINE_MENSA_API_URL,
        API_BEARER_TOKEN: TOKEN,
        IMAGE_DIR: process.env.IMAGE_DIR ?? "./data/img",
        JWT_SECRET: "simulate",
        JWT_ALGORITHM: "HS256",
        // nie echte Telegram-Nachrichten aus der Simulation
        TELEGRAM_BOT_TOKEN: undefined,
        TELEGRAM_CHAT_ID: undefined,
        OIDC_ISSUER: "https://sso.example.test",
        OIDC_CLIENT_ID: undefined,
        OIDC_CLIENT_SECRET: undefined,
        ADMIN_GROUP: "speisly-admin",
        SITE_URL: undefined,
      },
    }));
  },
});

const RealDate = Date;
/** simulierte minus echte Zeit */
let clockOffsetMs = 0;
class SimDate extends RealDate {
  constructor(...input: unknown[]) {
    if (input.length === 0) {
      super(RealDate.now() + clockOffsetMs);
    } else {
      super(...(input as [string]));
    }
  }
  static override now() {
    return RealDate.now() + clockOffsetMs;
  }
}
globalThis.Date = SimDate as DateConstructor;

const { sql } = await import("drizzle-orm");
const { db } = await import("../../src/server/db");
const { flushErrorLog } = await import("../../src/server/log");
const { handleSync } = await import("../../src/server/sync");
const { createSyncHandler } = await import("../../src/server/sync-endpoint");
const { finishSyncRun, startSyncRun } = await import(
  "../../src/server/sync-runs"
);
const { formatSummary, reportSyncRun, shouldReport } = await import(
  "../../src/server/sync-summary"
);
type RunSummary = import("../../src/server/sync-summary").RunSummary;
const syncImages = args.images
  ? (await import("../../src/server/images")).syncImages
  : // wie syncImages ohne neue Varianten
    () =>
      Promise.resolve({
        changedDates: [],
        changedMealIds: [],
        created: 0,
        failed: 0,
      });

// --- Rückdatieren ----------------------------------------------------------

/** Spalten, die der Sync mit DB-`now()` füllt */
const SHIFT_COLUMNS: Record<string, string[]> = {
  sync_run: ["started_at", "finished_at"],
  mensa: ["created_at", "updated_at"],
  meal: ["created_at", "updated_at"],
  mensa_meal: ["created_at", "updated_at"],
  meal_change: ["created_at"],
  serving_removal: ["created_at"],
  error_log: ["first_seen_at", "last_seen_at"],
};
const existing = await db.execute<{ table_name: string; column_name: string }>(
  sql`select table_name, column_name from information_schema.columns
      where table_schema = current_schema()`
);
const shiftTargets = Object.entries(SHIFT_COLUMNS).flatMap(([table, cols]) =>
  cols
    .filter((col) =>
      existing.rows.some((r) => r.table_name === table && r.column_name === col)
    )
    .map((col) => ({ table, col }))
);

async function dbNow(): Promise<string> {
  const res = await db.execute<{ now: string }>(
    sql`select clock_timestamp()::text as now`
  );
  return res.rows[0].now;
}

/** Zeilen ab `since` (DB-Zeit) um die Differenz zur simulierten Zeit verschieben */
async function shiftSince(since: string, simulatedAt: number) {
  const shiftMs = simulatedAt - new RealDate(since).getTime();
  for (const { table, col } of shiftTargets) {
    await db.execute(sql`
      update ${sql.identifier(table)}
         set ${sql.identifier(col)} = ${sql.identifier(col)} + make_interval(secs => ${shiftMs / 1000})
       where ${sql.identifier(col)} >= ${since}::timestamptz`);
  }
}

// --- Simulation ------------------------------------------------------------

type RunRecord = Slot & {
  status: string;
  runId?: string;
  response: Record<string, unknown> | null;
  summary: RunSummary | null;
  telegram: string | null;
};
const records: RunRecord[] = [];
let pendingSummary: RunSummary | null = null;

const handler = createSyncHandler({
  token: TOKEN,
  handleSync,
  syncImages,
  prewarm: () => Promise.resolve(),
  runs: { start: startSyncRun, finish: finishSyncRun },
  report: async (summary) => {
    pendingSummary = summary;
    // echte Funktion: Telegram ist aus (Konsole), notified_at wird gesetzt
    await reportSyncRun(summary);
  },
});
const cache = { enabled: false } as Parameters<typeof handler>[0]["cache"];

let stop = false;
process.on("SIGINT", () => {
  if (stop) {
    process.exit(130);
  }
  stop = true;
  console.log("\nAbbruch nach dem aktuellen Lauf (nochmal Strg+C: sofort)");
});

const startedReal = RealDate.now();
for (const [i, slot] of plannedSlots.entries()) {
  if (stop) {
    break;
  }
  const since = await dbNow();
  clockOffsetMs = slot.at - RealDate.now();
  pendingSummary = null;

  const url = new URL(`http://127.0.0.1/api/sync?scope=${slot.scope}`);
  let response: Record<string, unknown> | null = null;
  let httpStatus = 0;
  try {
    const res = await handler({
      request: new Request(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }),
      url,
      cache,
    });
    httpStatus = res.status;
    response = (await res.json()) as Record<string, unknown>;
  } catch (error) {
    console.error("Handler hat geworfen:", error);
  }
  await flushErrorLog();
  if (backdate) {
    await shiftSince(since, slot.at);
  }
  clockOffsetMs = 0;

  const summary = pendingSummary as RunSummary | null;
  const record: RunRecord = {
    ...slot,
    status: summary?.status ?? `HTTP ${httpStatus}`,
    runId: response?.runId as string | undefined,
    response,
    summary,
    telegram: summary && shouldReport(summary) ? formatSummary(summary) : null,
  };
  records.push(record);

  const c = summary?.counts;
  const counts = c
    ? `+${c.newMeals} Gerichte, ${c.changedMeals} geändert | Ausgaben +${c.newServings} ~${c.changedServings} −${c.removedServings} behalten ${c.keptServings}${c.massRemoval ? " | NOTBREMSE" : ""}`
    : "";
  const errors = summary?.errors.length
    ? ` | Fehler: ${summary.errors.map((e) => `${e.message} ×${e.occurrences}`).join("; ")}`
    : "";
  console.log(
    `[${String(i + 1).padStart(4)}/${plannedSlots.length}] ${slot.day} ${WEEKDAY[weekday(slot.day)]} ${slot.time} ${slot.scope.padEnd(8)} ${record.status.padEnd(8)} ${counts}${errors}`
  );

  if (slot.scope !== "midnight" && delayMs > 0) {
    await sleep(delayMs);
  }
}

// --- Bericht ---------------------------------------------------------------

const done = records.filter((r) => r.summary);
const sum = (key: keyof RunSummary["counts"]) =>
  done.reduce((n, r) => n + Number(r.summary?.counts[key] ?? 0), 0);
const statusCount = new Map<string, number>();
for (const r of records) {
  const key = `${r.scope} ${r.status}`;
  statusCount.set(key, (statusCount.get(key) ?? 0) + 1);
}

const fingerprints = [
  ...new Set(done.flatMap((r) => r.summary?.errors.map((e) => e.fingerprint))),
].filter(Boolean) as string[];
const errorRows = fingerprints.length
  ? (
      await db.execute<{
        source: string;
        level: string;
        message: string;
        count: number;
        first_seen_at: string;
        last_seen_at: string;
        last_ctx: unknown;
      }>(sql`
        select source, level, message, count, first_seen_at::text,
               last_seen_at::text, last_ctx
          from error_log
         where fingerprint in (${sql.join(
           fingerprints.map((f) => sql`${f}`),
           sql`, `
         )})
         order by count desc`)
    ).rows
  : [];

const interesting = records.filter(
  (r) =>
    r.status !== "success" ||
    (r.summary &&
      (r.summary.errors.length > 0 ||
        r.summary.counts.removedServings > 0 ||
        r.summary.counts.keptServings > 0 ||
        r.summary.counts.changedMeals > 0 ||
        r.summary.counts.changedServings > 0 ||
        r.summary.counts.massRemoval))
);

const md = [
  `# Sync-Simulation ${from} … ${to}`,
  "",
  `- Ausgeführt: ${new RealDate(startedReal).toISOString()} (${Math.round((RealDate.now() - startedReal) / 1000)} s)`,
  `- Datenbank: \`${dbTarget}\``,
  `- Läufe: ${records.length} von ${plannedSlots.length}${stop ? " (abgebrochen)" : ""}`,
  `- Bilder: ${args.images ? "ja" : "nein"}, rückdatiert: ${backdate ? "ja" : "nein"}`,
  "",
  "## Status je Scope",
  "",
  "| Scope / Status | Läufe |",
  "| --- | ---: |",
  ...[...statusCount].map(([k, n]) => `| ${k} | ${n} |`),
  "",
  "## Summen",
  "",
  `- neue Gerichte: ${sum("newMeals")}, geänderte Gerichte: ${sum("changedMeals")}`,
  `- Ausgaben: neu ${sum("newServings")}, geändert ${sum("changedServings")}, entfernt ${sum("removedServings")}, behalten ${sum("keptServings")}`,
  `- Notbremse: ${done.filter((r) => r.summary?.counts.massRemoval).length}×`,
  `- Bilder: ${sum("imagesCreated")} erzeugt, ${sum("imagesFailed")} fehlgeschlagen`,
  "",
  "## Fehler (error_log, Stand nach der Simulation)",
  "",
  errorRows.length
    ? [
        "| Quelle | Level | Meldung | Anzahl gesamt | zuerst | zuletzt |",
        "| --- | --- | --- | ---: | --- | --- |",
        ...errorRows.map(
          (e) =>
            `| ${e.source} | ${e.level} | ${e.message} | ${e.count} | ${e.first_seen_at.slice(0, 16)} | ${e.last_seen_at.slice(0, 16)} |`
        ),
      ].join("\n")
    : "keine",
  "",
  "## Telegram-Meldungen (wären verschickt worden)",
  "",
  ...(records.some((r) => r.telegram)
    ? records
        .filter((r) => r.telegram)
        .map(
          (r) =>
            `### ${r.day} ${r.time} ${r.scope}\n\n\`\`\`\n${r.telegram}\n\`\`\`\n`
        )
    : ["keine"]),
  "",
  "## Auffällige Läufe",
  "",
  "Nicht erfolgreich, mit Fehlern, Änderungen, entfernten oder behaltenen Ausgaben.",
  "",
  "| Tag | Zeit | Scope | Status | neu G. | geänd. G. | neu A. | geänd. A. | entf. A. | behalten | Fehler | Run-ID |",
  "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
  ...interesting.map((r) => {
    const c = r.summary?.counts;
    const errs =
      r.summary?.errors
        .map((e) => `${e.message} ×${e.occurrences}`)
        .join("; ") ?? String(r.response?.error ?? "");
    return `| ${r.day} | ${r.time} | ${r.scope} | ${r.status}${c?.massRemoval ? " (Notbremse)" : ""} | ${c?.newMeals ?? ""} | ${c?.changedMeals ?? ""} | ${c?.newServings ?? ""} | ${c?.changedServings ?? ""} | ${c?.removedServings ?? ""} | ${c?.keptServings ?? ""} | ${errs.replaceAll("|", "\\|")} | ${r.runId ?? ""} |`;
  }),
  "",
].join("\n");

const reportDir = "./data/simulate-sync";
await mkdir(reportDir, { recursive: true });
const stamp = new RealDate().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const reportPath = `${reportDir}/report-${stamp}.md`;
await writeFile(reportPath, md);
await writeFile(
  `${reportDir}/runs-${stamp}.json`,
  JSON.stringify(records, null, 2)
);
console.log(`\nBericht: ${reportPath}`);

await (
  globalThis as { __speislyPool?: { end: () => Promise<void> } }
).__speislyPool?.end();
