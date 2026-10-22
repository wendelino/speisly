import type { APIRoute } from "astro";

// Prerendered zur Build-Zeit (ersetzt src/app/manifest.ts)
export const GET: APIRoute = () =>
  Response.json(
    {
      name: "Speisly",
      short_name: "Speisly",
      description:
        "Speisly - Mensa-Speiseplan der Martin-Luther-Universität Halle-Wittenberg",
      start_url: "/",
      display: "standalone",
      background_color: "#901C4B",
      theme_color: "#000000",
      // Chrome verlangt ein Icon mit `any`, sonst gilt die Seite nicht als
      // installierbar (kein `beforeinstallprompt`, components/install)
      icons: (["any", "maskable"] as const).flatMap((purpose) =>
        [512, 256, 192].map((size) => ({
          src: `/icons/icon-${size}x${size}.png`,
          sizes: `${size}x${size}`,
          type: "image/png",
          purpose,
        }))
      ),
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
