# Umstieg von `main` (Next.js) auf `astro`

Schritt-für-Schritt-Anleitung für den Produktionsserver. Alles, was sich an Umgebungsvariablen, Datenbank, Startbefehl und Proxy ändert, steht hier.

**Kurzfassung:**
1. `.env` anpassen: 2 Variablen umbenennen, 1 entfernen, 2–3 neu.
2. Zwei Datenbank-Indizes anlegen.
3. Bauen.
4. Bilder einmalig vorbereiten.
5. `bun run start` wie bisher. Hinter dem Befehl steckt jetzt ein anderes Skript.

Ein Rollback auf `main` ist jederzeit möglich (siehe Schritt 10).

---

## 0. Was sich grundsätzlich ändert

| | `main` (Next.js) | `astro` |
|---|---|---|
| Start | `bun run start` → `bun --bun src/_boot.ts` | `bun run start` → `bun ./server/index.mjs` |
| Standard-Port | 3000 | **4321** (über `PORT` wählbar) |
| Cron für den Sync | ruft die **öffentliche** URL auf (`NEXT_PUBLIC_URL`) | ruft den Server **intern** auf (`127.0.0.1`), keine URL nötig |
| `/api/sync` | `GET`, `?refresh=true` = heute | **`POST`**, `?scope=today\|week\|midnight\|warm` |
| `/api/revalidate` | Mitternachts-Revalidierung | **entfällt** (jetzt `scope=midnight`) |
| Komprimierung | Next (gzip) | der Server selbst (Brotli/gzip) |
| Gerichtsbilder | `next/image` rechnet bei jedem neuen Request | einmalig beim Sync, abgelegt in `IMAGE_DIR` |
| Cache | Next-Datencache | Seiten-Cache im Speicher des Servers, nach jedem Neustart leer und automatisch vorgewärmt |

Unverändert:
- **Cookies:** Nutzer-ID `speisly_user_id`, Filter `speisly_mensa_preferences`, `speisly_veggie_filter`, `speisly_vegan_filter`, Consent-Cookie mit dem Namen aus der Env. Nutzer behalten ihre Filter, ihre Zustimmung und ihre Bewertungen, solange `JWT_SECRET` und der Consent-Cookie-Name gleich bleiben.
- **Datenbankschema:** nur zwei neue Indizes.
- **Telegram, Umami:** wie bisher.

---

## 1. Vorbereitung

- [ ] **Backup der Datenbank** (z. B. `pg_dump`). Die Migration ändert nur Indizes, sicher ist sicher.
- [ ] **Bun ≥ 1.3** auf dem Server (`bun --version`). Nur falls du statt Bun mit Node starten willst: **Node ≥ 22.12**.
- [ ] **Platz für Bilder:** ein Verzeichnis, das Deploys und Neustarts überlebt (z. B. `/var/lib/speisly/img` oder ein Docker-Volume). Rechne mit ~40–60 KB pro Gericht mit Bild, bei ~1 500 Gerichten unter 100 MB.

---

## 2. Umgebungsvariablen (`.env`)

Bearbeite dieselbe Datei wie bisher. Diese Dateien werden automatisch geladen:
- **Beim Start mit Bun:** `.env`, `.env.local` und bei `NODE_ENV=production` auch `.env.production`.
- **Beim Build (`astro build`):** `.env`, `.env.local`, `.env.production`, `.env.production.local`.

### 2.1 Was mit jeder bisherigen Variable passiert

