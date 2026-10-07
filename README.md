# Speisly

**Speisly** ist eine Open-Source-Webanwendung für Studierende der Martin-Luther-Universität Halle-Wittenberg (MLU Halle), die aktuelle Speisepläne der Universitätsmensen übersichtlich und benutzerfreundlich präsentiert.

## Über das Projekt

Speisly wurde entwickelt, um Studierenden der MLU Halle einen einfachen und schnellen Zugang zu den aktuellen Speiseplänen der Mensen zu ermöglichen. Die Anwendung bietet eine moderne, responsive Benutzeroberfläche und kann als Progressive Web App (PWA) installiert werden.

## Features

- **Aktuelle Speisepläne** – Zeigt die Speisepläne aller MLU Halle Mensen
- **Filterung** – Filterung nach Mensen, Tagen und Ernährungspräferenzen (vegetarisch, vegan)
- **Responsive Design** – Optimiert für Desktop, Tablet und Smartphone
- **Moderne UI** – Intuitive Benutzeroberfläche mit Tailwind CSS
- **Detaillierte Informationen** – Vollständige Angaben zu Gerichten, Zutaten und Preisen
- **Bewertungen** – Möglichkeit, Gerichte zu bewerten
- **Persistente Einstellungen** – Speicherung von Filterpräferenzen im Browser
- **PWA** – Installierbar als Progressive Web App

## Tech Stack

