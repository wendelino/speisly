# Migrationsplan: Next.js 16 → Astro 7.3

> Ziel: Deutlich bessere Performance (TTFB, JS-Menge, Serverlast) bei **unveränderter UI**.
> Kernidee: So viel wie möglich wird **einmal gerendert und danach nur noch aus dem Cache bzw. statisch ausgeliefert**. Interaktivität gibt es nur noch dort, wo sie wirklich gebraucht wird (Islands).
> Branch: `astro`

## Status

| Phase | Stand |
|---|---|
| 0. Baseline | ✅ erledigt – [`docs/perf-baseline.md`](perf-baseline.md) |
| 1. Scaffold | ✅ erledigt – siehe „Umsetzungsnotizen Phase 1“ unten |
| 2. Datenschicht | ✅ erledigt – siehe „Umsetzungsnotizen Phase 2“ unten |
| 3. Statische Seiten | ✅ erledigt – siehe „Umsetzungsnotizen Phase 3“ unten |
| 4. Speiseplan | ✅ erledigt – siehe „Umsetzungsnotizen Phase 4“ unten |
| 5. Gericht-Detail | ✅ erledigt – siehe „Umsetzungsnotizen Phase 5“ unten |
| 6. Caching | ✅ erledigt – siehe „Umsetzungsnotizen Phase 6“ unten |
| 7. Bilder | ✅ erledigt – siehe „Umsetzungsnotizen Phase 7“ unten |
| 8. Sync-Optimierung | ✅ erledigt – siehe „Umsetzungsnotizen Phase 8“ unten |
| 9. Betrieb & Cutover | ✅ erledigt – siehe „Umsetzungsnotizen Phase 9“ und „Abschluss“ unten |

Verifizierte Zielversionen (npm, Stand 06.10.2026):

| Paket | Version | Hinweis |
|---|---|---|
| `astro` | 7.3.5 | benötigt Node `>=22.12.0` |
| `@astrojs/node` | 11.1.6 | Adapter, Modus `standalone` |
| `@astrojs/react` | 7.0.0 | für die bestehenden React/shadcn-Komponenten |
| `@tailwindcss/vite` | 4.x | ersetzt `@tailwindcss/postcss` |

---

## 1. Bestandsaufnahme: Was macht die App heute langsam?

Diese Punkte habe ich im Code gefunden. Sie bestimmen, was die Migration lösen muss.

| # | Problem | Fundstelle | Auswirkung |
|---|---|---|---|
| 1 | Die Gericht-Detailseite liest `searchParams` (`?mmid=`). Dadurch wird sie **bei jedem Aufruf dynamisch gerendert**, und `revalidate = 1800` greift nicht. | `src/app/meal/[mealId]/page.tsx` | Jeder Aufruf erzeugt Datenbank-Queries und ein Server-Render. |
| 2 | `findMeal` läuft doppelt (in `generateMetadata` und in der Seite). Es ist nicht mit `cache()` dedupliziert, und `getMealRatingStats` ist gar nicht gecacht. | `src/actions/meal.ts`, `src/actions/rating.ts` | Pro Aufruf ca. 4–5 Queries statt 0. |
| 3 | `MensaFilter` ruft auf **jeder** Seite per `useEffect` die Server Action `getAllMensen()` auf. | `src/components/mensa-filter.tsx` | Pro Seitenaufruf ein ungecachter POST plus eine DB-Query. |
| 4 | `MealRatingDialog` ruft beim Mount `getUserRating()` auf, und zwar für **jeden** Besucher. | `src/app/meal/meal-rating.tsx` | Pro Detailseite ein POST mit JWT-Prüfung und ggf. einem IP-Hash-Lookup in der DB. |
| 5 | Die komplette Gerichtsliste ist eine Client Component. | `src/components/meal/meal-list.tsx` | Alle Gerichte gehen doppelt raus (HTML und RSC-Payload). Dazu kommen React, Radix und die Hydration der ganzen Liste. |
| 6 | `FilterProvider` liest Cookies über `document` in `useState`-Initialisierern. | `src/contexts/filter-context.tsx` | Server und Client rendern Verschiedenes. Das führt zu einem Hydration-Mismatch, einem Re-Render und sichtbarem Flackern. |
| 7 | `/day/[date]` akzeptiert alles, was `new Date()` parsen kann. | `src/lib/utils.ts` (`dateParamValidator`) | Der ISR-Cache wächst unbegrenzt (z. B. `/day/2099-01-01`, `/day/heute`). Dazu kommen Zeitzonenfehler, weil `new Date("YYYY-MM-DD")` als UTC geparst wird. |
| 8 | Der Cache-Key in `getMealsForDate` hängt von der Server-Zeitzone ab (`getFullYear()`/`getDate()`). | `src/actions/meals.ts` | Je nach Zeitzone des Servers falsche oder doppelte Cache-Einträge. |
| 9 | `revalidateTag("meals", "/")`: Das zweite Argument ist in Next 16 ein `cacheLife`-Profil, kein Pfad. | `src/app/api/sync/route.ts` | Die Invalidierung funktioniert vermutlich nicht wie gedacht. |
| 10 | Es fehlt ein Index auf `mensa_meal.meal_id`. Der Unique-Index beginnt mit `mensa_id`. | `src/lib/db/schema/schema.ts` | Angebotsstatistik und `findMeal` scannen eine wachsende Tabelle. |
| 11 | `next/image` optimiert die Remote-Bilder von meine-mensa.de auf demselben Bun-Server mit sharp. | `next.config.ts` | CPU-Spitzen beim ersten Abruf jeder Größe. |
| 12 | Ein Custom Server (`_boot.ts`) nutzt `next({ dev: false })`, und der Cron ruft sich selbst über die **öffentliche** URL auf. | `src/_boot.ts` | Kein Standalone-Output. Jeder Cron-Aufruf geht über Internet/Proxy. |
| 13 | Der Sync arbeitet sequentiell mit Einzel-Queries pro Gericht und Verfügbarkeit (N+1). | `src/dal/index.ts`, `src/dal/db.ts` | Lastspitzen 3× täglich, und der Sync blockiert lange. |

**Fazit:** Das Problem ist weniger Next.js an sich als ein Caching-Konzept, das an vielen Stellen umgangen wird. Dazu kommt zu viel Client-JS. Astro 7 bietet mit **Route Caching** (stabil seit 7.0), **Server Islands** und **Zero-JS-by-default** genau die passenden Werkzeuge. Die Migration ist also auch der Anlass, das Caching sauber neu aufzusetzen.

---

## 2. Zielarchitektur

```
                      ┌─────────────────────────────────────────────┐
 Browser ──► (Caddy/  │ Astro 7.3 · @astrojs/node (standalone)      │
             nginx) ──┤                                              │
                      │  1. Statische Dateien (dist/client)         │ ← prerendered Seiten, _astro/* (immutable)
                      │  2. Route Cache (memoryCache, Tags)         │ ← HIT: kein Render, keine DB
                      │  3. On-Demand-Render (MISS/STALE)           │ ← DB-Query, danach im Cache
                      │  4. Server Islands (/_server-islands/*)     │ ← eigene TTLs, ebenfalls gecacht
                      │  5. Actions (/_actions/*) – nie gecacht     │ ← Bewertungen, Feedback, Consent
                      │  6. /api/sync (Bearer) → invalidate(tags)   │ ← vom Cron (localhost) aufgerufen
                      └─────────────────────────────────────────────┘
```

### 2.1 Render-Strategie pro Route

| Route | Heute (Next) | Neu (Astro) | Cache-Regel | Tags |
|---|---|---|---|---|
| `/datenschutz`, `/kontakt`, `/feedback` | SSG | **prerender** (`dist/client/*.html`) | statisch | – |
| `/404` | force-static | **prerender** | statisch | – |
| `/manifest.webmanifest` | Route | **prerender** (`src/pages/manifest.webmanifest.ts`) | statisch | – |
| `/` (heute) | ISR 30 min + Cron | On-Demand + Route Cache | `maxAge` = **Sekunden bis Mitternacht (Berlin)**, `swr` max. 300 s, aber nie über Mitternacht hinaus | `meals`, `home`, `day:YYYY-MM-DD` |
| `/day/[date]`, **Vergangenheit** | ISR 30 min | On-Demand + Route Cache | `maxAge: 30 Tage` (Vergangenheit ändert sich nicht mehr) | `day:YYYY-MM-DD` |
| `/day/[date]`, **heute bis +14 Tage** | ISR 30 min | On-Demand + Route Cache | `maxAge: 6 h`, `swr: 1 h`, wird beim Sync gezielt invalidiert | `meals`, `day:YYYY-MM-DD` |
| `/day/[date]`, ungültig oder außerhalb des Fensters (< −365 / > +14 Tage) | ISR, unbegrenzt | **404** | `maxAge: 1 h` | – |
| `/day/heute` | Sonderfall im Validator | **301 → `/`** | – | – |
| `/meal/[mealId]` | **immer dynamisch** (Bug #1) | On-Demand + Route Cache; `?mmid` landet **nicht** im Cache-Key | `maxAge: 1 Tag`, `swr: 7 Tage` | `meal:{id}` |
| Island `MealServingStats` | Teil der Seite | **Server Island** (`server:defer`) | `maxAge: 6 h`, `swr: 1 Tag` | `meal-stats:{id}`, `meals` |
| Island `RatingSummary` | Teil der Seite, ungecacht | **Server Island** (`server:defer`) | `maxAge: 10 min`, `swr: 1 h`, wird bei Bewertungen invalidiert | `ratings:{id}` |
| `/_actions/*` | Server Actions | Astro Actions | nie gecacht | – |
| `/api/sync` | GET + Bearer | **POST** + Bearer | nie gecacht | – |
| `/_astro/*` | `_next/static` | hashed Assets | `public, max-age=31536000, immutable` (macht der Node-Adapter automatisch) | – |

### 2.2 Warum nicht einfach alles als SSG mit Rebuild?

Ich habe zwei Varianten verglichen:

- **A) Route Cache mit Tag-Invalidierung (empfohlen).** Seiten werden beim ersten Zugriff gerendert und dann aus dem Speicher ausgeliefert. Für den Server ist das so gut wie statisch: kein Render und keine DB-Query bei einem HIT. Nach jedem Sync werden **nur die geänderten Tage und Gerichte** invalidiert und anschließend vorgewärmt. Bewertungen aktualisieren nur ihr eigenes Island.
- **B) Full-SSG mit Rebuild nach jedem Sync.** Das wäre maximal statisch, aber: 3 Rebuilds pro Tag mit DB-Zugriff zur Build-Zeit, Tausende Gericht-Seiten bei jedem Build, und Deploy und Datenpflege wären gekoppelt. Live-Bewertungen bräuchten trotzdem Islands. Neue Gerichte wären bis zum nächsten Build 404.

Variante A liefert praktisch dieselbe Serverlast wie B (ein Render pro Seite und Datenstand), ohne die Build-Kopplung. **Wirklich statisch prerendered** werden alle Seiten, die nicht von der DB abhängen. Ein Wechsel zu einem CDN-Cache-Provider ist später ohne Code-Änderung möglich, weil die `Astro.cache`-API providerunabhängig ist (siehe Phase 9).

### 2.3 Tag-Schema und Invalidierung

