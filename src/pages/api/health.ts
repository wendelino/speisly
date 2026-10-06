import type { APIRoute } from "astro";

// On-demand gerendert: Healthcheck für Deploy/Monitoring (keine DB-Abfrage)
export const prerender = false;

export const GET: APIRoute = () =>
  Response.json(
    { ok: true, runtime: process.versions.bun ? "bun" : "node" },
    { headers: { "Cache-Control": "no-store" } }
  );
