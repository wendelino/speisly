/**
 * Formatierung für die Anzeige: Tage (ISO-Strings `YYYY-MM-DD`, siehe
 * lib/dates.ts) und Zahlen im deutschen Format.
 */
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { diffDays } from "./dates";

/** `YYYY-MM-DD` als lokales Datum (für date-fns, unabhängig von der Zeitzone) */
export function isoDayToLocalDate(isoDay: string): Date {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** `YYYY-MM-DD` mit date-fns-Muster auf Deutsch, z. B. "EEEE, d. MMMM" */
export function formatDay(isoDay: string, pattern: string): string {
  return format(isoDayToLocalDate(isoDay), pattern, { locale: de });
}

/** `YYYY-MM-DD` → „Mittwoch, 7. Oktober 2026“ */
export function formatLongDay(isoDay: string): string {
  return formatDay(isoDay, "EEEE, d. MMMM yyyy");
}

/**
 * Tag relativ zu „heute“ (Berlin): Heute, Morgen, Gestern …, in der letzten
 * Woche der Wochentag, sonst Wochentag und Datum.
 */
export function formatRelativeDay(isoDay: string, today: string): string {
  const diff = diffDays(today, isoDay);
  const relative: Record<number, string> = {
    [-2]: "Vorgestern",
    [-1]: "Gestern",
    0: "Heute",
    1: "Morgen",
    2: "Übermorgen",
  };
  if (diff in relative) {
    return relative[diff];
  }
  return formatDay(isoDay, diff < -2 && diff > -7 ? "EEEE" : "EEEE, dd.MM.yy");
}

/** Zahl mit deutschem Komma, z. B. 4.25 → "4,3" */
export function formatDecimal(value: number, digits = 1): string {
  return value.toFixed(digits).replace(".", ",");
}

/** Cent-Betrag als deutscher Preis ohne Währung, z. B. 526 → "5,26" */
export function formatEuro(cents: number): string {
  return formatDecimal(cents / 100, 2);
}
