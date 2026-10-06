import { defineMiddleware } from "astro:middleware";
import { parseDayParam } from "@/server/dates";

const DAY_ROUTE = /^\/day\/([^/]+)\/?$/;

/**
 * - /day/heute (Altlast der Next-Version) → 301 auf /
 * - /day/<ungültig oder außerhalb des Fensters> → 404, bevor gerendert wird
 */
export const onRequest = defineMiddleware((context, next) => {
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
