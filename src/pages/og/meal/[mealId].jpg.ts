import type { APIRoute } from "astro";
import { mealPolicy } from "@/server/cache-policy";
import { logError } from "@/server/log";
import { renderMealOgImage } from "@/server/og/meal-og-image";
import { findMeal } from "@/server/queries/meal";
import { getMealRatingStats } from "@/server/queries/ratings";

/**
 * OpenGraph-Bild der Detailseite (src/server/og). Liegt im Route Cache mit
 * denselben Tags wie die Seite, wird also bei neuer Bewertung bzw. nach dem
 * Sync neu gerendert. `?v=` (von der Seite gesetzt) dient nur dem
 * Cache-Busting bei den Plattformen und wird hier ignoriert.
 */
export const prerender = false;

export const GET: APIRoute = async ({ params, cache }) => {
  const mealId = params.mealId ?? "";
  const [meal, stats] = await Promise.all([
    findMeal(mealId),
    getMealRatingStats(mealId),
  ]);
  if (!meal) {
    return new Response(null, { status: 404 });
  }

  let jpeg: Buffer;
  try {
    jpeg = await renderMealOgImage({
      name: meal.name,
      imgPath: meal.imgPath,
      priceStud: meal.priceStud,
      avgRating: stats.avgRating.value,
      ratingCount: stats.ratingCount,
    });
  } catch (error) {
    logError({
      message: "OG image render failed",
      ctx: { mealId, error },
      source: "og",
    });
    return new Response(null, { status: 500 });
  }

  cache.set(mealPolicy(meal.id));
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(jpeg.byteLength),
      // Crawler/Browser: kurz; frisch hält es der Route Cache + `?v=`
      "Cache-Control": "public, max-age=3600",
    },
  });
};
