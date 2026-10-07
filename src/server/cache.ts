import type { APIContext } from "astro";
import { logError } from "./log";

/**
 * Invalidiert Cache-Tags, sofern ein Cache-Provider konfiguriert ist (ohne
 * Provider, z. B. im Dev-Modus, würde `cache.invalidate` werfen). Fehler beim
 * Invalidieren dürfen die eigentliche Aktion nicht scheitern lassen.
 */
export async function invalidateTags(
  cache: APIContext["cache"],
  tags: string[]
): Promise<void> {
  if (!cache.enabled || tags.length === 0) {
    return;
  }
  try {
    await cache.invalidate({ tags });
  } catch (error) {
    logError({ message: "Cache invalidation failed", ctx: { tags, error } });
  }
}
