import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUNDLE_PRICES, CHARACTER_GRADE_PRICES, DIAMOND_PACKS, SKIN_PRICES } from '@blatkom/shared';
import { t } from '../i18n/index.js';
import { blatsSale, packHint, usdOf } from './blats.js';

test('v0.2.18 / v0.2.24 BLATS packs: every pack says what it is enough for, and it really is', () => {
  const L = CHARACTER_GRADE_PRICES.legendary;
  const E = CHARACTER_GRADE_PRICES.epic;
  const hints = DIAMOND_PACKS.map((p) => packHint(p.diamonds));
  assert.deepEqual(hints, [
    t('a regular character'),
    t('an epic skin'),
    t('a legendary skin'),
    t('an epic character'),
    t('a set with an epic character'),
    t('a legendary character'),
    t('a set with a legendary character'),
    t('a set with a legendary character'),
    t('{n} × legendary character', { n: 2 }),
    t('{n} × legendary character', { n: 7 }),
  ]);
  // the promises hold against the price tables
  const at = (id: string) => DIAMOND_PACKS.find((p) => p.id === id)!.diamonds;
  assert.ok(at('b99') >= CHARACTER_GRADE_PRICES.common && at('b99') >= SKIN_PRICES.common);
  assert.ok(at('b199') >= SKIN_PRICES.epic);
  assert.ok(at('b299') >= SKIN_PRICES.legendary);
  assert.ok(at('b499') >= E);
  assert.ok(at('b599') >= BUNDLE_PRICES.epic);
  assert.ok(at('b699') >= L);
  assert.ok(at('b799') >= BUNDLE_PRICES.legendary);
  assert.ok(at('b4999') >= 7 * L && at('b4999') < 8 * L);
  assert.equal(packHint(50), null);
  assert.deepEqual(
    DIAMOND_PACKS.map((p) => usdOf(p.usdCents)),
    ['$0.99', '$1.99', '$2.99', '$4.99', '$5.99', '$6.99', '$7.99', '$9.99', '$19.99', '$49.99'],
  );
});

test('v0.2.24 every price is exactly one pack, and ends in .99', () => {
  const prices = [...Object.values(SKIN_PRICES), ...Object.values(CHARACTER_GRADE_PRICES), ...Object.values(BUNDLE_PRICES)];
  for (const p of prices) {
    assert.equal(p % 100, 99, `${p} ends in .99`);
    assert.ok(DIAMOND_PACKS.some((k) => k.diamonds === p), `a pack of exactly ${p}`);
  }
});

test('v0.2.18 the banner says «Buy» only with a payment provider: on the website the card, inside Telegram the Stars', () => {
  const cfg = (card: boolean, stars: Record<string, number> | null = null) => ({ card, stars, provider: card ? ('xsolla' as const) : null, casesEnabled: true, packs: [...DIAMOND_PACKS] });
  assert.equal(blatsSale(null, false), 'soon');
  assert.equal(blatsSale(cfg(false), false), 'soon');
  assert.equal(blatsSale(cfg(true), false), 'buy');
  // part 3: inside Telegram only Telegram Stars sell (Telegram's rule), a card provider changes nothing there
  assert.equal(blatsSale(cfg(true), true), 'stars-soon');
  assert.equal(blatsSale(cfg(false, { b99: 75 }), true), 'stars');
  assert.equal(blatsSale(cfg(true, { b99: 75 }), false), 'buy', 'Stars are not sold on the website');
});
