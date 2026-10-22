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

**BLATKOM ’89 — privacy policy.** Revised 23 October 2026.

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
3a. **Signing in with Google, Discord, Facebook, Reddit or Telegram on the website (optional, v0.3):**
   only the provider’s identifier for you (for Telegram — the numeric Telegram ID, the same as in the
   Mini App) and the time of the last sign-in with it; your first name from the provider becomes the
   starting in-game name (Latin letters, changeable). No email, picture, friends or provider tokens are
   kept; only the basic profile is requested (`openid profile`, `public_profile`, `identify`, `identity`).
4. **Game data:** character, profile avatar (one of the game's portraits, by id), match participation (map, place, eliminations, assists, deaths, damage,
   time), XP, level, achievements, streaks, time in game, match history; talon and diamond balances and
   every change to them, owned weapons, characters, equipment, modifications and weapon skins, loadout, case openings.
5. **Purchases (optional):** pack, price, currency, payment provider, the provider’s payment reference,
   status and time. You pay on the provider’s page — Stripe (cards), NOWPayments (cryptocurrency); we
   pass them only an internal payment number.
6. **Technical data:** platform type, game version, sign-in times, the days you played, session lengths,
   app events (launch, connection errors, reconnects) and error reports (passwords, tokens, email
   addresses and long identifiers are removed before saving).
7. **Friends and messages:** your friend list and friend requests; private messages with friends (text,
   time, read or not) — deleted 180 days after sending, and at once with the profile.
7a. **Gangs (v0.3 clubs, called gangs — «ОПГ» in Russian — since v0.2.8):** the gang you are in (role,
   join date), the gangs you asked to join, and the name, tag, motto, flag and emblem of a gang you
   started — removed when you leave, withdraw or delete the
   profile.
7b. **$BLAT and invitations (V2.0):** your $BLAT balance (in-game points — not money, they can't be
   bought, sold or withdrawn) and every credit (for levels, for invitations); your personal invitation
   code; who invited you, if you came through someone's link, and the people who came through yours
   (their in-game names, whether the invitation counted); if an administrator marked your account as
   suspicious, that mark and its reason. The person who invited you sees your in-game name and whether
   your invitation counted.
8. **Visit statistics:** a random visitor identifier created by your browser, first/last visit, days
   with visits, platform type and the domain of the site you came from — to count how many visitors
   become players; linked to your profile once you sign in.
9. **IP address:** used to handle requests and to protect against abuse; not stored in the profile
   database; may appear in the server’s technical logs for a limited time.
10. **On your device:** session key, settings and the random identifiers above. No ad or third-party
   tracking. The server-less demo keeps its alias, XP and statistics only in that browser.

### 3. Why
To sign you in and recognise you; to run online matches, the scoreboard, XP, achievements and the
in-game currency; to deliver what you bought; for the profile, statistics and match history; to find
and fix bugs and protect against abuse; and for aggregated statistics to make the game better.

### 4. Who sees the data
Other players see your in-game name, avatar, character and results. Anyone who knows your in-game name
can send you a friend request; friends see whether you are online, in a lobby or in a match; only you and
the friend you write to see your private messages. Players with at least one finished online match are
listed in the public Top-100 (name, avatar, level, rating, eliminations, wins). A gang's name, tag, motto,
flag, rating and people (name, avatar, level, role) are public; join requests are seen by the gang's boss
only. Administrators work with the statistics
panel; every sign-in, look at a player’s card, balance adjustment, password-reset link and export is
audited. Data is shared only with the hosting provider, the payment provider you choose when you buy,
and the email provider when you ask for a password reset. Telegram processes data under its own rules; so do
Google, Discord, Facebook and Reddit when you sign in with them (on their page).

### 5. How long we keep it
| Data | Period |
|---|---|
| Profile, statistics, match history, achievements, balances and owned items | until you delete the profile |
| Email address and password hash | until you delete the profile |
| Sign-ins with Google, Discord, Facebook, Reddit (the provider’s id for you) | until you delete the profile |
| Usage events and days active | up to 400 days |
| Visit statistics | 400 days after the last visit |
| Private messages with friends | 180 days |
| Friend list and requests | until removed by you or the friend, or the profile is deleted |
| Gang membership and join requests | until you leave (or are shown out), withdraw, or the profile is deleted |
| $BLAT balance and its history, your invitation code, who invited you | until you delete the profile |
| Error reports | 90 days |
| Sign-in session records | 90 days after the session ends |
| Password-reset links | valid 1 hour, deleted 7 days later |
| One-time sign-in codes (provider → game) | valid 5 minutes, deleted once used or within 2 days |
| Room invitations | valid 24 hours, deleted 7 days later |
| Payment records | **[period your accounting rules require]**; unlinked from you once the profile is deleted |
| Database backups | **[backup rotation period]** |

