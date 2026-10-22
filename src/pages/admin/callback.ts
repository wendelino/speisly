import type { APIRoute } from "astro";
import { adminAuth, adminCookie, adminUrl } from "@/server/admin";
import {
  FLOW_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/server/admin-auth";

/** Rückkehr vom OIDC-Provider: Session-Cookie setzen oder ablehnen */
export const prerender = false;

export const GET: APIRoute = async (context) => {
  if (!adminAuth) {
    return new Response("Admin-Bereich ist nicht konfiguriert", {
      status: 503,
    });
  }
  const result = await adminAuth.finishLogin({
    params: context.url.searchParams,
    flowCookie: context.cookies.get(FLOW_COOKIE)?.value,
    redirectUri: adminUrl("/admin/callback", context),
  });
  context.cookies.delete(FLOW_COOKIE, { path: "/" });
  if (!result.ok) {
    return new Response(`${result.reason}\n\nErneut anmelden: /admin/login`, {
      status: result.status,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  context.cookies.set(
    SESSION_COOKIE,
    result.session,
    adminCookie(SESSION_TTL_SECONDS)
  );
  return context.redirect(result.next, 302);
};
