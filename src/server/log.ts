import { createHash } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { errorLog } from "@/lib/db/schema/error-log";
import { genId } from "@/lib/db/utils";
import { db } from "./db";
import { currentSyncRun, type RunError } from "./sync-run-context";
import { sendTelegramMessage } from "./telegram";

/** Woher ein Fehler kommt; zusammen mit der Meldung der Gruppierungsschlüssel */
export type LogSource =
  | "sync"
  | "images"
  | "ratings"
  | "feedback"
  | "queries"
  | "cache";

type LogErrorProps = {
  /**
   * Fester Text ohne wechselnde Werte (die gehören in `ctx`), sonst
   * entsteht für jedes Auftreten eine eigene Gruppe.
   */
  message: string;
  ctx: unknown;
  source: LogSource;
  level?: "error" | "warn";
  /**
   * `true` (Default): per Telegram melden, wenn es sich lohnt (siehe
   * `shouldNotify`); innerhalb eines Sync-Laufs erst in der Zusammenfassung.
   * `"immediate"`: auch im Sync-Lauf sofort. `false`: nie.
   */
  notify?: boolean | "immediate";
};

/** Laufende Schreibvorgänge (für `flushErrorLog`) */
const inFlight = new Set<Promise<void>>();

/** Wartet, bis alle bisher geloggten Fehler geschrieben bzw. gemeldet sind */
export async function flushErrorLog(): Promise<void> {
  await Promise.allSettled([...inFlight]);
}

/** Wie oft ein bekannter, offener Fehler höchstens erneut gemeldet wird */
const RENOTIFY_MS = 24 * 3_600_000;

export function errorFingerprint(source: string, message: string): string {
  return createHash("md5").update(`${source}:${message}`).digest("hex");
}

/** Meldenswert: neu, nach „erledigt“ wieder aufgetreten oder lange still */
export function shouldNotify(
  state: {
    inserted: boolean;
    wasResolved: boolean;
    notifiedAt: Date | null;
  },
  now: Date
): boolean {
  return (
    state.inserted ||
    state.wasResolved ||
    state.notifiedAt === null ||
    now.getTime() - state.notifiedAt.getTime() >= RENOTIFY_MS
  );
}

/** `JSON.stringify(new Error())` ergibt `{}` – Errors lesbar serialisieren. */
function serialize(ctx: unknown): unknown {
  const json = JSON.stringify(ctx, (_key, value) =>
    value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : value
  );
  return json === undefined ? null : JSON.parse(json);
}

/**
 * Fehler zählen: eine Zeile je Quelle und Meldung (neu oder +1), letzter
 * Kontext und Lauf werden überschrieben, „erledigt“ wieder aufgehoben.
 */
async function upsertError({
  fingerprint,
  source,
  message,
  level,
  ctx,
  syncRunId,
}: {
  fingerprint: string;
  source: string;
  message: string;
  level: "error" | "warn";
  ctx: unknown;
  syncRunId: string | null;
}) {
  // Die CTE sieht den Stand vor dem Statement (ob der Fehler erledigt war)
  const result = await db.execute<{
    inserted: boolean;
    was_resolved: boolean;
    notified_at: string | null;
    count: number;
  }>(sql`
    with prev as (
      select resolved_at from ${errorLog} where fingerprint = ${fingerprint}
    )
    insert into ${errorLog}
      (id, fingerprint, level, source, message, last_ctx, last_sync_run_id)
    values (${genId()}, ${fingerprint}, ${level}, ${source}, ${message},
      ${JSON.stringify(ctx)}::jsonb, ${syncRunId})
    on conflict (fingerprint) do update set
      count = ${errorLog}.count + 1,
      level = excluded.level,
      last_seen_at = now(),
      last_ctx = excluded.last_ctx,
      last_sync_run_id = excluded.last_sync_run_id,
      resolved_at = null
    returning
      (xmax = 0) as inserted,
      coalesce((select resolved_at is not null from prev), false) as was_resolved,
      notified_at,
      count`);
  const row = result.rows[0];
  return {
    inserted: row.inserted,
    wasResolved: row.was_resolved,
    notifiedAt: row.notified_at ? new Date(row.notified_at) : null,
    count: Number(row.count),
  };
}

export async function markNotified(fingerprints: string[]): Promise<void> {
  if (fingerprints.length === 0) {
    return;
  }
  await db
    .update(errorLog)
    .set({ notifiedAt: new Date() })
    .where(inArray(errorLog.fingerprint, fingerprints));
}

/** Fehler im laufenden Sync vormerken (Zusammenfassung, sync-summary.ts) */
function recordInRun(
  run: NonNullable<ReturnType<typeof currentSyncRun>>,
  entry: Omit<RunError, "occurrences" | "noteworthy">
): RunError {
  const seen = run.errors.get(entry.fingerprint);
  const next: RunError = seen ?? {
    ...entry,
    occurrences: 0,
    noteworthy: false,
  };
  next.occurrences += 1;
  run.errors.set(entry.fingerprint, next);
  return next;
}

async function persist(
  props: Required<Omit<LogErrorProps, "ctx">> & { ctx: unknown }
): Promise<void> {
  const run = currentSyncRun();
  const fingerprint = errorFingerprint(props.source, props.message);
  const inRun =
    run && props.notify !== "immediate"
      ? recordInRun(run, {
          fingerprint,
          source: props.source,
          message: props.message,
          level: props.level,
        })
      : null;

  let state: Awaited<ReturnType<typeof upsertError>>;
  try {
    state = await upsertError({
      fingerprint,
      source: props.source,
      message: props.message,
      level: props.level,
      ctx: props.ctx,
      syncRunId: run?.id ?? null,
    });
  } catch (error) {
    // ohne DB lässt sich nicht sagen, ob der Fehler bekannt ist: melden
    if (inRun && props.notify !== false) {
      inRun.noteworthy = true;
    }
    throw error;
  }
  const noteworthy = props.notify !== false && shouldNotify(state, new Date());

  if (inRun) {
    inRun.noteworthy ||= noteworthy;
    return;
  }
  if (!noteworthy) {
    return;
  }
  const repeat = state.count > 1 ? ` (${state.count}× insgesamt)` : "";
  await sendTelegramMessage(`[${props.source}] ${props.message}${repeat}`);
  await markNotified([fingerprint]);
}

/**
 * Loggt einen Fehler gruppiert in die DB und meldet ihn ggf. per Telegram.
 * Fire-and-forget: blockiert den Request nicht und wirft nie.
 */
export function logError({
  message,
  ctx,
  source,
  level = "error",
  notify = true,
}: LogErrorProps): void {
  const serialized = serialize(ctx);
  const preview = JSON.stringify(serialized) ?? "null";
  console.error(
    `[logError:${source}]`,
    message,
    "| ctx:",
    preview.slice(0, 75) + (preview.length > 75 ? " [...]" : "")
  );

  const task = persist({
    message,
    ctx: serialized,
    source,
    level,
    notify,
  }).catch((error: unknown) => {
    console.error("[logError] failed to persist error", error);
  });
  inFlight.add(task);
  task.finally(() => inFlight.delete(task));
  currentSyncRun()?.pending.push(task);
}
