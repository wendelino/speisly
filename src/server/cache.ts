import type { APIContext } from "astro";
import { logError } from "./log";

/**
 * Wie lange nach einer Änderung noch Renders mit dem alten Stand fertig
 * werden können (Seiten rendern in deutlich unter einer Sekunde)
 */
export const SETTLE_MS = 3000;

type CacheApi = Pick<APIContext["cache"], "enabled" | "invalidate">;

async function invalidate(cache: CacheApi, tags: string[]): Promise<void> {
  try {
    await cache.invalidate({ tags });
  } catch (error) {
    logError({
      message: "Cache invalidation failed",
      ctx: { tags, error },
      source: "cache",
    });
  }
}

/**
 * Invalidiert Cache-Tags, sofern ein Cache-Provider konfiguriert ist (ohne
 * Provider, z. B. im Dev-Modus, würde `cache.invalidate` werfen). Fehler beim
 * Invalidieren dürfen die eigentliche Aktion nicht scheitern lassen.
 *
 * `settle`: nach `SETTLE_MS` ein zweites Mal invalidieren. Ein Render, der
 * die Daten vor der Änderung gelesen hat, aber erst nach der Invalidierung
 * fertig wird (oder eine SWR-Revalidierung), legt sonst den alten Stand
 * wieder in den Cache – bei der Startseite bis Mitternacht. Nicht beim Sync,
 * der die Seiten direkt danach vorwärmt.
 */
export async function invalidateTags(
  cache: CacheApi,
  tags: string[],
  {
    settle = false,
    settleMs = SETTLE_MS,
  }: { settle?: boolean; settleMs?: number } = {}
): Promise<void> {
  if (!cache.enabled || tags.length === 0) {
    return;
  }
  await invalidate(cache, tags);
  if (settle) {
    setTimeout(() => {
      invalidate(cache, tags);
    }, settleMs).unref?.();
  }
}
