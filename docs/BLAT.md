# $BLAT — in-game points, level rewards and the referral programme (V2.0)

$BLAT are **in-game points that only accumulate**. They are not money and not a cryptocurrency: they
cannot be bought, sold, withdrawn, given to another player or exchanged for anything, and the game never
shows a price, a market value or a «rate» for them. The game screen says so in plain words. There is no
wallet, no blockchain connection and no token in this release.

Rules live in `packages/shared/src/game-rules/blat.ts`; credits happen only on the server
(`apps/server/src/blat/repo.ts`), inside database transactions. The client displays what the server
returns. Admin view: «$BLAT» in `/admin` ([ADMIN.md](ADMIN.md)).

## 1. Where the numbers live

| | |
|---|---|
| Balance | `profiles.blat` (integer, 0 … 2 000 000 000), all-time total `profiles.blat_earned`, the highest level already paid `profiles.blat_level` |
| Every change | a row in `currency_ledger` with `currency = 'blat'`, `reason` = `level` / `referral` (`grant` is reserved — no admin $BLAT grants in this release), `delta`, `balance_after`, `created_at` and an **operation id** `ref` |
| Operation ids | `level:<n>` — the reward for level *n*; `referral:<invited player's id>` — the reward for one invitation |
| Duplicates | impossible: a unique index `currency_ledger_blat_once (user_id, ref) WHERE currency = 'blat'`; a $BLAT row without `ref` is refused by a CHECK |
| Bounds | one credit ≤ 1 000 000 (`BLAT_LIMITS.maxCredit`), a balance ≤ 2 000 000 000 (`maxBalance`, also a CHECK); balances of tens of millions are shown with thousands separators |

Every credit locks the player's profile row (`FOR UPDATE`), inserts the ledger row with
`ON CONFLICT DO NOTHING` and only then moves the balance — so retries, reconnects, two tabs and two
servers can never pay the same operation twice (tested with concurrent requests in
`apps/server/src/blat/blat.test.ts`).

Migration `016_blat.sql` only **adds** columns, a table and constraints; nothing existing is dropped,
rewritten or reset.

## 2. Level rewards

Every level pays once. Level 1 is the welcome: a new account has 300 $BLAT from its first minute.

**The table is a DRAFT — the owner approves it before the public launch** (`BLAT_LEVEL_FIRST`,
`BLAT_LEVEL_STEPS`, `BLAT_LEVEL_CAP_REWARD`): 300 at level 1, then +50 a level up to 10, +100 up to 20,
+200 up to 30, +300 up to 40, +325 up to 50 — 10 000 at level 50 and 10 000 for every level after.

| Level | Reward | All levels up to it |
|---|---|---|
| 1 | 300 | 300 |
| 2 | 350 | 650 |
| 3 | 400 | 1 050 |
| 5 | 500 | 2 000 |
| 10 | 750 | 5 250 |
| 11 | 850 | 6 100 |
| 20 | 1 750 | 18 250 |
| 21 | 1 950 | 20 200 |
| 30 | 3 750 | 46 750 |
| 40 | 6 750 | 100 750 |
| 50 | 10 000 | 186 125 |
| 51+ | 10 000 each | — |

When levels are paid (`creditLevels`, always «every unpaid level from 1 to the current one»):

- **with the match results**, in the same transaction as XP and talons — the results screen shows
  «+N $BLAT for the new level · total»;
- **whenever the player's own profile is read** (sign-in, `/api/me`) and `blat_level` is below the level:
  the welcome of a new account and, after the update, every level an existing player reached before
  $BLAT existed. That response carries `blatCredited`; the client shows «+300 $BLAT — welcome to the
  district» / «+N $BLAT for the levels you reached» once, on the menu;
- when the $BLAT screen is opened (`GET /api/blat`, same rule).

## 3. The referral programme

**Links.** Every player gets a personal code (8 letters and digits without look-alikes, made the first
time the $BLAT screen is opened, `users.ref_code`): `https://<site>/?ref=<code>` and, with a bot,
`https://t.me/<bot>?start=ref_<code>` (the bot answers `/start ref_<code>` with a button that opens the
game with the code). The room invitations (`?invite=` / `start=<room>`) are untouched and keep working.

**Who counts** (`REFERRAL_RULES`):

