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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return bytes < 1024 * 1024
    ? `${formatDecimal(bytes / 1024)} KB`
    : `${formatDecimal(bytes / 1024 / 1024)} MB`;
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
  // Zutaten/Extras einer Ausgabe
  if (Array.isArray(value)) {
    return value.length === 0 ? "(leer)" : value.join(", ");
  }
  if (value === null || value === undefined) {
    return "–";
  }
  return JSON.stringify(value);
}

/**
 * Gericht, um das es in einem Fehler geht: `ctx.mealId` oder
 * `ctx.change.mealId` (Sync, src/server/sync/db.ts)
 */
export function mealIdOf(ctx: unknown): string | null {
  if (typeof ctx !== "object" || ctx === null) {
    return null;
  }
  const { mealId, change } = ctx as { mealId?: unknown; change?: unknown };
  if (typeof mealId === "string") {
    return mealId;
  }
  return typeof change === "object" &&
    change !== null &&
    "mealId" in change &&
    typeof change.mealId === "string"
    ? change.mealId
    : null;
}

const ID_PATTERN = /\b[0-9a-f]{32}\b/g;
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

/**
 * Fehlerkontext als HTML, IDs (32 Hex-Zeichen, `genId`) verlinkt auf die
 * ID-Suche (src/pages/admin/search.astro)
 */
export function ctxToHtml(ctx: unknown): string {
  return JSON.stringify(ctx, null, 2)
    .replace(/[&<>"]/g, (char) => HTML_ESCAPES[char])
    .replace(
      ID_PATTERN,
      (id) =>
        `<a class="text-primary underline-offset-4 hover:underline" href="/admin/search?q=${id}">${id}</a>`
    );
}

const LINK_CLASS = "text-primary underline-offset-4 hover:underline";
const URL_PATTERN = /^https?:\/\//;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char]);
}

/** Blatt im JSON-Baum, farbig nach Typ, URLs und IDs verlinkt */
function jsonLeafHtml(value: unknown): string {
  if (typeof value === "string") {
    const text = escapeHtml(JSON.stringify(value));
    const linked = URL_PATTERN.test(value)
      ? `<a class="${LINK_CLASS}" href="${escapeHtml(value)}" rel="noreferrer" target="_blank">${text}</a>`
      : text.replace(
          ID_PATTERN,
          (id) =>
            `<a class="${LINK_CLASS}" href="/admin/search?q=${id}">${id}</a>`
        );
    return `<span class="jt-string">${linked}</span>`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return `<span class="jt-${typeof value}">${value}</span>`;
  }
  return '<span class="jt-null">null</span>';
}

/**
 * JSON als einklappbarer Baum aus `<details>`
 * (src/pages/admin/api-response/[id].astro), Ebenen unter `openDepth` offen
 */
export function jsonTreeHtml(value: unknown, openDepth = 2): string {
  const render = (
    node: unknown,
    key: string | null,
    depth: number,
    last: boolean
  ): string => {
    const label =
      key === null ? "" : `<span class="jt-key">${escapeHtml(key)}</span>: `;
    const comma = last ? "" : ",";
    if (node === null || typeof node !== "object") {
      return `<div class="jt-row">${label}${jsonLeafHtml(node)}${comma}</div>`;
    }
    const isArray = Array.isArray(node);
    const entries: [string | null, unknown][] = isArray
      ? node.map((item) => [null, item])
      : Object.entries(node).map(([k, v]) => [JSON.stringify(k), v]);
    const [open, close] = isArray ? ["[", "]"] : ["{", "}"];
    if (entries.length === 0) {
      return `<div class="jt-row">${label}${open}${close}${comma}</div>`;
    }
    const count = isArray
      ? `${entries.length} ${entries.length === 1 ? "Eintrag" : "Einträge"}`
      : `${entries.length} Schlüssel`;
    const children = entries
      .map(([k, v], i) => render(v, k, depth + 1, i === entries.length - 1))
      .join("");
    return (
      `<details class="jt"${depth < openDepth ? " open" : ""}>` +
      `<summary class="jt-row">${label}${open}<span class="jt-hint"> … ${close}${comma}</span>` +
      ` <span class="jt-count">${count}</span></summary>` +
      `<div class="jt-children">${children}</div>` +
      `<div class="jt-row">${close}${comma}</div></details>`
    );
  };
  return render(value, null, 0, true);
}

export const FIELD_LABEL = {
  name: "Name",
  subtitle: "Untertitel",
  img_path: "Bild",
  price: "Preis",
  ingredients: "Zutaten",
  extras: "Extras",
} as const;

/** Spalte „Feld“ der Änderungstabelle, inkl. entfernter Ausgaben */
export const CHANGE_LABEL = {
  ...FIELD_LABEL,
  removed: "Ausgabe entfernt",
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
