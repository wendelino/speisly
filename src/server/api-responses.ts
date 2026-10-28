import { apiResponse } from "@/lib/db/schema/api-response";
import { genId } from "@/lib/db/utils";
import { db } from "./db";
import { currentSyncRun } from "./sync-run-context";

/**
 * Speichert eine rohe API-Antwort, im Sync-Lauf mit Bezug zum Lauf. Fehler
 * beim Speichern brechen den Sync nicht ab.
 */
export async function saveApiResponse(response: {
  url: string;
  status: number;
  durationMs: number;
  body: string;
}): Promise<void> {
  try {
    await db.insert(apiResponse).values({
      id: genId(),
      syncRunId: currentSyncRun()?.id ?? null,
      ...response,
    });
  } catch (error) {
    console.error("[api-response] konnte nicht gespeichert werden", error);
  }
}