| Variable auf `main` | Aktion | Neu |
|---|---|---|
| `DATABASE_URL` | **unverändert** lassen | `DATABASE_URL` |
| `JWT_SECRET` | **unverändert** lassen, **nicht** neu erzeugen. Sonst verlieren alle Nutzer ihre Identität und damit die Zuordnung ihrer Bewertungen | `JWT_SECRET` |
| `JWT_ALGORITHM` | unverändert (Default `HS256`) | `JWT_ALGORITHM` |
| `API_BEARER_TOKEN` | unverändert. Ohne Token starten **kein Cron und kein Vorwärmen** | `API_BEARER_TOKEN` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | unverändert | gleich |
| `NEXT_PUBLIC_COOKIE_CONSENT_NAME` | **umbenennen, Wert exakt übernehmen**. Ein anderer Wert = alle Nutzer müssen dem Cookie-Banner neu zustimmen | `PUBLIC_COOKIE_CONSENT_NAME` |
| `NEXT_PUBLIC_PRIVACY_POLICY_PATH` | **umbenennen**, Wert übernehmen (Default `/datenschutz`) | `PUBLIC_PRIVACY_POLICY_PATH` |
| `NEXT_PUBLIC_URL` | **löschen**. Der Cron ruft den Server jetzt intern auf | – |
| `PORT` | behalten. **War `PORT` bisher nicht gesetzt (Next-Default 3000), setze `PORT=3000`**, dann muss am Reverse Proxy nichts geändert werden | `PORT` |
| `NODE_ENV` | wird nicht mehr gebraucht (`astro build` baut immer für Produktion), kann bleiben | – |

### 2.2 Neue Variablen

| Variable | Pflicht? | Wert | Wofür |
|---|---|---|---|
| `MEINE_MENSA_API_URL` | **ja** | Basis-URL der Speiseplan-API (bisher fest im Code, jetzt privat in der `.env`) | Daten-Sync. Fehlt sie, schlägt jeder Sync fehl |
| `IMAGE_DIR` | **empfohlen** | absoluter Pfad auf dem dauerhaften Verzeichnis aus Schritt 1, z. B. `/var/lib/speisly/img` | Bildvarianten. Default `./data/img` im Projektordner, das überlebt aber kein frisches Deploy |
| `ASTRO_KEY` | empfohlen | einmal erzeugen mit `bunx astro create-key`, dann **fest** in der `.env` lassen | Schlüssel für die Server Island (Angebotshistorie). Wird **beim Build** gelesen. Ohne festen Schlüssel erzeugt jeder Build einen neuen, und Tabs, die vor einem Deploy geöffnet wurden, können die Angebotshistorie nicht mehr nachladen |
| `HOST` | nein | Default `0.0.0.0` | Adresse, auf der der Server lauscht. Mit `127.0.0.1` ist er nur noch für den Proxy auf derselben Maschine erreichbar |
| `SITE_HOST` | nein | Default `speisly.de` | einheitlicher Host für den Seiten-Cache, nur bei einer anderen Domain ändern (z. B. Staging) |
| `CRON_DISABLED` | nein | `1` | schaltet Cron und Vorwärmen ab, nur für eine zweite Instanz oder Staging ohne Sync |
| `PUBLIC_UMAMI_WEBSITE_ID` | nein | Default = die bisher fest eingebaute ID `d6c44311-0001-4b07-a1c0-75bee4883fb1` | Umami-Statistik |

### 2.3 Beispiel: fertige `.env`

```dotenv
# unverändert
DATABASE_URL=postgresql://…
JWT_SECRET=…                     # NICHT ändern
JWT_ALGORITHM=HS256
API_BEARER_TOKEN=…
TELEGRAM_BOT_TOKEN=…
TELEGRAM_CHAT_ID=…

# umbenannt (NEXT_PUBLIC_ → PUBLIC_), Werte exakt wie bisher
PUBLIC_COOKIE_CONSENT_NAME=speisly-cookie-consent
PUBLIC_PRIVACY_POLICY_PATH=/datenschutz

# Server
PORT=3000                        # oder der bisherige Wert, sonst Default 4321
HOST=0.0.0.0

# neu
MEINE_MENSA_API_URL=…            # Basis-URL der Speiseplan-API
IMAGE_DIR=/var/lib/speisly/img
ASTRO_KEY=…                      # bunx astro create-key, einmalig

# entfernt: NEXT_PUBLIC_URL, NEXT_PUBLIC_COOKIE_CONSENT_NAME, NEXT_PUBLIC_PRIVACY_POLICY_PATH
```

