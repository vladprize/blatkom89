# syntax=docker/dockerfile:1.7
# БЛАТКОМ ’89 — single image: bundled API/game server + built web client.
# Build from the repository root:  docker build -f infra/docker/Dockerfile -t blatkom89 .

# ── build ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /src
# Playwright is a dev dependency for browser tests only — never download browsers into the image.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    npm_config_fund=false \
    npm_config_audit=false
COPY package.json package-lock.json* ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# Reproducible install when a lockfile is committed; otherwise resolve from package.json ranges.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
# Generated sprites/tiles are committed (apps/web/public/assets); `npm run assets` regenerates them.
RUN npm run typecheck \
 && node apps/web/build.mjs --mode=production \
 && node apps/server/build.mjs

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    STATIC_DIR=/app/web
WORKDIR /app
# The server bundle contains its dependencies (postgres, ws, zod): no node_modules at runtime.
COPY --from=build --chown=node:node /src/apps/server/dist ./server
COPY --from=build --chown=node:node /src/apps/web/dist ./web
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrations run automatically on start (advisory-locked). CLIs: node server/db-cli.js status|migrate,
# node server/admin-cli.js create
CMD ["node", "server/server.js"]
