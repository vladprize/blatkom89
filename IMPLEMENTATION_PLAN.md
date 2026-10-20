# БЛАТКОМ ’89 (BLATKOM ’89) — Implementation Plan

Living document. Status markers: ✅ done & verified · 🟡 done, partially verified · ⛔ not done / not verifiable here.

## 0. Audit (2026-10-18)

- Repository: **empty** — project created from scratch.
- Reference art: 7 images supplied by the product owner, preserved in `references/` (see `docs/ART_DIRECTION.md`).
- Build sandbox constraints (affect *this* environment only, not production):
  - npm registry blocked (HTTP 403 from egress proxy). Dependencies were linked from preinstalled tool
    packages (`typescript`, `esbuild`, `ws`, `zod`, `tsx`, `playwright`) and GitHub tags (`phaser@3.90.0`,
    `postgres@3.4.9`) via `tools/sandbox-link.sh`. Normal environments use `npm install`.
    Consequences: no `package-lock.json` yet, ESLint/Prettier could not be installed or run.
  - No Docker daemon → Dockerfile/compose/Caddy are written but not executed here.
  - PostgreSQL 16 server binaries available → real database used for integration tests.
  - Chromium + Playwright available (software GL, ~8–12 FPS) → automated browser E2E incl. two-browser multiplayer.

## 1. Key technical decisions

| Area | Decision | Why |
|---|---|---|
| Rendering | Phaser 3.90, WebGL, strict top-down orthographic camera, zoom 2 | Spec; rotation-based top-down sprites (legs + torso layers) |
| Pixel density | 1 world px = 2 texels; internal render short side 500 px (250 world px visible), Scale.FIT | Crisp pixel art on any DPR, cheap on mobile, characters readable on phones |
| Netcode | Custom authoritative WebSocket rooms (`ws`) with binary snapshots, client prediction + reconciliation, interpolation, lag-compensated hitscan | Colyseus/Fastify could not be installed or verified in the sandbox; a purpose-built 2–6 player protocol is small, fully tested here, and keeps server authority explicit |
| HTTP | Minimal router on `node:http` (JSON limits, cookies, rate limiting, security headers, static + ETag) | Same reason; small attack surface |
| Simulation | One deterministic `World` in `packages/shared`, used by server rooms, offline practice (bots) and client prediction | Client and server agree on movement, collision and weapons by construction |
| Maps | Code-defined map format (rects + props + decals + lights + spawns) → shared collision builder | Identical geometry on both sides; testable (spawn validity/reachability tests) |
| Art | Procedural asset pipeline (`tools/art`) — top-down 3D-primitive cel-shading renderer → atlases | Original assets that follow the references; reproducible; replaceable by hand-drawn sheets with the same frame layout |
| Lighting | Half-resolution light map with overbright blend (2 × light × scene), batched; lamp fixtures; VHS post-FX with 3 levels and automatic downgrade on slow devices | Warm sodium-lamp mood from the reference without hurting mobile |
| Audio | Runtime WebAudio synthesis (no audio files) | Original, tiny, zero licensing risk |
| DB | PostgreSQL + forward-only SQL migrations + `postgres` driver (parameterised tagged queries) | Spec |
| Validation | zod for HTTP/WS JSON payloads; strict bounds checks in binary decoders | Spec |
| Build | esbuild (web: production/demo/dev; server: single bundle + CLIs), `tsc --strict`, `node:test` | Fast, available offline, deterministic |

## 2. Phases

1. ✅ Foundation — monorepo, TS strict, configs, migrations, docs.
2. ✅ Vertical slice on «Заводская проходная» — movement, aiming, shooting, collisions, server authority, two independent clients (realtime tests + browser E2E).
3. ✅ Complete free gameplay — 4 characters, 4 weapons, 3 maps, lobby, invites, results, rematch, mobile/desktop controls, reconnection, offline practice with bots.
4. 🟡 Telegram — SDK wrapper, server-side initData validation (tested with signed fixtures), invite deep links, safe areas; **not run inside a real Telegram client** (needs bot + domain).
5. ✅ Persistence — profiles, XP, levels, achievements, history, statistics; idempotent results.
6. ✅ Analytics/admin — secure dashboard, metrics, D1/D7, charts, players, errors, CSV, audit log, retention purge.
7. ✅ Visual polish — lighting/fixtures, litter, VHS, effects, synthesized sound, HUD for desktop/landscape/portrait; adaptive quality.
8. 🟡 Deployment — server/web production builds and migrations verified; Docker/compose/Caddy written, **not executed** (no Docker here).

