import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, input, startDuel, BTN, testMap } from './helpers.js';
import { RUN_SPEED, WALK_SPEED, PLAYER_RADIUS, TICK_MS, MAX_HP } from '../constants/game.js';
import { WEAPONS } from '../game-rules/weapons.js';
import { SCORING } from '../game-rules/match.js';
import { World } from '../sim/world.js';
import { CollisionWorld } from '../maps/collision.js';

test('movement: diagonal input is normalized and never exceeds run speed', () => {
  const w = makeWorld();
  const { p1 } = startDuel(w, { x: 60, y: 60 }, { x: 350, y: 260 });
  for (let i = 0; i < 60; i++) {
    w.applyInput('a', input({ moveX: 127, moveY: 127 }));
    w.update();
    const s = Math.sqrt(p1.vx ** 2 + p1.vy ** 2);
    assert.ok(s <= RUN_SPEED + 1e-6, `speed ${s}`);
  }
  assert.ok(Math.abs(Math.sqrt(p1.vx ** 2 + p1.vy ** 2) - RUN_SPEED) < 1e-6);
});

test('movement: walk button limits speed', () => {
  const w = makeWorld();
  const { p1 } = startDuel(w, { x: 60, y: 150 }, { x: 350, y: 260 });
  for (let i = 0; i < 40; i++) w.applyInput('a', input({ moveX: 127, buttons: BTN.WALK }));
  assert.ok(Math.abs(p1.vx - WALK_SPEED) < 1e-6);
  assert.ok(p1.walking);
});

test('movement: acceleration and deceleration are bounded', () => {
  const w = makeWorld();
  const { p1 } = startDuel(w, { x: 60, y: 150 }, { x: 350, y: 260 });
  w.applyInput('a', input({ moveX: 127 }));
  assert.ok(p1.vx > 0 && p1.vx < RUN_SPEED, 'one tick does not reach full speed');
  for (let i = 0; i < 30; i++) w.applyInput('a', input({ moveX: 127 }));
  for (let i = 0; i < 30; i++) w.applyInput('a', input({}));
  assert.equal(p1.vx, 0);
});

test('collision: player slides along a wall instead of entering it', () => {
  const w = makeWorld();
  const { p1 } = startDuel(w, { x: 170, y: 120 }, { x: 350, y: 260 });
  // push right into the wall (x=190) while also moving down
  for (let i = 0; i < 60; i++) w.applyInput('a', input({ moveX: 127, moveY: 60 }));
  assert.ok(p1.x <= 190 - PLAYER_RADIUS + 0.01, `x=${p1.x}`);
  assert.ok(p1.y > 150, 'kept sliding down along the wall');
});

test('collision: corners and map bounds hold', () => {
  const w = makeWorld();
  const { p1 } = startDuel(w, { x: 30, y: 30 }, { x: 350, y: 260 });
  for (let i = 0; i < 120; i++) w.applyInput('a', input({ moveX: -127, moveY: -127 }));
  assert.ok(p1.x >= PLAYER_RADIUS - 0.01 && p1.y >= PLAYER_RADIUS - 0.01);
  const c = new CollisionWorld(testMap());
  assert.equal(c.overlapsCircle(p1.x, p1.y, PLAYER_RADIUS - 0.05), false);
});

test('collision: raycast stops at walls and reports normals', () => {
  const c = new CollisionWorld(testMap());
  const hit = c.raycast(50, 150, 1, 0, 400);
  assert.ok(hit);
  assert.ok(Math.abs(hit.t - 140) < 1e-6);
  assert.equal(hit.nx, -1);
  assert.equal(c.lineOfSight(50, 150, 350, 150), false);
  assert.equal(c.lineOfSight(50, 50, 350, 50), true);
});

test('weapons: fire interval is enforced and ammo is consumed', () => {
  const w = makeWorld();
  const { p1 } = startDuel(w, { x: 60, y: 50 }, { x: 350, y: 260 });
  let shots = 0;
  for (let i = 0; i < 60; i++) {
    w.applyInput('a', input({ buttons: BTN.FIRE, aimRad: 0 }));
    shots += w.drainEvents().filter((e) => e.t === 'shot').length;
  }
  // 1s of holding: pistol 290ms interval => 4 shots (t=0, 290, 580, 870)
  assert.equal(shots, 4);
  assert.equal(p1.sideMag, WEAPONS.pistol.magazine - 4);
});

test('weapons: reload refills magazine after reloadMs; pistol reserve is infinite', () => {
  const w = makeWorld();
  const { p1 } = startDuel(w, { x: 60, y: 50 }, { x: 350, y: 260 });
  p1.sideMag = 0;
  w.applyInput('a', input({ buttons: BTN.RELOAD }));
  assert.equal(p1.reloadWeapon, 'pistol');
  const ticks = Math.ceil(WEAPONS.pistol.reloadMs / TICK_MS);
  for (let i = 0; i < ticks; i++) w.applyInput('a', input({}));
  assert.equal(p1.reloadWeapon, null);
  assert.equal(p1.sideMag, WEAPONS.pistol.magazine);
});

