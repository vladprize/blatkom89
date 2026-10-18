# Architecture

БЛАТКОМ ’89 is a TypeScript monorepo with three packages and one deployable process.

```
apps/web         Phaser 3 client (game, menus, Telegram Mini App glue) + admin dashboard page
apps/server      Node.js process: HTTP API, static hosting, WebSocket game rooms, PostgreSQL access
packages/shared  Code both sides run: simulation, maps & collision, weapons, rules, wire protocol, schemas
tools/art        Procedural asset pipeline (sprites, tiles, effects) → apps/web/public/assets
infra/           Dockerfile, Caddy reverse proxy, backup script (docker-compose.yml at the root)
tests/e2e        Playwright scripts (offline practice, two-browser online match, art/UI screenshots)
```

## 1. Runtime picture

```
 Telegram app / browser                          one Node.js process (apps/server)                    PostgreSQL
┌──────────────────────────┐   HTTPS (REST)    ┌──────────────────────────────────────────────┐    ┌──────────────┐
│ apps/web                 │ ────────────────▶ │ http/router  → api/auth, profile, rooms,     │──▶ │ users,       │
│  App (DOM menus/lobby)   │                   │                 events, admin                │    │ profiles,    │
│  Phaser GameScene/HUD    │   WebSocket /ws   │ rooms/gateway → RoomManager (60 Hz loop)     │    │ matches, ... │
│  OnlineSession (predict, │ ◀═══════════════▶ │   MatchRoom × N → shared World (authoritative)│──▶ │ analytics,   │
│  interpolate) or         │  binary inputs ↑  │ services: sessions, recorder, invites,       │    │ admin, audit │
│  OfflineSession (bots)   │  binary snapshots↓│           analytics (buffered writer)        │    └──────────────┘
└──────────────────────────┘  JSON control     └──────────────────────────────────────────────┘
```

* **Single process, single port.** The same server serves `index.html` + assets, `/admin`, `/api/*` and
  upgrades `/ws`. Horizontal scaling is not needed for the MVP (one process hosts hundreds of 2–6 player
  rooms; rooms are independent). Scaling later = several processes behind a sticky router keyed by room id.
* **Server authority.** Clients send only inputs (movement axes, aim angle, buttons, weapon slot, the
  timeline they were viewing). The room runs the shared `World` and decides movement, hits, damage,
  eliminations, respawns, scores, match end and results. See [NETCODE.md](NETCODE.md).
* **One simulation, three users.** `packages/shared/src/sim/world.ts` runs on the server (rooms), in the
  browser for offline practice with bots, and in the browser for client-side prediction of the local
  player. Map collision (`maps/collision.ts`) is generated from the same map definitions on both sides,
  so the client and server agree on geometry by construction.

## 2. Packages in detail

### packages/shared
| Module | Contents |
|---|---|
| `constants/game.ts` | tick rate (60 Hz), snapshot rate (30 Hz), speeds, rewind window, quantisation scales, input limits |
| `game-rules/` | characters (4, identical stats), weapons (pistol, обрез, автомат, монтировка), match config & phases, scoring (elimination +2, assist +1), XP/levels/achievements and `applyMatchProgress` — the one progression rule set used by the server recorder and by the demo's browser-only profile |
| `maps/` | map format (`types.ts`), prop registry (footprints, collision, render layer), `MapBuilder`, the three maps, collision world (grid + rects + circles, ray casts, swept movement) |
| `sim/world.ts` | deterministic match simulation: movement with sliding, weapons (fire rate, spread, reload, ammo, pickups), «дефицит» supply drops, lag-compensated hitscan, melee, damage with per-attacker damage log (assists), respawn, spawn selection, scoring, phase machine |
| `sim/bots.ts`, `sim/nav.ts` | offline bot AI (grid A*, line-of-sight aiming, difficulty levels) |
| `net/codec.ts`, `net/protocol.ts` | binary input/snapshot codec with bounds checks; zod-validated JSON control messages; close codes |
| `events/analytics.ts`, `schemas/api.ts` | analytics event schemas, HTTP request/response schemas and types |

