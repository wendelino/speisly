import { actions } from "astro:actions";
import { PUBLIC_VAPID_PUBLIC_KEY } from "astro:env/client";
import { readFavorites } from "./favorites";
import { registerServiceWorker } from "./service-worker";

/**
 * Web-Push im Browser: Benachrichtigung, wenn ein Favorit morgen auf dem
 * Speiseplan steht (Versand: src/server/push.ts). Das Abo samt Favoriten und
 * gewählten Mensen liegt auf dem Server und wird bei Änderungen
 * aktualisiert.
 */
const MENSA_COOKIE = "speisly_mensa_preferences";

export type PushSupport = "supported" | "unsupported" | "not-configured";

export function pushSupport(): PushSupport {
  if (!PUBLIC_VAPID_PUBLIC_KEY) {
    return "not-configured";
  }
  return "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
    ? "supported"
    : "unsupported";
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

/** Mensa-Auswahl aus dem Filter-Cookie (leer = alle) */
function selectedMensen(): string[] {
  const parts = `; ${document.cookie}`.split(`; ${MENSA_COOKIE}=`);
  const raw = parts.length === 2 ? parts.pop()?.split(";")[0] : undefined;
  if (!raw) {
    return [];
  }
  for (const candidate of [raw, decodeURIComponent(raw)]) {
    try {
      const value: unknown = JSON.parse(candidate);
      if (Array.isArray(value)) {
        return value.filter((v): v is string => typeof v === "string");
      }
    } catch {
      // nächste Variante
    }
  }
  return [];
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "supported") {
    return null;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function save(subscription: PushSubscription): Promise<boolean> {
  const json = subscription.toJSON();
  const { data, error } = await actions.push.subscribe({
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    favorites: readFavorites(),
    mensaIds: selectedMensen(),
  });
  return Boolean(data?.success) && !error;
}

export type EnableResult = "enabled" | "denied" | "unsupported" | "error";

/** Fragt nach Erlaubnis, abonniert und speichert das Abo */
export async function enablePush(): Promise<EnableResult> {
  if (pushSupport() !== "supported") {
    return "unsupported";
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return "denied";
  }
  try {
    const registration = await registerServiceWorker();
    if (!registration) {
      return "unsupported";
    }
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(PUBLIC_VAPID_PUBLIC_KEY ?? ""),
      }));
    return (await save(subscription)) ? "enabled" : "error";
  } catch (error) {
    console.error("Push subscribe failed:", error);
    return "error";
  }
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) {
    return;
  }
  const { endpoint } = subscription;
  await subscription.unsubscribe().catch(() => false);
  await actions.push.unsubscribe({ endpoint }).catch(() => null);
}

/** Favoriten/Mensen eines bestehenden Abos aktualisieren (nach Änderungen) */
export async function syncPush(): Promise<void> {
  const subscription = await currentSubscription().catch(() => null);
  if (subscription) {
    await save(subscription).catch(() => false);
  }
}
