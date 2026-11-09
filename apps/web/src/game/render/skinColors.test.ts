import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINISH_IDS, FINISHES, SKIN_PERKS, skinPerks } from '@blatkom/shared';
import { finishColors, colorsOf } from './skinColors.js';

test('every finish has light colours: a bright glow, not the outline black', () => {
  for (const f of FINISH_IDS) {
    const c = finishColors(f);
    const max = Math.max(...c.glow);
    assert.ok(max >= 150, `${f}: glow too dark ${c.glow.join(',')}`);
    assert.equal(c.glowHex, (Math.round(c.glow[0]) << 16) | (Math.round(c.glow[1]) << 8) | Math.round(c.glow[2]));
    assert.ok(c.mainHex >= 0 && c.mainHex <= 0xffffff);
  }
});

test('the colours follow the paint: a red finish glows red, a gold one gold', () => {
  const red = (f: string) => {
    const [r, g, b] = finishColors(f as never).glow;
    return r > g && r > b;
  };
  assert.ok(red('malina'), 'malina is red');
  const [r, g, b] = finishColors('zoloto').glow;
  assert.ok(r > b && g > b, `zoloto is golden: ${r},${g},${b}`);
});

test('colorsOf ignores transparent and outline pixels', () => {
  const px = new Uint8ClampedArray(4 * 4);
  px.set([5, 5, 5, 255, 0, 200, 0, 0, 30, 60, 220, 255, 40, 70, 230, 255]);
  const c = colorsOf(px);
  assert.ok(c.main[2] > c.main[0] && c.main[2] > c.main[1], 'blue wins');
});

test('grade perks: each grade adds to the one below, a skin has the perks of its grade', () => {
  const order = ['common', 'rare', 'epic', 'legendary'] as const;
  const count = (g: (typeof order)[number]) => Object.values(SKIN_PERKS[g]).filter((v) => v === true || v === 'burst' || v === 'grand').length;
  for (let i = 1; i < order.length; i++) assert.ok(count(order[i]!) > count(order[i - 1]!), `${order[i]} > ${order[i - 1]}`);
  assert.equal(SKIN_PERKS.common.shots, false);
  assert.equal(SKIN_PERKS.rare.shots, true);
  assert.equal(SKIN_PERKS.epic.glow, true);
  assert.equal(SKIN_PERKS.legendary.counter, true);
  for (const f of FINISH_IDS) assert.deepEqual(skinPerks(f), SKIN_PERKS[FINISHES[f].rarity]);
  assert.equal(skinPerks(null), null);
  assert.equal(skinPerks('nope' as never), null);
});
