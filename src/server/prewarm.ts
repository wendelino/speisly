import { addDays, todayBerlin } from "@/lib/dates";

/** Seiten, die nach Sync, Mitternacht und Neustart vorgerendert werden */
function prewarmPaths(today: string = todayBerlin()): string[] {
  return [
    "/",
    ...Array.from({ length: 8 }, (_, i) => `/day/${addDays(today, i)}`),
  ];
}

/**
 * Ruft die wichtigsten Seiten lokal ab, damit der erste Besucher nach einer
 * Invalidierung einen Cache-Treffer bekommt. Sequentiell, um den Server nicht
 * zu fluten; Fehler werden nur protokolliert.
 */
export async function prewarm(
  baseUrl: string,
  paths: string[] = prewarmPaths()
): Promise<{ path: string; status: number | string; cache: string | null }[]> {
  const results: {
    path: string;
    status: number | string;
    cache: string | null;
  }[] = [];
  for (const path of paths) {
    try {
      const response = await fetch(new URL(path, baseUrl), {
        signal: AbortSignal.timeout(15_000),
        headers: { "user-agent": "speisly-prewarm" },
      });
      await response.arrayBuffer();
      results.push({
        path,
        status: response.status,
        cache: response.headers.get("x-astro-cache"),
      });
    } catch (error) {
      results.push({ path, status: String(error), cache: null });
    }
  }
  console.log(
    "[prewarm]",
    results.map((r) => `${r.path} ${r.status} ${r.cache ?? ""}`).join(", ")
  );
  return results;
}
