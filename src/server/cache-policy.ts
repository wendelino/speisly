import { diffDays, secondsUntilBerlinMidnight } from "@/lib/dates";
import { TAG } from "./cache-tags";

/** Optionen für `Astro.cache.set()` */
export type CachePolicy = { maxAge: number; swr?: number; tags: string[] };

const HOUR = 3600;
const DAY = 24 * HOUR;

/**
 * Begrenzt eine Regel so, dass weder Frische (`maxAge`) noch
 * stale-while-revalidate über Mitternacht (Berlin) hinausreichen. Nötig für
 * alle Seiten mit „heute“-abhängigem Inhalt (Day-Selector, „Gestern“,
 * Startseite) – nach Mitternacht muss neu gerendert werden.
 */
export function untilMidnight(
  policy: CachePolicy,
  now: Date = new Date()
): CachePolicy {
  const limit = secondsUntilBerlinMidnight(now);
  const maxAge = Math.min(policy.maxAge, limit);
  const swr = Math.max(0, Math.min(policy.swr ?? 0, limit - maxAge));
  return swr > 0
    ? { maxAge, swr, tags: policy.tags }
    : { maxAge, tags: policy.tags };
}

/** Startseite: Speiseplan von heute, bis Mitternacht */
export function homePolicy(today: string, now?: Date): CachePolicy {
  return untilMidnight(
    { maxAge: DAY, tags: [TAG.meals, TAG.home, TAG.day(today)] },
    now
  );
}

/**
 * Tagesseite. Vergangene Tage ändern sich nicht mehr (nur Mitternacht zählt),
 * heute und Zukunft werden beim Sync gezielt über `day:<datum>` invalidiert;
 * 6 h sind nur das Sicherheitsnetz, falls eine Invalidierung fehlt.
 */
export function dayPolicy(day: string, today: string, now?: Date): CachePolicy {
  const isPast = diffDays(today, day) < 0;
  return untilMidnight(
    isPast
      ? { maxAge: 30 * DAY, tags: [TAG.day(day)] }
      : { maxAge: 6 * HOUR, swr: HOUR, tags: [TAG.meals, TAG.day(day)] },
    now
  );
}

/** Detailseite (kein „heute“-Bezug): invalidiert per Sync bzw. Bewertung */
export function mealPolicy(mealId: string): CachePolicy {
  return {
    maxAge: DAY,
    swr: 7 * DAY,
    tags: [TAG.meal(mealId), TAG.ratings(mealId), TAG.comments(mealId)],
  };
}

/**
 * OG-Bild `/og/meal/[id].jpg?v=`: Inhalt je Version fest, daher lange frisch
 * und ohne stale-while-revalidate (das würde nach `maxAge` bei jedem Abruf
 * teuer neu rendern, ohne dass sich etwas ändert). Die Tags räumen den
 * Eintrag ab, sobald eine neue Version entsteht (Sync, Bewertung).
 */
export function ogPolicy(mealId: string): CachePolicy {
  return { maxAge: 30 * DAY, tags: [TAG.meal(mealId), TAG.ratings(mealId)] };
}

/** Server Island „Angebotshistorie“: ändert sich nur durch den Sync */
export function servingStatsPolicy(mealId: string): CachePolicy {
  return { maxAge: 6 * HOUR, swr: DAY, tags: [TAG.mealStats(mealId)] };
}

/** Tags, die nach einem Sync invalidiert werden müssen */
export function tagsForSync(result: {
  changedDates: string[];
  changedMealIds: string[];
}): string[] {
  return [
    ...result.changedDates.map(TAG.day),
    ...result.changedMealIds.flatMap((id) => [TAG.meal(id), TAG.mealStats(id)]),
  ];
}

/**
 * Speisepläne zeigen die Durchschnittsbewertung je Gericht (Anzeige und
 * Sortierung): neue Bewertungen invalidieren deshalb auch die Tage, an denen
 * das Gericht steht.
 */
export function withRatingTags(
  policy: CachePolicy,
  groups: { meals: { id: string }[] }[]
): CachePolicy {
  const ids = new Set(groups.flatMap((group) => group.meals.map((m) => m.id)));
  return { ...policy, tags: [...policy.tags, ...[...ids].map(TAG.ratings)] };
}
