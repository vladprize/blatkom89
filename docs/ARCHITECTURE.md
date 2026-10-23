# Architecture

BLATKOM ’89 (БЛАТКОМ ’89) is a TypeScript monorepo with three packages and one deployable process.

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
  upgrades `/ws`. Horizontal scaling is not needed for the MVP (one process hosts hundreds of 2–10 player
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
| `game-rules/` | characters (14, identical stats), weapons (32: base, Arsenal, rare; modifications), equipment (7 gadgets), loadouts, economy (prices, talons per match by eliminations and assists, cases, diamond packs), match config & phases, game modes (`ffa`, `teams`, `ctf`, `bases`; `CTF_RULES`, `BASE_RULES`, limits), scoring (elimination +2, assist +1, objective points), XP/levels/achievements and `applyMatchProgress` — the one progression rule set used by the server recorder and by the demo's browser-only profile |
| `maps/` | map format (`types.ts`: spawns, pickups, medkits, supply points, flag stands, bases), prop registry (footprints, collision, render layer), `MapBuilder`, the ten maps, collision world (grid + rects + circles, ray casts, swept movement) |
| `sim/world.ts` | deterministic match simulation: movement with sliding, weapons (fire rate, spread, reload, ammo, pickups, modifications), rockets with splash, equipment (grenades, smoke, fire, mines, C4, turrets), medkits, «deficit goods» supply drops, lag-compensated hitscan, melee, damage with per-attacker damage log (assists), teams (balancing, no friendly fire, team score), flags and bases, respawn, spawn selection (team halves), scoring, phase machine |
| `sim/bots.ts`, `sim/nav.ts` | bot AI for offline practice and for filled online lineups (grid A* over the whole map with a reused search space, searches rate-limited per bot; line-of-sight aiming, difficulty levels; team-aware; in objective modes raiders, flag guards, flag returns, escorts and base takers) |
| `sim/fill.ts`, `game-rules/nicknames.ts` | filled online lineups: `FILL_RULES` (4 in free-for-all, 3 a side, pacing), `fillTarget`, `fillPersona` (a name, level, avatar, character and gear like a person's); alias suggestions shared with the client |
| `net/codec.ts`, `net/protocol.ts` | binary input/snapshot codec with bounds checks; zod-validated JSON control messages; close codes |
| `events/analytics.ts`, `schemas/api.ts` | analytics event schemas, HTTP request/response schemas and types |

### apps/server
| Module | Responsibility |
|---|---|
| `index.ts` | boot: env validation → DB pool → migrations (advisory lock) → persistence → rooms → HTTP + WS |
| `config/env.ts` | zod-validated environment (refuses dev login, missing bot token or placeholder secrets in production) |
| `http/` | tiny router (params, JSON body limits, errors), bearer auth, static files (CSP, ETag, cache rules) |
| `rooms/` | `RoomManager` (shared 60 Hz loop, quick match, limits), `MatchRoom` (lobby, phases, input queues, snapshots, results; filled lineups — players the room runs with `BotBrain`, shown to clients exactly like people, docs/NETCODE.md §2a; the room chat — relayed, rate-limited, never stored, §2c), `gateway` (WS upgrade, origin/IP limits, hello authentication) |
| `auth/` | Telegram `initData` HMAC validation, guest login (HMAC of a browser secret), email + password (scrypt) with reset tokens, dev login (non-production only), opaque random session tokens (only an HMAC-SHA-256 of the token is stored); v0.3: OAuth 2.0 providers (`oauth.ts` — Google, Facebook, Discord, Reddit: signed intent/state, nonce cookie, one-time hand-over codes; routes in `api/oauth.ts`) and Telegram Login on the website (`telegramLogin.ts`) — [SIGN_IN.md](SIGN_IN.md); V2.0 part E: `telegramLink.ts` — Telegram attached to an existing account (the bot's one-time code from the website, or an email sign-in inside Telegram; an empty first-launch profile released and kept as `merged_into`) — [TELEGRAM.md](TELEGRAM.md) §4 |
| `economy/`, `payments/` | wallet, purchases, modifications, cases (rare weapons, weapon skins) and loadouts with a ledger (row locks, one transaction per change); Stripe / NOWPayments checkouts and verified webhooks, credit-once, refunds ([ECONOMY.md](ECONOMY.md)) |
| `profiles/`, `progression/` | profile reads/updates, idempotent match recorder (XP, levels, rating, wins/streaks, achievements) |
| `social/`, `api/social.ts` | friends (requests, acceptance), private messages between friends, invitations to a room, the Top-100; `SocialHub` holds the social WebSockets (`/ws/social`): presence (online / lobby / match from `RoomManager.roomOf`) and live events; unique aliases in `auth/names.ts` |
| `kon/`, `api/kon.ts` (V2.0 part D) | «Блатной кон»: `applyKonResults` (called by the match recorder for Kon matches: Elo for the players and for gangs that played as one side), the player's numbers, history and the tables; Kon rooms are `MatchRoom`s with `kon` (people only, fixed sides) found by `RoomManager.konQuick` ([KON.md](KON.md)) |
| `story/`, `api/story.ts` (v0.2.13) | the story mode's server side: signed tickets for an open mission, the 15-second rule, `StoryRepo.complete` — the mission's talons and XP once, the chapter's achievement, characters and skins (owned ones in talons), level achievements and $BLAT, all in one transaction on the locked profile row ([STORY.md](STORY.md)) |
| `blat/`, `api/blat.ts` (V2.0) | $BLAT: `creditLevels` (every unpaid level, called by the match recorder and by the player's own profile read), referral codes, attaching a new account to its inviter, confirming after a whole match (from the recorder and `GET /api/blat`), the inviter's tiered reward, the daily cap / flags → admin review; every credit a ledger row with a unique operation id ([BLAT.md](BLAT.md)) |
| `clubs/`, `api/clubs.ts` (v0.3) | clubs: the table, a club's page, founding, join requests answered by the head, leaving / showing out / handing over / disbanding, live notices through `SocialHub`; `moveClubRatings` (called by the match recorder) moves a club's rating with its members'; `house.ts` — the game's own clubs: people and rating drift computed from a seed, requests answered after a few minutes; admin list and removal in `admin/routes.ts` |
| `telegram/bot.ts`, `services/keepAwake.ts` (v0.3) | the Telegram bot's webhook (`/start` → the game's link; V2.0: `/start ref_<code>` → the referral, `/start link_<code>` → «Link and play»), its set-up on start-up; keeping a free host awake after the bot hands out a link |
| `analytics/` | event ingestion with UUID dedupe, buffered server events, sanitised error log, metrics (DAU/WAU/MAU, D1/D7, charts), retention purge |
| `admin/` | admin auth (scrypt, HttpOnly cookie + CSRF), roles, audit log, dashboard API, CSV export with formula-injection protection, CLI |
| `database/` | `postgres` driver (parameterised tagged templates only), forward-only SQL migrations; `codeSteps.ts` for the few that need application code in the same transaction (010: alias keys, replayed ratings) |
| `services/` | contracts between rooms and persistence; PostgreSQL and in-memory implementations |

### apps/web
| Module | Responsibility |
|---|---|
| `app/App.ts` | screens: menu (play column; character card, «Dossier» profile tile and the Arsenal tile; language and music switches), character select with the personal file, practice setup (map tiles, mode, 1–9 bots), Quick Match mode chooser, friends (create/join), lobby (team columns in team modes), game, results, profile, settings, credits, errors; first-launch nickname dialog |
| `i18n/` | English (source strings) and Russian (`ru.ts`, `ru-content.ts` for characters, weapons, maps…): `t()`, Russian plurals, language detection (Telegram → browser → English), switching at run time |
| `ui/` | DOM helpers, screens (Arsenal with the dressing room, lobby, results, settings, account, profile, `social.ts` — Friends, conversations, Top-100, the lobby's invite panel, invitation cards; `welcome.ts` — the account window of a guest), map pickers with thumbnails, mode switch and pictograms, the in-game «doll» preview, `fit.ts` (texts that shrink to fit: aliases, map captions), `avatars.ts` (profile avatars and the picker), `chat.ts` (the room chat: the lobby/results panel and the overlay over the match, placed from the HUD layout the HUD scene publishes on `hudBus`) |
| `profile/` | nickname dialog and suggestions; the demo build's browser-only profile (`localProfile.ts` pure rules + `localStore.ts` localStorage) — the online build always uses the server profile |
| `net/` | REST client, `GameConnection` (WS, reconnect with backoff, ping; V2.0 part E: a socket quiet for 6 s (confirmed over two pings) is replaced, `resume()` replaces one quiet for 2.5 s at once, attempts don't run out in the background), `OnlineClient` (auth — with the bot's `?tglink=` code in Telegram —, rooms, lobby state, the room chat's last 60 lines), `SocialClient` (the social socket and the friends store: presence, unread counts, requests, invitations; `resume()` pings and reopens) |
| `app/lifecycle.ts`, `app/safeArea.ts` (V2.0 part E) | pause / resume from Telegram's `deactivated` / `activated`, a hidden page, `pageshow` and `online` (music, effects, held touch controls, connection checks); the screen's safe areas in CSS px for the canvas HUD |
| `game/session/` | `OfflineSession` (local World + bots), `OnlineSession` (prediction, reconciliation, interpolation, delayed remote events) — both expose the same `GameSession` interface to the scenes |
| `story/` (v0.2.13) | the story mode: `StorySession` (an `OfflineSession` with the mission's sides, kit, waves, lives, objective and cues), `script.ts` (every word, EN/RU), `controller.ts` (the hub, comics, mission start / end, rewards), `comic.ts`, `overlay.ts` (objective line and barks over the HUD), `backend.ts` (the server's progress online, this browser's in the single file) ([STORY.md](STORY.md)) |
| `game/scenes/` | `BootScene` (loading), `GameScene` (fixed-step loop, camera, events → feedback), `HudScene` (HUD, touch controls, scoreboard), `PreviewScene` (animated map behind menus) |
| `game/render/` | map renderer (tiles, decals, litter, props, walls, overhead layer, culling), lighting (light map, fixtures, objective light pools), effects, character views (team rings and name colours; weapon skins painted by `finish.ts` into canvas textures, `skins.ts`), equipment, flags and bases (`ObjectiveView`), VHS post-process |
| `game/input/` | keyboard/mouse input and twin-stick touch controls (move stick, aim stick, fire/reload/swap buttons, left-handed mode) |
| `game/audio/` | `Sfx.ts` — WebAudio-synthesised sound effects with distance attenuation; `Music.ts` — the menu soundtrack (streamed MP3, tries to start without a tap, moves onto the shared audio context after the first tap, fades out in matches; `main.ts` shows «▶ Play» when the browser wants a tap) |
| `telegram/tg.ts` | Mini Apps SDK wrapper: init, safe areas (CSS variables + an event for the HUD), back button, haptics, sharing, confirm dialogs; in matches fullscreen on phones and the landscape lock only while held sideways; `deactivated` / `activated` → `app/lifecycle.ts` |
| `analytics/client.ts` | batched client events with UUIDs, flushed with `keepalive` when the app is hidden |
| `admin/` | the `/admin` dashboard (separate entry, never loaded by players) |

## 3. Data model (PostgreSQL)
Migrations: `apps/server/src/database/migrations/` (`001_init.sql` … `011_skins.sql`: assists, guest auth, economy and email, team modes — `matches.mode` (`ffa`/`teams`/`ctf`/`bases`), `matches.winner_team`, `match_participants.team`; avatars; filled lineups; v0.23 unlocks; social — `users.name_key` (unique alias key), `profiles.rating`, `match_participants.rating_delta`, `friendships`, `direct_messages`; weapon skins — `user_items` of kind `skin`, `case_openings.kind`/`finish_id`; `012_free_economy.sql` — `case_openings.currency`; `013_clubs.sql` — `clubs`, `club_members` (one club per player), `club_requests`; `014_latin_names.sql` — a code step that transliterates aliases and club names to Latin letters; `015_identities.sql` — `user_identities` (provider + the provider's id → user), `auth_handoffs` (hashed one-time sign-in codes), `users.oauth_only`; V2.0: `016_blat.sql` — $BLAT balances in `profiles`, `users.ref_code`, `referrals`, $BLAT rows in `currency_ledger`; `017_blat_drop.sql` — `app_settings`, `blat_snapshots`, `blat_snapshot_rows`; `018_kon.sql` — the Kon rating and record in `profiles` and `clubs`, `matches.kon_format`, `match_participants.kon_delta`; `019_telegram_link.sql` — `telegram_link_codes`, `users.merged_into` / `merged_at` and the widened `users_identity_check`). Every V2.0 migration only adds (the 019 check only grows); nothing existing is dropped or rewritten.

`users` (internal UUID, Telegram id unique, display name, language) · `profiles` (level, XP, matches,
wins, losses, kills, deaths, playtime, streaks, preferred character) · `sessions` (token hash, expiry,
platform) · `user_daily_activity` (UTC day per user — DAU/retention) · `matches` (map, room, timestamps,
end reason, `results_processed_at`) · `match_participants` (place, kills, deaths, score, damage, won,
XP awarded) · `achievements` / `player_achievements` · `invitations` (code → room, expiry, open count) ·
`analytics_events` (UUID PK = dedupe) · `app_errors` · `admin_users` / `admin_sessions` /
`admin_audit_log` · `friendships` (a pending request is one row, an accepted friendship two) ·
`direct_messages` (between friends, 180 days). Canonical vs derived data and every metric definition: [ANALYTICS.md](ANALYTICS.md).

## 4. Deliberate deviations from the suggested stack

| Suggested | Used | Reason |
|---|---|---|
| Colyseus | own rooms on `ws` | The npm registry was unreachable while building, so Colyseus could not be installed or verified. The custom room layer is ~800 lines on the server, tested end-to-end (8 realtime integration tests + browser E2E) and keeps server authority explicit. |
| Fastify | `node:http` + small router | Same constraint; the ~190-line router covers params, JSON limits, errors, rate limits and security headers. |
| Vite | esbuild | Available offline; one script builds web (production/demo/dev/watch) and server bundles. |
| Vitest/Jest | `node:test` | Built into Node 22; no extra dependencies. |

Swapping in Fastify/Colyseus later is possible behind the existing `services/contracts.ts` boundary.

## 5. Monetisation (owner's decision, 2026-10)
The game is free to play with optional purchases ([ECONOMY.md](ECONOMY.md)): talons are earned in
matches, diamonds are bought on the website through Stripe (card) or NOWPayments (crypto) — prices come
from the server, payments are confirmed only by signed webhooks and credited once. Inside the Telegram
Mini App purchases for money are disabled until Telegram Stars (`XTR`) are integrated: the same
`payments` table already accepts `provider = 'telegram'`; the flow is `createInvoiceLink` →
`pre_checkout_query` validation → `successful_payment` → idempotent crediting (see TELEGRAM.md).
