# The $BLAT Tournament — ranked matches 1×1 … 5×5 with stakes (V2.0 part D «Блатной кон», v0.2.17)

A separate competitive section: people against people with fixed sides, its own rating for players and
for gangs (ОПГ), win/loss records, streaks, tables and a match history — and, since v0.2.17, **stakes in
$BLAT**: everyone in a staked room stakes the same, the winning side takes the pool (§6), and gang
battles — a gang calls another out (§7). Without a stake the tournament plays for the rating only, as
«Блатной кон» did. The owner renamed it in v0.2.17:
«Блатной Кон надо переименовать на $BLAT Турнир / Tournament» — «$BLAT Турнир» in Russian, «$BLAT
Tournament» in English; the code keeps its old name (`kon`).

Rules: `packages/shared/src/game-rules/kon.ts` (formats, rating) and `game-rules/konStakes.ts` (stakes);
rooms: `apps/server/src/rooms/` (a tournament room is a `MatchRoom` with `kon` set, and `stake`); stakes
on the server: `apps/server/src/blat/stakes.ts`; ratings and tables: `apps/server/src/kon/`; screen:
`apps/web/src/ui/screens/kon.ts`.

## 1. Formats

| Format | People per side | Ends at (team eliminations) | Length (default server, 4-minute matches) |
|---|---|---|---|
| 1×1 | 1 | 10 | 3 min (0.75 × `MATCH_DURATION_SEC`) |
| 2×2 | 2 | 15 | 4 min |
| 3×3 | 3 | 20 | 4 min |
| 5×5 | 5 | 30 | 5 min (1.25 ×) |

Team deathmatch (red against blue) on any of the ten maps. Only people: a tournament room never fills
anybody in (also with `MATCH_FILL_BOTS=true`), nobody joins a match that is on, the mode cannot be switched.

## 2. Playing

- **The menu**: «$BLAT Tournament» stands out — gold, with the cup and the coin — between «Play with
  friends» and «Practice».
- **The stake** (§6): «No stake» or 100 / 500 / 1 000 / 5 000 $BLAT from each player. A stake the player
  can't make now (a new account, not enough $BLAT, the day's limit) is greyed out with the reason; the
  last choice is remembered on the device.
- **Find opponents** (the search): the server puts the player into a public tournament room of that
  format **and that stake** that is still gathering (the fullest first) or opens one on a random map.
  When it is full — 2 × the side — the match starts by itself after a short countdown; the sides are
  dealt by tournament rating (strongest first: red, blue, blue, red…) so neither side gets all the best.
  The screen shows how many people are waiting in each format at the chosen stake.
- **Create a room**: a private tournament room (with the chosen stake) and an invitation link; the host
  picks the map, players pick their side (never more than the format allows on a side); the host starts
  when both sides are full.
- **Before a staked match** the player sees the stake, the pool and the rules and confirms — when they
  search or create, and when they come in through an invitation, a room link or a friend's invitation.
- **The lobby** shows the format, the stake and the pool («Stake 100 $BLAT each · pool 200 $BLAT — the
  winners share it»), both sides with their free seats and the players' tournament ratings; while the
  stakes are taken: «The stakes are being taken — the match starts in a moment…».
