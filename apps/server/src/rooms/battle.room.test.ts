/**
 * v0.2.17, gang battles (game-rules/gangBattle.ts), tick by tick with a simulated clock and recording sockets:
 * the room takes only the two gangs' people, each on their gang's side (red: the challenger), nobody changes
 * sides, a full side takes nobody else, the roster carries the two gangs, and a 2×2 between two gangs starts
 * once both sides are full and is recorded as a tournament match of that format.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { TICK_MS, gangBattleRefusal } from '@blatkom/shared';
import type { GangBattle, MatchConfig, ServerMessage } from '@blatkom/shared';
import { MatchRoom } from './MatchRoom.js';
import { memoryServices } from '../services/memory.js';
import { silentLogger } from '../logging/logger.js';
import type { AuthedUser } from '../services/contracts.js';

const FAST: Partial<MatchConfig> = { readyMs: 100, countdownMs: 300, finishedMs: 60_000, respawnDelayMs: 400, reconnectGraceMs: 3_000, emptyRoomTtlMs: 400 };

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
  roster() {
    return this.msgs.filter((m): m is Extract<ServerMessage, { type: 'roster' }> => m.type === 'roster').at(-1)!;
  }
  errors() {
    return this.msgs.filter((m): m is Extract<ServerMessage, { type: 'error' }> => m.type === 'error').map((m) => m.code);
  }
}

const flag = { pattern: 'plain', colors: [0, 1, 2] } as unknown as GangBattle['red']['flag'];
const emblem = { icon: 'star', color: 3 } as unknown as GangBattle['red']['emblem'];
const BATTLE: GangBattle = {
  red: { id: '00000000-0000-4000-8000-0000000000a1', name: 'Garage Kings', tag: 'GK', flag, emblem },
  blue: { id: '00000000-0000-4000-8000-0000000000b2', name: 'Courtyard Bosses', tag: 'CB', flag, emblem },
};

let n = 0;
const person = (name: string): AuthedUser => ({ userId: `g${++n}`, sessionId: `s${n}`, displayName: name, level: 5, platform: null, konRating: 1000 });

function setup() {
  const services = memoryServices();
  const room = new MatchRoom({ id: `battle${++n}`, mapId: 'factory', isPrivate: true, hostUserId: null, fillBots: true, config: FAST, kon: '2x2', battle: BATTLE }, services, silentLogger);
  let now = Date.now();
  const sockets = new Map<string, FakeSocket>();
  return {
    room,
    services,
    join(u: AuthedUser, gang: string | null) {
      const ws = new FakeSocket();
      sockets.set(u.userId, ws);
      return { ws, res: room.join(u, ws as unknown as WebSocket, 'petya', true, undefined, gang) };
    },
    send(u: AuthedUser, m: Record<string, unknown>) {
      room.onMessage(sockets.get(u.userId) as unknown as WebSocket, Buffer.from(JSON.stringify(m)), false);
    },
    run(ms: number, until?: () => boolean) {
      const end = now + ms;
      while (now < end) {
        now += TICK_MS;
        room.tick(now);
        if (until?.()) return true;
      }
      return false;
    },
  };
}

test('gang battle: only the two gangs come in, each on its side; nobody changes sides; a full side takes nobody', () => {
  const t = setup();
  const [a, b, c, e, f] = ['Ataman', 'Bratok', 'Cyrus', 'Stranger', 'Third'].map((x) => person(x));
  assert.equal(t.join(e!, null).res, 'battle_gang', 'a player without a gang');
  assert.equal(t.join(e!, '00000000-0000-4000-8000-0000000000c3').res, 'battle_gang', 'a player of a third gang');
  const A = t.join(a!, BATTLE.red.id).ws;
  assert.equal(t.join(c!, BATTLE.blue.id).res, 'ok');
  t.join(b!, BATTLE.red.id);
  const roster = A.roster();
  const side = (id: string) => roster.players.find((p) => p.id === id)?.team;
  assert.deepEqual([side(a!.userId), side(b!.userId), side(c!.userId)], [0, 0, 1], 'red: the challenger’s gang, blue: the other');
  assert.deepEqual(roster.battle, BATTLE, 'the roster carries the two gangs');
  assert.equal(roster.kon, '2x2');
  // red is full: a third red is refused; nobody switches sides
  assert.equal(t.join(f!, BATTLE.red.id).res, 'side_full');
  t.send(a!, { type: 'team', team: 1 });
  assert.ok(A.errors().includes('kon_fixed'), 'the sides are the gangs');
  assert.equal(A.roster().players.find((p) => p.id === a!.userId)?.team, 0);
  // the room's facts for the API carry the battle too
  assert.deepEqual(t.room.publicInfo().battle, BATTLE);
  assert.equal(t.room.battleSide(BATTLE.blue.id), 1);
  assert.equal(t.room.battleSide(null), null);
});

test('gang battle 2×2: starts when both sides are full and is recorded as a tournament match', async () => {
  const t = setup();
  const [a, b, c, d] = ['Ataman', 'Bratok', 'Cyrus', 'Dimon'].map((x) => person(x));
  t.join(a!, BATTLE.red.id);
  t.join(c!, BATTLE.blue.id);
  t.join(b!, BATTLE.red.id);
  // three people: the host can't start, nobody is filled in however long they wait
  t.send(a!, { type: 'start' });
  t.run(3_000);
  assert.equal(t.room.phase, 'waiting');
  assert.equal(t.room.publicInfo().players, 3, 'nobody filled in');
  t.join(d!, BATTLE.blue.id);
  t.send(a!, { type: 'start' });
  assert.ok(t.run(5_000, () => t.room.phase === 'active'), 'the battle starts');
  await new Promise((r) => setTimeout(r, 10));
  const started = (t.services.recorder as unknown as { started: Array<{ players: Array<{ userId: string; team: number | null }> }> }).started;
  assert.deepEqual(started.at(-1)?.players.map((p) => p.team).sort(), [0, 0, 1, 1], 'two a side, recorded as the sides');
});

test('who may call a gang out', () => {
  const ok = { mine: 'a', target: 'b', targetExists: true, mineMembers: 3, targetMembers: 2, format: '2x2' as const };
  assert.equal(gangBattleRefusal(ok), null);
  assert.equal(gangBattleRefusal({ ...ok, mine: null }), 'no_gang');
  assert.equal(gangBattleRefusal({ ...ok, target: 'a' }), 'own_gang');
  assert.equal(gangBattleRefusal({ ...ok, targetExists: false, target: null }), 'not_found');
  assert.equal(gangBattleRefusal({ ...ok, format: '3x3' }), 'too_few', 'the other gang has two people: no 3×3');
  assert.equal(gangBattleRefusal({ ...ok, mineMembers: 1 }), 'too_few');
});
