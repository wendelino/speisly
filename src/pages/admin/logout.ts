import type { APIRoute } from "astro";
import { adminAuth, adminUrl, clearAdminCookies } from "@/server/admin";
import { REFRESH_COOKIE } from "@/server/admin-auth";

/**
 * Session löschen, Refresh-Token widerrufen und beim Provider abmelden
 * (soweit er das anbietet)
 */
export const prerender = false;

export const GET: APIRoute = async (context) => {
  await adminAuth?.revoke(context.cookies.get(REFRESH_COOKIE)?.value);
  clearAdminCookies(context.cookies);
  const home = adminUrl("/");
  const providerLogout = await adminAuth?.logoutUrl(home);
  return context.redirect(providerLogout ?? home, 302);
};
