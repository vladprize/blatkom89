/**
 * Filling the lineup (MatchRoom + sim/fill.ts), driven tick by tick with a simulated clock and fake
 * sockets that record what each person's client receives: friends' rooms start with one person and
 * fill up at kick-off, Quick Match fills up after a head start, people take filled places and get
 * theirs back, and nothing a client receives tells the filled players apart from people.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { FILL_RULES, TICK_MS, displayNameSchema } from '@blatkom/shared';
import type { GameMode, MatchConfig, RosterEntry, ServerMessage } from '@blatkom/shared';
import { MatchRoom } from './MatchRoom.js';
import type { RoomOptions } from './MatchRoom.js';
import { memoryServices } from '../services/memory.js';
import { silentLogger } from '../logging/logger.js';
import type { AuthedUser } from '../services/contracts.js';

const FAST: Partial<MatchConfig> = {
  readyMs: 100,
  countdownMs: 300,
  finishedMs: 60_000,
  respawnDelayMs: 400,
  reconnectGraceMs: 3_000,
  emptyRoomTtlMs: 400,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A socket that keeps what the room sends (JSON messages; snapshots are counted, not decoded). */
class FakeSocket {
  readyState = 1;
  bufferedAmount = 0;
  readonly msgs: ServerMessage[] = [];
  snapshots = 0;
  send(data: unknown) {
    if (typeof data === 'string') this.msgs.push(JSON.parse(data) as ServerMessage);
    else this.snapshots++;
  }
  close() {
    this.readyState = 3;
  }
  rosters() {
    return this.msgs.filter((m): m is Extract<ServerMessage, { type: 'roster' }> => m.type === 'roster');
  }
  roster() {
    const r = this.rosters();
    return r[r.length - 1]!;
  }
  results() {
    return this.msgs.find((m): m is Extract<ServerMessage, { type: 'results' }> => m.type === 'results');
  }
}

let userNo = 0;
function person(name: string, level = 5): AuthedUser {
  return { userId: `u${++userNo}`, sessionId: `s${userNo}`, displayName: name, level, platform: null };
}

