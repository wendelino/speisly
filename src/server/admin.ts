import {
  ADMIN_GROUP,
  JWT_SECRET,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_ISSUER,
  SITE_URL,
} from "astro:env/server";
import type { AstroCookieSetOptions, AstroCookies } from "astro";
import {
  type AdminAuth,
  createAdminAuth,
  REFRESH_COOKIE,
  REFRESH_TTL_SECONDS,
  SESSION_COOKIE,
  type SessionCookies,
} from "./admin-auth";

/** `null`: kein OIDC-Client konfiguriert, /admin ist abgeschaltet */
export const adminAuth: AdminAuth | null =
  OIDC_ISSUER && OIDC_CLIENT_ID && OIDC_CLIENT_SECRET
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

/** Session- und Refresh-Cookie nach Login oder Erneuerung setzen */
export function setAdminCookies(cookies: AstroCookies, next: SessionCookies) {
  cookies.set(SESSION_COOKIE, next.session, adminCookie(next.sessionTtl));
  if (next.refresh) {
    cookies.set(REFRESH_COOKIE, next.refresh, adminCookie(REFRESH_TTL_SECONDS));
  } else {
    cookies.delete(REFRESH_COOKIE, { path: "/" });
  }
}

export function clearAdminCookies(cookies: AstroCookies) {
  cookies.delete(SESSION_COOKIE, { path: "/" });
  cookies.delete(REFRESH_COOKIE, { path: "/" });
}
