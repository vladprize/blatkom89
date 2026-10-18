import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, input, startDuel, BTN, PISTOL_ONLY } from './helpers.js';
import { MAX_HP, TICK_MS } from '../constants/game.js';
import { GADGETS, TURRET, armsAt, armsIndex, GADGET_IDS } from '../game-rules/gadgets.js';
import type { GadgetId } from '../game-rules/gadgets.js';
import { WEAPON_IDS } from '../game-rules/weapons.js';
import type { Loadout } from '../game-rules/loadout.js';
import { encodeInputs, decodeInputs, encodeSnapshot, decodeSnapshot } from '../net/codec.js';
import type { World, WorldEvent } from '../sim/world.js';

const withGadget = (gadget: GadgetId): Loadout => ({ ...PISTOL_ONLY, gadget });

/** Presses the equipment button once (press + release). */
function useGadget(w: World, id: string, aimRad = 0) {
  w.applyInput(id, input({ buttons: BTN.GADGET, aimRad }));
  w.applyInput(id, input({ aimRad }));
}

/** Runs the world for `ms`, collecting events. */
function run(w: World, ms: number): WorldEvent[] {
  const out: WorldEvent[] = [];
  for (let t = 0; t < ms; t += TICK_MS) {
    w.update();
    out.push(...w.drainEvents());
  }
  return out;
}

function duel(gadget: GadgetId, a = { x: 60, y: 50 }, b = { x: 160, y: 50 }) {
  const w = makeWorld();
  const { p1, p2 } = startDuel(w, a, b, [withGadget(gadget), PISTOL_ONLY]);
  w.spawnPlayer(p1, false);
  Object.assign(p1, { ...a, invulnUntil: 0, vx: 0, vy: 0 });
  Object.assign(p2, { ...b, invulnUntil: 0, hp: MAX_HP });
  w.drainEvents();
  return { w, p1, p2 };
}

test('equipment: arms ids share one wire index space with weapons', () => {
  for (const g of GADGET_IDS) assert.equal(armsAt(armsIndex(g)), g);
  for (const wpn of WEAPON_IDS) assert.equal(armsAt(armsIndex(wpn)), wpn);
  assert.ok(WEAPON_IDS.length + GADGET_IDS.length <= 255);
});

test('F-1 grenade: thrown, slides, explodes after the fuse; the thrower gets the kill; charges and cooldown', () => {
  const { w, p1, p2 } = duel('f1', { x: 40, y: 50 }, { x: 235, y: 62 });
  assert.equal(p1.gadgetCharges, GADGETS.f1.charges);
  useGadget(w, 'a');
  assert.equal(p1.gadgetCharges, 1);
  assert.equal(w.gadgets.length, 1);
  assert.equal(w.gadgets[0]!.phase, 'moving');
  // the cooldown blocks an immediate second throw
  useGadget(w, 'a');
  assert.equal(w.gadgets.length, 1);
  p2.hp = 60;
  const ev = run(w, GADGETS.f1.fuseMs + 100);
  assert.equal(w.gadgets.length, 0, 'exploded');
  assert.ok(ev.some((e) => e.t === 'boom' && e.weapon === 'f1'));
  const g = ev.find((e) => e.t === 'boom')!;
  assert.ok(g.t === 'boom' && g.x > 120 && g.x < 260, `slid to ${g.t === 'boom' ? g.x : '?'}`);
  assert.equal(p2.alive, false, 'a wounded player next to the blast is eliminated');
  assert.equal(p1.kills, 1);
  assert.ok(ev.some((e) => e.t === 'kill' && e.weapon === 'f1'));
  assert.equal(p1.hp, MAX_HP, 'the thrower was out of the blast');
});

test('F-1 grenade: bounces off walls and charges refill on respawn', () => {
  // wall block x 190..210; a throw from x=150 towards it comes back
  const { w, p1 } = duel('f1', { x: 160, y: 150 }, { x: 350, y: 260 });
  useGadget(w, 'a', 0);
  const g = w.gadgets[0]!;
  run(w, 600);
  assert.ok(g.x < 190, `bounced back to x=${g.x.toFixed(1)}`);
  run(w, 1500);
  assert.equal(p1.gadgetCharges, 1);
  p1.alive = false;
  w.spawnPlayer(p1, false);
  assert.equal(p1.gadgetCharges, GADGETS.f1.charges);
});

