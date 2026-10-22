import type { APIRoute } from "astro";
import { adminAuth, adminUrl } from "@/server/admin";
import { SESSION_COOKIE } from "@/server/admin-auth";

/** Session löschen und beim Provider abmelden (falls angeboten) */
export const prerender = false;

export const GET: APIRoute = async (context) => {
  context.cookies.delete(SESSION_COOKIE, { path: "/" });
  const home = adminUrl("/", context);
  const providerLogout = await adminAuth?.logoutUrl(home);
  return context.redirect(providerLogout ?? home, 302);
};
