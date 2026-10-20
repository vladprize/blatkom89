# Economy — talons, diamonds, the Arsenal, cases, weapon skins and payments

Rules and prices live in one place, `packages/shared/src/game-rules/economy.ts`; the server
(`apps/server/src/economy/repo.ts`, `apps/server/src/payments/`) is the only authority that changes
balances. The client only displays what the server returns. Admin view: «Экономика» in `/admin`
([ADMIN.md](ADMIN.md), metric definitions in [ANALYTICS.md](ANALYTICS.md) §7).

## 1. Currencies

| | Talons (`tokens` in code) | Diamonds (`diamonds`) |
|---|---|---|
| How you get them | online matches only (not practice) | bought for real money, 100 💎 = $1 (no bulk bonus); administrator grants |
| Sold for money | never | yes — packs of 199, 299, 499, 999 and 1999 💎 |
| Spent on | token-priced weapons, characters, equipment, every modification | diamond-priced weapons and characters, the rare-weapon case, the skin case |

Talons per online match (`TOKEN_REWARD`, `tokenBreakdown()`): **5 per elimination, 2 per assist, 5 for
playing the match to the end**, capped at 100 per match — the same in every mode, so a match pays for
the work done in it, not for the place. The results screen shows the sum and how it was counted
(«4 eliminations × 5 = 20 · 1 assist × 2 = 2 · finished +5»). Talons are credited in the same
transaction as XP, exactly once per match and player (`currency_ledger` reason `match`, ref = match id).
Practice earns nothing (online profile only).

XP per match (`XP_RULES`): 50 for finishing, 10 per elimination, 5 per assist, 15 per flag or base
captured (capture the flag / base capture); free-for-all adds 100 / 50 / 25 for places 1–3, team modes
add 75 to every player of the winning team (25 to both teams on a draw); +20 for a match with friends
by invitation; capped at 400.

## 2. What is free

Two characters (Petya the rooster and Valuta the panther), a full kit of three weapons (Makarov,
crowbar, AK-47) and the F-1 grenade. A new player spawns with a working loadout and can play every map
and mode without spending anything.

Until v0.23 the wolf (Uchastkovy), the bear (Mikhalych) and the sawn-off were free as well; they are
now bought with talons, and every account made before that keeps them (migration 009 stores them as
grants).

## 3. The Arsenal

Prices (`WEAPON_PRICES`, `CHARACTER_PRICES`, `GADGET_PRICES`, `MOD_PRICES`):

| Item | Price |
|---|---|
| Sawn-off / Knife / TT / Uzi | 100 / 120 / 150 / 200 talons |
| P92 (lvl 3) / Bat (lvl 5) / AKS-74U (lvl 7) / PPSh-41 (lvl 10) / M24 (lvl 13) | 250 / 300 / 400 / 500 / 650 talons |
| Deagle, Axe | 199 💎 |
| MP5, S-12K | 299 💎 |
| M4A1, G36, M249 | 399 💎 |
| SVD, AWM, RPG-7 | 499 💎 |
| Characters for level + talons (eleven): Uchastkovy (lvl 1), Mikhalych (2), Karlych (3), Sonka (5), Tolyan (7), Gosha (9); v0.23: Sizy (10), Prusak (11), Sery (12), Borka (13), Bugai (15) | 150 / 200 / 300 / 400 / 550 / 700 talons; 800 / 900 / 1000 / 1100 / 1250 talons |
| Characters for diamonds (eleven): Vityok / Lyova, Slavik / Zhora, Garik «Pendos» / Batya; v0.23: Murka / Alisa, Rogov / Samson, Arkadich | 199 / 299 / 399 / 499 💎; 299 / 399 / 399 / 499 / 499 💎 |
| Equipment: smoke / flashbang (lvl 2) / Molotov (lvl 4) / mine (lvl 6) / C4 (lvl 8) / turret (lvl 12) | 100 / 150 / 250 / 300 / 350 / 450 talons |
| Modifications, per weapon: red dot, laser / grip / silencer, extended mag / scope | 100 / 120 / 150 / 200 talons |

Weapons for diamonds (10) slightly outnumber those for talons (9); characters are split evenly (11 / 11; the
ten of v0.23 are default prices — five for talons higher up the level ladder, five for diamonds — until the
owner names others).

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

## 4a. Weapon skins and the skin case (v0.23)

A skin is a **finish on one particular weapon** («АК-47 · Хохлома») and changes only how it looks —
never a number (`game-rules/skins.ts`). Ten finishes from the late-Soviet everyday:

| Rarity | Chance | Finishes |
|---|---|---|
| common | 55 % | Берёзка (birch camo), Ржавчина (rust), Зимний (winter) |
| rare | 28 % | Флора (the 1980s camo), Гжель (porcelain blue), Пионер (pioneer red) |
| epic | 13 % | Малахит (malachite), Хохлома (black, gold and red) |
| legendary | 4 % | Золото партии (party gold), Янтарь (amber) |

Every weapon can wear every finish: 32 × 10 = 320 skins. **The skin case** costs 299 💎 ($2.99) and gives
a skin the player does not own: first the rarity is drawn by the chances above (a rarity whose skins are
all owned drops out and the others share its chance — `skinCaseOdds`), then any unowned skin of that
rarity with equal chance (`drawSkin`, OS CSPRNG). No duplicates; when all 320 are owned the case is no
longer sold. The same adult confirmation and `CASES_ENABLED` switch as the weapon case
(`POST /api/shop/skin-case`). A new skin goes on its weapon at once if the weapon wore none.

Owned skins are `user_items` rows of kind `skin` (`item_id` = `weapon.finish`, migration 011); the worn
ones are `profiles.loadout.skins` (`{weapon: finish}`), checked against ownership on every read. A skin
can be worn on a weapon the player does not own — it shows when such a weapon is picked up on the map.
The room sends everyone's worn skins in the roster; the client paints the weapon's own pixel art with
the finish (`apps/web/src/game/render/finish.ts`) for the weapon in hand, the HUD icon and the Arsenal's
pictures. In the dressing room every finish can be tried on (and taken into practice); the player's own
are worn with a tap. Players the room adds to complete a lineup sometimes wear a common or rare skin,
like people who opened the case. The admin's economy page splits case openings by kind.

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
validation, cases without duplicates, the skin case (price, no duplicates, the new skin worn on a bare
weapon, recorded openings), skins worn only when owned and shown to everyone in the room roster,
`CASES_ENABLED`, Stripe and NOWPayments signatures, single
crediting, refunds, Telegram sessions refused, email sign-in), `apps/server/src/admin/economy-admin.test.ts`
(economy panel numbers, grants), `packages/shared/src/__tests__/weapons2.test.ts` (balance,
modifications, loadouts), `packages/shared/src/__tests__/skins.test.ts` (skin ids, the case's odds and
exhaustion, sanitising, filled players' skins) and `apps/web/src/game/render/finish.test.ts` (every
finish repaints, keeps transparency and outlines, is deterministic and follows the weapon, not its
padding); browser: `tests/e2e/skins.mjs`.
