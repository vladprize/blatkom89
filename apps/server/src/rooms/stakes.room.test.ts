/**
 * $BLAT Tournament stakes in a room (v0.2.17), tick by tick with a simulated clock and a stand-in for
 * the stakes service: the match starts only after every stake is reserved; a player who can't stake
 * leaves the room with the reason; a lineup that changed while the stakes were being reserved gets them
 * back; the results carry the stake to the recorder (which settles it — blat/stakes.test.ts); the search
 * never mixes stakes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { TICK_MS } from '@blatkom/shared';
import type { MatchConfig, ServerMessage, StakeRefusal } from '@blatkom/shared';
import { MatchRoom } from './MatchRoom.js';
import { RoomManager } from './RoomManager.js';
import { memoryServices } from '../services/memory.js';
import { silentLogger } from '../logging/logger.js';
import type { AuthedUser, Stakes } from '../services/contracts.js';

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

/** The stakes service as the rooms see it: balances in memory; `gate` holds a reservation until opened. */
class FakeStakes implements Stakes {
  readonly balance = new Map<string, number>();
  readonly reserved = new Map<string, Map<string, number>>();
  readonly refunded: string[] = [];
  gate: Promise<void> | null = null;
  async check(userId: string, stake: number): Promise<StakeRefusal | null> {
    return (this.balance.get(userId) ?? 0) >= stake ? null : 'blat_low';
  }
  async reserve(r: { matchId: string; stake: number; userIds: string[] }) {
    if (this.gate) await this.gate;
    for (const u of r.userIds) if ((this.balance.get(u) ?? 0) < r.stake) return { ok: false as const, userId: u, reason: 'blat_low' as const };
    const m = new Map<string, number>();
    for (const u of r.userIds) {
      this.balance.set(u, this.balance.get(u)! - r.stake);
      m.set(u, r.stake);
    }
    this.reserved.set(r.matchId, m);
    return { ok: true as const };
  }
  async refund(matchId: string) {
    const m = this.reserved.get(matchId);
    if (!m) return 0;
    for (const [u, a] of m) this.balance.set(u, (this.balance.get(u) ?? 0) + a);
    this.reserved.delete(matchId);
    this.refunded.push(matchId);
    return m.size;
  }
}

let n = 0;
const person = (name: string): AuthedUser => ({ userId: `s${++n}`, sessionId: `ss${n}`, displayName: name, level: 5, platform: null, konRating: 1000 });
const flush = () => new Promise<void>((r) => setImmediate(r));

function setup(stake: number) {
  const services = memoryServices();
  const stakes = new FakeStakes();
  const all = { ...services, stakes };
  const room = new MatchRoom({ id: `st${++n}`, mapId: 'factory', isPrivate: true, hostUserId: null, config: FAST, kon: '1x1', stake }, all, silentLogger);
  let now = Date.now();
  const sockets = new Map<string, FakeSocket>();
  return {
    room,
    services,
    stakes,
    join(u: AuthedUser) {
      const ws = new FakeSocket();
      sockets.set(u.userId, ws);
      room.join(u, ws as unknown as WebSocket, 'petya', true);
      return ws;
    },
    send(u: AuthedUser, m: Record<string, unknown>) {
      room.onMessage(sockets.get(u.userId) as unknown as WebSocket, Buffer.from(JSON.stringify(m)), false);
    },
    drop(u: AuthedUser) {
      const ws = sockets.get(u.userId)!;
      ws.close();
      room.onSocketClose(ws as unknown as WebSocket);
    },
    run(ms: number) {
      const end = now + ms;
      while (now < end) {
        now += TICK_MS;
        room.tick(now);
      }
    },
  };
}

