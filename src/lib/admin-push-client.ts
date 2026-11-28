import { actions } from "astro:actions";
import { vapidPublicKey } from "./public-config";
import { base64UrlToBytes, pushSupport } from "./push-client";

/**
 * Push-Meldungen für Admins (Fehler, neue Kommentare; Versand:
 * src/server/admin-notify.ts). Eigene Service-Worker-Registrierung mit Scope
 * /admin/ (gleiches /sw.js): eine Registrierung hat genau ein Push-Abo, so
 * bleibt es getrennt von den Favoriten-Pushes (lib/push-client.ts), und
 * deren Abschalten beendet die Admin-Meldungen nicht.
 */
const SCOPE = "/admin/";

function registration(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration(SCOPE);
}

export async function adminPushEnabled(): Promise<boolean> {
  if (pushSupport() !== "supported") {
    return false;
  }
  const reg = await registration();
  return Boolean(await reg?.pushManager.getSubscription());
}

export type AdminPushResult = "enabled" | "denied" | "unsupported" | "error";

export async function enableAdminPush(): Promise<AdminPushResult> {
  if (pushSupport() !== "supported") {
    return "unsupported";
  }
  if ((await Notification.requestPermission()) !== "granted") {
    return "denied";
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", {
      scope: SCOPE,
    });
    // auf den aktiven Worker warten: `subscribe` braucht ihn
    const worker = reg.installing ?? reg.waiting;
    if (worker && !reg.active) {
      await new Promise<void>((resolve) => {
        worker.addEventListener("statechange", () => {
          if (worker.state === "activated") {
            resolve();
          }
        });
      });
    }
    const subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(vapidPublicKey() ?? ""),
      }));
    const json = subscription.toJSON();
    const { data, error } = await actions.admin.pushSubscribe({
      endpoint: subscription.endpoint,
      keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    });
    return data?.success && !error ? "enabled" : "error";
  } catch (error) {
    console.error("Admin push subscribe failed:", error);
    return "error";
  }
}

/** Erst auf dem Server löschen, dann im Browser abmelden (wie push-client) */
export async function disableAdminPush(): Promise<boolean> {
  const subscription = await (await registration())?.pushManager
    .getSubscription()
    .catch(() => null);
  if (!subscription) {
    return true;
  }
  const { data, error } = await actions.admin
    .pushUnsubscribe({ endpoint: subscription.endpoint })
    .catch(() => ({ data: undefined, error: true }));
  if (error || !data?.success) {
    return false;
  }
  await subscription.unsubscribe().catch(() => false);
  return true;
}
