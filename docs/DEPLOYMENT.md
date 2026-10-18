# Deployment

One container image runs the API, the WebSocket game rooms and the static web client on port 8080.
PostgreSQL stores everything persistent. Caddy terminates HTTPS and proxies HTTP + WebSocket.

> Status: the Dockerfile, `docker-compose.yml`, Caddyfile and backup script were written but could not
> be executed in the build environment (no Docker daemon). The same server bundle, migrations and web
> build *were* run and tested directly with Node 22 + PostgreSQL 16 (see [TESTING.md](TESTING.md)).

## 1. Requirements

* A Linux host with Docker Engine + Compose v2 (or Node.js ≥ 22.12 and PostgreSQL ≥ 14 without Docker).
* A domain whose A/AAAA record points at the host; ports 80 and 443 open (Let's Encrypt via Caddy).
* A Telegram bot (see [TELEGRAM.md](TELEGRAM.md)).

## 2. Configuration (`.env`)

Copy `.env.example` to `.env` and set at least:

| Variable | Notes |
|---|---|
| `DOMAIN` | e.g. `blatkom.example.com` (compose builds `PUBLIC_URL=https://$DOMAIN`) |
| `POSTGRES_PASSWORD` | random, long; used by the `db` service and the app's `DATABASE_URL` |
| `SESSION_SECRET` | ≥ 32 random chars: `openssl rand -base64 48` (rotating it logs everyone out) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_MINIAPP_SHORT_NAME` | from BotFather |
| `ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_PASSWORD` | optional first admin, created on start only when no admin exists — remove after first start (or use the CLI below) |
| `MATCH_DURATION_SEC`, `MATCH_SCORE_LIMIT`, `MATCH_MIN_PLAYERS`, `MATCH_MAX_PLAYERS` | match rules (defaults 240 s, 25, 2, 6) |
| `LOG_LEVEL`, `MAX_ROOMS`, `SESSION_TTL_HOURS`, `TELEGRAM_AUTH_MAX_AGE_SEC` | optional |

The server validates the environment at start and refuses to run in production with
`DEV_AUTH_ENABLED=true`, without `TELEGRAM_BOT_TOKEN`, or with a placeholder-looking `SESSION_SECRET`.
Never commit `.env`. The bot token, database password and session secret are never sent to clients.

## 3. First start

```bash
cp .env.example .env && $EDITOR .env
docker compose up -d --build              # db → app (runs migrations) → caddy (gets the certificate)
docker compose logs -f app                # JSON logs; look for "listening"
curl -fsS https://$DOMAIN/api/ready       # {"ok":true,"db":true}
docker compose exec app node server/admin-cli.js create     # first admin (prompts; or ADMIN_USERNAME/ADMIN_PASSWORD/ADMIN_ROLE env)
```

Then configure the Mini App URL in BotFather and open the bot (TELEGRAM.md §1, §4).

### Without Docker
```bash
npm install                                   # Node ≥ 22.12; commit the generated package-lock.json
npm run build                                 # apps/web/dist + apps/server/dist (server bundle + migrations)
NODE_ENV=production DATABASE_URL=... SESSION_SECRET=... TELEGRAM_BOT_TOKEN=... \
  PUBLIC_URL=https://$DOMAIN STATIC_DIR=apps/web/dist node apps/server/dist/server.js
```
Run it under systemd (Restart=always) behind any reverse proxy that supports WebSockets (nginx:
`proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";
proxy_read_timeout 1h;`) and set `TRUST_PROXY=true` so rate limits see real client IPs.

## 4. Operations

| Task | How |
|---|---|
| Health | `GET /api/health` (process up, room count) · `GET /api/ready` (database reachable) — used by the container `HEALTHCHECK` |
| Logs | structured JSON on stdout (`docker compose logs app`); fields named like token/password/secret/initData/authorization/cookie are redacted by the logger |
| Migrations | applied automatically on start under a PostgreSQL advisory lock (safe with several replicas). Manual: `docker compose exec app node server/db-cli.js status` / `migrate` |
| Admins | `node server/admin-cli.js create` (roles `admin`, `viewer`); every admin action is in the audit log |
| Data retention | daily purge job inside the server (periods in [PRIVACY.md](PRIVACY.md)) |
| Update | `git pull && docker compose up -d --build app` — the restart closes running rooms (those matches are recorded as abandoned and players return to the menu), so deploy when few matches are running |
| Rollback | keep the previous image tag (`docker tag blatkom89:latest blatkom89:prev` before building) and `docker compose up -d` with it; migrations are forward-only and additive, so the previous version keeps working with the newer schema |
| Scale | one process handles hundreds of rooms; vertical scaling first. Several processes need sticky routing by room id (not included) |

## 5. Backups and recovery

* Enable nightly dumps: `docker compose --profile backup up -d` → `./backups/blatkom-<UTC>.dump`
  (custom format, `BACKUP_KEEP_DAYS`, default 14). Copy them off the host (e.g. `rclone`, S3 lifecycle).
* Ad-hoc: `docker compose exec db pg_dump -U blatkom -Fc blatkom > blatkom.dump`.
* Restore into an empty database:
  ```bash
  docker compose stop app
  docker compose exec -T db dropdb -U blatkom blatkom && docker compose exec -T db createdb -U blatkom blatkom
  docker compose exec -T db pg_restore -U blatkom -d blatkom --no-owner < backups/blatkom-XXXX.dump
  docker compose start app
  ```
* Test a restore at least once before launch. Account deletions are not replayed from backups
  automatically: document the backup rotation period in the privacy policy (placeholder in PRIVACY).

## 6. Security checklist

- [ ] HTTPS only (Caddy), HSTS optional at the proxy.
- [ ] Database port not published (compose keeps it on the internal network).
- [ ] `.env` readable only by the deploy user; secrets rotated if leaked (`SESSION_SECRET` logs everyone out).
- [ ] `ADMIN_BOOTSTRAP_PASSWORD` removed after the first start; admins use strong passwords (the CLI enforces a minimum).
- [ ] `/admin` is protected by server-side sessions, CSRF tokens, roles, rate limits and an audit log —
      optionally also restrict it by IP at the proxy.
- [ ] Monitor `/api/ready`, disk space for PostgreSQL and the backups directory.
