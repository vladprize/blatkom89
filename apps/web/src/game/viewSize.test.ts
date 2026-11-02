import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_VIEW_ASPECT, internalSize } from './viewSize.js';
import { TEXELS_PER_WORLD_PX, VIEW_SHORT_WORLD } from '../app/config.js';

const short = VIEW_SHORT_WORLD * TEXELS_PER_WORLD_PX;

test('the view follows the window: the short side is fixed, the long one follows the shape', () => {
  assert.deepEqual(internalSize(1600, 900), { width: Math.round(short * 16 / 9), height: short });
  assert.deepEqual(internalSize(390, 844), { width: short, height: Math.round(short * 844 / 390) });
  assert.deepEqual(internalSize(800, 800), { width: short, height: short });
});

test('v0.2.18: a window wider than the widest view still fills the screen — less height, never more width', () => {
  // an iPhone held sideways under the browser's bars: 804 × 290 (2.77 : 1)
  const s = internalSize(804, 290);
  assert.equal(s.width, Math.round(short * MAX_VIEW_ASPECT));
  assert.ok(Math.abs(s.width / s.height - 804 / 290) < 0.01, `the window's shape (${s.width}×${s.height})`);
  assert.ok(s.height < short);
  // the same the other way round
  const p = internalSize(290, 804);
  assert.equal(p.height, Math.round(short * MAX_VIEW_ASPECT));
  assert.ok(Math.abs(p.height / p.width - 804 / 290) < 0.01);
  // a degenerate window never divides by zero
  assert.ok(Number.isFinite(internalSize(500, 0).height));
});
