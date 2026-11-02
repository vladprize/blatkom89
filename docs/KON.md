# The District Tournament — ranked matches 1×1 … 5×5 (V2.0 part D «Блатной кон»; v0.2.18 «Турнир района»)

A separate competitive section: people against people with fixed sides, its own rating for players and
for gangs (ОПГ), win/loss records, streaks, tables and a match history, and gang battles — a gang calls
another out (§7). **It plays for the rating only.** History of the name: «Блатной кон» (V2.0), «$BLAT
Турнир / $BLAT Tournament» with stakes in $BLAT (v0.2.17); **v0.2.18** (the owner's pre-release edits,
the crypto theme removed): «Турнир района» in Russian, «District Tournament» in English, **no stakes**
(§6). The code keeps its old name (`kon`).

Rules: `packages/shared/src/game-rules/kon.ts` (formats, rating); rooms: `apps/server/src/rooms/` (a
tournament room is a `MatchRoom` with `kon` set); ratings and tables: `apps/server/src/kon/`; screen:
`apps/web/src/ui/screens/kon.ts`.

## 1. Formats

| Format | People per side | Ends at (team eliminations) | Length (default server, 4-minute matches) |
|---|---|---|---|
| 1×1 | 1 | 10 | 3 min (0.75 × `MATCH_DURATION_SEC`) |
| 2×2 | 2 | 15 | 4 min |
| 3×3 | 3 | 20 | 4 min |
| 5×5 | 5 | 30 | 5 min (1.25 ×) |

Team deathmatch (red against blue) on any of the maps. Only people: a tournament room never fills
anybody in (also with `MATCH_FILL_BOTS=true`), nobody joins a match that is on, the mode cannot be switched.

## 2. Playing

- **The menu**: «District Tournament» stands out — gold, with the cup — between «Play with friends» and
  «Practice» (on phones three in a row); its line: «rating · 1×1 … 5×5».
- **The screen**: the player's rating, wins, losses, draws and streaks; the four formats with their rules;
  «People only: the tournament rating, wins and streaks are what is at stake.»
- **Find opponents** (the search): the server puts the player into a public tournament room of that
  format that is still gathering (the fullest first) or opens one on a random map. When it is full —
  2 × the side — the match starts by itself after a short countdown; the sides are dealt by tournament
  rating (strongest first: red, blue, blue, red…) so neither side gets all the best. The screen shows how
  many people are waiting in each format.
- **Create a room**: a private tournament room and an invitation link; the host picks the map, players
  pick their side (never more than the format allows on a side); the host starts when both sides are full.
- **The lobby** shows the format («District Tournament 2×2»), both sides with their free seats and the
  players' tournament ratings.
- **After the match** the results screen shows the tournament rating change; a rematch keeps the lineup.

## 3. The tournament rating

Elo with a 400-point scale: everyone starts at **1000** (`KON_RATING`); for each player the side's
average rating meets the other side's: expected = 1 / (1 + 10^((theirs − mine) / 400)), change =
round(K × (result − expected)), result 1 / ½ / 0, K = 40 for the first 10 tournament matches, then 24;
never below 100. A player who left the match before the end loses — also when the reconnect window has
already taken them out of the room. When one side has nobody left, the match ends 20 seconds later and
the side that stayed wins, whatever the score. The general rating (Top-100) does not move in tournament
matches; XP, talons and levels (and so BLATS for levels) are earned as in any online match.

**Gangs:** a side of two or more players who are all in the same gang plays for that gang too — the
gang's rating moves by the same formula (the gang's rating against the other gang's, or against the
other side's average when that side is not one gang). 1×1 never moves a gang.

Records per player: matches, wins, losses, draws, current and best win streak; per gang: matches,
wins, losses, draws. Stored in `profiles.kon_*` and `clubs.kon_*`; each match's change in
`match_participants.kon_delta`, the format in `matches.kon_format` (migration 018, adds only). Results are
written in the match-results transaction and once only (the same lock as XP).

## 4. Tables and history

- `GET /api/kon` — the player's numbers, the last 20 tournament matches (format, map, side, result, rating
  change, team-mates and opponents) and how many people are waiting in public rooms of each format
  (`waiting`);
- `GET /api/kon/top?by=players|gangs` — the first 100 by tournament rating (players and gangs with at
  least one tournament match), the player's own place.

## 5. API for rooms

`POST /api/rooms { mapId, isPrivate: true, mode: 'teams', kon: '2x2' }` and
`POST /api/rooms/quick { mode: 'teams', kon: '2x2', mapId? }`. The room's roster carries `kon`. An older
client's `stake` in these requests or in the WebSocket `hello` is ignored (v0.2.18).

## 6. Stakes — removed in v0.2.18

v0.2.17 let the players of a tournament room stake $BLAT (the winners took the pool). The owner removed
the whole crypto theme before the release, and the stakes with it: there is no stake picker, no stake
confirmation, no pool and no stake line in the lobby, the results or the history; the server takes and
pays nothing; `TOURNAMENT_STAKES` is gone from the configuration. The tables and columns the stakes wrote
(`matches.stake`, `matches.stakes_state`, the `stake` / `stake_win` / `stake_refund` ledger rows in
`$BLAT`) stay in the database, unused ([BLAT.md](BLAT.md)). The tournament plays for the rating, the
records and the gangs' standing.

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
modes (every man for himself, red vs blue, capture the flag, base capture) and «Duel 1×1» (the District
Tournament 1×1, for the rating) → «Call to battle»: the room is made at once and the friend
gets the invitation card live (or is told to be offline); the map is picked in the room, more friends
can be called from there.
