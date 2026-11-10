import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOADOUT } from '@blatkom/shared';
import type { Inventory } from '@blatkom/shared';
import { cardRowLayout, ownCard, showOffWeapon } from './cardSlot.js';

test('v0.2.24 lobby fighters: one row or two, whichever gives bigger cards; a sideways strip when both are too small', () => {
  // a computer's right column (470×180): up to six in one row, ten in two rows of five
  const pc = (n: number) => cardRowLayout(n, 470, 180, { max: 200 });
  assert.deepEqual(pc(1), { rows: 1, cols: 1, w: 126, scroll: false });
  assert.equal(pc(4).rows, 1);
  assert.equal(pc(6).rows, 1);
  assert.deepEqual(pc(10), { rows: 2, cols: 5, w: 60, scroll: false });
  for (let n = 1; n <= 10; n++) {
    const L = pc(n);
    assert.ok(L.cols * L.w + (L.cols - 1) * 8 <= 470, `${n} fit the width`);
    assert.ok(L.rows * L.w * 1.42 + (L.rows - 1) * 8 <= 180 + 1, `${n} fit the height`);
  }
  // a phone's low strip (340×90): one card as tall as the strip; ten scroll sideways instead of shrinking to 29 px
  assert.deepEqual(cardRowLayout(1, 340, 90), { rows: 1, cols: 1, w: 63, scroll: false });
  const strip = cardRowLayout(10, 340, 90);
  assert.equal(strip.scroll, true);
  assert.equal(strip.rows, 1);
  assert.equal(strip.cols, 10);
  assert.ok(strip.w >= 56, `${strip.w} px is still a card`);
  // a strip only when it gives bigger cards: three in a low phone box stay in one row at the box's height
  assert.deepEqual(cardRowLayout(3, 300, 71), { rows: 1, cols: 3, w: 50, scroll: false });
  // never wider than asked
  assert.equal(cardRowLayout(1, 2000, 2000, { max: 200 }).w, 200);
});

test('v0.2.24 own card: the main weapon of the kit in its skin, the legendary counter from the inventory', () => {
  const plain = ownCard({ name: 'Петя', character: 'petya', level: 3, inventory: null });
  assert.equal(plain.weapon, DEFAULT_LOADOUT.primary ?? DEFAULT_LOADOUT.sidearm);
  assert.equal(plain.finish, null);
  assert.equal(plain.kills, null);
  const inv = {
    loadout: { ...DEFAULT_LOADOUT, primary: 'avtomat', mods: {}, skins: { avtomat: 'bratok' } },
    skinKills: { 'avtomat.bratok': 17 },
  } as unknown as Inventory;
  const own = ownCard({ name: 'Петя', character: 'petya', level: 3, inventory: inv });
  assert.equal(own.weapon, 'avtomat');
  assert.equal(own.finish, 'bratok');
  assert.equal(own.kills, 17);
  // an unknown character id never breaks the card
  assert.equal(ownCard({ name: 'x', character: 'nobody' as never, level: null, inventory: null }).character, 'petya');
});

test('v0.2.24 a lobby card shows off the best skin the player has on', () => {
  assert.deepEqual(showOffWeapon(undefined), { weapon: 'avtomat', finish: null });
  const best = showOffWeapon({ pistol: 'bratok', avtomat: 'akulka' } as never);
  assert.equal(best.finish, 'bratok');
  assert.equal(best.weapon, 'pistol');
});
