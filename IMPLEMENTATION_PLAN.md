# БЛАТКОМ ’89 — Implementation Plan

Living document. Status markers: ✅ done & verified · 🟡 done, partially verified · ⏳ in progress · ⛔ blocked/not done.

## 0. Audit (2026-10-18)

- Repository: **empty** — project created from scratch.
- Reference art: 7 images supplied by the product owner, preserved in `references/` (see `docs/ART_DIRECTION.md`).
- Build sandbox constraints (affect *this* environment only, not production):
  - npm registry blocked (HTTP 403 from egress proxy). Dependencies were linked from preinstalled tool
    packages (`typescript`, `esbuild`, `ws`, `zod`, `tsx`, `playwright`) and GitHub tags (`phaser@3.90.0`,
    `postgres@3.4.9`) via `tools/sandbox-link.sh`. Normal environments use `npm install`.
  - No Docker daemon → Docker images/compose are written but not executed here.
  - PostgreSQL 16 server binaries available → real database used for integration tests.
  - Chromium + Playwright available → automated two-browser multiplayer E2E.

## 1. Key technical decisions

| Area | Decision | Why |
|---|---|---|
| Rendering | Phaser 3.90, WebGL, strict top-down orthographic camera | Spec; rotation-based top-down sprites (legs + torso layers) |
| Pixel density | 1 world px = 2 texels; internal render height 540 px (270 world px visible), CSS-upscaled | Crisp pixel art on any DPR, cheap on mobile |
| Netcode | Custom authoritative WebSocket rooms (`ws`) with binary snapshots, client prediction + reconciliation, interpolation, lag-compensated hitscan | Colyseus/Fastify could not be installed or verified in the sandbox; a purpose-built 2–6 player protocol is small, fully tested here, and keeps server authority explicit |
| HTTP | Minimal router on `node:http` (JSON, cookies, rate limiting, security headers, static) | Same reason; small attack surface |
| Simulation | One deterministic `World` in `packages/shared`, used by server rooms *and* offline practice (bots) | Client and server agree on movement, collision and weapons by construction |
| Maps | Code-defined map format (rects + props + spawns + lights) → shared collision builder | Client & server use identical geometry; testable |
| Art | Procedural asset pipeline (`tools/art`) — top-down 3D-primitive cel-shading renderer → PNG spritesheets + JSON metadata | Original assets that follow the references; reproducible; replaceable by hand-drawn sheets with the same frame layout |
| Audio | Runtime WebAudio synthesis (no audio files) | Original, tiny, zero licensing risk |
| DB | PostgreSQL + SQL migrations + `postgres` driver (parameterized tagged queries) | Spec |
| Validation | zod for HTTP/WS JSON payloads; hand-rolled bounds checks in binary decoders | Spec |
| Build | esbuild (web bundle + server bundle), tsc --strict typecheck, node:test | Fast, available, deterministic |

## 2. Phases

1. ⏳ Foundation — monorepo, TS strict, configs, migrations, docs.
2. ⏳ Vertical slice on «Заводская проходная» — movement, aiming, shooting, collisions, server authority, 2 clients.
3. ⏳ Complete free gameplay — 4 characters, 4 weapons, 3 maps, lobby, invites, results, mobile/desktop controls, reconnection.
4. ⏳ Telegram — SDK wrapper, initData auth, invite deep links, safe areas.
5. ⏳ Persistence — profiles, XP, levels, achievements, history.
6. ⏳ Analytics/admin — secure dashboard, metrics, D1/D7, errors, CSV.
7. ⏳ Visual polish — lighting, VHS shader, effects, sound.
8. ⏳ Deployment — Docker, compose, Caddy, runbooks.

Progress and the acceptance-criteria checklist are tracked in §4 (updated at each milestone).

## 3. Open risks

- Mobile performance of lighting + post-processing → all effects configurable, VHS off by default on low-end.
- Telegram launch cannot be verified without a bot token/domain → documented manual steps.

## 4. Acceptance checklist

(Updated at the end of the session — see bottom of file.)
