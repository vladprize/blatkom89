import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_GRADE_PRICES, DIAMOND_PACKS, SKIN_PRICES } from '@blatkom/shared';
import { t } from '../i18n/index.js';
import { blatsSale, packHint, usdOf } from './blats.js';

test('v0.2.18 BLATS packs: every pack says what it is enough for, and it really is', () => {
  const L = CHARACTER_GRADE_PRICES.legendary;
  const hints = DIAMOND_PACKS.map((p) => packHint(p.diamonds));
  assert.deepEqual(hints, [
    t('a regular skin'),
    t('a regular character'),
    t('a legendary skin'),
    t('an epic character'),
    t('a legendary and an epic character'),
    t('{n} × legendary character', { n: 4 }),
  ]);
  // the promises hold against the price tables
  assert.ok(DIAMOND_PACKS[0]!.diamonds >= SKIN_PRICES.common);
  assert.ok(DIAMOND_PACKS[1]!.diamonds >= CHARACTER_GRADE_PRICES.common);
  assert.ok(DIAMOND_PACKS[2]!.diamonds >= SKIN_PRICES.legendary);
  assert.ok(DIAMOND_PACKS[3]!.diamonds >= CHARACTER_GRADE_PRICES.epic);
  assert.ok(DIAMOND_PACKS[4]!.diamonds >= L + CHARACTER_GRADE_PRICES.epic);
  assert.ok(DIAMOND_PACKS[5]!.diamonds >= 4 * L && DIAMOND_PACKS[5]!.diamonds < 5 * L);
  assert.equal(packHint(50), null);
  assert.deepEqual(DIAMOND_PACKS.map((p) => usdOf(p.usdCents)), ['$0.99', '$1.99', '$4.99', '$9.99', '$19.99', '$49.99']);
});

test('v0.2.18 the banner says «Buy» only with a payment provider and outside Telegram', () => {
  const cfg = (card: boolean) => ({ card, casesEnabled: true, packs: [...DIAMOND_PACKS] });
  assert.equal(blatsSale(null, false), 'soon');
  assert.equal(blatsSale(cfg(false), false), 'soon');
  assert.equal(blatsSale(cfg(true), false), 'buy');
  assert.equal(blatsSale(cfg(true), true), 'stars');
});
