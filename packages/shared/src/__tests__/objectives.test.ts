import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../sim/world.js';
import type { PlayerState, WorldEvent } from '../sim/world.js';
import { CollisionWorld } from '../maps/collision.js';
import { getMap, getCollision, MAP_ORDER } from '../maps/index.js';
import { MapBuilder } from '../maps/builder.js';
import { PISTOL_ONLY } from './helpers.js';
import { MAX_HP, PLAYER_RADIUS, TICK_MS } from '../constants/game.js';
import { BASE_RULES, CTF_RULES, DEFAULT_MATCH_CONFIG, GAME_MODES, SCORING, isGameMode, isTeamMode, teamScoreLimitFor } from '../game-rules/match.js';
import type { GameMode, Team } from '../game-rules/match.js';
import { encodeSnapshot, decodeSnapshot } from '../net/codec.js';
import { ClientMessageSchema, PROTOCOL_VERSION } from '../net/protocol.js';
import { NavGrid } from '../sim/nav.js';
import { BotBrain } from '../sim/bots.js';
import { xpForMatch, XP_RULES } from '../game-rules/progression.js';

/** Open 800×300 arena: flag stands at both ends, bases A, B, C along the middle. */
function arena() {
  return new MapBuilder('factory', 'Arena', '', '', 800, 300, 'concrete_slab')
    .spawn(40, 60, 0)
    .spawn(40, 240, 0)
    .spawn(120, 150, 0)
    .spawn(760, 60, 180)
    .spawn(760, 240, 180)
    .spawn(680, 150, 180)
    .flagStand(0, 60, 150)
    .flagStand(1, 740, 150)
    .base(220, 150)
    .base(400, 150)
    .base(580, 150)
    .build();
}

