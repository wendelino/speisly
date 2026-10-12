/**
 * End-to-End-Smoke-Test gegen einen laufenden Server (Produktions-Build über
 * `bun run start`). Prüft alle Seiten und die interaktiven Abläufe im
 * Browser: Filter, Tageswahl, Kalender, Detailseite mit Server Island,
 * Bewerten (inkl. Cookie-Consent und Löschen), Feedback-Formular, Fehlerseiten,
 * Komprimierung und Sync-Endpoint.
 *
 *   API_BEARER_TOKEN=… bun scripts/e2e/smoke.ts [--base http://127.0.0.1:4321]
 *
 * Schreibt eine Bewertung und ein Feedback in die DB (die Bewertung wird am
 * Ende wieder gelöscht). Nicht gegen Produktion laufen lassen.
 */
import { parseArgs } from "node:util";
import { type Browser, chromium, type Page } from "playwright-core";

const { values: args } = parseArgs({
  options: {
    base: { type: "string", default: "http://127.0.0.1:4321" },
    chromium: {
      type: "string",
      default: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
    },
  },
});
const BASE = args.base.replace(/\/$/, "");
const DAY_URL = /\/day\/\d{4}-\d{2}-\d{2}$/;
const MEAL_URL = /\/meal\//;
const SERVING_STATS_TEXT = /Angebot(e)?$|Noch keine Angebotsdaten/;
const CONTACT_SENT_TEXT = /Nachricht erhalten/;
const MEAL_HREF = /href="(\/meal\/[^"]+)"/;
const SYMBOL_ID = /<symbol id="([^"]+)"/g;
const USE_HREF = /<use href="#([^"]+)"/g;
const TOKEN = process.env.API_BEARER_TOKEN ?? "";