```ts
// src/server/cache-tags.ts
export const TAG = {
  meals: "meals",                                   // alles, was vom Speiseplan abhängt
  home: "home",                                     // die Startseite "/"
  day: (isoDate: string) => `day:${isoDate}`,       // /day/YYYY-MM-DD (+ "/" wenn heute)
  meal: (id: string) => `meal:${id}`,               // /meal/[id] (Shell)
  mealStats: (id: string) => `meal-stats:${id}`,    // Server Island Angebotshistorie
  ratings: (id: string) => `ratings:${id}`,         // Server Island Bewertungsübersicht
} as const;
```

| Ereignis | Invalidierung | Danach |
|---|---|---|
| Sync (3× werktags + nachts) | `handleSync()` gibt `{ changedDates, changedMealIds }` zurück. Daraus wird `day:{d}` für jedes geänderte Datum invalidiert, `meal:{id}` und `meal-stats:{id}` für geänderte Gerichte, und `home`, wenn heute betroffen ist. | Pre-Warm: `/` und `/day/{heute…+7}` lokal abrufen. |
| 00:01 Uhr (Berlin) | `home`. Zusätzlich läuft `maxAge` als Sicherheitsnetz automatisch um Mitternacht ab. | Pre-Warm `/` |
| Bewertung abgegeben oder gelöscht | `ratings:{mealId}` (in der Action über `context.cache.invalidate`) | – (Island lädt beim nächsten Aufruf neu) |
| Deploy oder Neustart | Der Memory-Cache ist leer. | Pre-Warm beim Boot |

---

## 3. Server Islands

Server Islands trennen langsame oder schnell veränderliche Teile von der lange gecachten Seiten-Shell. Die Gericht-Seite kann damit 1 Tag gecacht werden, während Bewertungen nach 10 Minuten bzw. sofort nach einer neuen Bewertung frisch sind.

### 3.1 `MealServingStats` (Angebotshistorie)

```astro
---
// src/pages/meal/[mealId].astro (Auszug)
import MealServingStats from "@/components/server-islands/MealServingStats.astro";
import ServingStatsSkeleton from "@/components/astro/ServingStatsSkeleton.astro";
---
<MealServingStats server:defer mealId={meal.id}>
  <ServingStatsSkeleton slot="fallback" />
</MealServingStats>
```

```astro
---
// src/components/server-islands/MealServingStats.astro
import { getMealServingStats } from "@/server/queries/serving-stats";
import { TAG } from "@/server/cache-tags";
const { mealId } = Astro.props;

Astro.cache.set({ maxAge: 6 * 3600, swr: 86_400, tags: [TAG.mealStats(mealId), TAG.meals] });
const stats = await getMealServingStats(mealId);
---
<!-- bestehendes Markup aus meal-serving-stats.tsx 1:1 als .astro (kein JS) -->
```

### 3.2 `RatingSummary` (Bewertungsübersicht)

Das ist derselbe Ansatz mit Tag `ratings:{id}`. Der Button „Jetzt bewerten / Bewertung aktualisieren“ bleibt eine **React-Island** (`client:visible`), weil er den Dialog braucht.

### 3.3 Wichtige Details

- **`ASTRO_KEY` muss gesetzt und stabil sein** (`astro create-key`). Islands verschlüsseln ihre Props, und zwar mit **zufälligem IV**, also ist die Island-URL pro Render der Seite eindeutig. Solange die Seiten-Shell im Cache liegt, bleibt die Island-URL gleich und ist selbst cachebar. Ohne stabilen Key werden Island-URLs aus gecachtem HTML nach einem Neustart oder Deploy ungültig.
- Island-Requests sind `GET /_server-islands/<Name>?e=…&p=…&s=…`. Der `memoryCache` berücksichtigt alle Query-Parameter, das passt also.
- **Persönliche Daten nie in Server Islands mit Cache** (z. B. die eigene Bewertung). Dafür gibt es 3.4.

### 3.4 Eigene Bewertung (persönlich, nicht cachebar)

Heute schickt jeder Besucher einer Detailseite einen POST. Neu gilt:

1. Die Island `RatingButton` (`client:visible`) prüft clientseitig das **Consent-Cookie**. Ohne Consent gibt es **keinen Request**, der Button zeigt „Jetzt bewerten“, und der Dialog führt wie bisher durch den Consent.
2. Mit Consent ruft sie die Action `getMyRating` erst **beim Öffnen des Dialogs** auf (alternativ `requestIdleCallback`). Damit das Button-Label stimmt, ohne dass ein Request nötig ist, wird beim Speichern zusätzlich ein nicht-httpOnly Marker gesetzt: die gerateten Meal-IDs in `localStorage`.

---

## 4. Client-JS radikal reduzieren (UI bleibt gleich)

