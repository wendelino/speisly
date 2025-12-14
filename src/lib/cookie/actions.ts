"use server";

import { cookies } from "next/headers";
import type { ConsentCookieData } from "@/lnio/types/cookie-props";

type SetCookieProps = {
  key: string;
  value: string;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
};
const COOKIE_CONSENT_NAME = process.env
  .NEXT_PUBLIC_COOKIE_CONSENT_NAME as string;

if (!COOKIE_CONSENT_NAME) {
  throw new Error("NEXT_PUBLIC_COOKIE_CONSENT_NAME is not set");
}

export async function getCookie(key: string): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(key)?.value || null;
}

export async function setCookie({
  key,
  value,
  httpOnly = true,
  maxAge = 365 * 24 * 60 * 60, // one year (seconds)
  path = "/",
}: SetCookieProps): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(key, value, {
    httpOnly,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    path,
  });
}

export async function hasConsent(): Promise<boolean | null> {
  const val = await getCookie(COOKIE_CONSENT_NAME);
  if (!val) {
    return null;
  }

  let data: ConsentCookieData;
  try {
    data = JSON.parse(val);
  } catch {
    return null;
  }

  if (typeof data !== "object" || data === null) {
    return null;
  }
  if (typeof data.accepted !== "boolean") {
    return null;
  }
  if (typeof data.timestamp !== "string") {
    return null;
  }
  return data.accepted;
}

export async function setConsent(accepted: boolean): Promise<void> {
  const value: ConsentCookieData = {
    accepted,
    timestamp: new Date().toISOString(),
  };
  await setCookie({
    key: COOKIE_CONSENT_NAME,
    value: JSON.stringify(value),
    httpOnly: false,
  });
}
