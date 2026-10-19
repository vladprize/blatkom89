# Deployment

One container image runs the API, the WebSocket game rooms and the static web client on port 8080.
PostgreSQL stores everything persistent. Caddy terminates HTTPS and proxies HTTP + WebSocket.

## 0. Quick start: public mobile website on Render (free, no Telegram)

For playing with friends from any phone browser. `render.yaml` (Blueprint) creates a free web service
in Frankfurt that runs the prebuilt bundle in `deploy/` (no npm install on the host) and a free
PostgreSQL database reachable only from Render's private network. Players open the site, pick a
nickname and play as guests (`GUEST_AUTH_ENABLED=true`); Telegram is not needed.

1. Push this repository to GitHub (public or private). `deploy/` must be up to date:
   `node tools/build-deploy.mjs` rebuilds it from the sources — commit the result.
2. Render → **New → Blueprint** → choose the repository (or open
   `https://dashboard.render.com/blueprint/new?repo=<repository URL>`) → **Apply**.
   Render generates `SESSION_SECRET` and the first admin password (`ADMIN_BOOTSTRAP_PASSWORD`, shown in
   the service's *Environment* tab; login `admin` at `/admin`).
3. Wait for the deploy (≈3–5 min), open `https://<service>.onrender.com`. `PUBLIC_URL` defaults to
   Render's `RENDER_EXTERNAL_URL`; a custom domain needs `PUBLIC_URL=https://your-domain`.
4. Optional, any time later in the service's *Environment* tab: payment keys (Stripe / NOWPayments)
   and mail keys (Resend) — see the table in §2 and [ECONOMY.md](ECONOMY.md). Empty values keep the
   feature off; nothing is simulated.

Free-tier limits (Render, 2026): the service sleeps after 15 minutes without traffic and the first
visit then takes about a minute (the client pings `/api/health` every 4 minutes while in a room);
0.1 CPU / 512 MB — one 6-player match measured ≈4 % of one 2.8 GHz core (incl. ≈1.5 % idle), so a
couple of simultaneous rooms fit; the free database expires after 30 days (upgrade or recreate it).
Every push to the branch redeploys automatically (`autoDeployTrigger: commit`).

Guest accounts: the browser keeps a random device secret; the server stores only its HMAC (keyed by
`SESSION_SECRET`), so the same phone keeps its nickname and XP, and a database leak does not reveal
sign-in keys. New guests are limited to 10 per address per hour (a whole party behind one Wi-Fi fits)
and 200 per hour overall. Clearing site data on the phone starts a new guest account.

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
| `MATCH_DURATION_SEC`, `MATCH_SCORE_LIMIT`, `MATCH_MIN_PLAYERS`, `MATCH_MAX_PLAYERS` | match rules (defaults 240 s, 50 points, 2, 10; at most 10 players per room) |
| `MATCH_TEAM_SCORE_LIMIT`, `MATCH_CAPTURE_LIMIT`, `MATCH_BASE_SCORE_LIMIT` | team modes: eliminations in «red vs blue» (40), flags in capture the flag (3), points in base capture (250) |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | optional: diamonds by card (Stripe Checkout); webhook `https://$DOMAIN/api/pay/stripe/webhook` — events in [ECONOMY.md](ECONOMY.md) §5 |
| `NOWPAYMENTS_API_KEY` + `NOWPAYMENTS_IPN_SECRET` | optional: diamonds by crypto (NOWPayments invoices; `NOWPAYMENTS_SANDBOX=true` for the sandbox) |
| `RESEND_API_KEY` + `MAIL_FROM` | optional: password-reset letters (Resend; the sender domain must be verified there). Without them admins issue one-time reset links in `/admin` |
| `CASES_ENABLED` | `true` (default) / `false` — paid rare-weapon cases |
| `LOG_LEVEL`, `MAX_ROOMS`, `SESSION_TTL_HOURS`, `TELEGRAM_AUTH_MAX_AGE_SEC` | optional |

The server validates the environment at start and refuses to run in production with
`DEV_AUTH_ENABLED=true`, without `PUBLIC_URL` (or Render's `RENDER_EXTERNAL_URL`), without
`TELEGRAM_BOT_TOKEN` unless `GUEST_AUTH_ENABLED=true`, or with a placeholder-looking `SESSION_SECRET`.
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
- [ ] Menu music: confirm the rights holders' terms for «Hurt» (Infraction & Emerel Gray) for use in
      the game and the attribution they require (credited in the menu and `THIRD_PARTY_LICENSES.txt`),
      or replace `apps/web/public/assets/audio/theme.mp3` before public launch.
