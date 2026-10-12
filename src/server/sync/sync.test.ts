/**
 * Integrationstest für den Sync mit gestubbter meine-mensa.de API.
 * Läuft gegen die Seed-DB in einem Datumsbereich ohne Seed-Daten und räumt
 * danach auf. Die Planung selbst ist in plan.test.ts getestet.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray, sql } from "drizzle-orm";
import { addDays, todayBerlin } from "@/lib/dates";
import { meal, mealUpdate } from "@/lib/db/schema/schema";
import { db } from "../db";
import { handleSync } from "./index";
import type { MeineMensaFoodPlanItem, MeineMensaResponse } from "./types";

const hasDb = Boolean(process.env.DATABASE_URL);

const DAY_1 = addDays(todayBerlin(), 60);
const DAY_2 = addDays(DAY_1, 1);
const SRC_IDS = [990_001, 990_002, 990_003, 990_004];

const LOCATIONS = [
  { id: 1, name: "Harzmensa" },
  { id: 2, name: "Weinbergmensa" },
  // wird vom Sync ausgeschlossen
  { id: 7, name: "Ausgeschlossene Mensa" },
];

function food(
  id: number,
  price: number,
  name = `Sync-Test ${id}`
): MeineMensaFoodPlanItem["food"] {
  return {
    id,
    name,
    name_2: "mit Testbeilage",
    ingredients: ["51", "A"],
    price_1: price,
    price_2: price + 1.5,
    price_3: price + 3,
    extra_1: "",
    extra_2: "",
    extra_3: "",
    extra_4: "",
    image_url: null,
  };
}

function item(
  planId: number,
  date: string,
  locationId: number,
  f: MeineMensaFoodPlanItem["food"]
): MeineMensaFoodPlanItem {
  return {
    id: planId,
    date,
    counter_id: 1,
    location_id: locationId,
    is_sprint: false,
    food: f,
  };
}

function stubApi(
  data: MeineMensaFoodPlanItem[],
  locations: { id: number; name: string }[] = LOCATIONS
) {
  const response: MeineMensaResponse = {
    data,
    meta: { ingredients: { A: "Gluten" }, markers: { "51": "vegetarisch" } },
  };
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/food_plans")) {
      return Promise.resolve(Response.json(response));
    }
    if (url.includes("/locations")) {
      return Promise.resolve(Response.json(structuredClone(locations)));
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  }) as typeof fetch;
}

async function servingsInRange() {
  const result = await db.execute(sql`
    select m.src_id, me.slug, to_char(mm.date, 'YYYY-MM-DD') as day,
           mm.ingredients, m.price_stud
      from mensa_meal mm
      join meal m on m.id = mm.meal_id
      join mensa me on me.id = mm.mensa_id
     where mm.date between ${`${DAY_1} 00:00:00`}::timestamp and ${`${DAY_2} 00:00:00`}::timestamp
     order by m.src_id, me.slug, mm.date`);
  return result.rows as {
    src_id: string;
    slug: string;
    day: string;
    ingredients: string[];
    price_stud: number;
  }[];
}

async function cleanup() {
  const ids = (
    await db
      .select({ id: meal.id })
      .from(meal)
      .where(inArray(meal.srcId, SRC_IDS.map(String)))
  ).map((m) => m.id);
  if (ids.length > 0) {
    await db.delete(mealUpdate).where(inArray(mealUpdate.mealId, ids));
    // mensa_meal hängt per ON DELETE CASCADE an meal
    await db.delete(meal).where(inArray(meal.id, ids));
  }
}

describe.skipIf(!hasDb)("handleSync (integration, stubbed API)", () => {
  const realFetch = globalThis.fetch;

  beforeAll(cleanup);
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await cleanup();
  });

  test("creates meals and servings, skips excluded locations", async () => {
    stubApi([
      item(1, DAY_1, 1, food(SRC_IDS[0], 3.2)),
      item(2, DAY_1, 2, food(SRC_IDS[0], 3.2)),
      item(3, DAY_2, 1, food(SRC_IDS[1], 2.5)),
      item(4, DAY_1, 7, food(SRC_IDS[2], 4)),
    ]);
    const result = await handleSync({ from: DAY_1, to: DAY_2 });
    expect(result.changedDates).toEqual([DAY_1, DAY_2]);
    expect(result.changedMealIds).toHaveLength(2);

    const rows = await servingsInRange();
    expect(rows.map((r) => [r.src_id, r.slug, r.day])).toEqual([
      [String(SRC_IDS[0]), "harzmensa", DAY_1],
      [String(SRC_IDS[0]), "weinbergmensa", DAY_1],
      [String(SRC_IDS[1]), "harzmensa", DAY_2],
    ]);
    expect(rows[0].ingredients).toEqual(["51:vegetarisch", "A:Gluten"]);
    expect(rows[0].price_stud).toBe(320);
  });

  test("is idempotent", async () => {
    const before = await servingsInRange();
    const result = await handleSync({ from: DAY_1, to: DAY_2 });
    expect(await servingsInRange()).toEqual(before);
    expect(result).toEqual({ changedDates: [], changedMealIds: [] });
  });

  test("updates prices and removes servings missing from the API", async () => {
    stubApi([
      item(1, DAY_1, 1, food(SRC_IDS[0], 3.5)),
      item(3, DAY_2, 1, food(SRC_IDS[1], 2.5)),
    ]);
    const result = await handleSync({ from: DAY_1, to: DAY_2 });
    // Preis von Gericht 1 geändert + Ausgabe in der Weinbergmensa entfernt –
    // beides nur DAY_1; Gericht 2 (DAY_2) ist unverändert
    expect(result.changedDates).toEqual([DAY_1]);
    expect(result.changedMealIds).toHaveLength(1);

    const rows = await servingsInRange();
    expect(rows.map((r) => [r.src_id, r.slug, r.day, r.price_stud])).toEqual([
      [String(SRC_IDS[0]), "harzmensa", DAY_1, 350],
      [String(SRC_IDS[1]), "harzmensa", DAY_2, 250],
    ]);

    const updates = await db.execute(sql`
      select u.key, u.new from meal_update u join meal m on m.id = u.meal_id
       where m.src_id = ${String(SRC_IDS[0])} order by u.key`);
    expect(updates.rows).toEqual([
      { key: "price", new: "350 / 500 / 650" },
      { key: "remove", new: "Entfernt" },
    ]);
  });

  test("all or nothing: a failing write leaves the DB untouched", async () => {
    const before = await servingsInRange();
    // Mensa-Name über 255 Zeichen: Der Insert der Mensa schlägt fehl, die
    // Preisänderung davor darf dann ebenfalls nicht übernommen werden
    stubApi(
      [
        item(1, DAY_1, 1, food(SRC_IDS[0], 9.9)),
        item(3, DAY_2, 1, food(SRC_IDS[1], 2.5)),
        item(5, DAY_2, 40, food(SRC_IDS[1], 2.5)),
      ],
      [...LOCATIONS, { id: 40, name: "x".repeat(300) }]
    );
    const error = await handleSync({ from: DAY_1, to: DAY_2 }).then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(Error);
    expect(await servingsInRange()).toEqual(before);
  });

  test("a broken new meal is skipped, the rest is synced", async () => {
    stubApi([
      item(1, DAY_1, 1, food(SRC_IDS[0], 3.6)),
      item(3, DAY_2, 1, food(SRC_IDS[1], 2.5)),
      // Name zu lang für varchar(255)
      item(6, DAY_2, 2, food(SRC_IDS[3], 4, "y".repeat(300))),
    ]);
    const result = await handleSync({ from: DAY_1, to: DAY_2 });
    expect(result.changedDates).toEqual([DAY_1]);
    const rows = await servingsInRange();
    expect(rows.map((r) => [r.src_id, r.day, r.price_stud])).toEqual([
      [String(SRC_IDS[0]), DAY_1, 360],
      [String(SRC_IDS[1]), DAY_2, 250],
    ]);
  });

  test("a meal update that clashes keeps the meal and its servings", async () => {
    // Gericht 2 soll Name/Untertitel/Bild von Gericht 1 bekommen → meal_unique
    const img = "https://meine-mensa.de/mediathek/same.jpg";
    stubApi([
      item(1, DAY_1, 1, { ...food(SRC_IDS[0], 3.6), image_url: img }),
      item(3, DAY_2, 1, food(SRC_IDS[1], 2.5)),
    ]);
    await handleSync({ from: DAY_1, to: DAY_2 });
    stubApi([
      item(1, DAY_1, 1, { ...food(SRC_IDS[0], 3.7), image_url: img }),
      item(3, DAY_2, 1, {
        ...food(SRC_IDS[1], 2.5, `Sync-Test ${SRC_IDS[0]}`),
        image_url: img,
      }),
    ]);
    const result = await handleSync({ from: DAY_1, to: DAY_2 });
    // nur Gericht 1 (Preis) gilt als geändert
    expect(result.changedDates).toEqual([DAY_1]);
    const rows = await servingsInRange();
    expect(rows.map((r) => [r.src_id, r.day, r.price_stud])).toEqual([
      [String(SRC_IDS[0]), DAY_1, 370],
      [String(SRC_IDS[1]), DAY_2, 250],
    ]);
  });

  test("guard: empty or partial API answers delete nothing", async () => {
    const before = await servingsInRange();
    expect(before.length).toBeGreaterThan(0);

    // Störung: API liefert gar nichts
    stubApi([]);
    const empty = await handleSync({ from: DAY_1, to: DAY_2 });
    expect(empty).toEqual({ changedDates: [], changedMealIds: [] });
    expect(await servingsInRange()).toEqual(before);

    // lückenhaft: nur DAY_2, DAY_1 bleibt unangetastet
    stubApi([item(3, DAY_2, 1, food(SRC_IDS[1], 2.5))]);
    await handleSync({ from: DAY_1, to: DAY_2 });
    expect(await servingsInRange()).toEqual(before);
  });

  test("guard: a rated serving survives its removal from the API", async () => {
    const [target] = (
      await db.execute(sql`
        select mm.id, mm.meal_id from mensa_meal mm join meal m on m.id = mm.meal_id
         where m.src_id = ${String(SRC_IDS[0])} limit 1`)
    ).rows as { id: string; meal_id: string }[];
    const userId = "sync-test-user";
    await db.execute(sql`
      insert into "user" (id, ip_hash) values (${userId}, 'sync-test') on conflict do nothing`);
    await db.execute(sql`
      insert into meal_rating (id, meal_id, mensa_meal_id, user_id, value)
      values ('sync-test-rating', ${target.meal_id}, ${target.id}, ${userId}, 5)`);
    try {
      // DAY_1 ist bekannt (anderes Gericht), Gericht 1 fehlt aber
      stubApi([
        item(7, DAY_1, 2, food(SRC_IDS[1], 2.5)),
        item(3, DAY_2, 1, food(SRC_IDS[1], 2.5)),
      ]);
      await handleSync({ from: DAY_1, to: DAY_2 });
      const rows = await servingsInRange();
      expect(rows.some((r) => r.src_id === String(SRC_IDS[0]))).toBe(true);
    } finally {
      await db.execute(
        sql`delete from meal_rating where id = 'sync-test-rating'`
      );
      await db.execute(sql`delete from "user" where id = ${userId}`);
    }
  });
});