test('stakes: the match starts only once every stake is reserved, and the results carry the stake', async () => {
  const t = setup(500);
  const [a, b] = [person('Ataman'), person('Bratok')];
  t.stakes.balance.set(a.userId, 800);
  t.stakes.balance.set(b.userId, 500);
  const A = t.join(a);
  t.join(b);
  assert.equal(A.roster().stake, 500);
  t.send(a, { type: 'team', team: 0 });
  t.send(b, { type: 'team', team: 1 });
  t.send(a, { type: 'start' });
  // the reservation is on its way: the room still waits and says so
  assert.equal(t.room.phase, 'waiting');
  assert.equal(A.roster().staking, true);
  await flush();
  assert.notEqual(t.room.phase, 'waiting');
  assert.ok(t.room.matchId);
  assert.deepEqual([t.stakes.balance.get(a.userId), t.stakes.balance.get(b.userId)], [300, 0]);
  assert.ok(t.stakes.reserved.has(t.room.matchId!), 'the match runs under the id the stakes were reserved for');
  assert.equal(t.services.recorder.started.at(-1)?.matchId, t.room.matchId);
  // B leaves the match: after the grace the side that stayed wins; the stake goes to the recorder
  const matchId = t.room.matchId!;
  t.run(600);
  t.drop(b);
  t.run(30_000);
  const done = t.services.recorder.completed.get(matchId);
  assert.ok(done, 'the match ended');
  assert.equal(done!.stake, 500);
  assert.equal(done!.winnerTeam, 0);
  assert.deepEqual(t.stakes.refunded, []);
});

test('stakes: a player who can’t stake leaves the room with the reason; the others wait', async () => {
  const t = setup(1000);
  const [a, b] = [person('Ataman'), person('Bratok')];
  t.stakes.balance.set(a.userId, 1000);
  t.stakes.balance.set(b.userId, 999);
  const A = t.join(a);
  const B = t.join(b);
  t.send(a, { type: 'team', team: 0 });
  t.send(b, { type: 'team', team: 1 });
  t.send(a, { type: 'start' });
  await flush();
  assert.equal(t.room.phase, 'waiting');
  assert.ok(B.errors().includes('blat_low'));
  assert.equal(B.readyState, 3, 'their connection is closed');
  assert.equal(t.room.hasMember(b.userId), false);
  assert.equal(t.room.hasMember(a.userId), true);
  assert.equal(A.roster().staking, false);
  assert.equal(t.stakes.balance.get(a.userId), 1000, 'nothing was taken from anyone');
});

test('stakes: a lineup that changed while the stakes were reserved gets them back; nothing starts', async () => {
  const t = setup(100);
  const [a, b] = [person('Ataman'), person('Bratok')];
  t.stakes.balance.set(a.userId, 100);
  t.stakes.balance.set(b.userId, 100);
  t.join(a);
  t.join(b);
  t.send(a, { type: 'team', team: 0 });
  t.send(b, { type: 'team', team: 1 });
  let open!: () => void;
  t.stakes.gate = new Promise<void>((r) => (open = r));
  t.send(a, { type: 'start' });
  // a second «start» while reserving changes nothing
  t.send(a, { type: 'start' });
  t.send(b, { type: 'leave' });
  open();
  await flush();
  await flush();
  assert.equal(t.room.phase, 'waiting');
  assert.equal(t.stakes.refunded.length, 1);
  assert.deepEqual([t.stakes.balance.get(a.userId), t.stakes.balance.get(b.userId)], [100, 100]);
  assert.equal(t.services.recorder.started.length, 0);
});

test('stakes: the search never puts different stakes in one room', () => {
  const services = memoryServices();
  const rooms = new RoomManager(services, silentLogger, { maxRooms: 10, config: FAST });
  const r0 = rooms.konQuick('u1', '2x2', undefined, 0);
  const r500 = rooms.konQuick('u2', '2x2', undefined, 500);
  assert.notEqual(r0.id, r500.id);
  assert.equal(r500.stake, 500);
  assert.equal(rooms.konQuick('u3', '2x2', undefined, 500).id, r500.id);
  // a stake belongs to tournament rooms only
  assert.equal(rooms.create('factory', true, 'u4', null, 'teams', null, 500).stake, 0);
  rooms.stop();
});
