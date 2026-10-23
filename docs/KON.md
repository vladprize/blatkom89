# «Блатной кон» — ranked matches 1×1 … 5×5 (V2.0 part D)

A separate competitive section: people against people with fixed sides, its own rating for players and
for gangs (ОПГ), win/loss records, streaks, tables and a match history. **No stakes:** nothing is paid,
reserved or won in $BLAT or anything else; the Kon rating is not connected to $BLAT. The stakes module
is designed (§6) and switched off.

Rules: `packages/shared/src/game-rules/kon.ts`; rooms: `apps/server/src/rooms/` (a Kon room is a
`MatchRoom` with `kon` set); ratings and tables: `apps/server/src/kon/`; screen:
`apps/web/src/ui/screens/kon.ts`.

## 1. Formats

| Format | People per side | Ends at (team eliminations) | Length (default server, 4-minute matches) |
|---|---|---|---|
| 1×1 | 1 | 10 | 3 min (0.75 × `MATCH_DURATION_SEC`) |
| 2×2 | 2 | 15 | 4 min |
| 3×3 | 3 | 20 | 4 min |
| 5×5 | 5 | 30 | 5 min (1.25 ×) |

Team deathmatch (red against blue) on any of the ten maps. Only people: a Kon room never fills anybody in
(also with `MATCH_FILL_BOTS=true`), nobody joins a match that is on, the mode cannot be switched.

## 2. Playing

- **Find opponents** (the search): the server puts the player into a public Kon room of that format that
  is still gathering (the fullest first) or opens one on a random map. When it is full — 2 × the side —
  the match starts by itself after a short countdown; the sides are dealt by Kon rating (strongest first:
  red, blue, blue, red…) so neither side gets all the best. The Kon screen shows how many people are
  waiting in each format.
- **Create a room**: a private Kon room with an invitation link (the same links as other rooms); the
  host picks the map, players pick their side (never more than the format allows on a side); the host
  starts when both sides are full.
- **The lobby** shows the format, the rules line, both sides with their free seats and the players'
  Kon ratings.
- **After the match** the results screen shows the Kon rating change; a rematch keeps the lineup.

## 3. The Kon rating

Elo with a 400-point scale: everyone starts at **1000** (`KON_RATING`); for each player the side's
average rating meets the other side's: expected = 1 / (1 + 10^((theirs − mine) / 400)), change =
round(K × (result − expected)), result 1 / ½ / 0, K = 40 for the first 10 Kon matches, then 24; never
below 100. A player who left the match before the end loses — also when the reconnect window has already
taken them out of the room. When one side has nobody left, the match ends 20 seconds later and the side
that stayed wins, whatever the score. The general rating (Top-100) does not move in Kon matches; XP, talons and levels
(and so $BLAT for levels) are earned as in any online match.

**Gangs:** a side of two or more players who are all in the same gang plays for that gang too — the
gang's Kon rating moves by the same formula (the gang's rating against the other gang's, or against the
other side's average when that side is not one gang). 1×1 never moves a gang.

Records per player: matches, wins, losses, draws, current and best win streak; per gang: matches,
wins, losses, draws. Stored in `profiles.kon_*` and `clubs.kon_*`; each match's change in
`match_participants.kon_delta`, the format in `matches.kon_format` (migration 018, adds only). Results are
written in the match-results transaction and once only (the same lock as XP).

## 4. Tables and history

- `GET /api/kon` — the player's numbers, the last 20 Kon matches (format, map, side, result, Kon change,
  team-mates and opponents), how many people are waiting in public rooms of each format;
- `GET /api/kon/top?by=players|gangs` — the first 100 by Kon rating (players and gangs with at least one
  Kon match), the player's own place.

## 5. API for rooms

`POST /api/rooms { mapId, isPrivate: true, mode: 'teams', kon: '2x2' }` and
`POST /api/rooms/quick { mode: 'teams', kon: '2x2', mapId? }`. The room's roster carries `kon`.

## 6. Stakes — designed, switched off

The owner proposed stakes in $BLAT (for example 3×3, 5 000 each: a pool of 30 000, 10 000 to each
winner). **Not active**, and not to be switched on without the owner's separate approval and a legal
review — $BLAT may gain an economic value later, and stakes on a game's outcome are regulated in many
countries. `KON_STAKES.enabled` is a constant `false` in `game-rules/konStakes.ts` (a code change, not a
setting); there are no stake endpoints, no UI and no database tables.

What a future implementation has to do (the settlement rule is written and tested as a pure function,
`settleStakes`):

1. **Reservation on the server**: every participant confirms; the server moves the stake from the
   balance into a reservation (ledger row `kon-stake:<match>:<player>` — the unique index makes a
   second reservation of the same stake impossible) inside one transaction with the balance check.
2. **All or nothing**: the match starts only when every stake is reserved; otherwise every reservation
   is returned.
3. **Result only from the server**: the server's own match result decides; clients can't report it.
4. **Settlement**: winners share the whole pool equally (what doesn't divide goes one by one to the
   winners in id order — nothing is created or lost); a draw, a technical failure or an aborted match
   returns every stake; a leaver's stake stays in the pool. Idempotent: settling twice changes nothing.
5. **Every movement is a ledger row**; reservations older than the longest match are returned by a
   job; the admin sees pools, reservations and settlements.
