# $BLAT — retired in v0.2.18

**$BLAT, BLAT DROP and the tournament's stakes are gone from the game since v0.2.18** (the owner's
pre-release edits: «убери крипту»). Nothing in the game, the server's routes or the dashboard pays,
moves or shows them any more. The game has no token, no wallet, no exchange and no stakes.

What replaced them:

| Was (V2.0 – v0.2.17) | Now (v0.2.18) |
|---|---|
| $BLAT for levels | **BLATS** for levels — 10 for every new level from level 2, the premium currency (the red coin, «БЛАТ» in Russian) — [ECONOMY.md](ECONOMY.md) §5a |
| $BLAT for invitations | **150 talons** for every friend who comes through the link and plays a whole online match — [ECONOMY.md](ECONOMY.md) §6 |
| the $BLAT screen | Friends → «Invite to the game» (the link, the counts, the latest invitations); the menu's BLATS tile → the Arsenal's BLATS tab |
| BLAT DROP (the announcement, the countdown, the tokenomics, the project's wallet) | nothing |
| the $BLAT Tournament with stakes | the District Tournament («Турнир района») — the rating only — [KON.md](KON.md) |
| the founder's $BLAT pool | the founder keeps level 87 (its levels' BLATS as for anybody), every item and the badge |
| the dashboard's «$BLAT» page (balances, BLAT DROP date, snapshots) | «Приглашения» (invitations, held ones, talons paid) |

## The data is kept

Per the standing rule «не удаляй существующие данные, не проводи разрушительные миграции», migration
`023_blats.sql` only **adds**. Everything the retired features wrote stays in the database, unused:

* `profiles.blat`, `profiles.blat_earned`, `profiles.blat_level`;
* `currency_ledger` rows with `currency = 'blat'` (reasons `level`, `referral`, `allocation`, `stake`,
  `stake_win`, `stake_refund`) — hidden from the admin's player ledger;
* `blat_pools`, `blat_snapshots`, `blat_snapshot_rows`, the `app_settings` key `blat_drop.announce_at`;
* the stake columns of the tournament's tables (migration 022);
* `referrals` (still used — the invitations now pay talons; old rows keep their `$BLAT` reward numbers).

Rows that belong to a player (`profiles`, the ledger, `blat_snapshot_rows`, `referrals`) are deleted
with the player's account (foreign keys `ON DELETE CASCADE`); the privacy policy says so. Removing the
retired columns and tables for good would be a separate, deliberate migration — not part of v0.2.18.

## The old routes

`/api/blat*`, `/api/blat/drop*`, `/api/admin/blat*` and the tournament's stake fields are gone: the
routes answer 404, an older client's `stake` in a room request is ignored. The history of how $BLAT
worked (V2.0 – v0.2.17) is in the git history of this file and in [V2_REPORT.md](V2_REPORT.md).