- **[Astro 7](https://astro.build)** – Web-Framework: Seiten werden auf dem Server gerendert und gecacht, Server Islands für Statistiken, React nur für interaktive Dialoge (Migration von Next.js: [`docs/astro-migration-plan.md`](docs/astro-migration-plan.md))
- **[TypeScript](https://www.typescriptlang.org/)** – Typsichere Entwicklung
- **[React 19](https://react.dev/)** – für Filter-, Kalender- und Bewertungsdialog (erst bei Bedarf geladen)
- **[Tailwind CSS](https://tailwindcss.com/)** – Utility-first CSS Framework
- **[Drizzle ORM](https://orm.drizzle.team/)** – TypeScript ORM für Datenbankzugriffe
- **[PostgreSQL](https://www.postgresql.org/)** – Datenbank
- **[Bun](https://bun.sh/)** – Package Manager und Runtime
- **[Biome](https://biomejs.dev/)** – Linter und Formatter

## Voraussetzungen

- **Node.js** >= 22.12.0
- **Bun** – Package Manager und Runtime
- **PostgreSQL** Datenbank (für Produktion)

## Installation & Setup

### 1. Repository klonen

```bash
git clone https://github.com/wendelino/speisly.git
cd speisly
```

### 2. Dependencies installieren

```bash
bun install
```

### 3. Umgebungsvariablen konfigurieren

Erstelle eine `.env` Datei im Root-Verzeichnis (Vorlage: `.env.example`):

```bash
cp .env.example .env
```

### 4. Datenbank migrieren

```bash
bun db:push
```

### 5. Development Server starten

```bash
bun dev
```

Die Anwendung ist nun unter [http://localhost:4321](http://localhost:4321) erreichbar.

Für lokale Testdaten (ohne Zugriff auf die meine-mensa.de API):

```bash
bun scripts/dev/seed.ts
```

## Projektstruktur

```
speisly/
├── server/                # Produktionsstart: HTTP-Server, Komprimierung, Cron
├── src/
│   ├── actions/           # Astro Actions (Bewertungen, Feedback)
│   ├── components/        # Astro-Komponenten (nach Bereich: day, filter, meal, rating, …), React nur für Dialoge
│   │   └── ui/            # wiederverwendbare Bausteine (Design-System)
│   ├── layouts/
│   ├── middleware.ts      # Tages-Routen, Browser-Cache-Header
│   ├── pages/             # Routen (/, /day/[date], /meal/[mealId], /api/*, /img/*)
│   ├── server/            # nur Server: DB, Queries, Cache-Regeln, Sync, Bilder
│   │   ├── sync/          # Abgleich mit der meine-mensa.de API
│   │   └── images/        # Bildvarianten (AVIF/WebP) aus dem Sync
│   ├── stores/            # nanostores (Filter, Dialog-Zustand)
│   └── lib/               # gemeinsame Hilfsfunktionen, DB-Schema
├── drizzle/               # Datenbank-Migrationen
├── scripts/               # Seed-Daten, Bild-Backfill, Messung, E2E-Smoke-Test
├── tests/                 # Tests außerhalb von src/
└── public/                # Statische Assets
```

## UI & Design-System

- **Tokens** (Farben, Radien, Schatten, Animationen) in `src/styles/globals.css`: warme Creme-Flächen, die Marken-Beere als Primärfarbe und verspielte Akzente (`sun`, `mint`, `sky`, `peach`, `rose`).
- **Schrift:** Fließtext in der Systemschrift, Überschriften und Preise in [Bricolage Grotesque](https://fontsource.org/fonts/bricolage-grotesque) (self-hosted, `astro.config.mjs`).
- **Bausteine** in `src/components/ui/`: Astro-Komponenten ohne JS (`button`, `badge`, `card`, `chip`, `tabs`/`tab-panel`, `stat`, `stars`, `meter`, `note`, `empty-state`, `icon-blob`, `prose`, `skeleton`) und die React-Primitives für Dialoge (shadcn/Radix). Button- und Badge-Stile kommen für beide aus `ui/variants.ts`.
- **Gerichtskarten** nutzen kurze Klassen aus `src/styles/meal.css` (die Karte steht ~90× auf einer Seite, das hält das HTML klein).
- Speiseplan: Tagesauswahl und Mensa-Sprungmarken stehen in einer Toolbar, die ab `md` sticky ist (mit Markierung der sichtbaren Mensa); auf dem Handy sind die Mensa-Überschriften sticky.
- Dialoge sind auf dem Handy Bottom-Sheets, ab `sm` zentriert. Animationen respektieren `prefers-reduced-motion`. Keine Emojis in Texten.

## Datensync (`src/server/sync`)

Der Sync gleicht den Speiseplan mit der API von [meine-mensa.de](https://meine-mensa.de) ab: API lesen, Änderungen im Speicher planen (`plan.ts`), dann alles in einer Transaktion schreiben (`db.ts`). Danach erzeugt er fehlende Bildvarianten und invalidiert genau die gecachten Seiten, die sich geändert haben.

Ausgelöst wird er per Cron im Server-Prozess (siehe unten) oder manuell:

```bash
curl -X POST -H "Authorization: Bearer $API_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "http://localhost:4321/api/sync?scope=week"   # today | week | midnight | warm
```

| Scope | Was passiert |
|---|---|
| `today` | Speiseplan von heute abgleichen |
| `week` | heute bis +7 Tage abgleichen |
| `midnight` | kein Sync; Startseite neu, Seiten vorwärmen |
| `warm` | nur Seiten vorwärmen (nach dem Serverstart) |

`Content-Type: application/json` ist Pflicht, sonst blockt Astros CSRF-Schutz den POST (403).

**Schutz vor Datenverlust:** Gerichte, die die API nicht mehr liefert, entfernt der Sync nur an Tagen, für die die API überhaupt Einträge hat, und nie, wenn sie bewertet wurden. Würde ein Sync mehr als die Hälfte der Ausgaben im Zeitraum entfernen, entfernt er nichts und meldet sich per Telegram. Nach Prüfung lässt sich die Löschung mit `&force=1` erzwingen.

## Build & Betrieb

### Production Build und Start

```bash
bun run build
bun run start        # Bun (empfohlen); bun run start:node für Node ≥ 22
```

`bun run start` startet `server/index.mjs`:

- **HTTP-Server** mit dem Handler von `@astrojs/node` (statische Dateien + SSR) auf `HOST`:`PORT` (Default `0.0.0.0:4321`).
- **Komprimierung** (Brotli/gzip) für HTML, JS, CSS, JSON. Komprimierte Fassungen gecachter Seiten werden wiederverwendet. Ein Reverse Proxy davor muss nicht zusätzlich komprimieren.
- **Pre-Warm** direkt nach dem Start: `/` und `/day/<heute…+7>` werden gerendert, damit der erste Besucher nicht wartet.
- **Cron** (Europe/Berlin, wie bisher): `today` um 7:17, 10:17 und 17:17 (Mo–Fr), `week` um 2:17 (So–Do), `midnight` um 0:01.
- `CRON_DISABLED=1` schaltet Cron und Pre-Warm ab, z. B. für eine zweite Instanz.
- Beendet sich sauber bei `SIGTERM`/`SIGINT`.

### Caching

- **Route Cache:** Gerenderte Seiten und Server Islands liegen im Speicher des Server-Prozesses (Astro Route Cache).
  - Ein Treffer kostet keine DB-Abfrage.
  - Regeln und Laufzeiten: `src/server/cache-policy.ts`. Alles „heute“-Abhängige läuft um Mitternacht ab.
  - Invalidiert wird gezielt nach dem Sync und bei Bewertungen.
  - Nach einem Neustart ist der Cache leer, der Pre-Warm füllt ihn wieder.
- **Browser:** Der Browser fragt HTML immer neu an (`max-age=0, must-revalidate`). Assets unter `/_astro/` und Bilder unter `/img/` sind `immutable`.

### Bilder

Gerichtsbilder werden beim Sync einmal von meine-mensa.de geladen und als AVIF/WebP (400 und 800 px) in `IMAGE_DIR` abgelegt (Default `./data/img`, in Produktion ein persistentes Volume). Ausgeliefert werden sie unter `/img/…` mit einjährigem Browser-Cache. Solange es für ein Bild keine Varianten gibt, zeigt die Seite das Original.

Der Sync deckt heute bis +7 Tage ab. Für ältere Gerichte (z. B. nach dem Umzug oder dem Verlust des Volumes) einmalig vor dem Serverstart:

```bash
IMAGE_DIR=/data/img bun scripts/images/backfill.ts   # optional: --since 2026-01-01
```

### Umgebungsvariablen

Vorlage: `.env.example`. Bun lädt `.env` automatisch, `start:node` ebenfalls (`--env-file-if-exists`).

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `DATABASE_URL` | ja | PostgreSQL |
| `API_BEARER_TOKEN` | ja | Schutz für `/api/sync`; ohne Token startet kein Cron |
| `MEINE_MENSA_API_URL` | ja | Basis-URL der Speiseplan-API (meine-mensa.de), privat; ohne sie schlägt der Sync fehl |
| `JWT_SECRET`, `JWT_ALGORITHM` | ja | Signatur des Nutzer-Cookies |
| `IMAGE_DIR` | empfohlen | Bildvarianten, persistentes Volume |
| `ASTRO_KEY` | empfohlen, **beim Build** | Schlüssel für Server-Island-Props (`bunx astro create-key`). Ohne ihn erzeugt jeder Build einen neuen; offene Tabs können nach einem Deploy die Angebotshistorie dann nicht nachladen |
| `HOST`, `PORT` | nein | Default `0.0.0.0:4321` (Next lief auf 3000: `PORT=3000` setzen, dann bleibt der Proxy gleich) |
| `SITE_HOST` | nein | Default `speisly.de`: einheitlicher Host für den Seiten-Cache, damit Pre-Warm und Besucher dieselben Einträge treffen |
| `PUBLIC_COOKIE_CONSENT_NAME` | nein | **muss** dem bisherigen `NEXT_PUBLIC_COOKIE_CONSENT_NAME` entsprechen, sonst ist der Cookie-Consent aller Nutzer weg |
| `PUBLIC_PRIVACY_POLICY_PATH`, `PUBLIC_UMAMI_WEBSITE_ID` | nein | |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | nein | Fehler- und Kontaktnachrichten per Telegram |
| `CRON_DISABLED` | nein | `1` = kein Cron, kein Pre-Warm |

### Deployment (Umstieg von der Next-Version)

Ausführliche Schritt-für-Schritt-Anleitung mit allen Änderungen an `.env`, Datenbank, Startbefehl und Proxy: [`migrate-to-astro.md`](migrate-to-astro.md). Kurzfassung:

1. `.env` anpassen:
   - `NEXT_PUBLIC_*` wird zu `PUBLIC_*` (gleiche Werte, vor allem `PUBLIC_COOKIE_CONSENT_NAME`).
   - `NEXT_PUBLIC_URL` entfällt.
   - `IMAGE_DIR` und `ASTRO_KEY` setzen.
2. `bun install && bun db:migrate`. Die Migration `0005` legt zwei Indizes an.
3. `bun run build`. Der Build liest `.env`: `ASTRO_KEY` und die `PUBLIC_*`-Werte werden dabei fest eingebaut. Ändern sie sich, ist ein neuer Build nötig.
4. Einmalig: `bun scripts/images/backfill.ts` (lädt alle Gerichtsbilder, dauert einige Minuten).
5. `bun run start` statt bisher `bun --bun src/_boot.ts`. Ein Reverse Proxy kann davor bleiben, Komprimierung übernimmt der Server.
6. Prüfen: `curl -sI https://speisly.de/ -H 'Accept-Encoding: br'` zeigt `content-encoding: br` und nach dem zweiten Aufruf `x-astro-cache: HIT`.
   - Optional gegen eine Staging-Instanz mit Seed-Daten: `API_BEARER_TOKEN=… bun scripts/e2e/smoke.ts --base https://staging…`. Der Test schreibt Testdaten, also **nicht gegen Produktion** laufen lassen.

## Beitragen

Wir freuen uns über Beiträge! Speisly ist ein Open-Source-Projekt für die Studierendenschaft der MLU Halle.

### Wie du beitragen kannst

1. **Issues melden** – Fehler oder Verbesserungsvorschläge als Issue erstellen
2. **Pull Requests** – Features oder Bugfixes implementieren
3. **Feedback geben** – Über die Feedback-Funktion in der App

### Entwicklungsworkflow

1. Fork das Repository
2. Erstelle einen Feature-Branch (`git checkout -b feature/AmazingFeature`)
3. Committe deine Änderungen (`git commit -m 'Add some AmazingFeature'`)
4. Push zum Branch (`git push origin feature/AmazingFeature`)
5. Öffne einen Pull Request

## Scripts

- `bun dev` – Startet den Development Server
- `bun run build` – Erstellt einen Production Build
- `bun run start` – Startet den Production Server (Bun; `start:node` für Node)
- `bun run check` – Typecheck (`astro check`)
- `bun run test` – Tests (Integrationstests brauchen `DATABASE_URL` + Seed-Daten)
- `bun scripts/e2e/smoke.ts` – End-to-End-Smoke-Test gegen einen laufenden Server
- `bun scripts/perf/measure.ts` – Performance-Messung (siehe `docs/perf-baseline.md`)
- `bun lint` – Führt Biome Linting aus
- `bun format` – Formatiert Code mit Biome
- `bun db:generate` – Generiert Drizzle-Migrationen
- `bun db:migrate` – Führt Datenbank-Migrationen aus
- `bun db:push` – Pusht Schema-Änderungen zur Datenbank

## Lizenz

Dieses Projekt ist Open Source. Weitere Informationen zur Lizenz findest du in der `LICENSE` Datei.

## Links

- **Live-Version**: [speisly.de](https://speisly.de)
- **API-Dokumentation**: [meine-mensa.de/api](https://meine-mensa.de/api)

## Kontakt

Bei Fragen oder Anregungen kannst du uns über die Kontaktseite in der App erreichen oder ein Issue im Repository erstellen.

---

**Entwickelt für die Studierendenschaft der MLU Halle**
