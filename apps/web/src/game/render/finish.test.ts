import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINISH_IDS, FINISHES, LIVE_FINISHES } from '@blatkom/shared';
import type { FinishId } from '@blatkom/shared';
import { paintFinish } from './finish.js';

/** A stand-in weapon: a 64×20 rifle-ish silhouette with an outline, shading and a transparent background. */
function rifle(): { px: Uint8ClampedArray; w: number; h: number } {
  const w = 64;
  const h = 20;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const body = y >= 4 && y <= 10;
      const mag = x >= 30 && x <= 36 && y > 10 && y <= 18;
      const stock = x < 14 && y >= 3 && y <= 14;
      if (!body && !mag && !stock) continue;
      const edge = y === 4 || y === 10 || x === 0 || x === w - 1;
      const v = edge ? 20 : 90 + ((x * 7 + y * 13) % 90);
      const i = (y * w + x) * 4;
      px[i] = v;
      px[i + 1] = v;
      px[i + 2] = v;
      px[i + 3] = 255;
    }
  }
  return { px, w, h };
}

const painted = (f: FinishId, phase = 0) => {
  const r = rifle();
  paintFinish(r.px, r.w, r.h, f, phase);
  return r.px;
};

test('every finish paints the weapon and leaves its transparency alone', () => {
  const plain = rifle().px;
  for (const f of FINISH_IDS) {
    const px = painted(f);
    let changed = 0;
    for (let i = 0; i < px.length; i += 4) {
      assert.equal(px[i + 3], plain[i + 3], `${f}: alpha untouched`);
      if (plain[i + 3] === 0) assert.ok(px[i] === 0 && px[i + 1] === 0 && px[i + 2] === 0, `${f}: the background stays empty`);
      else if (px[i] !== plain[i] || px[i + 1] !== plain[i + 1] || px[i + 2] !== plain[i + 2]) changed++;
    }
    assert.ok(changed > 200, `${f}: painted (${changed} pixels)`);
  }
});

test('v0.2.19: a live finish moves through its loop and comes back to where it started; the others stand still', () => {
  assert.equal(LIVE_FINISHES.length, 4);
  for (const f of FINISH_IDS) {
    const a = painted(f, 0);
    const b = painted(f, 0.37);
    const differs = a.some((x, i) => x !== b[i]);
    assert.equal(differs, !!FINISHES[f].live, `${f}: ${FINISHES[f].live ? 'animated' : 'still'}`);
  }
  for (const f of LIVE_FINISHES) {
    // the loop is seamless: the phase just before 1 is close to the phase 0 (no jump when it wraps)
    const a = painted(f, 0);
    const z = painted(f, 0.999);
    let far = 0;
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i]! - z[i]!) + Math.abs(a[i + 1]! - z[i + 1]!) + Math.abs(a[i + 2]! - z[i + 2]!) > 30) far++;
    assert.ok(far < 12, `${f}: wraps without a jump (${far} pixels differ)`);
  }
});

test('a finish this build does not know (a newer server\'s) leaves the plain weapon', () => {
  const r = rifle();
  const before = r.px.slice();
  paintFinish(r.px, r.w, r.h, 'from_the_future' as FinishId);
  assert.deepEqual(r.px, before);
});