test('weapons: empty magazine triggers reload; firing during reload is blocked', () => {
  const w = makeWorld();
  const { p1 } = startDuel(w, { x: 60, y: 50 }, { x: 350, y: 260 });
  p1.sideMag = 1;
  w.applyInput('a', input({ buttons: BTN.FIRE }));
  assert.equal(p1.sideMag, 0);
  assert.equal(p1.reloadWeapon, 'pistol');
  w.drainEvents();
  for (let i = 0; i < 20; i++) w.applyInput('a', input({ buttons: BTN.FIRE }));
  assert.equal(w.drainEvents().filter((e) => e.t === 'shot').length, 0);
});

test('combat: hitscan damages, eliminates, scores and respawns', () => {
  const w = makeWorld();
  const { p1, p2 } = startDuel(w, { x: 60, y: 50 }, { x: 160, y: 50 });
  let killed = false;
  for (let i = 0; i < 200 && !killed; i++) {
    w.applyInput('a', input({ buttons: BTN.FIRE, aimRad: 0 }));
    w.update();
    killed = w.drainEvents().some((e) => e.t === 'kill');
  }
  assert.ok(killed, 'p2 eliminated');
  assert.equal(p2.alive, false);
  assert.equal(p2.deaths, 1);
  assert.equal(p1.kills, 1);
  assert.equal(p1.score, SCORING.killPoints);
  // respawn after delay
  const ticks = Math.ceil(w.config.respawnDelayMs / TICK_MS) + 1;
  for (let i = 0; i < ticks; i++) w.update();
  assert.equal(p2.alive, true);
  assert.equal(p2.hp, MAX_HP);
});

test('combat: walls block shots', () => {
  const w = makeWorld();
  const { p2 } = startDuel(w, { x: 150, y: 150 }, { x: 250, y: 150 });
  for (let i = 0; i < 120; i++) {
    w.applyInput('a', input({ buttons: BTN.FIRE, aimRad: 0 }));
    w.update();
  }
  assert.equal(p2.hp, MAX_HP);
});

test('combat: spawn protection blocks damage', () => {
  const w = makeWorld();
  const { p2 } = startDuel(w, { x: 60, y: 50 }, { x: 160, y: 50 });
  p2.invulnUntil = w.time + 10_000;
  for (let i = 0; i < 60; i++) w.applyInput('a', input({ buttons: BTN.FIRE, aimRad: 0 }));
  assert.equal(p2.hp, MAX_HP);
});

test('combat: melee hits in front within range only', () => {
  const w = makeWorld();
  const { p2 } = startDuel(w, { x: 60, y: 50 }, { x: 85, y: 50 });
  w.applyInput('a', input({ slot: 2, aimRad: Math.PI }));
  for (let i = 0; i < 12; i++) w.applyInput('a', input({ buttons: BTN.FIRE, aimRad: Math.PI }));
  assert.equal(p2.hp, MAX_HP, 'facing away: no hit');
  for (let i = 0; i < 40; i++) w.applyInput('a', input({ buttons: BTN.FIRE, aimRad: 0 }));
  assert.ok(p2.hp < MAX_HP || !p2.alive);
});

test('match: score limit ends the match; time limit ends the match', () => {
  const w = makeWorld();
  const { p1 } = startDuel(w);
  p1.score = w.config.scoreLimit - 1;
  const p2 = w.players.get('b')!;
  w.applyDamage(p2, p1, 500, 'pistol');
  assert.equal(w.phase, 'finished');
  assert.equal(w.endReason, 'score');

  const w2 = makeWorld();
  startDuel(w2);
  const ticks = Math.ceil(w2.config.durationMs / TICK_MS) + 2;
  for (let i = 0; i < ticks; i++) w2.update();
  assert.equal(w2.phase, 'finished');
  assert.equal(w2.endReason, 'time');
  assert.equal(w2.standings().length, 2);
});

test('pickups: walking over a weapon picks it up; death drops it', () => {
  const w = makeWorld();
  const { p1, p2 } = startDuel(w, { x: 90, y: 260 }, { x: 300, y: 50 });
  w.applyInput('a', input({ moveX: 127 }));
  assert.equal(p1.heavy, 'avtomat');
  assert.equal(p1.weapon, 'avtomat');
  assert.equal(p1.heavyMag, WEAPONS.avtomat.magazine);
  w.applyDamage(p1, p2, 1000, 'pistol');
  assert.equal(p1.heavy, null);
  assert.ok(w.pickups.some((pk) => pk.dropped && pk.weapon === 'avtomat'));
});

test('lag compensation: shots are tested against rewound positions', () => {
  const w = makeWorld(testMap(), true);
  const { p2 } = startDuel(w, { x: 60, y: 50 }, { x: 160, y: 50 });
  // record ~200ms of history with p2 standing in the line of fire
  for (let i = 0; i < 12; i++) w.update();
  const seenAt = w.time - 150;
  // p2 moves out of the line of fire
  p2.y = 120;
  for (let i = 0; i < 2; i++) w.update();
  w.applyInput('a', input({ buttons: BTN.FIRE, aimRad: 0, viewTime: seenAt }));
  const shot = w.drainEvents().find((e) => e.t === 'shot');
  assert.ok(shot && shot.t === 'shot');
  assert.equal(shot.pellets[0]!.hit, p2.slot, 'hit at rewound position');
});

