import type { APIRoute } from "astro";
import { adminAuth, adminUrl, setAdminCookies } from "@/server/admin";
import { FLOW_COOKIE } from "@/server/admin-auth";

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
    redirectUri: adminUrl("/admin/callback"),
  });
  context.cookies.delete(FLOW_COOKIE, { path: "/" });
  if (!result.ok) {
    return new Response(`${result.reason}\n\nErneut anmelden: /admin/login`, {
      status: result.status,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  setAdminCookies(context.cookies, result);
  return context.redirect(result.next, 302);
};
