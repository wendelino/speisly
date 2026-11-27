# Roadmap

Geplante Änderungen in dieser Reihenfolge. Jeder Schritt bekommt einen eigenen Branch und einen eigenen PR.

## 1a – Konfiguration nur über Umgebungsvariablen

- [x] Hartcodierte URLs/Domains raus: Umami (Script-URL, Website-ID, `data-domains`), OIDC-Issuer, Bildquelle (`IMAGE_SOURCE_URL`), Allergen-Link (`ALLERGEN_INFO_URL`)
- [x] Alles wird zur Laufzeit gelesen, nichts beim Build (ein Image für Produktion und Preview): kein `site`/`SITE_URL` beim Build, keine `PUBLIC_*`-Werte im Bundle, kein Prerendering von HTML-Seiten (stattdessen Route Cache)
- [x] Gemeinsames Schema `env-schema.mjs`; `server/index.mjs` prüft beim Start, fehlende Pflichtwerte = Exit-Code 1
- [x] Optionale Dienste (Umami, Telegram, Web-Push, Admin-Login) ohne Werte abgeschaltet, App läuft trotzdem
- [x] README und `.env.example` nur mit Platzhaltern
- Nicht angefasst: Scripts (`scripts/perf`, `scripts/e2e`) und Testfixtures
- Einzige Build-Angabe: `ASTRO_KEY` (Astro baut den Schlüssel für Server-Island-Props fest in den Build ein)

## 1b – Image in GitHub Actions bauen, Deploy per Docker Compose

- [ ] `Dockerfile` (Multi-Stage, Bun, Layer-Cache für `bun.lock`, Nicht-Root-Nutzer, Healthcheck `/api/health`, Start = Migration + Server) und `.dockerignore`
- [ ] Workflow: bei PRs `biome check` + `astro check`; bei Push auf `main` dieselben Checks, dann Build (linux/amd64), Push nach GHCR (privat, Tags: Commit-SHA + `latest`), danach Dokploy-Deploy-Webhook
- [ ] `docker-compose.yml`: nur die App + Volume für `IMAGE_DIR`, externes Netzwerk `dokploy-network` (Postgres bleibt separat), Env aus Dokploy
- [ ] Prüfen: Zero-Downtime und Rollback bei fehlgeschlagener Migration (heute: Swarm `start-first` + Rollback). Optionen: Dokploy-Stack-Modus mit `deploy.update_config` oder anders absichern
- [ ] Server: Pull-Token `read:packages` in Dokploy; GitHub-Secrets: Webhook-URL, `ASTRO_KEY`
- [ ] Rollback dokumentieren (Image-Tag auf alten SHA)

## 1c – Tech-Stack prüfen (Performance)

- [ ] Ist-Stand messen (auf dem Image aus 1b): Erstaufruf mobil (TTFB/LCP, gedrosselt, ohne Cache) und wiederkehrende Besuche (Seitenwechsel, Service Worker, Browser-Cache)
- [ ] Prüfen: Route Cache im Prozess (leer nach Deploy, wie lange bis wieder warm?), Komprimierung/HTTP-Caching hinter Traefik, Bundle/HTML-Größe, Fonts, Bilder, Service-Worker-Strategie
- [ ] Bericht mit Zahlen und Vergleich zu Alternativen; Wechsel nur bei deutlich messbarem Gewinn
- Vorgabe: keine zusätzlichen Dienste (ein Container + Postgres)

## 2 – Rechtstexte und Moderation

- [ ] Impressum `/impressum` + Footer-Link (§ 5 DDG / § 18 MStV): Privatperson, c/o-Anschrift, E-Mail + Kontaktformular, Angaben per Env (Pflicht). **Vorher den c/o-Anschriftservice buchen**, sonst startet die App nach dem Deploy nicht
- [ ] Datenschutzerklärung überarbeiten: echter Verantwortlicher mit Kontaktdaten (Art. 13), Hoster netcup + Server-Logs, Kontakt-/Feedbackformular, Umami (fehlt bisher ganz), Web-Push mit Drittlandtransfer (Google/Apple, EU-US Data Privacy Framework), Telegram, OIDC, Aufsichtsbehörde Sachsen-Anhalt, OpenAI vormerken. Mit der Live-Seite abgleichen
- [ ] IP-Hash: HMAC mit festem geheimem Salt (Env) statt SHA-256 ohne Salt; „Alles bleibt anonym“ und Datenschutztexte auf „pseudonym“ korrigieren
- [ ] Meldefunktion (DSA): „Melden“ am Kommentar mit Grund, gemeldet = sofort ausgeblendet bis zur Prüfung, Admin-Push, Meldungen im Admin oben, Kontaktstelle im Impressum

## 3 – Datenpipeline prüfen (vor Schritt 4)

- [ ] Analyse auf einer DB-Kopie (Verbindung per `DATABASE_URL` zu einer Kopie)
- [ ] Namenswechsel bei gleicher `src_id`: Häufigkeit, Muster, betroffene Bewertungen/Favoriten
- [ ] Fehlerquellen: Sync-Läufe `failed`/`partial`, `error_log`, Telegram- und Admin-Push-Meldungen (Verdacht: Konflikte auf `meal_unique`)
- [ ] Vorschlag für die Identität eines Gerichts, danach Entscheidung über Altdaten (Migration ja/nein), Sync und Tests anpassen

## 4 – Mehrsprachigkeit

- [ ] Englisch zuerst, weitere Sprachen nur ein Config-Eintrag
- [ ] URLs: Deutsch ohne Präfix, `/en/…`; Vorschlag per Browsersprache, `hreflang`, Cache und Pre-Warm je Sprache, Service Worker, OG-Bilder
- [ ] UI-Texte: Wörterbuch-Dateien im Repo (einmal per KI erzeugt)
- [ ] Zutaten/Allergene/Mensen: feste Liste, einmal übersetzt
- [ ] Gerichte: OpenAI im Sync (Batch), Schlüssel = Hash von Name + Untertitel (Rückwechsel kostet nichts), bei Fehler Deutsch + erneuter Versuch beim nächsten Sync; ohne API-Key keine Übersetzung
- [ ] Admin: Übersicht der Übersetzungen, neu anstoßen, kein Editieren
