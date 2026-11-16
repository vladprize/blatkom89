import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerfWatch, PERF_WATCH, LOWEST, qualityOf, stepDown } from './watch.js';
import type { QualityLevel } from './watch.js';

/** Runs the watch at a steady frame rate for a while; returns the moments (ms) it asked for a step down. */
function run(w: PerfWatch, from: number, ms: number, fps: number, paused = false): number[] {
  const out: number[] = [];
  const dt = 1000 / fps;
  for (let t = from; t <= from + ms + 1e-6; t += dt) if (w.frame(t, paused)) out.push(Math.round(t - from));
  return out;
}

test('the ladder: «Кино» → «Баланс» → «Быстро» → without the finish pass, and no further', () => {
  const steps: QualityLevel[] = [];
  let l: QualityLevel | null = 2;
  while (l !== null) {
    steps.push(l);
    l = stepDown(l);
  }
  assert.deepEqual(steps, [2, 1, 0, -1]);
  assert.equal(stepDown(LOWEST), null);
});

test('a stored quality is a step of the ladder or the fallback', () => {
  for (const v of [2, 1, 0, -1] as const) assert.equal(qualityOf(v, 1), v);
  for (const v of [3, -2, 1.5, '2', null, undefined, NaN, {}]) assert.equal(qualityOf(v, 1), 1, String(v));
});

test('a smooth match never steps down', () => {
  assert.deepEqual(run(new PerfWatch(), 0, 60_000, 60), []);
  assert.deepEqual(run(new PerfWatch(), 0, 60_000, 40), [], 'just above the floor');
});

test('a slow device steps down after the grace and four slow seconds in a row, then every four', () => {
  const at = run(new PerfWatch(), 0, 20_000, 20);
  assert.ok(at.length >= 3, `steps: ${at.join(', ')}`);
  const first = at[0]!;
  assert.ok(first >= PERF_WATCH.graceMs + (PERF_WATCH.seconds - 1) * 1000, `not before the grace and the count (${first} ms)`);
  assert.ok(first <= PERF_WATCH.graceMs + (PERF_WATCH.seconds + 1) * 1000 + 100, `soon after them (${first} ms)`);
  for (let i = 1; i < at.length; i++) {
    const d = at[i]! - at[i - 1]!;
    assert.ok(d >= PERF_WATCH.seconds * 1000 - 100 && d <= PERF_WATCH.seconds * 1000 + 200, `the count starts over after a step (${d} ms)`);
  }
});

test('a few slow seconds between smooth ones do not count', () => {
  const w = new PerfWatch();
  let t = 0;
  const steps: number[] = [];
  const go = (ms: number, fps: number) => {
    steps.push(...run(w, t, ms, fps));
    t += ms + 1000 / fps;
  };
  go(5000, 60);
  for (let i = 0; i < 6; i++) {
    go(3000, 20); // three slow seconds…
    go(1500, 60); // …and a smooth one: the count starts over
  }
  assert.deepEqual(steps, []);
});

test('the pause menu, a hidden tab and a stall are not a slow device', () => {
  assert.deepEqual(run(new PerfWatch(), 0, 30_000, 20, true), [], 'paused');
  // a tab that comes back every five seconds for a frame
  const w = new PerfWatch();
  const steps: number[] = [];
  for (let t = 0; t < 120_000; t += 5000) if (w.frame(t, false)) steps.push(t);
  assert.deepEqual(steps, [], 'hidden');
  // smooth, a ten-second stall, smooth again
  const s = new PerfWatch();
  assert.deepEqual([...run(s, 0, 8000, 60), ...run(s, 18_000, 8000, 60)], [], 'a stall');
  // three slow seconds counted, a stall, three more: two short runs, not one long one
  const m = new PerfWatch();
  const a = run(m, 0, PERF_WATCH.graceMs + 2200, 20);
  const b = run(m, PERF_WATCH.graceMs + 2200 + 6000, 3200, 20);
  assert.deepEqual([...a, ...b], [], 'a stall starts the count over');
  // …and without the stall the same six seconds are one long run
  const n = new PerfWatch();
  assert.equal(run(n, 0, PERF_WATCH.graceMs + 5400, 20).length, 1, 'no stall: one step');
});

test('a very slow device (a frame every 400 ms) is still seen as slow, not as stalled', () => {
  const at = run(new PerfWatch(), 0, 20_000, 2.5);
  assert.ok(at.length >= 1, `steps: ${at.join(', ')}`);
});
