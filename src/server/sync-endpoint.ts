import { timingSafeEqual } from "node:crypto";
import type { APIContext } from "astro";
import { invalidateTags } from "./cache";
import { tagsForSync } from "./cache-policy";
import { TAG } from "./cache-tags";
import { addDays, todayBerlin } from "./dates";
import { logError } from "./log";
import type { SyncResult } from "./sync";

export const SYNC_SCOPES = ["today", "week", "midnight"] as const;
type Scope = (typeof SYNC_SCOPES)[number];

type Deps = {
  token: string;
  handleSync: (
    date: string | { from: string; to: string }
  ) => Promise<SyncResult>;
  prewarm: (baseUrl: string) => Promise<unknown>;
};

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
    const scope = (url.searchParams.get("scope") ?? "week") as Scope;
    if (!SYNC_SCOPES.includes(scope)) {
      return Response.json(
        { error: `Unknown scope, expected one of ${SYNC_SCOPES.join(", ")}` },
        { status: 400 }
      );
    }

    const today = todayBerlin();
    let result: SyncResult = { changedDates: [], changedMealIds: [] };
    try {
      if (scope === "today") {
        result = await deps.handleSync(today);
      } else if (scope === "week") {
        result = await deps.handleSync({ from: today, to: addDays(today, 7) });
      }
    } catch (error) {
      logError({ message: "Error syncing data", ctx: { scope, error } });
      return Response.json({ error: "Error syncing data" }, { status: 500 });
    }

    // Startseite: läuft um Mitternacht ohnehin ab (maxAge); der Tag ist ein
    // Sicherheitsnetz, falls die Uhr des Prozesses abweicht
    const tags = [
      ...tagsForSync(result),
      ...(scope === "midnight" ? [TAG.home] : []),
    ];
    await invalidateTags(cache, tags);

    // im Hintergrund – die Antwort soll nicht auf das Rendern warten
    deps.prewarm(localBaseUrl(url)).catch((error: unknown) =>
      logError({
        message: "Prewarm failed",
        ctx: { error },
        disableTelegram: true,
      })
    );

    return Response.json({ scope, ...result, invalidatedTags: tags });
  };
}
