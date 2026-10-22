import { TIME_ZONE } from "./dates";
import { formatDecimal, formatEuro } from "./format";

/** Anzeige im Admin-Bereich (src/pages/admin) */

export function formatDateTime(value: Date | string | null): string {
  if (!value) {
    return "–";
  }
  return new Date(value).toLocaleString("de-DE", {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDuration(ms: number | null): string {
  if (ms === null) {
    return "–";
  }
  return ms < 1000 ? `${ms} ms` : `${formatDecimal(ms / 1000)} s`;
}

type Prices = { stud: number; work: number; guest: number };

function isPrices(value: unknown): value is Prices {
  return (
    typeof value === "object" &&
    value !== null &&
    "stud" in value &&
    "work" in value &&
    "guest" in value
  );
}

/** Wert einer Gerichtsänderung (`meal_change.prev`/`next`) */
export function formatChangeValue(value: unknown): string {
  if (isPrices(value)) {
    return `${formatEuro(value.stud)} / ${formatEuro(value.work)} / ${formatEuro(value.guest)} €`;
  }
  if (typeof value === "string") {
    return value === "" ? "(leer)" : value;
  }
  return JSON.stringify(value);
}

export const FIELD_LABEL = {
  name: "Name",
  subtitle: "Untertitel",
  img_path: "Bild",
  price: "Preis",
} as const;

export const STATUS_LABEL = {
  running: "läuft",
  success: "erfolgreich",
  partial: "teilweise",
  failed: "fehlgeschlagen",
} as const;

export const STATUS_TONE = {
  running: "sky",
  success: "mint",
  partial: "sun",
  failed: "rose",
} as const;
