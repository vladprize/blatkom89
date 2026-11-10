# Payments: Xsolla on the website, Telegram Stars in Telegram (v0.2.18 part 3)

BLATS (`DIAMOND_PACKS`: 99 … 4 999 for $0.99 … $49.99, 1 BLATS = 1 cent) are sold through real providers
only; with no provider set up the game says «Payments are being connected — coming soon» and nothing can be
bought — there is no simulated purchase anywhere. Every credit is server-side, once, from the provider's
verified notification (row lock on the payment + a unique ledger row per payment).

| Where | Provider | Switched on by | Server code |
|---|---|---|---|
| The website | **Xsolla Pay Station** (cards and local methods) | `XSOLLA_MERCHANT_ID`, `XSOLLA_PROJECT_ID`, `XSOLLA_API_KEY`, `XSOLLA_WEBHOOK_SECRET` | `payments/providers.ts` (`XsollaProvider`), `payments/service.ts` |
| The website, if Xsolla isn't set up | Stripe Checkout (cards) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `StripeProvider` |
| Inside Telegram | **Telegram Stars** (`XTR`) | the bot (`TELEGRAM_BOT_TOKEN`), unless `STARS_ENABLED=false` | `payments/stars.ts`, `telegram/bot.ts` |

Telegram requires digital goods sold inside Mini Apps to be paid in Stars: inside Telegram the game offers
only Stars and the server refuses the website's checkout for Telegram sessions (`403 telegram_stars_only`);
on the website Stars are not offered (`403 stars_in_telegram`). A player with both (Telegram linked to the
website's account) sees the same BLATS in both places.

None of this has been run against a live provider account from here: the code is tested with signed
fixtures, a stand-in for the Bot API and an injected Xsolla client (§5). The first real purchase is the
owner's step after the keys are in.

## 1. Telegram Stars

**Flow.**

1. In the Mini App the Arsenal's «BLATS» tab (and the menu's banner) shows each pack's price in Stars —
   `ShopConfig.stars`, the pack's dollar price × `STARS_PER_USD` rounded to 5 (75 by default: 75 / 150 /
   375 / 750 / 1 500 / 3 750 ⭐). A tap: `POST /api/pay/stars {packId}` → a `payments` row (`provider
   'telegram'`, `currency 'xtr'`, the amount in Stars) and Telegram's invoice link (`createInvoiceLink`:
   one price, `currency: 'XTR'`, `provider_token: ''`, the payment id as the payload) → the Mini App opens
   it with `Telegram.WebApp.openInvoice` (Telegram's own payment sheet).
2. Telegram asks the bot (`pre_checkout_query`, through the webhook): **yes** only for an open payment of
   this exact price in Stars, made out to this Telegram user, at most a day old; otherwise **no** with a
   reason the player sees («the price has changed — open the shop again»). Answered in the webhook's own
   response, never rate-limited (Telegram cancels a payment it hears nothing about within 10 s).
3. Telegram reports the money (`message.successful_payment`): the payment is credited **once** (the
   payload names it; Telegram's `telegram_payment_charge_id` is kept — refunds need it); a short or
   repeated report credits nothing. The bot thanks the player («✅ +199 BLATS credited»); the game, once
   Telegram's window says «paid», polls `GET /api/pay/:id` and shows the BLATS.
4. **Refunds**: only the bot that was paid can give Stars back — `/admin` → the player → «Платежи» →
   **«Вернуть звёзды»** (role admin, audited `stars_refund`): `refundStarPayment`, then the unspent BLATS
   are taken back (never below zero). A refund Telegram reports by itself (`message.refunded_payment`) does
   the same.

**The bot's duties as a seller** (Telegram's rules for digital goods): `/paysupport` answers who to write
to (`PAY_SUPPORT` — an email or a @username; until it is set, the contact on the terms page) and that
Telegram's support can't help with these purchases; `/terms` links the terms of purchase
(`/terms.html`, `/terms-ru.html`), which the Arsenal also links next to the packs. Both are in the bot's
command list. The webhook now also asks for `pre_checkout_query` updates (`BOT_SETTINGS_VERSION = 2`: the
next start re-registers the webhook by itself).

**Stars and money.** Stars reach the bot's balance; Telegram pays developers out through Fragment (in
TON) after a hold period. `STARS_PER_USD` decides how a dollar price becomes Stars: Telegram pays
developers about $0.013 per Star, so 75 per dollar brings the game roughly the website's price (players
pay Telegram somewhat more per Star, depending on where they buy them). The dashboard counts Stars
payments in Stars («⭐»), not dollars.

## 2. Xsolla

**What the owner sets up in Xsolla's Publisher Account** (keys awaited):

