# Economy — talons, BLATS, grades, the Arsenal, cases and skins

Rules and prices live in one place, `packages/shared/src/game-rules/economy.ts` (skins:
`game-rules/skins.ts`, grades: `game-rules/grades.ts`); the server (`apps/server/src/economy/repo.ts`,
`apps/server/src/payments/`) is the only authority that changes balances. The client only displays
what the server returns. Admin view: «Экономика» in `/admin` ([ADMIN.md](ADMIN.md), metric definitions
in [ANALYTICS.md](ANALYTICS.md) §7).

**v0.2.24 (the owner: «скины на оружие и персонажей дешевле на 30–40 %, в круглых суммах с окончанием .99»):**
characters 99 / 299 / 499 / 699 BLATS by grade, skins 99 / 99 / 199 / 299, both cases 199, the sets 599 / 799,
four more packs (299, 599, 699, 799) so that every price is exactly one pack, and the season pass (§4e, 299).
Where no .99 price lies 30–40 % under the old one, the nearest is taken (a rare skin and a regular character
−50 %, a rare character −25 %); a set with a legendary character −20 % (at −30 % it would cost what the
character alone does). Nobody's purchases change.

**v0.2.18 (the owner's pre-release edits):** BLATS («БЛАТ» in Russian, the red coin) replace diamonds as
the premium currency and are sold for money (`REAL_MONEY = true`); grades — regular / rare / epic /
legendary (grey / red / purple / gold) — are shown on every character and skin; skins are bought
directly; the crypto theme is gone (no `$BLAT`, no BLAT DROP, no stakes — §8). In the database BLATS
are still the `diamonds` columns and currency id: no data was renamed or moved.

**v0.2.18 part 2:** twelve new characters from the owner's sheets (36 in all, §3a), the owner's skin
line — 39 finishes on sale (v0.2.19: the AK sheet's 19, four of them live), a welcome gift of two for early players, the first line retired (§4a),
and the character case for BLATS (§4c).

**v0.2.18 part 3:** BLATS are sold through Xsolla on the website and for Telegram Stars inside Telegram
(§5, [PAYMENTS.md](PAYMENTS.md)).

## 1. Currencies

| | Talons (`tokens` in code) | BLATS (`diamonds` in code) |
|---|---|---|
| How you get them | online matches (not practice); 150 for every friend who comes through your link and plays a whole match (§6) | 10 for every new level from level 2 (§5a); bought for money (§5) |
| Sold for money | never | yes: packs of 99 … 4 999 (1 BLATS = 1 US cent) |
| Spent on | weapons, equipment, modifications, the weapon case, the first three paid characters | characters by grade, weapon skins by grade, the skin case, the character case |

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
crowbar, the Druzhba rifle) and the F-1 grenade. A new player spawns with a working loadout and can play every map
and mode without spending anything. While the welcome gift lasts (§4a), every player also gets two skin
finishes on every weapon («Shark», «Blatkom ’89»).

## 3. The Arsenal (talons)

Prices (`WEAPON_PRICES`, `GADGET_PRICES`, `MOD_PRICES`):

| Item | Price, talons |
|---|---|
| Sawn-off / Knife / TT / Rattler | 100 / 120 / 150 / 200 |
| P92 (lvl 3) / Barkhan Hand Cannon (4) / Bat (5) / Axe (6) / AKS-74U (7) / Tochka SMG (8) / S-12K (9) / PPSh-41 (10) | 250 / 300 / 300 / 350 / 400 / 450 / 500 / 500 |
| M4A1 (lvl 11) / Import Rifle (12) / M24 (13) / M249 (14) / SVD (15) / Long Shot (17) / RPG-7 (19) | 550 / 600 / 650 / 700 / 800 / 900 / 1000 |
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
| every other character, by grade (`CHARACTER_GRADE_PRICES`): regular / rare / epic / legendary | v0.2.24: 99 / 299 / 499 / 699 BLATS ($0.99 / $2.99 / $4.99 / $6.99); were 199 / 399 / 799 / 1 099 |

Today (36 characters, v0.2.18 part 2): regular — Sonka, Tolyan, Gosha, Sizy, Prusak, Sery, Borka, Vityok,
Slavik, **Cherry, Dlinny**; rare — Bugai, Garik, Lyova, Batya, Murka, Alisa, Rogov, **Vasilisk, Tuz,
Rytsar, Pingvin**; epic — Zhora, Samson, **Zver, Arakh, Zhnets, Igla**; legendary — Arkadich, **Kasatik,
Pyatak**. The twelve in bold are the owner's later sheets (references/65…76), graded by me as a proposal
— any grade can be changed in `game-rules/characters.ts`, the price follows it. All characters fight
with the same numbers (`CHARACTER_BASE_STATS`): the abilities drawn on the sheets (regeneration, webs,
rage, splitting…) are looks and story only. Besides direct purchase, the character case (§4c) gives a
missing one for 199 BLATS (v0.2.24; was 299). A locked character is
bought right on the character screen or on its card in the Arsenal («Buy for …»; the server decides),
or tried in practice first — «Try in practice» comes back to where it was pressed (the character screen
with the same character, or the Arsenal's tab). Characters bought before v0.2.18 stay owned.

## 4. The rare-weapon case (talons)

600 talons for one of ten rare weapons (Commissar's Mauser, Udarnik sledgehammer, engraved Tulka, the
beat cop's crossbow, Stroyka nail gun — 12 % each; Tommy gun, Plamya-84 flamethrower, Mukha RPG — 10 %
each; Golden Druzhba, GM-94 grenade launcher — 5 % each). **No duplicates:** owned weapons never drop
and the odds of the rest are renormalised (`caseOdds`); the odds are shown before the purchase. When
the collection is complete the case is no longer sold. Draws use the OS CSPRNG (`crypto.randomInt`).

## 4a. Weapon skins

A skin is a **finish on one particular weapon** («Автомат „Дружба“ · Хохлома») and changes only how it looks
(`game-rules/skins.ts`). Every weapon can wear every finish.

**v0.2.18 part 2 — the owner's line** (references/64-skins-lineup.png): twenty finishes on sale, two
as a welcome gift; the plain factory paint («Standard») stays everyone's. **v0.2.19 — the owner's AK
sheet** (references/83-skins-ak-sheet.png): nineteen more on sale, graded rare, epic and legendary (the
owner: no «Absurd» grade); **four of them live** (about a tenth of the line, `LIVE_FINISHES`): each loops
its own light animation wherever the weapon is drawn — still only the look, at its grade's price.
**39 on sale.**

| Grade | On sale (`SHOP_FINISHES`) | Price each (`SKIN_PRICES`) | In the skin case |
|---|---|---|---|
| regular | Khaki, Worn (+ the gift: Shark, Blatkom ’89) | 99 BLATS ($0.99) | 40 % |
| rare | Spartakiad ’80, Tracksuit, Wild Nineties, Raspberry Jacket, Video Parlour, Cherkizon, Radioactive, Afghan, Tattoo, Film; v0.2.19: Rust King, Street Graffiti, Bone Collector, Blue Chrome, Toxic Waste | v0.2.24: 99 BLATS ($0.99; was $1.99) | 30 % |
| epic | Cosmos ’88, Golden Sunset, Khokhloma, Elektronika, Ice Camo; v0.2.19: Neon District, Hellfire, Canned Fish, Casino Boss, Amethyst, Biohazard X, Pensioner Deluxe, Borscht Edition | v0.2.24: 199 BLATS ($1.99; was $2.99) | 20 % |
| legendary | Tsar’s, The Office, Nuclear Winter; v0.2.19: **Golden Mobster** ✦, Blood Reaper ✦, Red Diamond ✦, Obsidian Emperor ✦, Golden Toilet, Shashlik Master (✦ live) | v0.2.24: 299 BLATS ($2.99; was $4.99) | 10 % |

* **Marks of others are left out** (the owner was told on 2 Nov): no Olympic rings («Спартакиада ’80»,
  the line's «Олимпийский ’80»), no sportswear brand's stripes or logo («Спортивный»: two stripes), no
  religious image («Царский», the line's «Святой калаш»), no state emblem («Контора», the line's «КГБ»:
  gold stars and lines), no prison tattoos («Тату»: ornament), no maker's logo («Электроника»). The
  finishes are painted by code (`apps/web/src/game/render/finish.ts`) over the weapon's pixel art.
* **The welcome gift for early players** (`WELCOME_FINISHES`: «Shark», «Blatkom ’89») — both finishes on
  every weapon. Not sold, never in the case. The server marks the player (`profiles.welcome_gift_at`, set
  at the first inventory read or economy operation) while the gift lasts: `WELCOME_GIFT_UNTIL`
  (ISO date; **unset = no end yet** — the owner sets the date, it is not invented here). Whoever got it
  keeps it after the date. The game says so once in a toast.
* **The first line is retired, not deleted**: Birch Camo, Rust, Winter, Flora, Gzhel, Pioneer, Malachite,
  Party Gold, Amber stay valid ids; whoever owns one keeps it and can wear it (the dressing room shows a
  retired finish only to its owner or wearer); none is sold or dropped any more. Birch Camo and Rust stay
  free for everyone (`FREE_FINISHES`), so a player wearing one keeps it.
* **Direct purchase** (`POST /api/shop/skin {weapon, finish}`): in the dressing room every finish of the
  line can be tried on (and taken into practice); a finish the player does not own shows its grade and
  «Buy for …»; the skin is bought and worn at once. Refusals: `owned` (owned, free or gifted),
  `not_for_sale` (retired, or the gift), `funds`.
* **The skin case** — 199 BLATS ($1.99; v0.2.24, was 299): first the grade is drawn by the chances above (a grade whose
  skins are all owned drops out and the others share its chance — `skinCaseOdds`), then any unowned
  skin of that grade with equal chance (`drawSkin`, OS CSPRNG). No duplicates; only the finishes on sale
  (`CASE_FINISHES`): 39 × 32 weapons = **1 248 skins** (v0.2.18 part 2: 640). The odds open from the
  Arsenal before buying.
* Owned skins are `user_items` rows of kind `skin` (`item_id` = `weapon.finish`); the worn ones are
  `profiles.loadout.skins`, checked against ownership on every read (`ownsSkin` counts the free
  finishes). The room sends everyone's worn skins; the client paints the weapon's pixel art with the
  finish (`apps/web/src/game/render/finish.ts`).

## 4a′. What a skin shows (v0.2.23)

The owner (9 Nov): a skin has to be worth its $1–10 — it has to be *seen*, not only owned. A skin still
changes only the look (all characters and weapons stay equal in combat); what each grade adds is a
table in the shared rules (`SKIN_PERKS`, `game-rules/skins.ts`) that the client reads:

| Grade (price) | In the match | On the fighter cards |
|---|---|---|
| regular ($0.99) | the paint on the weapon in hand; the kill feed's icon painted in it | the card shows the weapon in the finish (a tall card: in its lower right corner, clear of the figure) |
| rare ($0.99; was $1.99) | + the tracers and the muzzle flash (and its light) in the skin's colours | + the card's glow in its colours |
| epic ($1.99; was $2.99) | + a glow round the weapon in hand; a burst in the skin's colours at each elimination | + a light running round the card's frame |
| legendary ($2.99; was $4.99) | + a bigger burst with drifting sparks | + the card's own background (slow rays, sparks), two lights on the frame, the **kill counter** «★ N» |

Four legendaries are also live (their paint moves, since v0.2.19). The colours come from the painter itself
(`apps/web/src/game/render/skinColors.ts` paints a strip with the finish and takes its main and brightest
colours), so a new finish needs no colour table.

**Fighter cards** (`apps/web/src/ui/fighterCard.ts`, one canvas each): the character's art (waist-up hero art;
full-height art per character once it exists — [ART_DIRECTION.md](ART_DIRECTION.md) §6), the weapon in hand big
in its skin, the grade's ribbon and frame, the alias and level. Where they appear:

* **the line-up** — while a match counts down: every fighter's card side by side (teams apart);
* **the killer's card** — while the player waits to respawn (2.5 s): who took them down and with what, in its skin;
* **the results** — the podium (the best three with the weapon last seen in their hands) and «Тебя уложили
  этим» (every *skin* that took the player down this match) with «Примерить» → the Arsenal with that skin on;
  a row of the table opens that player's card;
* **the Arsenal** — the dressing room's poster is the player's own card (the weapon tried on, in its skin);
  it opens big with **«Поделиться»** (the system's share sheet with the picture and the game's address; on a
  computer the picture is saved; inside Telegram the picture is shown to save by a long press).

Practice bots wear skins too (decided per match from a bot's id: 40 % on the main weapon, the same spread as the
filled players below; never the story's people), so the cards and perks show offline as well. The players a room
fills in wear a skin on the main weapon 40 % of the time (was 30 %), drawn from a wider list
(`FILL_FINISHES`): a third regular, a third rare, a fifth epic, an eighth legendary.

**The kill counter** (legendary perk): every elimination online with a weapon wearing a skin is counted for that
skin (`skin_kills`, migration 029: player, weapon, finish, kills). The room counts a person's eliminations with
a skinned weapon (not the filled players'), the match's results file them in the same transaction as the rest
(once per match: `matches.results_processed_at`; never more than the player's eliminations in the match), the
inventory returns them (`skinKills`: «weapon.finish» → kills), the roster sends everyone the counters of the
skins each player has on (`skinKills` by weapon, as of the match's start; the clients add the eliminations they
see). Practice doesn't count. The filled players' counters are made up with the rest of their persona (like
their level).

## 4a″. Sets (v0.2.23)

«Комплект» — a character and the legendary skin made for them, cheaper together (`game-rules/bundles.ts`). Every
epic and legendary character sold for BLATS has one; each legendary finish of the shop is in one set; the skin
goes on the «Дружба» automatic (everyone's primary, so it is worn at once).

| Character (grade) | Skin | Set | Apart |
|---|---|---|---|
| Аркадич (legendary) | «Царский» | 799 BLATS ($7.99) | 998 |
| Касатик (legendary) | «Золотой браток» ✦ | 799 | 998 |
| Пятак (legendary) | «Золотой унитаз» | 799 | 998 |
| Жора (epic) | «Красный алмаз» ✦ | 599 ($5.99) | 798 |
| Самсон (epic) | «Обсидиановый император» ✦ | 599 | 798 |
| Зверь (epic) | «Мастер шашлыка» | 599 | 798 |
| Арах (epic) | «Контора» | 599 | 798 |
| Жнец (epic) | «Кровавый жнец» ✦ | 599 | 798 |
| Игла (epic) | «Ядерная зима» | 599 | 798 |

* Sold only while the player owns **neither** half (a half-owned set is bought item by item); refusals
  `owned`, `funds`, `not_for_sale` (`bundleRefusal`).
* `POST /api/shop/bundle {character}` — one transaction: the BLATS (a ledger row `bundle:<character>`), both
  `user_items` rows (`source: diamonds`), the skin put on the automatic — both items or neither. Analytics
  `shop_purchase` with `kind: bundle`.
* The Arsenal shows the sets in «Персонажи» as fighter cards (the character with the skin on), with the price apart
  struck out; a confirmation before buying; a character's card offers its set too. After the purchase the set's
  character becomes the player's at once and the dressing room shows them with the skin.

## 4b. Paid cases: the rules

The skin case and the character case cost BLATS, i.e. money, so: **the odds are always shown before the purchase**, **no
duplicates**, the server asks for an **18+ confirmation** on every paid case (`confirmAge: true`, else
`400 confirm_age`; the Arsenal's checkbox), and `CASES_ENABLED=false` switches every case off on a
server (`/api/shop/config` → `casesEnabled: false`, the case routes → `403 cases_disabled`) for
markets where paid random items are restricted. Whether and where that is needed is a legal question
for the operator — this document is not legal advice. Every opening is recorded with its price and
currency (`case_openings`).

## 4c. The character case (v0.2.18 part 2)

`CHARACTER_CASE_PRICE` — **199 BLATS ($1.99**; v0.2.24, was 299) for a character the player doesn't have, among the 31 sold
for BLATS (`CASE_CHARACTERS`: never a free one or one of the three for talons). First the grade is drawn
— **40 / 30 / 20 / 10 %** regular / rare / epic / legendary (`CHARACTER_CASE_CHANCE`); a grade the player
has complete drops out and the others share its chance (`characterCaseOdds`) — then any missing
character of that grade with equal chance (`drawCharacter`, OS CSPRNG). No duplicates; when all 31 are
owned the case is no longer sold. The same rules as §4b: the odds (each grade's characters with their
portraits) before buying, «I am 18 or older», `CASES_ENABLED`. `POST /api/shop/character-case` →
`{ character, grade, inventory }`; the opening is a `case_openings` row of kind `character`
(`character_id`; migration 024), the BLATS a ledger row `charcase:<opening>`; analytics `case_opened`
with `kind: character`.

## 4d. A friend's collection (v0.2.18 part 2)

In Friends, a friend's avatar opens their collection: every character (theirs in colour with the grade's
mark) and how many weapon skins of each grade they own (the welcome gift isn't counted).
`GET /api/friends/:id/collection` — friends only (`403 not_friends`), read only. The lobby shows each
player's character with its grade's colour.

## 5. Buying BLATS

`DIAMOND_PACKS`: **99 / 199 / 299 / 499 / 599 / 699 / 799 / 999 / 1 999 / 4 999 BLATS for $0.99 / $1.99 /
$2.99 / $4.99 / $5.99 / $6.99 / $7.99 / $9.99 / $19.99 / $49.99** (1 BLATS = 1 cent; v0.2.24 added 299, 599,
699 and 799 — every price is exactly one pack).

Where they are sold (the owner, 2 Nov: «раздел для покупки БЛАТ и рекламный баннер»):

* **The Arsenal's «Buy BLATS» section** (`apps/web/src/ui/screens/shop.ts`) — the last tab, marked with
  the red coin: a banner with the balance and the rules (1 BLATS = 1 cent, 10 a level, talons never for
  money), then the six packs — a pile of coins growing with the pack, the amount, the price and **what it
  is enough for** (`packHint` in `apps/web/src/ui/blats.ts`, from the price tables: a regular skin, a
  regular character, a legendary skin, an epic character, a legendary and an epic character, 4 ×
  legendary character) — and how to pay. Also reached from the menu's BLATS tile and the wallet's
  «Top up».
* **The menu's BLATS banner** under the Dossier and the Arsenal (desktop and phones; the menu stays one
  screen): the coins, «BLATS», what they buy, «Packs from 99 · $0.99» — it opens the section. It says
  «Buy →» when the packs can be bought where the player is (`blatsSale`): on the website with a provider
  connected, inside Telegram with Stars on — then the price is in Stars, «Packs from 99 · ⭐ 75»;
  otherwise «… · on sale soon».
* The demo (no server) shows the section with «Buying BLATS works in the online version of the game»
  and no banner.

v0.2.18 part 3 connects the two providers the owner chose — the details, the setup and the tests are in
[PAYMENTS.md](PAYMENTS.md):

| Where | Provider | Server keys | State |
|---|---|---|---|
| The website | **Xsolla** Pay Station (cards and local methods) | `XSOLLA_MERCHANT_ID`, `XSOLLA_PROJECT_ID`, `XSOLLA_API_KEY`, `XSOLLA_WEBHOOK_SECRET` | code ready and tested; waiting for the owner's keys |
| The website, without Xsolla | Stripe Checkout (cards) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | code ready; not configured on the live server |
| Inside Telegram | **Telegram Stars** (`XTR`): 75 / 150 / 375 / 750 / 1 500 / 3 750 ⭐ (`STARS_PER_USD` = 75) | the bot's token | code ready and tested with a stand-in for the Bot API; on as soon as the bot is set up |

Without a configured provider the tab says «Payments are being connected — coming soon», the packs
show «Soon», and `POST /api/pay/checkout` answers `503 payments_not_configured` — there is no simulated
purchase anywhere. The crypto method (NOWPayments) was removed in v0.2.18.

**On the website:** `POST /api/pay/checkout {packId, method: 'card'}` creates a `payments` row
(`created`, price from `DIAMOND_PACKS`, never from the client; provider `xsolla` when Xsolla is set up,
else `stripe`) and returns the provider's hosted page URL. The provider tells the server:
`POST /api/pay/xsolla/webhook` (`order_paid`, `order_canceled`, `user_validation`; signature
`sha1(body + secret)`) or `POST /api/pay/stripe/webhook` (signature header `stripe-signature`, 5-minute
tolerance). A verified «paid» notification marks the payment `paid` and credits the BLATS **once** (row
lock + unique ledger index on the payment id); an order for another pack or player, a Stripe session not
in USD or underpaid credits nothing. A refund (Xsolla's `order_canceled` of a paid order, Stripe's
`charge.refunded`) marks the payment `refunded` and takes back the BLATS that are still unspent (ledger
reason `refund`). The browser returns to `/?pay=success|cancel&pid=…` and polls `GET /api/pay/:id`.
Stripe dashboard: webhook endpoint `https://<domain>/api/pay/stripe/webhook` with
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.

**Inside Telegram** digital goods must be paid with Telegram Stars: the Mini App shows the packs in
Stars and the server refuses the website's checkout from Telegram sessions (`403 telegram_stars_only` —
«Inside Telegram, BLATS are sold for Telegram Stars»). A tap: `POST /api/pay/stars {packId}` → a
`payments` row in Stars (`provider 'telegram'`, `currency 'xtr'`) and the bot's invoice link →
`Telegram.WebApp.openInvoice`; the bot says yes to Telegram's `pre_checkout_query` only for an open
invoice of that price made out to that player, and `successful_payment` credits the BLATS once. Stars
are refunded from `/admin` (the player → «Платежи» → «Вернуть звёзды»), which takes back the unspent
BLATS; the bot answers `/paysupport` and `/terms`. The website doesn't sell for Stars
(`403 stars_in_telegram`). A player with Telegram linked to a website account has the same BLATS in both
places.

The game's terms of purchase are `/terms.html` and `/terms-ru.html` (linked under the packs and by the
bot's `/terms`); the operator's name and contact in them are placeholders to fill in.

## 5a. BLATS for levels

`BLATS_PER_LEVEL = 10` for every new level from level 2 (`blatsForLevel`), each level paid once
(`creditLevelBlats`, `apps/server/src/progression/levelRewards.ts`): in the match-results and story
transactions, and whenever the player's own profile is read — so the levels reached before v0.2.18 are
paid the first time the player opens the game after the release, and the menu says «+N BLATS for the
levels you reached». Every credit is a ledger row (currency `diamonds`, reason `level`, ref `level:7`);
a unique index makes a second write of the same level impossible, also under retries and concurrent
requests; `profiles.blats_level` (migration 023) remembers how far the levels are paid. The founder's
level 87 (§7) is paid by the same rule.

## 5b. The welcome bonus and promo codes (v0.2.20)

**The welcome bonus** (the owner: «велком бонус новым пользователям за регистрацию почты — 199 кристаллов BLATS,
показываем вместе с окном регистрации»): `WELCOME_BONUS_BLATS` (199 by default; 0 switches it off) BLATS when a
guest account registers — links an email, or a sign-in provider on the website (Google, Facebook, Discord,
Reddit, Telegram), or is created through one. An account that already had a way to sign in (an email,
Telegram, a provider) is registered already and gets nothing: Telegram players are not offered it (they can't
earn it by adding an email either). Paid once per account (`creditWelcomeBonus`, `apps/server/src/economy/
bonuses.ts`): ledger reason `welcome`, a unique index on it (migration 027), so retries and concurrent
registrations pay once; a database hiccup is logged and never fails the registration. The guest's own profile
carries `welcomeBonus` (the amount on offer) — the welcome window and the profile's account panel show it as a
red «+199 BLATS» strip — and the request that pays it `welcomeCredited` («+199 BLATS — the welcome bonus for
registering»). Accounts that registered before v0.2.20 are not paid retroactively.

**Promo codes** (the owner: «промо код на кристаллы — BLATNOY — 500 кристаллов, это для моих друзей»): `POST
/api/promo {code}` (signed in; 8 tries per player and 30 per address in 10 minutes). The code is spelled out
by the server (`normalizePromoCode`: any case, spaces, Russian letters — «блатной» is BLATNOY) and looked up in
`promo_codes` (migration 027): its BLATS, `active`, an optional `expires_at` and `max_uses`. Each code once per
account (ledger reason `promo`, ref `promo:<CODE>`, unique per player); the code's row is locked while it is
redeemed, so a cap holds under concurrent requests. Answers: 404 `promo_unknown`, 409 `promo_used`, 410
`promo_expired` (switched off, past its date or used up). The field is in the Arsenal's «Buy BLATS» tab. A new
code, or BLATNOY switched off, is one SQL statement:

```sql
INSERT INTO promo_codes (code, diamonds, max_uses, expires_at, note) VALUES ('NEWYEAR', 300, 1000, '2027-01-15T00:00:00Z', 'New Year');
UPDATE promo_codes SET active = false WHERE code = 'BLATNOY';
```

The dashboard's economy page lists both as «Бонус за регистрацию» and «Промокоды» among the flows by reason.

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
levels' BLATS paid as for anybody), every character, weapon, equipment, skin of the current line
(v0.2.19: the 39 on sale on every weapon, plus the welcome gift's mark) and modification as
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

v0.2.23: `packages/shared/src/__tests__/bundles.test.ts` (every epic and legendary character for BLATS has a set,
each legendary finish once, cheaper than apart, at most 999; refusals), `skins.test.ts` (the filled players'
wider grades), `apps/web/src/game/render/skinColors.test.ts` (every finish's light colours follow its paint; the
grades' perks add up), server `economy.test.ts` (a set bought — both or neither, the ledger line, owned and half
owned refused; the inventory's and a room's counters), `progression/recorder.test.ts` (the counters grow once per
match, never past the match's kills, unknown skins left out), `rooms/skinkills.room.test.ts` (a room counts a
person's kills with a skinned weapon, not plain ones or the filled players', the deciding kill too; the roster's
counters); browser: `tests/e2e/v0223.mjs`.

v0.2.20: `apps/server/src/economy/bonuses.test.ts` (the welcome bonus offered to a guest and paid once for an
email, concurrent registrations, nothing for a Telegram account, `WELCOME_BONUS_BLATS=0`; BLATNOY in any
spelling, once per account also concurrently, unknown / switched off / past its date / used up, guests signed
in only); browser: `tests/e2e/v0220.mjs` (the welcome window's strip and the 199 paid, «блатной» in the
Arsenal → +500, the second try refused).

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
`tests/e2e/invite.mjs`, `tests/e2e/skins.mjs`. v0.2.18 part 2: the line, the gift and the retired finishes
(`economy.test.ts`, `skins.test.ts`, server `economy.test.ts`: the gift from the first sign-in and none
after `WELCOME_GIFT_UNTIL`), the character case (shared odds and draws; server: 18+, funds, only the 31 for
BLATS, the collection completes, `CASES_ENABLED`), a friend's collection (`social.test.ts`); browser:
`tests/e2e/v0218b.mjs`. v0.2.18 part 3: `apps/server/src/payments/payments.test.ts` (Telegram Stars and
Xsolla, [PAYMENTS.md](PAYMENTS.md) §5); browser: `tests/e2e/v0218c.mjs` (a pack bought for Stars in the
Mini App end to end).
