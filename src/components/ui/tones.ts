/** Farbtöne für Deko-Elemente (Blobs, Punkte, Meter); Tokens in globals.css */
export const TONES = {
  primary: { soft: "bg-secondary", text: "text-primary", solid: "bg-primary" },
  sun: { soft: "bg-sun-soft", text: "text-sun", solid: "bg-gold" },
  mint: { soft: "bg-mint-soft", text: "text-mint", solid: "bg-mint" },
  sky: { soft: "bg-sky-soft", text: "text-sky", solid: "bg-sky" },
  peach: { soft: "bg-peach-soft", text: "text-peach", solid: "bg-peach" },
  rose: { soft: "bg-rose-soft", text: "text-rose", solid: "bg-rose" },
} as const;

export type Tone = keyof typeof TONES;

/** Wechselnde Töne für Listen (z. B. eine Farbe pro Mensa) */
const TONE_CYCLE: readonly Tone[] = [
  "primary",
  "sun",
  "mint",
  "sky",
  "peach",
  "rose",
];
export const toneAt = (index: number): Tone =>
  TONE_CYCLE[index % TONE_CYCLE.length];
