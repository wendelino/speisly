/**
 * Einfaches Rate-Limit im Speicher (Sliding Window je Schlüssel). Reicht, weil
 * Speisly als ein Prozess läuft (auch der Route Cache lebt im Speicher); nach
 * einem Neustart beginnen die Zähler von vorn.
 *
 * Schlüssel sind gehashte IPs (user.ts `ipHash`), nie Klartext-IPs.
 */

export type RateLimitRule = {
  /** erlaubte Aufrufe je Fenster */
  limit: number;
  windowMs: number;
};

const MINUTE = 60_000;

/** Grenzen je Aktion (großzügig für echte Nutzer, knapp für Skripte) */
export const RATE_LIMITS = {
  /** Bewertung speichern oder löschen */
  rating: { limit: 20, windowMs: 10 * MINUTE },
  /** Like setzen oder entfernen */
  like: { limit: 60, windowMs: 10 * MINUTE },
  /** Feedback- und Kontaktformular */
  feedback: { limit: 5, windowMs: 10 * MINUTE },
  /** Push-Abo anlegen, ändern oder löschen */
  push: { limit: 30, windowMs: 10 * MINUTE },
  /** Lesende Actions mit DB-Zugriff (Favoritenliste) */
  read: { limit: 300, windowMs: 10 * MINUTE },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/** Längstes Fenster aller Regeln (so lange muss ein Zeitstempel leben) */
const MAX_WINDOW_MS = Math.max(
  ...Object.values(RATE_LIMITS).map((rule) => rule.windowMs)
);
/** Höchstens so oft wird aufgeräumt */
const SWEEP_INTERVAL_MS = MINUTE;
/**
 * Obergrenze für Schlüssel im Speicher. Wer massenhaft IPs vortäuscht, soll
 * den Speicher nicht füllen können; darüber fliegen die ältesten Schlüssel.
 */
export const MAX_KEYS = 20_000;

export function createRateLimiter(
  now: () => number = Date.now,
  maxKeys: number = MAX_KEYS
) {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;

  const sweep = (time: number) => {
    lastSweep = time;
    for (const [key, stamps] of hits) {
      if ((stamps.at(-1) ?? 0) <= time - MAX_WINDOW_MS) {
        hits.delete(key);
      }
    }
  };

  return {
    /**
     * Zählt einen Aufruf. `false`, wenn das Limit im Fenster schon erreicht
     * ist (dann wird nichts gezählt).
     */
    take(key: string, rule: RateLimitRule): boolean {
      const time = now();
      if (time - lastSweep > SWEEP_INTERVAL_MS) {
        sweep(time);
      }
      const recent = (hits.get(key) ?? []).filter(
        (stamp) => stamp > time - rule.windowMs
      );
      if (recent.length >= rule.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(time);
      // ans Ende rücken (Map-Reihenfolge = zuletzt benutzt zuletzt)
      hits.delete(key);
      hits.set(key, recent);
      while (hits.size > maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest === undefined) {
          break;
        }
        hits.delete(oldest);
      }
      return true;
    },
    reset() {
      hits.clear();
    },
    get size() {
      return hits.size;
    },
  };
}

const limiter = createRateLimiter();

/** `true`, wenn der Aufruf erlaubt ist (und zählt ihn) */
export function takeRateLimit(name: RateLimitName, key: string): boolean {
  return limiter.take(`${name}:${key}`, RATE_LIMITS[name]);
}

export const RATE_LIMIT_MESSAGE =
  "Das ging etwas schnell. Bitte versuch es in ein paar Minuten noch einmal.";
