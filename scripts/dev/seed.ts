/**
 * Reproduzierbare Testdaten für lokale Entwicklung und Performance-Messungen.
 *
 * Erzeugt ein Datenvolumen ähnlich der Produktion (≈ 10 Monate Historie,
 * 6 Mensen, ~12 Gerichte pro Mensa und Werktag, 14 Tage Vorschau) mit
 * deterministischem Zufall, damit Messungen vor/nach der Migration
 * vergleichbar sind.
 *
 * Aufruf: DATABASE_URL=postgres://… bun scripts/dev/seed.ts
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { todayBerlin, toUtcDate } from "../../src/lib/dates";
import { dataSource } from "../../src/lib/db/schema/data-source";
import {
  meal,
  mealRating,
  mensa,
  mensaMeal,
  user,
} from "../../src/lib/db/schema/schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString });
const db = drizzle({ client: pool });

// Deterministischer PRNG (mulberry32)
let seed = 42;
// biome-ignore-start lint/suspicious/noBitwiseOperators: mulberry32 needs bit operations
function rand() {
  seed = (seed + 0x6d_2b_79_f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
}
// biome-ignore-end lint/suspicious/noBitwiseOperators: mulberry32 needs bit operations
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const id = (prefix: string, n: number) =>
  `${prefix}_${n.toString(36).padStart(32 - prefix.length - 1, "0")}`;

const HISTORY_DAYS = 300;
const FUTURE_DAYS = 14;
const MEAL_POOL = 1500;
const MEALS_PER_MENSA_PER_DAY = 12;
const SMALL_MEALS_PER_MENSA_PER_DAY = 3;
const RATINGS = 2500;
const USERS = 600;

const MENSEN = [
  "Harzmensa",
  "Weinbergmensa",
  "Mensa Tulpe",
  "Mensa Franckesche Stiftungen",
  "Cafebar Burg",
  "Mensa Neuwerk",
];

const DISHES = [
  "Hähnchenbrust",
  "Gemüsecurry",
  "Spaghetti Bolognese",
  "Falafel",
  "Schweineschnitzel",
  "Linsen-Dal",
  "Seelachsfilet",
  "Kartoffelauflauf",
  "Rindergulasch",
  "Tofu-Bowl",
  "Käsespätzle",
  "Chili sin Carne",
  "Putengeschnetzeltes",
  "Gemüselasagne",
  "Bratwurst",
  "Kichererbsen-Eintopf",
];
const SIDES = [
  "mit Reis",
  "mit Salzkartoffeln",
  "mit Pommes frites",
  "mit Bulgur",
  "mit Kartoffelpüree",
  "mit Nudeln",
  "mit Salatbeilage",
];
const INGREDIENTS = {
  vegan: "52:vegan",
  veggie: "51:vegetarisch",
  pork: "45:Schwein",
  beef: "46:Rind",
  poultry: "47:Geflügel",
  fish: "48:Fisch",
  gluten: "A:Gluten",
  milk: "G:Milch",
  celery: "I:Sellerie",
  mustard: "J:Senf",
};

const VEGAN_DISH = /Tofu|Linsen|Kichererbsen|Chili sin|Falafel/;
const VEGGIE_DISH = /Gemüse|Käse|Kartoffel/;
const PORK_DISH = /Schwein|Bratwurst|Bolognese/;
const BEEF_DISH = /Rind/;
const POULTRY_DISH = /Hähnchen|Puten/;
const FISH_DISH = /Seelachs/;

function ingredientsFor(dish: string): string[] {
  const out: string[] = [];
  if (VEGAN_DISH.test(dish)) {
    out.push(INGREDIENTS.vegan);
  } else if (VEGGIE_DISH.test(dish)) {
    out.push(INGREDIENTS.veggie, INGREDIENTS.milk);
  } else if (PORK_DISH.test(dish)) {
    out.push(INGREDIENTS.pork);
  } else if (BEEF_DISH.test(dish)) {
    out.push(INGREDIENTS.beef);
  } else if (POULTRY_DISH.test(dish)) {
    out.push(INGREDIENTS.poultry);
  } else if (FISH_DISH.test(dish)) {
    out.push(INGREDIENTS.fish);
  }
  for (const extra of [
    INGREDIENTS.gluten,
    INGREDIENTS.celery,
    INGREDIENTS.mustard,
  ]) {
    if (rand() < 0.4) {
      out.push(extra);
    }
  }
  return out;
}

async function insertChunked<T>(
  label: string,
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
  size = 1000
) {
  for (let i = 0; i < rows.length; i += size) {
    await insert(rows.slice(i, i + size));
  }
  console.log(`[seed] ${label}: ${rows.length}`);
}

async function main() {
  await db.execute(
    sql`TRUNCATE meal_rating, meal_update, mensa_meal, meal, mensa, "user", data_source, error_log, feedback CASCADE`
  );

  const dataSourceSlug = "meine-mensa-api";
  await db
    .insert(dataSource)
    .values({ id: id("ds", 1), name: "Meine Mensa API", slug: dataSourceSlug });

  const mensaRows = MENSEN.map((name, i) => ({
    id: id("mensa", i),
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
  }));
  await insertChunked("mensa", mensaRows, (c) => db.insert(mensa).values(c));

  const mealRows = Array.from({ length: MEAL_POOL }, (_, i) => {
    const dish = pick(DISHES);
    const small = i % 10 === 0;
    const base = 180 + Math.floor(rand() * 350);
    return {
      id: id("meal", i),
      srcId: String(10_000 + i),
      dataSourceSlug,
      name: small ? `${dish} 100 g` : `${dish} #${i}`,
      subtitle: small ? "vom Büfett" : pick(SIDES),
      imgPath: null,
      priceStud: base,
      priceWork: base + 150,
      priceGuest: base + 300,
      ingredients: ingredientsFor(dish),
      small,
    };
  });
  await insertChunked("meal", mealRows, (c) =>
    db.insert(meal).values(c.map(({ ingredients: _i, small: _s, ...m }) => m))
  );

  const regularMeals = mealRows.filter((m) => !m.small);
  const smallMeals = mealRows.filter((m) => m.small);
  const today = toUtcDate(todayBerlin());
  const mensaMealRows: (typeof mensaMeal.$inferInsert)[] = [];
  let mmCounter = 0;
  for (let offset = -HISTORY_DAYS; offset <= FUTURE_DAYS; offset += 1) {
    const date = new Date(today.getTime() + offset * 86_400_000);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) {
      continue;
    }
    for (const m of mensaRows) {
      const used = new Set<string>();
      const take = (candidates: typeof mealRows, count: number) => {
        let remaining = count;
        while (remaining > 0) {
          const candidate = pick(candidates);
          if (used.has(candidate.id)) {
            continue;
          }
          used.add(candidate.id);
          mensaMealRows.push({
            id: id("mm", mmCounter),
            mensaId: m.id,
            mealId: candidate.id,
            date,
            ingredients: candidate.ingredients,
            extras: rand() < 0.3 ? ["Tagesangebot"] : [],
          });
          mmCounter += 1;
          remaining -= 1;
        }
      };
      take(regularMeals, MEALS_PER_MENSA_PER_DAY);
      take(smallMeals, SMALL_MEALS_PER_MENSA_PER_DAY);
    }
  }
  await insertChunked("mensa_meal", mensaMealRows, (c) =>
    db.insert(mensaMeal).values(c)
  );

  const userRows = Array.from({ length: USERS }, (_, i) => ({
    id: id("user", i),
    ipHash: id("ip", i),
    cookieHash: id("user", i),
  }));
  await insertChunked("user", userRows, (c) => db.insert(user).values(c));

  const pastServings = mensaMealRows.filter(
    (r) => (r.date as Date).getTime() <= today.getTime()
  );
  const ratingKeys = new Set<string>();
  const ratingRows: (typeof mealRating.$inferInsert)[] = [];
  while (ratingRows.length < RATINGS) {
    const serving = pick(pastServings);
    const u = pick(userRows);
    const key = `${serving.mealId}:${u.id}`;
    if (ratingKeys.has(key)) {
      continue;
    }
    ratingKeys.add(key);
    const stars = () => 1 + Math.floor(rand() * 5);
    ratingRows.push({
      id: id("rating", ratingRows.length),
      mealId: serving.mealId,
      mensaMealId: serving.id,
      userId: u.id,
      value: stars(),
      value_price: rand() < 0.7 ? stars() : null,
      value_quantity: rand() < 0.7 ? stars() : null,
      value_taste: rand() < 0.7 ? stars() : null,
      comment: rand() < 0.2 ? "Testkommentar" : null,
    });
  }
  await insertChunked("meal_rating", ratingRows, (c) =>
    db.insert(mealRating).values(c)
  );

  await db.execute(sql`ANALYZE`);
  await pool.end();
}

await main();