- **After the match** the results screen shows the tournament rating change and the stake's outcome
  («+100 $BLAT: your share of the pool (200)», «the stake stays in the pool», «a draw — the stake is
  back»); a rematch keeps the lineup and the stake (each player's stake is taken again).

## 3. The tournament rating

Elo with a 400-point scale: everyone starts at **1000** (`KON_RATING`); for each player the side's
average rating meets the other side's: expected = 1 / (1 + 10^((theirs − mine) / 400)), change =
round(K × (result − expected)), result 1 / ½ / 0, K = 40 for the first 10 tournament matches, then 24;
never below 100. A player who left the match before the end loses — also when the reconnect window has
already taken them out of the room. When one side has nobody left, the match ends 20 seconds later and
the side that stayed wins, whatever the score. The general rating (Top-100) does not move in tournament
matches; XP, talons and levels (and so $BLAT for levels) are earned as in any online match. **The rating
never depends on the stake**: the same match moves it the same with or without one.

**Gangs:** a side of two or more players who are all in the same gang plays for that gang too — the
gang's rating moves by the same formula (the gang's rating against the other gang's, or against the
other side's average when that side is not one gang). 1×1 never moves a gang.

Records per player: matches, wins, losses, draws, current and best win streak; per gang: matches,
wins, losses, draws. Stored in `profiles.kon_*` and `clubs.kon_*`; each match's change in
`match_participants.kon_delta`, the format in `matches.kon_format` (migration 018, adds only). Results are
written in the match-results transaction and once only (the same lock as XP).

## 4. Tables and history

- `GET /api/kon` — the player's numbers, the last 20 tournament matches (format, map, side, result, rating
  change, team-mates and opponents, **the stake and what came back**), how many people are waiting in
  public rooms of each format (`waiting`, and `waitingByStake` per stake), and the player's stakes
  (`stakes`: the switch, the balance, a reason that stops every stake, what may still be staked today);
- `GET /api/kon/top?by=players|gangs` — the first 100 by tournament rating (players and gangs with at
  least one tournament match), the player's own place.

## 5. API for rooms

`POST /api/rooms { mapId, isPrivate: true, mode: 'teams', kon: '2x2', stake: 500 }` and
`POST /api/rooms/quick { mode: 'teams', kon: '2x2', stake: 500, mapId? }` — `stake` is 0 or one of the
amounts and only for tournament rooms; a player who can't stake it gets `409` with the reason's code
(below). The room's roster carries `kon`, `stake` and `staking`; `GET /api/rooms/:id` and
`GET /api/invites/:code` carry `stake`. The WebSocket `hello` of a player coming into a staked room must
carry `stake` equal to the room's (the player agreed to it; an old client gets `stake_confirm`), and the
player must be able to stake it then.

## 6. Stakes

The owner: «игроки играют, ставя свои токены поровну» — everyone stakes the same, the winners take the
pool. $BLAT are in-game points (BLAT.md); a stake moves them between players and creates none. The
legal note given to the owner before this was switched on stands: $BLAT may gain an economic value
later, and stakes on a game's outcome are regulated in many countries — `TOURNAMENT_STAKES=false` turns
every stake off at once (the tournament then plays for the rating only).

**Who may stake** (`stakeRefusal`, checked by the server when a room is made or searched for, when a
player comes into a staked room, and again inside the reservation):

| Code | Rule |
|---|---|
| `stakes_off` | `TOURNAMENT_STAKES` is off |
| `account_new` | the account is less than a day old (`KON_STAKES.minAccountAgeMs`) |
| `blat_flagged` | the account's $BLAT are held for a check (`users.blat_flag`, BLAT.md) |
| `blat_low` | the balance doesn't cover the stake |
| `daily_limit` | more than 20 000 $BLAT staked in 24 hours (`KON_STAKES.dailyLimit`; stakes that came back don't count) |

**The reservation — all or nothing.** When a staked match is about to start (the host's «Start», the
search's countdown, a rematch), the room reserves every connected player's stake in **one transaction**
(`PgStakes.reserve`): the match row is written with `stake` and `stakes_state = 'reserved'`, and each
player's stake is a ledger row `stake` (negative, operation id `stake:<match>` — the unique index makes a
second reservation of it impossible). If anyone can't stake, nothing is taken: that player leaves the
room with the reason and the others wait for someone who can. If the lineup changed while the stakes
were being taken, every stake goes back and nothing starts. The match runs under the id the stakes were
reserved for.

**Settlement — once, from the server's own result**, inside the match-results transaction that holds
the match row (`settleMatchStakes`, the rule in `settleStakes`):

- a win: the winners **who stayed to the end** share the whole pool equally (what doesn't divide goes one
  by one to the winners in id order — nothing is created or lost) — ledger rows `stake_win`;
- a draw: those who stayed get their stake back and share the stakes of those who left (`stake_refund`);
- a player who leaves forfeits their stake to the pool (also a winner who left);
- nobody stayed: every stake goes back.

`stakes_state` becomes `settled` (or `refunded`); a retried result pays nothing more.

**A match that never finishes** — the room broke, the server stopped — gets every stake back: at once
when the room is closed (`matchAbandoned`), and otherwise by a job that runs 20 s after the server starts
and every 5 minutes, for reservations older than any match can last (`refundStaleStakes`; at least 10
minutes). Every movement is a ledger row with its operation id.

**What a player sees**: the stake picker with the pools, the reason when a stake isn't available, the
confirmation sheet, the lobby's stake line, the results' stake line, the history's ±$BLAT, and the
$BLAT screen's history («Stake in the $BLAT Tournament», «Won in the $BLAT Tournament», «Stake
returned»).

