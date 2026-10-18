# Telegram Mini App

The same web build runs inside Telegram (Mini App) and in a normal browser. Inside Telegram the player
is authenticated by Telegram itself; in a browser, online play is only available when the operator
enables the development login (never in production).

## 1. Bot and Mini App setup (BotFather)

1. `/newbot` → choose a name and username. Put the token into `TELEGRAM_BOT_TOKEN` and the username
   (without `@`) into `TELEGRAM_BOT_USERNAME`. The token stays on the server only.
2. Deploy the game on an HTTPS domain first (Telegram requires a valid certificate) — see
   [DEPLOYMENT.md](DEPLOYMENT.md). `PUBLIC_URL` must be that origin, e.g. `https://blatkom.example.com`.
3. **Main Mini App** (opened by Telegram’s own «Open» button in the bot profile and by `t.me/<bot>?startapp=`):
   BotFather → *My Bots* → bot → *Bot Settings* → *Configure Mini App* → *Enable Mini App* → URL
   `https://<domain>/`.
4. Optional **direct link app** with a short name: `/newapp` → select the bot → title, description,
   640×360 image → URL `https://<domain>/` → short name, e.g. `play`. Put it into
   `TELEGRAM_MINIAPP_SHORT_NAME`; invitations then use `https://t.me/<bot>/play?startapp=<code>`.
5. Optional menu button: *Bot Settings* → *Menu Button* → URL `https://<domain>/`, title «Play».
6. Restart the server after changing the variables.

## 2. What the client does inside Telegram

`apps/web/src/telegram/tg.ts` (official `telegram-web-app.js` is loaded from `telegram.org`):

* `ready()`, `expand()`, dark header/background/bottom-bar colours, vertical swipe-to-close disabled
  (Bot API 7.7+), BackButton mapped to the in-game «← Back».
* During a match: fullscreen and orientation lock where supported (Bot API 8.0+) and a closing
  confirmation, released when the match ends.
* Safe areas: `safeAreaInset` + `contentSafeAreaInset` (Bot API 8.0 fullscreen) are applied as CSS
  variables; menus and HUD keep clear of notches and Telegram controls.
* Haptic feedback on hits, kills and pickups; native confirmation dialog for account deletion.
* Invitations: «Call the lads» opens Telegram's share sheet (`t.me/share/url`) with the invite link.
  When a friend opens the link, Telegram passes the code as `start_param`; the game resolves it
  (`GET /api/invites/:code` → joinable / full / in progress / finished / expired / not found) and joins.
* Platform (`ios`, `android`, `tdesktop`, `weba`/`webk`, …) is reported at login for the dashboard's
  platform chart (informational only).

## 3. Server-side authentication

`POST /api/auth/telegram {initData}` (`apps/server/src/auth/telegram.ts`) implements the official
algorithm (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):

```
secret_key        = HMAC_SHA256(key = "WebAppData", message = bot_token)
data_check_string = every received field except `hash`, sorted by key, "key=value" joined by "\n"
valid            ⇔  hex(HMAC_SHA256(key = secret_key, message = data_check_string)) == hash   (constant-time compare)
```

Also rejected: duplicate keys, malformed `hash`, `auth_date` older than `TELEGRAM_AUTH_MAX_AGE_SEC`
(default 24 h) or more than 60 s in the future, missing/invalid `user`. On success the server
creates/updates the user (Telegram id, first/last name → display name, language code; no username or
photo is stored) and returns an opaque session token (only its HMAC is stored, expiry
`SESSION_TTL_HOURS`). The client never sends a Telegram id the server would trust.

Development login (`POST /api/auth/dev`) exists for browser testing only: it is off unless
`DEV_AUTH_ENABLED=true`, and the server refuses to start with it in production.

Tests: `apps/server/src/auth/telegram.test.ts`, `auth.api.test.ts` (valid data, wrong bot token,
tampered field, stale and future `auth_date`, duplicates, missing user, expired sessions, dev login
disabled in production).

## 4. Launch checklist

- [ ] Domain with HTTPS serves the game (`/api/health` → `ok`).
- [ ] `NODE_ENV=production`, `DEV_AUTH_ENABLED=false`, real `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN` set.
- [ ] BotFather Mini App URL points to the domain; the bot's «Open» button opens the menu.
- [ ] Two phones: create a room, «Call the lads», join from the shared link, play a match.
- [ ] The Arsenal's Diamonds tab inside Telegram says purchases come later via Telegram Stars (card/crypto are web-only; the server refuses them for Telegram sessions).
- [ ] `/admin` shows the two players and the match.

These steps need a real bot and domain and were **not** executed while building this release.

## Payments inside Telegram

Telegram requires digital goods sold inside a Mini App to be paid with Telegram Stars (`XTR`).
This release sells diamonds only on the website (Stripe / NOWPayments); inside the Mini App the
Diamonds tab shows a «coming soon via Telegram Stars» note and `POST /api/pay/checkout` answers
`403 telegram_stars_only` for sessions opened through Telegram. Implementing Stars means: an invoice
link from the bot (`createInvoiceLink`, currency `XTR`, price in Stars), answering
`pre_checkout_query`, crediting diamonds once on `successful_payment` (idempotent by
`telegram_payment_charge_id`, `payments.provider = 'telegram'` is already allowed by the schema) and
handling refunds (`refundStarPayment`). See [ECONOMY.md](ECONOMY.md) §5.
