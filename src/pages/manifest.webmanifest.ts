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
      icons: [512, 256, 192].map((size) => ({
        src: `/icons/icon-${size}x${size}.png`,
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose: "maskable",
      })),
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