function modeWorld(mode: GameMode, extra: Partial<typeof DEFAULT_MATCH_CONFIG> = {}) {
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

function run(w: World, ms: number): WorldEvent[] {
  const out: WorldEvent[] = [];
  for (let t = 0; t < ms; t += TICK_MS) {
    w.update();
    out.push(...w.drainEvents());
  }
  return out;
}

/** Red `r`, blue `b` (team set after the start, which balances the teams). */
function duel(mode: GameMode, extra: Partial<typeof DEFAULT_MATCH_CONFIG> = {}) {
  const w = modeWorld(mode, extra);
  w.addPlayer('r', 'R', 'petya', false, PISTOL_ONLY, 0);
  w.addPlayer('b', 'B', 'valuta', false, PISTOL_ONLY, 1);
  start(w);
  const r = w.players.get('r')!;
  const b = w.players.get('b')!;
  r.team = 0;
  b.team = 1;
  place(r, 300, 40);
  place(b, 500, 260);
  return { w, r, b };
}

const flagOf = (w: World, team: Team) => w.flags.find((f) => f.team === team)!;

test('modes: four modes, all but free-for-all are team modes; the score limit follows the mode', () => {
  assert.deepEqual([...GAME_MODES], ['ffa', 'teams', 'ctf', 'bases']);
  assert.ok(isGameMode('ctf') && isGameMode('bases') && !isGameMode('koth'));
  assert.equal(isTeamMode('ffa'), false);
  assert.ok(isTeamMode('teams') && isTeamMode('ctf') && isTeamMode('bases'));
  assert.equal(teamScoreLimitFor({ ...DEFAULT_MATCH_CONFIG, mode: 'ctf' }), DEFAULT_MATCH_CONFIG.captureLimit);
  assert.equal(teamScoreLimitFor({ ...DEFAULT_MATCH_CONFIG, mode: 'bases' }), DEFAULT_MATCH_CONFIG.baseScoreLimit);
  assert.equal(teamScoreLimitFor({ ...DEFAULT_MATCH_CONFIG, mode: 'teams' }), DEFAULT_MATCH_CONFIG.teamScoreLimit);
  assert.equal(teamScoreLimitFor({ ...DEFAULT_MATCH_CONFIG, mode: 'ffa' }), 0);
  assert.ok(PROTOCOL_VERSION >= 6, "objective modes came with protocol 6");
  for (const mode of GAME_MODES) assert.ok(ClientMessageSchema.safeParse({ type: 'mode', mode }).success);
});

test('maps: every map has a flag stand in each half and three bases, open and reachable', () => {
  for (const id of MAP_ORDER) {
    const m = getMap(id);
    const c = getCollision(id);
    const nav = new NavGrid(c);
    const reach = nav.flood(nav.index(m.spawns[0]!.x, m.spawns[0]!.y));
    assert.equal(m.flagStands.length, 2, `${id} flag stands`);
    assert.equal(m.bases.length, 3, `${id} bases`);
    const [red, blue] = m.flagStands as [{ x: number; y: number }, { x: number; y: number }];
    assert.ok(red.x < m.width * 0.25 && blue.x > m.width * 0.75, `${id}: flags deep in each half`);
    for (const p of [...m.flagStands, ...m.bases]) {
      assert.ok(p.x > 30 && p.y > 30 && p.x < m.width - 30 && p.y < m.height - 30, `${id}: inside the map`);
      assert.ok(!c.overlapsCircle(p.x, p.y, PLAYER_RADIUS + 8), `${id}: ${p.x},${p.y} is free`);
      assert.ok(reach[nav.index(p.x, p.y)], `${id}: ${p.x},${p.y} is reachable`);
    }
    // bases in order A (red side), B, C (blue side), with room between the zones
    const xs = m.bases.map((b) => b.x);
    assert.ok(xs[0]! < xs[1]! && xs[1]! < xs[2]!, `${id}: bases ordered left to right`);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(Math.hypot(m.bases[i]!.x - m.bases[j]!.x, m.bases[i]!.y - m.bases[j]!.y) > BASE_RULES.radius * 4, `${id}: bases apart`);
    // fair enough: the walk from each team's side to the enemy flag differs by under 15 %
    const side = (team: Team) => m.spawns.filter((s) => (team === 0 ? s.x < m.width / 2 : s.x >= m.width / 2));
    const walk = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const path = nav.findPath(a.x, a.y, b.x, b.y, 60000);
      assert.ok(path, `${id}: path`);
      let len = 0;
      let q = a;
      for (const s of path) {
        len += Math.hypot(s.x - q.x, s.y - q.y);
        q = s;
      }
      return len;
    };
    const avg = (team: Team, to: { x: number; y: number }) => side(team).reduce((s, p) => s + walk(p, to), 0) / side(team).length;
    const redRun = avg(0, blue);
    const blueRun = avg(1, red);
    assert.ok(Math.abs(redRun - blueRun) / Math.max(redRun, blueRun) < 0.15, `${id}: ${Math.round(redRun)} vs ${Math.round(blueRun)}`);
  }
});

test('ctf: the flags start at home; only ctf has flags and only bases has bases', () => {
  const ctf = modeWorld('ctf');
  assert.equal(ctf.flags.length, 2);
  assert.equal(ctf.bases.length, 0);
  assert.deepEqual(
    ctf.flags.map((f) => [f.team, f.status, f.x, f.y]),
    [
      [0, 'home', 60, 150],
      [1, 'home', 740, 150],
    ],
  );
  const bases = modeWorld('bases');
  assert.equal(bases.flags.length, 0);
  assert.deepEqual(
    bases.bases.map((b) => [b.x, b.y, b.owner]),
    [
      [220, 150, null],
      [400, 150, null],
      [580, 150, null],
    ],
  );
  assert.equal(modeWorld('teams').flags.length + modeWorld('teams').bases.length, 0);
});

test('ctf: take the enemy flag, carry it home and capture it', () => {
  const { w, r } = duel('ctf');
  const blueFlag = flagOf(w, 1);
  place(r, 735, 150);
  let ev = run(w, TICK_MS);
  assert.equal(blueFlag.status, 'carried');
  assert.equal(blueFlag.carrierId, 'r');
  assert.ok(ev.some((e) => e.t === 'flag' && e.action === 'taken' && e.team === 1 && e.slot === r.slot));
  assert.equal(r.score, CTF_RULES.takePoints);
  // the flag goes where the carrier goes
  place(r, 400, 100);
  run(w, TICK_MS);
  assert.deepEqual([blueFlag.x, blueFlag.y], [400, 100]);
  // at our own stand with our flag at home: captured
  place(r, 62, 152);
  ev = run(w, TICK_MS);
  assert.ok(ev.some((e) => e.t === 'flag' && e.action === 'captured' && e.team === 1 && e.slot === r.slot));
  assert.equal(blueFlag.status, 'home');
  assert.deepEqual([blueFlag.x, blueFlag.y], [740, 150]);
  assert.deepEqual(w.teamScore, [1, 0]);
  assert.equal(r.objectives, 1);
  assert.equal(r.score, CTF_RULES.takePoints + CTF_RULES.capturePoints);
});

