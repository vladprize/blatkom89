# Admin analytics dashboard

URL: `https://<your-domain>/admin` (static page `apps/web/admin.html` + bundle from
`apps/web/src/admin/`, vanilla TypeScript, Russian UI — the game itself is in English; the dashboard
names weapons, characters and maps the way the owner's sheets do). API: `/api/admin/*`
(`apps/server/src/admin/`). Metric definitions: [ANALYTICS.md](ANALYTICS.md); economy rules:
[ECONOMY.md](ECONOMY.md).

Tabs: «Обзор» (KPIs and charts; V2.0: unique players, first matches, $BLAT issued), «Воронка» (visitors → account → match → return, sources),
«Источники» (V2.0 part F: new accounts by how they came — partner link, a player's referral link, room
invitation, campaign `utm_*`, another site, Telegram, direct — with first match, whole match and return;
first visits by source; room invitations and referral links with their conversion; **partner links** for
authors and streamers — created and switched off here, measured only, no payouts; levels; the Kon;
[ANALYTICS.md](ANALYTICS.md) §6a),
«Экономика» (talons, diamonds, revenue, purchases, modifications, cases), «Игроки» (search, player
card with wallet, purchases, ledger, payments and admin actions), «ОПГ» (v0.3 clubs, called gangs —
«ОПГ» — since v0.2.8: every gang — the game's own marked «игры» — with its rating, people, boss and
requests; an admin removes a player's gang, e.g. for an offensive name or flag), «$BLAT» (V2.0: points
on hand, issued for levels / invitations in all time and in the period, the biggest balances, invitations
by status — an admin counts or turns down the ones held for a check; the BLAT DROP announcement date
players count down to; balance snapshots with CSV / JSON downloads; [BLAT.md](BLAT.md)), «Ошибки»,
«Экспорт», «Аудит». The player card has a «$BLAT и приглашения» block (balance, code, who invited the
player, their invitations; an admin marks or clears «suspicious»).

The page itself is public (it contains no data); **every** data request is authorised on the server.
Hiding the URL is not part of the security model.

## 1. Provisioning administrators

There are no default credentials. Two ways to create accounts:

1. **Bootstrap on start-up** — set both variables before the first start:

   ```env
   ADMIN_BOOTSTRAP_USERNAME=root            # ^[a-z0-9_.-]{3,32}$
   ADMIN_BOOTSTRAP_PASSWORD=<12+ chars, from a password manager>
   ```

   The server creates this `admin` **only if no administrator exists yet** (otherwise it logs a
   warning and changes nothing), audits it as `admin_bootstrap` and never logs the password. Remove
   both variables from the environment after the first successful start.

2. **CLI** (any time, e.g. inside the server container):

   ```sh
   npm run admin:create                       # prompts for username and (hidden) password; role = admin
   ADMIN_USERNAME=anna ADMIN_ROLE=viewer ADMIN_PASSWORD=... npm run admin:create   # non-interactive
   ```

   Needs `DATABASE_URL`; runs pending migrations first; audits `admin_created_cli`. Put the password
   in the environment only for one-off non-interactive runs (it may end up in shell history).

3. An `admin` can also create accounts via `POST /api/admin/users` (audited `admin_created`).

Passwords: minimum 12 characters; stored as `scrypt$N$r$p$salt$hash` (N=16384, r=8, p=1, 64-byte key,
16-byte random salt). To disable an account: `UPDATE admin_users SET disabled_at = now() WHERE username = '…';`
(existing sessions stop working immediately — `verify` checks `disabled_at`).

## 2. Roles

| Capability | `viewer` | `admin` |
|---|:---:|:---:|
| Overview, charts, live rooms, players list & detail, errors | ✅ | ✅ |
| Funnel and economy panels | ✅ | ✅ |
| Balance grants / corrections, password-reset links | — | ✅ |
| Open a player's story up to a mission (v0.2.16, for checking the story) | see only | ✅ |
| $BLAT: count / turn down a held invitation, mark an account suspicious | — | ✅ |
| BLAT DROP date, balance snapshots (take, download, delete) | see only | ✅ |
| CSV exports | — | ✅ |
| Audit log | — | ✅ |
| Create administrators | — | ✅ |

Roles are checked on the server for every request (`AdminAuth.require(role)`); the UI only hides
what the role cannot use.

## 3. Session & request security

* **Login** `POST /api/admin/login {username, password}` — rate limited to 10 attempts/min per IP and
  5 attempts/5 min per IP+username (HTTP 429 + `Retry-After`). Unknown users are checked against a
  dummy hash (no timing oracle). Every failure is audited as `login_failed`.
* **Session cookie** `blk_admin`: 32 random bytes, `HttpOnly`, `SameSite=Strict`, `Path=/api/admin`,
  `Secure` when `PUBLIC_URL` is `https://`, lifetime `ADMIN_SESSION_TTL_HOURS` (default 12).
  The database stores only `HMAC-SHA256(SESSION_SECRET, "admin:"+token)`, plus IP and user agent.
* **CSRF:** every non-GET request must send `x-csrf-token` = `HMAC(SESSION_SECRET, "csrf:"+token)`,
  returned by login and `GET /api/admin/me`; compared in constant time. In addition, a present
  `Origin` header must be the server's own host, `PUBLIC_URL` or one of `CORS_ORIGINS`.
* **Logout** revokes the session row and clears the cookie.
* Responses are JSON (`cache-control: no-store` on CSV); the UI builds DOM with `textContent` only.
* Behind a reverse proxy set `TRUST_PROXY=true` so rate limits and audit use the real client IP.

## 4. Audit log (`admin_audit_log`)

Recorded actions: `login`, `login_failed`, `logout`, `admin_bootstrap`, `admin_created`,
`admin_created_cli`, `player_viewed` (opening a player's card, target = player id),
`balance_grant` (currency, amount, reason, balance after), `password_reset_link`, `story_opened` (v0.2.16: the mission, the missions marked done), `club_delete` (name, tag, members),
`referral_confirm` (inviter, reward, number) / `referral_reject` (note), `blat_flag` / `blat_unflag` (reason),
`blat_drop_date` (from → to), `blat_snapshot` (accounts, totals), `export_blat_snapshot` (format, rows),
`blat_snapshot_delete`,
`export_players`, `export_matches`, `export_daily` (with row counts / date range); V2.0 part F:
`partner_created` (code, name), `partner_updated` (what changed), `export_sources`, `export_partners`. Visible to `admin`
in the «Аудит» tab (latest 200). Kept 365 days ([PRIVACY.md](PRIVACY.md) §4).

## 5. API reference

All endpoints return `401` without a valid session, `403 forbidden` for an insufficient role,
`403 csrf` / `403 bad_origin` for failed CSRF/origin checks, `400 bad_range` for invalid ranges.

Range parameters (where noted): `range=24h|7d|30d|90d` (default `7d`) or
`range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD` (UTC days, inclusive, max 400 days).

| Method & path | Role | Description |
|---|---|---|
| `POST /api/admin/login` | — | `{username, password}` → `AdminMe` + cookie |
| `POST /api/admin/logout` | viewer | revoke session (CSRF) |
| `GET /api/admin/me` | viewer | `{id, username, role, csrfToken}` |
| `GET /api/admin/overview?range…` | viewer | KPI tiles (`AdminOverview`) |
| `GET /api/admin/charts?range…` | viewer | chart series (`AdminCharts`) |
| `GET /api/admin/rooms` | viewer | live rooms (map, game mode, phase, people, `fill` — players the server added to complete the lineup, shown as «Добор»; private) |
| `GET /api/admin/funnel?range…` | viewer | visitor and new-player cohorts, referrers, daily visitors (`AdminFunnel`) |
| `GET /api/admin/economy?range…` | viewer | currency flows, revenue, purchases, modifications, cases (`AdminEconomy`) |
| `GET /api/admin/players?q=&sort=&dir=&page=&pageSize=` | viewer | search by name (case-insensitive, Cyrillic-safe), exact Telegram ID, internal UUID or exact email (the address itself is never listed); `sort` ∈ `created, last_seen, name, level, xp, matches, wins, losses, kills, assists, playtime`; `pageSize` 5–100 |
| `GET /api/admin/players/:id` | viewer | profile, progression, sessions summary, sign-in methods, masked email, wallet, owned items and modifications, last 50 ledger rows (talons, diamonds, $BLAT), last 30 payments, achievements, last 50 matches, last 50 errors, `blat` (balance, total, code, invited by, invitations by status, flag), `story` (v0.2.16: the story missions done; a best time of 0 — opened by an admin) (audited) |
| `POST /api/admin/players/:id/grant` | admin | `{currency: tokens\|diamonds, amount: ±1…1 000 000, note: 3–120 chars}` → `{balance}`; never below zero (`409 insufficient_balance`); ledger reason `grant` with the admin id; audited; 30 actions / 5 min per admin (CSRF) |
| `POST /api/admin/players/:id/story-open` | admin | v0.2.16, for checking the story: `{mission}` (a written mission, e.g. `a12`) → `{opened, done}`; the campaign's missions before it count as done for the player — best time 0, **nothing paid** (no talons, experience, chapter achievements or items; a chapter's reward still comes when the player plays its last mission); missions already done stay as they were (repeating it changes nothing); `400 bad_mission`, `404`, `409 no_profile`; audited; 30 actions / 5 min per admin (CSRF). In the dashboard: the player card's «Сюжет» block |
| `POST /api/admin/players/:id/reset-link` | admin | one-time password-reset link (valid 1 h) for a player with a registered email → `{link, expiresAt}`; `404 no_email` otherwise; audited; hand it over only to the account owner (CSRF) |
| `GET /api/admin/clubs` | viewer | every club (`AdminClubRow`: rank, tag, name, motto, rating, people, real members, head, requests, recruiting, `house`, created) |
| `DELETE /api/admin/clubs/:id` | admin | removes a player club; its people get `club_left` (disbanded); `409 house_club` for the game's own clubs; audited; 30 actions / 5 min per admin (CSRF) |
| `GET /api/admin/blat?range…` | viewer | $BLAT: on hand, holders, issued all time / in range by source (`level`, `referral`, `grant`), invitations by status, flagged accounts, the 20 biggest balances (`AdminBlatSummary`) |
| `GET /api/admin/referrals?status=pending\|held\|confirmed\|rejected` | viewer | the last 300 invitations (`AdminReferralRow`) |
| `POST /api/admin/referrals/:refereeId` | admin | `{action: confirm\|reject, note?}` — a held or pending invitation; confirm pays the inviter at their current tier; `409 not_open` if already decided; the inviter hears it live; audited; 30 actions / 5 min per admin (CSRF) |
| `POST /api/admin/players/:id/blat-flag` | admin | `{flag: reason (1–200) \| null}` — a suspicious account's invitations wait for a decision; audited (CSRF) |
| `GET /api/admin/blat/drop` | viewer | the BLAT DROP date, its source (`admin` / `env` / none), who set it and when (`AdminBlatDrop`) |
| `POST /api/admin/blat/drop` | admin | `{announceAt: ISO-8601 \| null}` (2020 … ten years ahead, `400 bad_date` otherwise); null shows players «not set yet»; audited; 30 actions / 5 min (CSRF) |
| `GET /api/admin/blat/snapshots` | viewer | the last 50 snapshots (`AdminBlatSnapshot`: moment, who, accounts, eligible, totals, rows left) |
| `POST /api/admin/blat/snapshots` | admin | `{note?}` — freezes every balance now (one transaction); audited (CSRF) |
| `GET /api/admin/blat/snapshots/:id/export?format=csv\|json` | admin | the rows (CSV formula-safe; JSON with the rules); audited |
| `DELETE /api/admin/blat/snapshots/:id` | admin | removes a snapshot; audited (CSRF) |
| `GET /api/admin/growth?range…` | viewer | V2.0 part F: registrations, unique players, first matches, accounts by source, first visits by source, room invitations and players' referral links with their conversion, levels, the Kon, $BLAT issued (`AdminGrowth`; docs/ANALYTICS.md §6a) |
| `GET /api/admin/partners?range…` | viewer | partner links with their website / Telegram links and what they brought in range (`AdminPartnerRow`) |
| `POST /api/admin/partners` | admin | `{name, code?, note?}` → `201 {id, code}`; without a code one is made from the name; `409 code_taken`; audited (CSRF). Measuring only — no payouts |
| `POST /api/admin/partners/:id` | admin | `{name?, note?, active?}` — rename, note, switch off / on; audited (CSRF) |
| `GET /api/admin/errors?range…` | viewer | errors grouped by fingerprint (≤200 groups) |
| `GET /api/admin/audit` | admin | latest 200 audit entries |
| `POST /api/admin/users` | admin | `{username, password, role}` (CSRF) |
| `GET /api/admin/export/players.csv` | admin | all players |
| `GET /api/admin/export/matches.csv?range…` | admin | matches started in range |
| `GET /api/admin/export/daily.csv?range…` | admin | per-day registrations, DAU, matches, errors |
| `GET /api/admin/export/sources.csv?range…` | admin | accounts by source and first visits by source (V2.0 part F) |
| `GET /api/admin/export/partners.csv?range…` | admin | partner links and their numbers (V2.0 part F) |

## 6. Operations checklist

* Use a strong unique `SESSION_SECRET` (≥32 chars; the server refuses placeholder-looking values in
  production). Rotating it logs out all players and administrators.
* Serve only over HTTPS in production so the cookie gets `Secure`.
* Prefer `viewer` accounts for people who only need to look at numbers; exports contain Telegram IDs.
* Grants are for support (compensation, fixing a mistaken purchase). The reason is mandatory and
  shows up in the player's ledger and in «Аудит»; corrections use a negative amount.
* A reset link opens the player's account to whoever holds it for an hour: before creating one,
  check that the request really comes from the owner (e.g. the masked email and the Telegram ID or
  match history they can describe). Admins never see the full email address.
* Review «Аудит» periodically for `login_failed` bursts and unexpected exports.
