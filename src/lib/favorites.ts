/**
 * Lieblingsgerichte (Gericht-IDs) im localStorage des Browsers. Funktional
 * notwendig für die gewünschte Funktion, daher ohne Cookie-Consent; der
 * Server kennt sie nur bei aktivierten Benachrichtigungen (lib/push-client.ts).
 *
 * Auf den Speiseplänen markiert `favoritesBoot` (inline im <head>) die Karten
 * per generiertem CSS, wie die Filter (lib/filters/boot.ts).
 */
export const FAVORITES_KEY = "speisly-favorites";
export const MAX_FAVORITES = 100;
export const FAVORITES_EVENT = "speisly:favorites-changed";
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function readFavorites(): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(FAVORITES_KEY) ?? "[]"
    );
    return Array.isArray(value)
      ? value.filter(
          (id): id is string => typeof id === "string" && SAFE_ID.test(id)
        )
      : [];
  } catch {
    return [];
  }
}

function writeFavorites(ids: string[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // Speicher voll oder gesperrt (privater Modus): Favorit gilt nur bis zum Neuladen
  }
  document.dispatchEvent(new CustomEvent(FAVORITES_EVENT, { detail: ids }));
}

export function isFavorite(id: string): boolean {
  return readFavorites().includes(id);
}

/** Setzt oder entfernt einen Favoriten, gibt den neuen Zustand zurück */
export function setFavorite(id: string, favorite: boolean): boolean {
  const current = readFavorites().filter((entry) => entry !== id);
  // neueste zuerst; älteste fallen über dem Limit heraus
  writeFavorites(favorite ? [id, ...current].slice(0, MAX_FAVORITES) : current);
  return favorite;
}

/** Entfernt alle Favoriten (Meine Daten → „Alle meine Daten löschen“) */
export function clearFavorites(): void {
  try {
    localStorage.removeItem(FAVORITES_KEY);
  } catch {
    // gesperrter Speicher: nichts zu löschen
  }
  document.dispatchEvent(new CustomEvent(FAVORITES_EVENT, { detail: [] }));
}

/**
 * Inline im <head> der Speisepläne (layouts/plan-layout.astro): zeigt das
 * Herz an Karten von Favoriten (meal-card.astro `data-meal-id`, `.m-fav`).
 * Muss in sich geschlossen sein (wird per `toString()` eingebettet).
 */
export function favoritesBoot() {
  // biome-ignore lint/performance/useTopLevelRegex: Funktion muss in sich geschlossen sein (toString)
  const SAFE = /^[A-Za-z0-9_-]{1,64}$/;
  let ids: string[] = [];
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem("speisly-favorites") ?? "[]"
    );
    if (Array.isArray(value)) {
      ids = value.filter(
        (id): id is string => typeof id === "string" && SAFE.test(id)
      );
    }
  } catch {
    // kein Speicher: keine Favoriten
  }
  if (ids.length === 0) {
    return;
  }
  const sel = ids.map((id) => `[data-meal-id="${id}"]`).join(",");
  const style = document.createElement("style");
  style.id = "speisly-favorites";
  style.textContent = `.m-card:is(${sel}) .m-fav{display:grid}.m-card:is(${sel}):not(:focus-visible){--tw-ring-color:color-mix(in oklab,var(--color-rose) 45%,transparent)}`;
  document.head.append(style);
}