1. A project; in **Store → Virtual items** ten items whose **SKUs** are `blats_99`, `blats_199`,
   `blats_299`, `blats_499`, `blats_599`, `blats_699`, `blats_799`, `blats_999`, `blats_1999`, `blats_4999`
   (`XSOLLA_SKU_PREFIX` + the pack's BLATS; v0.2.24 added 299, 599, 699 and 799), priced $0.99 … $49.99
   (Xsolla converts to local currencies).
2. **Project settings → Webhooks**: on, the URL `https://<domain>/api/pay/xsolla/webhook`; copy the
   **secret key** (`XSOLLA_WEBHOOK_SECRET` — it changes whenever the URL does).
3. **Company settings → API keys**: a key (`XSOLLA_API_KEY`); the merchant id (`XSOLLA_MERCHANT_ID`) and the
   project id (`XSOLLA_PROJECT_ID`) are shown in the account.
4. Keep `XSOLLA_SANDBOX=true` (the default) for the test purchases with Xsolla's test cards; set it to
   `false` when the project is live. A live server refuses sandbox orders.
5. Name Xsolla in the privacy policy and fill in the operator's name and contact in the terms of purchase
   and the privacy policy (placeholders) — done in the texts except the placeholders.

**Flow.** «Pay» on a pack → `POST /api/pay/checkout` → a `payments` row (`provider 'xsolla'`) → Xsolla's
**Create payment token for purchase** (`POST https://store.xsolla.com/api/v3/project/<project>/admin/payment/token`,
Basic auth with the merchant id and the API key; the player's internal id, alias, the pack's SKU, the
language, the return address, `sandbox`, the payment id in `custom_parameters`; the player's IPv4 in
`X-User-Ip` so Xsolla picks the country and currency, else `US`) → Xsolla's order id is the payment's
`provider_ref` → the browser goes to Pay Station (`https://secure.xsolla.com/paystation4/?token=…`, or
`sandbox-secure.xsolla.com`) and comes back to `/?pay=success&pid=…`, where the game polls the payment.

**Webhooks** (`POST /api/pay/xsolla/webhook`): the signature first — `Authorization: Signature <hex>`,
`hex = sha1(raw body + secret key)`, compared in constant time; a wrong one gets `400 INVALID_SIGNATURE`.
Then:

| `notification_type` | What the game does | Answer |
|---|---|---|
| `user_validation` | the player exists | `204`, or `400 INVALID_USER` |
| `order_paid` | the order's payment (by `order.id`) is credited once — only if `user.external_id` is its player and an item is its pack's SKU, and a sandbox order only on a sandbox server | `204`, or `400` with `INVALID_USER` / `INCORRECT_AMOUNT` / `INCORRECT_INVOICE` / `INVALID_PARAMETER` (a sandbox order on a live server, no order id) |
| `order_canceled` | a paid order: refunded — the unspent BLATS taken back; an unpaid one: closed | `204` (`400 INCORRECT_INVOICE` for an order the game didn't make) |
| `payment`, `refund`, others | acknowledged (older accounts send them besides; the order webhooks do the work) | `204` |

Xsolla resends `order_paid` and `order_canceled` when it gets no answer or a 5xx (at most 20 attempts within
12 hours); a repeat changes nothing, and a `400` is final. Xsolla's webhook addresses can be allowed at the
proxy (`185.30.20.0/22`, `34.102.38.178`, `34.94.43.207`, `35.236.73.234`, `34.94.69.44`, `34.102.22.197`,
per Xsolla's webhooks overview) — the signature is what the server relies on.

## 3. Database (migration 025, adds only)

`payments.provider` accepts `xsolla`; `payments.stars` (the price in Stars of a Stars payment);
`payments.charge_ref` (Telegram's charge id) with a unique index per provider. A Stars payment's
`amount_cents` and `currency` are in Stars (`xtr`); the dashboard's daily revenue counts dollars only.

## 4. Environment

| Variable | Default | Meaning |
|---|---|---|
| `XSOLLA_MERCHANT_ID`, `XSOLLA_PROJECT_ID`, `XSOLLA_API_KEY`, `XSOLLA_WEBHOOK_SECRET` | — | all four switch Xsolla on (it then takes the website's payments instead of Stripe) |
| `XSOLLA_SANDBOX` | `true` | Xsolla's sandbox; `false` for real money |
| `XSOLLA_SKU_PREFIX` | `blats_` | the packs' SKUs in Xsolla's store |
| `STARS_ENABLED` | `true` | Stars inside Telegram whenever the bot is set up |
| `STARS_PER_USD` | `75` | Stars per dollar of a pack's price (rounded to 5) |
| `PAY_SUPPORT` | — | the contact `/paysupport` gives (an email or a @username) |
| `COPYRIGHT_HOLDER` | the game's name | the name after «©» in the credits |
| `TELEGRAM_API_BASE` | — | tests only: a local stand-in for the Bot API (`http://127.0.0.1:…` only) |

## 5. Tests

* `apps/server/src/payments/payments.test.ts` (7, DB-backed): the Stars prices in the shop config; an
  invoice through a local Bot API stand-in (XTR, one price, no provider token, the payment id as the
  payload, the title and description within Telegram's limits); the pre-checkout question — no for a
  wrong price, another player, an unknown invoice, another currency, yes for the right one; an underpaid
  report credits nothing, the right one once, repeats (the same update, the same charge) nothing; the
  admin's refund through the bot (`refundStarPayment` with the player's Telegram id and the charge id),
  the unspent BLATS back, the audit, a second refund refused; a refund Telegram reports; `/paysupport` and
  `/terms`; Xsolla's token request (the URL, Basic auth, the SKU, the player, sandbox, the return address,
  `X-User-Ip`), the signature (good, tampered, missing), `user_validation`, `order_paid` checks and once,
  `order_canceled` taking the BLATS back, a live server refusing sandbox orders, the webhook route on a
  server with Xsolla's keys (204 / `INVALID_SIGNATURE` / `INVALID_USER`).
* `tests/e2e/v0218c.mjs` (20 checks, the production bundle): a Telegram phone buys 199 BLATS for 150
  Stars end to end — the banner and the packs in Stars, a cancelled invoice, Telegram's pre-checkout
  question and the payment report played by the test against the real webhook, the BLATS once, the bot's
  thanks; `/paysupport`, `/terms`; the website without Stars; the terms pages. `tests/e2e/fake-botapi.mjs`
  stands in for the Bot API.
