import { createHash } from "node:crypto";
import type { AstroCookies } from "astro";
import { user } from "@/lib/db/schema/schema";
import { genId } from "@/lib/db/utils";
import { db } from "./db";
import { decodeJwt, encodeJwt } from "./jwt";

const USER_COOKIE_NAME = "speisly_user_id";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

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

async function getUserIdFromCookie(
  ctx: RequestContext
): Promise<string | null> {
  const token = ctx.cookies.get(USER_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  const payload = await decodeJwt(token);
  return typeof payload?.userId === "string" ? payload.userId : null;
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
export function getUserId(ctx: RequestContext): Promise<string | null> {
  return getUserIdFromCookie(ctx);
}

/** Wie getUserId, legt aber bei Bedarf einen Nutzer an (nur mit Consent aufrufen) */
export async function getOrCreateUser(ctx: RequestContext): Promise<string> {
  const existing = await getUserId(ctx);
  if (existing) {
    return existing;
  }
  const id = genId();
  await db.insert(user).values({ id, ipHash: ipHash(ctx), cookieHash: id });
  await setUserCookie(ctx, id);
  return id;
}