> **Wichtig:** `PUBLIC_*` und `ASTRO_KEY` werden **beim Build** fest eingebaut. Ändern sie sich später, muss neu gebaut werden (`bun run build`). Alle anderen Variablen gelten ab dem nächsten Neustart.

---

## 3. Datenbank: zwei neue Indizes

Die Migration `drizzle/0005_lean_namorita.sql` legt zwei Indizes an:
- **`mensa_meal_meal_id_date_idx`:** für die Detailseite und die Angebotshistorie;
- **`user_ip_hash_idx`:** für Bewertungen.

Es werden keine Tabellen oder Spalten geändert.

**Variante A: ihr nutzt Drizzle-Migrationen** (es gibt die Tabelle `drizzle.__drizzle_migrations`):

```bash
psql "$DATABASE_URL" -c "select count(*) from drizzle.__drizzle_migrations"   # sollte 5 ergeben (0000–0004)
bun db:migrate
```

**Variante B: ihr habt bisher mit `db:push` gearbeitet** (die Tabelle oben existiert nicht) oder wollt sicher ohne Sperren:

```bash
psql "$DATABASE_URL" <<'SQL'
CREATE INDEX CONCURRENTLY IF NOT EXISTS "mensa_meal_meal_id_date_idx" ON "mensa_meal" USING btree ("meal_id","date");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_ip_hash_idx" ON "user" USING btree ("ip_hash");
SQL
```

Beides darf passieren, während die alte Next-Version noch läuft. Die Next-Version kommt mit den Indizes problemlos zurecht.

---

## 4. Code holen und bauen

```bash
git fetch origin
git checkout astro            # bzw. main, nachdem der PR gemergt ist
git pull

bun install                   # inkl. devDependencies, die braucht der Build
bun run build                 # liest .env (PUBLIC_*, ASTRO_KEY); erzeugt dist/
```

Der Build braucht **keine** Datenbank und keine Secrets. Du kannst also bauen, während die alte Version noch läuft. `bun run build` schreibt nur nach `dist/`, die laufende Next-Version (`.next/`) bleibt davon unberührt. `.next/` kannst du löschen, sobald die neue Version stabil läuft.

---

## 5. Bilder einmalig vorbereiten

Der laufende Sync erzeugt Bildvarianten nur für heute bis +7 Tage. Für alle älteren Gerichte einmal vor dem Umschalten:

```bash
mkdir -p /var/lib/speisly/img          # = IMAGE_DIR
bun scripts/images/backfill.ts         # liest DATABASE_URL und IMAGE_DIR aus der .env
```

- Das lädt jedes Gerichtsbild **einmal** von meine-mensa.de, der Server braucht also ausgehenden Zugriff auf `https://meine-mensa.de/mediathek/` (wie bisher für `next/image`). Je nach Anzahl dauert das einige Minuten (~0,2 s pro Bild plus Download).
- Abbrechen und erneut starten ist kein Problem, vorhandene Varianten werden übersprungen.
- Das Skript schreibt nur Dateien, nichts in die Datenbank, und kann parallel zur alten Version laufen.
- Fehlt für ein Bild die Variante, zeigt die Seite einfach das Original von meine-mensa.de, es geht also nichts kaputt.

---

## 6. Startbefehl umstellen

- **`systemd`, `pm2` o. Ä. ruft `bun run start` auf:** nichts ändern, das Skript zeigt jetzt auf `server/index.mjs`.
- **Der Dienst ruft `bun --bun src/_boot.ts` direkt auf:** ersetzen durch

  ```bash
  bun ./server/index.mjs
  ```

  `src/_boot.ts` gibt es nicht mehr.
