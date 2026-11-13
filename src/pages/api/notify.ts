import { API_BEARER_TOKEN } from "astro:env/server";
import type { APIRoute } from "astro";
import { addDays, isIsoDay, todayBerlin } from "@/lib/dates";
import { formatDay } from "@/lib/format";
import { logError } from "@/server/log";
import { notifyFavorites } from "@/server/push";
import { authorized } from "@/server/sync-endpoint";

/**
 * Push-Benachrichtigungen für Favoriten (src/server/push.ts), abends per Cron
 * (server/cron.mjs, Scope „notify“).
 *
 *   POST /api/notify            für morgen
 *   POST /api/notify?day=YYYY-MM-DD
 *
 * Authorization: Bearer <API_BEARER_TOKEN>
 */
export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
  if (!authorized(request, API_BEARER_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tomorrow = addDays(todayBerlin(), 1);
  const day = url.searchParams.get("day") ?? tomorrow;
  if (!isIsoDay(day)) {
    return Response.json({ error: "Invalid day" }, { status: 400 });
  }
  try {
    const label = day === tomorrow ? "Morgen" : `Am ${formatDay(day, "EEEE")}`;
    return Response.json(await notifyFavorites(day, label));
  } catch (error) {
    logError({
      message: "Favorite notifications failed",
      ctx: { day, error },
      source: "push",
    });
    return Response.json({ error: "Notify failed" }, { status: 500 });
  }
};
