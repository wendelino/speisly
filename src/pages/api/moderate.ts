import type { APIRoute } from "astro";
import { moderateByToken } from "@/server/comment-notify";
import { logError } from "@/server/log";

/**
 * Kommentar freigeben/ablehnen aus der Push-Benachrichtigung
 * (src/service-worker/sw.js, „notificationclick“). Statt der Admin-Session
 * gilt ein signiertes Token für genau diesen Kommentartext
 * (src/server/moderation-token.ts).
 *
 *   POST /api/moderate  { "token": "…" }
 */
export const prerender = false;

const STATUS = { invalid: 401, changed: 409, gone: 404 } as const;

export const POST: APIRoute = async ({ request, cache }) => {
  let token: unknown;
  try {
    ({ token } = (await request.json()) as { token?: unknown });
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof token !== "string" || token.length > 2000) {
    return Response.json({ error: "Invalid token" }, { status: 400 });
  }
  try {
    const result = await moderateByToken(cache, token);
    return result.ok
      ? Response.json(result)
      : Response.json(result, { status: STATUS[result.reason] });
  } catch (error) {
    logError({
      message: "Moderation from notification failed",
      ctx: { error },
      source: "ratings",
    });
    return Response.json({ error: "Failed" }, { status: 500 });
  }
};
