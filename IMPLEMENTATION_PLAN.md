# БЛАТКОМ ’89 — Implementation Plan

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

## 3. Open risks / next steps

- Run `npm install` once with registry access and commit `package-lock.json`; run `npm run lint` and `npm run format:check` (never executed here).
- Build and run the Docker stack on the target host; test a backup restore.
- Live Telegram verification on iOS/Android/Desktop/Web (checklist in `docs/TELEGRAM.md` §4).
- Real-device performance pass (only software-GL headless Chromium was available; JS cost per frame measured at ~6 ms there).
- Fill the operator placeholders in `apps/web/public/privacy.html` (operator, contact, backup rotation).
- Content growth (more maps/characters) fits the existing map format and atlas conventions.

## 4. Acceptance checklist (state at the end of this session)

| Criterion | Status | Evidence |
|---|---|---|
| The project builds successfully | ✅ | `npm run typecheck`; `node apps/web/build.mjs --mode=production`; `node apps/server/build.mjs` |
| The server starts | ✅ | bundled `apps/server/dist/server.js` started against PostgreSQL; `/api/health`, `/api/ready` OK |
| PostgreSQL works | ✅ | migrations 001–002 applied; 34 DB-backed integration tests on PostgreSQL 16 |
| Strict top-down 2D camera; not isometric / first-person | ✅ | orthographic camera, top-down sprites; screenshots in all modes |
| Flagship factory map fully playable | ✅ | offline E2E + online two-browser E2E on «Заводская проходная» |
| Four characters playable | ✅ | selectable in menu/lobby, used by players and bots; sprites + animations for all four |
| Three maps functional | ✅ | spawn/pickup reachability tests and bot matches with eliminations on every map |
| Four weapon categories work | ✅ | pistol, обрез, автомат (pickups), монтировка; weapon unit tests |
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
| Critical tests pass | ✅ | 69/69 unit+integration, browser E2E suite passes (see `docs/TESTING.md`) |
| No real secrets are exposed | ✅ | `.env*` ignored; bot token/DB/session secrets server-only; logger redaction |
| Deployment instructions match the actual project | 🟡 | non-Docker path executed locally; Docker/compose/Caddy not executed |
| The first release is completely free | ✅ | no payment code; Stars only described as a future module |
| Lint/format clean | ⛔ | ESLint/Prettier unavailable in the build sandbox (tsc strict with unused-code checks passes) |