test('Molotov cocktail: shatters on a wall, burns everyone inside over time, walls protect', () => {
  const { w, p2 } = duel('molotov', { x: 120, y: 150 }, { x: 175, y: 120 });
  const p3 = w.addPlayer('c', 'Сыч', 'mihalych', false, PISTOL_ONLY);
  w.spawnPlayer(p3, false);
  Object.assign(p3, { x: 240, y: 150, invulnUntil: 0, hp: MAX_HP });
  useGadget(w, 'a', 0);
  const ev = run(w, 400);
  assert.ok(ev.some((e) => e.t === 'ignite'), 'shattered against the wall');
  const fire = w.gadgets.find((g) => g.kind === 'molotov')!;
  assert.equal(fire.phase, 'active');
  assert.ok(fire.x < 190);
  run(w, 2000);
  assert.ok(p2.hp < MAX_HP, `standing in the fire hurts (${p2.hp})`);
  assert.equal(p3.hp, MAX_HP, 'behind the wall the fire cannot reach');
  run(w, GADGETS.molotov.durationMs);
  assert.equal(w.gadgets.length, 0, 'burnt out');
});

test('smoke grenade: a cloud blocks sight lines (bots, turrets) for its duration', () => {
  // (thrown along the bottom edge of the test arena)
  const { w, p1 } = duel('smoke', { x: 40, y: 250 }, { x: 350, y: 250 });
  useGadget(w, 'a', 0);
  const ev = run(w, GADGETS.smoke.fuseMs + 100);
  assert.ok(ev.some((e) => e.t === 'smoke'));
  const cloud = w.gadgets[0]!;
  assert.equal(cloud.phase, 'active');
  assert.ok(w.smokeBlocks(cloud.x - 150, cloud.y, cloud.x + 150, cloud.y), 'a line through the cloud is blocked');
  assert.ok(w.inSmoke(cloud.x + 10, cloud.y));
  assert.ok(!w.smokeBlocks(cloud.x - 150, cloud.y + 150, cloud.x + 150, cloud.y + 150), 'lines past it are clear');
  run(w, GADGETS.smoke.durationMs + 100);
  assert.equal(w.gadgets.length, 0);
  assert.equal(p1.gadgetCharges, 1);
});

test('flashbang: blinds longer when close and facing it; walls protect', () => {
  const { w, p2 } = duel('flash', { x: 40, y: 50 }, { x: 150, y: 70 });
  const p3 = w.addPlayer('c', 'Сыч', 'mihalych', false, PISTOL_ONLY);
  w.spawnPlayer(p3, false);
  Object.assign(p3, { x: 150, y: 185, invulnUntil: 0 });
  useGadget(w, 'a', 0);
  const g = w.gadgets[0]!;
  // p2 looks at the grenade's landing spot, the thrower looks away
  run(w, 600);
  p2.aim = Math.atan2(g.y - p2.y, g.x - p2.x);
  w.players.get('a')!.aim = Math.PI;
  const ev = run(w, GADGETS.flash.fuseMs);
  assert.ok(ev.some((e) => e.t === 'flashbang'));
  const p1 = w.players.get('a')!;
  assert.ok(p2.flashedUntil - w.time > p1.flashedUntil - w.time, 'facing it is worse than looking away');
  assert.ok(p2.flashedUntil > w.time + 1000);
  assert.ok(p3.flashedUntil <= w.time, 'the wall block shields the third player');
});

test('mine: arms, ignores its owner, a stepping opponent sets it off', () => {
  const { w, p1, p2 } = duel('mine', { x: 60, y: 250 }, { x: 330, y: 250 });
  assert.equal(p1.gadgetCharges, GADGETS.mine.charges);
  useGadget(w, 'a', 0);
  const mine = w.gadgets[0]!;
  assert.equal(mine.phase, 'armed');
  run(w, GADGETS.mine.fuseMs + 50);
  // the owner walks over it: nothing
  Object.assign(p1, { x: mine.x, y: mine.y });
  run(w, 300);
  assert.equal(w.gadgets.length, 1);
  Object.assign(p1, { x: 40, y: 50 });
  // an opponent walks in: beep, then boom
  Object.assign(p2, { x: mine.x + 20, y: mine.y });
  const ev = run(w, 400);
  assert.ok(ev.some((e) => e.t === 'beep'));
  assert.ok(ev.some((e) => e.t === 'boom' && e.weapon === 'mine'));
  assert.ok(p2.hp < MAX_HP - 60 || !p2.alive, `mine damage (${p2.hp})`);
  assert.equal(w.gadgets.length, 0);
});