## 2a. Update 2026-10-18 — player feedback (loot, assists, nickname/level)

| Request | Implementation | Status |
|---|---|---|
| More weapon loot on the maps during a match | 10 fixed weapon spawns per map (was 4, respawn 16–20 s); «дефицит» supply drops: 6 supply points per map, first drop at 25 s then every 35 s, обрез/автомат with full magazine + reserve, 30 s lifetime, never next to a living player. Client: army crate with a pulsing ring, «ДЕФИЦИТ ЗАВЕЗЛИ!» banner + chime, blinking minimap marker, screen-edge arrow when off-screen | ✅ shared sim tests (placement, ammo, expiry, reachability of all supply points), demo E2E |
| Rating points for assists, not only kills | Points: elimination +2, assist +1 (≥ 20 damage within 6 s before the elimination, shared `SCORING`); limit in points (50 online / 40 practice); kill feed lists assisters; «+2 УСТРАНЕНИЕ» / «+1 ПОМОЩЬ» popups; Tab table, results, profile, history and admin show assists; +5 XP per assist; DB migration `003_assists.sql`; protocol v2 (`assists` in snapshots and kill events) | ✅ shared + recorder + realtime tests, online and demo E2E |
| Personal nickname / profile and level | First-launch dialog «Как тебя звать на районе?» with random district nicknames; profile strip in the menu (level badge, nickname, XP bar, «✎»); level shown in HUD, nameplates (badge next to the health bar) and the Tab table; the roster is refreshed with the level earned after each match. Online: server profile (`PATCH /api/me`, same validation). Demo (no server): browser-only profile with XP, levels, stats, achievements and history using the same shared `applyMatchProgress` as the server | ✅ unit tests (local profile, shared progression), realtime roster-level test, online E2E (nickname visible to the other player, persisted) and demo E2E (XP, level, reload persistence) |

## 2b. Update 2026-10-19 — the owner's second brief (arsenal, characters, economy, maps, English)

The owner extended the scope beyond the original spec. Where it conflicts with the original text
(«the first release is completely free», «four characters», «three maps»), the owner's later
instructions win; the original criteria are re-evaluated in §4.

| Request (owner) | Implementation | Status |
|---|---|---|
| Classic shooter balance, many more weapons | 32 weapons (4 free, 18 in the Arsenal, 10 rare from cases): pistols, melee, SMGs, shotguns, rifles, snipers, LMG, launchers with server-side rockets and splash; classic hit counts at 100 HP; paid/rare weapons are sidegrades (test); medkits on every map | ✅ shared sim tests (balance, rockets, medkits, loadouts), realtime + E2E |
| Characters from the owner's sheets | 14 characters with lore, portraits cut from the sheets and re-modelled top-down rigs; equal combat stats; Soviet street names; the eagle «Pendos» per the owner | ✅ |
| Arsenal sheet, modifications instead of upgrades, equipment «all now» | 6 modifications (each with a plus and a minus) per weapon; 7 equipment types (F-1, smoke, flashbang, Molotov, mine, C4, turret) in the deterministic sim, HUD slot 4, G key / middle mouse / touch button | ✅ shared gadget tests, gadgets E2E (all seven against a bot), online E2E |
| Economy: tokens, diamonds, shop, cases | talons from online matches (capped), diamonds for money (100 = $1); prices, levels, cases without duplicates (CSPRNG, published odds, `CASES_ENABLED`); everything transactional with a ledger | ✅ economy integration tests |
| Real payments | Stripe Checkout (card) and NOWPayments (crypto) with verified webhooks, credit-once, refunds take back unspent diamonds; no simulated purchases. Inside Telegram card/crypto are disabled (UI + server `telegram_stars_only`) — Telegram requires Stars for digital goods; **Stars not implemented** | 🟡 provider code tested with signed fixtures; **not run against live provider accounts** (keys needed) |
| Email linking | email + password (scrypt) to restore the account on another device; password change; reset by letter (Resend) or one-time admin link | ✅ integration tests; 🟡 Resend not called live (key needed) |
| Four new maps from the owner's layouts | Construction Site, House of Culture, Gastronom, City Hospital No. 3 rebuilt in the map format with new props/floors; validated (spawns, reachability, medkits, supply) and played by bots | ✅ map tests, screenshots reviewed |
| «The whole game in English with Soviet jargon and naphthalene» | All player-facing text (menus, HUD, shop, lore, weapons, achievements, server messages, privacy policy, logo «BLATKOM ’89») in English; in-world signage stays Cyrillic; `/admin` stays Russian | ✅ E2E follow the English UI |
| Admin analytics for the new parts | «Воронка» (visitor and new-player cohorts, referrers), «Экономика» (talons/diamonds by reason, revenue, payers, ARPPU, purchases, modifications, cases), player card with wallet/items/ledger/payments, audited balance grants and password-reset links, masked emails | ✅ `admin/economy-admin.test.ts`, seeded-data screenshots |