### apps/server
| Module | Responsibility |
|---|---|
| `index.ts` | boot: env validation → DB pool → migrations (advisory lock) → persistence → rooms → HTTP + WS |
| `config/env.ts` | zod-validated environment (refuses dev login, missing bot token or placeholder secrets in production) |
| `http/` | tiny router (params, JSON body limits, errors), bearer auth, static files (CSP, ETag, cache rules) |
| `rooms/` | `RoomManager` (shared 60 Hz loop, quick match, limits), `MatchRoom` (lobby, phases, input queues, snapshots, results), `gateway` (WS upgrade, origin/IP limits, hello authentication) |
| `auth/` | Telegram `initData` HMAC validation, dev login (non-production only), opaque random session tokens (only an HMAC-SHA-256 of the token is stored) |
| `profiles/`, `progression/` | profile reads/updates, idempotent match recorder (XP, levels, wins/streaks, achievements) |
| `analytics/` | event ingestion with UUID dedupe, buffered server events, sanitised error log, metrics (DAU/WAU/MAU, D1/D7, charts), retention purge |
| `admin/` | admin auth (scrypt, HttpOnly cookie + CSRF), roles, audit log, dashboard API, CSV export with formula-injection protection, CLI |
| `database/` | `postgres` driver (parameterised tagged templates only), forward-only SQL migrations |
| `services/` | contracts between rooms and persistence; PostgreSQL and in-memory implementations |

### apps/web
| Module | Responsibility |
|---|---|
| `app/App.ts` | screens: menu (profile strip: level, nickname, XP), character select, practice setup, friends (create/join), lobby, game, results, profile, settings, errors; first-launch nickname dialog |
| `profile/` | nickname dialog and suggestions; the demo build's browser-only profile (`localProfile.ts` pure rules + `localStore.ts` localStorage) — the online build always uses the server profile |
| `net/` | REST client, `GameConnection` (WS, reconnect with backoff, ping), `OnlineClient` (auth, rooms, lobby state) |
| `game/session/` | `OfflineSession` (local World + bots), `OnlineSession` (prediction, reconciliation, interpolation, delayed remote events) — both expose the same `GameSession` interface to the scenes |
| `game/scenes/` | `BootScene` (loading), `GameScene` (fixed-step loop, camera, events → feedback), `HudScene` (HUD, touch controls, scoreboard), `PreviewScene` (animated map behind menus) |
| `game/render/` | map renderer (tiles, decals, litter, props, walls, overhead layer, culling), lighting (light map, fixtures), effects, character views, VHS post-process |
| `game/input/` | keyboard/mouse input and twin-stick touch controls (move stick, aim stick, fire/reload/swap buttons, left-handed mode) |
| `game/audio/Sfx.ts` | WebAudio-synthesised sound effects with distance attenuation (no audio files) |
| `telegram/tg.ts` | Mini Apps SDK wrapper: init, safe areas, back button, haptics, sharing, confirm dialogs |
| `analytics/client.ts` | batched client events with UUIDs, flushed with `keepalive` when the app is hidden |
| `admin/` | the `/admin` dashboard (separate entry, never loaded by players) |

## 3. Data model (PostgreSQL)
Migrations: `apps/server/src/database/migrations/` (`001_init.sql`, `002_fk_retention_indexes.sql`).

`users` (internal UUID, Telegram id unique, display name, language) · `profiles` (level, XP, matches,
wins, losses, kills, deaths, playtime, streaks, preferred character) · `sessions` (token hash, expiry,
platform) · `user_daily_activity` (UTC day per user — DAU/retention) · `matches` (map, room, timestamps,
end reason, `results_processed_at`) · `match_participants` (place, kills, deaths, score, damage, won,
XP awarded) · `achievements` / `player_achievements` · `invitations` (code → room, expiry, open count) ·
`analytics_events` (UUID PK = dedupe) · `app_errors` · `admin_users` / `admin_sessions` /
`admin_audit_log`. Canonical vs derived data and every metric definition: [ANALYTICS.md](ANALYTICS.md).

## 4. Deliberate deviations from the suggested stack

| Suggested | Used | Reason |
|---|---|---|
| Colyseus | own rooms on `ws` | The npm registry was unreachable while building, so Colyseus could not be installed or verified. The custom room layer is ~800 lines on the server, tested end-to-end (8 realtime integration tests + browser E2E) and keeps server authority explicit. |
| Fastify | `node:http` + small router | Same constraint; the ~190-line router covers params, JSON limits, errors, rate limits and security headers. |
| Vite | esbuild | Available offline; one script builds web (production/demo/dev/watch) and server bundles. |
| Vitest/Jest | `node:test` | Built into Node 22; no extra dependencies. |

Swapping in Fastify/Colyseus later is possible behind the existing `services/contracts.ts` boundary.

## 5. Future monetisation boundary (not implemented)
The first release is free and contains no payment code. Telegram Stars (currency `XTR`) would be added
as a separate `commerce/` module: catalogue → order (server-side price) → `sendInvoice`/`createInvoiceLink`
→ `pre_checkout_query` validation → `successful_payment` → idempotent entitlement grant → inventory read
by the client (cosmetics only, never stats). Nothing in the current schema or client assumes purchases.
