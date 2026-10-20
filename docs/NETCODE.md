# Netcode

Authoritative server, client-side prediction for the local player, interpolation for everyone else,
lag-compensated hitscan. Code: `packages/shared/src/net/*`, `apps/server/src/rooms/*`,
`apps/web/src/net/*`, `apps/web/src/game/session/OnlineSession.ts`.

## 1. Rates and budgets

| Item | Value | Where |
|---|---|---|
| Simulation | 60 Hz fixed step (`TICK_MS` 16.67 ms), same code on server and client | `constants/game.ts` |
| Snapshots | 30 Hz (every 2nd tick), binary: 19 B header + 48 B/player + pickups, shots, melee, equipment, flags, bases | `codec.ts` |
| Inputs | one 14-byte frame per client tick, sent in batches of 2 (≈30 messages/s) | `GameConnection.queueInput` |
| Interpolation delay | 100 ms behind the estimated server clock | `OnlineSession` |
| Lag compensation | history 600 ms, rewind clamped to 250 ms | `World.sampleHistory` |
| Bandwidth (10 players) | ≈21 KB/s down (snapshots average ≈0.7 KB, peaks ≈0.85 KB in fights), ≈1 KB/s up per client | measured from encoded sizes of a 10-bot match in every mode |

## 2. Connection lifecycle

1. `POST /api/rooms` (create, private → invite code) or `POST /api/rooms/quick` → `roomId`.
2. WebSocket `GET /ws` (same origin; foreign `Origin` → 403; ≤48 sockets per IP — a game and a social socket per app window; 4 KB max frame).
3. First message must be JSON `hello {protocol, token, roomId, character, clientVersion}` within 8 s
   (`PROTOCOL_VERSION` = 8: v2 assists and supply drops, v3 loadouts, rockets, medkits, v4 the arsenal,
   modifications and equipment, v5 ten players and team matches, v6 capture the flag and base capture,
   v7 ten more characters (an older client could not draw them) and the room chat, v8 three more maps
   (an older client has neither their geometry nor their art);
   older clients get `version_mismatch` and are asked to reload).
   The session token is verified exactly like the REST bearer token. Wrong protocol → `error
   version_mismatch` + close 1008; bad token → 4001; unknown room → 4004; full → 4005; finished → 4010.
4. Server replies `welcome {playerId, slot, mode, config, serverTime, tick, resumed}` and broadcasts
   `roster {players (with team and avatar), mode, mapId, hostId, …}` — the avatar id comes from the
   player's profile when the session is verified (`profiles.avatar`, null: the character's portrait).
5. Lobby: `ready`, `character`, `loadout`, `team` (move to the other side while the teams stay even),
   host-only `map`/`mode`/`start`, `leave`. Rooms hold up to 10 players (`MATCH_MAX_PLAYERS`). Public
   rooms are per mode (Quick Match never mixes free-for-all and team players) and start 4 s after the
   minimum number of players is present and ready; private rooms start when the host presses «Start»
   (or 0.6 s after every connected player marked themselves ready). Switching between team modes keeps the
   teams; coming from free-for-all they are dealt anew, alternating by arrival.
   **Filled lineups** (`MATCH_FILL_BOTS=true`, the default; §2a below) let one person always play.
6. Match phases (server state machine): `waiting → ready → countdown → active → finished → (waiting | closed)`.
7. Results: `results {matchId, reason, durationMs, standings, mapId, mode, teams?}` is broadcast once, right after the
   deciding events are flushed; personal `progress {xpGained, level, newAchievements}` follows when the
   database transaction commits, and the `roster` is re-broadcast with the levels just earned (nameplates
   and the Tab table in a rematch show the current level). `rematch` votes restart the room with a new
   match id.

### 2c. Room chat (text, v0.23)

Text only; a voice chat is postponed by the owner (it would need a TURN server for players behind NAT).
1. Client → server on the game socket: `chat {text, team?}` — any phase of the room (lobby, match,
   results); `text` is at most 400 UTF-16 units on the wire (schema), `team: true` asks for the own team only.
