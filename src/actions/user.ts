"use server";

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getCookie, hasConsent, setCookie } from "@/lib/cookie/actions";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/schema";
import { genId } from "@/lib/db/utils";
import { decodeJwt, encodeJwt } from "@/lib/jwt";

const USER_COOKIE_NAME = "speisly_user_id";

// Cookie Management
async function createUserCookie(userId: string): Promise<void> {
  const jwtToken = await encodeJwt({ userId });
  await setCookie({
    key: USER_COOKIE_NAME,
    value: jwtToken,
    httpOnly: true,
  });
}

async function getUserIdFromCookie(): Promise<string | null> {
  const token = await getCookie(USER_COOKIE_NAME);
  if (!token) {
    return null;
  }
  const payload = await decodeJwt(token);
  if (!payload) {
    return null;
  }
  return typeof payload.userId === "string" ? payload.userId : null;
}

// IP Utilities
async function getIpValue(): Promise<string> {
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0] ||
    headersList.get("x-real-ip") ||
    "unknown";

  return createHash("sha256").update(ip).digest("hex");
}

// Database Utilities
async function searchUserInDb(ipHash: string) {
  const existingUser = await db
    .select()
    .from(user)
    .where(eq(user.ipHash, ipHash))
    .limit(1);
  return existingUser.length > 0 ? existingUser[0] : null;
}

// Public API
// Creates user if needed and can set cookies
// Use this ONLY in Server Actions (not Server Components)
// User muss bereits Consent gegeben haben
export async function getOrCreateUser(): Promise<string> {
  const userIdFromCookie = await getUserIdFromCookie();
  if (userIdFromCookie) {
    return userIdFromCookie;
  }

  const ipHash = await getIpValue();
  const existingUser = await searchUserInDb(ipHash);

  if (existingUser) {
    await createUserCookie(existingUser.id);
    return existingUser.id;
  }

  // Neuer User
  const newUserId = genId();
  await createUserCookie(newUserId);
  await db.insert(user).values({
    id: newUserId,
    ipHash,
    cookieHash: newUserId,
  });

  return newUserId;
}

export async function getUserId(): Promise<string | null> {
  const userIdFromCookie = await getUserIdFromCookie();
  if (userIdFromCookie) {
    return userIdFromCookie;
  }

  if (!(await hasConsent())) {
    return null;
  }

  const ipHash = await getIpValue();
  const existingUser = await searchUserInDb(ipHash);
  if (existingUser) {
    // Set cookie for existing user found by IP
    await createUserCookie(existingUser.id);
    return existingUser.id;
  }

  return null;
}