test('ctf: no capture while your own flag is away; it counts once your flag is back', () => {
  const { w, r, b } = duel('ctf');
  place(r, 740, 150);
  place(b, 60, 150);
  run(w, TICK_MS);
  assert.equal(flagOf(w, 1).carrierId, 'r');
  assert.equal(flagOf(w, 0).carrierId, 'b');
  // red stands on its own (empty) stand: nothing
  place(r, 60, 150);
  place(b, 400, 280);
  run(w, 500);
  assert.deepEqual(w.teamScore, [0, 0]);
  // blue's carrier dies: red's flag falls, a red player returns it, then red's carrier scores
  w.applyDamage(b, r, MAX_HP, 'pistol');
  const red = flagOf(w, 0);
  assert.equal(red.status, 'dropped');
  assert.deepEqual([red.x, red.y], [400, 280]);
  place(r, 400, 280);
  const ev = run(w, TICK_MS);
  assert.ok(ev.some((e) => e.t === 'flag' && e.action === 'returned' && e.team === 0 && e.slot === r.slot));
  assert.equal(red.status, 'home');
  place(r, 60, 150);
  run(w, TICK_MS);
  assert.deepEqual(w.teamScore, [1, 0]);
});

test('ctf: a dropped flag goes home by itself; kills do not score for the team; killing the carrier pays a bonus', () => {
  const { w, r, b } = duel('ctf');
  place(r, 740, 150);
  run(w, TICK_MS);
  const before = b.score;
  w.applyDamage(r, b, MAX_HP, 'pistol');
  assert.equal(b.score - before, SCORING.killPoints + CTF_RULES.carrierKillPoints);
  assert.deepEqual(w.teamScore, [0, 0], 'eliminations are not the team score in ctf');
  const blue = flagOf(w, 1);
  assert.equal(blue.status, 'dropped');
  place(b, 400, 20); // far from it
  run(w, CTF_RULES.returnMs - 100);
  assert.equal(blue.status, 'dropped');
  const ev = run(w, 200);
  assert.equal(blue.status, 'home');
  assert.ok(ev.some((e) => e.t === 'flag' && e.action === 'returned' && e.team === 1 && e.slot === -1));
});

test('ctf: an enemy who touches a dropped flag picks it up again; a leaving carrier drops it', () => {
  const { w, r } = duel('ctf');
  place(r, 740, 150);
  run(w, TICK_MS);
  w.removePlayer('r');
  const blue = flagOf(w, 1);
  assert.equal(blue.status, 'dropped');
  const r2 = w.addPlayer('r2', 'R2', 'petya', false, PISTOL_ONLY, 0);
  r2.team = 0;
  place(r2, blue.x, blue.y);
  run(w, TICK_MS);
  assert.equal(blue.carrierId, 'r2');
  // a disconnected carrier (server marks the avatar dead) drops the flag too
  r2.connected = false;
  r2.alive = false;
  run(w, TICK_MS);
  assert.equal(blue.status, 'dropped');
});

test('ctf: three captures win the match', () => {
  const { w, r } = duel('ctf');
  for (let i = 0; i < DEFAULT_MATCH_CONFIG.captureLimit; i++) {
    place(r, 740, 150);
    run(w, TICK_MS);
    place(r, 60, 150);
    run(w, TICK_MS);
  }
  assert.equal(w.phase, 'finished');
  assert.equal(w.endReason, 'score');
  assert.deepEqual(w.teamResult(), { scores: [3, 0], winner: 0 });
  const rows = w.standings();
  assert.equal(rows.find((s) => s.id === 'r')!.objectives, 3);
  assert.equal(rows.find((s) => s.id === 'r')!.place, 1);
  assert.equal(rows.find((s) => s.id === 'b')!.place, 2);
});

