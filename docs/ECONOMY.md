# Economy — talons, BLATS, grades, the Arsenal, cases and skins

Rules and prices live in one place, `packages/shared/src/game-rules/economy.ts` (skins:
`game-rules/skins.ts`, grades: `game-rules/grades.ts`); the server (`apps/server/src/economy/repo.ts`,
`apps/server/src/payments/`) is the only authority that changes balances. The client only displays
what the server returns. Admin view: «Экономика» in `/admin` ([ADMIN.md](ADMIN.md), metric definitions
in [ANALYTICS.md](ANALYTICS.md) §7).

**v0.2.18 (the owner's pre-release edits):** BLATS («БЛАТ» in Russian, the red coin) replace diamonds as
the premium currency and are sold for money (`REAL_MONEY = true`); grades — regular / rare / epic /
legendary (grey / red / purple / gold) — are shown on every character and skin; skins are bought
directly; the crypto theme is gone (no `$BLAT`, no BLAT DROP, no stakes — §8). In the database BLATS
are still the `diamonds` columns and currency id: no data was renamed or moved.

## 1. Currencies

| | Talons (`tokens` in code) | BLATS (`diamonds` in code) |
|---|---|---|
| How you get them | online matches (not practice); 150 for every friend who comes through your link and plays a whole match (§6) | 10 for every new level from level 2 (§5a); bought for money (§5) |
| Sold for money | never | yes: packs of 99 … 4 999 (1 BLATS = 1 US cent) |
| Spent on | weapons, equipment, modifications, the weapon case, the first three paid characters | characters by grade, weapon skins by grade, the skin case |

Neither currency is a cryptocurrency, neither can be withdrawn, exchanged or passed to another player.

Talons per online match (`TOKEN_REWARD`, `tokenBreakdown()`): **5 per elimination, 2 per assist, 5 for
playing the match to the end**, capped at 100 per match — the same in every mode. The results screen
shows the sum and how it was counted. Talons are credited in the same transaction as XP, exactly once
per match and player (`currency_ledger` reason `match`, ref = match id). Practice earns nothing.

XP per match (`XP_RULES`): 50 for finishing, 10 per elimination, 5 per assist, 15 per flag or base
captured; free-for-all adds 100 / 50 / 25 for places 1–3, team modes add 75 to every player of the
winning team (25 to both teams on a draw); +20 for a match with friends by invitation; capped at 400.

## 2. What is free

Two characters (Petya the rooster and Valuta the panther), a full kit of three weapons (Makarov,
crowbar, AK-47), the F-1 grenade and two skin finishes on every weapon (Birch Camo, Rust). A new player
spawns with a working loadout and can play every map and mode without spending anything.

## 3. The Arsenal (talons)

Prices (`WEAPON_PRICES`, `GADGET_PRICES`, `MOD_PRICES`):

| Item | Price, talons |
|---|---|
| Sawn-off / Knife / TT / Uzi | 100 / 120 / 150 / 200 |
| P92 (lvl 3) / Deagle (4) / Bat (5) / Axe (6) / AKS-74U (7) / MP5 (8) / S-12K (9) / PPSh-41 (10) | 250 / 300 / 300 / 350 / 400 / 450 / 500 / 500 |
| M4A1 (lvl 11) / G36 (12) / M24 (13) / M249 (14) / SVD (15) / AWM (17) / RPG-7 (19) | 550 / 600 / 650 / 700 / 800 / 900 / 1000 |
| Equipment: smoke / flashbang (lvl 2) / Molotov (lvl 4) / mine (lvl 6) / C4 (lvl 8) / turret (lvl 12) | 100 / 150 / 250 / 300 / 350 / 450 |
| Modifications, per weapon: red dot, laser / grip / silencer, extended mag / scope | 100 / 120 / 150 / 200 |
| The rare-weapon case | 600 |

Principles:

* **Sidegrades, not upgrades.** Paid and rare weapons trade one strength for a weakness; the test
  `balance: paid and rare weapons are sidegrades, not upgrades` keeps it that way. **All characters
  have identical combat stats** — a character bought for BLATS looks different, never plays stronger.
  Skins change only the look.
* **Fight-changing extras are never sold for money:** weapons, modifications and equipment cost talons.
* Every purchase locks the player's profile row, re-checks ownership, level and balance, writes the
  item and a `currency_ledger` row in one transaction — concurrent requests cannot overspend.
  Refusals: `owned`, `level`, `funds`, `not_for_sale`, `not_fit`, `not_owned`, `collection_complete`.
* The spawn loadout is stored on the server and validated against ownership whenever it is read.

## 3a. Characters and grades

Every character has a grade (`characters.ts` → `grade`), shown on the character screen, in the Arsenal
and on the price. Grade colours (`GRADE_COLORS`): regular grey, rare red, epic purple, legendary gold.

| Characters | Price |
|---|---|
| Petya, Valuta | free |
| Uchastkovy (lvl 1) / Mikhalych (lvl 2) / Karlych (lvl 3) | 150 / 200 / 300 talons |
| every other character, by grade (`CHARACTER_GRADE_PRICES`): regular / rare / epic / legendary | 199 / 399 / 799 / 1 099 BLATS ($1.99 / $3.99 / $7.99 / $10.99) |

Today: regular — Sonka, Tolyan, Gosha, Sizy, Prusak, Sery, Borka, Vityok, Slavik; rare — Bugai, Garik,
Lyova, Batya, Murka, Alisa, Rogov; epic — Zhora, Samson; legendary — Arkadich. A locked character is
bought right on the character screen («Buy for …»; the server decides) or tried in practice first
(«Try in practice» comes back to the same character). Characters bought before v0.2.18 stay owned.

## 4. The rare-weapon case (talons)

600 talons for one of ten rare weapons (Commissar's Mauser, Udarnik sledgehammer, engraved Tulka, the
beat cop's crossbow, Stroyka nail gun — 12 % each; Tommy gun, Plamya-84 flamethrower, Mukha RPG — 10 %
each; Golden Kalash, GM-94 grenade launcher — 5 % each). **No duplicates:** owned weapons never drop
and the odds of the rest are renormalised (`caseOdds`); the odds are shown before the purchase. When
the collection is complete the case is no longer sold. Draws use the OS CSPRNG (`crypto.randomInt`).

## 4a. Weapon skins

A skin is a **finish on one particular weapon** («АК-47 · Хохлома») and changes only how it looks
(`game-rules/skins.ts`). Every weapon can wear every finish: 32 weapons × 10 finishes = 320 skins.

| Grade | Finishes | Price each (`SKIN_PRICES`) | In the skin case |
|---|---|---|---|
| regular | Birch Camo, Rust — **free on every weapon** (`FREE_FINISHES`, never stored, never drop); Winter | 99 BLATS ($0.99) | 40 % |
| rare | Flora, Gzhel, Pioneer | 199 BLATS ($1.99) | 30 % |
| epic | Malachite, Khokhloma | 299 BLATS ($2.99) | 20 % |
| legendary | Party Gold, Amber | 499 BLATS ($4.99) | 10 % |

* **Direct purchase** (`POST /api/shop/skin {weapon, finish}`): in the dressing room every finish can be
  tried on (and taken into practice); a finish the player does not own shows its grade and «Buy for …»;
  the skin is bought and worn at once. Refusals as above (`owned` for a free or owned skin, `funds`).
* **The skin case** — 299 BLATS ($2.99): first the grade is drawn by the chances above (a grade whose
  skins are all owned drops out and the others share its chance — `skinCaseOdds`), then any unowned
  skin of that grade with equal chance (`drawSkin`, OS CSPRNG). No duplicates; the free finishes are
  not in it (256 skins). The odds open from the Arsenal before buying.
* Owned skins are `user_items` rows of kind `skin` (`item_id` = `weapon.finish`); the worn ones are
  `profiles.loadout.skins`, checked against ownership on every read (`ownsSkin` counts the free
  finishes). The room sends everyone's worn skins; the client paints the weapon's pixel art with the
  finish (`apps/web/src/game/render/finish.ts`).

## 4b. Paid cases: the rules

The skin case costs BLATS, i.e. money, so: **the odds are always shown before the purchase**, **no
duplicates**, the server asks for an **18+ confirmation** on every paid case (`confirmAge: true`, else
`400 confirm_age`; the Arsenal's checkbox), and `CASES_ENABLED=false` switches every case off on a
server (`/api/shop/config` → `casesEnabled: false`, the case routes → `403 cases_disabled`) for
markets where paid random items are restricted. Whether and where that is needed is a legal question
for the operator — this document is not legal advice. Every opening is recorded with its price and
currency (`case_openings`).

## 5. Buying BLATS

`DIAMOND_PACKS`: **99 / 199 / 499 / 999 / 1 999 / 4 999 BLATS for $0.99 / $1.99 / $4.99 / $9.99 /
$19.99 / $49.99** (1 BLATS = 1 cent). The BLATS tab of the Arsenal (also the menu's BLATS tile and
«Top up») shows the balance, the packs and how to pay.

| Method | Provider | Server keys | State |
|---|---|---|---|
| Card | Stripe Checkout (hosted page) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | code ready; not configured on the live server |
| Telegram Stars | the bot's invoices (`XTR`) | — | not implemented yet (part 3) |
| Xsolla | — | — | planned (part 3; waiting for the owner's keys) |

Without a configured provider the tab says «Payments are being connected — coming soon», the packs
show «Soon», and `POST /api/pay/checkout` answers `503 payments_not_configured` — there is no simulated
purchase anywhere. The crypto method (NOWPayments) was removed in v0.2.18.

Flow: `POST /api/pay/checkout {packId, method: 'card'}` creates a `payments` row (`created`, price from
`DIAMOND_PACKS`, never from the client) and returns the provider's hosted page URL; the provider calls
`POST /api/pay/stripe/webhook` (signature header `stripe-signature`, 5-minute tolerance). A verified
«paid» event marks the payment `paid` and credits the BLATS **once** (row lock + unique ledger index on
the payment id); a session not in USD or underpaid credits nothing. A refund (`charge.refunded`) marks
the payment `refunded` and takes back the BLATS that are still unspent (ledger reason `refund`). The
browser returns to `/?pay=success|cancel&pid=…` and polls `GET /api/pay/:id`. Stripe dashboard: webhook
endpoint `https://<domain>/api/pay/stripe/webhook` with `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`checkout.session.expired`, `charge.refunded`.

**Inside Telegram** digital goods must be paid with Telegram Stars, so card purchases are hidden in the
Mini App and the server refuses checkouts from Telegram sessions (`403 telegram_stars_only` — «Inside
Telegram, BLATS will be sold for Telegram Stars — coming soon»). Players who also registered an email
can buy on the website; the BLATS appear in the same account.

## 5a. BLATS for levels

`BLATS_PER_LEVEL = 10` for every new level from level 2 (`blatsForLevel`), each level paid once
(`creditLevelBlats`, `apps/server/src/progression/levelRewards.ts`): in the match-results and story
transactions, and whenever the player's own profile is read — so the levels reached before v0.2.18 are
paid the first time the player opens the game after the release, and the menu says «+N BLATS for the
levels you reached». Every credit is a ledger row (currency `diamonds`, reason `level`, ref `level:7`);
a unique index makes a second write of the same level impossible, also under retries and concurrent
requests; `profiles.blats_level` (migration 023) remembers how far the levels are paid. The founder's
level 87 (§7) is paid by the same rule.

## 6. Invitations (talons)

Every player has a link `https://<domain>/?ref=<code>` (Friends → «Invite to the game · +150 talons»,
`GET /api/referrals`). A new account made through it is attached to the inviter (an existing account
never is) and the invitation counts when the friend plays a whole online match (at least
`REFERRAL_RULES.minMatchSec` = 60 s, with damage dealt): the inviter gets **150 talons** (`REFERRAL_TALONS`,
ledger reason `referral`, ref `referral:<friend>`, once) and hears it live. More than
`REFERRAL_RULES.dailyCap` = 20 counted invitations a day, or an account an administrator flagged, holds
the invitation for a decision on the dashboard's «Приглашения» page. Talons are never sold, so an
invitation can never become money.

## 7. Administrator grants and the founder

`POST /api/admin/players/:id/grant` (role `admin`): ±1 … 1 000 000 talons or BLATS with a mandatory
reason, never below zero, ledger reason `grant` with the admin's id, audited as `balance_grant`. Used
for compensation and corrections, not for selling. «Сделать основателем» (one account): level 87 (its
levels' BLATS paid as for anybody), every character, weapon, equipment, skin and modification as
grants, the gold badge.

## 8. Retired in v0.2.18: $BLAT, BLAT DROP, stakes

The `$BLAT` points (V2.0), the BLAT DROP announcement and the tournament's stakes are removed from the
game, the server's routes and the dashboard («Не называй игровые очки криптотокеном» — and now there is
nothing of the kind). Nothing was deleted from the database: `profiles.blat`, the `blat` ledger rows,
`blat_pools`, `blat_snapshots` / `blat_snapshot_rows` and the stake columns stay as they were, unused
(the admin's ledger hides `blat` rows), and go with an account when it is deleted. The tournament
(«Турнир района» / District Tournament) plays for the rating only ([KON.md](KON.md)); invitations pay
talons (§6).

## 9. Tests

`apps/server/src/economy/economy.test.ts` (wallet, purchases and refusals, concurrency, loadout
validation, characters by grade, skins bought directly — free finishes refused as owned, the skin case
for BLATS with the 18+ confirmation and without duplicates, cases for talons, `CASES_ENABLED`, Stripe
signatures, single crediting, refunds, Telegram sessions refused, email sign-in),
`apps/server/src/referrals/referrals.test.ts` (attaching, counting, talons once, the daily cap and
flags, BLATS for levels paid once and retroactively), `apps/server/src/admin/economy-admin.test.ts`
(economy panel numbers, grants), `apps/server/src/admin/founder.test.ts`,
`packages/shared/src/__tests__/economy.test.ts` (prices, grades, packs, levels' BLATS),
`packages/shared/src/__tests__/skins.test.ts` (skin ids, prices, the case's odds 40/30/20/10 and
exhaustion, free finishes) and `apps/web/src/game/render/finish.test.ts`; browser:
`tests/e2e/v0218.mjs` (the BLATS tab, a skin and a character bought, levels' BLATS),
`tests/e2e/invite.mjs`, `tests/e2e/skins.mjs`.
