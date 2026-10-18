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
with 40-second matches and runs `tests/e2e/play.mjs`, `touch.mjs`, `online.mjs`, `demo.mjs` and
`gadgets.mjs`; with `E2E_ADMIN_USER` / `E2E_ADMIN_PASS` it also logs into `/admin`. Screenshots go to
`test-results/e2e/`. The scripts drive the English UI by its accessible names (`Alias`, `Done`,
`Practice`, `Play with Friends`, `Create a room`, `Ready`, `Start`, `Match report`).

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
| Maps | every spawn, pickup, medkit and supply point on all seven maps is valid and reachable (≥ 6 spawns, ≥ 8 weapon spawns, ≥ 3 medkits, ≥ 5 supply points, minimum spacing); spawn selection avoids visible opponents; 4-bot matches produce eliminations on every map |
| Arsenal & balance (`weapons2.test.ts`) | classic hit counts at 100 HP, paid and rare weapons are sidegrades, heavy weapons slow the carrier, rockets (direct + splash, line of sight, halved self-damage), medkits, loadout slots and sanitising, every modification has a plus and a minus and fits only where it makes sense, silenced shots flagged through the snapshot codec |
| Equipment (`gadgets.test.ts`) | F-1 (fuse, bounces, kill credit, charges refill on respawn), Molotov (fire area, walls protect), smoke (blocks sight lines), flashbang (distance/facing, walls protect), mine (arming, owner-safe), C4 (second press), turret (deploys, shoots, can be destroyed, credits the owner) |
| Economy & payments (`economy.test.ts`) | free items and default loadout, talons once per finished match, purchases (funds, level, ownership, server prices), characters, modifications, equipment, cases without duplicates and `CASES_ENABLED`, concurrent purchases cannot overspend, no checkout without provider keys, Telegram sessions refused (`telegram_stars_only`), Stripe and NOWPayments signature checks, credit-once, underpaid invoices, refunds |
| Email accounts | link email + password (scrypt), sign in on another device, taken emails, wrong passwords, password change, single-use reset links that revoke old sessions, reset mail refused without a mail service |
| Protocol | input/snapshot round-trips, malformed binary input rejected, JSON control messages validated |
| Progression | XP, levels, achievements; shared `applyMatchProgress` (wins, draws, leavers, streaks, rewards); recorder awards XP exactly once under repeated and concurrent completion, stores assists; demo profile (`apps/web/src/profile/localProfile.test.ts`): nickname validation, XP/achievements once per match, sanitising stored data, history cap |
| Multiplayer (`apps/server/src/rooms/realtime.test.ts`) | real HTTP + WS server with independent clients: authoritative combat with identical results and identical per-tick state on both clients; kill events before results; results/XP sent once; speed-hack flood; invalid handshakes/commands and kick after repeated violations; capacity (7th player refused); disconnect → resume same slot → second tab replaces first; grace-period expiry and empty-room cleanup; rematch with separately recorded matches |
| Telegram auth | official HMAC algorithm against an independent implementation; tampered data, wrong bot token, missing/duplicate fields, stale and future `auth_date`; expired/revoked sessions; dev login refused in production; account deletion |
| Guest login (public website) | production server with `GUEST_AUTH_ENABLED`: same browser → same account and chosen nickname, only an HMAC of the device secret stored, weak device ids refused, 11th new guest from one address → 429 while existing guests still sign in, refused when disabled; env rules (`PUBLIC_URL`/`RENDER_EXTERNAL_URL` required in production, Telegram or guest login required, placeholders refused) |
| Analytics | auth required; dedupe by event id across requests and inside a batch; strict props; timestamp clamping; error sanitisation and fingerprints; buffered writer never throws |
| Metrics | DAU/WAU/MAU, D1/D7 cohorts (null until matured), durations, date filters, empty datasets never fabricate values |
| Admin | unauthenticated refused, bootstrap login, audited failures, foreign origins refused, CSRF on state changes, roles, exports escaped/audited/admin-only, player search/sort/pagination/detail; funnel and economy numbers on seeded data (nested steps, refunds, case drops vs purchases, empty ranges), balance grants (admin only, CSRF, reason required, never below zero, ledger + audit), reset links (only with an email, single use, audited), masked emails and exact-email search, the visitor-link race and Telegram sign-ups linked to their visit (`admin/economy-admin.test.ts`) |
| Retention | purge of events, activity, errors, sessions, admin sessions, invitations, audit, password-reset links and visitor statistics, idempotent and batched |
| Browser E2E | offline practice boots and plays; emulated-phone multi-touch sticks move/aim/fire; two browsers: alias dialog → create private room → invite link → join (the other player sees the alias) → start → play with equipment → identical results with the assists column → XP persisted → admin dashboard; single-file demo: alias dialog → practice → staged assist + elimination (3 points) → supply drop banner/crate → Tab table → XP and level-up → profile → reload keeps the profile → settings reset; equipment in the demo build: F-1, smoke, flashbang (overlay), Molotov fire, mine, C4 detonation, turret — each checked against the World state |

## 3. Results of this release (2026-10-19, Node 22.22, PostgreSQL 16, Chromium via Playwright 1.56)

| Run | Result |
|---|---|
| `npm run typecheck` | pass (shared, server, web, web tests, tools) |
| `npm test` (shared + server + web) | **129 / 129 pass** |
| `npm run test:e2e` (development build) | offline practice, touch, two-browser online match (aliases «Courtyard Commandant» / «Night Owl», F-1 seen and exploding on the other client, identical results tables, XP persisted, admin login) and the single-file demo (12/12 checks) passed; the equipment script failed one check («fire hurts the bot» — the Molotov landed off target because the aim was taken while the camera was still easing). The script was fixed (fixed camera for aiming; the bot is put into the flames, which is what the check is about) and then passed 2 / 2 runs on the same build |
| `npm run test:e2e:prod` (the `deploy/` bundle in production mode, guest login, admin) | **all stages pass**: practice, touch, online match with equipment and admin login, demo 12 / 12, equipment 13 / 13 |
| Production builds | web 1.67 MB JS+CSS (minified, Phaser included) + admin bundle, server bundle 0.84 MB + migrations; `deploy/` 167 files, 4.6 MB; single-file demo 4.3 MB |
| Admin dashboard | new «Воронка», «Экономика» and player-card actions checked on seeded data in desktop and phone viewports (screenshots), grant and reset-link flows clicked through |

Notes on the environment: Chromium ran with software GL (SwiftShader), so the game rendered at about
8–12 FPS in automation; the per-frame JavaScript cost measured there was ≈2 ms simulation + scene,
≈1 ms HUD, ≈3 ms render submission. Frame-rate-dependent numbers (e.g. the visual position sync sampled
in `online.mjs`) are informational only; authoritative consistency is asserted in the realtime suite.

## 4. Not verified here

* ESLint / Prettier — could not be installed (npm registry blocked in the build sandbox). `tsc --strict`
  with `noUnusedLocals`/`noUnusedParameters` is the gate that ran.
* Docker image, compose stack, Caddy/HTTPS — no Docker daemon available.
* Inside a real Telegram client (bot + domain needed) and on physical phones.
* Live payments: Stripe and NOWPayments were exercised with signed fixtures and a fake HTTP client, never
  with real accounts; Resend letters were never sent (no key). Telegram Stars are not implemented.
