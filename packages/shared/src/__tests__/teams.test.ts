import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, MAX_SLOTS } from '../sim/world.js';
import type { PlayerState, WorldEvent } from '../sim/world.js';
import { CollisionWorld } from '../maps/collision.js';
import { getMap, getCollision, MAP_ORDER } from '../maps/index.js';
import { MapBuilder } from '../maps/builder.js';
import { input, BTN, PISTOL_ONLY } from './helpers.js';
import { MAX_HP, TICK_MS } from '../constants/game.js';
import { GADGETS } from '../game-rules/gadgets.js';
import { DEFAULT_MATCH_CONFIG, MAX_PLAYERS } from '../game-rules/match.js';
import type { GameMode, Team } from '../game-rules/match.js';
import { encodeSnapshot, decodeSnapshot } from '../net/codec.js';
import { ClientMessageSchema, PROTOCOL_VERSION } from '../net/protocol.js';
import { NavGrid } from '../sim/nav.js';
import { BotBrain } from '../sim/bots.js';

/** Open 600×300 arena (no walls) with spawns on both halves. */
function arena() {
  return new MapBuilder('factory', 'Arena', '', '', 600, 300, 'concrete_slab')
    .spawn(40, 60, 0)
    .spawn(40, 240, 0)
    .spawn(120, 150, 0)
    .spawn(560, 60, 180)
    .spawn(560, 240, 180)
    .spawn(480, 150, 180)
    .pickup('avtomat', 300, 280)
    .medkit(300, 20)
    .supply(200, 280)
    .build();
}

function teamWorld(mode: GameMode = 'teams', extra: Partial<typeof DEFAULT_MATCH_CONFIG> = {}) {
  const m = arena();
  return new World(m, new CollisionWorld(m), { lagCompensation: false, config: { mode, countdownMs: 0, readyMs: 0, spawnProtectionMs: 0, ...extra } });
}

function start(w: World) {
  w.beginMatch(true);
  w.update();
  w.update();
  for (const p of w.players.values()) p.invulnUntil = 0;
  w.drainEvents();
}

function place(p: PlayerState, x: number, y: number) {
  Object.assign(p, { x, y, vx: 0, vy: 0, hp: MAX_HP, alive: true, invulnUntil: 0 });
}

function fire(w: World, id: string, aimRad: number) {
  w.applyInput(id, input({ buttons: BTN.FIRE, aimRad }));
  w.applyInput(id, input({ aimRad }));
}

function run(w: World, ms: number): WorldEvent[] {
  const out: WorldEvent[] = [];
  for (let t = 0; t < ms; t += TICK_MS) {
    w.update();
    out.push(...w.drainEvents());
  }
  return out;
}

test('rooms hold 10 players by default (slots to spare)', () => {
  assert.equal(MAX_PLAYERS, 10);
  assert.equal(DEFAULT_MATCH_CONFIG.maxPlayers, 10);
  assert.ok(MAX_SLOTS >= MAX_PLAYERS);
  const w = teamWorld('ffa');
  for (let i = 0; i < MAX_PLAYERS; i++) w.addPlayer(`p${i}`, `P${i}`, 'petya', false, PISTOL_ONLY);
  assert.equal(new Set([...w.players.values()].map((p) => p.slot)).size, MAX_PLAYERS);
  start(w);
  assert.equal([...w.players.values()].filter((p) => p.alive).length, MAX_PLAYERS);
});

test('teams: newcomers join the smaller team; free-for-all has no teams', () => {
  const ffa = teamWorld('ffa');
  assert.equal(ffa.addPlayer('x', 'X', 'petya').team, null);
  const w = teamWorld();
  const teams = ['a', 'b', 'c', 'd', 'e'].map((id) => w.addPlayer(id, id, 'petya').team);
  assert.deepEqual(teams, [0, 1, 0, 1, 0]);
  assert.equal(w.teamSize(0), 3);
  assert.equal(w.teamSize(1), 2);
});

test('teams: balanceTeams evens out lopsided teams (latest arrivals and bots move first)', () => {
  const w = teamWorld();
  for (const id of ['a', 'b', 'c', 'd', 'e']) w.addPlayer(id, id, 'petya', id === 'c');
  for (const id of ['a', 'b', 'c', 'd', 'e']) w.setTeam(id, 0);
  w.balanceTeams();
  assert.equal(w.teamSize(0), 3);
  assert.equal(w.teamSize(1), 2);
  assert.equal(w.players.get('c')!.team, 1, 'the bot moved first');
});

