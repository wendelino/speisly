import { defineMiddleware, sequence } from "astro:middleware";
import { parseDayParam } from "@/server/dates";

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

/**
 * Browser-Caching für on-demand gerenderte Antworten. Gecacht wird
 * serverseitig (Route Cache, Treffer kosten ~1 ms); der Browser soll HTML
 * immer neu anfragen, damit z. B. eine neue Bewertung sofort sichtbar ist.
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
  response.headers.set(
    "Cache-Control",
    isApi || context.request.method !== "GET"
      ? "no-store"
      : "public, max-age=0, must-revalidate"
  );
  return response;
});

export const onRequest = sequence(dayRoute, browserCaching);