2. The server cleans the line (`cleanChat` in `net/protocol.ts`: control and direction-override characters
   become spaces, more than two combining marks in a row are cut, spaces collapse, at most 140 characters)
   and drops an empty one. Each connection has a token bucket (`CHAT_RULES`: 4 lines at once, one more
   every 2.5 s) — over it the sender alone gets `error chat_rate`; the same line again within 4 s is
   dropped silently.
3. Server → clients: `chat {id, name, slot, team, text, toTeam, at}` to every connected player of the room,
   or — a team line in a team mode — only to the sender's team (`toTeam: true`). In free-for-all a team
   line goes to everybody as an ordinary one. The name is the server's display name of the sender.
4. Nothing is stored or logged: the room passes the line on and forgets it. The client keeps the last 60
   lines of the current room (lobby panel, overlay during the match, results), shows a speech bubble over
   the speaker for 4.5 s and lets a player mute others locally (until the page reloads). Bots never chat.

### 2b. The social socket (`/ws/social`, v0.23)

A second, light WebSocket per app window carries friends' news; game rooms are untouched by it.
1. `GET /ws/social` (same origin and per-IP limits as `/ws`); the first message must be
   `{"type":"auth","token":…}` within 8 s (the REST session token) — then `ready {userId, unread, incoming}`.
   Up to 6 windows per player (the oldest is closed with 4409); a bad token closes with 4401.
