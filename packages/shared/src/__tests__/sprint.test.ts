import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPRINT, TICK_MS, RUN_SPEED } from '../constants/game.js';
import { encodeSnapshot, decodeSnapshot, encodeInputs, decodeInputs } from '../net/codec.js';
import { makeWorld, startDuel, input, BTN } from './helpers.js';

/** Moves player a along +x for `ms` with the given buttons and returns how far it went. */
function run(w: ReturnType<typeof makeWorld>, ms: number, buttons: number): number {
  const p = w.players.get('a')!;
  const x0 = p.x;
  for (let t = 0; t < ms; t += TICK_MS) {
    w.applyInput('a', input({ moveX: 127, buttons }));
    w.update();
  }
  return p.x - x0;
}

test('v0.2.20 sprint: faster than a run while the breath lasts', () => {
  const w = makeWorld();
  const { p1 } = startDuel(w, { x: 20, y: 40 }, { x: 380, y: 280 });
  const plain = run(w, 500, 0);
  p1.x = 20;
  p1.vx = 0;
  const sprint = run(w, 500, BTN.SPRINT);
  assert.ok(sprint > plain * 1.2, `sprint ${sprint.toFixed(1)} vs run ${plain.toFixed(1)}`);
  assert.ok(p1.sprinting);
  assert.ok(p1.stamina < SPRINT.max && p1.stamina > SPRINT.max - SPRINT.drainPerSec * 0.6);
});

test('v0.2.20 sprint: the breath runs out after about three seconds, rests, then comes back', () => {
  const w = makeWorld();
  const { p1 } = startDuel(w, { x: 20, y: 40 }, { x: 380, y: 280 });
  const p = p1;
  let ticks = 0;
  // run back and forth so the wall never stops it
  while (p.stamina > 0 && ticks < 600) {
    p.x = 40;
    w.applyInput('a', input({ moveX: 127, buttons: BTN.SPRINT }));
    w.update();
    ticks++;
  }
  const seconds = (ticks * TICK_MS) / 1000;
  assert.ok(Math.abs(seconds - SPRINT.max / SPRINT.drainPerSec) < 0.2, `ran out after ${seconds.toFixed(2)} s`);
  // out of breath: holding the button only runs (the extra speed eases off over a few ticks)
  for (let i = 0; i < 12; i++) {
    p.x = 40;
    w.applyInput('a', input({ moveX: 127, buttons: BTN.SPRINT }));
    w.update();
  }
  assert.equal(p.sprinting, false);
  assert.ok(Math.hypot(p.vx, p.vy) <= RUN_SPEED + 1);
  // the rest before it comes back, then it refills
  // (the rest counts from the last sprinting tick: the 12 above are part of it)
  for (let t = 12 * TICK_MS; t < SPRINT.regenDelayMs - 100; t += TICK_MS) {
    w.applyInput('a', input({}));
    w.update();
  }
  assert.ok(p.stamina < 1, 'still resting');
  for (let t = 0; t < 1000; t += TICK_MS) {
    w.applyInput('a', input({}));
    w.update();
  }
  assert.ok(p.stamina > SPRINT.regenPerSec * 0.8, `back to ${p.stamina.toFixed(1)}`);
  // a new sprint needs a little breath (no stutter at the bottom of the bar)
  p.stamina = SPRINT.minToStart - 1;
  p.sprinting = false;
  p.staminaRegenAt = p.clock + 10_000;
  w.applyInput('a', input({ moveX: 127, buttons: BTN.SPRINT }));
  w.update();
  assert.equal(p.sprinting, false);
});

test('v0.2.20 sprint: firing and walking stop it; a creeping stick does not sprint', () => {
  const w = makeWorld();
  const { p1 } = startDuel(w, { x: 20, y: 40 }, { x: 380, y: 280 });
  w.applyInput('a', input({ moveX: 127, buttons: BTN.SPRINT | BTN.FIRE }));
  w.update();
  assert.equal(p1.sprinting, false, 'firing');
  w.applyInput('a', input({ moveX: 127, buttons: BTN.SPRINT | BTN.WALK }));
  w.update();
  assert.equal(p1.sprinting, false, 'walking');
  w.applyInput('a', input({ moveX: 40, buttons: BTN.SPRINT }));
  w.update();
  assert.equal(p1.sprinting, false, 'a light touch of the stick');
  w.applyInput('a', input({ moveX: 127, buttons: BTN.SPRINT }));
  w.update();
  assert.equal(p1.sprinting, true);
});

test('v0.2.20 sprint: the button and the breath travel on the wire; a respawn refills it', () => {
  const frames = decodeInputs(encodeInputs([input({ moveX: 127, buttons: BTN.SPRINT | BTN.FIRE })]));
  assert.equal(frames[0]!.buttons, BTN.SPRINT | BTN.FIRE);
  const w = makeWorld();
  const { p1 } = startDuel(w, { x: 20, y: 40 }, { x: 380, y: 280 });
  run(w, 400, BTN.SPRINT);
  const snap = decodeSnapshot(encodeSnapshot({ tick: w.tick, time: w.time, phase: w.phase, phaseRemaining: 0, players: w.players.values(), pickups: w.pickups, gadgets: w.gadgets, events: [], now: w.time }));
  const np = snap.players.find((p) => p.slot === p1.slot)!;
  assert.equal(np.sprinting, true);
  assert.ok(Math.abs(np.stamina - p1.stamina) < 0.5, `${np.stamina} vs ${p1.stamina}`);
  assert.ok(np.staminaRegenIn > 0 && np.staminaRegenIn <= SPRINT.regenDelayMs);
  // dead and back: a full breath
  w.applyDamage(p1, null, 500, 'pistol');
  assert.equal(p1.sprinting, false);
  w.spawnPlayer(p1, false);
  assert.equal(p1.stamina, SPRINT.max);
});
