/**
 * Realtime integration tests: a real HTTP server + WebSocket gateway + room manager (60 Hz loop),
 * driven by independent WebSocket clients speaking the production wire protocol.
 * Persistence is replaced by the in-memory service implementations (no database needed).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { decodeSnapshot, encodeInputs, quantizeAngle, PROTOCOL_VERSION, RUN_SPEED, WS_CLOSE, BTN } from '@blatkom/shared';
import type { CharacterId, InputFrame, ServerMessage, Snapshot, MatchConfig } from '@blatkom/shared';
import { createApp } from '../app.js';
import { registerRoomRoutes } from '../api/rooms.js';
import { RoomManager } from './RoomManager.js';
import { attachGateway } from './gateway.js';
import { memoryServices } from '../services/memory.js';
import { silentLogger } from '../logging/logger.js';
import { testEnv } from '../admin/testkit.js';

const FAST: Partial<MatchConfig> = {
  durationMs: 20_000,
  scoreLimit: 1,
  readyMs: 100,
  countdownMs: 300,
  finishedMs: 60_000,
  respawnDelayMs: 400,
  spawnProtectionMs: 0,
  reconnectGraceMs: 3_000,
  emptyRoomTtlMs: 400,
};

let server: Server;
let base: string;
let wsBase: string;
let rooms: RoomManager;
let services: ReturnType<typeof memoryServices>;
let wss: ReturnType<typeof attachGateway>;
let userNo = 0;

before(async () => {
  services = memoryServices();
  rooms = new RoomManager(services, silentLogger, { maxRooms: 50, config: FAST });
  const env = testEnv({ PUBLIC_URL: 'http://127.0.0.1:8080' });
  const handler = createApp({ env, sql: null, log: silentLogger, services, rooms }, [registerRoomRoutes]);
  server = createServer((req, res) => void handler(req, res));
  wss = attachGateway(server, rooms, services, silentLogger, { allowedOrigins: [], publicUrl: env.PUBLIC_URL, maxConnectionsPerIp: 64, trustProxy: false });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
  wsBase = `ws://127.0.0.1:${port}/ws`;
  rooms.start();
});

after(async () => {
  rooms.stop();
  wss.close();
  for (const c of wss.clients) c.terminate();
  await new Promise<void>((r) => server.close(() => r()));
});

function user(name: string) {
  const userId = `u${++userNo}-${name}`;
  const token = services.sessions.issue({ userId, displayName: name, level: 1, platform: null });
  return { userId, token, name };
}

async function api<T>(method: string, path: string, token: string | null, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(base + path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as T };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Client {
  readonly ws: WebSocket;
  readonly msgs: ServerMessage[] = [];
  readonly snaps: Snapshot[] = [];
  closed: { code: number; reason: string } | null = null;
  seq = 0;
  private waiters: Array<() => void> = [];

  constructor(hello: Record<string, unknown>) {
    this.ws = new WebSocket(wsBase);
    this.ws.binaryType = 'arraybuffer';
    this.ws.on('open', () => this.ws.send(JSON.stringify(hello)));
    this.ws.on('message', (data, isBinary) => {
      if (isBinary) this.snaps.push(decodeSnapshot(data as ArrayBuffer));
      else this.msgs.push(JSON.parse(String(data)) as ServerMessage);
      this.wake();
    });
    this.ws.on('close', (code, reason) => {
      this.closed = { code, reason: String(reason) };
      this.wake();
    });
    this.ws.on('error', () => {});
  }

  static join(u: { token: string }, roomId: string, character: CharacterId = 'petya'): Client {
    return new Client({ type: 'hello', protocol: PROTOCOL_VERSION, token: u.token, roomId, character, clientVersion: 'test' });
  }

  private wake() {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  async until<T>(probe: () => T | undefined | null | false, timeoutMs = 5000, what = 'condition'): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const v = probe();
      if (v) return v;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timeout waiting for ${what}; last msgs: ${JSON.stringify(this.msgs.slice(-3)).slice(0, 400)}`);
      await new Promise<void>((r) => {
        const t = setTimeout(r, Math.min(left, 100));
        this.waiters.push(() => {
          clearTimeout(t);
          r();
        });
      });
    }
  }

  msg<K extends ServerMessage['type']>(type: K, pred: (m: Extract<ServerMessage, { type: K }>) => boolean = () => true, timeoutMs = 5000) {
    return this.until(() => this.msgs.find((m): m is Extract<ServerMessage, { type: K }> => m.type === type && pred(m as Extract<ServerMessage, { type: K }>)), timeoutMs, `message ${type}`);
  }

  snap(pred: (s: Snapshot) => boolean, timeoutMs = 5000) {
    return this.until(() => [...this.snaps].reverse().find(pred), timeoutMs, 'snapshot');
  }

  waitClose(timeoutMs = 5000) {
    return this.until(() => this.closed, timeoutMs, 'close');
  }

  send(m: Record<string, unknown>) {
    this.ws.send(JSON.stringify(m));
  }

  input(f: Partial<InputFrame>) {
    const frame: InputFrame = { seq: ++this.seq, moveX: 0, moveY: 0, aim: 0, buttons: 0, slot: 0, viewTime: 0, ...f };
    this.ws.send(encodeInputs([frame]), { binary: true });
  }

  get lastSnap(): Snapshot | undefined {
    return this.snaps[this.snaps.length - 1];
  }

  close() {
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) this.ws.close();
  }
}

async function privateRoom(host: { token: string }) {
  const r = await api<{ roomId: string; inviteCode: string; inviteUrl: string; webUrl: string }>('POST', '/api/rooms', host.token, { mapId: 'factory', isPrivate: true });
  assert.equal(r.status, 201);
  return r.data;
}

async function startedMatch() {
  const a = user('Петя');
  const b = user('Валюта');
  const room = await privateRoom(a);
  const ca = Client.join(a, room.roomId, 'petya');
  await ca.msg('welcome');
  const cb = Client.join(b, room.roomId, 'valuta');
  await cb.msg('welcome');
  await ca.msg('roster', (m) => m.players.length === 2);
  ca.send({ type: 'start' });
  await ca.snap((s) => s.phase === 'active', 5000);
  await cb.snap((s) => s.phase === 'active', 5000);
  return { a, b, ca, cb, room };
}

test('the lobby roster shows every player\'s avatar (null: the character\'s portrait)', async () => {
  const userId = `u${++userNo}-avatar`;
  const a = { userId, token: services.sessions.issue({ userId, displayName: 'Шляпа', level: 3, avatar: 'militia', platform: null }), name: 'Шляпа' };
  const b = user('Без аватарки');
  const room = await privateRoom(a);
  const ca = Client.join(a, room.roomId, 'petya');
  await ca.msg('welcome');
  const cb = Client.join(b, room.roomId, 'valuta');
  await cb.msg('welcome');
  const roster = await cb.msg('roster', (m) => m.players.length === 2);
  assert.equal(roster.players.find((p) => p.id === a.userId)?.avatar, 'militia');
  assert.equal(roster.players.find((p) => p.id === b.userId)?.avatar, null);
  ca.close();
  cb.close();
});

test('rooms API: auth required, invite resolves to a joinable room', async () => {
  const anon = await api('POST', '/api/rooms', null, { mapId: 'factory', isPrivate: true });
  assert.equal(anon.status, 401);
  const bad = await api('POST', '/api/rooms', user('x').token, { mapId: 'moon', isPrivate: true });
  assert.equal(bad.status, 400);
  const host = user('Хозяин');
  const room = await privateRoom(host);
  assert.match(room.inviteCode, /^[A-Za-z0-9]{6,16}$/);
  assert.ok(room.inviteUrl.includes(room.inviteCode));
  const inv = await api<{ status: string; roomId: string; players: number }>('GET', `/api/invites/${room.inviteCode}`, null);
  assert.equal(inv.status, 200);
  assert.equal(inv.data.status, 'joinable');
  assert.equal(inv.data.roomId, room.roomId);
  const missing = await api<{ status: string }>('GET', '/api/invites/ZZZZZZZZ', null);
  assert.equal(missing.data.status, 'not_found');
  const malformed = await api('GET', '/api/invites/%3Cscript%3E', null);
  assert.equal(malformed.status, 400);
});

test('two independent clients play a server-authoritative match with consistent state and results', async () => {
  const { a, b, ca, cb, room } = await startedMatch();
  const roomObj = rooms.get(room.roomId)!;
  // Test hook: place both players face to face in the open north courtyard of «Заводская проходная».
  const pa = roomObj.world.players.get(a.userId)!;
  const pb = roomObj.world.players.get(b.userId)!;
  for (const [p, x] of [
    [pa, 240],
    [pb, 330],
  ] as const) {
    p.x = x;
    p.y = 470;
    p.vx = 0;
    p.vy = 0;
    p.invulnUntil = 0;
    p.alive = true;
    p.hp = 100;
  }
  const teleportTick = roomObj.world.tick;
  const fresh = await ca.snap((s) => s.tick > teleportTick + 2);
  const view = fresh.serverTime;
  // A holds the trigger aiming at B (+x); the server decides hits, damage and the kill.
  for (let i = 0; i < 90 && !ca.msgs.some((m) => m.type === 'results'); i++) {
    ca.input({ aim: quantizeAngle(0), buttons: BTN.FIRE, viewTime: view + i * 16 });
    cb.input({ aim: quantizeAngle(Math.PI / 2), viewTime: view + i * 16 });
    await sleep(16);
  }
  const ra = await ca.msg('results', () => true, 6000);
  const rb = await cb.msg('results', () => true, 6000);
  assert.equal(ra.reason, 'score');
  assert.deepEqual(ra, rb, 'both clients receive identical authoritative results');
  const sa = ra.standings.find((s) => s.id === a.userId)!;
  const sb = ra.standings.find((s) => s.id === b.userId)!;
  assert.equal(sa.kills, 1);
  assert.equal(sb.deaths, 1);
  assert.equal(ra.standings[0]!.id, a.userId);
  // damage/kill events were broadcast to both (and arrive before the results message)
  const evs = (c: Client) => c.msgs.flatMap((m) => (m.type === 'ev' ? m.events : []));
  const before = (c: Client) => c.msgs.slice(0, c.msgs.findIndex((m) => m.type === 'results')).flatMap((m) => (m.type === 'ev' ? m.events : []));
  assert.ok(before(ca).some((e) => e.t === 'kill'), 'kill event precedes results');
  assert.ok(before(cb).some((e) => e.t === 'kill'));
  const dmgA = evs(ca).filter((e) => e.t === 'damage');
  const dmgB = evs(cb).filter((e) => e.t === 'damage');
  assert.ok(dmgA.length >= 3, 'pistol needs ≥3 hits');
  assert.deepEqual(dmgA, dmgB);
  assert.ok(evs(cb).some((e) => e.t === 'kill'));
  // both clients saw identical world state for the same tick
  const common = ca.snaps.map((s) => s.tick).filter((t) => cb.snaps.some((s) => s.tick === t));
  assert.ok(common.length > 20);
  for (const t of common.slice(-10)) {
    const x = ca.snaps.find((s) => s.tick === t)!;
    const y = cb.snaps.find((s) => s.tick === t)!;
    assert.deepEqual(
      x.players.map((p) => [p.slot, p.x, p.y, p.hp, p.alive, p.kills]),
      y.players.map((p) => [p.slot, p.x, p.y, p.hp, p.alive, p.kills]),
    );
  }
  // personal progress, recorded exactly once
  const pa1 = await ca.msg('progress');
  assert.ok(pa1.result.xpGained > 0);
  await cb.msg('progress');
  await sleep(400);
  assert.equal(services.recorder.completed.size >= 1, true);
  const rec = services.recorder.completed.get(ra.matchId)!;
  assert.equal(rec.endReason, 'score');
  assert.equal(rec.participants.length, 2);
  assert.equal(services.analytics.events.filter((e) => e.name === 'match_completed' && e.props.matchId === ra.matchId).length, 1);
  assert.equal(ca.msgs.filter((m) => m.type === 'results').length, 1, 'results are sent once');
  assert.equal(ca.msgs.filter((m) => m.type === 'progress').length, 1, 'XP is awarded once');
  ca.close();
  cb.close();
});

test('movement is validated server-side: normalized diagonal speed and input flooding is throttled', async () => {
  const { a, ca, cb, room } = await startedMatch();
  const roomObj = rooms.get(room.roomId)!;
  const p = roomObj.world.players.get(a.userId)!;
  p.x = 300;
  p.y = 470;
  p.vx = 0;
  p.vy = 0;
  const t0 = roomObj.world.time;
  const x0 = p.x;
  const y0 = p.y;
  // flood: 400 diagonal full-speed inputs within ~0.5 s (a speed-hack client)
  for (let burst = 0; burst < 10; burst++) {
    const frames: InputFrame[] = [];
    for (let i = 0; i < 40; i++) frames.push({ seq: ++ca.seq, moveX: 127, moveY: 127, aim: 0, buttons: 0, slot: 0, viewTime: 0 });
    for (let i = 0; i < frames.length; i += 16) ca.ws.send(encodeInputs(frames.slice(i, i + 16)), { binary: true });
    await sleep(50);
  }
  await sleep(300);
  const dt = (roomObj.world.time - t0) / 1000;
  const dist = Math.hypot(p.x - x0, p.y - y0);
  assert.ok(dist > 5, 'player moved');
  assert.ok(dist <= RUN_SPEED * dt + 2, `moved ${dist.toFixed(1)}px in ${dt.toFixed(2)}s (max ${RUN_SPEED * dt})`);
  const snap = await ca.snap((s) => s.tick > roomObj.world.tick - 4);
  for (const pl of snap.players) assert.ok(Math.hypot(pl.vx, pl.vy) <= RUN_SPEED + 1);
  ca.close();
  cb.close();
});

test('invalid handshakes and commands are rejected without affecting the room', async () => {
  const u = user('Хакер');
  const host = user('Хозяин');
  const room = await privateRoom(host);
  const ch = Client.join(host, room.roomId);
  await ch.msg('welcome');

  const wrongProto = new Client({ type: 'hello', protocol: 999, token: u.token, roomId: room.roomId, character: 'petya' });
  assert.equal((await wrongProto.waitClose()).code, WS_CLOSE.POLICY);
  assert.ok(wrongProto.msgs.some((m) => m.type === 'error' && m.code === 'version_mismatch'));

  const badToken = new Client({ type: 'hello', protocol: PROTOCOL_VERSION, token: 'x'.repeat(32), roomId: room.roomId, character: 'petya' });
  assert.equal((await badToken.waitClose()).code, WS_CLOSE.UNAUTHORIZED);

  const noRoom = Client.join(u, 'NoSuchRoom1');
  assert.equal((await noRoom.waitClose()).code, WS_CLOSE.ROOM_NOT_FOUND);

  const binaryHello = new WebSocket(wsBase);
  await new Promise((r) => binaryHello.on('open', r));
  binaryHello.send(Buffer.from([1, 2, 3]));
  const code = await new Promise<number>((r) => binaryHello.on('close', (c) => r(c)));
  assert.equal(code, WS_CLOSE.POLICY);

  // a joined client sending garbage: ignored, then kicked after repeated violations
  const cu = Client.join(u, room.roomId);
  await cu.msg('welcome');
  cu.ws.send(Buffer.from([0xff, 0x00, 0x13]), { binary: true });
  cu.send({ type: 'start' }); // not the host
  const err = await cu.msg('error', (m) => m.code === 'not_host');
  assert.ok(err.message.length > 0);
  cu.send({ type: 'map', mapId: 'yard' });
  await cu.msg('error', (m) => m.code === 'not_host' && m !== err);
  await sleep(100);
  assert.equal(cu.closed, null, 'a few bad messages do not disconnect');
  for (let i = 0; i < 60; i++) cu.ws.send('{not json');
  const closed = await cu.waitClose();
  assert.equal(closed.code, WS_CLOSE.POLICY);
  assert.ok(cu.msgs.some((m) => m.type === 'kicked'));
  // the room and its host are unaffected
  ch.send({ type: 'ping', t: 1 });
  await ch.msg('pong');
  assert.ok(rooms.get(room.roomId));
  ch.close();
});

test('room capacity is enforced (max 10 players)', async () => {
  const host = user('Хозяин');
  const room = await privateRoom(host);
  const clients = [Client.join(host, room.roomId)];
  await clients[0]!.msg('welcome');
  for (let i = 0; i < 9; i++) {
    const c = Client.join(user(`Игрок${i}`), room.roomId, (['petya', 'valuta', 'uchastkovy', 'mihalych'] as const)[i % 4]);
    await c.msg('welcome');
    clients.push(c);
  }
  const roster = await clients[0]!.msg('roster', (m) => m.players.length === 10);
  assert.equal(roster.maxPlayers, 10);
  assert.equal(new Set(roster.players.map((p) => p.slot)).size, 10, 'ten distinct slots');
  const inv = await api<{ status: string; players: number }>('GET', `/api/invites/${room.inviteCode}`, null);
  assert.equal(inv.data.status, 'full');
  const eleventh = Client.join(user('Лишний'), room.roomId);
  const closed = await eleventh.waitClose();
  assert.equal(closed.code, WS_CLOSE.ROOM_FULL);
  assert.ok(eleventh.msgs.some((m) => m.type === 'error' && m.code === 'room_full'));
  // all ten can play: the match starts and spawns everybody on separate points
  clients[0]!.send({ type: 'start' });
  const snap = await clients[0]!.snap((sn) => sn.phase === 'active' && sn.players.filter((p) => p.alive).length === 10, 6000);
  assert.equal(new Set(snap.players.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).size, 10);
  for (const c of clients) c.close();
});

test('team match: teams alternate on join, switching keeps them even, the host can change the mode, no friendly fire, team results', async () => {
  const host = user('Красный');
  const r = await api<{ roomId: string; inviteCode: string; mode: string }>('POST', '/api/rooms', host.token, { mapId: 'factory', isPrivate: true, mode: 'teams' });
  assert.equal(r.status, 201);
  assert.equal(r.data.mode, 'teams');
  const inv = await api<{ mode: string }>('GET', `/api/invites/${r.data.inviteCode}`, null);
  assert.equal(inv.data.mode, 'teams');
  const others = [user('Синий'), user('Красный2'), user('Синий2')];
  const ch = Client.join(host, r.data.roomId, 'petya');
  const w = await ch.msg('welcome');
  assert.equal(w.mode, 'teams');
  const cs = others.map((u, i) => Client.join(u, r.data.roomId, (['valuta', 'uchastkovy', 'mihalych'] as const)[i]));
  for (const c of cs) await c.msg('welcome');
  const roster = await ch.msg('roster', (m) => m.players.length === 4);
  assert.equal(roster.mode, 'teams');
  const teamOf = (m: Extract<ServerMessage, { type: 'roster' }>, id: string) => m.players.find((p) => p.id === id)!.team;
  assert.deepEqual([host, ...others].map((u) => teamOf(roster, u.userId)), [0, 1, 0, 1]);
  // 2 v 2: moving to the other side would make it 1 v 3 — refused
  cs[0]!.send({ type: 'team', team: 0 });
  await cs[0]!.msg('error', (m) => m.code === 'team_full');
  // a guest cannot change the mode
  cs[0]!.send({ type: 'mode', mode: 'ffa' });
  await cs[0]!.msg('error', (m) => m.code === 'not_host');
  // the host switches to free-for-all and back: teams are dealt anew
  ch.send({ type: 'mode', mode: 'ffa' });
  await ch.msg('roster', (m) => m.mode === 'ffa' && m.players.every((p) => p.team === null));
  ch.send({ type: 'mode', mode: 'teams' });
  const back = await ch.msg('roster', (m) => m.mode === 'teams' && m.players.length === 4 && m.players.every((p) => p.team !== null));
  assert.equal(back.players.filter((p) => p.team === 0).length, 2);
  // start: teammates cannot hurt each other, the team score is in the snapshots
  ch.send({ type: 'start' });
  await ch.snap((s) => s.phase === 'active', 5000);
  const room = rooms.get(r.data.roomId)!;
  const ps = [host, ...others].map((u) => room.world.players.get(u.userId)!);
  const red = ps.filter((p) => p.team === 0);
  const blue = ps.filter((p) => p.team === 1);
  for (const p of ps) p.invulnUntil = 0;
  room.world.applyDamage(red[1]!, red[0]!, 60, 'pistol');
  assert.equal(red[1]!.hp, 100, 'no friendly fire on the server');
  room.world.applyDamage(blue[0]!, red[0]!, 200, 'pistol');
  const s1 = await ch.snap((s) => s.teamScore[0] === 1);
  assert.deepEqual(s1.teamScore, [1, 0]);
  assert.ok(s1.players.every((p) => p.team === 0 || p.team === 1));
  room.world.finish('time');
  const res = await ch.msg('results', () => true, 6000);
  assert.equal(res.mode, 'teams');
  assert.deepEqual(res.teams, { scores: [1, 0], winner: 0 });
  assert.ok(res.standings.slice(0, 2).every((s) => s.team === 0 && s.place === 1));
  await sleep(200);
  const recorded = [...services.recorder.completed.values()].find((m) => m.roomId === r.data.roomId)!;
  assert.equal(recorded.mode, 'teams');
  assert.equal(recorded.winnerTeam, 0);
  assert.ok(recorded.participants.filter((p) => p.team === 0).every((p) => p.teamOutcome === 'win'));
  assert.ok(recorded.participants.filter((p) => p.team === 1).every((p) => p.teamOutcome === 'loss'));
  for (const c of [ch, ...cs]) c.close();
});

test('capture the flag and base capture: flags and bases in snapshots, objective events, team results, XP for captures', async () => {
  const host = user('Знаменосец');
  const guest = user('Перехватчик');
  const r = await api<{ roomId: string; mode: string }>('POST', '/api/rooms', host.token, { mapId: 'factory', isPrivate: true, mode: 'ctf' });
  assert.equal(r.status, 201);
  assert.equal(r.data.mode, 'ctf');
  const ch = Client.join(host, r.data.roomId, 'petya');
  assert.equal((await ch.msg('welcome')).mode, 'ctf');
  const cg = Client.join(guest, r.data.roomId, 'valuta');
  await cg.msg('welcome');
  const r2 = await ch.msg('roster', (m) => m.players.length === 2 && m.players.every((p) => p.team !== null));
  // switching between team modes keeps the teams
  const before = r2.players.map((p) => [p.id, p.team]);
  ch.send({ type: 'mode', mode: 'bases' });
  const rb = await ch.msg('roster', (m) => m.mode === 'bases' && m.players.length === 2);
  assert.deepEqual(rb.players.map((p) => [p.id, p.team]), before);
  ch.send({ type: 'mode', mode: 'ctf' });
  ch.send({ type: 'start' });
  const s0 = await ch.snap((s) => s.phase === 'active', 5000);
  assert.deepEqual(
    s0.flags.map((f) => [f.team, f.status]),
    [
      [0, 'home'],
      [1, 'home'],
    ],
  );
  assert.equal(s0.bases.length, 0);
  const room = rooms.get(r.data.roomId)!;
  const hp = room.world.players.get(host.userId)!;
  const enemyFlag = room.world.flags.find((f) => f.team !== hp.team)!;
  const ownFlag = room.world.flags.find((f) => f.team === hp.team)!;
  // teleport the host onto the enemy flag, then home: the server takes and scores it
  Object.assign(hp, { x: enemyFlag.standX, y: enemyFlag.standY, vx: 0, vy: 0, invulnUntil: 0 });
  const taken = await ch.msg('ev', (m) => m.events.some((e) => e.t === 'flag' && e.action === 'taken'));
  assert.ok(taken.events.some((e) => e.t === 'flag' && e.action === 'taken' && e.slot === hp.slot));
  const carried = await ch.snap((s) => s.flags.some((f) => f.status === 'carried' && f.carrier === hp.slot));
  assert.ok(carried);
  Object.assign(hp, { x: ownFlag.standX, y: ownFlag.standY, vx: 0, vy: 0 });
  await ch.msg('ev', (m) => m.events.some((e) => e.t === 'flag' && e.action === 'captured'));
  const scored = await ch.snap((s) => s.teamScore[hp.team!] === 1);
  assert.equal(scored.players.find((p) => p.slot === hp.slot)!.objectives, 1);
  room.world.finish('time');
  const res = await ch.msg('results', () => true, 6000);
  assert.equal(res.mode, 'ctf');
  assert.equal(res.teams!.winner, hp.team);
  assert.equal(res.standings.find((x) => x.id === host.userId)!.objectives, 1);
  await sleep(200);
  const recorded = [...services.recorder.completed.values()].find((m) => m.roomId === r.data.roomId)!;
  assert.equal(recorded.mode, 'ctf');
  assert.equal(recorded.participants.find((p) => p.userId === host.userId)!.objectives, 1);
  for (const c of [ch, cg]) c.close();

  // base capture via quick match: both players land in the same bases room
  const a = user('Комендант базы');
  const b = user('Захватчик');
  const qa = await api<{ roomId: string; mode: string }>('POST', '/api/rooms/quick', a.token, { mode: 'bases' });
  const qb = await api<{ roomId: string; mode: string }>('POST', '/api/rooms/quick', b.token, { mode: 'bases' });
  assert.equal(qa.data.mode, 'bases');
  assert.equal(qb.data.roomId, qa.data.roomId);
  const qf = await api<{ roomId: string }>('POST', '/api/rooms/quick', user('Чужой').token, { mode: 'ctf' });
  assert.notEqual(qf.data.roomId, qa.data.roomId);
  const ca = Client.join(a, qa.data.roomId, 'petya');
  const cb = Client.join(b, qa.data.roomId, 'valuta');
  await ca.msg('welcome');
  await cb.msg('welcome');
  ca.send({ type: 'ready', ready: true });
  cb.send({ type: 'ready', ready: true });
  const sb = await ca.snap((s) => s.phase === 'active', 14000);
  assert.equal(sb.bases.length, 3);
  assert.ok(sb.bases.every((x) => x.owner === null));
  const broom = rooms.get(qa.data.roomId)!;
  const pa = broom.world.players.get(a.userId)!;
  const B = broom.world.bases[1]!;
  Object.assign(pa, { x: B.x, y: B.y, vx: 0, vy: 0 });
  const cap = await ca.msg('ev', (m) => m.events.some((e) => e.t === 'base'), 9000);
  assert.ok(cap.events.some((e) => e.t === 'base' && e.base === 1 && e.team === pa.team && e.slots.includes(pa.slot)));
  const owned = await ca.snap((s) => s.bases[1]!.owner === pa.team && s.teamScore[pa.team!] >= 1, 3000);
  assert.ok(owned);
  for (const c of [ca, cb]) c.close();
});

test('quick match keeps free-for-all and team players apart', async () => {
  const a = user('Одиночка');
  const b = user('Командный');
  const qa = await api<{ roomId: string; mode: string }>('POST', '/api/rooms/quick', a.token, { mode: 'ffa' });
  const qb = await api<{ roomId: string; mode: string }>('POST', '/api/rooms/quick', b.token, { mode: 'teams' });
  assert.equal(qa.data.mode, 'ffa');
  assert.equal(qb.data.mode, 'teams');
  assert.notEqual(qa.data.roomId, qb.data.roomId);
  const c = user('Ещё командный');
  const qc = await api<{ roomId: string }>('POST', '/api/rooms/quick', c.token, { mode: 'teams' });
  assert.equal(qc.data.roomId, qb.data.roomId);
});

test('disconnect during a match keeps the slot; reconnecting resumes it; a second tab replaces the first', async () => {
  const { a, b, ca, cb } = await startedMatch();
  const welcomeB = await cb.msg('welcome');
  cb.ws.terminate(); // abrupt network loss
  await ca.msg('roster', (m) => m.players.some((p) => p.id === b.userId && !p.connected));
  const gone = await ca.snap((s) => s.players.some((p) => p.slot === welcomeB.slot && !p.connected));
  assert.ok(gone);
  // reconnect within the grace period with the same session
  const cb2 = Client.join(b, welcomeB.roomId, 'valuta');
  const w2 = await cb2.msg('welcome');
  assert.equal(w2.resumed, true);
  assert.equal(w2.slot, welcomeB.slot);
  await ca.msg('roster', (m) => m.players.some((p) => p.id === b.userId && p.connected) && m.players.length === 2);
  // the resumed player is respawned by the server
  await cb2.snap((s) => s.players.some((p) => p.slot === w2.slot && p.alive && p.connected), 5000);
  // same account opening a second connection replaces the first one
  const cb3 = Client.join(b, welcomeB.roomId, 'valuta');
  await cb3.msg('welcome');
  const old = await cb2.waitClose();
  assert.equal(old.code, WS_CLOSE.REPLACED);
  void a;
  ca.close();
  cb3.close();
});

test('a player who does not return within the grace period loses the slot; empty rooms are cleaned up', async () => {
  const { b, ca, cb, room } = await startedMatch();
  cb.ws.terminate();
  await ca.msg('roster', (m) => m.players.length === 1 && !m.players.some((p) => p.id === b.userId), 6000);
  ca.close();
  await ca.waitClose();
  // room closes after emptyRoomTtlMs with nobody connected
  const t0 = Date.now();
  while (rooms.get(room.roomId) && Date.now() - t0 < 4000) await sleep(50);
  assert.equal(rooms.get(room.roomId), undefined);
  const inv = await api<{ status: string }>('GET', `/api/invites/${room.inviteCode}`, null);
  assert.equal(inv.data.status, 'expired');
  const info = await api('GET', `/api/rooms/${room.roomId}`, user('z').token);
  assert.equal(info.status, 404);
  assert.ok(services.recorder.abandoned.length >= 0);
});

test('rematch: after results everyone votes, a new match starts with a new id, players can move and results are recorded separately', async () => {
  const { a, ca, cb, room } = await startedMatch();
  const roomObj = rooms.get(room.roomId)!;
  const slotA = (await ca.msg('welcome')).slot;
  // match 1: A's input sequence climbs to 60
  for (let i = 0; i < 60; i++) ca.input({ viewTime: ca.lastSnap?.serverTime ?? 0 });
  await sleep(250);
  roomObj.world.finish('time');
  const r1 = await ca.msg('results');
  await cb.msg('results');
  // the level earned in that match reaches the roster (nameplates and the Tab table in the rematch)
  const prog = await ca.msg('progress');
  assert.ok(prog.result.level > 1);
  await ca.msg('roster', (m) => m.players.some((p) => p.id === a.userId && p.level === prog.result.level));
  const mark = ca.snaps.length;
  ca.send({ type: 'rematch' });
  cb.send({ type: 'rematch' });
  const fresh = () => ca.snaps.slice(mark).filter((s) => s.phase === 'active');
  await ca.until(() => fresh().find((s) => s.players.some((p) => p.slot === slotA && p.alive)), 6000, 'active snapshot after the rematch');
  const m2 = rooms.get(room.roomId)!.matchId;
  assert.ok(m2 && m2 !== r1.matchId);
  // regression: the new match's game scene restarts the input sequence at 1 — the player must still move
  const before = fresh().at(-1)!.players.find((p) => p.slot === slotA)!;
  ca.seq = 0;
  // walk where there is room (a spawn can be right at a wall)
  const world = rooms.get(room.roomId)!.world;
  const open = (dx: number, dy: number) => [1, 2, 3, 4, 5, 6].every((k) => !world.collision.overlapsCircle(before.x + dx * k * 8, before.y + dy * k * 8, 11));
  const [dx, dy] = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).find(([x, y]) => open(x, y)) ?? [1, 0];
  for (let i = 0; i < 40; i++) {
    ca.input({ moveX: dx * 127, moveY: dy * 127, viewTime: ca.lastSnap?.serverTime ?? 0 });
    await sleep(16);
  }
  await ca.until(() => fresh().some((s) => s.players.some((p) => p.slot === slotA && Math.hypot(p.x - before.x, p.y - before.y) > 25)), 4000, 'movement after the rematch');
  rooms.get(room.roomId)!.world.finish('time');
  const r2 = await ca.msg('results', (m) => m.matchId !== r1.matchId);
  assert.notEqual(r2.matchId, r1.matchId);
  await sleep(200);
  assert.ok(services.recorder.completed.has(r1.matchId));
  assert.ok(services.recorder.completed.has(r2.matchId));
  ca.close();
  cb.close();
});

test('gear: rooms spawn players with their owned loadout, modifications and equipment, refuse unowned characters and re-read the loadout on request', async () => {
  const a = user('Снайпер');
  const b = user('Новичок');
  services.economy.gearByUser.set(a.userId, { loadout: { sidearm: 'deagle', melee: 'bita', primary: 'svd', gadget: 'smoke', mods: { svd: ['extmag'] } }, characters: ['leopard'] });
  const room = await privateRoom(a);
  const ca = Client.join(a, room.roomId, 'leopard');
  const welcomeA = await ca.msg('welcome');
  // B asks for a premium character it does not own → plays the free default
  const cb = Client.join(b, room.roomId, 'slon');
  await cb.msg('welcome');
  const roster = await ca.msg('roster', (m) => m.players.length === 2);
  assert.equal(roster.players.find((p) => p.id === a.userId)!.character, 'leopard');
  assert.equal(roster.players.find((p) => p.id === b.userId)!.character, 'petya');
  assert.deepEqual(roster.players.find((p) => p.id === a.userId)!.mods, { svd: ['extmag'] }, 'own modifications travel for client prediction');
  cb.send({ type: 'character', character: 'akula' });
  await cb.msg('error', (m) => m.code === 'character_locked');
  ca.send({ type: 'start' });
  const s = await ca.snap((x) => x.phase === 'active' && x.players.some((p) => p.slot === welcomeA.slot && p.alive));
  const pa = s.players.find((p) => p.slot === welcomeA.slot)!;
  assert.equal(pa.weapon, 'svd');
  assert.equal(pa.heavy, 'svd');
  assert.equal(pa.sidearm, 'deagle');
  assert.equal(pa.melee, 'bita');
  assert.equal(pa.heavyMag, 15, 'extended magazine (10 + 50 %)');
  assert.equal(pa.gadget, 'smoke');
  assert.equal(pa.gadgetCharges, 2);
  const pb = s.players.find((p) => p.slot !== welcomeA.slot)!;
  assert.equal(pb.weapon, 'avtomat', 'free default loadout');
  // the player changes the loadout over the API and tells the room: applies from the next spawn
  services.economy.gearByUser.set(a.userId, { loadout: { sidearm: 'pistol', melee: 'montirovka', primary: 'obrez', gadget: null, mods: {} }, characters: ['leopard'] });
  ca.send({ type: 'loadout' });
  const roomObj = rooms.get(room.roomId)!;
  await ca.until(() => roomObj.world.players.get(a.userId)!.primary === 'obrez', 3000, 'loadout refresh');
  roomObj.world.spawnPlayer(roomObj.world.players.get(a.userId)!, false);
  const s2 = await ca.snap((x) => x.players.some((p) => p.slot === welcomeA.slot && p.weapon === 'obrez'));
  assert.ok(s2);
  ca.close();
  cb.close();
});
