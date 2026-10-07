import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { APIRoute } from "astro";
import { images } from "@/server/images";
import { IMAGE_CONTENT_TYPES, IMAGE_FILE_PATTERN } from "@/server/images/store";

/**
 * Liefert die beim Sync erzeugten Bildvarianten aus (src/server/images).
 * Dateinamen enthalten einen Hash der Original-URL, ändern sich also nie:
 * Browser cachen sie ein Jahr. In Produktion kann der Reverse Proxy das
 * Verzeichnis auch direkt ausliefern.
 */
export const prerender = false;

const NOT_FOUND = () => new Response(null, { status: 404 });

export const GET: APIRoute = async ({ params }) => {
  const file = params.file ?? "";
  if (!IMAGE_FILE_PATTERN.test(file)) {
    return NOT_FOUND();
  }
  let body: Buffer;
  try {
    body = await readFile(join(images.dir, file));
  } catch {
    return NOT_FOUND();
  }
  const format = file.slice(file.lastIndexOf(".") + 1) as "avif" | "webp";
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": IMAGE_CONTENT_TYPES[format],
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
