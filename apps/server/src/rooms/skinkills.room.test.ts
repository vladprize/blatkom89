/**
 * v0.2.23: the legendary skins' kill counter. A room counts a person's eliminations with a weapon that wears
 * a skin (not with a plain one, not the filled players'), files them with the match's results, and shows
 * everyone the counters of the skins each player has on (the roster's `skinKills`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { DEFAULT_LOADOUT, FREE_CHARACTERS, TICK_MS } from '@blatkom/shared';
import type { MatchConfig, RosterEntry, ServerMessage } from '@blatkom/shared';
import { RoomManager } from './RoomManager.js';
import { equippedSkinKills } from './MatchRoom.js';
import type { MatchRoom } from './MatchRoom.js';
import { memoryServices } from '../services/memory.js';
import { silentLogger } from '../logging/logger.js';
import type { AuthedUser, PlayerGear } from '../services/contracts.js';

const FAST: Partial<MatchConfig> = { readyMs: 100, countdownMs: 300, finishedMs: 60_000, respawnDelayMs: 400, reconnectGraceMs: 3_000, emptyRoomTtlMs: 400, durationMs: 40_000 };

class FakeSocket {
  readyState = 1;
  bufferedAmount = 0;
  readonly msgs: ServerMessage[] = [];
  send(data: unknown) {
    if (typeof data === 'string') this.msgs.push(JSON.parse(data) as ServerMessage);
  }
  close() {
    this.readyState = 3;
  }
  lastRoster(): RosterEntry[] {
    const r = this.msgs.filter((m): m is Extract<ServerMessage, { type: 'roster' }> => m.type === 'roster').at(-1);
    return r?.players ?? [];
  }
}

let n = 0;
const person = (name: string): AuthedUser => ({ userId: `sk${++n}`, sessionId: `s${n}`, displayName: name, level: 7, platform: null });

function clock(room: MatchRoom) {
  let now = Date.now();
  return (ms: number, until?: () => boolean) => {
    const end = now + ms;
    while (now < end) {
      now += TICK_MS;
      room.tick(now);
      if (until?.()) return true;
    }
    return false;
  };
}

test('equippedSkinKills: the counters of the skins a player has on, by weapon', () => {
  const gear: PlayerGear = { loadout: { ...DEFAULT_LOADOUT, primary: 'avtomat', skins: { avtomat: 'almaz', pistol: 'zoloto' } }, characters: new Set(FREE_CHARACTERS), skinKills: { 'avtomat.almaz': 41, 'avtomat.zoloto': 9, 'pistol.zoloto': 0 } };
  assert.deepEqual(equippedSkinKills(gear), { avtomat: 41 });
  assert.deepEqual(equippedSkinKills({ ...gear, skinKills: undefined }), {});
});

test('a room counts a person’s eliminations with a skinned weapon, files them once, and the next roster shows the new count', async () => {
  const services = memoryServices();
  const rooms = new RoomManager(services, silentLogger, { maxRooms: 20, config: FAST, fillBots: true });
  const a = person('Legend');
  const room = rooms.quickMatch(a.userId, 'factory', 'ffa');
  const A = new FakeSocket();
  const gear: PlayerGear = { loadout: { ...DEFAULT_LOADOUT, primary: 'avtomat', skins: { avtomat: 'almaz' } }, characters: new Set(FREE_CHARACTERS), skinKills: { 'avtomat.almaz': 41 } };
  assert.equal(room.join(a, A as unknown as WebSocket, 'petya', false, gear), 'ok');
  const run = clock(room);
  assert.ok(run(15_000, () => room.phase === 'active'), 'the match starts with the filled players');
  // everyone sees the counter of the skin on the person's weapon
  const mine = A.lastRoster().find((r) => r.id === a.userId)!;
  assert.deepEqual(mine.skinKills, { avtomat: 41 });
  const filled = A.lastRoster().filter((r) => r.id !== a.userId);
  for (const f of filled) for (const w of Object.keys(f.skinKills ?? {})) assert.ok(f.skins?.[w as keyof typeof f.skins], 'a filled player has counters only for the skins it wears');

  const me = room.world.players.get(a.userId)!;
  const others = [...room.world.players.values()].filter((p) => p.id !== a.userId);
  assert.ok(others.length >= 2, 'opponents to take down');
  // spawn protection off: the test takes players down at once
  const down = (victim: (typeof others)[number], by: typeof me, weapon: 'avtomat' | 'pistol') => {
    victim.invulnUntil = 0;
    room.world.applyDamage(victim, by, 999, weapon);
    assert.equal(victim.alive, false);
    run(TICK_MS * 2);
  };
  // one with the skinned automatic, one with the plain pistol; one by a filled player (not counted)
  down(others[0]!, me, 'avtomat');
  down(others[1]!, me, 'pistol');
  if (others.length >= 4) down(others[3]!, others[2]!, 'avtomat');
  // the deciding kill counts too (the world is already «finished» when its events are read)
  assert.ok(run(3_000, () => others[0]!.alive), 'back after the respawn delay');
  others[0]!.invulnUntil = 0;
  room.world.applyDamage(others[0]!, me, 999, 'avtomat');
  room.world.finish('score');
  assert.ok(run(2_000, () => room.phase === 'finished'));
  await new Promise((r) => setTimeout(r, 20));
  const done = [...services.recorder.completed.values()].at(-1)!;
  const pa = done.participants.find((p) => p.userId === a.userId)!;
  assert.deepEqual(pa.skinKills, { 'avtomat.almaz': 2 });
  assert.equal(done.participants.length, 1, 'filled players are not filed');
  // the next match's roster starts from the new count
  A.msgs.length = 0;
  (room as unknown as { broadcastRoster(): void }).broadcastRoster();
  assert.deepEqual(A.lastRoster().find((r) => r.id === a.userId)!.skinKills, { avtomat: 43 });
});