test('bases: one player takes a neutral base in captureMs, two take it faster', () => {
  const { w, r, b } = duel('bases');
  const A = w.bases[0]!;
  place(r, A.x, A.y);
  run(w, BASE_RULES.captureMs - 100);
  assert.equal(A.owner, null);
  assert.equal(A.capturer, 0);
  assert.ok(A.progress > 0.9);
  const ev = run(w, 200);
  assert.equal(A.owner, 0);
  assert.equal(A.progress, 0);
  assert.ok(ev.some((e) => e.t === 'base' && e.base === 0 && e.team === 0 && e.from === null && e.slots.includes(r.slot)));
  assert.equal(r.objectives, 1);
  assert.ok(r.score >= BASE_RULES.capturePoints);
  // two blue players on C: 1.5× faster
  const b2 = w.addPlayer('b2', 'B2', 'valuta', false, PISTOL_ONLY, 1);
  b2.team = 1;
  const C = w.bases[2]!;
  place(b, C.x - 10, C.y);
  place(b2, C.x + 10, C.y);
  run(w, Math.ceil(BASE_RULES.captureMs / 1.5) + 50);
  assert.equal(C.owner, 1);
});

test('bases: contested bases do not move; an enemy pushes the bar back before taking it', () => {
  const { w, r, b } = duel('bases');
  const B = w.bases[1]!;
  place(r, B.x - 15, B.y);
  run(w, 3000);
  const half = B.progress;
  assert.ok(half > 0.4 && half < 0.6);
  place(b, B.x + 15, B.y);
  run(w, 2000);
  assert.equal(B.contested, true);
  assert.equal(B.progress, half);
  // red leaves: blue first empties red's bar, then fills its own
  place(r, 300, 20);
  run(w, 3000 + 100);
  assert.equal(B.capturer, 1);
  assert.equal(B.owner, null);
  run(w, BASE_RULES.captureMs);
  assert.equal(B.owner, 1);
  // nobody inside: an unfinished bar fades
  place(b, 700, 20);
  place(r, B.x, B.y);
  run(w, 2000);
  assert.equal(B.capturer, 0);
  place(r, 300, 20);
  run(w, 10_000);
  assert.equal(B.capturer, null);
  assert.equal(B.progress, 0);
  assert.equal(B.owner, 1);
});

test('bases: every base held scores a point a second; the limit ends the match', () => {
  const { w, r } = duel('bases', { baseScoreLimit: 12 });
  const A = w.bases[0]!;
  place(r, A.x, A.y);
  run(w, BASE_RULES.captureMs + 50);
  assert.equal(A.owner, 0);
  const s0 = w.teamScore[0];
  run(w, 3000);
  assert.ok(w.teamScore[0] - s0 >= 2 && w.teamScore[0] - s0 <= 3, `${w.teamScore[0] - s0}`);
  assert.equal(w.teamScore[1], 0);
  run(w, 12_000);
  assert.equal(w.phase, 'finished');
  assert.equal(w.endReason, 'score');
  assert.equal(w.teamResult().winner, 0);
});

test('objective modes: players come back on their own half', () => {
  for (const mode of ['ctf', 'bases'] as const) {
    const w = modeWorld(mode);
    w.addPlayer('r', 'R', 'petya', false, PISTOL_ONLY, 0);
    w.addPlayer('b', 'B', 'valuta', false, PISTOL_ONLY, 1);
    start(w);
    const r = w.players.get('r')!;
    const b = w.players.get('b')!;
    // even with the enemy camping the red side, red respawns on the red side
    for (let i = 0; i < 6; i++) {
      place(b, 80, 150);
      w.applyDamage(r, b, MAX_HP, 'pistol');
      run(w, DEFAULT_MATCH_CONFIG.respawnDelayMs + 50);
      assert.ok(r.alive && r.x < 400, `${mode}: red at ${r.x}`);
    }
  }
});

