import type { APIRoute } from "astro";
import { adminAuth, adminCookie, adminUrl } from "@/server/admin";
import { FLOW_COOKIE, FLOW_TTL_SECONDS } from "@/server/admin-auth";

/** Startet den Login beim OIDC-Provider (src/server/admin-auth.ts) */
export const prerender = false;

export const GET: APIRoute = async (context) => {
  if (!adminAuth) {
    return new Response("Admin-Bereich ist nicht konfiguriert", {
      status: 503,
    });
  }
  try {
    const { url, flowCookie } = await adminAuth.startLogin({
      redirectUri: adminUrl("/admin/callback", context),
      next: context.url.searchParams.get("next"),
    });
    context.cookies.set(FLOW_COOKIE, flowCookie, adminCookie(FLOW_TTL_SECONDS));
    return context.redirect(url, 302);
  } catch (error) {
    console.error("[admin] login start failed", error);
    return new Response("Anmeldedienst nicht erreichbar", { status: 502 });
  }
};
