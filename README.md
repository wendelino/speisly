# Speisly

**Speisly** ist eine Open-Source-Webanwendung für Studierende der Martin-Luther-Universität Halle-Wittenberg (MLU Halle), die aktuelle Speisepläne der Universitätsmensen übersichtlich und benutzerfreundlich präsentiert.

## 🎯 Über das Projekt

Speisly wurde entwickelt, um Studierenden der MLU Halle einen einfachen und schnellen Zugang zu den aktuellen Speiseplänen der Mensen zu ermöglichen. Die Anwendung bietet eine moderne, responsive Benutzeroberfläche und kann als Progressive Web App (PWA) installiert werden.

## ✨ Features

- 📅 **Aktuelle Speisepläne** – Zeigt die Speisepläne aller MLU Halle Mensen
- 🔍 **Filterung** – Filterung nach Mensen, Tagen und Ernährungspräferenzen (vegetarisch, vegan)
- 📱 **Responsive Design** – Optimiert für Desktop, Tablet und Smartphone
- 🎨 **Moderne UI** – Intuitive Benutzeroberfläche mit Tailwind CSS
- 📊 **Detaillierte Informationen** – Vollständige Angaben zu Gerichten, Zutaten und Preisen
- ⭐ **Bewertungen** – Möglichkeit, Gerichte zu bewerten
- 💾 **Persistente Einstellungen** – Speicherung von Filterpräferenzen im Browser
- 🔔 **PWA** – Installierbar als Progressive Web App

## 🛠️ Tech Stack

- **[Astro 7](https://astro.build)** – Web-Framework (Migration von Next.js läuft, siehe [`docs/astro-migration-plan.md`](docs/astro-migration-plan.md))
- **[TypeScript](https://www.typescriptlang.org/)** – Typsichere Entwicklung
- **[React 19](https://react.dev/)** – für interaktive Islands
- **[Tailwind CSS](https://tailwindcss.com/)** – Utility-first CSS Framework
- **[Drizzle ORM](https://orm.drizzle.team/)** – TypeScript ORM für Datenbankzugriffe
- **[PostgreSQL](https://www.postgresql.org/)** – Datenbank
- **[Bun](https://bun.sh/)** – Package Manager und Runtime
- **[Biome](https://biomejs.dev/)** – Linter und Formatter

## 📋 Voraussetzungen

- **Node.js** >= 22.12.0
- **Bun** – Package Manager und Runtime
- **PostgreSQL** Datenbank (für Produktion)

## 🚀 Installation & Setup

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

## 📁 Projektstruktur

```
speisly-app/
├── src/
│   ├── actions/           # Server Actions
│   ├── app/               # Next.js App Router Seiten
│   ├── components/        # React-Komponenten
│   ├── contexts/          # React Contexts
│   ├── dal/               # Data Access Layer für externe APIs
│   │   ├── index.ts       # Haupt-Export
│   │   ├── meine-mensa.ts # Integration mit meine-mensa.de API
│   │   └── types.ts       # TypeScript-Typen
│   ├── lib/               # Utility-Funktionen und Konfiguration
│   │   ├── db/            # Datenbank-Konfiguration und Schema
│   │   ├── cookie/        # Cookie-Consent Management
│   │   └── telegram/      # Telegram-Integration
│   └── lnio/              # Shared Components & Hooks
├── drizzle/               # Datenbank-Migrationen
├── public/                # Statische Assets
└── _boot.ts               # Production Server mit Cron-Jobs
```

## 🔌 Datensync (`src/server/sync`)

Der Sync in `src/server/sync` kapselt die Kommunikation mit externen APIs. Aktuell wird die API von [meine-mensa.de](https://meine-mensa.de) verwendet, um Speiseplandaten abzurufen.

### Verwendung

```typescript
import getMealData from "@/server/sync/meine-mensa";

const { data } = await getMealData({
  date: { from: "2025-01-01", to: "2025-01-31" },
  locationId: "1", // Optional
});
```

Die API liefert strukturierte Daten zu:
- Gerichten mit Namen, Preisen und Zutaten
- Verfügbarkeiten nach Datum, Location und Counter
- Zusatzinformationen (Extras, Bilder, etc.)

## 🏗️ Build & Deployment

### Production Build

```bash
bun build
```

### Production Server starten

```bash
bun run start
```

Startet den Standalone-Server von `@astrojs/node` (Port über `PORT`, Default 4321). Hinweis: Während der Migration enthält dieser Branch **noch keine Cron-Jobs** für die Datensynchronisation (bisher `src/_boot.ts`). Sie kommen in Phase 9 des Migrationsplans zurück. Bis dahin lässt sich der Sync manuell auslösen:

```bash
curl -X POST -H "Authorization: Bearer $API_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "http://localhost:4321/api/sync?scope=week"   # today | week | midnight
```

Seiten werden im Speicher des Servers gecacht (Route Cache) und nach dem Sync gezielt invalidiert, siehe `src/server/cache-policy.ts`.

## 🤝 Beitragen

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

## 📝 Scripts

- `bun dev` – Startet den Development Server
- `bun run build` – Erstellt einen Production Build
- `bun run start` – Startet den Production Server (Bun; `start:node` für Node)
- `bun run check` – Typecheck (`astro check`)
- `bun run test` – Tests (Integrationstests brauchen `DATABASE_URL` + Seed-Daten)
- `bun lint` – Führt Biome Linting aus
- `bun format` – Formatiert Code mit Biome
- `bun db:generate` – Generiert Drizzle-Migrationen
- `bun db:migrate` – Führt Datenbank-Migrationen aus
- `bun db:push` – Pusht Schema-Änderungen zur Datenbank

## 📄 Lizenz

Dieses Projekt ist Open Source. Weitere Informationen zur Lizenz findest du in der `LICENSE` Datei.

## 🔗 Links

- **Live-Version**: [speisly.de](https://speisly.de)
- **API-Dokumentation**: [meine-mensa.de/api](https://meine-mensa.de/api)

## 📧 Kontakt

Bei Fragen oder Anregungen kannst du uns über die Kontaktseite in der App erreichen oder ein Issue im Repository erstellen.

---

**Entwickelt mit ❤️ für die Studierendenschaft der MLU Halle**
