import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

/**
 * Vorab berechnete Bildvarianten der Gerichtsbilder (Phase 7).
 *
 * Der Sync lädt jedes neue Bild einmal von meine-mensa.de und legt AVIF und
 * WebP in zwei Breiten ab: `<dir>/<key>-<breite>.<format>`. Die kleine Breite
 * nutzt die Karte (~90–105 CSS-px, auch auf 3×-Displays scharf genug), die
 * große die Detailseite (max. 384 CSS-px). Feste URLs je Ansicht statt
 * `srcset`: Mit `srcset` würde die Karte auf Retina die große Datei wählen,
 * und die Detailseite könnte die Karten-URL nicht sicher aus dem Cache
 * wiederverwenden (meal-image.astro). Der Key ist ein
 * Hash der Original-URL, eine neue URL ergibt also neue Dateinamen (Cache-
 * Busting ohne DB-Feld). Im Request-Pfad rechnet niemand mehr: Seiten fragen
 * nur ab, ob die Dateien existieren, `/img/<datei>` liefert sie aus.
 */

export const IMAGE_WIDTHS = [240, 800] as const;
const [SMALL_WIDTH, LARGE_WIDTH] = IMAGE_WIDTHS;
export const IMAGE_FORMATS = ["avif", "webp"] as const;
export const IMAGE_ROUTE = "/img";

type Format = (typeof IMAGE_FORMATS)[number];

export const IMAGE_CONTENT_TYPES: Record<Format, string> = {
  avif: "image/avif",
  webp: "image/webp",
};

/**
 * Gültige Dateinamen unter `/img/` (alles andere ist 404). `400` stammt aus
 * der Zeit vor den 240er-Varianten: Die Dateien liegen noch auf der Platte
 * und gecachtes HTML verweist evtl. noch darauf. Kann später raus.
 */
export const IMAGE_FILE_PATTERN = /^[0-9a-f]{16}-(240|400|800)\.(avif|webp)$/;

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 20_000;

/** Nur Bilder aus der Mediathek von meine-mensa.de laden */
export function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "meine-mensa.de" &&
      parsed.pathname.startsWith("/mediathek/")
    );
  } catch {
    return false;
  }
}

export function imageKey(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

function fileName(key: string, width: number, format: Format): string {
  return `${key}-${width}.${format}`;
}

function variantFiles(key: string): string[] {
  return IMAGE_WIDTHS.flatMap((w) =>
    IMAGE_FORMATS.map((f) => fileName(key, w, f))
  );
}

export type ImageVariants = {
  /** Karte: URL je Format */
  small: Record<Format, string>;
  /** Detailseite: URL je Format */
  large: Record<Format, string>;
};

export type EnsureResult = "exists" | "created" | "skipped" | "failed";

type StoreOptions = {
  dir: string;
  fetch?: typeof fetch;
  isAllowed?: (url: string) => boolean;
};

export function createImageStore({
  dir,
  fetch: fetchImpl = fetch,
  isAllowed = isAllowedImageUrl,
}: StoreOptions) {
  // Dateien werden zur Laufzeit nie gelöscht: einmal gefunden, immer da
  const known = new Set<string>();

  function hasVariants(key: string): boolean {
    if (known.has(key)) {
      return true;
    }
    const complete = variantFiles(key).every((f) => existsSync(join(dir, f)));
    if (complete) {
      known.add(key);
    }
    return complete;
  }

  /** Varianten für die Seite, `null` = Original-URL verwenden */
  function variants(url: string): ImageVariants | null {
    const key = imageKey(url);
    if (!hasVariants(key)) {
      return null;
    }
    const urls = (width: number) => ({
      avif: `${IMAGE_ROUTE}/${fileName(key, width, "avif")}`,
      webp: `${IMAGE_ROUTE}/${fileName(key, width, "webp")}`,
    });
    return { small: urls(SMALL_WIDTH), large: urls(LARGE_WIDTH) };
  }

  async function download(url: string): Promise<Buffer> {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) {
      throw new Error(`Unexpected content-type ${type}`);
    }
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_DOWNLOAD_BYTES) {
      throw new Error(`Image too large (${length} bytes)`);
    }
    const body = Buffer.from(await res.arrayBuffer());
    if (body.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new Error(`Image too large (${body.byteLength} bytes)`);
    }
    return body;
  }

  function encode(
    input: Buffer,
    width: number,
    format: Format
  ): Promise<Buffer> {
    const pipeline = sharp(input, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width, withoutEnlargement: true });
    // AVIF effort 2 statt Default 4: ~8× schneller (~150 ms statt ~1,2 s pro
    // Bild mit allen Varianten), Dateien kaum größer (gemessen: 27 vs. 28 KB)
    return format === "avif"
      ? pipeline.avif({ quality: 55, effort: 2 }).toBuffer()
      : pipeline.webp({ quality: 78 }).toBuffer();
  }

  /**
   * Erzeugt die Varianten, falls sie fehlen. Wirft nie, Fehler landen im
   * Ergebnis (die Seite zeigt dann weiter das Original).
   */
  async function ensure(
    url: string
  ): Promise<{ result: EnsureResult; error?: unknown }> {
    if (!isAllowed(url)) {
      return { result: "skipped" };
    }
    const key = imageKey(url);
    if (hasVariants(key)) {
      return { result: "exists" };
    }
    const tmpSuffix = `.tmp-${process.pid}-${Date.now()}`;
    const written: string[] = [];
    try {
      const input = await download(url);
      await mkdir(dir, { recursive: true });
      // erst alles als .tmp schreiben, dann umbenennen: Eine Seite sieht nie
      // eine halbe Variante
      for (const width of IMAGE_WIDTHS) {
        for (const format of IMAGE_FORMATS) {
          const target = join(dir, fileName(key, width, format));
          await writeFile(
            target + tmpSuffix,
            await encode(input, width, format)
          );
          written.push(target);
        }
      }
      for (const target of written) {
        await rename(target + tmpSuffix, target);
      }
      known.add(key);
      return { result: "created" };
    } catch (error) {
      await Promise.all(
        written.map((target) => rm(target + tmpSuffix, { force: true }))
      );
      return { result: "failed", error };
    }
  }

  return { dir, variants, ensure, hasVariants };
}

export type ImageStore = ReturnType<typeof createImageStore>;