test('teams: no friendly fire — bullets pass through a teammate and hit the enemy behind', () => {
  const w = teamWorld();
  const a = w.addPlayer('a', 'A', 'petya', false, PISTOL_ONLY, 0);
  const mate = w.addPlayer('m', 'M', 'valuta', false, PISTOL_ONLY, 0);
  const foe = w.addPlayer('f', 'F', 'uchastkovy', false, PISTOL_ONLY, 1);
  start(w);
  place(a, 100, 150);
  place(mate, 160, 150);
  place(foe, 240, 150);
  fire(w, 'a', 0);
  assert.equal(mate.hp, MAX_HP, 'teammate unharmed');
  assert.ok(foe.hp < MAX_HP, 'enemy behind the teammate is hit');
});

test('teams: direct applyDamage between teammates is ignored; free-for-all still hurts', () => {
  const w = teamWorld();
  const a = w.addPlayer('a', 'A', 'petya', false, PISTOL_ONLY, 0);
  const b = w.addPlayer('b', 'B', 'valuta', false, PISTOL_ONLY, 0);
  w.addPlayer('c', 'C', 'mihalych', false, PISTOL_ONLY, 1);
  start(w);
  assert.equal(b.team, a.team);
  w.applyDamage(b, a, 50, 'pistol');
  assert.equal(b.hp, MAX_HP);
  const f = teamWorld('ffa');
  const x = f.addPlayer('a', 'A', 'petya', false, PISTOL_ONLY);
  const y = f.addPlayer('b', 'B', 'valuta', false, PISTOL_ONLY);
  start(f);
  f.applyDamage(y, x, 50, 'pistol');
  assert.equal(y.hp, MAX_HP - 50);
});

test('teams: a grenade hurts enemies and its thrower, never teammates', () => {
  const w = teamWorld();
  const a = w.addPlayer('a', 'A', 'petya', false, { ...PISTOL_ONLY, gadget: 'f1' }, 0);
  const mate = w.addPlayer('m', 'M', 'valuta', false, PISTOL_ONLY, 0);
  const foe = w.addPlayer('f', 'F', 'uchastkovy', false, PISTOL_ONLY, 1);
  start(w);
  w.spawnPlayer(a, false);
  place(a, 100, 150);
  place(mate, 300, 140);
  place(foe, 300, 160);
  w.drainEvents();
  w.applyInput('a', input({ buttons: BTN.GADGET, aimRad: 0 }));
  w.applyInput('a', input({ aimRad: 0 }));
  const g = w.gadgets[0]!;
  assert.equal(g.ownerTeam, 0);
  // stop the grenade between the two
  g.vx = 0;
  g.vy = 0;
  g.x = 300;
  g.y = 150;
  run(w, GADGETS.f1.fuseMs + 50);
  assert.equal(mate.hp, MAX_HP, 'teammate untouched');
  assert.ok(foe.hp < MAX_HP || !foe.alive, 'enemy hurt');
});

test('teams: mines ignore teammates and catch enemies; turrets shoot only enemies', () => {
  const w = teamWorld();
  const a = w.addPlayer('a', 'A', 'petya', false, { ...PISTOL_ONLY, gadget: 'mine' }, 0);
  const mate = w.addPlayer('m', 'M', 'valuta', false, PISTOL_ONLY, 0);
  const foe = w.addPlayer('f', 'F', 'uchastkovy', false, PISTOL_ONLY, 1);
  start(w);
  w.spawnPlayer(a, false);
  place(a, 100, 150);
  place(mate, 500, 60);
  place(foe, 500, 240);
  w.drainEvents();
  w.applyInput('a', input({ buttons: BTN.GADGET, aimRad: 0 }));
  w.applyInput('a', input({ aimRad: 0 }));
  const mine = w.gadgets.find((g) => g.kind === 'mine')!;
  place(a, 40, 60);
  run(w, GADGETS.mine.fuseMs + 100);
  place(mate, mine.x + 4, mine.y);
  run(w, 400);
  assert.equal(mine.triggeredAt, 0, 'a teammate does not trigger the mine');
  place(mate, 500, 60);
  place(foe, mine.x + 4, mine.y);
  run(w, 600);
  assert.ok(foe.hp < MAX_HP || !foe.alive, 'the enemy sets it off');

  const t = teamWorld();
  const owner = t.addPlayer('a', 'A', 'petya', false, { ...PISTOL_ONLY, gadget: 'turret' }, 0);
  const friend = t.addPlayer('m', 'M', 'valuta', false, PISTOL_ONLY, 0);
  const enemy = t.addPlayer('f', 'F', 'uchastkovy', false, PISTOL_ONLY, 1);
  start(t);
  t.spawnPlayer(owner, false);
  place(owner, 100, 150);
  place(friend, 220, 150);
  place(enemy, 560, 280);
  t.applyInput('a', input({ buttons: BTN.GADGET, aimRad: 0 }));
  t.applyInput('a', input({ aimRad: 0 }));
  run(t, GADGETS.turret.fuseMs + 2000);
  assert.equal(friend.hp, MAX_HP, 'the turret never fires at the owner’s teammate');
  place(enemy, 240, 200);
  run(t, 1500);
  assert.ok(enemy.hp < MAX_HP || !enemy.alive, 'the turret fires at the enemy');
});

