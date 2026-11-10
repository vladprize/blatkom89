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
5. Optional (v0.3): the Telegram bot — `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` in the same tab;
   `/start` then answers with the game's link ([TELEGRAM.md](TELEGRAM.md) §0), and (V2.0) players can link
   Telegram to their website account from Profile → «Link Telegram» (§4 there). `KEEP_AWAKE=true` keeps
   the free service from sleeping (instant answers, no first-visit minute).
6. Optional (v0.3): sign-in with Google, Telegram, Discord, Facebook and Reddit — each provider's keys in
   the same tab, step by step in [SIGN_IN.md](SIGN_IN.md). A provider without keys is simply not shown.

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
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_MINIAPP_SHORT_NAME` | from BotFather; with a token and an `https` `PUBLIC_URL` the server registers the bot's webhook itself (TELEGRAM.md §0); the token **and** the username switch on «Link Telegram» on the website (V2.0 part E, TELEGRAM.md §4) |
| `BOT_WARM_MINUTES` | after the bot hands out a link the server keeps itself awake this long (default 20, `0` = off) |
| `KEEP_AWAKE` | `true`: the server asks its own address every 5 minutes, so a free host (Render) never puts it to sleep |
| `ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_PASSWORD` | optional first admin, created on start only when no admin exists — remove after first start (or use the CLI below) |
| `MATCH_DURATION_SEC`, `MATCH_SCORE_LIMIT`, `MATCH_MIN_PLAYERS`, `MATCH_MAX_PLAYERS` | match rules (defaults 240 s, 50 points, 2, 10; at most 10 players per room) |
| `MATCH_TEAM_SCORE_LIMIT`, `MATCH_CAPTURE_LIMIT`, `MATCH_BASE_SCORE_LIMIT` | team modes: eliminations in «red vs blue» (40), flags in capture the flag (3), points in base capture (250) |
| `XSOLLA_MERCHANT_ID`, `XSOLLA_PROJECT_ID`, `XSOLLA_API_KEY`, `XSOLLA_WEBHOOK_SECRET` | optional (v0.2.18 part 3): BLATS packs on the website through Xsolla Pay Station — all four switch it on, and it then replaces Stripe; webhook `https://$DOMAIN/api/pay/xsolla/webhook`; store items with the SKUs `blats_99` … `blats_4999` (`XSOLLA_SKU_PREFIX`). `XSOLLA_SANDBOX` (default `true`) keeps it in Xsolla's sandbox until set to `false`. Setup: [PAYMENTS.md](PAYMENTS.md) §2 |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | optional (v0.2.18): BLATS packs by card (Stripe Checkout) when Xsolla isn't set up; webhook `https://$DOMAIN/api/pay/stripe/webhook` — events in [ECONOMY.md](ECONOMY.md) §5. With neither provider the BLATS tab says «Payments are being connected — coming soon» and checkout answers `503`. (The crypto method and its `NOWPAYMENTS_*` keys were removed in v0.2.18.) |
| `STARS_ENABLED`, `STARS_PER_USD` | v0.2.18 part 3: BLATS for Telegram Stars inside the Mini App — on (`true`) whenever the bot's token is set; a pack's price in Stars = its dollar price × `STARS_PER_USD` (default 75), rounded to 5 ([PAYMENTS.md](PAYMENTS.md) §1) |
| `PAY_SUPPORT` | v0.2.18 part 3: the contact for payment problems the bot's `/paysupport` gives (an email or a @username); unset: the contact on the terms page |
| `COPYRIGHT_HOLDER` | v0.2.18 part 3: the name after «©» in the credits (e.g. the owner's legal name; unset: the game's name) — [ASSETS.md](ASSETS.md) |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET`, `FACEBOOK_APP_ID` + `FACEBOOK_APP_SECRET`, `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` | optional: «sign in with …» for that provider; redirect URI `https://$DOMAIN/api/auth/oauth/<provider>/callback` ([SIGN_IN.md](SIGN_IN.md)). `FACEBOOK_GRAPH_VERSION` (default `v23.0`) |
| `TELEGRAM_WEB_LOGIN` | `true`: «sign in with Telegram» on the website (needs the bot token and the bot's `/setdomain`); the Mini App signs in by itself either way |
| `RESEND_API_KEY` + `MAIL_FROM` | optional: password-reset letters (Resend; the sender domain must be verified there). Without them admins issue one-time reset links in `/admin` |
| `CASES_ENABLED` | `true` (default) / `false` — every case: the rare-weapon case (talons), the skin case and the character case (BLATS, 18+); off for markets where paid random items are restricted |
| `PASS_SEASON_ID`, `PASS_SEASON_START`, `PASS_SEASON_WEEKS` | v0.2.24 — the Season Pass ([ECONOMY.md](ECONOMY.md) §4e): the season's name (a short slug, `s1`), its first moment (ISO 8601 in UTC, `YYYY-MM-DDTHH:MM:SSZ`) and its weeks (1–12, default 4). **Unset: the pass is not sold** (the Arsenal says the first season is coming); the owner sets the date. The next season: a new name and start |
| `WELCOME_GIFT_UNTIL` | v0.2.18 part 2 — optional ISO date (e.g. `2027-01-31T23:59:59Z`): players who sign in before it get the welcome gift («Shark», «Blatkom ’89» on every weapon) and keep it; **unset: the gift has no end yet** (the owner sets the date) |
| `WELCOME_BONUS_BLATS` | v0.2.20 — BLATS a guest account gets once for registering (an email, or a sign-in provider on the website); default `199`, `0` switches the bonus off ([ECONOMY.md](ECONOMY.md) §5b). Promo codes (BLATNOY …) live in the `promo_codes` table, not in the environment |
| `HOUSE_PLAYERS` | v0.2.20 — house players: accounts the game keeps itself in the player tables (Top-100), with natural aliases and slowly moving numbers, left out of the dashboard's metrics, tables and exports, the tournament and every reward (default `240`, at most 500; `0`: none are added and the ones there leave the tables). Nobody can sign in to one |
| `SOCIAL_X_URL`, `SOCIAL_TELEGRAM_URL`, `SOCIAL_INSTAGRAM_URL` | optional (v0.2.17; Instagram v0.2.19): where the menu's X, Telegram and Instagram buttons lead; without them the buttons say «coming soon» |
| `MATCH_FILL_BOTS` | complete small lineups with players the server runs itself (default `true`: 4 in free-for-all, 3 a side in team modes; Quick Match after a 5 s head start, rooms with friends at kick-off; see docs/NETCODE.md §2a) |
| `GUEST_SIGNUPS_PER_IP_HOUR` | new guest accounts per address per hour (default 10; raise it for events where many new players share one Wi-Fi) |
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
| Scale | one process handles hundreds of rooms; vertical scaling first. Several processes need sticky routing by room id and a shared bus for the social hub (presence, live messages and invitations live in the process) — neither is included |

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
- [ ] Menu music: «Hurt» (Infraction & Emerel Gray) again since v0.2.19 (the owner's choice; v0.2.18
      part 3 had the game's own «Районные дела», kept in `tools/music/`) — get its licence for use in a
      game (the authors' «No Copyright Music» library; [ASSETS.md](ASSETS.md)) and keep it with the
      game's papers.
- [ ] Before selling: the operator's name and contact in `apps/web/public/privacy*.html` and
      `terms*.html` (placeholders), `PAY_SUPPORT`, `COPYRIGHT_HOLDER`.
- [ ] Xsolla: the project, ten store items (v0.2.24), the webhook and the four keys ([PAYMENTS.md](PAYMENTS.md) §2);
      a sandbox purchase with a test card credits the BLATS once; then `XSOLLA_SANDBOX=false`.
- [ ] Telegram Stars: a real purchase of the smallest pack (75 ⭐) in the Mini App and its refund from
      `/admin` (TELEGRAM.md §5).

## v0.2.18: variables no longer read

`BLAT_DROP_ANNOUNCE_AT`, `PROJECT_SOL_WALLET`, `TOURNAMENT_STAKES`, `NOWPAYMENTS_API_KEY`,
`NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_SANDBOX` — the crypto theme is gone ([BLAT.md](BLAT.md)). The
server ignores them; delete them from the host's environment (Render → Environment) when convenient.
Migration `023_blats.sql` only adds (a column and two unique indexes) and runs by itself on start.

## v0.2.18 part 3: what the update changes on the server

* Migration `025_stars_xsolla.sql` only adds: `payments.provider` also accepts `xsolla`, the columns
  `payments.stars` and `payments.charge_ref` and a unique index on `(provider, charge_ref)`. It runs by
  itself on start; no data is changed.
* The bot's settings version is 2: the first start re-registers the webhook (now also for
  `pre_checkout_query`) and the commands (`/paysupport`, `/terms` added).
* The protocol version is 9 (two new maps): clients still open on the old version are told to reload.
* New optional variables: `XSOLLA_*`, `STARS_ENABLED`, `STARS_PER_USD`, `PAY_SUPPORT`,
  `COPYRIGHT_HOLDER` (§2). Nothing has to be set for the update itself.

## v0.2.20: what the update changes on the server

- Migrations **027** (the ledger's reasons `welcome` and `promo`, their once-only indexes, the `promo_codes` table
  with BLATNOY = 500) and **028** (`users.house_player`; the identity check also lets a house player have no way
  in). Both only add; nothing is rewritten or dropped.
- On its first start the server adds the house players (`HOUSE_PLAYERS`, 240) in the background — a few seconds —
  and every half hour plays the hours since their last move (`app_settings` key `house_players.drift_at`).
- The game's protocol is 10 (the sprint button and the breath in the snapshot): a page opened before the update
  is asked to reload, as after every protocol change.

## v0.2.24: what the update changes on the server

- Migration **030** (`030_season_pass.sql`) only adds: the tables `pass_purchases` and `pass_drops`, the item
  source `pass` and the ledger reason `pass` (the two checks keep every value they had). It runs by itself on
  start; nothing is changed or removed.
- **The Season Pass starts when the season is set**: on Render → Environment add `PASS_SEASON_ID=s1`,
  `PASS_SEASON_START=<the first moment, ISO 8601, UTC>` and, if not four, `PASS_SEASON_WEEKS`; save — the service
  restarts. Until then the pass is shown as «coming» and not sold. It is sold only while `CASES_ENABLED` is on.
- The protocol is unchanged (no reload asked of open pages beyond the usual new-build refresh).
- Nothing else to do on the server: the client's changes (the cards, the pass's screens, the story hub on a phone
  held sideways, the cheaper card drawing) arrive with the new build.
