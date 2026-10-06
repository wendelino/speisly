# Performance-Baseline (Phase 0)

Messung des **aktuellen Stands (Next.js 16.2.7)** als Referenz für die Astro-Migration.
Rohdaten: [`docs/perf/baseline-next.json`](perf/baseline-next.json)

## Setup

| | |
|---|---|
| Datum | 06.10.2026 |
| Maschine | 4 vCPU (Xeon 2.1 GHz), 15 GB RAM. Server, Postgres und Lastgenerator liefen auf demselben Host. |
| Server | `bun --bun next start` (Production-Build, **ohne** `_boot.ts`/Cron) |
| DB | PostgreSQL 16 lokal, Seed: [`scripts/dev/seed.ts`](../scripts/dev/seed.ts) (6 Mensen, 1 500 Gerichte, 20 250 Ausgaben über ~10 Monate + 14 Tage Vorschau, 2 500 Bewertungen) |
| Last | 10 parallele Verbindungen, 15 s pro URL, nach 5 Warm-up-Requests |
| Browser | Chromium (playwright-core), 390×844, externe Requests (Analytics, Bilder) werden mit 204 beantwortet |
| Lighthouse | 12.8, mobil, simuliertes Throttling, nur Kategorie Performance |

Bilder sind in den Seed-Daten `null`, weil meine-mensa.de aus der Messumgebung nicht erreichbar ist. Die Kosten der Bildoptimierung (`next/image`) sind deshalb **nicht** enthalten. Die echten Werte in Produktion sind eher schlechter.

## Ergebnisse

### Server

| Seite | Render-Modus (Next) | TTFB p50 | TTFB p95 | Req/s | DB-Queries / Request | HTML roh | HTML gzip |
|---|---|---|---|---|---|---|---|
| `/` | ISR (statisch, 30 min) | 17.8 ms | 27.7 ms | 460 | 0 | 331 KB | 23.4 KB |
| `/day/<morgen>` | **dynamisch** (ƒ) | 68.8 ms | 160.5 ms | 60 | 0 (`unstable_cache`) | 328 KB | 22.8 KB |
| `/day/<vor 30 Tagen>` | **dynamisch** (ƒ) | 73.8 ms | 165.9 ms | 59 | 0 (`unstable_cache`) | 327 KB | 22.9 KB |
| `/meal/<id>?mmid=…` | **dynamisch** (ƒ) | 35.4 ms | 63.8 ms | 112 | **4** | 84 KB | 9.6 KB |
| `/datenschutz` | statisch | 7.0 ms | 12.0 ms | 1 080 | 0 | 60 KB | 9.7 KB |

### Browser: ein echter Seitenaufruf

| Seite | JS-Dateien | JS (übertragen) | Folge-Requests an den eigenen Server | **DB-Queries pro Seitenaufruf** |
|---|---|---|---|---|
| `/` | 14 | 249 KB | `POST /` (getAllMensen) + 2× RSC-Prefetch `/meal/*` | **11** |
| `/day/<morgen>` | 14 | 249 KB | `POST /day/…` + 2× RSC-Prefetch `/meal/*` | **13** |
| `/day/<vor 30 Tagen>` | 14 | 249 KB | `POST /day/…` + 2× RSC-Prefetch `/meal/*` | **13** |
| `/meal/<id>` | 16 | 265 KB | 4× RSC-Prefetch `/` | 4 |
| `/datenschutz` | 18 | 334 KB | 9× RSC-Prefetch (`/kontakt`, `/`) | 0 |

### Lighthouse (mobil)

| Seite | Score | FCP | LCP | TBT | CLS | Script-Transfer |
|---|---|---|---|---|---|---|
| `/` | 92 | 1.53 s | 3.16 s | 74 ms | 0 | 254 KB |
| `/day/<morgen>` | 93 | 1.54 s | 3.20 s | 54 ms | 0 | 254 KB |
| `/day/<vor 30 Tagen>` | 89 | 1.53 s | 3.64 s | 77 ms | 0 | 254 KB |
| `/meal/<id>` | 94 | 1.53 s | 2.96 s | 39 ms | 0 | 271 KB |
| `/datenschutz` | 96 | 1.38 s | 2.74 s | 29 ms | 0 | 341 KB |

## Erkenntnisse

Die Messung bestätigt den Plan und ergänzt ihn um zwei Punkte, die ich vorher nicht auf dem Schirm hatte:

1. **`/day/[date]` ist komplett dynamisch.** Der Next-Build markiert die Route als `ƒ`. `export const revalidate = 1800` wirkt dort also auch nicht, ähnlich wie bei `/meal/[mealId]`. Jeder Aufruf rendert 330 KB HTML neu. Das ergibt nur ~60 Req/s und einen p95 von 160 ms, obwohl die Daten aus `unstable_cache` kommen und **keine** DB-Query anfällt. Die Rechenzeit steckt im Rendern, nicht in der DB.
2. **Prefetching erzeugt Serverlast (neu).** Jede sichtbare `MealCard` löst einen RSC-Prefetch der **dynamischen** Detailseite aus, also 4–5 DB-Queries pro Karte. Zusammen mit `getAllMensen` per Server Action kostet **ein einziger Aufruf der Startseite 11 DB-Queries**, obwohl die Seite selbst statisch ausgeliefert wird. Beim Scrollen kommen weitere Karten in den Viewport, und es werden mehr.
3. **Das HTML ist ~14× größer als nötig.** 330 KB roh für eine Gerichtsliste: Jedes Gericht steht einmal im HTML und noch einmal in der RSC-Payload für die Hydration der Client-Liste.
4. **~250 KB JS (komprimiert) auf jeder Seite.** Selbst `/datenschutz` lädt 334 KB, weil Routen-Chunks für Prefetches mitkommen.
5. **Das LCP liegt mobil bei 3.0–3.6 s.** Das ist schlechter als „gut“ (< 2.5 s), obwohl die Seite keine Bilder lädt (Seed ohne Bilder). Das liegt vor allem an JS-Parse und Hydration vor dem Rendern der Liste.
6. Hydration-Fehler traten in dieser Messung nicht auf, weil der Browser ohne Filter-Cookies startet. Der Mismatch aus Problem #6 im Plan tritt erst bei gesetzten Filtern auf.

## Zielwerte für Astro (aus dem Plan, Abschnitt 9)

| Metrik | Baseline (schlechteste Seite) | Ziel |
|---|---|---|
| TTFB p95, gecachte Seite | 166 ms (`/day/*`) | < 30 ms |
| DB-Queries pro Seitenaufruf (Browser) | 13 | **0** bei Cache-HIT |
| JS auf `/` | 249 KB | ≤ 75 KB (−70 %) |
| HTML `/` (roh) | 331 KB | < 120 KB |
| Lighthouse mobil | 89–96 | ≥ 95 auf allen Seiten |
| LCP mobil | 3.64 s | < 2.5 s |

## Messung wiederholen

```bash
# 1) Postgres mit pg_stat_statements (zählt Queries ohne Verzögerung)
postgres … -c shared_preload_libraries=pg_stat_statements -c pg_stat_statements.track=all
psql "$DATABASE_URL" -c "create extension if not exists pg_stat_statements"

# 2) Schema + Testdaten
bun db:migrate
bun scripts/dev/seed.ts

# 3) Production-Build starten (Next: `bun --bun next build && bun --bun next start`)

# 4) Messen
bun scripts/perf/measure.ts --base http://localhost:3000 --label <name> \
  --lighthouse --out docs/perf/<name>.json
```

Das Skript ist framework-unabhängig und wird nach jeder Migrationsphase gegen den Astro-Build erneut ausgeführt.
