# Netcode

Authoritative server, client-side prediction for the local player, interpolation for everyone else,
lag-compensated hitscan. Code: `packages/shared/src/net/*`, `apps/server/src/rooms/*`,
`apps/web/src/net/*`, `apps/web/src/game/session/OnlineSession.ts`.

## 1. Rates and budgets

| Item | Value | Where |
|---|---|---|
| Simulation | 60 Hz fixed step (`TICK_MS` 16.67 ms), same code on server and client | `constants/game.ts` |
| Snapshots | 30 Hz (every 2nd tick), binary, ~15 B header + 40 B/player + pickups/shots | `codec.ts` |
| Inputs | one 14-byte frame per client tick, sent in batches of 2 (≈30 messages/s) | `GameConnection.queueInput` |
| Interpolation delay | 100 ms behind the estimated server clock | `OnlineSession` |
| Lag compensation | history 600 ms, rewind clamped to 250 ms | `World.sampleHistory` |
| Bandwidth (6 players) | ≈9–10 KB/s down, ≈1 KB/s up per client | measured from encoded sizes |

## 2. Connection lifecycle

1. `POST /api/rooms` (create, private → invite code) or `POST /api/rooms/quick` → `roomId`.
2. WebSocket `GET /ws` (same origin; foreign `Origin` → 403; ≤24 sockets per IP; 4 KB max frame).
3. First message must be JSON `hello {protocol, token, roomId, character, clientVersion}` within 8 s.
   The session token is verified exactly like the REST bearer token. Wrong protocol → `error
   version_mismatch` + close 1008; bad token → 4001; unknown room → 4004; full → 4005; finished → 4010.
4. Server replies `welcome {playerId, slot, config, serverTime, tick, resumed}` and broadcasts `roster`.
5. Lobby: `ready`, `character`, host-only `map`/`start`, `leave`. Public rooms start 4 s after the
   minimum number of players is present and ready; private rooms start when the host presses «Начать»
   (or 0.6 s after every connected player marked themselves ready).
6. Match phases (server state machine): `waiting → ready → countdown → active → finished → (waiting | closed)`.
7. Results: `results {matchId, reason, durationMs, standings}` is broadcast once, right after the
   deciding events are flushed; personal `progress {xpGained, level, newAchievements}` follows when the
   database transaction commits. `rematch` votes restart the room with a new match id.

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
u8 type=2 | u32 tick | u32 serverTimeMs | u8 phase | u32 phaseRemainingMs | u8 playerCount
player × N (40 B): u8 slot | u8 flags(alive,connected,reloading,invulnerable,walking,hasHeavy) | u16 x*4 | u16 y*4
   | i16 vx*8 | i16 vy*8 | u16 aim | u8 hp | u8 weapon | u8 pistolMag | u8 heavy(255=none) | u8 heavyMag
   | u8 heavyReserve | u16 kills | u16 deaths | u16 score | u32 ackSeq | u16 reloadLeft | u16 cooldownLeft
   | u16 spreadHeat*1e4 | u16 shotCounter | u16 respawnIn | u16 reserved
u8 pickupCount, pickup × N (8 B): u16 id | u8 weapon | u8 flags(active,dropped) | u16 x*4 | u16 y*4
u16 shotCount, shot × N: u8 shooter | u8 weapon | u16 shotId | u16 ox*4 | u16 oy*4 | u8 pellets | u8 0
   | pellet × n (6 B): u16 angle | u16 dist*4 | u8 hitSlot(255 none) | u8 kind(0 miss,1 wall,2 player)
u8 meleeCount, melee × N (4 B): u8 shooter | u16 angle | u8 hitSlot
```
Input frame (14 B): `u32 seq | i8 moveX | i8 moveY | u16 aim | u8 buttons(FIRE,RELOAD,WALK,INTERACT,NEXT)
| u8 slot | u32 viewTimeMs`, batch header `u8 type=1 | u8 count`.

## 6. Verification

* `apps/server/src/rooms/realtime.test.ts` (8 tests, real HTTP+WS server, independent `ws` clients):
  authoritative combat with identical results and identical per-tick positions on both clients, kill
  events delivered before results, results/XP sent once, speed-hack flood, invalid handshakes and
  commands, capacity (7th player refused), disconnect/resume/replace, grace-period expiry and empty-room
  cleanup, rematch with separately recorded matches.
* `packages/shared/src/__tests__/` — codec round-trips and malformed input rejection, lag compensation,
  walls blocking shots, movement normalisation, sliding, weapons timing.
* `tests/e2e/online.mjs` — two real browsers play a match through the server (see [TESTING.md](TESTING.md)).
