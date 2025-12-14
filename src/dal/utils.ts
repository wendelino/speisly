import type { DateInput, DateRange } from "./types";

/**
 * Normalizes a date input (string or DateRange) into a DateRange object
 */
export function normalizeDateRange(date: DateInput): DateRange {
  if (typeof date === "string") {
    return { from: date, to: date };
  }
  return date;
}

/**
 * Fetches JSON data from a URL
 */
export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`);
  }
  const data: T = await response.json();
  return data;
}

/**
 * Converts a string to a URL-friendly slug
 */
export function toSlug(name: string, separator = "-"): string {
  return (
    name
      .toLowerCase()
      .trim()
      // Replace German umlauts and ß with ASCII equivalents
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      // Replace whitespace with separator
      .replace(/\s+/g, separator)
      // Remove all URI-unfriendly characters (reserved, unsafe, and special chars)
      .replace(/[:/?#[\]@!$&'()*+,;=<>"{}|\\^~`]/g, "")
      // Remove multiple consecutive separators
      .replace(new RegExp(`\\${separator}+`, "g"), separator)
      // Trim separators from start and end
      .replace(new RegExp(`^\\${separator}+|\\${separator}+$`, "g"), "")
  );
}

/**
 * Formats performance time in a human-readable format
 */
export function formatPerformanceTime(ms: number): string {
  if (ms > 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  return `${ms} ms`;
}

/**
 * Normalizes a source ID, applying special mappings if needed
 */
export function normalizeSrcId(
  foodId: number,
  mappings: Record<number, string>
): string {
  return mappings[foodId] ?? String(foodId);
}
