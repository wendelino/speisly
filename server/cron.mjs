import { CronJob } from "cron";

/**
 * Zeitpläne für den Daten-Sync (wie bisher in src/_boot.ts, Europe/Berlin).
 * Alle Jobs rufen den Sync-Endpoint im selben Prozess auf: Dort lebt der
 * Route Cache, der nach dem Sync gezielt invalidiert wird.
 */
export const SCHEDULES = [
  // Speiseplan von heute aktualisieren (werktags, morgens/mittags/abends)
  { cron: "17 7,10,17 * * 1-5", scope: "today" },
  // heute bis +7 Tage (nachts vor Werktagen)
  { cron: "17 2 * * 0-4", scope: "week" },
  // nach Mitternacht: Startseite neu, Seiten vorwärmen
  { cron: "1 0 * * *", scope: "midnight" },
];

export const TIME_ZONE = "Europe/Berlin";

/**
 * @param {{ baseUrl: string, token: string, scope: string, fetch?: typeof fetch }} options
 * @returns {Promise<boolean>} ob der Aufruf erfolgreich war
 */
export async function triggerSync({
  baseUrl,
  token,
  scope,
  fetch: fetchImpl = fetch,
}) {
  const started = Date.now();
  try {
    const res = await fetchImpl(`${baseUrl}/api/sync?scope=${scope}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        // ohne Content-Type blockt Astros CSRF-Schutz (checkOrigin) den POST
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    const body = await res.json().catch(() => null);
    const ms = Date.now() - started;
    if (!res.ok) {
      console.error(`[cron] ${scope}: HTTP ${res.status} (${ms} ms)`, body);
      return false;
    }
    console.log(
      `[cron] ${scope}: ${body?.changedDates?.length ?? 0} Tage, ${body?.changedMealIds?.length ?? 0} Gerichte geändert, ${body?.images?.created ?? 0} neue Bilder (${ms} ms)`
    );
    return true;
  } catch (error) {
    console.error(`[cron] ${scope}: failed`, error);
    return false;
  }
}

/**
 * @param {{ baseUrl: string, token: string, timeZone?: string }} options
 */
export function startCron({ baseUrl, token, timeZone = TIME_ZONE }) {
  const jobs = SCHEDULES.map(({ cron, scope }) =>
    CronJob.from({
      cronTime: cron,
      onTick: () => triggerSync({ baseUrl, token, scope }),
      start: true,
      timeZone,
      // läuft ein Sync noch, wird der nächste Termin übersprungen
      waitForCompletion: true,
    })
  );
  for (const [i, job] of jobs.entries()) {
    console.log(
      `[cron] ${SCHEDULES[i].scope.padEnd(8)} "${SCHEDULES[i].cron}" → nächster Lauf ${job.nextDate().toISO()}`
    );
  }
  return {
    jobs,
    stop: () => {
      for (const job of jobs) {
        job.stop();
      }
    },
  };
}