| Komponente | Heute | Neu |
|---|---|---|
| Gerichtsliste, MealCard, MensaHeader, IngredientBadges, InfoCard, EmptyState | React (Client) | **`.astro`, 0 KB JS**. Markup und Tailwind-Klassen werden 1:1 übernommen. |
| Veggie/Vegan/Mensa-Filter (Anwendung) | React-State + Re-Render | **CSS + Data-Attribute**: Karten tragen `data-mensa`, `data-veggie`, `data-vegan`. Ein Inline-Script im `<head>` liest die Filter-Cookies und setzt sie **vor dem ersten Paint** als Attribute auf `<html>`. Kein Flackern mehr, kein Hydration-Mismatch (Problem #6). Die Zähler „X Gerichte ausgeblendet“ und die Empty States berechnet ein kleines Vanilla-Script (~1 KB). |
| Filter-Dialog (`MensaFilter`) | React, lädt Mensen per Action | React-Island `client:idle`. Die **Mensenliste kommt als Prop aus der (gecachten) Seite**, damit entfällt der Request (Problem #3). |
| Geteilter Filter-State | React Context | **nanostores** (`nanostores`, `@nanostores/react`). Islands sind getrennte React-Roots, ein Context funktioniert dort nicht. Der Store schreibt die Cookies und die `<html>`-Attribute. |
| DaySelector | React + `router.push` | React-Island `client:load` (Kalender-Popover bleibt). „Heute“ und „Morgen“ werden echte `<a>`-Links mit Prefetch. |
| Navigation und Übergänge | `next/link` + `ViewTransition` (experimentell) | Astro `<ClientRouter />` + `transition:name` (gleiche Animationen) + `prefetch` (`hover`, für MealCards `viewport`). |
| BackButton | React + Router | `<a>` + 5 Zeilen Inline-Script (`history.back()`, wenn ein Referrer von derselben Origin existiert). |
| Toasts (sonner), Alert/Confirm | Provider im Root-Layout | **eine** globale Island `client:idle`. `toast()` und `confirm()` funktionieren über Modul-Singletons auch aus anderen Islands. `alert.tsx` nutzt bereits `globalAlert`/`globalConfirm`. |
| Consent-Dialog, Kontaktformular, Rating-Dialog | React | React-Islands (`client:visible`) mit unverändertem Markup. |
| shadcn/ui (`src/components/ui/*`) | unverändert | **unverändert**. Die Komponenten werden nur in Islands verwendet. Reine Präsentationskomponenten (Badge, Card, Skeleton, Button-Styles) bekommen zusätzlich eine `.astro`-Variante mit denselben `cva`-Klassen. |

Erwartung: Auf `/` und `/day/*` sinkt das JS von „React + Radix + komplette Liste hydriert“ auf ca. **DaySelector + Filter-Dialog** (Radix Popover/Dialog/Switch, lazy). Das HTML enthält keine doppelte RSC-Payload mehr.

---

## 5. Datenschicht

### 5.1 Aufräumen

- `"use server"` kommt aus allen Lese-Funktionen raus. Reine Queries ziehen nach `src/server/queries/*` (nur serverseitig importierbar).
- `unstable_cache`, `revalidatePath`, `revalidateTag`, `next/headers` und `next/cache` entfallen ersatzlos. **Der Route Cache ist die einzige Cache-Ebene für Seiten.** Doppelte Cache-Schichten mit unterschiedlichen TTLs waren eine Ursache für Inkonsistenzen.
- Mutationen werden **Astro Actions** (`src/actions/index.ts`): `rating.submit`, `rating.delete`, `rating.mine`, `feedback.submit`, `consent.set`. Validierung erfolgt mit Zod 4 (ist schon Dependency). Cookies laufen über `context.cookies`, IP-Header über `context.clientAddress` bzw. `context.request.headers`.
- Ein kleiner In-Process-Memo (TTL 1 h) gilt nur für `getAllMensen()`, weil sie von mehreren Seiten gebraucht wird und sich praktisch nie ändert.

### 5.2 Datum: eine Quelle der Wahrheit

`src/server/dates.ts`:
- `todayBerlin(): string` liefert `YYYY-MM-DD` in Europe/Berlin.
- `parseDayParam(s): string | null` prüft streng `^\d{4}-\d{2}-\d{2}$`, ein echtes Kalenderdatum und das Fenster −365 … +14 Tage.
- `secondsUntilBerlinMidnight(): number` wird für `maxAge` von `/` gebraucht.
- Queries verwenden ausschließlich den String und daraus `Date.UTC(...)`, **nie** `getFullYear()` oder `getDate()` der Server-Zeitzone (behebt #7 und #8).

### 5.3 Datenbank

Neue Drizzle-Migration:

```ts
index("mensa_meal_meal_id_date_idx").on(table.mealId, table.date),  // Serving-Stats, findMeal
```

Außerdem:
- `findMeal` macht nur **eine** Query (Join auf die neueste `mensa_meal`-Zeile, `ORDER BY date DESC LIMIT 1`). Die Bewertungsdaten liefert jetzt das Island.
- `pg.Pool` bekommt explizite Werte: `max: 10`, `idleTimeoutMillis: 30_000`, `connectionTimeoutMillis: 5_000`. Der Pool-Singleton wird über `globalThis` vor Dev-HMR geschützt.
- `logError` läuft im Request-Pfad **fire-and-forget**: Telegram und DB-Insert werden nicht mehr `await`et.

### 5.4 Sync (DAL) — empfohlen, aber eigenständige Phase

Die Logik bleibt gleich, aber:
- **Batch statt N+1**: Meals per `INSERT … ON CONFLICT (src_id, data_source_slug) DO UPDATE` in einem Statement, `mensa_meal` per `INSERT … ON CONFLICT DO NOTHING`, alles in **einer Transaktion**.
- `handleSync()` gibt `{ changedDates: string[], changedMealIds: string[] }` zurück. Das ist die Grundlage für die gezielte Invalidierung (Abschnitt 2.3).

---

## 6. Caching-Konfiguration (konkret)

```js
// astro.config.mjs
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, envField, fontProviders, memoryCache } from "astro/config";

export default defineConfig({
  site: "https://speisly.de",
  // output: "static" (Default): alles prerendered, außer Seiten mit `export const prerender = false`
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },

  cache: {
    provider: memoryCache({
      max: 2000, // ~2000 Einträge × ≤100 KB ≈ ≤200 MB RAM worst case
      // Achtung: `exclude` ERSETZT die Default-Liste, daher die wichtigsten Tracking-Parameter wieder aufnehmen
      // `mmid` bleibt im Cache-Key (eigene Seitenvariante je Ausgabe, siehe Phase 5)
      query: { exclude: ["utm_*", "fbclid", "gclid", "ref"] },
    }),
  },
  routeRules: {
    "/meal/[mealId]": { maxAge: 86_400, swr: 604_800 },
    // "/" und "/day/[date]" setzen ihre TTL dynamisch per Astro.cache.set()
  },

  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
  image: { domains: ["meine-mensa.de"] },
  fonts: [
    { provider: fontProviders.fontsource(), name: "Geist", cssVariable: "--font-geist-sans" },
    { provider: fontProviders.fontsource(), name: "Geist Mono", cssVariable: "--font-geist-mono" },
  ],
  env: {
    schema: {
      DATABASE_URL: envField.string({ context: "server", access: "secret" }),
      JWT_SECRET: envField.string({ context: "server", access: "secret" }),
      JWT_ALGORITHM: envField.string({ context: "server", access: "secret", default: "HS256" }),
      API_BEARER_TOKEN: envField.string({ context: "server", access: "secret" }),
      TELEGRAM_BOT_TOKEN: envField.string({ context: "server", access: "secret", optional: true }),
      TELEGRAM_CHAT_ID: envField.string({ context: "server", access: "secret", optional: true }),
      PUBLIC_COOKIE_CONSENT_NAME: envField.string({ context: "client", access: "public" }),
      PUBLIC_PRIVACY_POLICY_PATH: envField.string({ context: "client", access: "public", default: "/datenschutz" }),
    },
  },
});
```

TTL-Logik in der Seite:

```astro
---
// src/pages/day/[date].astro
export const prerender = false;
import { parseDayParam, todayBerlin } from "@/server/dates";
import { TAG } from "@/server/cache-tags";

const date = parseDayParam(Astro.params.date!);
if (!date) {
  Astro.cache.set({ maxAge: 3600 });
  return new Response(null, { status: 404 });
}
const isPast = date < todayBerlin();
Astro.cache.set(
  isPast
    ? { maxAge: 30 * 86_400, tags: [TAG.day(date)] }
    : { maxAge: 6 * 3600, swr: 3600, tags: [TAG.meals, TAG.day(date)] },
);
const meals = await getMealsForDate(date);
---
```

**Browser-Header** (in `src/middleware.ts`): Der Memory-Provider entfernt `CDN-Cache-Control` und `Cache-Tag` vor der Auslieferung. Für Browser setzen wir deshalb explizit:
- Seiten: `Cache-Control: public, max-age=60, stale-while-revalidate=600`
- `/`: `max-age` höchstens bis Mitternacht
- Islands: `public, max-age=60`
- Actions und API: `no-store`

**Pre-Warm** (`src/server/prewarm.ts`): Nach Sync, Mitternacht und Boot werden sequentiell und lokal (`http://127.0.0.1:$PORT`) `/` und `/day/{heute…+7}` abgerufen. Der Header `X-Astro-Cache` (HIT/MISS/STALE) dient als Kontrolle.

---

## 7. Bilder

Die Bilder kommen von `meine-mensa.de/mediathek/**`. Optionen:

1. **Empfohlen: Optimierung beim Sync statt beim Request.** Für neue oder geänderte `imgPath` lädt der Sync das Bild einmal, erzeugt mit sharp (bereits Dependency) AVIF und WebP in 2 Breiten (400/800) und legt sie auf einem persistenten Volume ab (`/data/img/{mealId}-{w}.{fmt}`). Ausgeliefert wird per Reverse Proxy oder Middleware mit `immutable`. Damit fällt **null Bild-CPU im Request-Pfad** an. In der DB kommt ein Feld `img_variant` (Hash) für Cache-Busting dazu.
2. Fallback und Übergang: Astro `<Image>` mit `image.domains` (On-Demand-Endpoint `/_image`). Das ist einfacher, rechnet aber wieder beim ersten Request. Mit `routeRules: { "/_image": { maxAge: 31 Tage } }` und einem Reverse-Proxy-Cache wäre das akzeptabel.

`priority` aus `next/image` wird zu `loading="eager"` + `fetchpriority="high"` für die ersten 3 Karten, alle anderen bekommen `loading="lazy"` + `decoding="async"` + feste `width`/`height` (kein CLS).

---

## 8. Betrieb: Server, Cron, Deploy

- Build: `astro build` erzeugt `dist/client` (statisch) und `dist/server/entry.mjs`.
- Start: `bun ./dist/server/entry.mjs` (`bun run start`). In Phase 1 geprüft: Der Node-Adapter läuft unter Bun fehlerfrei und war im Lasttest ~1,7–2× schneller als Node 22 (siehe Umsetzungsnotizen). Fallback: `bun run start:node`. Abschließend wird das in Phase 9 mit echten DB-Seiten nochmal verglichen.
- `_boot.ts` wird durch einen schlanken Start-Wrapper `server.mjs` ersetzt. Er importiert `./dist/server/entry.mjs` (der Standalone-Server startet beim Import) und registriert danach die Cron-Jobs aus `src/server/cron.ts` im selben Prozess:
  - Der Cron ruft `POST http://127.0.0.1:$PORT/api/sync` mit Bearer auf, **nicht** die öffentliche URL.
  - Die Invalidierung muss im Server-Prozess passieren, weil dort der Memory-Cache lebt. Deshalb bleibt der Sync ein Endpoint, der `context.cache.invalidate({ tags })` aufruft.
  - Die Zeitpläne bleiben: `17 7,10,17 * * 1-5` (Refresh heute), `17 2 * * 0-4` (Woche) und `1 0 * * *` (Mitternacht → `home`).
- `/api/revalidate` entfällt. Die Mitternachtslogik ist ein Modus von `/api/sync` (`?mode=midnight`).
- Umami-Script: `<script is:inline defer src="https://stats.speisly.de/script.js" data-website-id="…">`, nur in Produktion.
- Neue Env-Variablen: `ASTRO_KEY` (Pflicht, siehe 3.3), `HOST`, `PORT`. `NEXT_PUBLIC_*` wird zu `PUBLIC_*`.

---

## 9. Phasenplan

Jede Phase endet mit einem lauffähigen Stand auf `astro`.

| Phase | Inhalt | Ergebnis / Abnahme |
|---|---|---|
| **0. Baseline** | Lighthouse (mobil) für `/`, `/day/<morgen>`, `/meal/<id>`; TTFB p50/p95 per `oha` (100 req/s, 60 s); JS-Bytes; DB-Queries pro Request (Logging im Pool). | Messwerte-Tabelle in `docs/perf-baseline.md` |
| **1. Scaffold** | Astro 7.3, `@astrojs/node`, `@astrojs/react`, `@tailwindcss/vite`, `astro:env`, Fonts API, Alias `@/*`, Biome-Konfiguration für `.astro`. Next-Dependencies entfernen. `globals.css` übernehmen. | `astro dev` läuft, Layout und Footer sind pixelgleich |
| **2. Datenschicht** | `src/server/*` (db, queries, dates, cache-tags), Index-Migration, `getAllMensen`-Memo, `logError` async. Kein `next/*` mehr. | Typecheck grün, Queries per Skript getestet |
| **3. Statische Seiten** | `datenschutz`, `kontakt`, `feedback`, `404`, `manifest` prerendered. Kontakt-/Feedback-Formular als Island + Action. | Prerender in `dist/client`, Formular funktioniert |
| **4. Speiseplan** | `/` und `/day/[date]` als `.astro`, MealCard/MealList ohne JS, Filter per Data-Attribute + nanostores, Filter-Dialog- und DaySelector-Islands, ClientRouter + Prefetch. | UI identisch (Screenshot-Vergleich), kein Filter-Flackern |
| **5. Gericht-Detail** | `/meal/[mealId]` als `.astro`, Server Islands `MealServingStats` + `RatingSummary`, `RatingButton`-Island, Actions für Bewertungen inkl. `cache.invalidate`. | `?mmid` funktioniert, Bewertung ist nach dem Speichern sichtbar |
| **6. Caching** | `memoryCache`, `routeRules`, dynamische TTLs, Middleware-Header, `/api/sync` mit gezielter Invalidierung, Pre-Warm. | `X-Astro-Cache: HIT` nach dem ersten Aufruf; nach dem Sync sind nur die betroffenen Tage MISS |
| **7. Bilder** | Sync-Pipeline für Bildvarianten (Option 1) oder `<Image>` (Option 2). | Kein sharp im Request-Pfad (Option 1) |
| **8. Sync-Optimierung** | Batch-Upserts in einer Transaktion, `changedDates`/`changedMealIds`. | Sync-Dauer deutlich kürzer, Ergebnisse identisch (Diff gegen alten Sync auf Staging-DB) |
| **9. Betrieb & Cutover** | Start-Wrapper + Cron, `ASTRO_KEY`, Deploy-Skript, Lasttest wie in Phase 0, Vergleich, Umschalten, Next-Reste löschen. README aktualisieren. | Zielwerte erreicht (unten) |
| **Optional** | CDN davor (z. B. Cloudflare) → Cache-Provider tauschen, ohne `Astro.cache`-Aufrufe zu ändern; `experimental.clientPrerender` (Speculation Rules) für MealCards; Preact-Compat statt React für die Islands. | – |

### Zielwerte (Abnahme gegen Phase 0)

- TTFB p95 bei Cache-HIT **< 30 ms** (Server), bei MISS < 300 ms
- **0 DB-Queries** pro Seitenaufruf bei HIT (inkl. Islands)
- JS auf `/` mindestens **−70 %** gegenüber der Baseline
- Lighthouse Performance mobil **≥ 95**, CLS ≈ 0, kein Hydration-Warning
- Kein Request an den Server beim reinen Anschauen einer Detailseite ohne Consent (außer Islands, die gecacht sind)

---

## 10. Risiken und offene Punkte

| Risiko | Gegenmaßnahme |
|---|---|
| Memory-Cache ist pro Prozess; bei mehreren Instanzen inkonsistent | Aktuell eine Instanz. Bei Skalierung einen CDN- oder Custom-Provider über die `CacheProvider`-Schnittstelle einsetzen (z. B. Redis). Der Code bleibt gleich. |
| RAM-Verbrauch des Caches | `max: 2000` und Monitoring. Vergangene Tage nach 30 Tagen fallen ohnehin raus (LRU). |
| `?mmid` nicht im Cache-Key: Zutaten in der Shell zeigen die neueste Ausgabe statt der verlinkten | Zutaten ändern sich zwischen Ausgaben selten. Falls doch, die Zutatenliste ebenfalls als Island mit `mmid`-Prop oder clientseitig umschalten. Zu entscheiden in Phase 5. |
| Bun-Runtime mit `@astrojs/node` | In Phase 1 testen, sonst Node 22/24 in Produktion |
| Island-URLs aus Browser-gecachtem HTML nach Key-Wechsel | `ASTRO_KEY` stabil halten, HTML-Browser-Cache nur 60 s |
| Filter per CSS: Zähler „ausgeblendet“ und Empty States | Kleines Vanilla-Script plus `:has()`-Fallback. Wird in Phase 4 mit allen Filterkombinationen getestet. |
| SEO und Metadaten (`generateMetadata`) | Werden in Astro im `<head>` des Layouts gesetzt (OG, Twitter, Title-Template „%s \| Speisly“) – Inhalte identisch |

---

## Umsetzungsnotizen Phase 1

Abweichungen und Entscheidungen gegenüber dem ursprünglichen Plan:

- **`next` bleibt vorübergehend als devDependency.** Die noch nicht portierten Komponenten (`src/components/*`, `src/actions/*`, `src/lib/cookie/*`) importieren `next/link`, `next/image`, `next/headers` usw. Damit sie bis zu ihrer Portierung typchecken, bleibt `next` installiert. Es wird **nicht** gebaut oder ausgeliefert. Entfernt wird es, sobald die letzte Komponente portiert ist (spätestens Phase 5). Die alten Routen unter `src/app/` sind nur noch Referenz, aus `tsconfig.json` ausgeschlossen und werden pro Phase gelöscht.
- **Schriften kommen lokal aus `@fontsource-variable/geist(-mono)`** über `fontProviders.local()` (Nachtrag Phase 3: Geist Sans entfällt, weil es in Next nie aktiv war – siehe dort). Die Provider `google` und `npm` laden Dateien beim Build von Google bzw. jsDelivr. Das macht den Build netzabhängig und war in der Build-Umgebung blockiert. Es ist dieselbe Geist-Version wie bei `next/font` (Dateigröße ±0,5 %), Latin-Subset, Preload für die Sans-Variante, automatisch berechnete Fallback-Metriken.
- **Dateinamen in kebab-case** (`base-layout.astro`, `footer.astro`, …) gemäß Biome/Ultracite-Konvention des Projekts. Statische Astro-Varianten von UI-Bausteinen liegen in `src/components/astro/`.
- **Footer und Hero sind reine `.astro`-Komponenten** (vorher `"use client"`). Icons kommen aus `@lucide/astro` und rendern als SVG ohne JS. Der Button-Stil kommt aus demselben `buttonVariants` (cva) wie in React.
- **Logo ohne Bildoptimierung:** `logo_full.png` ist nur 20 KB groß. Es wird direkt mit festen `width`/`height` ausgeliefert, damit keine Bild-Transformation zur Laufzeit nötig ist.
- **Neu: `/api/health`** (on-demand, `no-store`) für Deploy-Healthchecks. Es meldet auch die Runtime.
- **Env:** `astro:env`-Schema in `astro.config.mjs`. `NEXT_PUBLIC_*` heißt jetzt `PUBLIC_*`. Die Vorlage liegt in `.env.example`. Die noch nicht portierten Module lesen weiterhin `process.env` und werden in Phase 2 umgestellt.
- **Kompression:** Der Node-Adapter komprimiert nicht (Next tat das). In Produktion muss gzip/brotli vom Reverse Proxy kommen. Das ist für Phase 9 notiert.
- **Bun-Log:** Unter Bun meldet der Adapter fälschlich `https://…` in der Startzeile. Das ist rein kosmetisch, ausgeliefert wird HTTP.

### Abnahme Phase 1

| Kriterium | Ergebnis |
|---|---|
| `astro build` | ✅ 1,8 s (Next: 17 s) |
| `astro check` | ✅ 0 Fehler |
| Biome (neue Dateien) | ✅ sauber |
| Layout/Footer/Hero pixelgleich | ✅ gleiche Abmessungen (Mobil + Desktop), Abweichungen nur durch 1-px-Rundung und Glyph-Antialiasing. Der Filter-Button (fixed) fehlt bewusst, er kommt in Phase 4. |
| Client-JS auf `/` | 0 Bytes (nur das Umami-Script in Produktion) |
| Bun-Runtime | ✅ identische Antworten wie Node; Lasttest (autocannon, 10 Verbindungen): `/api/health` 4 737 vs. 2 787 req/s, statische Seite 11 676 vs. 5 975 req/s, 0 Fehler |

---

## Umsetzungsnotizen Phase 2

**Neue Struktur `src/server/`** (nur serverseitig; `astro:env/server` lässt den Build fehlschlagen, falls etwas davon im Client landet):

| Modul | Inhalt |
|---|---|
| `db.ts` | Pool-Singleton (`max: 10`, Idle-/Connect-Timeouts, HMR-sicher über `globalThis`), Fehler-Handler für idle Clients |
| `dates.ts` | `todayBerlin`, `parseDayParam` (strikt `YYYY-MM-DD`, Fenster −365 … +14 Tage), `toUtcDate`/`toIsoDay`, `addDays`/`diffDays`, `berlinMidnight`, `secondsUntilBerlinMidnight` |
| `cache-tags.ts` | Tag-Schema aus §2.3 |
| `log.ts`, `telegram.ts` | `logError` als Fire-and-forget (blockiert keinen Request, wirft nie, serialisiert `Error` lesbar) |
| `memo.ts` | In-Process-Memo mit TTL (geteiltes Promise, Fehler werden nicht gecacht) |
| `queries/meals.ts` | `getMealsForDate(isoDay, mensaId?)` |
| `queries/meal.ts` | `findMeal(mealId, mensaMealId?)`: **eine** Query; ohne `mensaMealId` die neueste Ausgabe |
| `queries/serving-stats.ts` | `getMealServingStats` (Datumsangaben als `YYYY-MM-DD`) |
| `queries/ratings.ts` | `getMealRatingStats` (öffentlich, für das Island) |
| `queries/mensen.ts` | `getVisibleMensen` (1 h Memo, ohne „unbekannt“), `listMensen`/`createMensa` für den Sync |
| `sync/` | bisher `src/dal`. Nur verschoben und auf die neuen Module umgestellt, Logik unverändert (Batch-Umbau in Phase 8) |

**Entscheidungen und Befunde:**
- **Queries werfen bei DB-Fehlern**, statt wie bisher still `[]` bzw. Nullwerte zurückzugeben. Mit Route Cache würde sonst eine leere Seite stundenlang ausgeliefert. Der Fehler wird geloggt, und die Seite antwortet mit 500 (wird nicht gecacht).
- **Mensen sind jetzt alphabetisch sortiert.** Vorher fehlte ein `ORDER BY`, die Reihenfolge hing also vom Query-Plan ab. Innerhalb einer Mensa sortiert die Liste wie bisher nach Preis (in der Komponente).
- **Sommer-/Winterzeit:** `secondsUntilBerlinMidnight` rechnet über den echten Berlin-Offset. Ein naives `86400 − vergangene Sekunden` hätte am Tag der Umstellung auf Sommerzeit die Startseite bis 01:00 Uhr mit dem Vortag ausgeliefert.
- **Zeitzone des Servers spielt keine Rolle:** Drizzle schreibt und liest `timestamp`-Spalten als UTC. Die Tests laufen unter `TZ=UTC`, `Europe/Berlin`, `America/New_York` und `Pacific/Kiritimati` grün.
- **Indizes (Migration `drizzle/0005_lean_namorita.sql`):**

  | Index | Wirkung (Seed-DB, 20k Ausgaben) |
  |---|---|
  | `mensa_meal (meal_id, date)` | `findMeal`: Seq Scan 2,7 ms → Index Scan 0,14 ms (wächst nicht mehr mit der Tabelle); Angebotshistorie nutzt ihn ebenfalls |
  | `user (ip_hash)` | User-Lookup bei Bewertungen: Seq Scan → Index Scan |

  `CREATE INDEX` sperrt die Tabelle beim Anlegen kurz für Schreibzugriffe. Bei der Tabellengröße dauert das Millisekunden, also das Deployment nicht in einen laufenden Sync legen.

**Tests** (`bun run test`, neu):
- `dates.test.ts`: Grenzfälle um Mitternacht, Sommer-/Winterzeit, ungültige Daten, Fenster
- `queries.test.ts`: alle Queries gegen die Seed-DB, gegengeprüft mit direkten SQL-Aggregaten
- `sync.test.ts`: Sync mit gestubbter meine-mensa-API (Anlegen, ausgeschlossene Locations, Idempotenz, Preisänderung + `meal_update`, Entfernen). Er räumt hinterher auf und dient als Regressionstest für Phase 8.
- `tests/setup.ts` stellt `astro:env/*` als virtuelle Module bereit. Die Integrationstests brauchen `DATABASE_URL` in der Umgebung, weil `bun test` die `.env.local` nicht lädt. Ohne DB werden sie übersprungen.

**Noch nicht migriert (bewusst):** Cookies, User und JWT (`src/actions/user.ts`, `rating.ts`, `src/lib/cookie/actions.ts`, `src/lib/jwt`) brauchen den Astro-Request-Kontext und werden mit den Bewertungs-Actions in Phase 5 umgebaut. Feedback (`src/actions/feedback.ts`) folgt in Phase 3 als Astro Action. `src/lib/db/index.ts` ist bis dahin ein Re-Export von `src/server/db.ts`, damit es nur **einen** Pool gibt.

---

## Umsetzungsnotizen Phase 3

**Seiten (alle prerendered, als Dateien in `dist/client`):** `/datenschutz`, `/kontakt`, `/feedback`, `/404` sowie das Manifest. `src/layouts/back-layout.astro` ersetzt das `(static)`-Layout. Der Zurück-Button ist ein Link mit einem 10-Zeilen-Script (`history.back()`, sonst `href`). `/kontakt` und `/feedback` teilen sich `src/components/astro/form-page.astro`.

**Islands pro Seite:**

| Seite | Islands | Hydration |
|---|---|---|
| `/kontakt`, `/feedback` | Formular (`ContactForm`), Toaster | `client:idle` |
| `/datenschutz` | „Cookie-Einstellungen ändern“, Toaster | `client:idle` |
| `/404`, `/` | keine – 0 KB JS | – |

Der Toaster ist jetzt eine eigene Island und wird über `<BaseLayout withToasts>` nur auf Seiten eingebunden, die Toasts zeigen. Der Cookie-Button war zuerst `client:visible`, aber ein Klick direkt nach dem Scrollen traf dann noch den statischen Button. Weil React für den Toaster ohnehin geladen wird, kostet `client:idle` nichts extra.

**Feedback als Astro Action (`src/actions/index.ts` → `feedback.submit`):**
- **Validierung jetzt auch serverseitig** (Zod: Nachricht getrimmt 10–2000 Zeichen, E-Mail optional und gültig). Die alte Server Action hat ungeprüft gespeichert.
- **Telegram blockiert nicht mehr:** Die Benachrichtigung läuft im Hintergrund (`src/server/feedback.ts`). Sonderzeichen werden für Telegram-Markdown escaped. Vorher brach ein einzelnes `_` oder `*` im Feedback den Telegram-Aufruf ab, und der Nutzer sah einen Fehler, obwohl die Nachricht gespeichert war.
- **CSRF:** Astros `checkOrigin` lehnt Cross-Origin-Formular-POSTs ab (getestet: 403). JSON-Requests brauchen ohnehin einen CORS-Preflight.
- Spam-Schutz (Rate-Limit/Honeypot) gab es vorher nicht und gibt es weiterhin nicht. Das wäre ein eigenes Thema.

**Schrift – wichtiger Befund:** In der Next-Version war **Geist Sans nie aktiv**. `--font-geist-sans` wurde per Klasse am `<body>` gesetzt, Tailwind liest `--font-sans` aber am `<html>` aus. Dadurch fiel die Seite immer auf `ui-sans-serif, system-ui, …` zurück. Next hat die zwei Geist-Dateien (≈ 52 KB) trotzdem auf jeder Seite vorgeladen. Damit die UI gleich bleibt, setzt `globals.css` jetzt explizit diesen System-Stack. Geist Sans wird nicht mehr geladen. Geist Mono bleibt für `font-mono` (Zutatenliste) und wird ohne Preload nur dort geladen, wo es gebraucht wird. Falls Geist Sans eigentlich gewollt war, reicht eine Zeile in `globals.css` und ein Eintrag in `astro.config.mjs`, aber das wäre eine sichtbare Änderung.

**Biome formatiert keine `.astro`-Dateien mehr.** Der Formatter entfernt in Astro-Templates Leerzeichen um `{Ausdrücke}` und Inline-Elemente (reproduziert: „<b>fett</b> danach“ wird zu „<b>fett</b>danach“). Das hat im Footer aus „2026 Speisly“ „2026Speisly“ gemacht (aus Phase 1, jetzt behoben). Linting läuft weiterhin (`biome.jsonc`, Override).

**Visueller Vergleich mit Next** (Element-Screenshots, mobil 390 px und Desktop 1280 px, Pixel mit Abweichung > 16/255):

| Seite | Mobil | Desktop |
|---|---|---|
| `/datenschutz` (7 450 px hoch) | 0,000 % | 0,000 % |
| `/kontakt` | 0,000 % | 0,000 % |
| `/feedback` | 0,000 % | 0,000 % |
| `/404` | 0,000 % | 0,000 % |
| Footer | 0,001 % (Logo-Skalierung) | 0,000 % |

**Messung `/datenschutz`** (Rohdaten: `docs/perf/phase3-astro.json`):

| | Next 16 | Astro 7.3 |
|---|---|---|
| TTFB p50 / p95 | 7.9 / 12.8 ms | 1 / 2.7 ms |
| Durchsatz (10 Verbindungen) | 956 req/s | 8194 req/s |
| HTML roh / gzip | 60 / 9.7 KB | 27 / 7.9 KB |
| JS-Dateien | 18 | 7 |
| JS roh / gzip | 1156 / 334 KB | 295 / 95 KB |
| Folge-Requests beim Seitenaufruf | 9 | 0 |
| Lighthouse Score | 95 | 100 |
| FCP / LCP | 1.38 / 2.81 s | 1.21 / 1.66 s |
| TBT | 53 ms | 0 ms |

JS gzip sinkt um 72 %, obwohl die Seite zwei React-Islands hat. Ein weiterer Hebel wäre, den Cookie-Dialog erst beim Klick nachzuladen. In Produktion kommt die Kompression vom Reverse Proxy, weil der Node-Adapter nicht komprimiert. Lighthouse bewertet hier unkomprimiertes JS und kommt trotzdem auf 100.

**Tests:** Browser-E2E für Kontakt- und Feedback-Formular (Client-Validierung, Absenden, Toast, Erfolgsmeldung, DB-Eintrag), Cookie-Dialog (Consent-Cookie gesetzt) und Zurück-Button. Keine Konsolenfehler. Unit-/Integrationstests für Markdown-Escaping und `saveFeedback`.

**Für das Deployment notiert:** `PUBLIC_COOKIE_CONSENT_NAME` muss denselben Wert haben wie das bisherige `NEXT_PUBLIC_COOKIE_CONSENT_NAME`. Sonst verlieren alle Nutzer ihre Cookie-Einwilligung.

**Messskript:** neu `--pages` (nur ausgewählte Seiten). JS-Größen werden jetzt selbst ermittelt (roh und gzip), weil Playwrights Größenangaben bei komprimierten Antworten nicht verlässlich waren. Die Baseline wurde damit neu gemessen.

---

## Umsetzungsnotizen Phase 4

**Seiten:** `/` und `/day/[date]` sind on-demand gerendert (`prerender = false`). Ungültige Daten und Daten außerhalb des Fensters (−365 … +14 Tage) beantwortet `src/middleware.ts` mit 404, bevor gerendert wird. `/day/heute` leitet per 301 auf `/` um.

**Abweichung vom Plan, bewusst weitergehend: Kein React beim Seitenaufruf.** Geplant waren DaySelector und Filter-Dialog als hydrierte Islands. Das hätte die React-Runtime (56 KB gzip) und react-day-picker (34 KB) auf jede Seite gebracht, insgesamt 126 KB gzip. Umgesetzt ist:

| Teil | Umsetzung | JS beim Laden |
|---|---|---|
| Gerichtsliste, Karten, Accordion „Weitere Gerichte“ | `.astro`. Accordion mit Radix-identischem Markup und ~30 Zeilen Vanilla-JS | – |
| Day-Selector (Heute/Morgen/Kalender-Button) | `day-selector.astro`, Navigation + Prefetch per Mini-Script | ~0,6 KB |
| Filter-Button und Chips („3 Mensen ×“, „Nur Vegan ×“) | `filter-fab.astro`. Chips werden per CSS vom Head-Script geschaltet | ~0,6 KB |
| Kalender-Popover (react-day-picker) | React, **erst beim Öffnen** geladen, Vorladen bei Hover/Touch/Fokus (`calendar-popover.mount.tsx`) | – |
| Filter-Dialog | React, **erst beim Öffnen** geladen (`filter-dialog.mount.tsx`) | – |

Initiales JS auf `/` und `/day/*`: **4,6 KB gzip** (Next: 248 KB). Der gemeinsame Zustand liegt in `src/stores/filters.ts` (nanostores), React liest ihn über `useSyncExternalStore`.

**Filter ohne Flackern und ohne Hydration-Fehler:** `src/lib/filters/boot.ts` läuft als Inline-Script im `<head>`. Es liest die bestehenden Filter-Cookies (gleiche Namen und gleiches Format wie bisher) und setzt `data-diet`/`data-filter-*` auf `<html>`. Für die Mensa-Auswahl und den Mensa-Chip erzeugt es CSS. Alles, was vom Ernährungsfilter abhängt (Hinweise „X Gerichte ausgeblendet“, Zähler im Accordion, komplett ausgeblendete Mensen, leere Bereiche), rendert der Server für jede Variante vor; CSS blendet die passende ein. Der Leerzustand „Keine Gerichte gefunden + Filter zurücksetzen“ bei leerer Mensa-Auswahl läuft über `:has()`. In Next gab es bei gesetzten Filtern einen Hydration-Mismatch (React #418, im Test reproduziert). Er tritt nicht mehr auf.

**Weitere Details:**
- **„Heute“ kommt vom Server** (`todayBerlin()`), nicht aus der Zeitzone von Server oder Browser. Relative Angaben („Heute“, „Morgen“, Wochentag) berechnet `src/lib/format-day.ts` auf Basis von ISO-Tagen.
- **Icons:** `@lucide/astro` ist auf **0.556.0** gepinnt, dieselbe Icon-Version wie `lucide-react`. In 1.x wurden „Blatt“ (Vegan) und „Rind“ (Fleisch) neu gezeichnet. Alle 17 verwendeten Icons sind per SVG-Vergleich identisch.
- **Prefetch:** nur bei Hover/Touch auf Karten und Heute/Morgen (`data-astro-prefetch`), nicht wie bei Next für alles im Viewport. Bis Phase 5 liefert der Prefetch der Detailseite noch 404.
- **Mensen** erscheinen alphabetisch (Entscheidung aus Phase 2). Innerhalb einer Mensa ist die Reihenfolge identisch zu Next (geprüft).
- **Kompression:** Der Node-Adapter komprimiert nicht. Ohne Kompression ist das HTML der Liste 312 KB statt 22 KB, Lighthouse fiel dabei auf 71–89. **In Produktion muss gzip/brotli vor dem Server sitzen** (Reverse Proxy oder der Start-Wrapper aus Phase 9). Zum Messen gab es `scripts/perf/compress-proxy.ts` (in Phase 9 entfernt, der Start-Wrapper komprimiert jetzt selbst) und im Messskript die Option `--browser-base`.
- **Biome:** Für `.astro` sind jetzt auch Linter und Assist aus. Jedes `check/lint --write` (auch fixAll beim Speichern in VS Code) fügte eine Leerzeile ins Frontmatter ein, die sich bei jedem Lauf vermehrte. Die Typprüfung macht `astro check`.
- **Aufgeräumt:** `meal-list.tsx`, `meal-card.tsx`, `empty-state.tsx`, `loading-state.tsx`, `mensa-header.tsx`, `info-card.tsx`, `filter-context.tsx`, `day-selector.tsx`, `mensa-filter.tsx`, `src/actions/mensa.ts` sowie `welcome-cta.tsx` (war schon vorher ungenutzt).

**Visueller Vergleich mit Next** (`/day/<morgen>`, jede Mensa-Gruppe einzeln, mobil + Desktop, in 6 Zuständen: ohne Filter, vegetarisch, vegan, 2 Mensen gewählt, leere Auswahl, Accordion offen). Dazu kommen Day-Selector, Filter-Button mit Chips, Hero sowie der Leerzustand eines Samstags:
- Alle 80 Ausschnitte haben **identische Abmessungen**. Day-Selector, Leerzustände, Filter-Button und Chips sind **pixelidentisch**.
- In den Gruppen weichen höchstens 0,05 % der Pixel ab. Das ist Kantenglättung einzelner Glyphen, weil Next den Titel per `<!-- -->` in mehrere Textknoten zerlegt. Mit bloßem Auge ist das nicht sichtbar.

**Messung** (Browser/Lighthouse über `compress-proxy.ts` wie in Produktion; Rohdaten `docs/perf/phase4-astro.json`):

| Seite | | JS gzip | DB-Queries / Seitenaufruf | Folge-Requests | Lighthouse | FCP | LCP | TBT | TTFB p95 (ungecacht, 10 parallel) |
|---|---|---|---|---|---|---|---|---|---|
| `/` | Next | 248.2 KB | 11 | 3 | 93 | 1.53 s | 3.16 s | 62 ms | 31.4 ms |
| `/` | Astro | 4.6 KB | 1 | 0 | 100 | 1.33 s | 1.53 s | 0 ms | 312.8 ms |
| `/day/<morgen>` | Next | 248.2 KB | 13 | 3 | 89 | 1.53 s | 3.64 s | 93 ms | 190.3 ms |
| `/day/<morgen>` | Astro | 4.6 KB | 1 | 0 | 100 | 1.28 s | 1.54 s | 0 ms | 277.3 ms |
| `/day/<vor 30 Tagen>` | Next | 248.2 KB | 13 | 7 | 93 | 1.53 s | 3.19 s | 51 ms | 190.2 ms |
| `/day/<vor 30 Tagen>` | Astro | 4.6 KB | 1 | 0 | 100 | 1.13 s | 1.53 s | 0 ms | 297 ms |

Die Serverseite ist ohne Cache noch nicht schneller: ~19 ms CPU pro Render, unter Last ~50 req/s. `/` war bei Next per ISR gecacht und ist darum vorerst sogar langsamer. Das ist der Auftrag für Phase 6.

**Konsequenz für Phase 6 (wichtig):** Jede Tagesseite enthält „heute“-abhängige Inhalte: die Datumsangaben und Hervorhebung im Day-Selector, relative Labels („Gestern“, Wochentag) und den Leerzustand. Deshalb muss **jede** Tages- und die Startseite spätestens um Mitternacht (Berlin) aus dem Cache fallen: `maxAge = min(Regel, secondsUntilBerlinMidnight())`. Die im Plan vorgesehenen 30 Tage für vergangene Tage gelten damit nur bis Mitternacht. Bei ≤ 1 Render pro Seite und Tag ist das unkritisch. Die Alternative wäre, diese Teile clientseitig zu rendern. Das würde wieder JS kosten und das HTML zwischen Server und Client unterschiedlich machen.

---

## Umsetzungsnotizen Phase 5

**`/meal/[mealId]`** ist on-demand gerendert. Unbekanntes Gericht oder eine `mmid`, die nicht zum Gericht gehört, ergibt 404 (wie bisher).

**Abweichungen vom Plan (begründet):**
- **`?mmid` bleibt Teil der Seite und damit des Cache-Keys.** Die Seite zeigt wie bisher die Zutaten und Beilagen der verlinkten Ausgabe und erlaubt nur dann das Bewerten. Damit ist die offene Frage aus §10 ohne UI-Änderung gelöst. Ohne `mmid` werden die Zutaten der neuesten Ausgabe gezeigt; Next nahm hier eine zufällige Zeile. **Für Phase 6: `mmid` NICHT aus dem Cache-Key ausschließen.** Pro Gericht entstehen nur so viele Varianten, wie Ausgaben tatsächlich verlinkt und aufgerufen werden.
- **Die Bewertungsübersicht ist Teil der Seite, keine Server Island.** Sie steht mitten auf der Seite. Als nachgeladene Island würde alles darunter (Beilagen, Inhaltsstoffe) beim Laden springen (CLS). Sie kostet nur eine schnelle indizierte Query, und die Seite wird beim Bewerten gezielt über `ratings:<id>` invalidiert. Bewertungen sind selten.
- **Server Island: „Angebotshistorie“** (`src/components/server-islands/serving-stats.astro`, `server:defer` mit Skeleton). Das ist die teuerste Aggregation, sie steht am Seitenende und ändert sich nur durch den Sync. Sie wird per `GET /_server-islands/ServingStats?e=…&p=…` nachgeladen und in Phase 6 eigenständig gecacht (`meal-stats:<id>`, `meals`).

**Bewerten (Button + Dialog):**
- **Der Button ist statisches HTML** in der gecachten Seite. Die eigene Bewertung (`actions.rating.mine`) wird **nur bei erteiltem Cookie-Consent** abgefragt. Ohne Consent gibt es keine einzige Anfrage; Next fragte bei jedem Seitenaufruf per Server Action.
- **Dialog, Bestätigungsdialog und Toaster** (React) werden erst beim Klick geladen und bei Hover/Touch vorgeladen. Der Inhalt ist unverändert aus `meal-rating.tsx`, ebenso Consent-Abfrage und Meldungen.
- **Aktualisierung ohne Reload:** Nach Speichern oder Löschen aktualisieren sich Button („Bewertung aktualisieren“, Outline-Variante) und Bewertungsübersicht sofort. Die Übersicht wird frisch vom Server geholt und ersetzt; Next machte das über `revalidatePath` und einen RSC-Refresh.
- **Astro Actions `rating.mine/submit/delete`:** serverseitige Zod-Validierung (Sterne 1–5, Kommentar ≤ 500 Zeichen). **Neu:** Die `mensaMealId` muss zum Gericht gehören. Nach Änderungen wird `ratings:<id>` invalidiert (`src/server/cache.ts`; ohne konfigurierten Provider ein No-op).
- **User-Erkennung** (`src/server/user.ts`, vorher `src/actions/user.ts` + `next/headers`): gleiches JWT-Cookie `speisly_user_id`, gleicher IP-Hash. Fallback ist jetzt die Socket-Adresse statt `"unknown"`, vorher teilten sich alle Anfragen ohne Proxy-Header einen Nutzer.

**View Transitions** (vorher React `<ViewTransition>`): native Cross-Document View Transitions (`@view-transition` in `globals.css`, `prefers-reduced-motion` respektiert). Die Namen (`meal-image-<mmid>` usw.) vergibt `src/lib/view-transitions.ts` per `pageswap`/`pagereveal` **nur für das angeklickte Gericht**. Next setzte sie auf jede Karte, das hätte bei ~90 Karten bei jeder Navigation 90 Snapshots bedeutet. Das funktioniert in Chromium und Safari ≥ 18.2; Firefox navigiert ohne Animation.

**Astro-7-Eigenheit:** `<script>`-Tags werden an der Stelle gerendert, an der sie stehen. Ein Script im Bewerten-Button war dadurch ein zusätzliches Kind der Box und hat den `space-y`-Abstand verändert (+12 px). Solche Scripts kommen jetzt über einen `head`-Slot (`rating-button-script.astro`).

**Aufgeräumt:** Alle Next-Seiten und -Komponenten außer `src/app/api/*` (Sync/Revalidate, kommt in Phase 6) und `src/_boot.ts` (Phase 9). Entfernt sind die alten Server Actions, `lib/cookie/actions`, `lib/jwt`, `lib/telegram`, der DB-Shim, `meal-comp/meal-detail/rating-stats/...tsx` und `lnio/utils/format-date.ts`. **`next` ist keine Abhängigkeit mehr.**

**Visueller Vergleich** (Detailseite: mit `mmid` inkl. Beilagen, mit vollständigen Teilbewertungen, ohne Bewertungen; mobil + Desktop):
- Gleiche Abmessungen.
- Abweichungen 0,2–1 %: Bei Mensen mit gleicher Anzahl Angebote ist die Reihenfolge in der Angebotshistorie jetzt alphabetisch (bei Next zufällig), dazu kommt Glyphen-Kantenglättung im Titel.
- Ohne `mmid` unterscheidet sich der Inhalt erwartungsgemäß (neueste statt zufälliger Ausgabe).

**Tests:** Browser-E2E für den gesamten Bewertungsablauf (ohne Consent keine Anfrage → Consent-Dialog → Bewerten → Button und Übersicht ohne Reload aktuell → Reload zeigt „Bewertung aktualisieren“ → Dialog vorbelegt → Löschen mit Bestätigung) sowie Navigation Liste → Detail → zurück; keine Konsolenfehler. Unit-/Integrationstests für Consent-Cookie und Bewertungen (32 Tests gesamt).

**Messung aller Seiten nach Phase 5** (Browser über gzip-Proxy, noch **ohne** Route Cache; Rohdaten `docs/perf/phase5-astro.json`), Next → Astro:

| Seite | JS gzip | DB-Queries / Seitenaufruf | Lighthouse | LCP | TBT | TTFB p95 | Req/s |
|---|---|---|---|---|---|---|---|
| `/` | 248 → **4.6 KB** | 11 → **1** | 93 → **100** | 3.16 → **1.54 s** | 62 → **0 ms** | 31.4 → 277.4 ms | 436 → 53 |
| `/day/<morgen>` | 248 → **4.6 KB** | 13 → **1** | 89 → **100** | 3.64 → **1.54 s** | 93 → **0 ms** | 190.3 → 280.6 ms | 54 → 49 |
| `/day/<vor 30 Tagen>` | 248 → **4.6 KB** | 13 → **1** | 93 → **100** | 3.19 → **1.54 s** | 51 → **0 ms** | 190.2 → 284.6 ms | 49 → 50 |
| `/meal/<id>?mmid=…` | 264 → **6.6 KB** | 4 → **3** | 94 → **100** | 2.96 → **1.51 s** | 58 → **0 ms** | 71.6 → 34.1 ms | 96 → 441 |
| `/datenschutz` | 334 → **98.1 KB** | 0 → **0** | 95 → **100** | 2.81 → **1.38 s** | 53 → **0 ms** | 12.8 → 3.1 ms | 956 → 7163 |

Client-seitig sind alle Zielwerte aus §9 erreicht. Serverseitig fehlt noch der Cache: Die Listen-Seiten liegen ungecacht bei ~50 req/s, `/` war bei Next per ISR gecacht. Das ist Phase 6.

---

## Umsetzungsnotizen Phase 6

**Route Cache:** `memoryCache({ max: 2000 })` in `astro.config.mjs`. Query-Parameter gehören zum Key (`?mmid=` ergibt eine eigene Variante), Tracking-Parameter (`utm_*`, `fbclid`, …) nicht (Astro-Default). TTLs und Tags setzen die Seiten selbst mit `Astro.cache.set()`. Alle Regeln liegen zentral in `src/server/cache-policy.ts`:

| Route | maxAge | swr | Tags |
|---|---|---|---|
| `/` | bis Mitternacht (Berlin) | – | `meals`, `home`, `day:<heute>` |
| `/day/<vergangen>` | 30 Tage, **gekappt auf Mitternacht** | – | `day:<datum>` |
| `/day/<heute/Zukunft>` | 6 h, gekappt auf Mitternacht | 1 h, gekappt | `meals`, `day:<datum>` |
| `/meal/<id>` (+ `?mmid`) | 1 Tag | 7 Tage | `meal:<id>`, `ratings:<id>` |
| Server Island Angebotshistorie | 6 h | 1 Tag | `meal-stats:<id>` |
| 404, Redirects, `/api/*`, `/_actions/*` | nicht gecacht | | |

`untilMidnight()` sorgt dafür, dass weder `maxAge` noch `swr` über Mitternacht hinausreichen. Der Day-Selector und die relativen Datumsangaben sind „heute“-abhängig (siehe Phase 4), und mit `swr` würde nach Mitternacht kurz noch der Vortag ausgeliefert. Getestet ist das inklusive der Kappung um 23:30 Uhr.

**Invalidierung:**
- **Sync:** `handleSync()` gibt jetzt `{ changedDates, changedMealIds }` zurück. Erfasst werden neue Ausgaben, entfernte Ausgaben und geänderte Gerichtsdaten (Name, Untertitel, Bild, Preise); die Logik selbst ist unverändert. Invalidiert werden **nur** `day:<datum>` für geänderte Tage sowie `meal:<id>` und `meal-stats:<id>` für geänderte Gerichte. Die Startseite hängt am Tag `day:<heute>`.
- **Bewertungen:** `ratings:<id>` (Actions `rating.submit/delete`). Im Browser getestet: Seite gecacht → bewerten → Übersicht sofort aktuell.
- **Mitternacht:** Alle „heute“-abhängigen Seiten laufen über `maxAge` von selbst ab. `scope=midnight` invalidiert zusätzlich `home` als Sicherheitsnetz und wärmt vor.

**`POST /api/sync?scope=today|week|midnight`** (`src/pages/api/sync.ts`, Logik in `src/server/sync-endpoint.ts`) ersetzt `src/app/api/sync` und `/api/revalidate`:
- Authentifizierung per `Authorization: Bearer <API_BEARER_TOKEN>`, timing-sicher verglichen; unbekannter Scope ergibt 400. Ein fehlgeschlagener Sync lässt den Cache unangetastet (500).
- Danach läuft im Hintergrund ein **Pre-Warm** (`src/server/prewarm.ts`): `/` und `/day/<heute…+7>` werden lokal über `127.0.0.1:$PORT` abgerufen, nicht über die öffentliche URL.
- **Wichtig für den Cron (Phase 9):** Der Aufruf braucht `Content-Type: application/json`. Ohne Content-Type und ohne `Origin` lehnt Astros CSRF-Schutz (`checkOrigin`) den POST mit 403 ab. Das ist gewollt und bleibt aktiv.
- Neue Zeitpläne für Phase 9: `scope=today` um 7:17, 10:17 und 17:17 (Mo–Fr), `scope=week` um 2:17 (So–Do), `scope=midnight` um 0:01. Das entspricht den bisherigen Cron-Zeiten.

**Browser-Header** (`src/middleware.ts`): On-demand-HTML und Islands bekommen `public, max-age=0, must-revalidate`. Der Browser fragt also immer neu, und ein Cache-HIT kostet auf dem Server ~1–5 ms; dadurch sind neue Bewertungen sofort für alle sichtbar. `/api/*` und Actions bekommen `no-store`. Hashed Assets (`/_astro/*`) liefert der Node-Adapter mit `immutable` aus.

**Messung mit warmem Cache** (10 parallele Verbindungen, 15 s; Rohdaten `docs/perf/phase6-astro.json`), Next → Astro:

| Seite | TTFB p50 | TTFB p95 | Req/s | DB-Queries / Request |
|---|---|---|---|---|
| `/` | 18 → **4.8 ms** | 31.4 → **13.7 ms** | 436 → **1612** | 0 → **0** |
| `/day/<morgen>` | 79.9 → **4.8 ms** | 190.3 → **13.1 ms** | 54 → **1656** | 0 → **0** |
| `/day/<vor 30 Tagen>` | 80.1 → **4.5 ms** | 190.2 → **13.2 ms** | 49 → **1685** | 0 → **0** |
| `/meal/<id>?mmid=…` | 38.4 → **1.5 ms** | 71.6 → **5.3 ms** | 96 → **4565** | 4 → **0** |
| `/datenschutz` (prerendered) | 7.9 → **0.8 ms** | 12.8 → **2.3 ms** | 956 → **9318** | 0 → **0** |

- **Zielwerte aus §9:** TTFB p95 im Cache < 30 ms erreicht (5–14 ms). Ein Seitenaufruf bei warmem Cache verursacht 0 DB-Queries.
- **Server Island:** Einzige Ausnahme ist der erste Abruf der Island nach einem neuen Seiten-Render, danach ist auch sie gecacht.
- **Browser-Werte:** Lighthouse 100, JS 4,6–6,6 KB, unverändert gegenüber Phase 5.
- **Durchsatz:** Mit Cache bedienen die Speiseplan-Seiten ~30× so viele Anfragen wie Next (1.600–1.700 statt ~50 req/s).

**Messhinweis:** Der Host gehört zum Cache-Key. Über `compress-proxy.ts` (der `127.0.0.1` aufruft) landet der Browser deshalb in anderen Einträgen als der Lasttest (`localhost`), was dort einen MISS ergibt. In Produktion ist der Host konstant.

**Grenzen des Memory-Caches:** pro Prozess, nach Neustart leer (Pre-Warm beim Start kommt mit Phase 9). Bei mehreren Instanzen bräuchte man einen gemeinsamen Provider; die `Astro.cache`-Aufrufe bleiben dabei gleich.

## Umsetzungsnotizen Phase 7

Umgesetzt ist **Option 1 aus §7: Optimierung beim Sync, nicht beim Request**. Im Request-Pfad läuft kein sharp mehr.

**Ablauf** (`src/server/images/`):
- **Wann:** `POST /api/sync` ruft nach dem Speiseplan-Sync `syncImages({ from, to })` auf, für `today` heute, für `week` heute bis +7.
- **Was:** Für jedes Bild im Zeitraum, dem Varianten fehlen, lädt der Sync das Original **einmal** von meine-mensa.de. Daraus erzeugt er **AVIF und WebP in 400 und 800 px Breite**.
- **Wohin:** `IMAGE_DIR/<key>-<breite>.<format>`. Der Default ist `./data/img`, in Produktion ein persistentes Volume.
- **Key:** die ersten 16 Hex-Zeichen von SHA-256 über die Original-URL. Eine neue Bild-URL ergibt damit neue Dateinamen. Für das Cache-Busting braucht es kein neues DB-Feld wie ursprünglich geplant, also auch keine Migration.
- **Sicherer Dateiwechsel:** Alle vier Dateien werden erst als `.tmp` geschrieben und dann umbenannt. Eine Seite sieht nie eine halbe Variante.
- **Jedes Mal der ganze Zeitraum:** Geprüft wird nicht nur, was der Sync geändert hat. Ein fehlgeschlagener Download wird so beim nächsten Sync nachgeholt.
- **Invalidierung:** Seiten, deren Bilder neue Varianten bekommen haben, werden invalidiert (`day:<datum>`, `meal:<id>`). Die Tage und Gerichte dazu werden mit dem Sync-Ergebnis zusammengeführt.
- **Fehler:** Einzelne Bilder werden geloggt (ohne Telegram). Ein Fehler der ganzen Bildverarbeitung lässt den Sync trotzdem erfolgreich sein. Die Seite zeigt dann weiter das Original.
- **Absicherung beim Download:**
  - Nur `https://meine-mensa.de/mediathek/*` ist erlaubt.
  - Timeout 20 s, höchstens 15 MB.
  - Der Content-Type muss `image/*` sein.
  - sharp bekommt `limitInputPixels`.

**Rendern** (`meal-image.astro`):
- **Mit Varianten:** `<picture class="contents">` mit `<source type="image/avif">` und `<source type="image/webp">`, jeweils mit `srcset` 400w/800w. `display: contents` lässt das Layout unverändert.
- **Ohne Varianten:** das bisherige `<img>` mit der Original-URL. Das gilt z. B. für alte Tage vor dem Backfill.
- **Kosten der Prüfung:** Ob es Varianten gibt, prüft `existsSync` nur beim Rendern. Wegen des Route Caches passiert das selten. Positive Treffer merkt sich der Prozess.
- **Unverändert:** `priority` (`loading="eager"`, `fetchpriority="high"` für die ersten drei Karten), Skeleton und Einblenden.
- **`sizes` an die echte Darstellung angepasst:**
  - Karte: `(max-width: 768px) 30vw, 160px`. Next hatte hier `100vw`, damit lud das Handy ein Vielfaches der nötigen Pixel.
  - Detailseite: `(max-width: 448px) 100vw, 384px`.
- **Gemessen:**
  - Handy (DPR 3): Karten laden die 400er-AVIF-Variante, die Detailseite die 800er.
  - Desktop: überall 400er.

**Auslieferung:** `GET /img/<datei>` (`src/pages/img/[file].ts`).
- Gültig sind nur Namen, die zu `^[0-9a-f]{16}-(400|800)\.(avif|webp)$` passen, alles andere ist 404.
- Header `Cache-Control: public, max-age=31536000, immutable`.
- In Produktion kann der Reverse Proxy `IMAGE_DIR` auch direkt unter `/img/` ausliefern.

**`image.domains` entfernt:** Vorher hätte `/_image?href=https://meine-mensa.de/…` sharp im Request-Pfad ausgelöst, für jeden beliebigen Aufrufer. Jetzt antwortet der Endpoint mit 403.

**Encoder-Einstellung:** AVIF `quality: 55, effort: 2`, WebP `quality: 78`. Mit dem Default `effort: 4` dauerte ein Bild mit allen vier Varianten ~1,2 s, mit `effort: 2` sind es ~150 ms. Die Dateien sind dabei kaum größer (27 vs. 28 KB pro Bild, alle Varianten zusammen). Die Varianten entstehen nacheinander, damit laufende Requests nicht ausgebremst werden.

**Backfill:** `scripts/images/backfill.ts [--since YYYY-MM-DD]` erzeugt die Varianten für alle Bilder in der DB. Der Sync deckt nur heute bis +7 ab. Das Skript überspringt Vorhandenes und darf mehrfach laufen.
- **Beim Cutover (Phase 9):** einmal **vor** dem Start des Servers ausführen. Sonst bleiben vergangene Tage bis zum Ablauf ihres Caches beim Original.

**Tests:** `src/server/images/images.test.ts` (Varianten, Maße, `srcset`, Wiederholung, Fehler ohne Dateireste, Allowlist, `syncImages` gegen die Seed-DB) und `tests/api-sync.test.ts` (Zusammenführen der Invalidierung, ein Bildfehler bricht den Sync nicht ab). Insgesamt 50 Tests.

**E2E:** Den Seed-Gerichten habe ich Bild-URLs gegeben und die Varianten für die nächsten 8 Tage erzeugt (331 Bilder, 5,3 MB). Danach habe ich im Browser geprüft (Handy und Desktop):
- Alle sichtbaren Bilder kommen als AVIF von `/img/`, das Skeleton ist ausgeblendet.
- 0 externe Requests, 0 Konsolenfehler.
- Die View Transition zur Detailseite funktioniert.
- Vergangene Tage ohne Varianten zeigen das Original.

**Lighthouse mit Bildern** (vorher hatte der Seed keine Bilder; Rohdaten `docs/perf/phase7-astro.json`):

| Seite | Score | LCP | CLS | TTFB p95 (Cache) |
|---|---|---|---|---|
| `/` | 100 | 1,66 s | 0 | 11,5 ms |
| `/day/<morgen>` | 100 | 1,53 s | 0 | 10,3 ms |
| `/meal/<id>?mmid=…` | 100 | 1,51 s | 0 | 3,8 ms |

Nicht testbar war hier der Download von echten meine-mensa.de-Bildern (aus der Umgebung gesperrt). Die Download-Logik ist mit einem Fake-`fetch` getestet.

## Umsetzungsnotizen Phase 8

Der Sync schreibt jetzt **in einer Transaktion mit Batch-Statements** statt Gericht für Gericht.

**Aufbau** (`src/server/sync/`):
- **Lesen:** API abrufen, dann drei Queries parallel: Mensen, bestehende Gerichte (per `src_id`), bestehende Ausgaben im Zeitraum.
- **Planen** (`plan.ts`, reine Funktion ohne DB): `planSync()` berechnet neue Mensen, neue Gerichte, geänderte Gerichte (mit Änderungslog und betroffenen Tagen), neue Ausgaben und entfernte Ausgaben.
- **Schreiben** (`db.ts`, `applySyncPlan()`): alles in **einer** Transaktion.
  - Neue Gerichte und Ausgaben: Multi-Row-`INSERT … ON CONFLICT DO NOTHING RETURNING`.
  - Geänderte Gerichte: ein `UPDATE … FROM (VALUES …)`.
  - Entfernte Ausgaben: ein `DELETE … WHERE id IN (…)`.
  - Änderungslogs: ein Multi-Row-Insert.
  - Alles in Blöcken zu 500 Zeilen.
- **Was als geändert gilt:** Nur Zeilen, die der Insert tatsächlich zurückgibt, zählen als neue Ausgaben. Das ist dieselbe Grundlage für die Cache-Invalidierung wie vorher.

**Vergleich alt gegen neu** (gleiches Stub-Szenario, 6 Mensen × 5 Tage, ~460 Ausgaben, 5 Läufe hintereinander; Rohdaten `docs/perf/phase8-sync.json`):

| Szenario | Dauer alt → neu | App-Queries alt → neu |
|---|---|---|
| Neue Woche (alles neu) | ~1 150 ms → **~100 ms** | 1 249 → **7** |
| Keine Änderung | ~30 ms → ~15–25 ms | 6 → 5 |
| ~90 Gerichte geändert, Ausgaben entfernt/neu, neue Mensa | ~160 ms → **~60 ms** | 133 → **13** |
| zurück auf den Ausgangsstand | ~190 ms → **~35 ms** | 212 → **11** |

Gezählt sind Client-Statements über `pg_stat_statements`, ohne die internen Fremdschlüssel- und Cascade-Trigger und ohne `error_log`. Lokal kostet ein Roundtrip praktisch nichts. In Produktion mit Netzwerk zur DB fällt der Unterschied deutlich größer aus, ~1 250 Roundtrips weniger pro neuer Woche.

**Ergebnisse identisch:** In jedem Szenario ist nach dem Sync der DB-Stand gleich, also Gerichte, Ausgaben inklusive Zutaten und Extras, Änderungslogs und Mensen. Auch die zurückgegebenen Tage und Gerichte für die Invalidierung stimmen überein. Geprüft hat das ein temporärer Vergleichstest gegen eine Kopie des alten Syncs; die Kopie ist nicht committet. Bewusst anders sind drei Punkte, alles Fehler des alten Syncs:
1. **Zwei API-Gerichte mit derselben `src_id`** (`MEAL_SRC_ID_MAPPINGS`, z. B. Apfelstrudel): Der alte Sync verglich das zweite gegen einen veralteten Stand. Dadurch **wechselte der Name bei jedem Sync** zwischen den beiden Varianten, jeweils mit Änderungslog und Cache-Invalidierung. Jetzt gelten die Daten des ersten, die weiteren liefern nur Ausgaben. Der Stand ist stabil, und es entstehen keine Logs.
2. **Ein Update eines Gerichts schlägt fehl** (z. B. Konflikt auf `meal_unique`): Vorher fielen dabei die Ausgaben des Gerichts aus dem Abgleich und wurden als „nicht mehr in der API“ **gelöscht**. Weil `meal_rating` an `mensa_meal` per Cascade hängt, gingen damit auch Bewertungen verloren. Jetzt wird nur das Update übersprungen und geloggt, die Ausgaben bleiben.
3. **Atomar:** Scheitert ein Schreibschritt, ist nichts übernommen. Vorher blieb ein halber Speiseplan stehen. Einzelne fehlerhafte neue Gerichte, z. B. mit zu langem Namen oder einem Konflikt auf `meal_unique`, werden wie bisher übersprungen und geloggt. Dafür gibt es einen Fallback mit Savepoints: erst der ganze Block, bei einem Fehler zeilenweise.

**Tests:**
- `plan.test.ts`: Planung ohne DB, 6 Fälle.
- `sync.test.ts`: um drei Fälle erweitert:
  - Rollback bei Fehler (DB bleibt unverändert);
  - kaputtes neues Gericht wird übersprungen, der Rest synchronisiert;
  - Update-Konflikt behält Gericht und Ausgaben.

Insgesamt 59 Tests.

**Unverändert und als Hinweis für später:** Liefert die API für den Zeitraum **gar keine** Daten (`No food plans found`), entfernt der Sync wie bisher alle Ausgaben im Zeitraum. Das ist an Feiertagen und in Schließzeiten gewollt. Bei einer API-Störung, die 200 mit leerer Liste liefert, wäre es aber gefährlich, weil per Cascade auch Bewertungen gelöscht würden. Eine Schutzregel wäre: Entfernen nur, wenn die API für den Zeitraum mindestens einen Eintrag geliefert hat, oder nur für Tage, die die API kennt. Das ändert das Verhalten und gehört deshalb nicht in diese Phase.

## Umsetzungsnotizen Phase 9

**Start-Wrapper** `server/index.mjs` (`bun run start`, ersetzt `src/_boot.ts`):
- **Server:** Importiert den Build mit `ASTRO_NODE_AUTOSTART=disabled` und nutzt den Handler des Node-Adapters (statische Dateien + SSR) in einem eigenen `http.createServer`.
- **Komprimierung** (`server/compress.mjs`): Brotli (q5) oder gzip (6) für HTML, JS, CSS, JSON, SVG und Manifest ab 1 KB, nur bei 200/404.
  - **Kein zweites Komprimieren:** Gecachte Seiten sind Byte für Byte gleich. Die komprimierte Fassung liegt deshalb in einem LRU (500 Einträge, 32 MB), Schlüssel ist ein Inhalts-Hash. Unter Bun ist das `Bun.hash` (~30 µs), unter Node SHA-1 (~350 µs).
  - **Wirkung:** `/` geht mit 9,7 KB Brotli statt 315 KB über die Leitung (gzip 20 KB).
  - **Kosten:** Unkomprimiert schafft der Server ~785 req/s auf `/day/*`, mit Brotli ~650 req/s, also ~17 % weniger.
- **Pre-Warm beim Start:** `POST /api/sync?scope=warm` (neuer Scope: kein Sync, keine Invalidierung) rendert `/` und `/day/<heute…+7>` vor.
- **Cron** (`server/cron.mjs`): gleiche Zeiten wie bisher, Europe/Berlin, `waitForCompletion`. Die Jobs rufen `POST http://127.0.0.1:$PORT/api/sync` mit Bearer-Token und `Content-Type: application/json` auf.
- **Abschalten:** `CRON_DISABLED=1` schaltet Cron und Pre-Warm ab.
- **Herunterfahren:** Bei `SIGTERM`/`SIGINT` stoppt erst der Cron, dann schließt der Server. Laufende Requests haben 10 s.
- **Node:** `bun run start:node` (`node --env-file-if-exists=.env`) funktioniert ebenso. Geprüft unter Node 22.22.

**`ASTRO_KEY`** wird von Astro **beim Build** gelesen (`core/build`), nicht zur Laufzeit. Ohne ihn erzeugt jeder Build einen neuen Schlüssel. Folge: Offene Tabs aus der Zeit vor einem Deploy können die Angebotshistorie (Server Island) nicht mehr nachladen. Deshalb ist er empfohlen, aber nicht zwingend. Dasselbe gilt für alle `PUBLIC_*`-Werte: Sie werden beim Build eingebaut.

**Aufgeräumt:**
- `src/_boot.ts` entfernt, ebenso `scripts/perf/compress-proxy.ts` (der Wrapper komprimiert jetzt selbst).
- Next-Einträge aus `.gitignore` und `tsconfig.json` entfernt.
- README überarbeitet: Projektstruktur, Sync-Scopes, Betrieb, Caching, Umgebungsvariablen und eine Deploy-Checkliste für den Umstieg.

**Tests:**
- `tests/server.test.ts`: Kodierungswahl, Komprimierung inklusive LRU und Durchreichen von Bildern, Redirects, Fehlern und kleinen Antworten; Cron-Zeitpläne und Sync-Aufruf.
- `tests/api-sync.test.ts`: Scope `warm`.

Insgesamt 68 Tests.

**E2E-Smoke-Test** `scripts/e2e/smoke.ts`, 19 Prüfungen gegen den laufenden Produktions-Build, zweimal hintereinander grün:
- **HTTP:** alle Seiten, Redirect `/day/heute`, 404-Fälle, Manifest, Komprimierung, Route Cache (HIT), `/_image` gesperrt, `/api/sync` mit 401/400/200.
- **Browser, mobil:**
  - Vegan-Filter inklusive Reload und Chip;
  - Mensa-Filter;
  - Tageswahl und Kalender;
  - Detailseite mit Server Island;
  - Bewerten: Consent, speichern, Übersicht aktualisiert sich sofort und nach Reload, löschen mit Rückfrage, Übersicht wieder wie vorher;
  - Feedback- und Kontaktformular;
  - Kontakt, Datenschutz und 404.
- **Browser, Desktop:** Startseite.
- **Konsole:** keine Fehler.

Der Test hat beim Schreiben zwei falsche Annahmen in ihm selbst aufgedeckt. Die Mensa-Auswahl funktioniert wie bei Next („keine Auswahl = alle“), und das Löschen hat eine Sicherheitsabfrage. Einen Fehler in der App hat er nicht gefunden.

## Abschluss: Next.js 16 → Astro 7.3

Gleiche Maschine und Messmethode wie die Baseline (`docs/perf-baseline.md`). Die Seiten sind beim Lasttest gecacht und werden komprimiert ausgeliefert. Rohdaten: `docs/perf/baseline-next.json` gegen `docs/perf/final-astro.json`.

| Seite | TTFB p50 | TTFB p95 | Req/s | JS (gzip) | DB-Queries pro Seitenaufruf | Lighthouse | LCP (mobil) |
|---|---|---|---|---|---|---|---|
| `/` | 18 → **12.6 ms** | 31.4 → **30.8 ms** | 436 → **663** | 242 → **4.5 KB** | 11 → **0** | 93 → **100** | 3.16 → **1.39 s** |
| `/day/<morgen>` | 79.9 → **12.9 ms** | 190.3 → **31.2 ms** | 54 → **645** | 242 → **4.5 KB** | 13 → **0** | 89 → **100** | 3.64 → **1.38 s** |
| `/day/<vor 30 Tagen>` | 80.1 → **13.6 ms** | 190.2 → **33.4 ms** | 49 → **606** | 242 → **4.5 KB** | 13 → **0** | 93 → **100** | 3.19 → **1.38 s** |
| `/meal/<id>?mmid=…` | 38.4 → **3.7 ms** | 71.6 → **10.5 ms** | 96 → **2 085** | 258 → **6.5 KB** | 4 → **1**¹ | 94 → **100** | 2.96 → **1.38 s** |
| `/datenschutz` | 7.9 → **2.7 ms** | 12.8 → **6.2 ms** | 956 → **3 171** | 326 → **96 KB**² | 0 → **0** | 95 → **100** | 2.82 → **1.38 s** |

¹ Die Angebotshistorie (Server Island) wird beim ersten Abruf nach einem neuen Render einmal berechnet und dann gecacht.
² Cookie-Einstellungen als React-Island, unverändert seit Phase 3.

- **Zielwerte aus §9:**
  - TTFB p95 bei HIT < 30 ms: auf den Tages- und Startseiten mit 31–33 ms knapp verfehlt, sonst erreicht. Grund ist die Komprimierung, ohne sie sind es 13–14 ms (Phase 6); für die Nutzer überwiegt die kleinere Übertragung.
  - 0 DB-Queries bei HIT: erreicht.
  - JS −70 %: erreicht, −98 %.
  - Lighthouse ≥ 95: erreicht, 100.
  - LCP < 2,5 s: erreicht.
  - Kein Hydration-Warning: erreicht.
- **Hardware:** Der Container lief bei der Schlussmessung auf anderer Hardware als in Phase 6. Der reine Astro-Server ohne Wrapper schafft hier ~800 statt ~1 650 req/s. Absolute Durchsätze sind deshalb nur innerhalb eines Laufs vergleichbar, das Verhältnis zu Next gilt aber (Next lief zur Baseline unter denselben Bedingungen ebenfalls komprimiert).
- **Serverlast im Alltag:**
  - Ohne Sync rendert der Server eine Tagesseite höchstens einmal pro Tag oder nach Änderungen; alles andere sind Cache-Treffer ohne DB.
  - Prefetches lösen keine DB-Last mehr aus.
  - Der Sync einer neuen Woche braucht 7 statt ~1 250 Queries.
  - Bilder werden einmal pro Bild berechnet, nicht pro Größe und Request.

**Offene Punkte für später** (nicht Teil der Migration):
- **HTML-Größe:** 315 KB roh. Darin stecken 111 KB Tailwind-Klassen und 102 KB Inline-SVG-Icons (238 Stück). Ein SVG-Sprite (`<use href>`) würde das Rohgewicht etwa halbieren; komprimiert sind es heute 10–20 KB.
- **Schutzregel im Sync:** Liefert die API für einen Zeitraum gar keine Daten, werden wie bisher alle Ausgaben darin gelöscht, per Cascade inklusive Bewertungen (siehe Phase 8).
- **Mehrere Instanzen:** Der Route Cache ist pro Prozess. Bei mehreren Instanzen braucht man einen gemeinsamen Cache-Provider und Cron nur auf einer Instanz (`CRON_DISABLED=1` auf den anderen).
- **„Stand“ auf `/datenschutz`:** zeigt das Build-Datum (wie bei Next, dort ebenfalls `new Date()` in einer statischen Seite).
