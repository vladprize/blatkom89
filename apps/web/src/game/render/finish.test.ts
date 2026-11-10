import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINISH_IDS, FINISHES, LIVE_FINISHES } from '@blatkom/shared';
import type { FinishId } from '@blatkom/shared';
import { paintFinish } from './finish.js';

/** A small weapon-like sprite: transparent margin, a dark outline, metal grey and wood brown inside. */
function sprite(w = 48, h = 14): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 2; y < h - 2; y++) {
    for (let x = 3; x < w - 3; x++) {
      const i = (y * w + x) * 4;
      const edge = y === 2 || y === h - 3 || x === 3 || x === w - 4;
      const [r, g, b] = edge ? [12, 10, 9] : x < w / 2 ? [120, 120, 125] : [140, 80, 40];
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  return px;
}

const lum = (px: Uint8ClampedArray, i: number) => (0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!) / 255;

test('every finish repaints the weapon, keeps transparency and the dark outline, and is deterministic', () => {
  const base = sprite();
  const looks = new Set<string>();
  for (const f of FINISH_IDS) {
    const a = sprite();
    paintFinish(a, 48, 14, f);
    const b = sprite();
    paintFinish(b, 48, 14, f);
    assert.deepEqual(a, b, `${f} is deterministic`);
    let changed = 0;
    for (let i = 0; i < a.length; i += 4) {
      assert.equal(a[i + 3], base[i + 3], `${f}: alpha untouched`);
      if (base[i + 3] === 0) assert.deepEqual([a[i], a[i + 1], a[i + 2]], [0, 0, 0], `${f}: transparent pixels untouched`);
      else if (lum(base, i) < 0.11) assert.ok(lum(a, i) < 0.2, `${f}: the outline stays dark`);
      else if (a[i] !== base[i] || a[i + 1] !== base[i + 1] || a[i + 2] !== base[i + 2]) changed++;
    }
    assert.ok(changed > 300, `${f} repaints the body (${changed})`);
    looks.add(Buffer.from(a).toString('base64'));
  }
  assert.equal(looks.size, FINISH_IDS.length, 'every finish looks different');
});

test('the finishes have their colours: gold is yellow, gzhel is white and blue, malachite green, pioneer red', () => {
  const avg = (f: (typeof FINISH_IDS)[number]) => {
    const a = sprite();
    paintFinish(a, 48, 14, f);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] === 0 || lum(a, i) < 0.12) continue;
      r += a[i]!;
      g += a[i + 1]!;
      b += a[i + 2]!;
      n++;
    }
    return [r / n, g / n, b / n] as const;
  };
  const [gr, gg, gb] = avg('zoloto');
  assert.ok(gr > gb + 60 && gg > gb + 30, 'gold');
  const [zr, zg, zb] = avg('gzhel');
  assert.ok(zb > zr && zb > 150, 'gzhel: white and blue');
  assert.ok(zg > 100);
  const [mr, mg, mb] = avg('malahit');
  assert.ok(mg > mr + 40 && mg > mb, 'malachite');
  const [pr, pg, pb] = avg('pioner');
  assert.ok(pr > pg + 60 && pr > pb + 60, 'pioneer red');
  // v0.2.18 part 2: the owner's line
  const [cr, cg, cb] = avg('carsky');
  assert.ok(cr > cb + 60 && cg > cb + 20, 'tsar’s gold');
  const [kr, kg, kb] = avg('kontora');
  assert.ok(kr > kg + 50 && kr > kb + 50, 'the office: crimson');
  const [lr, , lb] = avg('led');
  assert.ok(lb >= lr && lb > 150, 'ice camo: white and blue');
  const [hr, hg, hb] = avg('haki');
  assert.ok(hg > hb + 15 && hr > hb, 'khaki: olive');
  const [sr, , sb] = avg('sport');
  assert.ok(sb > sr + 40, 'tracksuit blue');
});

test('the pattern follows the weapon, not the padding around it', () => {
  // the same weapon alone and inside a padded box looks the same
  const w = 40;
  const h = 10;
  const alone = sprite(w, h);
  const W = 80;
  const H = 30;
  const boxed = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) boxed[((y + 9) * W + x + 17) * 4 + c] = alone[(y * w + x) * 4 + c]!;
  paintFinish(alone, w, h, 'flora');
  paintFinish(boxed, W, H, 'flora');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) assert.equal(boxed[((y + 9) * W + x + 17) * 4 + c], alone[(y * w + x) * 4 + c]);
});

// ── v0.2.19: the AK sheet's finishes and the live ones ──

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

test('v0.2.19 / v0.2.24: a live finish (every legendary one) moves through its loop and comes back to where it started; the others stand still', () => {
  assert.equal(LIVE_FINISHES.length, 11);
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
