/**
 * v0.2.21 (the usability audit: a quick match put a newcomer into a match 1:24 before its end and the rating
 * took up to 16 off him): a quick match never seats a player in a match about to end, and whoever comes in after
 * the first quarter of a match keeps the rating they had (experience and talons as usual).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { LATE_JOIN, TICK_MS, joinedLate, ratingDelta } from '@blatkom/shared';
import type { MatchConfig, ServerMessage } from '@blatkom/shared';
import { RoomManager } from './RoomManager.js';
import type { MatchRoom } from './MatchRoom.js';
import { memoryServices } from '../services/memory.js';
import { silentLogger } from '../logging/logger.js';
import type { AuthedUser } from '../services/contracts.js';

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
  progress() {
    return this.msgs.find((m): m is Extract<ServerMessage, { type: 'progress' }> => m.type === 'progress');
  }
}

let n = 0;
const person = (name: string): AuthedUser => ({ userId: `lj${++n}`, sessionId: `s${n}`, displayName: name, level: 3, platform: null });

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

test('LATE_JOIN rules: a quarter of the match decides; a late joiner who stays keeps the rating, one who leaves still loses it', () => {
  assert.equal(joinedLate(0, 240_000), false);
  assert.equal(joinedLate(60_000, 240_000), false, 'exactly the first quarter is still on time');
  assert.equal(joinedLate(60_001, 240_000), true);
  assert.equal(ratingDelta({ place: 6, playersAtEnd: 6, completed: true, lateJoin: true }), 0);
  assert.equal(ratingDelta({ place: 1, playersAtEnd: 6, completed: true, lateJoin: true }), 0);
  assert.equal(ratingDelta({ place: 1, playersAtEnd: 2, completed: true, teamOutcome: 'loss', lateJoin: true }), 0);
  assert.ok(ratingDelta({ place: 3, playersAtEnd: 6, completed: false, lateJoin: true }) < 0, 'leaving is leaving');
  assert.ok(LATE_JOIN.quickMinLeftMs >= 60_000);
});

test('quick match: a match with less than LATE_JOIN.quickMinLeftMs to go is passed over (a new room instead); its own player still finds it', () => {
  const services = memoryServices();
  const rooms = new RoomManager(services, silentLogger, { maxRooms: 20, config: { ...FAST, durationMs: 240_000 }, fillBots: true });
  const a = person('Early');
  const room = rooms.quickMatch(a.userId, 'factory', 'ffa');
  room.join(a, new FakeSocket() as unknown as WebSocket, 'petya', false);
  const run = clock(room);
  assert.ok(run(15_000, () => room.phase === 'active'), 'the public room starts by itself');
  assert.equal(rooms.quickMatch('fresh1', 'factory', 'ffa').id, room.id, 'plenty of time left: the running match takes newcomers');
  // the match is near its end
  room.world.matchEndsAt = room.world.time + LATE_JOIN.quickMinLeftMs - 5_000;
  assert.ok(room.matchTimeLeftMs < LATE_JOIN.quickMinLeftMs);
  const other = rooms.quickMatch('fresh2', 'factory', 'ffa');
  assert.notEqual(other.id, room.id, 'a match about to end is passed over');
  assert.equal(rooms.quickMatch(a.userId, 'factory', 'ffa').id, room.id, 'the player already in it is not sent elsewhere');
});

test('a player who comes in after the first quarter of the match: no rating change (lateJoin), the one who was there from the start is rated', async () => {
  const services = memoryServices();
  const rooms = new RoomManager(services, silentLogger, { maxRooms: 20, config: FAST, fillBots: true });
  const a = person('Starter');
  const b = person('Latecomer');
  const room = rooms.quickMatch(a.userId, 'factory', 'ffa');
  const A = new FakeSocket();
  room.join(a, A as unknown as WebSocket, 'petya', false);
  const run = clock(room);
  assert.ok(run(15_000, () => room.phase === 'active'));
  // a third of the match later (40 s × ⅓ > the first quarter)
  run(14_000);
  const B = new FakeSocket();
  assert.equal(room.join(b, B as unknown as WebSocket, 'petya', false), 'ok', 'joins the match in progress');
  assert.ok(run(60_000, () => room.phase === 'finished'), 'the match runs to its end');
  await new Promise((r) => setTimeout(r, 20));
  const done = [...services.recorder.completed.values()].at(-1)!;
  const pa = done.participants.find((p) => p.userId === a.userId)!;
  const pb = done.participants.find((p) => p.userId === b.userId)!;
  assert.equal(pa.lateJoin, undefined, 'there from the start');
  assert.equal(pb.lateJoin, true, 'came in late');
  const res = B.progress()?.result;
  assert.ok(res, 'the latecomer gets their match result');
  assert.equal(res!.ratingDelta, 0, 'the rating did not move');
  assert.equal(res!.lateJoin, true, 'and the result says why');
  assert.ok((res!.xpGained ?? 0) > 0, 'experience is earned as usual');
});