test('codec: flags, bases and objective counts survive a snapshot round trip', () => {
  const { w, r } = duel('ctf');
  place(r, 740, 150);
  run(w, TICK_MS);
  r.objectives = 2;
  const snap = decodeSnapshot(encodeSnapshot({ tick: w.tick, time: w.time, phase: w.phase, phaseRemaining: 1000, teamScore: w.teamScore, players: w.players.values(), pickups: w.pickups, gadgets: w.gadgets, flags: w.flags, bases: w.bases, events: [], now: w.time }));
  assert.deepEqual(
    snap.flags.map((f) => [f.team, f.status, f.carrier]),
    [
      [0, 'home', -1],
      [1, 'carried', r.slot],
    ],
  );
  assert.equal(snap.players.find((p) => p.slot === r.slot)!.objectives, 2);
  assert.deepEqual(snap.bases, []);
  const flag = flagOf(w, 1);
  w.applyDamage(r, w.players.get('b')!, MAX_HP, 'pistol');
  const s2 = decodeSnapshot(encodeSnapshot({ tick: w.tick, time: w.time, phase: w.phase, phaseRemaining: 1000, teamScore: w.teamScore, players: w.players.values(), pickups: w.pickups, gadgets: w.gadgets, flags: w.flags, bases: w.bases, events: [], now: w.time }));
  const f2 = s2.flags.find((f) => f.team === 1)!;
  assert.equal(f2.status, 'dropped');
  assert.ok(Math.abs(f2.x - flag.x) < 0.5 && Math.abs(f2.y - flag.y) < 0.5);
  assert.ok(f2.returnIn > CTF_RULES.returnMs - 100 && f2.returnIn <= CTF_RULES.returnMs);

  const d = duel('bases');
  const B = d.w.bases[1]!;
  place(d.r, B.x, B.y);
  place(d.b, B.x + 5, B.y);
  run(d.w, 100);
  place(d.b, 700, 20);
  run(d.w, 2000);
  const s3 = decodeSnapshot(encodeSnapshot({ tick: d.w.tick, time: d.w.time, phase: d.w.phase, phaseRemaining: 0, teamScore: d.w.teamScore, players: d.w.players.values(), pickups: d.w.pickups, gadgets: d.w.gadgets, flags: d.w.flags, bases: d.w.bases, events: [], now: d.w.time }));
  assert.equal(s3.bases.length, 3);
  assert.equal(s3.bases[1]!.capturer, 0);
  assert.ok(Math.abs(s3.bases[1]!.progress - B.progress) < 0.01);
  assert.deepEqual(s3.bases[1]!.inside, [1, 0]);
  assert.equal(s3.bases[0]!.owner, null);
});

test('xp: every flag or base captured is worth XP', () => {
  const base = { kills: 0, assists: 0, deaths: 0, place: 1, playersAtEnd: 4, completed: true, withFriends: false, teamOutcome: 'loss' as const };
  assert.equal(xpForMatch({ ...base, objectives: 2 }) - xpForMatch(base), 2 * XP_RULES.perObjective);
});

test('bots: in capture the flag they raid, in base capture they take bases', () => {
  for (const mode of ['ctf', 'bases'] as const) {
    const m = getMap('factory');
    const w = new World(m, getCollision('factory'), { lagCompensation: false, config: { mode, countdownMs: 0, readyMs: 0 }, seed: 7 });
    const nav = new NavGrid(w.collision);
    const brains: BotBrain[] = [];
    for (let i = 0; i < 6; i++) {
      w.addPlayer(`bot${i}`, `Bot ${i}`, 'petya', true, PISTOL_ONLY);
      brains.push(new BotBrain(`bot${i}`, w, nav, 'normal', 100 + i));
    }
    w.beginMatch(true);
    const seen = new Set<string>();
    for (let t = 0; t < 90_000 && w.phase !== 'finished'; t += TICK_MS) {
      for (const b of brains) w.applyInput(b.id, b.nextInput());
      w.update();
      for (const e of w.drainEvents()) if (e.t === 'flag') seen.add(e.action);
      else if (e.t === 'base') seen.add('base');
    }
    if (mode === 'ctf') assert.ok(seen.has('taken'), `ctf events: ${[...seen].join(',')}`);
    else assert.ok(seen.has('base') && w.teamScore[0] + w.teamScore[1] > 0, `bases: ${[...seen].join(',')} ${w.teamScore.join(':')}`);
  }
});