- **Mit Node statt Bun:** `bun run start:node`, das ist `node --env-file-if-exists=.env ./server/index.mjs`. Unter Node wird **nur `.env`** geladen, nicht `.env.local`/`.env.production`.

Beispiel `systemd`:

```ini
[Service]
WorkingDirectory=/srv/speisly
ExecStart=/usr/local/bin/bun run start
Restart=always
# beim Stoppen bekommen laufende Requests bis zu 10 s
KillSignal=SIGTERM
TimeoutStopSec=15
```

Alte Version stoppen, neue starten. Im Log sollte dann Folgendes stehen:

```
[server] listening on http://0.0.0.0:3000
[cron] today    "17 7,10,17 * * 1-5" → nächster Lauf …
[cron] week     "17 2 * * 0-4" → nächster Lauf …
[cron] midnight "1 0 * * *" → nächster Lauf …
[cron] warm: …
[prewarm] / 200 MISS, /day/… 200 MISS, …
```

Fehlt die `[cron]`-Zeile und steht dort `API_BEARER_TOKEN fehlt`, ist die `.env` nicht geladen. Prüfe dann `WorkingDirectory`.

---

## 7. Reverse Proxy (nginx, Caddy, Traefik …)

- **Port:** auf `PORT` zeigen lassen. Mit `PORT=3000` bleibt die Proxy-Konfiguration wie sie ist.
- **`X-Forwarded-For`** muss weiter durchgereicht werden (wie bisher). Daraus wird der IP-Hash für Bewertungen gebildet. nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, Caddy macht das automatisch.
- **Host-Header:** egal, der Server vereinheitlicht ihn selbst (`SITE_HOST`).
- **Komprimierung:** Der Server liefert schon Brotli/gzip aus. Falls der Proxy selbst komprimiert, schadet das nicht, verschwendet aber CPU (nginx: `gzip off;` für diesen Upstream, Caddy: `encode` weglassen).
- **Caching im Proxy:** nicht nötig. HTML kommt mit `max-age=0, must-revalidate`, damit neue Bewertungen sofort sichtbar sind. `/_astro/*` und `/img/*` kommen mit `immutable`.
- **Optional:** Der Proxy kann `/img/` direkt aus `IMAGE_DIR` ausliefern (z. B. nginx `location /img/ { alias /var/lib/speisly/img/; expires 1y; }`). Nötig ist das nicht.

---

## 8. Externe Aufrufe der API (falls vorhanden)

Der eingebaute Cron ersetzt den bisherigen in `_boot.ts`. **Falls** irgendein anderer Dienst die API aufruft (externer Cron, GitHub Action, Uptime-Check …), muss er angepasst werden:

| bisher | jetzt |
|---|---|
| `GET /api/sync?refresh=true` | `POST /api/sync?scope=today` |
| `GET /api/sync` | `POST /api/sync?scope=week` |
| `POST /api/revalidate` | `POST /api/sync?scope=midnight` |

Jeweils mit `Authorization: Bearer <API_BEARER_TOKEN>` **und `Content-Type: application/json`**, sonst lehnt Astros CSRF-Schutz den POST mit 403 ab:

```bash
curl -X POST -H "Authorization: Bearer $API_BEARER_TOKEN" -H "Content-Type: application/json" \
  "https://speisly.de/api/sync?scope=week"
```

Für Health-Checks gibt es `GET /api/health`.

---

## 9. Nach dem Umschalten prüfen

```bash
# Seite kommt komprimiert und beim zweiten Aufruf aus dem Cache
curl -sI -H 'Accept-Encoding: br' https://speisly.de/ | grep -iE 'content-encoding|x-astro-cache'
#   content-encoding: br
#   x-astro-cache: HIT        (nach dem Vorwärmen schon beim ersten Mal)

# einmal manuell synchronisieren und die Antwort ansehen
curl -s -X POST -H "Authorization: Bearer $API_BEARER_TOKEN" -H "Content-Type: application/json" \
  "http://127.0.0.1:${PORT:-4321}/api/sync?scope=week"
#   {"scope":"week","changedDates":[…],"changedMealIds":[…],"images":{"created":…,"failed":0},…}

ls "$IMAGE_DIR" | wc -l    # Bildvarianten (4 Dateien pro Bild)
```

