import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import sharp from "sharp";
import { formatDecimal, formatEuro } from "@/lib/format";
import { images } from "@/server/images";

/**
 * OpenGraph-Bild eines Gerichts (1200×630 JPEG): Foto im Vollbild mit
 * dunklem Verlauf, darauf Name, Sterne, Ø-Bewertung, Anzahl und Preis.
 * Layout als JSX → Satori (SVG) → resvg (PNG) → sharp (JPEG; als PNG wäre
 * das Foto ~900 KB, zu groß für manche Messenger-Vorschauen). Satori kann nur Flexbox,
 * Inline-Styles, Hex/RGB-Farben (kein oklch) und TTF/OTF/WOFF (kein WOFF2,
 * keine variablen Fonts), daher die statischen Bricolage-Schnitte.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// --primary / --accent-foreground aus globals.css, nach sRGB umgerechnet
const PRIMARY = "#9a2051";
const PRIMARY_DARK = "#75183d";
const STAR = "#f5b301";
const STAR_EMPTY = "rgba(255,255,255,0.35)";
const STAR_PATH =
  "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z";
const FONT_NAME = "Bricolage Grotesque";

export type MealOgData = {
  name: string;
  imgPath: string | null;
  /** Cent */
  priceStud: number;
  avgRating: number | null;
  ratingCount: number;
};

// Fontsource exportiert nur CSS; der Ordner wird über LICENSE gefunden
let fontsPromise: Promise<{ weight: 500 | 800; data: Buffer }[]> | undefined;
function loadFonts() {
  fontsPromise ??= (() => {
    const require = createRequire(import.meta.url);
    const dir = join(
      dirname(require.resolve("@fontsource/bricolage-grotesque/LICENSE")),
      "files"
    );
    const load = async (weight: 500 | 800) => ({
      weight,
      data: await readFile(
        join(dir, `bricolage-grotesque-latin-${weight}-normal.woff`)
      ),
    });
    return Promise.all([load(500), load(800)]);
  })();
  fontsPromise.catch(() => {
    fontsPromise = undefined;
  });
  return fontsPromise;
}

/**
 * Gerichtsfoto als JPEG-Data-URI in Bildgröße. Nur die beim Sync erzeugte
 * große Variante (lokal, WebP – das Satori nicht kann, daher sharp);
 * ohne Variante kein Foto statt eines Downloads im Request.
 */
async function loadPhoto(imgPath: string | null): Promise<string | null> {
  const large = imgPath ? images.variants(imgPath)?.large : undefined;
  if (!large) {
    return null;
  }
  try {
    const input = await readFile(join(images.dir, basename(large)));
    const jpeg = await sharp(input)
      .resize(OG_WIDTH, OG_HEIGHT, { fit: "cover" })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

function Star({ fill, size }: { fill: number; size: number }) {
  const icon = (color: string) => (
    <svg aria-hidden="true" height={size} viewBox="0 0 24 24" width={size}>
      <path d={STAR_PATH} fill={color} />
    </svg>
  );
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: size,
        height: size,
      }}
    >
      {icon(STAR_EMPTY)}
      {fill > 0 && (
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: Math.round(size * fill),
            height: size,
            overflow: "hidden",
          }}
        >
          {icon(STAR)}
        </div>
      )}
    </div>
  );
}

function Stars({ value, size }: { value: number; size: number }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star fill={Math.min(1, Math.max(0, value - i))} key={i} size={size} />
      ))}
    </div>
  );
}

function MealCard({ data, photo }: { data: MealOgData; photo: string | null }) {
  const price = `${formatEuro(data.priceStud)} €`;
  const hasRating = data.avgRating !== null && data.ratingCount > 0;
  const countText =
    data.ratingCount === 1 ? "1 Bewertung" : `${data.ratingCount} Bewertungen`;

  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: OG_WIDTH,
        height: OG_HEIGHT,
        fontFamily: FONT_NAME,
        color: "#fff",
        backgroundImage: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DARK})`,
      }}
    >
      {photo !== null && (
        <img
          alt=""
          height={OG_HEIGHT}
          src={photo}
          style={{ position: "absolute", top: 0, left: 0 }}
          width={OG_WIDTH}
        />
      )}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          width: OG_WIDTH,
          height: OG_HEIGHT,
          backgroundImage: photo
            ? "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.85) 100%)"
            : "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.35) 100%)",
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 40,
          left: 56,
          padding: "8px 24px 12px",
          borderRadius: 999,
          background: PRIMARY,
          fontSize: 36,
          fontWeight: 800,
          letterSpacing: -0.5,
          border: photo ? "none" : "2px solid rgba(255,255,255,0.35)",
        }}
      >
        Speisly
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 56,
          right: 56,
          bottom: 52,
        }}
      >
        <div
          style={{
            display: "block",
            lineClamp: 2,
            margin: "0 0 20px",
            fontSize: 62,
            lineHeight: 1.05,
            fontWeight: 800,
            letterSpacing: -1,
          }}
        >
          {data.name}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            fontSize: 36,
            fontWeight: 500,
          }}
        >
          {hasRating ? (
            <>
              <Stars size={44} value={data.avgRating ?? 0} />
              <span style={{ fontSize: 44, fontWeight: 800 }}>
                {formatDecimal(data.avgRating ?? 0)}
              </span>
              <span
                style={{ opacity: 0.8 }}
              >{`· ${countText} · ${price}`}</span>
            </>
          ) : (
            <span style={{ opacity: 0.85 }}>
              {`Noch keine Bewertungen · ${price}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export async function renderMealOgImage(data: MealOgData): Promise<Buffer> {
  const [fonts, photo] = await Promise.all([
    loadFonts(),
    loadPhoto(data.imgPath),
  ]);
  const svg = await satori(<MealCard data={data} photo={photo} />, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: fonts.map(({ weight, data: font }) => ({
      name: FONT_NAME,
      data: font,
      weight,
      style: "normal" as const,
    })),
  });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } })
    .render()
    .asPng();
  return sharp(png).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
}

/**
 * Versionsparameter fürs og:image: ändert sich mit der Bewertung, damit
 * Plattformen, die die Seite neu abrufen, nicht ein altes Bild aus ihrem
 * Bild-Cache nehmen.
 */
export function mealOgImageUrl(
  mealId: string,
  stats: { ratingCount: number; avgRating: number | null }
): string {
  const v = `${stats.ratingCount}-${stats.avgRating ?? 0}`;
  return `/og/meal/${encodeURIComponent(mealId)}.jpg?v=${v}`;
}
