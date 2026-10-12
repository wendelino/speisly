/**
 * In-Process-Memo mit TTL für selten veränderliche Daten.
 * Gleichzeitige Aufrufe teilen sich ein Promise; Fehler werden nicht gecacht.
 */
export function memoize<T>(
  fn: () => Promise<T>,
  ttlMs: number
): (() => Promise<T>) & { clear: () => void } {
  let cached: { value: Promise<T>; expires: number } | null = null;

  const get = () => {
    const now = Date.now();
    if (cached && cached.expires > now) {
      return cached.value;
    }
    const value = fn();
    cached = { value, expires: now + ttlMs };
    value.catch(() => {
      cached = null;
    });
    return value;
  };

  return Object.assign(get, {
    clear: () => {
      cached = null;
    },
  });
}
