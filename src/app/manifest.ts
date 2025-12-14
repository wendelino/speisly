import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Speisly",
    short_name: "Speisly",
    description:
      "Speisly - Mensa-Speiseplan der Martin-Luther-Universität Halle-Wittenberg",
    start_url: "/",
    display: "standalone",
    background_color: "#901C4B",
    theme_color: "#000000",
    icons: [
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-256x256.png",
        sizes: "256x256",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