const results: { name: string; ok: boolean; detail?: string }[] = [];
async function check(name: string, fn: () => Promise<unknown>) {
  try {
    const value = await fn();
    const detail = typeof value === "string" ? value : undefined;
    results.push({ name, ok: true, detail });
    console.log(`  ✓ ${name}${detail ? ` – ${detail}` : ""}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`  ✗ ${name} – ${detail}`);
  }
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ---------------------------------------------------------------- HTTP
console.log("HTTP");
const get = (path: string, init?: RequestInit) =>
  fetch(BASE + path, { redirect: "manual", ...init });

await check("Seiten liefern 200", async () => {
  const paths = ["/", "/datenschutz", "/kontakt", "/feedback", "/api/health"];
  for (const p of paths) {
    const res = await get(p);
    assert(res.status === 200, `${p}: ${res.status}`);
  }
  return paths.join(", ");
});
await check("/day/heute → 301 auf /", async () => {
  const res = await get("/day/heute");
  assert(res.status === 301, `Status ${res.status}`);
  assert(
    res.headers.get("location") === "/",
    `Location ${res.headers.get("location")}`
  );
});
await check("ungültige Tage und unbekannte Seiten → 404", async () => {
  for (const p of [
    "/day/kaputt",
    "/day/1999-01-01",
    "/gibtsnicht",
    "/meal/gibtsnicht",
  ]) {
    const res = await get(p);
    assert(res.status === 404, `${p}: ${res.status}`);
  }
});
await check("Sprite-Icons: jede Referenz hat ein Symbol", async () => {
  const meal = await fetch(`${BASE}/`).then((r) => r.text());
  const firstMeal = MEAL_HREF.exec(meal)?.[1];
  const paths = [
    "/",
    ...(firstMeal ? [firstMeal, firstMeal.split("?")[0]] : []),
  ];
  let refs = 0;
  for (const p of paths) {
    const html = await (await get(p)).text();
    const symbols = new Set([...html.matchAll(SYMBOL_ID)].map((m) => m[1]));
    for (const [, id] of html.matchAll(USE_HREF)) {
      refs += 1;
      assert(symbols.has(id), `${p}: #${id} fehlt im Sprite`);
    }
  }
  return `${refs} Referenzen auf ${paths.length} Seiten`;
});
await check("Manifest", async () => {
  const res = await get("/manifest.webmanifest");
  const json = (await res.json()) as { name?: string };
  assert(json.name, "kein name");
  return json.name;
});
await check("Komprimierung (br/gzip) + Route Cache", async () => {
  await get("/");
  const br = await get("/", { headers: { "accept-encoding": "br" } });
  assert(br.headers.get("content-encoding") === "br", "kein br");
  assert(
    br.headers.get("x-astro-cache") === "HIT",
    `Cache ${br.headers.get("x-astro-cache")}`
  );
  const gz = await get("/", { headers: { "accept-encoding": "gzip" } });
  assert(gz.headers.get("content-encoding") === "gzip", "kein gzip");
  return `br ${br.headers.get("content-length")} B`;
});
await check("/_image rechnet keine fremden Bilder", async () => {
  const res = await get(
    `/_image?href=${encodeURIComponent("https://meine-mensa.de/mediathek/x.jpg")}&w=400&f=webp`
  );
  assert(res.status >= 400, `Status ${res.status}`);
  return String(res.status);
});
await check("/api/sync: Auth und Scopes", async () => {
  const post = (scope: string, token?: string) =>
    get(`/api/sync?scope=${scope}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
  assert((await post("warm")).status === 401, "ohne Token nicht 401");
  if (!TOKEN) {
    return "API_BEARER_TOKEN nicht gesetzt, nur 401 geprüft";
  }
  assert(
    (await post("alles", TOKEN)).status === 400,
    "unbekannter Scope nicht 400"
  );
  const warm = await post("warm", TOKEN);
  assert(warm.status === 200, `warm: ${warm.status}`);
  const midnight = await post("midnight", TOKEN);
  const body = (await midnight.json()) as { invalidatedTags: string[] };
  assert(
    body.invalidatedTags.includes("home"),
    "midnight invalidiert home nicht"
  );
  return "401/400/200";
});

// ---------------------------------------------------------------- Browser
const browser: Browser = await chromium.launch({
  executablePath: args.chromium,
});
const consoleErrors: string[] = [];
const external = new Set<string>();

async function newPage(viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, locale: "de-DE" });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("404")) {
      consoleErrors.push(`${page.url()}: ${m.text().slice(0, 200)}`);
    }
  });
  page.on("pageerror", (e) =>
    consoleErrors.push(`${page.url()}: ${e.message}`)
  );
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE)) {
      return route.continue();
    }
    external.add(new URL(url).host);
    return route.fulfill({ status: 204, body: "" });
  });
  return page;
}
const visibleCards = (target: Page) =>
  target.$$eval("a[data-meal]", (els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => ({
        vegan: e.hasAttribute("data-vegan"),
        veggie: e.hasAttribute("data-veggie"),
      }))
  );

console.log("Browser (mobil)");
const page = await newPage();

await check("Startseite rendert Speiseplan", async () => {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const groups = await page.locator("[data-mensa-group]").count();
  const cards = (await visibleCards(page)).length;
  assert(groups > 0 && cards > 0, `${groups} Mensen, ${cards} Karten`);
  return `${groups} Mensen, ${cards} sichtbare Karten`;
});

await check(
  "Filter: nur vegan, bleibt nach Reload, Chip entfernt ihn",
  async () => {
    await page.click("[data-filter-fab]");
    await page.getByRole("dialog", { name: "Filter" }).waitFor();
    await page.click("#vegan-filter");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    let cards = await visibleCards(page);
    assert(
      cards.length > 0 && cards.every((c) => c.vegan),
      "nicht nur vegane Karten"
    );
    await page.reload({ waitUntil: "networkidle" });
    const attr = await page.evaluate(() =>
      document.documentElement.hasAttribute("data-filter-vegan")
    );
    cards = await visibleCards(page);
    assert(attr && cards.every((c) => c.vegan), "Filter nach Reload weg");
    await page.click('[data-chip="vegan"]');
    cards = await visibleCards(page);
    assert(
      cards.some((c) => !c.vegan),
      "Chip hat Filter nicht entfernt"
    );
    return `${cards.length} Karten nach dem Zurücksetzen`;
  }
);

// Wie in der Next-Version: keine Auswahl = alle Mensen, ein Schalter wählt
// genau diese Mensa aus
await check("Filter: eine Mensa auswählen zeigt nur diese", async () => {
  const before = await page.locator("[data-mensa-group]:visible").count();
  await page.click("[data-filter-fab]");
  const dialog = page.getByRole("dialog", { name: "Filter" });
  await dialog.waitFor();
  await dialog.locator('button[role="switch"][id^="mensa-"]').first().click();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  const after = await page.locator("[data-mensa-group]:visible").count();
  assert(after === 1 && before > 1, `${before} → ${after}`);
  await page.click("[data-filter-fab]");
  await dialog.getByRole("button", { name: "Alle abwählen" }).click();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  const reset = await page.locator("[data-mensa-group]:visible").count();
  assert(reset === before, `nach „Alle abwählen“ ${reset}`);
  return `${before} → ${after} → ${reset}`;
});

await check("Tageswahl: Morgen", async () => {
  await page.locator("[data-day]").nth(1).click();
  await page.waitForURL(DAY_URL);
  await page.waitForLoadState("networkidle");
  return new URL(page.url()).pathname;
});

await check("Kalender öffnet und navigiert", async () => {
  const before = page.url();
  await page.click("[data-calendar-trigger]");
  const grid = page.locator("[role=grid]");
  await grid.waitFor();
  const days = grid.locator("button:not([disabled])");
  await days.nth((await days.count()) - 1).click();
  await page.waitForURL((url) => url.href !== before);
  await page.waitForLoadState("networkidle");
  // nur Tage im gültigen Fenster sind wählbar, also kein 404
  assert(await page.locator("#day-selector").count(), "keine Speiseplanseite");
  return new URL(page.url()).pathname;
});

let mealUrl = "";
await check("Detailseite mit Server Island (Angebotshistorie)", async () => {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const island = page.waitForResponse((r) =>
    r.url().includes("/_server-islands/")
  );
  await page.locator("a[data-meal]").first().click();
  await page.waitForURL(MEAL_URL);
  const res = await island;
  assert(res.status() === 200, `Island ${res.status()}`);
  // Angebotshistorie steht im zweiten Tab
  await page.getByRole("tab", { name: "Angebotshistorie" }).click();
  await page.getByText(SERVING_STATS_TEXT).first().waitFor();
  await page.getByRole("tab", { name: "Bewertungen" }).click();
  mealUrl = page.url();
  return new URL(mealUrl).pathname;
});

await check(
  "Bewerten: Consent, speichern, Übersicht aktualisiert, löschen",
  async () => {
    const summary = async () =>
      (await page.locator("[data-rating-summary]").innerText()).replace(
        /\s+/g,
        " "
      );
    const button = page.locator("[data-rate-button]");
    const dialog = page.getByRole("dialog");
    const state = () => button.getAttribute("data-rate-button");

    const deleteRating = async () => {
      await button.click();
      await dialog.waitFor();
      await dialog.locator("button.bg-destructive").first().click();
      // Sicherheitsabfrage (AlertProvider)
      await page.getByRole("button", { name: "OK" }).click();
      await page.locator('[data-rate-button="new"]').waitFor();
      await page.waitForTimeout(500); // Übersicht wird nachgeladen
    };

    // Consent erteilen (erscheint im Dialog beim ersten Öffnen)
    await button.click();
    await dialog.waitFor();
    const accept = page.getByRole("button", { name: "Akzeptieren" });
    if (await accept.isVisible().catch(() => false)) {
      await accept.click();
      // Consent-Drawer erst ausblenden lassen (Animation)
      await page
        .getByRole("dialog", { name: "Kekse gefällig?" })
        .waitFor({ state: "detached" });
    }
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    // Nutzer werden auch per IP-Hash erkannt: Reste früherer Läufe entfernen
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(
      () =>
        document
          .querySelector("[data-rate-button]")
          ?.getAttribute("data-rate-button") !== "loading"
    );
    if ((await state()) === "existing") {
      await deleteRating();
    }
    const before = await summary();

    await button.click();
    await dialog.waitFor();
    // 4. Stern der Gesamtbewertung
    await dialog
      .locator("button[type=button]")
      .filter({ has: page.locator("svg") })
      .nth(3)
      .click();
    await page.getByRole("button", { name: "Bewertung speichern" }).click();
    await page.locator('[data-rate-button="existing"]').waitFor();
    await page.waitForFunction(
      (prev) =>
        (
          document.querySelector("[data-rating-summary]") as HTMLElement | null
        )?.innerText.replace(/\s+/g, " ") !== prev,
      before
    );
    const after = await summary();

    // nach Reload (Route Cache!) ist die Bewertung weiter sichtbar
    await page.reload({ waitUntil: "networkidle" });
    const reloaded = await summary();
    assert(
      reloaded === after,
      `nach Reload: "${reloaded}" statt "${after}" (vorher "${before}")`
    );
    await page.locator('[data-rate-button="existing"]').waitFor();

    await deleteRating();
    await page.reload({ waitUntil: "networkidle" });
    assert((await summary()) === before, `nach Löschen: ${await summary()}`);
    return `${before.slice(0, 45)} → ${after.slice(0, 45)} → zurück`;
  }
);

await check("Feedback-Formular", async () => {
  await page.goto(`${BASE}/feedback`, { waitUntil: "networkidle" });
  await page
    .locator("textarea")
    .fill("Smoke-Test: alles gut, bitte ignorieren.");
  await page.locator('button[type="submit"]').click();
  await page.getByText("Danke für dein Feedback!").first().waitFor();
});

await check("Kontaktformular (mit DSGVO-Einwilligung)", async () => {
  await page.goto(`${BASE}/kontakt`, { waitUntil: "networkidle" });
  await page
    .locator('input[type="email"], input[name="email"]')
    .first()
    .fill("smoke@example.org");
  await page.locator("textarea").fill("Smoke-Test: bitte ignorieren.");
  await page.locator('input[type="checkbox"]').check();
  await page.locator('button[type="submit"]').click();
  await page.getByText(CONTACT_SENT_TEXT).first().waitFor();
});

await check("Kontakt, Datenschutz und 404 im Browser", async () => {
  for (const p of ["/kontakt", "/datenschutz"]) {
    await page.goto(BASE + p, { waitUntil: "networkidle" });
    assert(await page.locator("h1").count(), `${p}: kein h1`);
  }
  const res = await page.goto(`${BASE}/gibtsnicht`, {
    waitUntil: "networkidle",
  });
  assert(res?.status() === 404, `404-Seite: ${res?.status()}`);
  assert(await page.locator("a[href='/']").count(), "kein Link zurück");
});

console.log("Browser (Desktop)");
const desktop = await newPage({ width: 1280, height: 900 });
await check("Startseite Desktop", async () => {
  await desktop.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const cards = (await visibleCards(desktop)).length;
  assert(cards > 0, "keine Karten");
  return `${cards} Karten`;
});

await check("keine Konsolenfehler", () => {
  assert(consoleErrors.length === 0, consoleErrors.join(" | "));
  return Promise.resolve(
    `externe Hosts: ${[...external].join(", ") || "keine"}`
  );
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} Checks bestanden`
);
process.exit(failed.length ? 1 : 0);