### 6. How to delete your data
**Settings → “Delete my data”** — immediate and irreversible: profile, statistics, match history,
achievements, balances and owned items (bought ones included), $BLAT and its history, your invitation
code and who invited you, email and password hash, the sign-ins
with Google / Discord / Facebook / Reddit, days active and all sessions. A reward your inviter already
received for you stays with them (as a number in their history, no longer linked to you). Usage events and error reports lose the link to you and expire on schedule; payment
records stay as accounting records without the link. Without access to the game, write to the operator
from the same Telegram account or email.

### 7. Changes
When this policy changes, we update the revision date.

---

## Part 2 — Operator reference

### 2.1 Data inventory

| Table | Personal fields | Purpose | Retention |
|---|---|---|---|
| `users` | `telegram_id`, `display_name` (+ `name_key`, its case-folded form for uniqueness), `language_code`, `platform`, `dev_device_id` (dev mode, or `g1:` + HMAC of a guest browser secret), `email`, `password_hash` (scrypt), `email_linked_at`, `created_at`, `last_seen_at`; V2.0: `ref_code` (the player's invitation code), `blat_flag` (an admin's «suspicious» mark with its reason) | identity, display, sign-in, analytics, referral programme | until account deletion |
| `currency_ledger`, `user_items`, `weapon_mods`, `case_openings` | balance changes (with admin id for grants; V2.0: $BLAT credits `level:<n>` / `referral:<invited player's id>`), owned items (weapon skins included), modifications, case draws (weapons and skins) | economy, support, no double credits | until account deletion (cascade); an inviter's `referral:<id>` row stays with the inviter after the invited player is deleted (the id no longer resolves) |
| `referrals` (V2.0) | invited player (`referee_id`, cascade), inviter (`referrer_id`, SET NULL on deletion), the code used, attach/decision times, status, number, reward, an admin's note | referral programme ([BLAT.md](BLAT.md)) | until the invited player's account is deleted |
| `payments` | `user_id` (SET NULL on deletion), provider and its reference, pack, amount, status, times | accounting, crediting diamonds once | **[accounting retention period]** — not purged automatically |
| `user_identities` (v0.3) | provider (`google`/`facebook`/`discord`/`reddit`), the provider's id for the player (`provider_uid`), user id, first/last use | sign-in with a provider | until account deletion (cascade) |
| `auth_handoffs` (v0.3) | SHA-256 of a one-time code, user id, provider, whether the account is new/linked | handing a provider sign-in back to the page | valid 5 minutes; deleted on use, by the next sign-in once 10 minutes old, by the daily retention job after 1 day; immediately on account deletion (cascade) |
| `password_resets` | HMAC of the one-time token, user id, who created it (`email`/`admin`) | password reset | 7 days after expiry; immediately on account deletion |
| `visitors`, `visitor_days` | random browser id, first/last visit, platform, referring domain, `user_id` (SET NULL on deletion) | visitor funnel | 400 days after the last visit |
| `profiles` | counters, XP/level, rating, streaks, preferred character, avatar id; V2.0: `blat`, `blat_earned`, `blat_level` | progression, Top-100, $BLAT | until account deletion (cascade) |
| `friendships` | pairs of user ids, request/accept times | friends, presence | until removed; immediately on account deletion (cascade) |
| `direct_messages` | sender, recipient, text (≤ 500 chars), sent/read times | private messages between friends | 180 days; immediately on account deletion (cascade) |
| `clubs`, `club_members`, `club_requests` | a club's name/tag/motto/flag/emblem and `head_id` (SET NULL on deletion); membership (club, user, role, join time); requests (club, user, time) | clubs, the club table | membership and requests until left/withdrawn, immediately on account deletion (the head hands the club over first); a club until disbanded, closed by its last member or removed by an admin (audited) |
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
players who request a password-reset letter. Google / Discord / Facebook / Reddit / Telegram act as
sign-in providers only for players who choose them (the server sends them the code it got back and its
own client secret; it asks for the basic profile only and keeps the id; provider access tokens are used
once and never stored).

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
   `case_openings`, `password_resets`, `user_identities`, `auth_handoffs`, `friendships`, `direct_messages`, `club_members`, `club_requests`, `referrals` (the player's own row; as an inviter, `referrer_id` becomes `NULL`) (before that the
   player leaves their club like a player who quits: a head hands it to the longest-standing member, a last member closes it);
   sets `user_id`/`session_id`/`created_by` to `NULL` in
   `analytics_events`, `app_errors`, `invitations`, `payments`, `visitors`;
3. leaves only unlinked rows: anonymous events/errors (purged by the retention job) and `matches`
   rows without player references. Admin audit entries may still contain the former internal UUID,
   which no longer resolves to anything.

Covered by `auth/auth.api.test.ts` («account deletion removes the user and personal data»),
`social/social.test.ts` (friendships and messages) and `api/oauth.test.ts` (provider sign-ins).

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