2. Server → client JSON events: `presence {userId, status}` (`online`, `lobby` — in a room's lobby or on its
   results, `match`, `offline`; offline is announced 2.5 s after the last window closes, so a reload does
   not flicker), `friend_request`, `friend_accepted`, `friend_removed`, `dm {message, from}` (also to the
   sender's other windows), `dm_read {by, upTo}`, `invite {from, roomId, mode, mapId, isPrivate, at}`,
   `pong`. The client sends only `auth` and `ping` (every 30 s; 75 s of silence → reconnect with backoff).
3. Everything that changes data goes through REST (`/api/friends…`, `/api/messages/:id…`,
   `/api/friends/:id/invite`, `/api/leaderboard`); the socket only announces it. Presence comes from the
   room manager (`roomOf`), so it costs nothing per tick. One server process holds the whole presence map
   (see DEPLOYMENT.md before running several).

### 2a. Filled lineups

When too few people are in a room for a good match, the room completes the lineup with players it runs
itself — `BotBrain` (the practice AI) producing one input frame per tick through the same
`World.applyInput` as a client, so they obey every movement and weapon rule. Rules in
`packages/shared/src/sim/fill.ts` (`FILL_RULES`), logic in `MatchRoom` (`fillWant` / `fillStep` /
`fillTick`):

* **Lineup:** free-for-all at least 4 players; team modes at least 3 a side, the sides always even (the
  bigger side of people sets the size of both); never beyond `MATCH_MAX_PLAYERS`. Only connected people
  count — a person in the reconnect grace period keeps the lineup as it is.
* **Quick Match:** people get a head start of 5 s, then players arrive one by one every 0.7–2.2 s; the
  usual auto-start (4 s after two are present) begins the match ≈ 10 s after a lone person came, and the
  rest of the lineup is completed at kick-off.
* **Rooms with friends:** nobody is added while people gather; the host's «Start» works with one person
  (`roster.minToStart` = 1, so the lobby enables the button) and the lineup is completed (and the sides
  evened) the moment the match starts. Auto-start by «everyone ready» still needs two in the roster.
  With the fill on, people may join the same side (at most half the room each); the room evens it out.
* **During a match:** a person joining takes a filled place (a filled player leaves after 0.5–2 s, the one
  doing worst; at once if the room is full); a person leaving is replaced after 2.5–6 s, like someone
  joining in progress. After a match the filled players stay, ask for a rematch within 1.5–6 s like
  people (after a public match about a third move on); when the last person is gone (grace period
  over), they leave too and the room closes as an empty room.
* **Undistinguishable:** names like people's (the alias suggestions and casual names, `game-rules/
  nicknames.ts`), levels around the people's average (−3…+6; the AI plays easier against beginners and
  harder against veterans), an avatar two times in three, free and Arsenal characters and gear. `isBot`
  never leaves the server: `roster` and `results` carry `isBot: false` for everyone, ids are UUIDs like
  user ids, the public room info (`GET /api/rooms/:id`, invites) counts the whole lineup.
* **Records:** filled players are never stored individually; places, wins, XP and talons count them as
  opponents (a person finishing 2nd of 4 is 2nd); «played with friends» needs two people.
  `matches.player_count` holds the people and `matches.bot_count` (migration 008) the filled players; the
  match history shows the whole lineup; `match_started`/`match_completed` analytics carry `players`
  (people) and `fill`; the admin's live-rooms table has a «Добор» column.
* **Cost:** a room with 3–5 filled players takes 0.04–0.09 ms per tick in all (0.25–0.5 % of one core,
  measured on every mode). Navigation grids are built once per map and shared by all rooms; the A*
  search space is reused between searches (no allocation), a bot searches for a way at most four times
  a second for a moving goal and otherwise every 0.7–1.1 s, and a search may cover the whole map, so a
  reachable goal is always found (it used to stop after 6000 cells: on the larger maps bots stood still
  and searched again every tick — 17 % of a core for one capture-the-flag room on «Советский двор»).

## 3. Input path and validation (server)

* Binary input decoding rejects wrong type, count (1–8), length, out-of-range axes (−128), unknown
  button bits and slots > 3 (`ProtocolError`).
* Per client: sequence numbers must increase (duplicates/replays are dropped), queue ≤ 40 frames, token
  bucket (1 token per server tick, burst 12, ≤3 inputs applied per tick). A client cannot move faster by
  sending more inputs: the realtime test floods 400 diagonal frames in 0.5 s and checks the distance stays
  within `RUN_SPEED × elapsed`.
* JSON control messages are zod-validated; ≤150 messages/s; each malformed message is a violation and
  >50 violations close the socket (`kicked`, 1008).
* Movement: axes are normalised (diagonals are not faster), acceleration/deceleration, swept collision with
  wall sliding against the shared collision world; positions are clamped to the map.
* Weapons: fire interval, ammo, reload state, slot ownership (heavy weapon must be picked up), spread from a
  seeded per-shot RNG; hitscan rays stop at walls and shot-blocking props; damage falloff by distance;
  spawn protection; melee arc and range. Damage, eliminations, score, respawn and XP are decided only here.
* The client's `viewTime` (the timeline it was rendering) is used for lag compensation but clamped to
  `[now − 250 ms, now]`, so a lying client gains at most the normal compensation window.

## 3a. Scoring and supply drops (decided by the shared `World`, i.e. by the server online)

* **Points.** Elimination +2, assist +1 (`SCORING` in `game-rules/match.ts`). An assist is credited to every
  other player who dealt ≥ 20 damage to the victim within the 6 s before the elimination; the victim's damage
  log is cleared on death. The score limit is in points (`MATCH_SCORE_LIMIT`, default 50 online, 40 in
  practice) and an assist can end the match. Standings: points → eliminations → fewer deaths.
* **Kill event.** `{t:'kill', killer, victim, weapon, assists:[slots]}` — the client shows «+2 УСТРАНЕНИЕ» /
  «+1 ПОМОЩЬ» and the assisters in the kill feed.
* **«Дефицит» supply drops.** First drop 25 s into the match, then every 35 s (`supplyFirstMs`,
  `supplyIntervalMs`): the server picks a map `supplyPoint` (seeded RNG) that is ≥ 48 px from other active
  pickups and ≥ 110 px from living players, spawns an обрез or автомат with a full magazine and full
  reserve, and emits `{t:'supply', x, y, weapon}`. Unclaimed crates disappear after 30 s (`supplyTtlMs`).
  Picking up a crate follows the normal pickup rules. Each map also has 6 extra fixed weapon spawns.

## 3b. Game modes (`GAME_MODES` in `game-rules/match.ts`, decided by the `World`)

| Mode | Team score | Ends at | Notes |
|---|---|---|---|
| `ffa` — every man for himself | — | 50 points of a player (`MATCH_SCORE_LIMIT`) | standings by points |
| `teams` — red vs blue | eliminations | 40 (`MATCH_TEAM_SCORE_LIMIT`) | no friendly fire: bullets pass through teammates, blasts/fire/mines/turrets/flash spare them (the owner's own blast still hurts the owner) |
| `ctf` — capture the flag | flags captured | 3 (`MATCH_CAPTURE_LIMIT`) | `CTF_RULES`: touch 24 px; an enemy takes a flag from its stand or the ground; a carrier who is eliminated, leaves or disconnects drops it; a teammate who touches their own dropped flag sends it home (+2), otherwise it returns by itself after 15 s; a carrier scores at their own stand only while their own flag is home (+6 points, +1 team); stealing +1, stopping a carrier +1 |
| `bases` — base capture | a point per base held per second | 250 (`MATCH_BASE_SCORE_LIMIT`) | `BASE_RULES`: zones of 56 px (A, B, C); a team alone inside fills the bar (6 s alone, +50 % per extra teammate, ≤ 2.5×); both teams inside → contested, nothing moves; the other team's bar is pushed back first; an empty zone's bar fades at half speed; taking a base gives +3 to everyone inside |

Team modes balance the teams at the start (latest arrivals and bots move first), start each team on its
own half of the map; in `ctf` and `bases` a team always respawns on its own half. Flag stands and bases are
part of every map (`MapDef.flagStands`, `MapDef.bases`; tests check they are open, reachable and that
both teams walk about the same distance to the enemy flag). Objective events go out with the other JSON
events: `{t:'flag', action:'taken'|'dropped'|'returned'|'captured', team, slot}` and
`{t:'base', base, team, from, slots}`. Per-player captures (`objectives`) are in the snapshot, the
results and the match record, and give XP (`XP_RULES.perObjective`, 15 each).

## 4. Client: prediction, reconciliation, interpolation

* **Clock.** Each snapshot carries `serverTime`; the client keeps the maximum `(serverTime − arrival)` over a
  3 s window (the least-delayed packet) and eases toward it. Render time = estimated server time − 100 ms.
* **Local player.** Inputs are applied immediately to a local copy of the player using the same
  `stepMovement`/`stepWeapons` as the server (prediction, including fire-rate, ammo and reload).
  Each snapshot acknowledges the last processed input `ack`; the client resets to the authoritative state
  and replays unacknowledged inputs. Corrections under 48 px are hidden by a decaying render offset;
  larger ones (respawn, teleport-sized errors) snap.
* **Other players** are interpolated between the two snapshots around render time (no extrapolation).
* **Events.** Remote shots, damage and kills are released on the interpolated timeline, so muzzle flashes
  and blood line up with where the shooter/victim is drawn. Own shots are shown instantly (predicted);
  authoritative impacts follow.
* **Reconnect.** Socket loss → exponential backoff (0.4–8 s, 8 attempts). The server keeps the slot for
  `reconnectGraceMs` (30 s): the avatar is removed from play while disconnected (no free kills), resumes
  on reconnect with the same slot and respawns. A second connection of the same account replaces the
  first (close 4009).

## 5. Snapshot layout (little-endian)

```
u8 type=2 | u32 tick | u32 serverTimeMs | u8 phase | u32 phaseRemainingMs | u16 teamScoreRed | u16 teamScoreBlue
   | u8 playerCount                                                                         (19 B)
player × N (48 B): u8 slot | u8 flags(alive,connected,reloading,invulnerable,walking,hasHeavy,laser)
   | u16 x*4 | u16 y*4 | i16 vx*8 | i16 vy*8 | u16 aim | u8 hp | u8 weapon | u8 sideMag | u8 heavy(255=none)
   | u8 heavyMag | u8 heavyReserve | u16 kills | u16 deaths | u16 score | u32 ackSeq | u16 reloadLeft
   | u16 cooldownLeft | u16 spreadHeat*1e4 | u16 shotCounter | u16 respawnIn | u16 assists | u8 sidearm
   | u8 melee | u8 gadget(255 none) | u8 gadgetCharges | u16 flashedMs | u8 team(255 none) | u8 objectives
u8 pickupCount, pickup × N (8 B): u16 id | u8 weapon | u8 flags(active,dropped,supply,medkit) | u16 x*4 | u16 y*4
u16 shotCount, shot × N: u8 shooter | u8 arms | u16 shotId | u16 ox*4 | u16 oy*4 | u8 pellets | u8 flags(turret,silenced)
   | pellet × n (6 B): u16 angle | u16 dist*4 | u8 hitSlot(255 none) | u8 kind(0 miss,1 wall,2 player)
u8 meleeCount, melee × N (4 B): u8 shooter | u16 angle | u8 hitSlot
u8 gadgetCount, gadget × N (15 B): u16 id | u8 kind | u8 ownerSlot | u8 phase(+8 triggered) | u16 x*4 | u16 y*4
   | u16 aim | u8 hp | u16 leftMs/10 | u8 0
u8 flagCount (0 or 2), flag × N (9 B): u8 team | u8 status(0 home,1 carried,2 dropped) | u8 carrierSlot(255)
   | u16 x*4 | u16 y*4 | u16 returnInMs/10
u8 baseCount (0–8), base × N (4 B): u8 owner(255) | u8 capturer(255) | u8 progress*255
   | u8 bits(contested, red inside ≤7 <<1, blue inside ≤7 <<4)
```
Flag stands and base centres are not sent: both sides read them from the shared map. A carried flag is
drawn on its carrier (the local carrier immediately, others on the interpolated timeline).
Input frame (14 B): `u32 seq | i8 moveX | i8 moveY | u16 aim | u8 buttons(FIRE,RELOAD,WALK,INTERACT,NEXT)
| u8 slot | u32 viewTimeMs`, batch header `u8 type=1 | u8 count`.

## 6. Verification

* `apps/server/src/rooms/realtime.test.ts` (14 tests, real HTTP+WS server, independent `ws` clients):
  authoritative combat with identical results and identical per-tick positions on both clients, kill
  events delivered before results, results/XP sent once, speed-hack flood, invalid handshakes and
  commands, capacity (11th player refused), team matches (dealing, switching, no friendly fire, team
  results), capture the flag (take, carry, capture through the server, objectives in snapshots, results and
  the match record) and base capture (Quick Match by mode, a base taken and scoring), disconnect/resume/
  replace, grace-period expiry and empty-room cleanup, rematch with separately recorded matches and the
  roster refreshed with the earned level, owned gear, the room chat (everybody, team only, cleaning, the
  rate limit).
* `packages/shared/src/__tests__/` — codec round-trips and malformed input rejection, lag compensation,
  walls blocking shots, movement normalisation, sliding, weapons timing, assists (window, minimum damage,
  reaching the limit), supply drops (free point away from players, full ammo, expiry), teams
  (`teams.test.ts`) and objectives (`objectives.test.ts`: flag and base rules, limits, respawn sides, map
  objective points, codec, bots taking flags and bases).
* `tests/e2e/online.mjs` — two real browsers play a match through the server; `tests/e2e/modes.mjs` — a
  capture-the-flag room in an English and a Russian browser, mode switching, flags in both HUDs, team
  results, Quick Match by mode (see [TESTING.md](TESTING.md)).
