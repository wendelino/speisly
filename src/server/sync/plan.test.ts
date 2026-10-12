import { describe, expect, test } from "bun:test";
import { MASS_REMOVAL_MIN, planSync } from "./plan";
import type { MealData, MensaMealRecord } from "./types";

const HARZ = { id: "mensa-harz", slug: "harzmensa", name: "Harzmensa" };

function mealData(
  srcId: string,
  overrides: Partial<MealData> = {},
  days: { date: string; slug?: string; name?: string }[] = [
    { date: "2026-11-02" },
  ]
): MealData {
  return {
    src_id: srcId,
    name: `Gericht ${srcId}`,
    subtitle: "",
    imgPath: null,
    priceStud: 2.5,
    priceWork: 4,
    priceGuest: 5.5,
    availability: days.map((d) => ({
      date: d.date,
      src_mensaId: "1",
      mensaSlug: d.slug ?? "harzmensa",
      mensaName: d.name ?? "Harzmensa",
      ingredients: ["A:Gluten"],
      extras: [],
    })),
    ...overrides,
  };
}

const EXISTING = {
  id: "meal-1",
  srcId: "1",
  name: "Gericht 1",
  subtitle: "",
  imgPath: null,
  priceStud: 250,
  priceWork: 400,
  priceGuest: 550,
};

function serving(mealId: string, date: string, id = `s-${date}`) {
  return {
    id,
    mealId,
    mensaId: HARZ.id,
    date: new Date(date),
    ingredients: [],
    extras: [],
  } satisfies MensaMealRecord;
}

const base = {
  dataSourceSlug: "meine-mensa-api",
  mensen: [HARZ],
};

