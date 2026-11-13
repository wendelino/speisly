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
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/** Ab so vielen Schlüsseln wird beim nächsten Aufruf aufgeräumt */
const SWEEP_THRESHOLD = 5000;

export function createRateLimiter(now: () => number = Date.now) {
  const hits = new Map<string, number[]>();

  const sweep = (time: number, windowMs: number) => {
    for (const [key, stamps] of hits) {
      if ((stamps.at(-1) ?? 0) <= time - windowMs) {
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
      if (hits.size > SWEEP_THRESHOLD) {
        sweep(time, rule.windowMs);
      }
      const recent = (hits.get(key) ?? []).filter(
        (stamp) => stamp > time - rule.windowMs
      );
      if (recent.length >= rule.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(time);
      hits.set(key, recent);
      return true;
    },
    reset() {
      hits.clear();
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
