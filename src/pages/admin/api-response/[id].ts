import type { APIRoute } from "astro";
import { getApiResponse } from "@/server/queries/admin";

export const prerender = false;

/** Admin: Body einer gespeicherten API-Antwort, unverändert als Text */
export const GET: APIRoute = async ({ params }) => {
  const row = await getApiResponse(params.id ?? "");
  if (!row) {
    return new Response(null, { status: 404 });
  }
  return new Response(row.body, {
    headers: {
      // als Text, damit der Browser nichts aus der Antwort ausführt
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
