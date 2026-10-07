import { describe, expect, test } from "bun:test";
import { planSync } from "./plan";
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
});
