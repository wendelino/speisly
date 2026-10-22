/**
 * Schutz gegen Cross-Site-Formulare, ersetzt Astros `security.checkOrigin`.
 *
 * Astro vergleicht den `Origin`-Header mit der Request-URL. Hinter dem Proxy
 * stimmt die nie: server/index.mjs setzt den Host fest auf SITE_HOST, der
 * Adapter kennt nur `http`, der Browser schickt `Origin: https://speisly.de`.
 * Jedes Formular (z. B. im Admin-Bereich) bekam deshalb 403.
 *
 * Hier gilt eine Anfrage als same-origin, wenn der Browser es per
 * `Sec-Fetch-Site` sagt (nicht fälschbar, alle aktuellen Browser) oder der
 * `Origin` zu einer der erlaubten Adressen passt (Request, `site`,
 * `SITE_URL`). Wie bei Astro werden nur Formular-Content-Types und Anfragen
 * ohne Content-Type geprüft; JSON verlangt ohnehin einen CORS-Preflight.
 */

const FORM_CONTENT_TYPES = [
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isForbiddenCrossSite(
  request: Request,
  allowedOrigins: Iterable<string>
): boolean {
  if (SAFE_METHODS.has(request.method)) {
    return false;
  }
  const contentType = request.headers.get("content-type");
  if (
    contentType !== null &&
    !FORM_CONTENT_TYPES.some((type) => contentType.toLowerCase().includes(type))
  ) {
    return false;
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "none") {
    return false;
  }
  const origin = request.headers.get("origin");
  return !(origin && new Set(allowedOrigins).has(origin));
}

/** Origins aus URLs (ungültige oder fehlende werden übersprungen) */
export function originsOf(...urls: (string | URL | undefined)[]): string[] {
  return urls.flatMap((url) => {
    if (!url) {
      return [];
    }
    try {
      return [new URL(url).origin];
    } catch {
      return [];
    }
  });
}
