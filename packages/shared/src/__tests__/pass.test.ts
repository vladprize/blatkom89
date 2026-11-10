import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CASE_CHARACTERS,
  CASE_FINISHES,
  CHARACTER_IDS,
  DIAMOND_PACKS,
  FREE_CHARACTERS,
  PASS_FALLBACK_BLATS,
  PASS_PRICE,
  SKINNABLE_WEAPONS,
  WEEK_MS,
  characterCaseOdds,
  drawPassWeek,
  passEnd,
  passOdds,
  passOnSale,
  passWeekAt,
  passWeekStart,
  passWeeksDue,
  skinCaseOdds,
  skinId,
} from '../index.js';
import type { CharacterId, PassSeason } from '../index.js';

const season: PassSeason = { id: 's1', start: '2026-12-01T09:00:00.000Z', weeks: 4 };
const at = (ms: number) => new Date(Date.parse(season.start) + ms);

test('v0.2.24 Season Pass: 299 BLATS — exactly one pack, $2.99', () => {
  assert.deepEqual(PASS_PRICE, { currency: 'diamonds', amount: 299, level: 1 });
  const pack = DIAMOND_PACKS.find((p) => p.diamonds === PASS_PRICE.amount);
  assert.ok(pack, 'a pack of exactly 299 BLATS');
  assert.equal(pack!.usdCents, 299);
});

test('the season\'s weeks: none before it, one a week during it, all of them after it', () => {
  assert.equal(passWeekAt(season, at(-1)), 0);
  assert.equal(passOnSale(season, at(-1)), false, 'not before the first day');
  assert.equal(passWeekAt(season, at(0)), 1);
  assert.equal(passWeekAt(season, at(WEEK_MS - 1)), 1);
  assert.equal(passWeekAt(season, at(WEEK_MS)), 2);
  assert.equal(passWeekAt(season, at(3 * WEEK_MS + 5)), 4);
  assert.equal(passOnSale(season, at(3 * WEEK_MS + 5)), true, 'on sale in its last week');
  assert.equal(passWeekAt(season, at(4 * WEEK_MS)), 5);
  assert.equal(passOnSale(season, at(4 * WEEK_MS)), false, 'not after it');
  assert.equal(passOnSale(null, at(0)), false, 'no season configured: not sold');
  // a buyer in week 3 gets weeks 1–3 at once; after the season every week is ready
  assert.equal(passWeeksDue(season, at(-5)), 0);
  assert.equal(passWeeksDue(season, at(2 * WEEK_MS + 10)), 3);
  assert.equal(passWeeksDue(season, at(40 * WEEK_MS)), 4);
  assert.equal(passEnd(season).toISOString(), new Date(Date.parse(season.start) + 4 * WEEK_MS).toISOString());
  assert.equal(passWeekStart(season, 2).toISOString(), at(WEEK_MS).toISOString());
  assert.equal(passWeekAt({ start: 'not a date', weeks: 4 }, at(0)), 0, 'a broken date sells nothing');
});

test('a week gives one skin and one character the player does not have, never a free one', () => {
  let r = 0.137;
  const rand = () => (r = (r * 9301 + 49297) % 233280 / 233280);
  const skins = new Set<string>();
  const chars = new Set<CharacterId>(FREE_CHARACTERS);
  for (let w = 1; w <= 40; w++) {
    const d = drawPassWeek(w, skins, chars, rand);
    assert.equal(d.week, w);
    assert.ok(d.skin && d.character, 'both while there are some left');
    const id = skinId(d.skin.weapon, d.skin.finish);
    assert.ok(!skins.has(id), 'no skin twice');
    assert.ok(CASE_FINISHES.includes(d.skin.finish), 'from the line the skin case gives');
    if (chars.size < CHARACTER_IDS.length) assert.ok(!chars.has(d.character.character), 'no character twice');
    assert.ok(CASE_CHARACTERS.includes(d.character.character), 'only the characters sold for BLATS');
    assert.equal(d.blats, 0);
    skins.add(id);
    chars.add(d.character.character);
    if (chars.size - FREE_CHARACTERS.length >= CASE_CHARACTERS.length) break;
  }
});

test('nothing left to give: that half of the week is BLATS instead', () => {
  const allChars = new Set<CharacterId>(CHARACTER_IDS);
  const d = drawPassWeek(2, new Set(), allChars, Math.random);
  assert.equal(d.character, null);
  assert.ok(d.skin);
  assert.equal(d.blats, PASS_FALLBACK_BLATS);
  const allSkins = new Set<string>();
  for (const w of SKINNABLE_WEAPONS) for (const f of CASE_FINISHES) allSkins.add(skinId(w, f));
  const none = drawPassWeek(3, allSkins, allChars, Math.random);
  assert.equal(none.skin, null);
  assert.equal(none.blats, 2 * PASS_FALLBACK_BLATS);
  // even a player who owns everything gets back less than four weeks would have cost twice over
  assert.ok(4 * none.blats < 2 * PASS_PRICE.amount);
});

test('the odds the pass shows are the cases\' odds for that player', () => {
  const inv = { skins: ['avtomat.bratok'], characters: ['petya', 'valuta', 'lev'] as CharacterId[] };
  const o = passOdds(inv);
  assert.deepEqual(o.skins, skinCaseOdds(new Set(inv.skins)));
  assert.deepEqual(o.characters, characterCaseOdds(new Set(inv.characters)));
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum(o.skins) - 100) < 1e-6);
  assert.ok(Math.abs(sum(o.characters) - 100) < 1e-6);
});
