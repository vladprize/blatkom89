# Sign-in with Google, Telegram, Discord, Facebook and Reddit (v0.3)

Besides the guest account and the email, a player can sign in with a provider. On the first sign-in the
provider is attached to the account the player is already playing on (a guest keeps their level, talons
and everything unlocked); on another device the same provider opens the same account. Only the
provider's id for the player is stored — no email, no picture, no tokens (`user_identities`,
[PRIVACY.md](PRIVACY.md)). Telegram on the website uses the player's Telegram id, so the account is the
same one the Mini App opens.

A provider appears in the game only when its keys are set (`GET /api/auth/providers`); without keys
nothing changes. Code: `apps/server/src/auth/oauth.ts`, `api/oauth.ts`, `auth/telegramLogin.ts`;
`apps/web/src/net/oauth.ts`, `ui/screens/signin.ts`. Tests: `api/oauth.test.ts` (with a fake provider) and
the browser test `tests/e2e/signin.mjs` (fake keys, the providers' pages stubbed) — **no real provider was
contacted while building this release**; the first real sign-in of each provider is the owner's check.

Below, `https://blatkom89.onrender.com` stands for your `PUBLIC_URL`. Every key goes to Render →
the service → **Environment** (never into the repository); the service restarts by itself.

## Google
1. https://console.cloud.google.com → create a project («BLATKOM 89»).
2. **Google Auth Platform** (APIs & Services → OAuth consent screen): External; app name, support email,
   home page `https://blatkom89.onrender.com`, privacy policy `https://blatkom89.onrender.com/privacy.html`.
   Scopes: `openid`, `profile` only. **Publish** the app (status «In production»); in «Testing» only the
   test users you list can sign in.
3. **Clients** (Credentials) → Create → *Web application* → Authorized redirect URI
   `https://blatkom89.onrender.com/api/auth/oauth/google/callback`.
4. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## Telegram (on the website)
1. In @BotFather: `/setdomain` → the game's bot → `blatkom89.onrender.com`.
2. `TELEGRAM_WEB_LOGIN=true` (the bot's `TELEGRAM_BOT_TOKEN` is already there — [TELEGRAM.md](TELEGRAM.md) §0).

## Discord
1. https://discord.com/developers/applications → New Application («BLATKOM 89»).
2. OAuth2 → Redirects → `https://blatkom89.onrender.com/api/auth/oauth/discord/callback`; copy the Client ID,
   reset and copy the Client Secret. Scope used: `identify`.
3. `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`.

## Facebook
1. https://developers.facebook.com/apps → Create app → use case «Authenticate and request data from users
   with Facebook Login».
2. Facebook Login → Settings → Valid OAuth Redirect URIs →
   `https://blatkom89.onrender.com/api/auth/oauth/facebook/callback`. Permission used: `public_profile`.
3. App settings → Basic: App domains `blatkom89.onrender.com`, Privacy Policy URL
   `https://blatkom89.onrender.com/privacy.html`, User data deletion → instructions URL
   `https://blatkom89.onrender.com/privacy.html` (deletion: Settings → «Delete my data»), icon, category.
4. Switch the app to **Live** mode. `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
   (`FACEBOOK_GRAPH_VERSION`, default `v23.0`, only if Facebook retires that version).

## Reddit
1. https://www.reddit.com/prefs/apps → «create another app…» → type **web app**; redirect uri
   `https://blatkom89.onrender.com/api/auth/oauth/reddit/callback`. Scope used: `identity`.
2. The client id is the line under the app's name, the secret is «secret».
3. `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`. Reddit may ask you to register the app under its Data API
   terms before it lets other people sign in.

## How it works (for the record)
* The page asks for an intent (`POST /api/auth/oauth/intent`, with its session) and goes to
  `/api/auth/oauth/<provider>/start?intent=…`; the server sets a 10-minute cookie with a nonce and sends
  the player to the provider with a signed `state` (provider, current account, nonce).
* The provider sends the player back to `/api/auth/oauth/<provider>/callback`: the state's signature,
  age, provider and the cookie's nonce are checked; the code is traded for a token (with the secret,
  server to server) and the token for the player's id and first name (transliterated to Latin letters).
* The account: the one the id belongs to → otherwise the current account gets it (refused if that
  account already has another account of the same provider) → otherwise a new account. The page gets a
  one-time code in the address fragment (`#login=…`, valid 5 minutes, stored only as a hash) and trades
  it for a session (`POST /api/auth/oauth/finish`), so no session token is ever in an address.
* Telegram: oauth.telegram.org sends the signed fields back; `POST /api/auth/telegram/web` checks them
  with the bot token (`secret = SHA256(token)`), age ≤ `TELEGRAM_AUTH_MAX_AGE_SEC`.
