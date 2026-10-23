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
* During a match (V2.0 part E): on a phone (`ios`, `android`) the Mini App asks for **fullscreen**
  (Bot API 8.0+); the **orientation is locked only while the phone is held sideways** — `lockOrientation()`
  locks the *current* orientation, so a lock taken upright would keep the game upright; turned sideways
  later, the lock follows. A closing confirmation is on during the match. After the match the
  orientation is free again (fullscreen stays: the menus fit it). Fallback: a client without 8.0, a
  computer, or a refused fullscreen (`fullscreenFailed`) keeps the expanded window — the game plays in
  both orientations (in portrait the «Turn your phone sideways» hint shows for a few seconds).
* Safe areas: `safeAreaInset` + `contentSafeAreaInset` (Bot API 8.0 fullscreen: the notch and Telegram's
  own buttons over the app) become CSS variables (`--tg-*`, combined with `env(safe-area-inset-*)` into
  `--safe-*`); the menus use them, and the canvas HUD (`app/safeArea.ts`) moves its score box, minimap,
  kill feed, chat and touch buttons inside them. On a short landscape screen whose top is pushed down,
  the touch buttons' column is pressed together so it stays under the minimap.
* Minimised and back (V2.0 part E, `app/lifecycle.ts`): Telegram's `deactivated` / `activated` (Bot API
  8.0), a hidden page, the back-forward cache and the network coming back all become *pause* /
  *resume*. On pause the music and the sound effects stop and held touch controls are let go (a finger
  that was down never comes up). On resume the game socket is checked at once: one that heard nothing
  for 2.5 s is replaced straight away (the server sends snapshots many times a second), and the same
  room is rejoined with the session (the server keeps a disconnected player's place for
  `reconnectGraceMs`, 30 s; after that the player is told «You were away too long — the match went on
  without you», and in «Блатной кон» that counts as leaving). An open socket that stays quiet for 6 s
  in front (confirmed over two ping rounds, never right after the page was held up) is replaced too. In the background, failed reconnects don't use up the attempts. The friends'
  line is pinged on resume and reopened when it doesn't answer within 3 s.
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

## 4. Telegram and an existing account (V2.0 part E)

Opening the game in Telegram never makes a second profile of a player who already has one and never
resets progress. Two ways to bring Telegram to an existing account
(`apps/server/src/auth/telegramLink.ts`, migration `019_telegram_link.sql`):

**From the website** — Profile → Account → **«Link Telegram»** (shown when the server has
`TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`, the account has no Telegram yet, and the page is not
inside Telegram):

1. `POST /api/auth/telegram/link-code` (signed-in player; 5 per 10 minutes) → a one-time code, valid for
   **10 minutes**, and the bot's address `https://t.me/<bot>?start=link_<code>`. Only an HMAC of the
   code is stored (`telegram_link_codes`); a newer code replaces an unused older one.
2. The player opens the bot and presses **Start**; the bot answers `/start link_<code>` (in a private
   chat only) with **«🔗 Link and play»** — a Mini App button that opens `https://<domain>/?tglink=<code>`.
3. The game in Telegram signs in with Telegram's signed launch data (checked on the server, never
   `initDataUnsafe`) **and** the code (`POST /api/auth/telegram {initData, link}`): the Telegram id is
   bound to the code's account, and the sign-in lands in that account. The page takes the code out of
   its address. The website notices by itself (it asks every 4 s while the block is open) and says
   «Telegram is linked».

**Inside Telegram** — a new Telegram profile is asked once «Already playing on the website?»: **«I have
an account with an email»** signs in by email and password with the launch data along
(`POST /api/auth/email/login {email, password, initData}`); the Telegram id is bound to the email's
account and Telegram opens it from then on. (The same works from Profile → «Already have an account with
email? Sign in».) A website guest without an email links from the website instead.

The rules, in one transaction (`bind`):

* The account already has this Telegram → `already`; another Telegram → `conflict` (nothing changes).
* This Telegram belongs to no account → bound (`linked`).
* It belongs to an **empty** account — made by an earlier launch in Telegram: no match played, no XP,
  no talons or diamonds, nothing owned, no gang, no friends, no email, device key or other sign-in —
  that account lets the id go: it is **kept as it was** (nothing is deleted), marked
  `merged_into` / `merged_at` (left out of player counts), and the id moves (`linked`, `merged`).
* It belongs to an account **with anything in it** → `conflict`: nothing changes; Telegram keeps
  opening that account (the player is told so). Two accounts with progress are never merged
  automatically.
* A code works once, also when it fails (`invalid`); after 10 minutes → `expired`. Used and run-out
  codes are purged a day later (`analytics/retention.ts`).

Every successful link writes `identity_linked {provider: 'telegram', via: 'code' | 'email', merged}`.
Tests: `apps/server/src/auth/telegramLink.test.ts` (5), `tests/e2e/telegram.mjs` (29 checks: the
website's link, the bot's answer, the same account in Telegram, the website noticing, the email
sign-in inside Telegram, fullscreen / orientation / safe areas / minimise and back in a Kon match).

## 5. Launch checklist

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
- [ ] V2.0 part E: on the website (a guest with some XP) Profile → «Link Telegram» → «Open Telegram» →
      **Start** → «🔗 Link and play» → the game opens in Telegram with the same alias and XP; the website
      says «Telegram is linked». Closing and reopening the Mini App opens the same account.
- [ ] V2.0 part E: a new Telegram account → «Welcome to the district» → «I have an account with an
      email» → that account opens, and after reopening the Mini App too.
- [ ] V2.0 part E: in a match on a phone held sideways the Mini App goes fullscreen and stays sideways;
      Telegram's buttons don't cover the minimap or the pause button. Minimise the Mini App for ~10 s
      and return: «CONNECTION LOST» lasts at most a moment and the match goes on in the same room.

These steps need a real bot and domain and were **not** executed while building this release (the
Telegram parts are covered by `tests/e2e/telegram.mjs` with Telegram's object and the bot's webhook
played by the test).

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