## 2c. Update 2026-10-19 — «Правки по Блатком v2» and objective modes

| Request (owner) | Implementation | Status |
|---|---|---|
| 1. English and Russian | `apps/web/src/i18n`: English source strings, a 580-entry Russian dictionary (+ Russian texts of characters, weapons, maps, achievements, refusals and the server's English messages), Russian plurals, gender-neutral wording; language from Telegram/browser (Russian for ru/be/kk/ky), EN/RU switch in the menu and in Settings, remembered; Cyrillic logo, Russian privacy policy (`privacy-ru.html`), bilingual alias suggestions | ✅ `i18n.test.ts` (every key, plural and server message covered), E2E in both languages |
| 2. Symmetric main screen per the drawing | play column «District Business» on the left; on the right the character card, then a «Dossier» tile (level, alias, XP, wallet) and an Arsenal tile of the same height | ✅ screenshots desktop / phone / landscape |
| 3. Arsenal button with a weapon icon, more prominent | the Arsenal tile with a big TT pistol and the title | ✅ |
| 4. Weapon icons the same size | all weapon, equipment and modification icons re-rendered into fixed boxes by their drawn bounds (`renderInBox`) | ✅ |
| 5. Arsenal: the player's character trying on shop weapons | the dressing room: the character's portrait from the BLATKOM sheets holding the weapon being tried on, and the same character «in the game» drawn from the game's sprites with the right grip, muzzle flash and sound on «Fire!»; «Test in practice» | ✅ E2E checks the art loads; screenshots |
| «Character visuals at the BLATKOM level» | hero art from the owner's sheets in the dressing room, the character cards and the new «Personal File» on the character screen | ✅ |
| 6. Map selection with square top-down thumbnails | thumbnails captured from the real renderer for all seven maps; tile pickers in practice, rooms and lobby | ✅ |
| 7. Up to 10 players; free-for-all or two teams red/blue | rooms of 10 (14 spawns per map), team deathmatch with balancing, team switching in the lobby, no friendly fire, team score/limit, team HUD/scoreboard/results/XP; Quick Match per mode | ✅ shared + realtime tests, E2E |
| 8. Talons per match by eliminations | 5 per elimination, 2 per assist, 5 for finishing (≤ 100), breakdown on the results screen | ✅ economy tests |
| 9. Menu soundtrack | «Hurt» (Infraction & Emerel Gray) in menus/lobby/results, fades in matches, volume and mute | 🟡 works; **the licence for use in a game must be confirmed by the operator** |
| Capture the flag and base capture | `ctf` (flag stands on every map, steal/carry/drop/return/capture, 3 captures) and `bases` (A, B, C, capture bars, contested zones, a point per base per second, 250 points); objective bots; protocol v6; flags and bases in the world with team light, HUD strip, minimap, edge markers, banners, kill-feed lines, sounds; Tab/results columns; XP per capture; admin «Режимы» chart | ✅ `objectives.test.ts`, realtime test, `modes.mjs` and demo E2E |

## 2d. Update 2026-10-19 (evening) — owner's polish list

| Request (owner) | Implementation | Status |
|---|---|---|
| Centre the main menu (the logo and the panels) | on screens where the whole menu fits (≥ 761 × 720 px) two equal flexible rows around the block, the footer at the bottom; phones keep scrolling from the top | ✅ demo E2E measures 1440×900 (equal space above and below), screenshots 1280×720, 1920×1080, phone |
| The whole alias visible in the Dossier tile | `ui/fit.ts`: one line from 17 px down to 12 px measured exactly with 8 px to spare (the owner's screen showed the first version touching the edge: it fitted the text exactly, and heavier font rendering ran past it), a very long alias on two lines; never clipped vertically (the owner's Mac draws the glyphs lower than a tight line box: the box no longer hides overflow and the line is taller); the same for the profile header | ✅ checked with 7-, 14- and 24-character aliases, with the game font and with a system font; demo E2E asserts the alias is whole and above the XP bar |
| Map names symmetric and inside the tiles | tiles rebuilt: the map picture (new thumbnails at the map's own aspect) centred above a caption band that is the same on every tile, one font size for all captions that fits the longest name; the selected map's band is red | ✅ demo E2E (7 captions inside one band, one size), screenshots EN/RU, desktop/phone |
| The soundtrack should start right away | autoplay at start-up where allowed; otherwise «▶ Play» at the end of the loading screen starts the music with the menu (browsers do not allow sound before a tap) | ✅ `modes.mjs`: Play starts the music; with autoplay allowed there is no start screen and the music plays |
| Profile avatars (PlayStation-style) | the owner's 24 round pixel portraits (`tools/crop-avatars.py`); the picker opens from the avatar in the Dossier tile or the profile; saved in `profiles.avatar` (migration 007, `PATCH /api/me {avatar}`, validated against `AVATAR_IDS`) or in the demo's local profile; other players see it in the lobby (roster), without one the character's portrait | ✅ API and realtime tests, web unit test (every id has a picture and EN/RU names), demo and online E2E |
| Ranks by level (like Tanki Online) | — | ⏸ on hold by the owner |

## 2e. Update 2026-10-19 (night) — a match can always start

| Request (owner) | Implementation | Status |
|---|---|---|
| In every mode — Quick Match and games with friends — add bots for balance so a game can always start; nowhere may it say they are bots | filled lineups (`MATCH_FILL_BOTS`, default on; docs/NETCODE.md §2a): the room completes the lineup with players it runs itself (the practice AI through the same input path as clients) — 4 in free-for-all, 3 a side in team modes, sides always even; Quick Match after a 5 s head start, one by one, the match starts by itself ≈ 10 s after a lone person came; rooms with friends at kick-off — «Start» works for one person; people take filled places at once or after 0.5–2 s, people who leave are replaced after 2.5–6 s; names like people's, levels near theirs, avatars, characters and gear; `isBot` never leaves the server (roster and results mark nobody, UUID ids, the public room info counts the whole lineup); only people are recorded, places and rewards count everyone, «played with friends» needs two people; `matches.bot_count` (migration 008), analytics `fill`, «Добор» in the admin's live rooms; filled players never get a practice bot's name | ✅ shared fill tests, `rooms/fill.test.ts` (tick by tick), recorder test, E2E `fill.mjs` on a server with the fill on |
| (found on the way) bots' path finding | the A* search stopped after 6000 cells, so on the larger maps long ways round failed and the bot searched again every tick — standing still (visible in practice too) and costing up to 17 % of a core for one capture-the-flag room; now a search may cover the whole map and reuses one search space per map (identical paths, 2× faster), a bot searches at most four times a second for a moving goal, otherwise every 0.7–1.1 s — a room with filled players costs 0.25–0.5 % of a core | ✅ old/new paths identical on 2800 random queries; shared test (farthest spawns connected on every map, few searches, no misses); bot tests |

## 2f. v0.23 (2026-10-20) — owner's list

| Request (owner) | Implementation | Status |
|---|---|---|
| Remove the black square «shadow» behind every character | the drop-shadow sprite under characters (a 48 px gradient scaled down with pixel-art sampling and turned with the aim) is gone, in matches and in the Arsenal preview | ✅ (the owner's screen showed it; headless Chromium draws it too faintly to measure — to be confirmed on the owner's Mac) |
| The Arsenal symmetric and ergonomic, per the sketch, with the RU/EN case banners | the Arsenal is wider (1200 px); the dressing room has three columns — the character art, the item (name, text, the in-game view with its buttons side by side, a «Buy for …» button when it isn't yours) and on the right the owner's case banner in the player's language over a diamond top-up card; the kit's four columns have the same rows: what you own, then the shop's cheapest items for that slot (dashed, with prices; a click tries them on), and the «more in the shop» button at the bottom; phones get compact rows | ✅ demo E2E (banner in the right language right of the dressing room; four columns with equal heights and rows; a shop tile tried on with its price), screenshots 1440×900, 1280×720 RU, 1000 px, phone |
| Of 14 characters only 2 free (rooster, panther), then 6 for talons and 6 for diamonds | `CHARACTER_PRICES`: Uchastkovy 150 (lvl 1), Mikhalych 200 (2), Karlych 300 (3), Sonka 400 (5), Tolyan 550 (7), Gosha 700 (9) talons; Vityok 199, Lyova / Slavik 299, Zhora / Garik 399, Batya 499 💎; accounts made before keep the wolf and the bear (migration 009) | ✅ economy tests (split, the migration's own SQL) |
| The same with weapons — a bit more for diamonds than for talons | free kit: Makarov, crowbar, AK-47; the sawn-off becomes the cheapest talon weapon (100); 9 for talons, 10 for diamonds; existing accounts keep the sawn-off | ✅ economy tests |
| Unique aliases | an alias is unique among living accounts whatever the letter case, spacing, Ё/Е or Cyrillic letters drawn like Latin ones («Сом» = «Com»): the key is computed in code (`shared/game-rules/aliases.ts`, `users.name_key`, unique index) because database locales fold Cyrillic differently; migration 010 + its code step (`database/codeSteps.ts`) give every alias to its oldest living holder and number the later ones; new accounts with a taken name (Telegram first name, guest name) get «Name 2»; the alias dialog checks as you type (`GET /api/names/check`) and offers free variants; `PATCH /api/me` refuses a taken alias (409) | ✅ shared alias tests, migration test on a database with duplicates, API tests, E2E `social.mjs` |
| On entering the game, a native window offers to create an account by email so purchases and level are not lost; one can continue as a guest | the account window of a guest in a browser: register an email (the guest account keeps everything and gets the email + password), «I already have an account — sign in», «Continue as guest» (asked again a day later); not shown inside Telegram (the account is the Telegram account) nor to invite links (the player joins the room first) | ✅ E2E `social.mjs` (A registers from the window and is not asked after a reload; B continues as a guest), `online.mjs` |
| Friends by alias, see them online, invite them to matches, private messages | friendships (request → accept, both ways at once when both asked), presence over a social WebSocket `/ws/social` (online / in a lobby / in a match / offline with «seen … ago»), private messages between friends (500 characters, unread badges, read receipts «✓✓», 50 per page, kept 180 days), invitations from the room you are in delivered live as a card («Join» / «Leave and join»), «Play» next to a friend creates a room and invites them; the lobby lists friends to invite; menu: Friends (online count, badge for unread + requests) and Top-100; everything rate-limited and only between friends | ✅ `social/social.test.ts` (requests, presence, messages, invitations, deletion), E2E `social.mjs` (two browsers, desktop EN + phone RU) |
| A Top-100 leaderboard by rating, level and eliminations — like a real game | rating (start 1000; free-for-all by place among everyone present ±16, team win/loss ±16, leaving −16, never below 0) recorded per match; the table shows real players with at least one finished online match, distinct places (ties go to the other measure, then the older account), «your place» outside the top too, «+» to send a friend request; ratings of matches played before v0.23 are replayed from their stored results by migration 010 | ✅ rating unit tests, recorder/leaderboard API tests, migration replay test, E2E |

## 3. Open risks / next steps

- Run `npm install` once with registry access and commit `package-lock.json`; run `npm run lint` and `npm run format:check` (never executed here).
- Build and run the Docker stack on the target host; test a backup restore.
- Live Telegram verification on iOS/Android/Desktop/Web (checklist in `docs/TELEGRAM.md` §4).
- Real-device performance pass (only software-GL headless Chromium was available; JS cost per frame measured at ~6 ms there).
- Fill the operator placeholders in `apps/web/public/privacy.html` (operator, contact, email provider, payment-record and backup retention).
- Payments: create Stripe / NOWPayments accounts, set the keys and webhooks (docs/ECONOMY.md §5) and make one real test purchase and refund on the deployed site; check consumer-law and loot-box rules for the target markets.
- Telegram Stars for diamonds inside the Mini App (docs/TELEGRAM.md, «Payments inside Telegram»).
- Resend (or another mail provider) with a verified sender domain for password-reset letters.
- Content growth (more maps/characters) fits the existing map format and atlas conventions.
- Confirm the menu music licence («Hurt», Infraction & Emerel Gray) for use in the game, or replace it.
- Balance of the new modes with real players (capture limit 3, base limit 250, 15 s flag return, 6 s base capture are first guesses tuned with bots).
- Filled lineups: tune `FILL_RULES` (lineup sizes, the 5 s head start, pacing) and the AI's difficulty by level once real traffic shows how often people play alone; watch the host's CPU (≈ 0.1 ms per filled player per tick).

## 4. Acceptance checklist (state on 2026-10-19)

| Criterion | Status | Evidence |
|---|---|---|
| The project builds successfully | ✅ | `npm run typecheck`; `node apps/web/build.mjs --mode=production`; `node apps/server/build.mjs` |
| The server starts | ✅ | bundled `apps/server/dist/server.js` started against PostgreSQL; `/api/health`, `/api/ready` OK |
| PostgreSQL works | ✅ | migrations 001–010 applied; DB-backed integration tests (incl. economy, payments, email, admin funnel/economy) on PostgreSQL 16 |
| Strict top-down 2D camera; not isometric / first-person | ✅ | orthographic camera, top-down sprites; screenshots in all modes |
| Flagship factory map fully playable | ✅ | offline E2E + online two-browser E2E on «Заводская проходная» |
| Four characters playable | ✅ | now 14 (4 free + 10 from the Arsenal) with sprites, portraits and animations; locked ones are refused by the server unless owned |
| Three maps functional | ✅ | now 7 maps; spawn/pickup/medkit/supply reachability tests and bot matches with eliminations on every map |
| Four weapon categories work | ✅ | 32 weapons: pistols, melee, SMGs, shotguns, rifles, snipers, LMG, launchers; 7 equipment types; balance and gadget tests |
| Two or more independent clients can play together | ✅ | `rooms/realtime.test.ts` (WS clients) and `tests/e2e/online.mjs` (two browsers) |
| Movement and combat are synchronized | ✅ | identical per-tick snapshot state on both clients; kill/damage events identical |
| Damage and scoring are server-authoritative | ✅ | clients send inputs only; speed-hack flood test; walls block shots |
| Match results are consistent | ✅ | identical `results` on both clients; identical results tables in E2E |
| XP is awarded correctly | ✅ | recorder tests (once under retries/concurrency, draws are not wins); E2E profile check |
| Profiles persist | ✅ | E2E reads `/api/me` after the match (matchesPlayed, XP, level) |
| Players can invite friends | 🟡 | invite code/link → join verified in browsers; Telegram share sheet/`startapp` not tried in Telegram |
| Mobile controls work | 🟡 | emulated-phone multi-touch test (move, aim, fire) passes; layouts checked portrait/landscape; no physical device |
| Telegram authentication is validated server-side | ✅ | HMAC algorithm per official docs; tests with signed fixtures, tampering, stale/future data |
| The application opens through its configured Mini App URL | ⛔ | needs a real bot + HTTPS domain (steps in `docs/TELEGRAM.md`) |
| The administrator dashboard is protected | ✅ | server-side sessions, CSRF, roles, rate limits, audit; tests for unauthenticated/role/CSRF |
| Dashboard metrics use real data | ✅ | metrics computed from PostgreSQL; nulls shown as «нет данных» |
| Player search and detail views work | ✅ | admin HTTP tests + browser screenshots |
| Retention calculations are documented | ✅ | `docs/ANALYTICS.md` |
| Analytics events are deduplicated | ✅ | UUID primary key, tests across requests and inside batches |
| CSV export works | ✅ | export tests incl. formula-injection neutralisation |
| Critical tests pass | ✅ | 169/169 unit+integration; browser E2E (development and production mode) — see `docs/TESTING.md` §3 |
| No real secrets are exposed | ✅ | `.env*` ignored; bot token/DB/session secrets server-only; logger redaction |
| Deployment instructions match the actual project | 🟡 | non-Docker path executed locally; Docker/compose/Caddy not executed |
| The first release is completely free | ⚠️ changed by the owner | free to play with optional purchases (owner's request): talons from matches, diamonds for money on the website; fight-changing extras (modifications, equipment) cost talons only; paid weapons are sidegrades |
| Real payments work end-to-end | ⛔ | Stripe / NOWPayments code, signatures and credit-once are tested with fixtures; no live provider account, so no real purchase has been made |
| Diamonds inside Telegram (Stars, `XTR`) | ⛔ | not implemented; card/crypto disabled inside Telegram (UI + server) |
| Password-reset letters | 🟡 | Resend integration written; not sent live (no key). Admin one-time reset links work (tested) |
| Whole game in English with Soviet flavour | ✅ | all player-facing texts; E2E drive the English UI; signage on maps stays Cyrillic by design; `/admin` Russian |
| English and Russian | ✅ | every player-facing string in both languages (test); switch in the menu; E2E with a Russian browser |
| Up to 10 players, team modes, capture the flag, base capture | ✅ | shared, realtime and E2E tests (see 2c) |
| Menu music licence | ⛔ | not verifiable here — operator to confirm before launch |
| Lint/format clean | ⛔ | ESLint/Prettier unavailable in the build sandbox (tsc strict with unused-code checks passes) |
