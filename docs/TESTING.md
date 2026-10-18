# Testing

## 1. How to run

```bash
npm run typecheck                                   # tsc --strict for shared, server, web, tools
DATABASE_URL_TEST=postgres://…/blatkom_test npm test # unit + integration (each DB test file gets its own schema)
DATABASE_URL=postgres://…/disposable npm run test:e2e # browsers: practice, touch, two-player online, admin
npm run lint && npm run format:check                 # ESLint + Prettier (see §4)
```
`npm run test:e2e` builds the web client, the server bundle and the single-file demo, starts the server
with 40-second matches and runs `tests/e2e/play.mjs`, `touch.mjs`, `online.mjs` and `demo.mjs`; with
`E2E_ADMIN_USER` / `E2E_ADMIN_PASS` it also logs into `/admin`. Screenshots go to `test-results/e2e/`.

Art/UI review helpers (screenshots, not assertions): `tests/e2e/tour.mjs` (fixed camera positions on a
map), `ui-tour.mjs` (click through menus), `shot.mjs` (any URL, optional phone emulation).

## 2. What is covered

| Area | Tests |
|---|---|
| Movement & collisions | normalised diagonals, acceleration, walking speed, sliding along walls, map bounds, ray casts (`packages/shared/src/__tests__/sim.test.ts`) |
| Weapons & combat | fire interval, ammo, reload timing, empty-magazine auto-reload, walls block shots, damage → elimination → score → respawn, spawn protection, melee, pickups/drops, lag compensation |
| Match lifecycle | score limit and time limit end the match; standings; draws share a place and are nobody's win |
| Scoring & loot | elimination +2 / assist +1 (6 s window, 20 damage minimum, the killer’s own damage is not an assist), an assist can end the match; supply drops land on a free supply point away from living players with full ammo and expire; every map has ≥ 8 weapon spawns and ≥ 5 reachable supply points |
| Maps | every spawn and pickup on all three maps is valid and reachable; spawn selection avoids visible opponents; 4-bot matches produce eliminations on every map |
| Protocol | input/snapshot round-trips, malformed binary input rejected, JSON control messages validated |
| Progression | XP, levels, achievements; shared `applyMatchProgress` (wins, draws, leavers, streaks, rewards); recorder awards XP exactly once under repeated and concurrent completion, stores assists; demo profile (`apps/web/src/profile/localProfile.test.ts`): nickname validation, XP/achievements once per match, sanitising stored data, history cap |
| Multiplayer (`apps/server/src/rooms/realtime.test.ts`) | real HTTP + WS server with independent clients: authoritative combat with identical results and identical per-tick state on both clients; kill events before results; results/XP sent once; speed-hack flood; invalid handshakes/commands and kick after repeated violations; capacity (7th player refused); disconnect → resume same slot → second tab replaces first; grace-period expiry and empty-room cleanup; rematch with separately recorded matches |
| Telegram auth | official HMAC algorithm against an independent implementation; tampered data, wrong bot token, missing/duplicate fields, stale and future `auth_date`; expired/revoked sessions; dev login refused in production; account deletion |
| Analytics | auth required; dedupe by event id across requests and inside a batch; strict props; timestamp clamping; error sanitisation and fingerprints; buffered writer never throws |
| Metrics | DAU/WAU/MAU, D1/D7 cohorts (null until matured), durations, date filters, empty datasets never fabricate values |
| Admin | unauthenticated refused, bootstrap login, audited failures, foreign origins refused, CSRF on state changes, roles, exports escaped/audited/admin-only, player search/sort/pagination/detail |
| Browser E2E | offline practice boots and plays; emulated-phone multi-touch sticks move/aim/fire; two browsers: nickname dialog → create private room → invite link → join (the other player sees the nickname) → start → play → identical results with the assists column → XP persisted → admin dashboard; single-file demo: nickname dialog → practice → staged assist + elimination (3 points) → supply drop banner/crate → Tab table → XP and level-up → profile → reload keeps the profile |

## 3. Results of this release (2026-10-18, Node 22.22, PostgreSQL 16, Chromium via Playwright 1.56)

| Run | Result |
|---|---|
| `npm run typecheck` | pass (incl. `apps/web/tsconfig.test.json`) |
| `npm test` (shared + server + web) | **77 / 77 pass** (31 shared, 35 PostgreSQL-backed, 8 realtime multiplayer, 3 web) |
| `npm run test:e2e` | **pass**: practice match boots and plays; emulated-phone multi-touch; two browsers — nickname «Комендант Двора» chosen in the first-launch dialog and shown in the other player's lobby and in both results tables → identical results (draw shown as «Ничья») → XP, level and assists persisted → admin players table with the «Помощь» column; single-file demo — 12/12 checks (nickname, 3 points from an assist + an elimination, supply banner, XP + level-up, profile, persistence after reload, profile reset) |
| Production builds | web 1.49 MB JS+CSS (minified, Phaser included), server bundle 0.68 MB + migrations |

Notes on the environment: Chromium ran with software GL (SwiftShader), so the game rendered at about
8–12 FPS in automation; the per-frame JavaScript cost measured there was ≈2 ms simulation + scene,
≈1 ms HUD, ≈3 ms render submission. Frame-rate-dependent numbers (e.g. the visual position sync sampled
in `online.mjs`) are informational only; authoritative consistency is asserted in the realtime suite.

## 4. Not verified here

* ESLint / Prettier — could not be installed (npm registry blocked in the build sandbox). `tsc --strict`
  with `noUnusedLocals`/`noUnusedParameters` is the gate that ran.
* Docker image, compose stack, Caddy/HTTPS — no Docker daemon available.
* Inside a real Telegram client (bot + domain needed) and on physical phones.
