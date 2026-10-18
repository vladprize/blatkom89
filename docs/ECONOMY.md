# Economy — talons, diamonds, the Arsenal, cases and payments

Rules and prices live in one place, `packages/shared/src/game-rules/economy.ts`; the server
(`apps/server/src/economy/repo.ts`, `apps/server/src/payments/`) is the only authority that changes
balances. The client only displays what the server returns. Admin view: «Экономика» in `/admin`
([ADMIN.md](ADMIN.md), metric definitions in [ANALYTICS.md](ANALYTICS.md) §7).

## 1. Currencies

| | Talons (`tokens` in code) | Diamonds (`diamonds`) |
|---|---|---|
| How you get them | online matches only (not practice) | bought for real money, 100 💎 = $1 (no bulk bonus); administrator grants |
| Sold for money | never | yes — packs of 199, 299, 499, 999 and 1999 💎 |
| Spent on | token-priced weapons, characters, equipment, every modification | diamond-priced weapons and characters, the rare-weapon case |

Talons per completed online match (`TOKEN_REWARD`): 10 for finishing, +3 per elimination,
+1 per assist, +10 / +6 / +3 for places 1–3 (place bonuses need at least one player behind you),
capped at 60 per match. They are credited in the same transaction as XP, exactly once per match
and player (`currency_ledger` reason `match`, ref = match id).

## 2. What is free

The four starting characters (Petya, Valuta, Uchastkovy, Mikhalych), the base weapons (Makarov,
crowbar, sawn-off, AK-47) and the F-1 grenade. A new player spawns with a working loadout and can
play every map and mode without spending anything.

## 3. The Arsenal

Prices (`WEAPON_PRICES`, `CHARACTER_PRICES`, `GADGET_PRICES`, `MOD_PRICES`):

| Item | Price |
|---|---|
| Knife / TT / Uzi | 120 / 150 / 200 talons |
| P92 (lvl 3) / Bat (lvl 5) / AKS-74U (lvl 7) / PPSh-41 (lvl 10) / M24 (lvl 13) | 250 / 300 / 400 / 500 / 650 talons |
| Deagle, Axe | 199 💎 |
| MP5, S-12K | 299 💎 |
| M4A1, G36, M249 | 399 💎 |
| SVD, AWM, RPG-7 | 499 💎 |
| Characters for level + talons: Karlych (lvl 2), Sonka (4), Tolyan (6), Gosha (8), Vityok (11) | 200 / 350 / 500 / 650 / 800 talons |
| Characters for diamonds: Lyova, Slavik / Zhora, Garik «Pendos» / Batya | 299 / 399 / 499 💎 |
| Equipment: smoke / flashbang (lvl 2) / Molotov (lvl 4) / mine (lvl 6) / C4 (lvl 8) / turret (lvl 12) | 100 / 150 / 250 / 300 / 350 / 450 talons |
| Modifications, per weapon: red dot, laser / grip / silencer, extended mag / scope | 100 / 120 / 150 / 200 talons |

Principles:

* **Sidegrades, not upgrades.** Paid and rare weapons trade one strength for a weakness (hit counts,
  fire rate, reload, movement speed); the test `balance: paid and rare weapons are sidegrades, not
  upgrades` keeps it that way. All characters have identical combat stats.
* **Fight-changing extras cost talons only:** every modification (each has a plus and a minus) and all
  equipment.
* Every purchase locks the player's profile row, re-checks ownership, level and balance, writes the
  item and a `currency_ledger` row in one transaction — concurrent requests cannot overspend.
  Refusals: `owned`, `level`, `funds`, `not_for_sale`, `not_fit`, `not_owned`, `collection_complete`.
* The spawn loadout (sidearm, melee, primary, equipment, equipped modifications) is stored on the
  server and validated against ownership whenever it is read; anything not owned falls back to the
  free default.

## 4. The rare-weapon case

299 💎 for one of ten rare weapons (Commissar's Mauser, Udarnik sledgehammer, engraved Tulka, the beat
cop's crossbow, Stroyka nail gun — 12 % each; Tommy gun, Plamya-84 flamethrower, Mukha RPG — 10 %
each; Golden Kalash, GM-94 grenade launcher — 5 % each). **No duplicates:** owned weapons never drop
and the odds of the rest are renormalised (`caseOdds`); the Arsenal lists the current odds before the
purchase. When the collection is complete the case is no longer sold. Draws use the OS CSPRNG
(`crypto.randomInt`).

`CASES_ENABLED=false` switches the case off on a server (`/api/shop/config` → `casesEnabled: false`,
`POST /api/shop/case` → `403 cases_disabled`) for markets where paid randomised items are restricted.
Whether that is needed is a legal question for the operator — this document is not legal advice.

## 5. Buying diamonds

| Method | Provider | Server keys |
|---|---|---|
| Card | Stripe Checkout (hosted page) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Crypto | NOWPayments invoice (hosted page) | `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` (`NOWPAYMENTS_SANDBOX=true` for tests) |

Without both keys of a provider the method is reported as unavailable and checkout answers
`503 payments_not_configured` — there is no simulated purchase anywhere.

Flow: `POST /api/pay/checkout {packId, method}` creates a `payments` row (`created`, price from
`DIAMOND_PACKS`, never from the client) and returns the provider's hosted page URL; the player pays
there; the provider calls the webhook — Stripe `POST /api/pay/stripe/webhook` (signature header
`stripe-signature`, 5-minute tolerance) or NOWPayments `POST /api/pay/nowpayments/ipn` (HMAC-SHA512
over the sorted JSON body, header `x-nowpayments-sig`). A verified «paid» event marks the payment
`paid` and credits the diamonds **once** (row lock + unique ledger index on the payment id);
underpaid amounts (and, for Stripe, a session not in USD) credit nothing. Expired or failed checkouts are marked as
such. A refund reported by the provider (`charge.refunded`, NOWPayments `refunded`) marks the payment
`refunded` and takes back the diamonds that are still unspent (ledger reason `refund`). The browser
returns to `/?pay=success|cancel&pid=…` and polls `GET /api/pay/:id`.

Set up in the provider dashboards: Stripe webhook endpoint `https://<domain>/api/pay/stripe/webhook`
with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`; NOWPayments
IPN secret (the IPN URL is sent with every invoice).

### Inside Telegram

Telegram requires digital goods sold inside Mini Apps to be paid with Telegram Stars (currency
`XTR`). Card and crypto purchases are therefore hidden inside the Mini App, and the server refuses
checkouts from sessions opened through Telegram (`403 telegram_stars_only`). Selling diamonds for
Stars (bot `sendInvoice` / `createInvoiceLink` with `XTR`, `pre_checkout_query`, `successful_payment`,
refunds via `refundStarPayment`) is **not implemented yet**; players who also registered an email can
buy on the website and the diamonds appear in the same account.

## 6. Administrator grants

`POST /api/admin/players/:id/grant` (role `admin`): ±1 … 1 000 000 talons or diamonds with a
mandatory reason, never below zero, ledger reason `grant` with the admin's id, audited as
`balance_grant`. Used for compensation and for correcting mistakes, not for selling.

## 7. Tests

`apps/server/src/economy/economy.test.ts` (wallet, purchases and refusals, concurrency, loadout
validation, cases without duplicates, `CASES_ENABLED`, Stripe and NOWPayments signatures, single
crediting, refunds, Telegram sessions refused, email sign-in), `apps/server/src/admin/economy-admin.test.ts`
(economy panel numbers, grants) and `packages/shared/src/__tests__/weapons2.test.ts` (balance,
modifications, loadouts).
