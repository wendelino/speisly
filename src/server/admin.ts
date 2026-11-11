import {
  ADMIN_GROUP,
  JWT_SECRET,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_ISSUER,
  SITE_URL,
} from "astro:env/server";
import type { AstroCookieSetOptions } from "astro";
import { type AdminAuth, createAdminAuth } from "./admin-auth";

/** `null`: kein OIDC-Client konfiguriert, /admin ist abgeschaltet */
export const adminAuth: AdminAuth | null =
  OIDC_CLIENT_ID && OIDC_CLIENT_SECRET
    ? createAdminAuth({
        settings: {
          issuer: OIDC_ISSUER,
          clientId: OIDC_CLIENT_ID,
          clientSecret: OIDC_CLIENT_SECRET,
          adminGroup: ADMIN_GROUP,
        },
        secret: JWT_SECRET,
      })
    : null;

/**
 * Absolute URL für die OIDC-Redirects, immer auf Basis von `SITE_URL` (die
 * Request-URL kennt hinter dem Proxy weder Protokoll noch öffentlichen Host).
 */
export function adminUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}

export function adminCookie(maxAge: number): AstroCookieSetOptions {
  return {
    httpOnly: true,
    secure: !import.meta.env.DEV,
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}
