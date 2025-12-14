"use client";

import type {
  ConsentCookieData,
  SetCookieProps,
} from "@/lnio/types/cookie-props";

const COOKIE_CONSENT_NAME =
  process.env.NEXT_PUBLIC_COOKIE_CONSENT_NAME || "cookie-consent";

type UseCookieRes = {
  set: (c: SetCookieProps) => void;
  get: (key: string) => string | null;
  hasConsent: () => ConsentState;
  setConsent: (accepted: boolean) => void;
};

export type ConsentState = "pending" | "accepted" | "rejected";
export const useCookies = (): UseCookieRes => {
  function get(key: string) {
    if (typeof document === "undefined") {
      return null;
    }
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${key}=`);
    if (parts.length === 2) {
      return parts.pop()?.split(";").shift() || null;
    }
    return null;
  }
  function set({ days = 365, value, key }: SetCookieProps) {
    if (typeof document === "undefined") {
      return;
    }
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${key}=${value};expires=${expires.toUTCString()};path=/`;
  }
  const hasConsent = () => {
    const consent = get(COOKIE_CONSENT_NAME);
    if (!consent) {
      return "pending";
    }
    const decoded = decodeURIComponent(consent);
    const data = JSON.parse(decoded);
    if (typeof data !== "object" || data === null) {
      return "pending";
    }
    if (typeof data.accepted !== "boolean") {
      return "pending";
    }
    if (typeof data.timestamp !== "string") {
      return "pending";
    }
    return data.accepted ? "accepted" : "rejected";
  };
  function setConsent(accepted: boolean) {
    const value: ConsentCookieData = {
      accepted,
      timestamp: new Date().toISOString(),
    };
    set({
      key: COOKIE_CONSENT_NAME,
      value: JSON.stringify(value),
    });
  }
  return {
    set,
    get,
    hasConsent,
    setConsent,
  };
};
