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
 * Absolute URL für die OIDC-Redirects. Basis ist `SITE_URL`, sonst in
 * Produktion `site` (der Server setzt den Host fest auf speisly.de und kennt
 * das Protokoll hinter dem Proxy nicht), im Dev-Server der Request.
 */
export function adminUrl(path: string, context: { url: URL; site?: URL }) {
  const base =
    SITE_URL ??
    (import.meta.env.DEV || !context.site ? context.url : context.site);
  return new URL(path, base).toString();
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