describe("planSync", () => {
  test("nothing to do when API and DB agree", () => {
    const plan = planSync({
      ...base,
      data: [mealData("1")],
      existingMeals: [EXISTING],
      existingServings: [serving("meal-1", "2026-11-02")],
    });
    expect(plan).toMatchObject({
      newMensen: [],
      newMeals: [],
      mealChanges: [],
      newServings: [],
      removedServings: [],
      invalidMeals: [],
    });
  });

  test("new meal, new mensa, new servings (duplicates once)", () => {
    const plan = planSync({
      ...base,
      data: [
        mealData("2", {}, [
          { date: "2026-11-02" },
          { date: "2026-11-02" }, // zweite Theke, gleiche Ausgabe
          { date: "2026-11-03", slug: "neue-mensa", name: "Neue Mensa" },
        ]),
      ],
      existingMeals: [],
      existingServings: [],
    });
    expect(plan.newMeals).toHaveLength(1);
    expect(plan.newMeals[0]).toMatchObject({
      srcId: "2",
      priceStud: 250,
      priceWork: 400,
      priceGuest: 550,
    });
    expect(plan.newMensen).toMatchObject([
      { slug: "neue-mensa", name: "Neue Mensa" },
    ]);
    expect(plan.newServings).toHaveLength(2);
    expect(new Set(plan.newServings.map((s) => s.mealId))).toEqual(
      new Set([plan.newMeals[0].id])
    );
  });

  test("changed meal: fields, logs and the dates it is served", () => {
    const plan = planSync({
      ...base,
      data: [
        mealData("1", { priceStud: 2.8, imgPath: "https://x/y.jpg" }, [
          { date: "2026-11-02" },
          { date: "2026-11-03" },
        ]),
      ],
      existingMeals: [EXISTING],
      existingServings: [],
    });
    expect(plan.mealChanges).toEqual([
      {
        mealId: "meal-1",
        values: { ...EXISTING, priceStud: 280, imgPath: "https://x/y.jpg" },
        fields: {
          imgPath: "https://x/y.jpg",
          priceStud: 280,
          priceWork: 400,
          priceGuest: 550,
        },
        logs: [
          { key: "imgPath", prev: "", new: "https://x/y.jpg" },
          { key: "price", prev: "250 / 400 / 550", new: "280 / 400 / 550" },
        ],
        dates: ["2026-11-02", "2026-11-03"],
      },
    ]);
  });

  test("servings missing from the API are removed", () => {
    const gone = serving("meal-1", "2026-11-03", "gone");
    const plan = planSync({
      ...base,
      data: [mealData("1")],
      existingMeals: [EXISTING],
      existingServings: [serving("meal-1", "2026-11-02"), gone],
      // die API kennt den Tag (andere Gerichte), dieses Gericht fehlt dort
      apiDates: new Set(["2026-11-02", "2026-11-03"]),
    });
    expect(plan.removedServings).toEqual([gone]);
  });

  test("meals with a price of 0 are skipped (and their servings removed)", () => {
    const plan = planSync({
      ...base,
      data: [mealData("1", { priceGuest: 0 })],
      existingMeals: [EXISTING],
      existingServings: [serving("meal-1", "2026-11-02")],
    });
    expect(plan.invalidMeals).toHaveLength(1);
    expect(plan.mealChanges).toEqual([]);
    expect(plan.removedServings).toHaveLength(1);
  });

  test("several API meals with one src_id: data from the first, servings from all", () => {
    const plan = planSync({
      ...base,
      data: [
        mealData("1", { name: "Apfelstrudel" }, [{ date: "2026-11-02" }]),
        mealData("1", { name: "Apfelstrudel mit Soße" }, [
          { date: "2026-11-03" },
        ]),
      ],
      existingMeals: [{ ...EXISTING, name: "Apfelstrudel" }],
      existingServings: [],
    });
    expect(plan.mealChanges).toEqual([]);
    expect(plan.newServings.map((s) => s.date.toISOString())).toEqual([
      "2026-11-02T00:00:00.000Z",
      "2026-11-03T00:00:00.000Z",
    ]);
  });

  test("guard: days without any API entries are not touched", () => {
    const plan = planSync({
      ...base,
      data: [mealData("1")],
      existingMeals: [EXISTING],
      existingServings: [
        serving("meal-1", "2026-11-02"),
        serving("meal-1", "2026-11-03", "other-day"),
      ],
      apiDates: new Set(["2026-11-02"]),
    });
    expect(plan.removedServings).toEqual([]);
    expect(plan.keptServings).toMatchObject([
      { reason: "day-not-in-api", serving: { id: "other-day" } },
    ]);
  });

  test("guard: an empty API answer removes nothing", () => {
    const plan = planSync({
      ...base,
      data: [],
      existingMeals: [EXISTING],
      existingServings: [serving("meal-1", "2026-11-02")],
      apiDates: new Set(),
    });
    expect(plan.removedServings).toEqual([]);
    expect(plan.keptServings).toHaveLength(1);
  });

  test("guard: rated servings are never removed", () => {
    const rated = { ...serving("meal-1", "2026-11-03", "rated"), rated: true };
    const plan = planSync({
      ...base,
      data: [
        mealData("1", {}, [{ date: "2026-11-02" }, { date: "2026-11-03" }]),
      ],
      existingMeals: [EXISTING],
      existingServings: [serving("meal-1", "2026-11-02"), rated],
      apiDates: new Set(["2026-11-02", "2026-11-03"]),
    });
    // gleiche Mensa/Tag → wird gematcht; Testfall: die API liefert den Tag,
    // aber das Gericht nicht mehr
    expect(plan.removedServings).toEqual([]);

    const plan2 = planSync({
      ...base,
      data: [mealData("1")],
      existingMeals: [EXISTING],
      existingServings: [serving("meal-1", "2026-11-02"), rated],
      apiDates: new Set(["2026-11-02", "2026-11-03"]),
    });
    expect(plan2.removedServings).toEqual([]);
    expect(plan2.keptServings).toMatchObject([
      { reason: "rated", serving: { id: "rated" } },
    ]);
  });

  test("guard: emergency brake on mass removal, unless forced", () => {
    const many = Array.from({ length: MASS_REMOVAL_MIN + 5 }, (_, i) =>
      serving("meal-1", "2026-11-02", `s${i}`)
    ).map((s, i) => ({ ...s, mensaId: `m${i}` }));
    const input = {
      ...base,
      data: [mealData("1")],
      existingMeals: [EXISTING],
      existingServings: many,
      apiDates: new Set(["2026-11-02"]),
    };
    const blocked = planSync(input);
    expect(blocked.removedServings).toEqual([]);
    expect(blocked.massRemoval).toEqual({
      wouldRemove: many.length,
      existing: many.length,
    });
    expect(blocked.keptServings.every((k) => k.reason === "mass-removal")).toBe(
      true
    );

    const forced = planSync({ ...input, allowMassRemoval: true });
    expect(forced.removedServings).toHaveLength(many.length);
    expect(forced.massRemoval).toBeNull();
  });
});
