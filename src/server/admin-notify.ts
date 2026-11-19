import { eq } from "drizzle-orm";
import { adminPushSubscription } from "@/lib/db/schema/schema";
import { genId } from "@/lib/db/utils";
import { db } from "./db";
import { sendTelegramMessage } from "./telegram";
import {
  isPushEndpoint,
  pushEnabled,
  SEND_TIMEOUT_MS,
  sendWebPush,
} from "./web-push";

/**
 * Meldungen an die Admins: Telegram wie bisher und zusätzlich Web-Push an
 * alle Geräte, die im Admin-Bereich „Push-Meldungen“ eingeschaltet haben.
 *
 * Ruft nie `logError` auf: ein fehlgeschlagener Push würde sonst wieder
 * gemeldet (Schleife). Push-Fehler landen nur in der Konsole, abgelaufene
 * Abos (404/410) werden gelöscht. Telegram-Fehler werfen wie bisher.
 */

export type AdminNoticeAction = {
  /** `approved` / `rejected`: im Service Worker per POST /api/moderate */
  action: string;
  title: string;
  token: string;
};

export type AdminNotice = {
  title: string;
  body: string;
  /** Ziel beim Antippen */
  url: string;
  /** gleiche `tag` ersetzt die vorige Benachrichtigung statt zu stapeln */
  tag?: string;
  actions?: AdminNoticeAction[];
};

export async function notifyAdmins(
  notice: AdminNotice,
  { telegram = true }: { telegram?: boolean } = {}
): Promise<void> {
  const push = sendAdminPush(notice).catch((error: unknown) => {
    console.error("[admin-notify] push failed", error);
  });
  try {
    if (telegram) {
      await sendTelegramMessage(
        notice.body ? `${notice.title}\n${notice.body}` : notice.title
      );
    }
  } finally {
    await push;
  }
}

async function sendAdminPush(notice: AdminNotice): Promise<void> {
  if (!pushEnabled) {
    return;
  }
  const subs = await db.select().from(adminPushSubscription);
  const payload = JSON.stringify(notice);
  await Promise.all(
    subs.map(async (sub) => {
      if (!isPushEndpoint(sub.endpoint)) {
        await removeAdminSubscription(sub.endpoint);
        return;
      }
      try {
        await sendWebPush(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 24 * 3600, urgency: "high", timeout: SEND_TIMEOUT_MS }
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await removeAdminSubscription(sub.endpoint);
        } else {
          console.error("[admin-notify] push failed", status, error);
        }
      }
    })
  );
}

export type AdminSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function upsertAdminSubscription(
  input: AdminSubscriptionInput,
  adminSub: string
): Promise<void> {
  const values = {
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    adminSub,
  };
  await db
    .insert(adminPushSubscription)
    .values({ id: genId(), endpoint: input.endpoint, ...values })
    .onConflictDoUpdate({
      target: adminPushSubscription.endpoint,
      set: values,
    });
}

export async function removeAdminSubscription(endpoint: string): Promise<void> {
  await db
    .delete(adminPushSubscription)
    .where(eq(adminPushSubscription.endpoint, endpoint));
}
