# Analytics — events, data model and metric definitions

Everything the admin dashboard (`/admin`, see [ADMIN.md](ADMIN.md)) shows is computed from real rows in
PostgreSQL by `apps/server/src/analytics/metrics.ts`. There are no sampled, estimated or placeholder
numbers: when a metric has no data for the selected period it is returned as `null` and the UI shows
«нет данных». A `0` always means "counted, and the count is zero".

## 1. Principles

| Rule | How it is enforced |
|---|---|
| Gameplay-critical statistics are server-generated. | Matches, participants, kills, wins, XP and achievements come from the authoritative room via `PgMatchRecorder` (`progression/recorder.ts`). Clients cannot submit any gameplay event (§2.2). |
| Every event is counted at most once. | Each event carries a UUID `id` = primary key of `analytics_events`. Inserts use `ON CONFLICT (id) DO NOTHING`, so client retries, `keepalive` re-sends and duplicate ids inside one batch never inflate counts. `POST /api/events` reports `{accepted, duplicates, rejected}`. |
| Match results are processed exactly once. | `matchCompleted` runs in one transaction that locks the `matches` row (`FOR UPDATE`) and checks `results_processed_at`; a repeated or concurrent call returns the stored results without touching profiles. Profiles are locked in sorted user-id order (no deadlocks between overlapping matches). |
| Days are UTC. | Day buckets use `(timestamp AT TIME ZONE 'UTC')::date`; preset ranges end "now"; custom ranges are whole UTC days. |
| Collect only what is needed. | See [PRIVACY.md](PRIVACY.md). Free-text error messages are sanitised before storage (§2.3). |

## 2. Event catalogue

Schemas live in `packages/shared/src/events/analytics.ts` (`SERVER_EVENT_PROPS`, `CLIENT_EVENT_PROPS`).
Stored in `analytics_events (id uuid PK, name, source 'client'|'server', user_id, session_id,
occurred_at, received_at, platform, props jsonb)`.

### 2.1 Server events (written by `PgAnalytics.server`, buffered ≤1 s, never throw)

| Event | Emitted by | Props |
|---|---|---|
| `session_started` | `POST /api/auth/telegram`, `POST /api/auth/dev` | `platform`, `method` (`telegram`\|`dev`) |
| `profile_created` | same, first login of a new user | `method` |
| `lobby_created` | `RoomManager.create` | `roomId`, `mapId`, `isPrivate` |
| `lobby_joined` | `MatchRoom` join / resume | `roomId`, `viaInvite`, `resumed?` |
| `lobby_left` | `MatchRoom` leave | `roomId`, `phase`, `reason` |
| `match_started` | `MatchRoom` countdown → active | `matchId`, `roomId`, `mapId`, `players` |
| `map_played` | together with `match_started` | `matchId`, `mapId` |
| `match_completed` | `MatchRoom` finish (timer / score limit) | `matchId`, `mapId`, `durationMs`, `players`, `reason` |
| `match_abandoned` | room closed before the match finished | `matchId`, `mapId`, `phase` |
| `invite_created` | `POST /api/rooms` (private room) | `code`, `roomId` |

### 2.2 Client events (`POST /api/events`, authenticated, ≤50 per batch, 30 req/min per user, 64 KB)

| Event | Props (strict — unknown keys reject the event) |
|---|---|
| `app_opened` | `platform`, `startParam?`, `referrer?` |
| `session_ended` | `durationMs` (0 … 86 400 000) — sent when the Mini App is hidden/closed |
| `tutorial_completed` | `step?` |
| `character_selected` | `character` |
| `invite_opened` | `code`, `result` (`joinable`\|`full`\|`in_progress`\|`finished`\|`expired`\|`not_found`) |
| `connection_error` | `stage` (`connect`\|`auth`\|`join`\|`gameplay`), `code?` |
| `reconnect_attempted` | `attempt` |
| `reconnect_succeeded` | `attempt`, `downtimeMs` |
| `client_error` | `component`, `category`, `message`, `clientVersion?` — also copied to `app_errors` |

Server-side handling: `user_id`/`session_id`/`platform` are taken from the authenticated session, never
from the payload; the client timestamp is clamped to ±24 h of server time (`occurred_at`),
`received_at` is server time; events that fail validation are counted as `rejected` and dropped.

### 2.3 Technical errors (`app_errors`)

Sources: server (`analytics.error(...)` from HTTP handler, room tick, result persistence) and client
(`client_error`). Before storage `sanitizeMessage` removes credentials (`token=…`, `password=…`,
`initData…`, `Bearer …` → `[redacted]`), e-mail addresses, URL query strings, long opaque ids
(≥24 chars → `[id]`) and long numbers (≥6 digits → `[num]`), and truncates to 300 chars. Errors are
grouped by `fingerprint = sha1(source|component|category|normalised message)`; the dashboard shows
count, first/last seen, client/server versions and session ids per group.

## 3. Canonical data vs derived metrics