test('C4: placed with the button, detonated with the same button after arming', () => {
  const { w, p1, p2 } = duel('c4', { x: 60, y: 250 }, { x: 330, y: 250 });
  useGadget(w, 'a', 0);
  assert.equal(w.gadgets.length, 1);
  assert.equal(p1.gadgetCharges, 0);
  const c4 = w.gadgets[0]!;
  // before arming the button does nothing
  useGadget(w, 'a', 0);
  assert.equal(w.gadgets.length, 1);
  run(w, GADGETS.c4.fuseMs + 50);
  Object.assign(p1, { x: 300, y: 60 });
  Object.assign(p2, { x: c4.x + 30, y: c4.y });
  useGadget(w, 'a', 0);
  assert.equal(w.gadgets.length, 0, 'detonated');
  assert.equal(p2.alive, false, '150 at the centre');
  assert.equal(p1.kills, 1);
});

test('turret: deploys, shoots a visible opponent, can be shot down, credits the owner', () => {
  const { w, p1, p2 } = duel('turret', { x: 40, y: 250 }, { x: 300, y: 250 });
  useGadget(w, 'a', 0);
  const t = w.gadgets[0]!;
  assert.equal(t.kind, 'turret');
  assert.equal(t.hp, TURRET.hp);
  Object.assign(p1, { x: 40, y: 40 });
  const ev = run(w, 2500);
  const shots = ev.filter((e) => e.t === 'shot' && e.turret);
  assert.ok(shots.length >= 5, `turret fired ${shots.length} times`);
  assert.ok(p2.hp < MAX_HP || !p2.alive, 'the opponent took damage');
  assert.ok(ev.some((e) => e.t === 'damage' && e.weapon === 'turret' && e.attacker === p1.slot));
  // the opponent shoots it down with the pistol
  Object.assign(p2, { x: t.x + 60, y: t.y, alive: true, hp: MAX_HP, invulnUntil: w.time + 60_000 });
  let down = false;
  for (let i = 0; i < 400 && !down; i++) {
    w.applyInput('b', input({ buttons: i % 2 ? BTN.FIRE : 0, aimRad: Math.PI }));
    w.update();
    down = w.drainEvents().some((e) => e.t === 'turretDown');
  }
  assert.ok(down, 'turret destroyed by gunfire');
  assert.equal(w.gadgets.length, 0);
});

test('codec v4: equipment state and the gadget button survive the wire', () => {
  const { w, p1 } = duel('turret', { x: 40, y: 250 }, { x: 300, y: 250 });
  useGadget(w, 'a', 0.5);
  run(w, 800);
  p1.flashedUntil = w.time + 1234;
  const buf = encodeSnapshot({ tick: w.tick, time: w.time, phase: w.phase, phaseRemaining: 0, players: w.players.values(), pickups: w.pickups, gadgets: w.gadgets, events: [], now: w.time });
  const s = decodeSnapshot(buf);
  const me = s.players.find((p) => p.slot === p1.slot)!;
  assert.equal(me.gadget, 'turret');
  assert.equal(me.gadgetCharges, 0);
  assert.equal(me.flashedRemaining, 1234);
  assert.equal(s.gadgets.length, 1);
  const g = s.gadgets[0]!;
  assert.equal(g.kind, 'turret');
  assert.equal(g.owner, p1.slot);
  assert.equal(g.phase, 'active');
  assert.ok(Math.abs(g.x - w.gadgets[0]!.x) < 0.2);
  assert.ok(g.leftMs > 0 && g.leftMs <= GADGETS.turret.durationMs);
  const frames = decodeInputs(encodeInputs([input({ buttons: BTN.GADGET | BTN.FIRE })]));
  assert.equal(frames[0]!.buttons, BTN.GADGET | BTN.FIRE);
});
