import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_IDS, CHARACTERS } from '@blatkom/shared';
import { LEGEND_LOOKS, hexOf, legendLook } from './legendLooks.js';

test('v0.2.24: every legendary character has its own light, nobody else does', () => {
  const legendary = CHARACTER_IDS.filter((c) => CHARACTERS[c].grade === 'legendary');
  assert.deepEqual([...legendary].sort(), ['kasatka', 'lev', 'zvezda']);
  for (const c of CHARACTER_IDS) {
    const L = legendLook(c);
    if (CHARACTERS[c].grade === 'legendary') {
      assert.ok(L, `${c} has a look`);
      for (const v of [...L.main, ...L.glow]) assert.ok(v >= 0 && v <= 255);
    } else assert.equal(L, null, `${c}: no legendary light`);
  }
  assert.deepEqual(Object.keys(LEGEND_LOOKS).sort(), [...legendary].sort());
  // three different looks
  assert.equal(new Set(legendary.map((c) => legendLook(c)!.mote)).size, legendary.length);
  assert.equal(legendLook(null), null);
  assert.equal(hexOf([255, 216, 120]), 0xffd878);
});
