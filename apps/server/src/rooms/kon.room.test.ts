/**
 * «Блатной кон» rooms (V2.0 part D), tick by tick with a simulated clock and recording sockets: fixed
 * sides of the format, people only (never filled, even with the fill switched on), the mode can't
 * change, sides capped, the host starts only when both sides are full, nobody joins a match that is on,
 * the search groups people by format and deals the sides by Kon rating, a side that leaves loses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { TICK_MS } from '@blatkom/shared';
import type { KonFormat, MatchConfig, ServerMessage } from '@blatkom/shared';
import { MatchRoom } from './MatchRoom.js';
import { RoomManager } from './RoomManager.js';
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
  results() {
    return this.msgs.find((m): m is Extract<ServerMessage, { type: 'results' }> => m.type === 'results');
  }
}

let n = 0;
const person = (name: string, konRating = 1000): AuthedUser => ({ userId: `k${++n}`, sessionId: `s${n}`, displayName: name, level: 5, platform: null, konRating });

function setup(kon: KonFormat, isPrivate = true) {
  const services = memoryServices();
  const room = new MatchRoom({ id: `kon${++n}`, mapId: 'factory', isPrivate, hostUserId: null, fillBots: true, config: FAST, kon }, services, silentLogger);
  let now = Date.now();
  const sockets = new Map<string, FakeSocket>();
  return {
    room,
    services,
    join(u: AuthedUser) {
      const ws = new FakeSocket();
      sockets.set(u.userId, ws);
      return { ws, res: room.join(u, ws as unknown as WebSocket, 'petya', false) };
    },
    send(u: AuthedUser, m: Record<string, unknown>) {
      room.onMessage(sockets.get(u.userId) as unknown as WebSocket, Buffer.from(JSON.stringify(m)), false);
    },
    drop(u: AuthedUser) {
      const ws = sockets.get(u.userId)!;
      ws.close();
      room.onSocketClose(ws as unknown as WebSocket);
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

test('Kon room 2×2: people only, the mode fixed, sides capped, the host starts only when both sides are full', () => {
  const t = setup('2x2');
  const [a, b, c, d, e] = ['Ataman', 'Bratok', 'Cyrus', 'Dimon', 'Extra'].map((x, i) => person(x, 1000 + i * 10));
  const A = t.join(a!).ws;
  assert.equal(t.room.config.mode, 'teams');
  assert.equal(t.room.config.maxPlayers, 4);
  assert.equal(A.roster().kon, '2x2');
  assert.equal(A.roster().minToStart, 4, 'no filling up: four people needed');
  assert.equal(A.roster().players[0]!.konRating, 1000, 'Kon ratings in the room');
  t.send(a!, { type: 'mode', mode: 'ffa' });
  assert.deepEqual(A.errors(), ['kon_fixed']);
  t.join(b!);
  t.join(c!);
  // a side holds two: the third one on red is refused
  const red = () => [...t.room.world.players.values()].filter((p) => p.team === 0).map((p) => p.id);
  for (const u of [a!, b!, c!]) if (!red().includes(u.userId)) t.send(u, { type: 'team', team: 0 });
  assert.equal(red().length, 2, 'a side never holds more than the format');
  t.send(a!, { type: 'start' });
  assert.ok(A.errors().includes('not_enough_players'), 'three people can’t start a 2×2');
  t.run(6000);
  assert.equal(t.room.phase, 'waiting', 'nobody is filled in, however long they wait');
  assert.equal(t.room.world.players.size, 3);
  t.join(d!);
  assert.equal(t.join(e!).res, 'room_full', 'full at four');
  t.send(a!, { type: 'start' });
  assert.ok(t.run(2000, () => t.room.phase === 'active'));
  const sides = [0, 1].map((team) => [...t.room.world.players.values()].filter((p) => p.team === team).length);
  assert.deepEqual(sides, [2, 2]);
  assert.equal(t.room.isJoinable(), false, 'nobody joins a match that is on');
  // the match ends: the recorder gets the format
  t.room.world.finish('time');
  t.run(100);
  const done = [...t.services.recorder.completed.values()].at(-1)!;
  assert.equal(done.kon, '2x2');
  assert.equal(done.mode, 'teams');
  assert.equal(done.participants.length, 4);
});

test('Kon: a side with nobody left loses to the side that stayed, whatever the score', () => {
  const t = setup('1x1');
  const a = person('Stayer');
  const b = person('Quitter');
  const A = t.join(a).ws;
  t.join(b);
  t.send(a, { type: 'start' });
  assert.ok(t.run(2000, () => t.room.phase === 'active'));
  // the one who leaves had the lead
  const pb = t.room.world.players.get(b.userId)!;
  t.room.world.teamScore[pb.team!] = 5;
  t.drop(b);
  assert.ok(t.run(25_000, () => !!A.results()), 'the match ends by itself');
  const res = A.results()!;
  const pa = t.room.world.players.get(a.userId)!;
  assert.equal(res.teams!.winner, pa.team, 'the side that stayed wins');
  const done = [...t.services.recorder.completed.values()].at(-1)!;
  assert.equal(done.winnerTeam, pa.team);
  const quitter = done.participants.find((p) => p.userId === b.userId)!;
  assert.deepEqual([quitter.completed, quitter.teamOutcome], [false, 'loss']);
  assert.equal(done.participants.find((p) => p.userId === a.userId)!.teamOutcome, 'win');
});

test('Kon search: people grouped by format, other rooms never mixed in; a full room starts by itself with sides dealt by Kon rating', () => {
  const services = memoryServices();
  const rooms = new RoomManager(services, silentLogger, { maxRooms: 20, config: FAST, fillBots: true });
  const ord = rooms.quickMatch('x0', 'factory', 'teams');
  const r2 = rooms.konQuick('x1', '2x2', 'factory');
  assert.notEqual(r2.id, ord.id, 'an ordinary team room is not a Kon room');
  assert.equal(rooms.quickMatch('x9', 'factory', 'teams').id, ord.id, 'and the other way round');
  const r1 = rooms.konQuick('x2', '1x1');
  assert.notEqual(r1.id, r2.id);
  assert.equal(rooms.konQuick('x3', '2x2', 'factory').id, r2.id, 'the same format joins the same room');
  // four people in the 2×2 room: it starts by itself; the two strongest end up on different sides
  const people = [person('Top', 1600), person('Second', 1500), person('Third', 1100), person('Fourth', 1000)];
  const sockets = people.map((u) => {
    const ws = new FakeSocket();
    assert.equal(r2.join(u, ws as unknown as WebSocket, 'petya', false), 'ok');
    return ws;
  });
  assert.deepEqual(rooms.konWaiting(), { '1x1': 0, '2x2': 4, '3x3': 0, '5x5': 0 });
  let now = Date.now();
  for (let i = 0; i < 600 && r2.phase !== 'active'; i++) {
    now += TICK_MS;
    r2.tick(now);
  }
  assert.equal(r2.phase, 'active', 'a full public Kon room starts by itself');
  const team = (u: AuthedUser) => r2.world.players.get(u.userId)!.team;
  assert.notEqual(team(people[0]!), team(people[1]!), 'the two strongest play against each other');
  assert.equal(team(people[0]!), team(people[3]!), 'red: the strongest and the weakest');
  assert.equal(sockets[0]!.roster().kon, '2x2');
  rooms.stop();
});