test('teams: eliminations count for the team; the team limit ends the match; standings group the winners', () => {
  const w = teamWorld('teams', { teamScoreLimit: 2 });
  const a = w.addPlayer('a', 'A', 'petya', false, PISTOL_ONLY, 0);
  const b = w.addPlayer('b', 'B', 'valuta', false, PISTOL_ONLY, 1);
  const c = w.addPlayer('c', 'C', 'mihalych', false, PISTOL_ONLY, 1);
  start(w);
  w.applyDamage(b, a, 200, 'pistol');
  assert.deepEqual(w.teamScore, [1, 0]);
  assert.equal(w.phase, 'active');
  w.applyDamage(c, a, 200, 'pistol');
  assert.deepEqual(w.teamScore, [2, 0]);
  assert.equal(w.phase, 'finished');
  assert.equal(w.endReason, 'score');
  assert.deepEqual(w.teamResult(), { scores: [2, 0], winner: 0 });
  const st = w.standings();
  assert.equal(st[0]!.id, 'a');
  assert.equal(st[0]!.team, 0);
  assert.equal(st[0]!.place, 1);
  assert.deepEqual(st.slice(1).map((s) => s.place), [2, 2]);
});

test('teams: a draw gives everyone first place; individual points do not end a team match', () => {
  const w = teamWorld('teams', { scoreLimit: 2 });
  const a = w.addPlayer('a', 'A', 'petya', false, PISTOL_ONLY, 0);
  const b = w.addPlayer('b', 'B', 'valuta', false, PISTOL_ONLY, 1);
  start(w);
  w.applyDamage(b, a, 200, 'pistol');
  assert.equal(w.phase, 'active', 'the FFA score limit does not apply');
  w.spawnPlayer(b, false);
  b.invulnUntil = 0;
  w.applyDamage(a, b, 200, 'pistol');
  w.finish('time');
  assert.equal(w.teamResult().winner, null);
  assert.deepEqual(w.standings().map((s) => s.place), [1, 1]);
});

test('teams: each team starts on its own half of the map', () => {
  for (const id of MAP_ORDER) {
    const m = getMap(id);
    const w = new World(m, getCollision(id), { lagCompensation: false, config: { mode: 'teams', countdownMs: 1000, readyMs: 0 } });
    for (let i = 0; i < 10; i++) w.addPlayer(`p${i}`, `P${i}`, 'petya');
    w.beginMatch(true);
    const mid = m.width / 2;
    for (const p of w.players.values()) {
      assert.ok(p.alive);
      if (p.team === 0) assert.ok(p.x < mid, `${id}: red spawns on the left (${p.x})`);
      else assert.ok(p.x >= mid, `${id}: blue spawns on the right (${p.x})`);
    }
    // ten players never share a spawn point at the start
    const spots = new Set([...w.players.values()].map((p) => `${p.x},${p.y}`));
    assert.equal(spots.size, 10, `${id}: distinct start points`);
  }
});

