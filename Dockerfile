# syntax=docker/dockerfile:1
#
# Produktions-Image (gebaut in GitHub Actions, .github/workflows/ci.yml).
# Der Build braucht keine Umgebungsvariablen: Alle Einstellungen liest der
# Server erst beim Start (env-schema.mjs). Einzige Ausnahme ist ASTRO_KEY,
# den Astro in den Build einbaut; er kommt als Build-Secret herein, damit er
# nicht in der Image-Historie steht.
#
#   docker build --secret id=astro_key,env=ASTRO_KEY -t speisly .

ARG BUN_VERSION=1.4.4

FROM oven/bun:${BUN_VERSION}-slim AS base
WORKDIR /app

# Abhängigkeiten zuerst: Die Layer bleiben im Cache, solange sich bun.lock
# nicht ändert, Codeänderungen installieren nichts neu
FROM base AS deps
COPY package.json bun.lock bunfig.toml ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM base AS prod-deps
COPY package.json bun.lock bunfig.toml ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

FROM deps AS build
COPY . .
# --bun: Astros CLI mit Bun ausführen (das Image hat kein Node)
RUN --mount=type=secret,id=astro_key,env=ASTRO_KEY \
    bun --bun run build

FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    IMAGE_DIR=/data/img
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json env-schema.mjs ./
COPY server ./server
COPY drizzle ./drizzle
# Bild-Backfill für ein neues/leeres Volume: `bun scripts/images/backfill.ts`
COPY scripts/images ./scripts/images
COPY src/server/images/store.ts ./src/server/images/store.ts
# Bildvarianten liegen auf einem Volume; der Ordner gehört dem Nutzer `bun`,
# damit ein neues Volume beim ersten Einhängen diese Rechte übernimmt
RUN mkdir -p /data/img && chown bun:bun /data/img
USER bun
EXPOSE 4321
VOLUME ["/data/img"]
# Swarm (Dokploy-Stack) leitet erst auf den neuen Container um, wenn er gesund
# ist; die Migration läuft vor dem Server, also zählt die Startphase großzügig
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4321)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# Migration, dann Server (package.json). Schlägt die Migration fehl, beendet
# sich der Container, und die alte Version bleibt online (Rollback)
CMD ["bun", "run", "start"]