function setup(o: Partial<RoomOptions> & { mode?: GameMode } = {}) {
  const services = memoryServices();
  const room = new MatchRoom({ id: `room${++userNo}`, mapId: 'factory', isPrivate: true, hostUserId: null, fillBots: true, config: FAST, ...o, ...(o.config ? { config: { ...FAST, ...o.config } } : {}) }, services, silentLogger);
  let now = Date.now();
  const sockets = new Map<string, FakeSocket>();
  return {
    room,
    services,
    sockets,
    get now() {
      return now;
    },
    join(u: AuthedUser) {
      const ws = new FakeSocket();
      sockets.set(u.userId, ws);
      const res = room.join(u, ws as unknown as WebSocket, 'petya', false);
      return { ws, res };
    },
    send(u: AuthedUser, m: Record<string, unknown>) {
      room.onMessage(sockets.get(u.userId) as unknown as WebSocket, Buffer.from(JSON.stringify(m)), false);
    },
    drop(u: AuthedUser) {
      const ws = sockets.get(u.userId)!;
      ws.close();
      room.onSocketClose(ws as unknown as WebSocket);
    },
    /** Runs the room for `ms` of simulated time (one world tick per step). */
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

function assertLooksLikePeople(players: RosterEntry[]) {
  for (const p of players) {
    assert.equal(p.isBot, false, `${p.name} is not marked`);
    assert.ok(displayNameSchema.safeParse(p.name).success, `valid alias ${p.name}`);
    assert.ok(!/bot|бот/i.test(p.name), p.name);
    assert.equal(p.connected, true);
    assert.ok(p.level >= 1);
  }
  assert.equal(new Set(players.map((p) => p.id)).size, players.length);
  assert.equal(new Set(players.map((p) => p.slot)).size, players.length);
}

test('fill: in a room with friends the host starts alone; the lineup fills up to 4 at kick-off and nobody is marked', () => {
  const t = setup();
  const a = person('Khozyain', 7);
  const { ws } = t.join(a);
  assert.equal(ws.roster().minToStart, 1, 'the host may start alone');
  // a room with friends doesn't fill up while people gather
  t.run(FILL_RULES.waitMs + 4000);
  assert.equal(ws.roster().players.length, 1);
  assert.equal(t.room.phase, 'waiting', 'one ready person does not start the match by themselves');
  t.send(a, { type: 'start' });
  const roster = ws.roster();
  assert.equal(roster.players.length, FILL_RULES.ffaPlayers);
  assertLooksLikePeople(roster.players);
  assert.deepEqual(roster.players.filter((p) => p.isHost).map((p) => p.id), [a.userId]);
  for (const p of roster.players) if (p.id !== a.userId) assert.match(p.id, UUID);
  assert.ok(t.run(2000, () => t.room.phase === 'active'));
  // the filled players play: they leave their spawn points
  const spawned = new Map([...t.room.world.players.values()].map((p) => [p.id, { x: p.x, y: p.y }]));
  t.run(2500);
  const moved = [...t.room.world.players.values()].filter((p) => p.id !== a.userId && Math.hypot(p.x - spawned.get(p.id)!.x, p.y - spawned.get(p.id)!.y) > 40);
  assert.ok(moved.length >= 2, `filled players move (${moved.length})`);
  // players see the whole lineup; the dashboard counts people and filled players apart
  assert.deepEqual(t.room.publicInfo().players, 4);
  assert.ok(!('fill' in t.room.publicInfo()));
  assert.equal(t.room.info().players, 1);
  assert.equal(t.room.info().fill, 3);
  t.room.world.finish('time');
  t.run(100);
  const res = ws.results()!;
  assert.equal(res.standings.length, 4);
  assert.ok(res.standings.every((s) => s.isBot === false), 'results never mark anyone');
  const started = t.services.recorder.started.at(-1)!;
  assert.deepEqual(started.players.map((p) => p.userId), [a.userId], 'only people are recorded');
  assert.equal(started.fill, 3);
  const done = t.services.recorder.completed.get(res.matchId)!;
  assert.deepEqual(done.participants.map((p) => p.userId), [a.userId]);
  assert.equal(done.playersAtEnd, 4, 'places count the filled players as opponents');
  assert.equal(done.peopleAtEnd, 1);
  assert.equal(done.fillAtEnd, 3);
  const mine = res.standings.find((s) => s.id === a.userId)!;
  assert.equal(done.participants[0]!.place, mine.place);
  const ev = t.services.analytics.events.find((e) => e.name === 'match_started')!;
  assert.equal(ev.props.players, 1);
  assert.equal(ev.props.fill, 3);
});

test('fill: team modes get 3 a side; friends may share a side and the room evens it out', () => {
  for (const mode of ['teams', 'ctf', 'bases'] as const) {
    const t = setup({ mode });
    const a = person('Petya');
    const b = person('Valyuta');
    t.join(a);
    const { ws } = t.join(b);
    const teamA = ws.roster().players.find((p) => p.id === a.userId)!.team;
    assert.notEqual(ws.roster().players.find((p) => p.id === b.userId)!.team, teamA, 'people alternate sides on joining');
    t.send(b, { type: 'team', team: teamA });
    assert.equal(ws.roster().players.find((p) => p.id === b.userId)!.team, teamA, 'friends may play on one side');
    t.send(a, { type: 'start' });
    const players = ws.roster().players;
    assertLooksLikePeople(players);
    assert.equal(players.filter((p) => p.team === 0).length, 3, mode);
    assert.equal(players.filter((p) => p.team === 1).length, 3, mode);
    assert.ok(t.run(2000, () => t.room.phase === 'active'));
    assert.equal(t.room.world.teamSize(0), 3);
    assert.equal(t.room.world.teamSize(1), 3);
  }
});

test('fill: Quick Match gives people a head start, then players arrive one by one and the match starts by itself', () => {
  const t = setup({ isPrivate: false, config: { reconnectGraceMs: 10_000 } });
  const a = person('Shurik');
  const t0 = t.now;
  const { ws } = t.join(a);
  t.run(FILL_RULES.waitMs - 200);
  assert.equal(ws.roster().players.length, 1, 'nobody is added while people may still come');
  const arrivals: number[] = [];
  let size = 1;
  t.run(15_000, () => {
    const n = ws.roster().players.length;
    if (n > size) {
      arrivals.push(t.now);
      size = n;
    }
    return t.room.phase !== 'waiting';
  });
  assert.notEqual(t.room.phase, 'waiting', 'the match started by itself');
  assert.ok(t.now - t0 < 12_500, `started ${t.now - t0} ms after the person came`);
  assert.ok(arrivals.length >= 2, `players arrived one by one (${arrivals.length})`);
  for (let i = 1; i < arrivals.length; i++) assert.ok(arrivals[i]! - arrivals[i - 1]! >= FILL_RULES.arriveMinMs - TICK_MS, 'at a human pace');
  assert.equal(ws.roster().players.length, FILL_RULES.ffaPlayers, 'the rest is filled up at kick-off');
  assertLooksLikePeople(ws.roster().players);
  assert.ok(t.run(3000, () => t.room.phase === 'active'));

  // a person joining in progress takes a filled place
  const b = person('Kolyan');
  const before = new Set(ws.roster().players.map((p) => p.id));
  assert.equal(t.join(b).res, 'ok');
  assert.equal(t.room.world.players.size, 5);
  assert.ok(t.run(FILL_RULES.leaveMaxMs + 200, () => t.room.world.players.size === 4), 'a filled player gives the place up');
  const after = ws.roster().players;
  assert.ok(after.some((p) => p.id === b.userId));
  assert.equal(after.filter((p) => !before.has(p.id)).length, 1, 'only the newcomer is new');

  // a person leaving mid-match: the place is taken again after a while
  t.drop(b);
  assert.ok(!t.run(FILL_RULES.joinMinMs - 200, () => t.room.world.players.size === 5), 'not instantly');
  assert.ok(t.run(FILL_RULES.joinMaxMs, () => t.room.world.players.size === 5), 'someone joins in progress');
  assert.ok(t.run(10_000, () => t.room.world.players.size === 4), 'the person who left loses the place after the grace period');
  assertLooksLikePeople(ws.roster().players);
});

test('fill: a person always gets a place — in a full room a filled player gives up theirs at once', () => {
  const t = setup({ config: { maxPlayers: 4 } });
  const a = person('Petya');
  t.join(a);
  t.send(a, { type: 'start' });
  assert.ok(t.run(2000, () => t.room.phase === 'active'));
  assert.equal(t.room.world.players.size, 4);
  const b = person('Mikhalych');
  const { res, ws } = t.join(b);
  assert.equal(res, 'ok');
  assert.equal(t.room.world.players.size, 4);
  assert.ok(t.room.world.players.has(b.userId));
  assert.ok(ws.msgs.some((m) => m.type === 'welcome'));
});

test('fill: the filled players stay for a rematch and vote like people; they leave with the last person', () => {
  const t = setup({ config: { emptyRoomTtlMs: 10_000 } });
  const a = person('Valyuta');
  const { ws } = t.join(a);
  t.send(a, { type: 'start' });
  assert.ok(t.run(2000, () => t.room.phase === 'active'));
  const lineup = ws.roster().players.map((p) => p.id).sort();
  t.room.world.finish('time');
  t.run(100);
  assert.equal(t.room.phase, 'finished');
  assert.ok(ws.roster().players.some((p) => p.id !== a.userId && !p.ready), 'nobody votes at once');
  t.run(6500);
  assert.ok(
    ws.roster().players.filter((p) => p.id !== a.userId).every((p) => p.ready),
    'everyone else asks for a rematch within seconds',
  );
  t.send(a, { type: 'rematch' });
  assert.notEqual(t.room.phase, 'finished');
  assert.deepEqual(ws.roster().players.map((p) => p.id).sort(), lineup, 'the same lineup plays again');
  assert.ok(t.run(2000, () => t.room.phase === 'active'));
  // the last person leaves: the filled players wait while the person may come back, then go too
  t.drop(a);
  t.run(2000);
  assert.equal(t.room.info().fill, 3, 'they wait while the person may come back');
  assert.equal(t.room.phase, 'active');
  assert.ok(t.run(FAST.reconnectGraceMs!, () => t.room.info().fill === 0), 'they leave with the last person');
  assert.equal(t.room.info().players, 0);
  assert.ok(t.run(12_000, () => t.room.closed), 'and the empty room closes');
});

test('fill: off unless enabled — nothing is added and two people are needed', () => {
  const t = setup({ fillBots: false });
  const a = person('Odin');
  const { ws } = t.join(a);
  assert.equal(ws.roster().minToStart, 2);
  t.send(a, { type: 'start' });
  assert.ok(ws.msgs.some((m) => m.type === 'error' && m.code === 'not_enough_players'));
  t.run(FILL_RULES.waitMs + 5000);
  assert.equal(t.room.phase, 'waiting');
  assert.equal(ws.roster().players.length, 1);
  assert.equal(t.room.info().fill, 0);
});
