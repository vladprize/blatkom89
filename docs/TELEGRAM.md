# Telegram Mini App

The same web build runs inside Telegram (Mini App) and in a normal browser. Inside Telegram the player
is authenticated by Telegram itself; in a browser players sign in as guests (`GUEST_AUTH_ENABLED=true`)
or with an email.

## 0. Quick start: the bot on Render (v0.3)

The simplest bot: the player presses **Start** (or writes anything) and gets the game's link — a
**🎮 Play in Telegram** button (the game opens inside Telegram) and a **🌐 Open in the browser** link.

1. In Telegram, open **@BotFather** → `/newbot` → a name (e.g. `BLATKOM ’89`) and a username ending in
   `bot` (e.g. `blatkom89_bot`). BotFather replies with a token like `7000000001:AAH…`.
2. Render → the `blatkom89` service → **Environment** → add `TELEGRAM_BOT_TOKEN` = the token and
   `TELEGRAM_BOT_USERNAME` = the username without `@` → **Save** (the service redeploys).
3. Nothing else: on start-up the server registers its webhook
   (`https://<service>.onrender.com/api/telegram/webhook`), the commands `/start` and `/play`, the
   bot's descriptions (Russian and English) and the **Play** button next to the message field. The log
   shows `telegram webhook registered`; on later starts `telegram bot {"setup":"unchanged"}`.
4. Open `t.me/<username>` → **Start**.

How «warm» works: the free Render service sleeps after 15 minutes without visitors. Telegram's call to
the webhook wakes it, and the bot can only answer once the server is running — so the link in the answer
always opens a server that is up, and for `BOT_WARM_MINUTES` (default 20) after an answer the server
keeps itself awake (it asks its own address every 5 minutes), so a link tapped a few minutes later is
still warm. The price: after a sleep the first answer takes up to about a minute. With
`KEEP_AWAKE=true` the server never sleeps and the bot answers at once — a free Render workspace has 750
instance hours a month, enough for this one service running non-stop (not for two).

Invitations from the game (`«Call the lads»`) use `t.me/<bot>?start=<room code>`: the friend presses
**Start**, the bot answers with **🎮 Join the room**. With a direct-link Mini App (§1 step 4) they open the
game straight away instead.

Webhook security: Telegram repeats a secret (derived from the bot token; `X-Telegram-Bot-Api-Secret-Token`)
on every call, anything without it gets 401; the answer is sent in the webhook's own response
(`{"method":"sendMessage",…}`), each update is answered once, a flooding chat gets at most 6 answers a
minute, and groups only get an answer to `/start` or `/play`. Code: `apps/server/src/telegram/bot.ts`,
`apps/server/src/services/keepAwake.ts`; tests: `bot.test.ts`.

One bot token has one webhook: a second server started with the same token and an `https` address takes
the webhook over (use a separate test bot for that).

## 1. Bot and Mini App setup (BotFather)

1. `/newbot` → choose a name and username. Put the token into `TELEGRAM_BOT_TOKEN` and the username
   (without `@`) into `TELEGRAM_BOT_USERNAME`. The token stays on the server only. The webhook, the
   commands, the descriptions and the menu button are set up by the server itself (§0).
2. Deploy the game on an HTTPS domain first (Telegram requires a valid certificate) — see
   [DEPLOYMENT.md](DEPLOYMENT.md). `PUBLIC_URL` must be that origin, e.g. `https://blatkom.example.com`.
3. **Main Mini App** (opened by Telegram’s own «Open» button in the bot profile and by `t.me/<bot>?startapp=`):
   BotFather → *My Bots* → bot → *Bot Settings* → *Configure Mini App* → *Enable Mini App* → URL
   `https://<domain>/`.
4. Optional **direct link app** with a short name: `/newapp` → select the bot → title, description,
   640×360 image → URL `https://<domain>/` → short name, e.g. `play`. Put it into
   `TELEGRAM_MINIAPP_SHORT_NAME`; invitations then use `https://t.me/<bot>/play?startapp=<code>`.
5. The menu button («Play», next to the message field) is set by the server; BotFather → *Bot Settings*
   → *Menu Button* changes it by hand.
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
* Invitations: «Call the lads» («Позвать своих») opens Telegram's share sheet (`t.me/share/url`) with
  the invite link and a text in the player's language. When a friend opens the link, Telegram passes
  the code as `start_param`; the game resolves it (`GET /api/invites/:code` → joinable / full / in
  progress / finished / expired / not found) and joins.
* Language (`apps/web/src/i18n`): the player's saved EN/RU choice (menu or Settings); otherwise the
  Telegram user's `language_code` — Russian for `ru`, `be`, `kk`, `ky`, English for `en` — then the
  browser languages, otherwise English. Server refusals arrive as codes or English text and are shown
  in the player's language.
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

- [ ] v0.3: `t.me/<bot>` → **Start** → the bot answers (after a sleep: within about a minute) with
      «Play in Telegram» and «Open in the browser»; both open the game.
- [ ] v0.3: «Call the lads» in a room → the friend's **Start** → «Join the room» → the same lobby.
- [ ] Domain with HTTPS serves the game (`/api/health` → `ok`).
- [ ] `NODE_ENV=production`, `DEV_AUTH_ENABLED=false`, real `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN` set.
- [ ] BotFather Mini App URL points to the domain; the bot's «Open» button opens the menu.
- [ ] Two phones: create a room, «Call the lads», join from the shared link, play a match.
- [ ] A Telegram account with Russian as the app language opens the game in Russian, an English one in
      English; the EN/RU switch works and is remembered after closing and reopening the Mini App.
- [ ] A team match (red vs blue, capture the flag or base capture) with players on both phones.
- [ ] v0.24: the game is free — the Arsenal shows no diamonds, no «Top up» and no Diamonds tab (inside Telegram and on the website alike); everything is unlocked with talons.
- [ ] `/admin` shows the two players and the match.

These steps need a real bot and domain and were **not** executed while building this release.

## Payments inside Telegram

Telegram requires digital goods sold inside a Mini App to be paid with Telegram Stars (`XTR`).
Since v0.24 nothing is sold for money at all (`REAL_MONEY = false`, [ECONOMY.md](ECONOMY.md)):
`POST /api/pay/checkout` answers `403 payments_off` for everybody. When sales return, the website's
card / crypto code is kept for browsers and sessions opened through Telegram are refused
(`403 telegram_stars_only`). Implementing Stars means: an invoice
link from the bot (`createInvoiceLink`, currency `XTR`, price in Stars), answering
`pre_checkout_query`, crediting diamonds once on `successful_payment` (idempotent by
`telegram_payment_charge_id`, `payments.provider = 'telegram'` is already allowed by the schema) and
handling refunds (`refundStarPayment`). See [ECONOMY.md](ECONOMY.md) §5.
