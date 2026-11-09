import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUNDLES, BUNDLE_WEAPON, CHARACTERS, CHARACTER_IDS, CHARACTER_PRICES, FINISHES, FREE_WEAPONS, SHOP_FINISHES, SKIN_PRICES, bundleOf, bundleRefusal, skinId } from '../index.js';

test('bundles v0.2.23: every epic and legendary character for BLATS has a set with its own legendary skin', () => {
  const sold = CHARACTER_IDS.filter((c) => (CHARACTERS[c].grade === 'epic' || CHARACTERS[c].grade === 'legendary') && CHARACTER_PRICES[c]?.currency === 'diamonds');
  assert.deepEqual(BUNDLES.map((b) => b.character).sort(), [...sold].sort());
  const finishes = BUNDLES.map((b) => b.finish);
  assert.equal(new Set(finishes).size, finishes.length, 'each legendary finish in one set only');
  for (const b of BUNDLES) {
    assert.equal(FINISHES[b.finish].rarity, 'legendary');
    assert.ok(SHOP_FINISHES.includes(b.finish), `${b.finish} is sold in the shop`);
    assert.equal(b.weapon, BUNDLE_WEAPON);
    assert.ok(FREE_WEAPONS.includes(b.weapon), 'the skin goes on a weapon everyone has');
    assert.equal(b.separate, CHARACTER_PRICES[b.character]!.amount + SKIN_PRICES.legendary);
    assert.ok(b.price < b.separate, 'cheaper together');
    assert.ok(b.price <= 999, 'about $10 at most');
  }
  assert.equal(bundleOf('petya'), null);
  assert.equal(bundleOf('uchastkovy'), null);
});

test('bundles: sold only while neither half is owned, and for enough BLATS', () => {
  const b = bundleOf('lev')!;
  const inv = { characters: ['petya', 'valuta'] as typeof CHARACTER_IDS[number][], skins: [] as string[], diamonds: b.price };
  assert.equal(bundleRefusal(inv, 'lev'), null);
  assert.equal(bundleRefusal({ ...inv, diamonds: b.price - 1 }, 'lev'), 'funds');
  assert.equal(bundleRefusal({ ...inv, characters: [...inv.characters, 'lev'] }, 'lev'), 'owned');
  assert.equal(bundleRefusal({ ...inv, skins: [skinId(b.weapon, b.finish)] }, 'lev'), 'owned');
  assert.equal(bundleRefusal(inv, 'petya'), 'not_for_sale');
});