Im Browser:
- **Startseite:** Filter, Tageswahl und Kalender funktionieren.
- **Gericht öffnen:** Die Angebotshistorie lädt nach.
- **Bewerten:** Die Bewertung ist sofort in der Übersicht und bleibt nach einem Reload sichtbar.
- **Bestehende Daten:** Filter und Cookie-Zustimmung aus der alten Version sind noch da.

**Neues Verhalten beim Sync**, damit du dich über Telegram-Meldungen nicht wunderst:
- **Was der Sync entfernt:** Gerichte, die die API nicht mehr liefert, nur an Tagen, für die die API überhaupt Einträge hat, und nie, wenn sie bewertet wurden.
- **Notbremse:** Würde ein Sync mehr als die Hälfte der Ausgaben im Zeitraum entfernen (mindestens 20), entfernt er **nichts** und schickt eine Telegram-Nachricht „Notbremse …“. Prüfe dann meine-mensa.de. Ist die Löschung gewollt: `POST /api/sync?scope=week&force=1`.

---

## 10. Rollback

Die Datenbankänderungen (zwei Indizes) sind mit `main` kompatibel, die Cookies auch.

```bash
# neue Version stoppen
git checkout main
bun install
bun run build                # erzeugt wieder .next/
# .env: NEXT_PUBLIC_COOKIE_CONSENT_NAME, NEXT_PUBLIC_PRIVACY_POLICY_PATH, NEXT_PUBLIC_URL wieder eintragen
# Startbefehl wieder auf `bun run start` (main) bzw. `bun --bun src/_boot.ts`
```

Tipp: Für den Umstieg einfach beide Variablennamen in die `.env` schreiben (`NEXT_PUBLIC_…` **und** `PUBLIC_…`, plus `NEXT_PUBLIC_URL`). Jede Version liest nur ihre eigenen, dann ist ein Rollback ohne `.env`-Änderung möglich. Nach ein paar Tagen ohne Probleme die alten Namen löschen.

---

## Checkliste

- [ ] DB-Backup
- [ ] `.env`: `NEXT_PUBLIC_COOKIE_CONSENT_NAME` → `PUBLIC_COOKIE_CONSENT_NAME` (gleicher Wert)
- [ ] `.env`: `NEXT_PUBLIC_PRIVACY_POLICY_PATH` → `PUBLIC_PRIVACY_POLICY_PATH`
- [ ] `.env`: `NEXT_PUBLIC_URL` entfernen
- [ ] `.env`: `PORT` gesetzt (bisheriger Port, sonst 4321 und Proxy anpassen)
- [ ] `.env`: `IMAGE_DIR` auf dauerhaftes Verzeichnis, Verzeichnis angelegt
- [ ] `.env`: `ASTRO_KEY` einmalig erzeugt und eingetragen
- [ ] `JWT_SECRET` und `API_BEARER_TOKEN` unverändert
- [ ] Indizes angelegt (`bun db:migrate` oder SQL aus Schritt 3)
- [ ] `bun install && bun run build`
- [ ] `bun scripts/images/backfill.ts`
- [ ] Startbefehl: `bun run start` bzw. `bun ./server/index.mjs`
- [ ] Log zeigt `[cron]`- und `[prewarm]`-Zeilen
- [ ] Externe Aufrufer von `/api/sync`/`/api/revalidate` umgestellt (falls vorhanden)
- [ ] Proxy: Port stimmt, `X-Forwarded-For` wird gesetzt, Proxy-Komprimierung optional aus
- [ ] Prüfungen aus Schritt 9
