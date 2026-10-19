# Testing

## 1. How to run

```bash
npm run typecheck                                   # tsc --strict for shared, server, web, tools
DATABASE_URL_TEST=postgres://…/blatkom_test npm test # unit + integration (each DB test file gets its own schema)
DATABASE_URL=postgres://…/disposable npm run test:e2e # browsers: practice, touch, two-player online, admin
DATABASE_URL=postgres://…/disposable npm run test:e2e:prod # the same against deploy/ in production mode (guest login)
npm run lint && npm run format:check                 # ESLint + Prettier (see §4)
```
`npm run test:e2e` builds the web client, the server bundle and the single-file demo, starts the server
with 40-second matches and runs `tests/e2e/play.mjs`, `touch.mjs`, `online.mjs`, `modes.mjs`, `demo.mjs`
and `gadgets.mjs` (the online scripts press «▶ Play» on the start screen, as a player would); with `E2E_ADMIN_USER` / `E2E_ADMIN_PASS` it also logs into `/admin`. Screenshots go to
`test-results/e2e/`. The scripts drive the UI by its accessible names and `data-testid`s — mostly the
English UI (`Alias`, `Done`, `Practice`, `Play with Friends`, `Create a room`, `Ready`, `Start`,
`Match report`); `modes.mjs` runs its second browser in Russian (`Кличка`, `Готово`, `К бою!`,
`Протокол матча`, `Быстрый матч`).

Art/UI review helpers (screenshots, not assertions): `tests/e2e/tour.mjs` (fixed camera positions on a
map), `mapshot.mjs` (any map at given points), `ui-tour.mjs` (click through menus), `shot.mjs` (any URL,
optional phone emulation).

## 2. What is covered

