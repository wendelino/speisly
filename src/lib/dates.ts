/**
 * Datumslogik in Europe/Berlin. Tage werden als ISO-String `YYYY-MM-DD`
 * durchgereicht, nie als lokales `Date` (die Server-Zeitzone darf keine Rolle
 * spielen).
 */

export const TIME_ZONE = "Europe/Berlin";

/** Wie weit `/day/[date]` in Vergangenheit/Zukunft gültig ist (in Tagen). */
export const DAY_WINDOW = { past: 365, future: 14 } as const;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** Heutiges Datum in Berlin als `YYYY-MM-DD`. */
export function todayBerlin(now: Date = new Date()): string {
  // en-CA formatiert als YYYY-MM-DD
  return now.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

/** `YYYY-MM-DD` → `Date` um 00:00 UTC (so speichert der Sync `mensa_meal.date`). */
export function toUtcDate(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00Z`);
}

/** `Date` (00:00 UTC, z. B. aus der DB) → `YYYY-MM-DD`. */
export function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(isoDay: string, days: number): string {
  return toIsoDay(new Date(toUtcDate(isoDay).getTime() + days * DAY_MS));
}

/** Differenz in Tagen (`b - a`). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtcDate(b).getTime() - toUtcDate(a).getTime()) / DAY_MS);
}

/** Prüft, ob `value` ein echtes Kalenderdatum im Format `YYYY-MM-DD` ist. */
export function isIsoDay(value: string): boolean {
  const match = ISO_DAY.exec(value);
  if (!match) {
    return false;
  }
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Validiert den `[date]`-Parameter: echtes Datum und innerhalb des
 * erlaubten Fensters um heute. Gibt `null` für alles andere zurück, damit
 * beliebige Daten keine Cache-Einträge erzeugen.
 */
export function parseDayParam(
  value: string | undefined,
  today: string = todayBerlin()
): string | null {
  if (!(value && isIsoDay(value))) {
    return null;
  }
  const offset = diffDays(today, value);
  if (offset < -DAY_WINDOW.past || offset > DAY_WINDOW.future) {
    return null;
  }
  return value;
}

/** Offset von Berlin zu UTC (ms) zu einem Zeitpunkt, z. B. 7 200 000 im Sommer. */
function berlinOffsetMs(instant: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallClockAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return wallClockAsUtc - Math.floor(instant / 1000) * 1000;
}

/** Zeitpunkt (ms) von 00:00 Uhr Berliner Zeit am Tag `isoDay`. */
export function berlinMidnight(isoDay: string): number {
  const guess = toUtcDate(isoDay).getTime();
  // Zeitumstellungen passieren nachts um 2/3 Uhr, nie um Mitternacht:
  // der Offset am Ergebnis ist daher eindeutig.
  return guess - berlinOffsetMs(guess - berlinOffsetMs(guess));
}

/**
 * Sekunden bis zur nächsten Mitternacht in Berlin (mind. 1). Berücksichtigt
 * Tage mit 23 bzw. 25 Stunden (Zeitumstellung).
 */
export function secondsUntilBerlinMidnight(now: Date = new Date()): number {
  const next = berlinMidnight(addDays(todayBerlin(now), 1));
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}
