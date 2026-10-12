import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { toIsoDay } from "@/lib/dates";
import { meal, mensaMeal } from "@/lib/db/schema/schema";
import { db } from "../db";
import { syncImages } from ".";
import {
  createImageStore,
  IMAGE_FILE_PATTERN,
  imageKey,
  isAllowedImageUrl,
} from "./store";

const URL_A = "https://meine-mensa.de/mediathek/a.jpg";
let dir: string;
let jpeg: Buffer;
let fetchCount = 0;

/** Fake-Download: liefert ein 1200×900-JPEG, `404` für …/missing.jpg */
const fakeFetch = ((url: string) => {
  fetchCount += 1;
  if (String(url).endsWith("missing.jpg")) {
    return Promise.resolve(new Response("nope", { status: 404 }));
  }
  if (String(url).endsWith("html.jpg")) {
    return Promise.resolve(
      new Response("<html>", { headers: { "content-type": "text/html" } })
    );
  }
  return Promise.resolve(
    new Response(new Uint8Array(jpeg), {
      headers: { "content-type": "image/jpeg" },
    })
  );
}) as typeof fetch;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "speisly-img-"));
  jpeg = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#c84" },
  })
    .jpeg()
    .toBuffer();
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("image store", () => {
  test("only meine-mensa.de/mediathek is allowed", () => {
    expect(isAllowedImageUrl(URL_A)).toBe(true);
    expect(isAllowedImageUrl("http://meine-mensa.de/mediathek/a.jpg")).toBe(
      false
    );
    expect(isAllowedImageUrl("https://evil.de/mediathek/a.jpg")).toBe(false);
    expect(isAllowedImageUrl("https://meine-mensa.de/other/a.jpg")).toBe(false);
    expect(isAllowedImageUrl("kein url")).toBe(false);
  });

  test("creates AVIF and WebP in 240 and 800 px, once", async () => {
    const store = createImageStore({ dir, fetch: fakeFetch });
    expect(store.variants(URL_A)).toBeNull();

    fetchCount = 0;
    expect((await store.ensure(URL_A)).result).toBe("created");
    expect((await store.ensure(URL_A)).result).toBe("exists");
    expect(fetchCount).toBe(1);

    const files = (await readdir(dir)).sort();
    const key = imageKey(URL_A);
    expect(files).toEqual([
      `${key}-240.avif`,
      `${key}-240.webp`,
      `${key}-800.avif`,
      `${key}-800.webp`,
    ]);
    for (const f of files) {
      expect(IMAGE_FILE_PATTERN.test(f)).toBe(true);
    }
    // alte 400er-Dateien bleiben erreichbar, fremde Breiten nicht
    expect(IMAGE_FILE_PATTERN.test(`${key}-400.avif`)).toBe(true);
    expect(IMAGE_FILE_PATTERN.test(`${key}-300.avif`)).toBe(false);
    const small = await sharp(join(dir, `${key}-240.webp`)).metadata();
    expect([small.width, small.height, small.format]).toEqual([
      240,
      180,
      "webp",
    ]);
    const avif = await sharp(join(dir, `${key}-800.avif`)).metadata();
    expect(avif.width).toBe(800);

    expect(store.variants(URL_A)).toEqual({
      small: { avif: `/img/${key}-240.avif`, webp: `/img/${key}-240.webp` },
      large: { avif: `/img/${key}-800.avif`, webp: `/img/${key}-800.webp` },
    });
  });

  test("a second store finds existing files on disk", () => {
    const store = createImageStore({ dir, fetch: fakeFetch });
    expect(store.variants(URL_A)).not.toBeNull();
  });

  test("failures leave no files and are reported, foreign URLs skipped", async () => {
    const store = createImageStore({ dir, fetch: fakeFetch });
    const before = (await readdir(dir)).length;
    const missing = "https://meine-mensa.de/mediathek/missing.jpg";
    const html = "https://meine-mensa.de/mediathek/html.jpg";
    expect((await store.ensure(missing)).result).toBe("failed");
    expect((await store.ensure(html)).result).toBe("failed");
    expect((await store.ensure("https://evil.de/x.jpg")).result).toBe(
      "skipped"
    );
    expect(await readdir(dir)).toHaveLength(before);
    expect(store.variants(missing)).toBeNull();
  });
});

describe("syncImages", () => {
  let target: { id: string; imgPath: string | null; date: string };

  beforeAll(async () => {
    const [row] = await db
      .select({ id: meal.id, imgPath: meal.imgPath, date: mensaMeal.date })
      .from(mensaMeal)
      .innerJoin(meal, eq(meal.id, mensaMeal.mealId))
      .limit(1);
    target = { ...row, date: toIsoDay(row.date) };
    await db
      .update(meal)
      .set({ imgPath: "https://meine-mensa.de/mediathek/sync-test.jpg" })
      .where(eq(meal.id, target.id));
  });

  afterAll(async () => {
    await db
      .update(meal)
      .set({ imgPath: target.imgPath })
      .where(eq(meal.id, target.id));
  });

  test("reports days and meals whose images are new", async () => {
    const store = createImageStore({ dir, fetch: fakeFetch });
    const range = { from: target.date, to: target.date };

    const first = await syncImages(range, store);
    expect(first.created).toBe(1);
    expect(first.failed).toBe(0);
    expect(first.changedDates).toEqual([target.date]);
    expect(first.changedMealIds).toContain(target.id);

    const second = await syncImages(range, store);
    expect(second).toEqual({
      changedDates: [],
      changedMealIds: [],
      created: 0,
      failed: 0,
    });
    const key = imageKey("https://meine-mensa.de/mediathek/sync-test.jpg");
    expect(existsSync(join(dir, `${key}-800.avif`))).toBe(true);
  });
});