**Known limits** (not solved by the rules above): two accounts of one person can still play each other —
the day-old accounts, the daily limit and the hold on flagged accounts keep that small; the admin's
player card shows every ledger row for a check.

## 7. Gang battles (v0.2.17 part 3)

The owner: «бои ОПГ против ОПГ». A gang calls another gang out to a tournament battle: a private
tournament room — team deathmatch, fixed sides, people only, **no stake** — whose sides are the two gangs.
Rules: `packages/shared/src/game-rules/gangBattle.ts`; the room: `MatchRoom` with `battle` set.

- **Calling out**: on another gang's page (Gangs → a gang) a member of a gang sees «Call out to battle
  [mine] against [theirs]» → the sheet: 2×2, 3×3 or 5×5 (1×1 is not a gang battle) → the room is made at
  once and the caller is in it. The map is picked in the room.
- **Who may call** (`gangBattleRefusal`, checked by the server): the caller is in a gang (`no_gang`, 403),
  the other gang exists (`not_found`, 404) and is another gang (`own_gang`, 409), and both gangs have at
  least the format's side of people of their own (`too_few`, 409 — the house gangs' made-up members don't
  count). At most 6 calls per player in 2 minutes.
- **The call**: everyone of the two gangs who is in the game now (the caller aside) gets the call live —
  a card «Gang battle 2×2: [X] against [Y] · {caller} calls the gangs out · {map}» with «To battle»; the
  others get the room's link from the caller (Share / Copy in the room).
- **The room**: the caller's gang plays red, the other gang blue; each person comes in on their gang's
  side and nobody changes sides (`kon_fixed`). Nobody else comes in: the gateway turns away anyone whose
  gang is neither side (`battle_gang`), and a full side takes nobody more («Your gang's side is full»).
  The invitation carries the battle (`GET /api/invites/:code` → `battle`), so a stranger's app says
  «This is a battle of [X] … and [Y] … — only their people come in» without connecting. The lobby shows
  «Gang battle 2×2», the two flags with «[X] … vs [Y] …», and the sides headed by the gangs.
- **The result**: a battle is a tournament match of its format — the players' tournament ratings move as
  in any tournament match, and since every side is one gang, both gangs' tournament ratings and records
  move too (§3).

API: `POST /api/clubs/:id/battle { kon: '2x2' | '3x3' | '5x5', mapId? }` → `201 { roomId, inviteCode,
inviteUrl, webUrl, mapId, mode: 'teams', kon, stake: 0, battle: { red, blue }, told }` (`told`: how many
of the two gangs' people got the call live). The room's roster carries `battle`; the invitation event on
the social socket carries `battle: { red, blue, format }`.

## 8. A friend called to battle (v0.2.17 part 3)

The owner: «позвать друга в бой». In Friends, each friend's row has «To battle» → a sheet with the four
modes (every man for himself, red vs blue, capture the flag, base capture) and «Duel 1×1» (the $BLAT
Tournament 1×1 for the rating, no stake) → «Call to battle»: the room is made at once and the friend
gets the invitation card live (or is told to be offline); the map is picked in the room, more friends
can be called from there.
