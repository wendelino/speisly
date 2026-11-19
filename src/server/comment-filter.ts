import { WORDS_DE, WORDS_EN } from "./comment-words";

/**
 * Wortfilter für Bewertungskommentare: ohne Treffer wird ein Kommentar sofort
 * veröffentlicht, mit Treffer zurückgehalten, und die Admins bekommen eine
 * Benachrichtigung (src/server/comment-notify.ts).
 *
 * Abgleich auf normalisiertem Text (klein, ä→ae/ß→ss, einfache Leetspeak
 * wie „sch3isse“, „scheeeiße“ → „scheisse“): ganze Wörter und Phrasen;
 * deutsche Einzelwörter ab `COMPOUND_MIN` Zeichen auch in Zusammensetzungen
 * („Riesenarschloch“). Kürzere nur als ganzes Wort, sonst träfe „arsch“
 * auch „Marsch“.
 */

const COMPOUND_MIN = 6;
/** Zusammensetzungen, die einen Listeneintrag enthalten, aber harmlos sind */
const SAFE_COMPOUNDS = ["ochsenschwanz", "entscheid"];

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
  "€": "e",
};
const UMLAUTS: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
};
const LEET_CHARS = /[013457@$€]/g;
const UMLAUT_CHARS = /[äöüß]/g;
const REPEATS = /(.)\1{2,}/g;
const LETTERS = /[a-z]+/g;

export function normalizeComment(text: string): string {
  const lower = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(LEET_CHARS, (c) => LEET[c] ?? c)
    .replace(UMLAUT_CHARS, (c) => UMLAUTS[c] ?? c)
    .replace(REPEATS, "$1");
  return (lower.match(LETTERS) ?? []).join(" ");
}

type Entry = { word: string; normalized: string; compound: boolean };

function entries(words: readonly string[], compounds: boolean): Entry[] {
  return words.flatMap((word) => {
    const normalized = normalizeComment(word);
    return normalized
      ? [
          {
            word,
            normalized,
            compound:
              compounds &&
              !normalized.includes(" ") &&
              normalized.length >= COMPOUND_MIN,
          },
        ]
      : [];
  });
}

const ENTRIES: Entry[] = [
  ...entries(WORDS_DE, true),
  ...entries(WORDS_EN, false),
];

/** Treffer (normalisiert, ohne Doppelte); leer = unbedenklich */
export function findFlaggedWords(text: string): string[] {
  const normalized = normalizeComment(text);
  if (!normalized) {
    return [];
  }
  const padded = ` ${normalized} `;
  const tokens = normalized
    .split(" ")
    .filter((token) => !SAFE_COMPOUNDS.some((safe) => token.includes(safe)));
  const hits = new Set<string>();
  for (const entry of ENTRIES) {
    if (
      padded.includes(` ${entry.normalized} `) ||
      (entry.compound && tokens.some((t) => t.includes(entry.normalized)))
    ) {
      hits.add(entry.normalized);
    }
  }
  return [...hits];
}