test('maps: enough spawn points for 10 players, at least 6 on each half', () => {
  for (const id of MAP_ORDER) {
    const m = getMap(id);
    assert.ok(m.spawns.length >= 12, `${id}: ${m.spawns.length} spawns`);
    const left = m.spawns.filter((s) => s.x < m.width / 2).length;
    assert.ok(left >= 6 && m.spawns.length - left >= 6, `${id}: ${left} / ${m.spawns.length - left}`);
  }
});

test('teams: respawns prefer the home side when the enemy is spread out', () => {
  const m = getMap('factory');
  const w = new World(m, getCollision('factory'), { lagCompensation: false, config: { mode: 'teams', countdownMs: 0, readyMs: 0 } });
  const me = w.addPlayer('me', 'Me', 'petya', false, PISTOL_ONLY, 0);
  const foe = w.addPlayer('foe', 'Foe', 'valuta', false, PISTOL_ONLY, 1);
  start(w);
  me.alive = false;
  place(foe, m.width - 60, m.height / 2);
  let left = 0;
  for (let k = 0; k < 20; k++) if (m.spawns[w.chooseSpawn('me')]!.x < m.width / 2) left++;
  assert.ok(left >= 18, `red respawns on its own half (${left}/20)`);
});

test('bots never shoot their teammates', () => {
  const m = getMap('factory');
  const w = new World(m, getCollision('factory'), { lagCompensation: false, config: { mode: 'teams', countdownMs: 0, readyMs: 0, spawnProtectionMs: 0 } });
  const nav = new NavGrid(w.collision);
  const ids = ['b0', 'b1', 'b2'];
  for (const id of ids) w.addPlayer(id, id, 'petya', true, { ...PISTOL_ONLY, primary: 'avtomat' }, 0);
  const brains = ids.map((id, i) => new BotBrain(id, w, nav, 'hard', 10 + i));
  start(w);
  // the match start evens the teams out: put all three back on red
  for (const id of ids) w.setTeam(id, 0);
  const p = ids.map((id) => w.players.get(id)!);
  place(p[0]!, 300, 300);
  place(p[1]!, 360, 300);
  place(p[2]!, 300, 360);
  const ev: WorldEvent[] = [];
  for (let t = 0; t < 4000; t += TICK_MS) {
    for (const b of brains) w.applyInput(b.id, b.nextInput());
    w.update();
    ev.push(...w.drainEvents());
  }
  assert.equal(ev.filter((e) => e.t === 'damage').length, 0, 'no damage among teammates');
  assert.equal(ev.filter((e) => e.t === 'shot').length, 0, 'they do not even shoot');
});

test('codec v5: team per player and team scores survive a snapshot round-trip', () => {
  assert.equal(PROTOCOL_VERSION, 5);
  const w = teamWorld();
  const a = w.addPlayer('a', 'A', 'petya', false, PISTOL_ONLY, 0);
  const b = w.addPlayer('b', 'B', 'valuta', false, PISTOL_ONLY, 1);
  start(w);
  w.applyDamage(b, a, 200, 'pistol');
  const snap = decodeSnapshot(
    encodeSnapshot({ tick: w.tick, time: w.time, phase: w.phase, phaseRemaining: 1000, teamScore: w.teamScore, players: w.players.values(), pickups: w.pickups, gadgets: w.gadgets, events: [], now: w.time }),
  );
  assert.deepEqual(snap.teamScore, [1, 0]);
  const byId = new Map(snap.players.map((p) => [p.slot, p.team] as [number, Team | null]));
  assert.equal(byId.get(a.slot), 0);
  assert.equal(byId.get(b.slot), 1);
  const f = teamWorld('ffa');
  f.addPlayer('x', 'X', 'petya');
  const s2 = decodeSnapshot(encodeSnapshot({ tick: 1, time: 1, phase: 'waiting', phaseRemaining: 0, players: f.players.values(), pickups: [], gadgets: [], events: [], now: 1 }));
  assert.equal(s2.players[0]!.team, null);
  assert.deepEqual(s2.teamScore, [0, 0]);
});

test('protocol v5: mode and team messages are validated', () => {
  assert.equal(ClientMessageSchema.safeParse({ type: 'mode', mode: 'teams' }).success, true);
  assert.equal(ClientMessageSchema.safeParse({ type: 'mode', mode: 'ctf' }).success, false);
  assert.equal(ClientMessageSchema.safeParse({ type: 'team', team: 1 }).success, true);
  assert.equal(ClientMessageSchema.safeParse({ type: 'team', team: 2 }).success, false);
});
