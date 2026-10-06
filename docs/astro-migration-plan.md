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
| 4.–9. | offen |

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
      query: { exclude: ["mmid", "utm_*", "fbclid", "gclid", "ref"] },
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
