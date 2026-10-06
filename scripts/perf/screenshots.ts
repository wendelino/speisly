/**
 * Screenshots für visuelle Vergleiche zwischen Next- und Astro-Build.
 *
 * Aufruf:
 *   bun scripts/perf/screenshots.ts --base http://localhost:3000 --out <dir> [--paths /,/datenschutz]
 */
import { mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

const { values: args } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:3000" },
    out: { type: "string", default: "screenshots" },
    paths: { type: "string", default: "/,/datenschutz,/kontakt,/feedback" },
    chromium: {
      type: "string",
      default: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
    },
  },
});

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1280, height: 900 },
};

await mkdir(args.out, { recursive: true });
const browser = await chromium.launch({ executablePath: args.chromium });
const origin = new URL(args.base).origin;

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.route("**/*", (route) =>
    route.request().url().startsWith(origin)
      ? route.continue()
      : route.fulfill({ status: 204, body: "" })
  );
  for (const path of args.paths.split(",")) {
    await page.goto(args.base + path, { waitUntil: "networkidle" });
    // wait for web fonts so text metrics are comparable
    await page.evaluate(() => document.fonts.ready);
    const file = `${args.out}/${vpName}${path === "/" ? "-home" : path.replaceAll("/", "-")}.png`;
    await page.screenshot({
      path: file,
      fullPage: true,
      animations: "disabled",
    });
    console.error(`[screenshots] ${file}`);
  }
  await context.close();
}
await browser.close();
