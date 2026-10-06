import { format } from "date-fns";
import { de } from "date-fns/locale";
import { diffDays } from "@/server/dates";

export type DayFormat = "dd.MM.yy" | "EEEE, dd.MM.yy";

/** `YYYY-MM-DD` als lokales Datum (für date-fns, unabhängig von der Zeitzone) */
export function isoDayToLocalDate(isoDay: string): Date {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Wie formatDay (lnio/utils/format-date.ts), aber auf Basis von ISO-Tagen und
 * einem expliziten „heute“ (Berlin) statt der Server-Zeitzone.
 */
export function formatIsoDay(
  isoDay: string,
  today: string,
  formatStr: DayFormat = "dd.MM.yy"
): string {
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
  const date = isoDayToLocalDate(isoDay);
  if (diff < -2 && diff > -7) {
    return format(date, "EEEE", { locale: de });
  }
  return format(date, formatStr, { locale: de });
}
