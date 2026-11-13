import { PUBLIC_VAPID_PUBLIC_KEY } from "astro:env/client";
import { SITE_URL, VAPID_PRIVATE_KEY, VAPID_SUBJECT } from "astro:env/server";
import { and, arrayOverlaps, eq, inArray, isNull, ne, or } from "drizzle-orm";
import webpush from "web-push";
import { toUtcDate } from "@/lib/dates";
import {
  meal,
  mensa,
  mensaMeal,
  pushSubscription,
} from "@/lib/db/schema/schema";
import { genId } from "@/lib/db/utils";
import { formatDay } from "@/lib/format";
import { db } from "./db";
import { logError } from "./log";

/**
 * Web-Push für Favoriten: Abos verwalten und abends benachrichtigen, wenn
 * ein Lieblingsgericht am nächsten Tag auf dem Plan steht (POST /api/notify,
 * Cron in server/cron.mjs). Ohne VAPID-Schlüssel abgeschaltet.
 */

export const pushEnabled = Boolean(
  PUBLIC_VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY
);

if (pushEnabled) {
  webpush.setVapidDetails(
    VAPID_SUBJECT || SITE_URL,
    PUBLIC_VAPID_PUBLIC_KEY as string,
    VAPID_PRIVATE_KEY as string
  );
}

/**
 * Hosts der Push-Dienste der Browser (Chrome/Edge/Samsung/Opera über FCM,
 * Firefox, Safari, Windows). Nur an diese sendet der Server; sonst könnte
 * ein Abo mit `https://10.0.0.5/…` den Cron interne Adressen aufrufen lassen.
 */
const PUSH_HOSTS =
  /(?:^|\.)(?:googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

/** `true` für https-URLs eines bekannten Push-Dienstes (Standard-Port) */
export function isPushEndpoint(endpoint: string): boolean {
  if (!URL.canParse(endpoint)) {
    return false;
  }
  const url = new URL(endpoint);
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    PUSH_HOSTS.test(url.hostname)
  );
}

/** Höchstens so lange auf einen Push-Dienst warten */
const SEND_TIMEOUT_MS = 10_000;

export type SubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  favorites: string[];
  mensaIds: string[];
};

/** Legt ein Abo an oder aktualisiert Schlüssel, Favoriten und Mensen */
export async function upsertSubscription(input: SubscriptionInput) {
  const values = {
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    favorites: [...new Set(input.favorites)],
    mensaIds: [...new Set(input.mensaIds)],
  };
  await db
    .insert(pushSubscription)
    .values({ id: genId(), endpoint: input.endpoint, ...values })
    .onConflictDoUpdate({ target: pushSubscription.endpoint, set: values });
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  await db
    .delete(pushSubscription)
    .where(eq(pushSubscription.endpoint, endpoint));
}

type Serving = {
  mealId: string;
  mealName: string;
  mensaId: string;
  mensaName: string;
};

type Subscriber = {
  id: string;
  favorites: string[];
  mensaIds: string[];
};

export type Notification = {
  subscriptionId: string;
  title: string;
  body: string;
  url: string;
};

/**
 * Baut je Abo höchstens eine Benachrichtigung: Favoriten, die am Tag in einer
 * der gewählten Mensen (leer = alle) angeboten werden. Pure Funktion.
 */
export function buildNotifications(
  subscribers: Subscriber[],
  servings: Serving[],
  day: string,
  dayLabel: string
): Notification[] {
  const notifications: Notification[] = [];
  for (const sub of subscribers) {
    const favorites = new Set(sub.favorites);
    const mensen = new Set(sub.mensaIds);
    // je Gericht die Mensen sammeln
    const matches = new Map<string, { name: string; mensen: string[] }>();
    for (const serving of servings) {
      if (
        !favorites.has(serving.mealId) ||
        (mensen.size > 0 && !mensen.has(serving.mensaId))
      ) {
        continue;
      }
      const entry = matches.get(serving.mealId) ?? {
        name: serving.mealName,
        mensen: [],
      };
      if (!entry.mensen.includes(serving.mensaName)) {
        entry.mensen.push(serving.mensaName);
      }
      matches.set(serving.mealId, entry);
    }
    if (matches.size === 0) {
      continue;
    }
    const [first, ...rest] = [...matches.values()];
    const where = first.mensen.join(", ");
    const more =
      rest.length === 0
        ? ""
        : rest.length === 1
          ? ` und „${rest[0].name}“`
          : ` und ${rest.length} weitere Favoriten`;
    notifications.push({
      subscriptionId: sub.id,
      title:
        matches.size === 1
          ? `${dayLabel} gibt’s deinen Favoriten`
          : `${dayLabel} gibt’s ${matches.size} deiner Favoriten`,
      body: `„${first.name}“ (${where})${more}`,
      url: `/day/${day}`,
    });
  }
  return notifications;
}