Canonical (source of truth): `users`, `profiles`, `sessions`, `matches`, `match_participants`,
`player_achievements`, `invitations`, `analytics_events`, `app_errors`, `admin_*`.

`user_daily_activity (user_id, day)` is a de-duplicated activity index: one row per user per UTC day
in which the user logged in or made any authenticated request / WebSocket connection (written by
`SessionStore.issue/verify` through `ActivityTracker`, at most once per user per day per process).

Profile counters (`matches_played`, `wins`, `losses`, `kills`, `assists`, `deaths`, `playtime_sec`,
streaks, XP, level) are maintained transactionally by the recorder from the same data that is stored per
match in `match_participants` (`assists` since migration `003_assists.sql`):

* *played* — the player was in the match when it started; *completed* — still present at the end;
* *win* — completed, place 1, and ≥2 players present at the end; *loss* — completed, not a win, ≥2 players;
  a solo finish counts as neither and does not break a win streak;
* XP = `xpForMatch` (`packages/shared/src/game-rules/progression.ts`) + rewards of achievements
  unlocked in that match. Only completed matches award XP.

## 4. Metric definitions (dashboard «Обзор»)

Let the selected range be `[from, to]` (timestamps) with UTC days `firstDay … lastDay`, and
`today` = current UTC day.

| Metric | Definition |
|---|---|
| Total players | users not deleted with `created_at ≤ to` |
| New players | users with `created_at ∈ [from, to]` |
| DAU | distinct users in `user_daily_activity` on `lastDay` |
| WAU | distinct users active on any of the 7 days ending `lastDay` |
| MAU | distinct users active on any of the 30 days ending `lastDay` |
| Matches started | `matches.started_at ∈ [from, to]` |
| Matches completed | `status = 'completed'` and `ended_at ∈ [from, to]` |
| Active rooms | live count from the room manager at request time (not historical) |
| Avg match duration | mean `duration_ms` of matches completed in range; `null` if none |
| Avg session duration | mean `props.durationMs` of `session_ended` events in range; `null` if none. Client-reported (the client cannot report a session that ends by crash or force-kill), so it is a lower-bound estimate of real usage. |
| First-match conversion | among new players of the range: share with ≥1 *completed* match (at any time up to now); `null` if no new players |
| D1 retention | see §5 |
| D7 retention | see §5 |
| Technical errors | `app_errors` rows with `occurred_at ∈ [from, to]` |

Charts: registrations per day; DAU per day; matches started vs completed per day; D1/D7 per
registration cohort day; session-duration and match-duration histograms; map popularity (matches
started per `map_id`); character popularity (participations per character in matches started in
range); platforms (distinct users per `sessions.platform` for sessions created in range).

**Platform caveat:** `platform` is reported by the client at login (derived from
`Telegram.WebApp.platform` / user agent). It is not cryptographically verified and is used only for
this breakdown. Sessions without a platform are shown as `unknown`.

## 5. Retention (D1 / D7)

Classic ("exact day N") retention by **registration cohort**:

* Cohort `C(d)` = users (not deleted) whose `created_at` falls on UTC day `d`.
* A user of `C(d)` is *retained on day N* if `user_daily_activity` has a row for day `d + N`.
* `DN(d) = |retained on d+N| / |C(d)|`.
* **Maturity:** a cohort is counted for DN only when day `d + N` is complete, i.e. `d + N < today`.
  Immature or empty cohorts give `null` (shown as a gap in the chart), never `0`.
* **Overview tile** (pooled over the range): cohorts `d ∈ [firstDay, lastDay]` that are mature;
  `DN = Σ retained / Σ cohort size`. The tile also shows the cohort size used; `null` if it is 0.
  Example: with the "7 days" preset, D7 is usually `null` because no cohort in the last 7 days has
  reached day 7 yet — choose 30/90 days or a custom range.

Deleted accounts disappear from cohorts (hard deletion, see PRIVACY.md), so historical numbers can
change slightly after deletions. Activity older than the retention period (400 days) is purged.

## 6. Exports

`players.csv`, `matches_<from>_<to>.csv`, `daily_<from>_<to>.csv` (registrations, DAU, matches
started/completed, errors per day). Admin role only, every export is written to the audit log.
Files are UTF-8 with BOM and CRLF; cells starting with `=`, `+`, `-`, `@`, TAB or CR are prefixed with
`'` (formula-injection protection) and quoted when needed; numbers are written as numbers.

## 7. Verification

`apps/server/src/analytics/events.test.ts`, `admin/admin.test.ts`, `progression/recorder.test.ts` and
`analytics/retention.test.ts` run against a real PostgreSQL (isolated schema per test file) and cover:
event validation and dedupe (within a batch and across requests), clock clamping, error sanitising,
idempotent and concurrent match-result processing, metric values on seeded data (incl. D1/D7 with
immature cohorts → `null`, empty datasets → `null`), date-range validation, player search/sort/
pagination, CSV escaping and authorisation.
