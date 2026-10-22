import { defineMiddleware, sequence } from "astro:middleware";
import { parseDayParam } from "@/lib/dates";

const DAY_ROUTE = /^\/day\/([^/]+)\/?$/;

/**
 * - /day/heute (alte URL) → 301 auf /
 * - /day/<ungültig oder außerhalb des Fensters> → 404, bevor gerendert wird
 */
const dayRoute = defineMiddleware((context, next) => {
  const match = DAY_ROUTE.exec(context.url.pathname);
  if (match) {
    const param = decodeURIComponent(match[1]);
    if (param === "heute") {
      return context.redirect("/", 301);
    }
    if (!parseDayParam(param)) {
      return new Response(null, { status: 404 });
    }
  }
  return next();
});

/** Ohne Session erreichbar: der Login selbst */
const ADMIN_PUBLIC = new Set([
  "/admin/login",
  "/admin/callback",
  "/admin/logout",
]);
const ADMIN_ACTION = "/_actions/admin.";

/**
 * /admin und die Admin-Actions nur mit gültiger Session (src/server/admin.ts).
 * Antworten dort nie cachen und nicht indexieren.
 */
const adminGuard = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const isAdmin = path === "/admin" || path.startsWith("/admin/");
  if (!(isAdmin || path.startsWith(ADMIN_ACTION))) {
    return next();
  }
  if (!ADMIN_PUBLIC.has(path)) {
    // erst hier laden: liest Secrets, die beim Prerendern fehlen
    const [{ adminAuth }, { SESSION_COOKIE }] = await Promise.all([
      import("@/server/admin"),
      import("@/server/admin-auth"),
    ]);
    const session = await adminAuth?.readSession(
      context.cookies.get(SESSION_COOKIE)?.value
    );
    if (!session) {
      if (!isAdmin) {
        return new Response(null, { status: 401 });
      }
      const login = `/admin/login?next=${encodeURIComponent(path + context.url.search)}`;
      return context.redirect(login, 302);
    }
    context.locals.admin = session;
  }
  const response = await next();
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
});

/**
 * Browser-Caching für on-demand gerenderte Antworten. Gecacht wird
 * serverseitig (Route Cache, Treffer kosten ~1 ms); der Browser soll HTML
 * immer neu anfragen, damit z. B. eine neue Bewertung sofort sichtbar ist
 * (unveränderte Seiten kosten dank ETag nur ein 304, server/compress.mjs).
 * Hashed Assets (/_astro/*) und prerenderte Seiten liefert der Node-Adapter
 * mit eigenen Headern aus, sie laufen nicht durch diese Middleware.
 */
const browserCaching = defineMiddleware(async (context, next) => {
  const response = await next();
  if (context.isPrerendered || response.headers.has("Cache-Control")) {
    return response;
  }
  const path = context.url.pathname;
  const isApi = path.startsWith("/api/") || path.startsWith("/_actions/");
  let cacheControl = "public, max-age=0, must-revalidate";
  if (isApi || context.request.method !== "GET") {
    cacheControl = "no-store";
  } else if (path.startsWith("/_server-islands/")) {
    // Island-URLs enthalten die (verschlüsselten) Props, der Inhalt ändert
    // sich nur durch den Sync: eine Stunde Browser-Cache spart den Request
    // beim erneuten Öffnen eines Gerichts
    cacheControl = "public, max-age=3600";
  }
  response.headers.set("Cache-Control", cacheControl);
  return response;
});

export const onRequest = sequence(dayRoute, adminGuard, browserCaching);