export type NotifyResult = {
  day: string;
  subscribers: number;
  sent: number;
  failed: number;
  removed: number;
};

/**
 * Benachrichtigt alle Abos, deren Favoriten am `day` angeboten werden. Jedes
 * Abo höchstens einmal für denselben Tag (`last_notified_for`), abgelaufene Abos
 * (404/410 vom Push-Dienst) werden gelöscht.
 */
export async function notifyFavorites(
  day: string,
  dayLabel = formatDay(day, "EEEE")
): Promise<NotifyResult> {
  const result: NotifyResult = {
    day,
    subscribers: 0,
    sent: 0,
    failed: 0,
    removed: 0,
  };
  if (!pushEnabled) {
    return result;
  }

  const servings = await db
    .select({
      mealId: meal.id,
      mealName: meal.name,
      mensaId: mensa.id,
      mensaName: mensa.name,
    })
    .from(mensaMeal)
    .innerJoin(meal, eq(mensaMeal.mealId, meal.id))
    .innerJoin(mensa, eq(mensaMeal.mensaId, mensa.id))
    .where(eq(mensaMeal.date, toUtcDate(day)))
    .orderBy(mensa.name, meal.name);
  if (servings.length === 0) {
    return result;
  }
  const mealIds = [...new Set(servings.map((s) => s.mealId))];

  const subscribers = await db
    .select({
      id: pushSubscription.id,
      endpoint: pushSubscription.endpoint,
      p256dh: pushSubscription.p256dh,
      auth: pushSubscription.auth,
      favorites: pushSubscription.favorites,
      mensaIds: pushSubscription.mensaIds,
    })
    .from(pushSubscription)
    .where(
      and(
        arrayOverlaps(pushSubscription.favorites, mealIds),
        or(
          isNull(pushSubscription.lastNotifiedFor),
          // je Tag nur einmal; ein manueller Lauf für einen späteren Tag
          // blockiert die regulären davor nicht
          ne(pushSubscription.lastNotifiedFor, day)
        )
      )
    );
  result.subscribers = subscribers.length;

  const byId = new Map(subscribers.map((sub) => [sub.id, sub]));
  const notifications = buildNotifications(
    subscribers,
    servings,
    day,
    dayLabel
  );

  const delivered: string[] = [];
  const expired: string[] = [];
  // in kleinen Gruppen senden, damit kein Push-Dienst geflutet wird
  for (let i = 0; i < notifications.length; i += 10) {
    await Promise.all(
      notifications.slice(i, i + 10).map(async (notification) => {
        const sub = byId.get(notification.subscriptionId);
        if (!sub) {
          return;
        }
        // Altbestand vor der Prüfung in push.subscribe: nie fremde Hosts
        if (!isPushEndpoint(sub.endpoint)) {
          expired.push(sub.id);
          return;
        }
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify({
              title: notification.title,
              body: notification.body,
              url: notification.url,
              tag: `favorites-${day}`,
            }),
            { TTL: 12 * 3600, urgency: "normal", timeout: SEND_TIMEOUT_MS }
          );
          delivered.push(sub.id);
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            expired.push(sub.id);
          } else {
            result.failed += 1;
            logError({
              message: "Push notification failed",
              ctx: { status, error },
              source: "push",
              notify: false,
            });
          }
        }
      })
    );
  }

  if (delivered.length > 0) {
    await db
      .update(pushSubscription)
      .set({ lastNotifiedFor: day })
      .where(inArray(pushSubscription.id, delivered));
  }
  if (expired.length > 0) {
    await db
      .delete(pushSubscription)
      .where(inArray(pushSubscription.id, expired));
  }
  result.sent = delivered.length;
  result.removed = expired.length;
  return result;
}