| Area | Tests |
|---|---|
| Movement & collisions | normalised diagonals, acceleration, walking speed, sliding along walls, map bounds, ray casts (`packages/shared/src/__tests__/sim.test.ts`) |
| Weapons & combat | fire interval, ammo, reload timing, empty-magazine auto-reload, walls block shots, damage → elimination → score → respawn, spawn protection, melee, pickups/drops, lag compensation |
| Match lifecycle | score limit and time limit end the match; standings; draws share a place and are nobody's win |
| Scoring & loot | elimination +2 / assist +1 (6 s window, 20 damage minimum, the killer’s own damage is not an assist), an assist can end the match; supply drops land on a free supply point away from living players with full ammo and expire; every map has ≥ 8 weapon spawns and ≥ 5 reachable supply points |
| Maps | every spawn, pickup, medkit and supply point on all seven maps is valid and reachable (≥ 12 spawns for 10-player rooms, ≥ 8 weapon spawns, ≥ 3 medkits, ≥ 5 supply points, minimum spacing); spawn selection avoids visible opponents; 4-bot matches produce eliminations on every map; flag stands and bases A/B/C open, reachable, in order, far apart, and both teams walk about the same distance to the enemy flag (within 15 %) |
| Team matches (`teams.test.ts`) | ten players per room, newcomers join the smaller team, balancing at the start (bots and latest arrivals move), each team starts on its own half, no friendly fire (bullets pass through teammates, blasts, fire, mines, turrets and flashbangs spare them; the owner's own blast still hurts), team score and limit, team standings and draws, team in the snapshot, bots only target enemies |
| Objective modes (`objectives.test.ts`) | four modes and their limits; capture the flag: taking, carrying, capturing only while your own flag is home, dropping on elimination / leaving / disconnecting, returning by touch and by itself after 15 s, re-taking a dropped flag, eliminations not counted for the team, the carrier bonus, three captures win; base capture: one player takes a neutral base in 6 s and two take it faster, contested bases don't move, an enemy pushes the bar back first, abandoned bars fade, a point per base per second and the limit; respawns on the home half; flags, bases and captures through the snapshot codec; XP per capture; 6-bot matches on the factory map steal flags and take bases |
| Avatars | `PATCH /api/me {avatar}`: set, kept, removed with null, unknown ids refused, the database check, the session carries it to the room (`auth.api.test.ts`); the lobby roster shows each player's avatar (`realtime.test.ts`); the demo profile keeps it through matches and storage, unknown ids dropped, every id has a picture and English and Russian names (`localProfile.test.ts`) |
| Languages (`apps/web/src/i18n/i18n.test.ts`) | every `t()` string of the client (≈580) and every player-facing English message of the server has a Russian translation with the same placeholders; `t()` is only called with literals; every plural unit has Russian forms; Russian plural rules; aliases suggested in the player's language |
| Arsenal & balance (`weapons2.test.ts`) | classic hit counts at 100 HP, paid and rare weapons are sidegrades, heavy weapons slow the carrier, rockets (direct + splash, line of sight, halved self-damage), medkits, loadout slots and sanitising, every modification has a plus and a minus and fits only where it makes sense, silenced shots flagged through the snapshot codec |
| Equipment (`gadgets.test.ts`) | F-1 (fuse, bounces, kill credit, charges refill on respawn), Molotov (fire area, walls protect), smoke (blocks sight lines), flashbang (distance/facing, walls protect), mine (arming, owner-safe), C4 (second press), turret (deploys, shoots, can be destroyed, credits the owner) |
| Economy & payments (`economy.test.ts`) | free items and default loadout, talons once per finished match, purchases (funds, level, ownership, server prices), characters, modifications, equipment, cases without duplicates and `CASES_ENABLED`, concurrent purchases cannot overspend, no checkout without provider keys, Telegram sessions refused (`telegram_stars_only`), Stripe and NOWPayments signature checks, credit-once, underpaid invoices, refunds |
| Email accounts | link email + password (scrypt), sign in on another device, taken emails, wrong passwords, password change, single-use reset links that revoke old sessions, reset mail refused without a mail service |
| Protocol | input/snapshot round-trips, malformed binary input rejected, JSON control messages validated |
| Progression | XP, levels, achievements; shared `applyMatchProgress` (wins, draws, leavers, streaks, rewards); recorder awards XP exactly once under repeated and concurrent completion, stores assists; demo profile (`apps/web/src/profile/localProfile.test.ts`): nickname validation, XP/achievements once per match, sanitising stored data, history cap |
| Multiplayer (`apps/server/src/rooms/realtime.test.ts`) | real HTTP + WS server with independent clients: authoritative combat with identical results and identical per-tick state on both clients; kill events before results; results/XP sent once; speed-hack flood; invalid handshakes/commands and kick after repeated violations; capacity (11th player refused); team matches (dealing, switching, no friendly fire, team results); capture the flag through the server (take, carry, capture, captures in snapshots, results and the match record) and base capture via Quick Match by mode; disconnect → resume same slot → second tab replaces first; grace-period expiry and empty-room cleanup; rematch with separately recorded matches; byte ranges for the music file (`http/static.test.ts`) |
| Telegram auth | official HMAC algorithm against an independent implementation; tampered data, wrong bot token, missing/duplicate fields, stale and future `auth_date`; expired/revoked sessions; dev login refused in production; account deletion |
| Guest login (public website) | production server with `GUEST_AUTH_ENABLED`: same browser → same account and chosen nickname, only an HMAC of the device secret stored, weak device ids refused, 11th new guest from one address → 429 while existing guests still sign in, refused when disabled; env rules (`PUBLIC_URL`/`RENDER_EXTERNAL_URL` required in production, Telegram or guest login required, placeholders refused) |
| Analytics | auth required; dedupe by event id across requests and inside a batch; strict props; timestamp clamping; error sanitisation and fingerprints; buffered writer never throws |
| Metrics | DAU/WAU/MAU, D1/D7 cohorts (null until matured), durations, date filters, empty datasets never fabricate values |
| Admin | unauthenticated refused, bootstrap login, audited failures, foreign origins refused, CSRF on state changes, roles, exports escaped/audited/admin-only, player search/sort/pagination/detail; funnel and economy numbers on seeded data (nested steps, refunds, case drops vs purchases, empty ranges), balance grants (admin only, CSRF, reason required, never below zero, ledger + audit), reset links (only with an email, single use, audited), masked emails and exact-email search, the visitor-link race and Telegram sign-ups linked to their visit (`admin/economy-admin.test.ts`) |
| Retention | purge of events, activity, errors, sessions, admin sessions, invitations, audit, password-reset links and visitor statistics, idempotent and batched |
| Browser E2E | offline practice boots and plays; emulated-phone multi-touch sticks move/aim/fire; two browsers: alias dialog → create private room → invite link → join (the other player sees the alias) → start → play with equipment → identical results with the assists column → XP persisted → admin dashboard (login, game-mode chart, the live room listed with its Russian map and mode names); game modes (`modes.mjs`): «▶ Play» on the start screen starts the menu music (Chromium refuses sound without a tap) and a browser that allows autoplay gets the menu and the music without the start screen; A picks an avatar and B sees it in the lobby; an English and a Russian browser in a capture-the-flag room — red and blue columns, mode switching that keeps the teams, flags in both HUDs in each language, team results with a Flags column, Quick Match «Base Capture» puts both into one room; single-file demo: alias dialog → menu profile and Arsenal tiles → the menu block centred at 1440×900 and the alias fully visible → the map tiles' seven captions inside one band at one size → practice → staged assist + elimination (3 points) → supply drop banner/crate → Tab table → XP and level-up → profile → the avatar picker (24 portraits) → the avatar in the profile and the Dossier tile → capture the flag with bots (staged steal and capture, HUD strip, team results) → base capture (base B taken and scoring) → Arsenal dressing room with the character art → switch to Russian → reload keeps the profile and the avatar → settings reset; equipment in the demo build: F-1, smoke, flashbang (overlay), Molotov fire, mine, C4 detonation, turret — each checked against the World state |

## 3. Results of this release (2026-10-19, Node 22.22, PostgreSQL 16, Chromium via Playwright 1.56)

| Run | Result |
|---|---|
| `npm run typecheck` | pass (shared, server, web, web tests, tools) |
| `npm test` (shared + server + web) | **172 / 172 pass** (incl. the avatar API, roster and demo-profile tests, the 15 objective-mode tests, the CTF / base-capture realtime test, the language-coverage tests and the music byte-range test) |
| `npm run test:e2e` (development build, admin) | **all stages pass**: practice, touch, online match («▶ Play» pressed on the start screen, aliases «Courtyard Commandant» / «Night Owl», F-1 seen and exploding on the other client, identical results, XP persisted, admin login), game modes 14 / 14 (incl. «▶ Play» starts the menu music; with autoplay allowed no start screen and the music already playing; B sees A's avatar in the lobby), demo 25 / 25 (incl. the menu block centred at 1440×900 — 148 px above and below, the alias fully visible, seven map captions inside one band at one size, the avatar picked from 24 and kept after a reload), equipment 13 / 13 (run before the alias got its room to spare) |
| `npm run test:e2e:prod` (the `deploy/` bundle in production mode, guest login, admin) | **all stages pass** on the shipped bundle: practice, touch, online match with equipment and the admin dashboard (login asserted, «Режимы» chart, the live room listed as «Заводская проходная · Каждый сам за себя»), game modes 14 / 14, demo 25 / 25, equipment 13 / 13 |
| Production builds | web 1.88 MB JS+CSS (minified, Phaser included) + admin bundle 0.07 MB, server bundle 0.73 MB + migrations; `deploy/` 264 files, 8.7 MB (2.1 MB of it the menu soundtrack, 0.3 MB the avatars); single-file demo 6.8 MB |
| Screens | the menu at 1280×720, 1440×900, 1920×1080 and on a phone; aliases of 14 and 24 characters in the Dossier tile (with room to spare at the end); the avatar picker on desktop (6 × 4) and phone (4 × 6), the avatar in the Dossier tile and the profile; the map tiles in English and Russian, desktop and phone; the start screen on desktop and phone (and the music playing after the tap) — screenshots |

Notes on the environment: Chromium ran with software GL (SwiftShader), so the game rendered at about
8–12 FPS in automation; the per-frame JavaScript cost measured there was ≈2 ms simulation + scene,
≈1 ms HUD, ≈3 ms render submission. Frame-rate-dependent numbers (e.g. the visual position sync sampled
in `online.mjs`) are informational only; authoritative consistency is asserted in the realtime suite.

## 4. Not verified here

* ESLint / Prettier — could not be installed (npm registry blocked in the build sandbox). `tsc --strict`
  with `noUnusedLocals`/`noUnusedParameters` is the gate that ran.
* Docker image, compose stack, Caddy/HTTPS — no Docker daemon available.
* Inside a real Telegram client (bot + domain needed) and on physical phones.
* Team modes with many real players over real networks: capture the flag and base capture were played
  by bots and by two local browsers; their limits (3 captures, 250 points, 15 s flag return, 6 s base
  capture) are first guesses.
* The menu soundtrack's licence for use in the game (a legal check for the operator, not a test).
* Live payments: Stripe and NOWPayments were exercised with signed fixtures and a fake HTTP client, never
  with real accounts; Resend letters were never sent (no key). Telegram Stars are not implemented.