test('scoring: recent meaningful damage by another player earns an assist; killer gets kill points', () => {
  const w = makeWorld();
  const { p1: killer, p2: victim } = startDuel(w, { x: 60, y: 50 }, { x: 160, y: 50 });
  const helper = w.addPlayer('c', 'Участковый', 'uchastkovy');
  helper.alive = true;
  helper.invulnUntil = 0;
  // helper softens the victim, killer finishes: helper +1 assist point, killer +2
  w.applyDamage(victim, helper, 30, 'pistol');
  w.applyDamage(victim, killer, 34, 'pistol'); // the killer's own earlier damage never counts as an assist
  w.applyDamage(victim, killer, 500, 'pistol');
  const kill = w.drainEvents().find((e) => e.t === 'kill');
  assert.ok(kill && kill.t === 'kill');
  assert.deepEqual(kill.assists, [helper.slot]);
  assert.equal(killer.kills, 1);
  assert.equal(killer.score, SCORING.killPoints);
  assert.equal(killer.assists, 0);
  assert.equal(helper.assists, 1);
  assert.equal(helper.score, SCORING.assistPoints);
  const st = w.standings();
  assert.equal(st.find((s) => s.id === 'c')!.assists, 1);

  // chip damage below the threshold is not an assist
  w.spawnPlayer(victim, false);
  victim.invulnUntil = 0;
  w.applyDamage(victim, helper, SCORING.assistMinDamage - 1, 'pistol');
  w.applyDamage(victim, killer, 500, 'pistol');
  assert.equal(helper.assists, 1);

  // damage older than the assist window is not an assist
  w.spawnPlayer(victim, false);
  victim.invulnUntil = 0;
  w.applyDamage(victim, helper, 40, 'pistol');
  for (let i = 0; i < Math.ceil(SCORING.assistWindowMs / TICK_MS) + 2; i++) w.update();
  victim.alive = true;
  victim.invulnUntil = 0;
  w.applyDamage(victim, killer, 500, 'pistol');
  assert.equal(helper.assists, 1);
  assert.equal(killer.kills, 3);
  assert.equal(killer.score, 3 * SCORING.killPoints);
});

test('scoring: an assist can reach the point limit and end the match', () => {
  const w = makeWorld();
  const { p1: killer, p2: victim } = startDuel(w, { x: 60, y: 50 }, { x: 160, y: 50 });
  const helper = w.addPlayer('c', 'Участковый', 'uchastkovy');
  helper.alive = true;
  helper.score = w.config.scoreLimit - SCORING.assistPoints;
  w.applyDamage(victim, helper, 50, 'pistol');
  w.applyDamage(victim, killer, 500, 'pistol');
  assert.equal(w.phase, 'finished');
  assert.equal(w.endReason, 'score');
  assert.equal(w.standings()[0]!.id, 'c');
});

test('supply drops: a full crate appears at a free supply point away from players and expires', () => {
  const map = testMap();
  const w = new World(map, new CollisionWorld(map), { lagCompensation: false, config: { countdownMs: 0, readyMs: 0, spawnProtectionMs: 0, supplyFirstMs: 1000, supplyIntervalMs: 60_000, supplyTtlMs: 2000 } });
  const { p1 } = startDuel(w, { x: 300, y: 80 }, { x: 350, y: 260 }); // p1 stands next to supply point (300,50)
  let ev = null;
  for (let i = 0; i < Math.ceil(1100 / TICK_MS) && !ev; i++) {
    w.update();
    ev = w.drainEvents().find((e) => e.t === 'supply') ?? null;
  }
  assert.ok(ev && ev.t === 'supply', 'supply event');
  assert.deepEqual([ev.x, ev.y], [120, 70], 'the point next to a player is skipped');
  const crate = w.pickups.find((pk) => pk.supply)!;
  assert.ok(crate.active);
  assert.equal(crate.reserve, WEAPONS[crate.weapon!].reserveMax, 'full ammunition');
  // walking onto it picks it up with full ammo
  p1.x = crate.x;
  p1.y = crate.y;
  w.applyInput('a', input({}));
  assert.equal(p1.heavy, crate.weapon);
  assert.equal(p1.heavyReserve, WEAPONS[crate.weapon!].reserveMax);
  assert.equal(crate.active, false, 'claimed crate is used up');
  w.update();
  assert.equal(w.pickups.includes(crate), false, 'and removed on the next tick');
  // an unclaimed crate expires
  const second = w.dropSupply();
  assert.ok(second);
  for (let i = 0; i < Math.ceil(2100 / TICK_MS); i++) w.update();
  assert.equal(w.pickups.includes(second), false);
});
