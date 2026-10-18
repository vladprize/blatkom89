# Privacy, data retention and deletion

> **Not legal advice; no compliance is claimed.** This document describes what the software actually
> collects and does. Before a public launch the operator must fill in the placeholders in Part 1,
> check the requirements that apply to their audience and jurisdiction (e.g. GDPR for EU players,
> local personal-data laws, payment-provider terms, Telegram's current Mini App developer terms, the
> game's age rating) and adapt the text. Part 1 is the player-facing policy (English, like the game),
> published as `apps/web/public/privacy.html` (linked from the main menu footer). Part 2 is the
> operator's reference.

---

## Part 1 — Privacy policy (player-facing text)

**BLATKOM ’89 — privacy policy.** Revised 19 October 2026.

**In short.** The game is free to play; purchases are optional and there are no ads. We keep only
what the game, your profile and its statistics need. We never get your phone number, and we don’t
keep your Telegram @username or photo. Card and crypto-wallet details are entered on the payment
provider’s page and never reach us. Data is not sold or used for advertising. You can delete your
profile at any time: **Settings → “Delete my data”**.

### 1. Who is responsible for the data
Game operator: **[operator name]**. Contact: **[email or Telegram contact]**.

### 2. What data we process
1. **Signing in through Telegram.** Telegram passes signed launch data to the game; the server checks
   the signature. We keep: your numeric Telegram ID, your in-game name (built from your Telegram first
   and last name; changeable via “✎ Alias”) and the language code. We **don’t keep** your @username,
   profile photo or the launch data itself.
2. **Playing in a browser without Telegram.** Your browser generates a random device identifier; the
   server stores only a keyed hash of it.
3. **Email sign-in (optional).** If you register an email, we keep the address and a hash of your
   password (scrypt; never the password itself). Password-reset letters with a one-time link (valid
   for an hour) are sent through our email provider, **[Resend, or the provider you configure]**.
4. **Game data:** character, match participation (map, place, eliminations, assists, deaths, damage,
   time), XP, level, achievements, streaks, time in game, match history; talon and diamond balances and
   every change to them, owned weapons, characters, equipment and modifications, loadout, case openings.
5. **Purchases (optional):** pack, price, currency, payment provider, the provider’s payment reference,
   status and time. You pay on the provider’s page — Stripe (cards), NOWPayments (cryptocurrency); we
   pass them only an internal payment number.
6. **Technical data:** platform type, game version, sign-in times, the days you played, session lengths,
   app events (launch, connection errors, reconnects) and error reports (passwords, tokens, email
   addresses and long identifiers are removed before saving).
7. **Visit statistics:** a random visitor identifier created by your browser, first/last visit, days
   with visits, platform type and the domain of the site you came from — to count how many visitors
   become players; linked to your profile once you sign in.
8. **IP address:** used to handle requests and to protect against abuse; not stored in the profile
   database; may appear in the server’s technical logs for a limited time.
9. **On your device:** session key, settings and the random identifiers above. No ad or third-party
   tracking. The server-less demo keeps its alias, XP and statistics only in that browser.

### 3. Why
To sign you in and recognise you; to run online matches, the scoreboard, XP, achievements and the
in-game currency; to deliver what you bought; for the profile, statistics and match history; to find
and fix bugs and protect against abuse; and for aggregated statistics to make the game better.

### 4. Who sees the data
Other players see your in-game name, character and results. Administrators work with the statistics
panel; every sign-in, look at a player’s card, balance adjustment, password-reset link and export is
audited. Data is shared only with the hosting provider, the payment provider you choose when you buy,
and the email provider when you ask for a password reset. Telegram processes data under its own rules.

### 5. How long we keep it
| Data | Period |
|---|---|
| Profile, statistics, match history, achievements, balances and owned items | until you delete the profile |
| Email address and password hash | until you delete the profile |
| Usage events and days active | up to 400 days |
| Visit statistics | 400 days after the last visit |
| Error reports | 90 days |
| Sign-in session records | 90 days after the session ends |
| Password-reset links | valid 1 hour, deleted 7 days later |
| Room invitations | valid 24 hours, deleted 7 days later |
| Payment records | **[period your accounting rules require]**; unlinked from you once the profile is deleted |
| Database backups | **[backup rotation period]** |

### 6. How to delete your data
**Settings → “Delete my data”** — immediate and irreversible: profile, statistics, match history,
achievements, balances and owned items (bought ones included), email and password hash, days active
and all sessions. Usage events and error reports lose the link to you and expire on schedule; payment
records stay as accounting records without the link. Without access to the game, write to the operator
from the same Telegram account or email.

### 7. Changes
When this policy changes, we update the revision date.

---

## Part 2 — Operator reference

### 2.1 Data inventory

| Table | Personal fields | Purpose | Retention |
|---|---|---|---|
| `users` | `telegram_id`, `display_name`, `language_code`, `platform`, `dev_device_id` (dev mode, or `g1:` + HMAC of a guest browser secret), `email`, `password_hash` (scrypt), `email_linked_at`, `created_at`, `last_seen_at` | identity, display, sign-in, analytics | until account deletion |
| `currency_ledger`, `user_items`, `weapon_mods`, `case_openings` | balance changes (with admin id for grants), owned items, modifications, case draws | economy, support | until account deletion (cascade) |
| `payments` | `user_id` (SET NULL on deletion), provider and its reference, pack, amount, status, times | accounting, crediting diamonds once | **[accounting retention period]** — not purged automatically |
| `password_resets` | HMAC of the one-time token, user id, who created it (`email`/`admin`) | password reset | 7 days after expiry; immediately on account deletion |
| `visitors`, `visitor_days` | random browser id, first/last visit, platform, referring domain, `user_id` (SET NULL on deletion) | visitor funnel | 400 days after the last visit |
| `profiles` | counters, XP/level, streaks, preferred character | progression | until account deletion (cascade) |
| `sessions` | `token_hash` (HMAC of the token, never the token), `method`, `platform`, `client_version`, timestamps | authentication | 90 days after expiry/revocation; immediately on account deletion |
| `user_daily_activity` | (user, UTC day) | DAU/WAU/MAU, retention | 400 days; immediately on account deletion |
| `match_participants` | per-match stats of a player | history, profile, admin | until account deletion (cascade) |
| `player_achievements` | unlock time | achievements | until account deletion (cascade) |
| `matches` | none (map, times, player count, end reason) | match statistics | kept (no personal data) |
| `invitations` | `created_by` (SET NULL on deletion) | invite links | 7 days after expiry |
| `analytics_events` | `user_id`, `session_id` (SET NULL on deletion), `platform`, props (§ANALYTICS.md) | product analytics | 400 days |
| `app_errors` | `user_id` (SET NULL on deletion), `session_id`, sanitised message, versions | debugging | 90 days |
| `admin_users` | admin username, scrypt hash | dashboard access | until removed |
| `admin_sessions` | token/CSRF HMACs, **IP, user agent** | admin security | 90 days after expiry/revocation |
| `admin_audit_log` | admin id, action, target (may be a player UUID), **IP** | accountability | 365 days |

Never collected or stored: Telegram `username`, `photo_url`, phone number, `is_premium`, raw `initData`
or its hash/signature, session tokens or reset tokens in plain text, plain-text passwords, card numbers
or wallet credentials (payments happen on the providers' hosted pages; we send them only an internal
payment id). Admins see emails only masked. Client error messages are sanitised (ANALYTICS.md §2.3).
Processors: hosting provider; Stripe / NOWPayments only for players who buy diamonds; Resend only for
players who request a password-reset letter.

Application logs (stdout, JSON): internal user ids (room joins, protocol violations), the IP of
**rejected** Telegram logins, request ids/paths (debug level). The application does not write tokens,
passwords or initData to logs.
Configure the log driver / aggregator to rotate logs (recommended ≤ 30 days). Reverse-proxy access
logs (IP, URL) are outside the application — configure their retention the same way.

### 2.2 Automatic retention job

`apps/server/src/analytics/retention.ts` (`RETENTION_DAYS`) — started by `createPersistence` in every
server process (not in tests): first run 5 minutes after start, then every 24 h. Deletes in batches of
5 000 rows (no long locks), idempotent (safe with several instances), logs the deleted counts.
Covered by `analytics/retention.test.ts`. To change a period, edit `RETENTION_DAYS`, deploy, and
update the table in Part 1 §5.

### 2.3 Account deletion

**Self-service** — `DELETE /api/me` (button “Delete my data” in Settings):
1. revokes all of the player's sessions;
2. `DELETE FROM users WHERE id = …` — cascades to `profiles`, `sessions`, `user_daily_activity`,
   `match_participants`, `player_achievements`, `currency_ledger`, `user_items`, `weapon_mods`,
   `case_openings`, `password_resets`; sets `user_id`/`session_id`/`created_by` to `NULL` in
   `analytics_events`, `app_errors`, `invitations`, `payments`, `visitors`;
3. leaves only unlinked rows: anonymous events/errors (purged by the retention job) and `matches`
   rows without player references. Admin audit entries may still contain the former internal UUID,
   which no longer resolves to anything.

Covered by `auth/auth.api.test.ts` («account deletion removes the user and personal data»).

**Operator-assisted** (player has no access, or a written request):

```sql
-- find the account (Telegram ID from the request, verified via the same Telegram account)
SELECT id, display_name, created_at FROM users WHERE telegram_id = 123456789;
BEGIN;
DELETE FROM users WHERE id = '<uuid>';                       -- same cascade as self-service
INSERT INTO admin_audit_log (action, target, details)
VALUES ('player_deleted_manual', '<uuid>', '{"ticket": "<request id>"}');
COMMIT;
```

**Backups** keep deleted data until they rotate out. Define and publish the backup retention period
(Part 1 §5); recommended ≤ 30 days. Do not restore a backup over production without re-applying
deletions requested after the backup was taken (keep the list of deletion tickets).

### 2.4 Access requests

Players see their profile, statistics, achievements and the last matches in the game. A complete
copy for a specific player can be assembled by an administrator from the player card in `/admin`
(audited as `player_viewed`) or by SQL over the tables in §2.1. There is no self-service export yet.

### 2.5 Pre-launch checklist (operator)

- [ ] Fill in operator name and contact (Part 1 §1), the email provider, the payment-record and backup
      retention periods (Part 1 §5) — in `privacy.html` too.
- [ ] Payments: check the providers' terms (Stripe, NOWPayments), consumer law for digital goods in
      your markets (refunds, withdrawal right, prices with taxes) and whether paid randomised cases are
      allowed there (`CASES_ENABLED`).
- [ ] Decide the age rating and whether the policy needs a section on minors.
- [ ] Check the legal basis / consent requirements for your audience and the hosting location
      (cross-border transfer), and sign a data-processing agreement with the hosting provider if required.
- [ ] Check Telegram's current requirements for Mini App privacy policies and configure the link
      where Telegram expects it.
- [ ] Configure log rotation for the application and the reverse proxy.
