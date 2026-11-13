import { createHash } from "node:crypto";
import type { AstroCookies } from "astro";
import { eq } from "drizzle-orm";
import { user } from "@/lib/db/schema/schema";
import { genId } from "@/lib/db/utils";
import { hasConsent } from "./consent";
import { db } from "./db";
import { decodeJwt, encodeJwt } from "./jwt";

const USER_COOKIE_NAME = "speisly_user_id";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
/**
 * Ab diesem Alter wird das Cookie bei der nächsten Aktion neu ausgestellt.
 * Sonst liefe es (wie das JWT) nach genau einem Jahr ab, auch bei aktiven
 * Nutzern, und sie verlören den Zugriff auf ihre Bewertungen.
 */
export const RENEW_AFTER_SECONDS = 30 * 24 * 60 * 60;

export type RequestContext = {
  cookies: AstroCookies;
  request: Request;
  clientAddress?: string;
};

async function setUserCookie(ctx: RequestContext, userId: string) {
  ctx.cookies.set(USER_COOKIE_NAME, await encodeJwt({ userId }), {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });
}

/** Entfernt das Nutzer-Cookie (nach „Alle meine Daten löschen“) */
export function clearUserCookie(ctx: RequestContext): void {
  ctx.cookies.delete(USER_COOKIE_NAME, { path: "/" });
}

async function readUserCookie(
  ctx: RequestContext
): Promise<{ userId: string; issuedAt: number } | null> {
  const token = ctx.cookies.get(USER_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  const payload = await decodeJwt(token);
  return typeof payload?.userId === "string"
    ? { userId: payload.userId, issuedAt: payload.iat ?? 0 }
    : null;
}

/** `true`, wenn ein Cookie mit Ausstellungszeit `issuedAt` erneuert werden soll */
export function shouldRenew(issuedAt: number, now = Date.now()): boolean {
  return now / 1000 - issuedAt > RENEW_AFTER_SECONDS;
}

/**
 * Client-IP hinter dem Reverse Proxy (Traefik in Dokploy). Maßgeblich ist der
 * **letzte** Eintrag in `X-Forwarded-For`: den hängt Traefik selbst an (die
 * Adresse, die es gesehen hat). Frühere Einträge kann der Client mitschicken;
 * Traefik verwirft sie zwar ohne `forwardedHeaders.trustedIPs`/`insecure`,
 * darauf verlassen wir uns aber nicht. Ohne Header (lokal) die Socket-Adresse.
 */
export function clientIp(headers: Headers, clientAddress?: string): string {
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded?.at(-1) || clientAddress || "unknown";
}

/** SHA-256 der Client-IP (Rate-Limit, Missbrauchserkennung) */
export function ipHash(ctx: RequestContext): string {
  const ip = clientIp(ctx.request.headers, ctx.clientAddress);
  return createHash("sha256").update(ip).digest("hex");
}

/**
 * Erkennt den Nutzer am (signierten) Cookie. Legt keinen an.
 *
 * Bewusst kein Rückgriff auf den IP-Hash: Hinter geteilten Netzen (eduroam,
 * Wohnheim, Mobilfunk-NAT) teilen sich viele Menschen eine IP, und
 * `X-Forwarded-For` lässt sich fälschen. Ein Treffer über die IP würde einem
 * Fremden das Cookie des Nutzers ausstellen (eigene Bewertungen samt nicht
 * freigegebener Kommentare lesen, ändern, löschen).
 */
export async function getUserId(ctx: RequestContext): Promise<string | null> {
  const cookie = await readUserCookie(ctx);
  if (!cookie) {
    return null;
  }
  // Wer aktiv ist, behält seine Kennung (nur mit Consent neu setzen)
  if (shouldRenew(cookie.issuedAt) && hasConsent(ctx.cookies)) {
    await setUserCookie(ctx, cookie.userId);
  }
  return cookie.userId;
}

async function userExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);
  return Boolean(row);
}

/** Wie getUserId, legt aber bei Bedarf einen Nutzer an (nur mit Consent aufrufen) */
export async function getOrCreateUser(ctx: RequestContext): Promise<string> {
  const existing = await getUserId(ctx);
  // Cookie eines gelöschten Nutzers („Alle meine Daten löschen“ in einem
  // anderen Tab): neu anlegen statt am Fremdschlüssel zu scheitern
  if (existing && (await userExists(existing))) {
    return existing;
  }
  const id = genId();
  await db.insert(user).values({ id, ipHash: ipHash(ctx), cookieHash: id });
  await setUserCookie(ctx, id);
  return id;
}
