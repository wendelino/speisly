import { timingSafeEqual } from "node:crypto";
import type { APIContext } from "astro";
import { addDays, todayBerlin } from "@/lib/dates";
import { invalidateTags } from "./cache";
import { tagsForSync } from "./cache-policy";
import { TAG } from "./cache-tags";
import { logError } from "./log";
import type { SyncResult, SyncStats } from "./sync";
import {
  collectRunErrors,
  currentSyncRun,
  runWithSyncRun,
} from "./sync-run-context";
import {
  EMPTY_COUNTS,
  type SyncCounts,
  type SyncScope,
  type SyncStatus,
} from "./sync-runs";
import type { RunSummary } from "./sync-summary";

const SYNC_SCOPES = [
  "today",
  "week",
  "midnight",
  "warm",
] as const satisfies readonly SyncScope[];

type Range = { from: string; to: string };

type Deps = {
  token: string;
  handleSync: (
    date: string | Range,
    options?: { allowMassRemoval?: boolean }
  ) => Promise<SyncResult & { stats: SyncStats }>;
  /** Bildvarianten für den Zeitraum erzeugen (src/server/images) */
  syncImages: (
    range: Range
  ) => Promise<SyncResult & { created: number; failed: number }>;
  prewarm: (baseUrl: string) => Promise<unknown>;
  /** Protokoll der Läufe (src/server/sync-runs.ts) */
  runs: {
    start: (scope: SyncScope, range: Range | null) => Promise<string>;
    finish: (
      id: string,
      result: { status: SyncStatus; counts: SyncCounts; error?: string | null }
    ) => Promise<{ durationMs: number }>;
  };
  /** Telegram-Zusammenfassung (src/server/sync-summary.ts) */
  report: (summary: RunSummary) => Promise<void>;
};

function mergeResults(a: SyncResult, b: SyncResult): SyncResult {
  return {
    changedDates: [...new Set([...a.changedDates, ...b.changedDates])].sort(),
    changedMealIds: [
      ...new Set([...a.changedMealIds, ...b.changedMealIds]),
    ].sort(),
  };
}

function authorized(request: Request, expectedToken: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = Buffer.from(expectedToken);
  const actual = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Seiten lokal vorwärmen (nicht über die öffentliche URL) */
function localBaseUrl(url: URL): string {
  const port = process.env.PORT || url.port || "4321";
  return `http://127.0.0.1:${port}`;
}

type RunOutcome = {
  status: SyncStatus;
  counts: SyncCounts;
  error: string | null;
  result: SyncResult;
  images: { created: number; failed: number };
  tags: string[];
};

/**
 * Sync, Bilder und Invalidierung eines Laufs. Läuft im Kontext des Laufs
 * (sync-run-context.ts): Fehler hängen am Lauf und landen gesammelt in der
 * Zusammenfassung.
 */
async function execute(
  deps: Deps,
  {
    scope,
    range,
    force,
    cache,
  }: {
    scope: SyncScope;
    range: Range | null;
    force: boolean;
    cache: APIContext["cache"];
  }
): Promise<RunOutcome> {
  const outcome: RunOutcome = {
    status: "success",
    counts: { ...EMPTY_COUNTS },
    error: null,
    result: { changedDates: [], changedMealIds: [] },
    images: { created: 0, failed: 0 },
    tags: [],
  };
  if (range) {
    try {
      const { stats, ...result } = await deps.handleSync(
        range.from === range.to ? range.from : range,
        { allowMassRemoval: force }
      );
      outcome.result = result;
      outcome.counts = { ...outcome.counts, ...stats };
      if (stats.massRemoval) {
        outcome.status = "partial";
      }
    } catch (error) {
      logError({
        message: "Error syncing data",
        ctx: { scope, error },
        source: "sync",
      });
      return {
        ...outcome,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Bilder nach dem Sync und vor der Invalidierung: Seiten, die danach neu
    // rendern, verweisen schon auf die Varianten. Fehler hier brechen den
    // Sync nicht ab, die Seiten zeigen dann das Original.
    try {
      const { created, failed, ...changed } = await deps.syncImages(range);
      outcome.images = { created, failed };
      outcome.counts.imagesCreated = created;
      outcome.counts.imagesFailed = failed;
      outcome.result = mergeResults(outcome.result, changed);
    } catch (error) {
      outcome.status = "partial";
      logError({
        message: "Error syncing images",
        ctx: { scope, error },
        source: "sync",
      });
    }
  }

  // Startseite: läuft um Mitternacht ohnehin ab (maxAge); der Tag ist ein
  // Sicherheitsnetz, falls die Uhr des Prozesses abweicht
  outcome.tags = [
    ...tagsForSync(outcome.result),
    ...(scope === "midnight" ? [TAG.home] : []),
  ];
  await invalidateTags(cache, outcome.tags);
  return outcome;
}

/**
 * Handler für POST /api/sync (src/pages/api/sync.ts). Abhängigkeiten werden
 * übergeben, damit der Ablauf ohne echten Sync testbar ist.
 */
export function createSyncHandler(deps: Deps) {
  return async ({
    request,
    url,
    cache,
  }: Pick<APIContext, "request" | "url" | "cache">): Promise<Response> => {
    if (!authorized(request, deps.token)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const scope = (url.searchParams.get("scope") ?? "week") as SyncScope;
    if (!SYNC_SCOPES.includes(scope)) {
      return Response.json(
        { error: `Unknown scope, expected one of ${SYNC_SCOPES.join(", ")}` },
        { status: 400 }
      );
    }

    const today = todayBerlin();
    const range =
      scope === "today"
        ? { from: today, to: today }
        : scope === "week"
          ? { from: today, to: addDays(today, 7) }
          : null;

    const runId = await deps.runs.start(scope, range);
    const { outcome, errors } = await runWithSyncRun(runId, async () => {
      const result = await execute(deps, {
        scope,
        range,
        force: url.searchParams.get("force") === "1",
        cache,
      });
      const run = currentSyncRun();
      return {
        outcome: result,
        errors: run ? await collectRunErrors(run) : [],
      };
    });
    const { durationMs } = await deps.runs.finish(runId, {
      status: outcome.status,
      counts: outcome.counts,
      error: outcome.error,
    });
    deps
      .report({
        scope,
        status: outcome.status,
        durationMs,
        counts: outcome.counts,
        errors,
      })
      .catch((error: unknown) =>
        logError({
          message: "Sync summary failed",
          ctx: { runId, error },
          source: "sync",
          notify: false,
        })
      );

    if (outcome.status === "failed") {
      return Response.json(
        { error: "Error syncing data", runId },
        { status: 500 }
      );
    }

    // im Hintergrund – die Antwort soll nicht auf das Rendern warten
    deps.prewarm(localBaseUrl(url)).catch((error: unknown) =>
      logError({
        message: "Prewarm failed",
        ctx: { error },
        source: "sync",
        notify: false,
      })
    );

    return Response.json({
      scope,
      runId,
      status: outcome.status,
      ...outcome.result,
      images: outcome.images,
      invalidatedTags: outcome.tags,
    });
  };
}
