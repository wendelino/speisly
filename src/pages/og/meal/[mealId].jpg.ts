import type { APIRoute } from "astro";
import { ogPolicy } from "@/server/cache-policy";
import { logError } from "@/server/log";
import {
  mealOgData,
  mealOgImageUrl,
  mealOgVersion,
  renderMealOgImage,
} from "@/server/og/meal-og-image";
import { findMeal } from "@/server/queries/meal";
import { getMealRatingStats } from "@/server/queries/ratings";

/**
 * OpenGraph-Bild der Detailseite (src/server/og). Liegt im Route Cache
 * (ogPolicy) mit den Tags von Gericht und Bewertungen, wird also bei neuer
 * Bewertung bzw. nach dem Sync neu gerendert.
 *
 * `?v=` ist die Version des Bildinhalts (mealOgVersion). Nur die aktuelle
 * Version wird gerendert und gecacht; jede andere (veraltet, fehlend oder
 * ausgedacht) leitet auf die aktuelle URL um. Sonst würde jeder neue
 * `v`-Wert ein teures Rendern und einen eigenen Cache-Eintrag auslösen
 * (Query-Parameter zählen zum Cache-Schlüssel).
 */
export const prerender = false;

export const GET: APIRoute = async ({ params, url, cache }) => {
  const mealId = params.mealId ?? "";
  const [meal, stats] = await Promise.all([
    findMeal(mealId),
    getMealRatingStats(mealId),
  ]);
  if (!meal) {
    return new Response(null, { status: 404 });
  }

  const data = mealOgData(meal, stats);
  if (url.searchParams.get("v") !== mealOgVersion(data)) {
    // nicht cachen (kein cache.set), sonst wieder ein Eintrag je `v`
    return new Response(null, {
      status: 302,
      headers: {
        Location: mealOgImageUrl(meal.id, data),
        "Cache-Control": "no-store",
      },
    });
  }

  let jpeg: Buffer;
  try {
    jpeg = await renderMealOgImage(data);
  } catch (error) {
    logError({
      message: "OG image render failed",
      ctx: { mealId, error },
      source: "og",
    });
    return new Response(null, { status: 500 });
  }

  cache.set(ogPolicy(meal.id));
  // Body als ReadableStream, nicht als Uint8Array/Blob/ArrayBuffer: unter
  // Bun (1.4.2) kommt der Body sonst beim Cache-MISS leer an (der Memory
  // Cache klont die Response, der Client-Zweig liefert dann sofort `done`).
  // Erst der zweite Abruf (HIT) hätte das Bild, Crawler holen meist nur einmal.
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(jpeg));
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(jpeg.byteLength),
      // Die URL ändert sich mit dem Inhalt (`?v=`), Inhalt je URL ist fest
      "Cache-Control": "public, max-age=86400",
    },
  });
};