1. a **new** account is created in a browser (or Telegram) that was opened through the link — the code
   is kept in the browser until the first sign-in (`apps/web/src/net/referral.ts`; inside Telegram the
   server reads it from the signed launch data, never from `initDataUnsafe`); an existing account that
   opens a link is never attached;
2. one inviter per account, set once (`referrals.referee_id` is the primary key) and never changed;
   one's own code is ignored;
3. the invitation counts after the new player's **first whole online match**: the match completed, it
   lasted at least 60 s (`minMatchSec`) and the player dealt damage. Practice against bots never counts.
   It is checked when that match's results are saved and again whenever the player opens $BLAT
   (self-healing, idempotent);
4. no reward for clicks, for existing players, for bots, for one's own account.

**Reward.** The n-th confirmed invitation of an inviter pays by the owner's scale
(`REFERRAL_TIERS`): 1–4 → 1 500, 5–9 → 3 000, 10–24 → 5 000, 25–49 → 7 500, 50–99 → 10 000,
100–249 → 12 500, 250–499 → 15 000, 500+ → 20 000. A higher tier applies only to new invitations —
paid rewards are never recounted. The number `n` is taken under a lock, so two invitations confirmed at
the same moment get different numbers.

**Statuses** (`referrals.status`): `pending` (attached, waiting for the match) → `confirmed` (paid), or
→ `held` (waits for an administrator) → `confirmed` / `rejected`.

**Checks that hold an invitation for an administrator** (no reward until decided):

- more than 20 confirmations of one inviter in 24 hours (`dailyCap`);
- an account on either side marked as suspicious by an administrator (`users.blat_flag`, with a reason).

The administrator counts it (paid at the inviter's current tier) or turns it down; both decisions and
every flag change are in the audit log (`referral_confirm`, `referral_reject`, `blat_flag`,
`blat_unflag`). The game uses no device fingerprinting or other aggressive tracking for this — only
what it already has: the guest-account secret of the browser (stored as an HMAC), the sign-in limits
per network address (`GUEST_SIGNUPS_PER_IP_HOUR`) and the match record.

**Known limit (honest):** someone can open several new guest accounts in different browsers and play a
whole match with each; with filled lineups (`MATCH_FILL_BOTS`) one person can finish a match alone. The
sign-up limit per address, the 60-second whole-match rule, the daily cap and the review queue make this
slow and visible in `/admin → $BLAT`, but not impossible. Before $BLAT gains any value outside the
game, review the held queue and the flagged accounts.

**Notifications.** The inviter hears a confirmation live (a social event over the open connection):
«<name> played their first match through your link: +1 500 $BLAT»; a held one: «An invitation of yours
is being checked — the reward comes after the check».

## 4. API

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/api/blat` | player | balance, total, by source, the next level's reward, the referral link / counters / last 20 invitations, the last 50 $BLAT operations, `justCredited` |
| — | `/api/me`, sign-in responses | player | `profile.blat`, `profile.blatCredited` (only when this very request paid levels) |
| — | match results (`PersonalResult`) | player | `blatGained`, `totalBlat` |
| — | social event `referral` | the inviter | `{ name, reward, balance, held }` |
| GET | `/api/admin/blat?range=…` | viewer | on hand, holders, issued all time / in the period by source, invitations by status, flagged accounts, the 20 biggest balances |
| GET | `/api/admin/referrals?status=` | viewer | the last 300 invitations |
| POST | `/api/admin/referrals/:refereeId` | admin + CSRF | `{ action: 'confirm' \| 'reject', note? }` — a held or pending invitation |
| POST | `/api/admin/players/:id/blat-flag` | admin + CSRF | `{ flag: '<reason>' \| null }` |

The admin player card shows the balance, the code, who invited the player, their invitations by status
and the flag; the ledger table there lists $BLAT operations with talons and diamonds.

## 5. Deleting an account

Deleting an account deletes its balance, its ledger rows and its own `referrals` row. An inviter keeps a
reward already paid for that player (the ledger row `referral:<id>` stays with the inviter; the id no
longer leads anywhere). Details: [PRIVACY.md](PRIVACY.md).

## 6. What this release does not do

- no cryptocurrency token, no wallets, no transactions, no automatic exchange of points for anything;
- no transfers between players, no buying or selling of $BLAT, no prices;
- no payouts to partners or streamers (partner links are a later stage);
- the BLAT DROP tab and the balance snapshot export come in the next part (Stage C).
