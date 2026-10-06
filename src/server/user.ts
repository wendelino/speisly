import { createHash } from "node:crypto";
import type { AstroCookies } from "astro";
import { eq } from "drizzle-orm";
import { user } from "@/lib/db/schema/schema";
import { genId } from "@/lib/db/utils";
import { hasConsent } from "./consent";
import { db } from "./db";
import { decodeJwt, encodeJwt } from "./jwt";

/** Ersetzt src/actions/user.ts (gleiches Cookie, gleiche Logik) */
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

function ipHash(ctx: RequestContext): string {
  const headers = ctx.request.headers;
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    ctx.clientAddress ||
    "unknown";
  return createHash("sha256").update(ip).digest("hex");
}

async function findUserByIpHash(hash: string) {
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.ipHash, hash))
    .limit(1);
  return existing ?? null;
}

/** Erkennt den Nutzer (Cookie, sonst IP-Hash mit Consent). Legt keinen an. */
export async function getUserId(ctx: RequestContext): Promise<string | null> {
  const fromCookie = await getUserIdFromCookie(ctx);
  if (fromCookie) {
    return fromCookie;
  }
  if (!hasConsent(ctx.cookies)) {
    return null;
  }
  const existing = await findUserByIpHash(ipHash(ctx));
  if (existing) {
    await setUserCookie(ctx, existing.id);
    return existing.id;
  }
  return null;
}

/** Wie getUserId, legt aber bei Bedarf einen Nutzer an (nur mit Consent aufrufen) */
export async function getOrCreateUser(ctx: RequestContext): Promise<string> {
  const fromCookie = await getUserIdFromCookie(ctx);
  if (fromCookie) {
    return fromCookie;
  }
  const hash = ipHash(ctx);
  const existing = await findUserByIpHash(hash);
  if (existing) {
    await setUserCookie(ctx, existing.id);
    return existing.id;
  }
  const newUserId = genId();
  await db
    .insert(user)
    .values({ id: newUserId, ipHash: hash, cookieHash: newUserId });
  await setUserCookie(ctx, newUserId);
  return newUserId;
}
