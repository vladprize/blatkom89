import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, CHARACTER_IDS } from '@blatkom/shared';
import { RU } from './ru.js';
import { RU_CHARACTERS } from './ru-content.js';
import { EN_MAT, RU_MAT } from './mat.js';
import { CHAR_MARKS, CHAR_MAT_QUOTES } from './dark.js';
import { STORY_MAT } from '../story/mat.js';
import { t, getSwear, _setLangForTests, _setSwearForTests } from './index.js';
import { charText } from './content.js';

/** Swear words written out whole (a masked one has a letter hidden behind * or #). */
const WHOLE_RU = [
  /(?<![а-яё])х[уy][йеёяю]/iu,
  /пизд/iu,
  /(?<![а-яё])бля/iu,
  /(?<![а-яё])сук(?:[аиеу]|ин)(?![а-яё])/iu,
  /пид[оа]р/iu,
  /г[ао]ндон/iu,
  /шлюх/iu,
  /долбо[её]б/iu,
  /(?<![а-яё])[её]б[аиуеолн]/iu,
  /(?<![а-яё])(?:у|за|про|вы|на|под|от|до|съ|въ|об|раз)[её]б/iu,
  /муда[кч]|мудил/iu,
  /вафл[еи]ст/iu,
  /(?<![а-яё])ж[оо]п/iu,
  /(?<![а-яё])г[ао]вн/iu,
  /хуес/iu,
  /мазафак/iu,
];
const WHOLE_EN = [/f+u+c+k/i, /\bshit/i, /\bcunt/i, /\bbitch/i, /\bdick(?!ens)/i, /\b(?:ass|arse)(?:hole)?s?\b/i, /\bbastard/i, /\bwank/i, /\bcocksuck/i, /\bslut/i, /\bwhore/i, /\btwat/i];
const swearsWhole = (s: string) => [...WHOLE_RU, ...WHOLE_EN].find((re) => re.test(s));
/** A word with a letter hidden: «бл*ть», «f*ck», «ваф#ист», «*блан». */
const MASKED = /[A-Za-zА-Яа-яЁё][*#]|[*#][A-Za-zА-Яа-яЁё]/u;

const matTexts = (): Array<[string, string]> => [
  ...Object.entries(RU_MAT).map(([k, v]) => [`RU_MAT ${k}`, v] as [string, string]),
  ...Object.entries(EN_MAT).map(([k, v]) => [`EN_MAT ${k}`, v] as [string, string]),
  ...Object.entries(STORY_MAT).flatMap(([k, [en, ru]]) => [[`STORY_MAT ${k}`, en], [`STORY_MAT ${k}`, ru]] as Array<[string, string]>),
  ...Object.entries(CHAR_MAT_QUOTES).flatMap(([k, [en, ru]]) => [[`quote ${k}`, en], [`quote ${k}`, ru]] as Array<[string, string]>),
];

test('the swearing has one letter hidden in every swear word — none slips through whole', () => {
  const whole = matTexts().filter(([, s]) => swearsWhole(s)).map(([w, s]) => `${w}: «${s}» (${swearsWhole(s)})`);
  assert.deepEqual(whole, []);
  // and it does swear: most of the versions have a masked word
  const masked = matTexts().filter(([, s]) => MASKED.test(s)).length;
  assert.ok(masked > matTexts().length * 0.8, `only ${masked} of ${matTexts().length} swear`);
  // the owner's list is there, each word masked
  const all = matTexts().map(([, s]) => s).join('\n');
  for (const w of ['Пид*рас', 'С*ка', 'П*шел нах*й', 'Г*ндон', 'Ваф#ист', '*блан', 'Долбо*б', 'Конч*нный', 'Х*есос', 'Шл*х', 'Я твой рот еб*л'])
    assert.ok(all.toLowerCase().includes(w.toLowerCase()), `«${w}» is somewhere`);
});

test('the plain texts stay clean: no swear words in ru.ts, the English keys, the plain characters or the marks', () => {
  const plain: Array<[string, string]> = [
    ...Object.entries(RU).flatMap(([en, ru]) => [[`key ${en}`, en], [`ru ${en}`, ru]] as Array<[string, string]>),
    ...CHARACTER_IDS.flatMap((id) => [...Object.values(RU_CHARACTERS[id]), CHARACTERS[id].quote, CHARACTERS[id].lore, CHARACTERS[id].personality].map((s) => [`character ${id}`, s] as [string, string])),
    ...CHARACTER_IDS.flatMap((id) => CHAR_MARKS[id].map((s) => [`marks ${id}`, s] as [string, string])),
  ];
  const dirty = plain.filter(([, s]) => swearsWhole(s) || MASKED.test(s.replace(/_ \. - # ! &|#\{rank\}/g, ''))).map(([w, s]) => `${w}: «${s}»`);
  assert.deepEqual(dirty, []);
});

test('the swearing lies over real keys with the same placeholders — and never over money, odds or the legal texts', () => {
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const [name, map] of [['RU_MAT', RU_MAT], ['EN_MAT', EN_MAT]] as const) {
    for (const [k, v] of Object.entries(map)) {
      assert.ok(k in RU, `${name}: «${k}» is not a key of the interface`);
      assert.equal(ph(v), ph(k), `${name} «${k}»: placeholders`);
      assert.ok(!/BLATS|Stars|price|payment|purchase|\bodds\b|chance|terms|privacy|refund|talon|\$/i.test(k), `${name}: «${k}» is about money or the law`);
    }
  }
  assert.deepEqual(Object.keys(EN_MAT).sort(), Object.keys(RU_MAT).sort(), 'both languages swear in the same places');
});

test('t() swears by default and stops with «No swearing»; so do the characters’ quotes', () => {
  assert.equal(getSwear(), true, 'on by default');
  _setLangForTests('ru');
  try {
    assert.equal(t('MATCH OVER'), 'ВСЁ, П*ЗДЕЦ');
    assert.equal(t('Promoted — level {n}!', { n: 7 }), 'Повышение — уровень 7, е*ать!');
    assert.equal(charText('petya').quote, CHAR_MAT_QUOTES.petya[1]);
    assert.equal(charText('petya').marks, CHAR_MARKS.petya[1]);
    _setSwearForTests(false);
    assert.equal(t('MATCH OVER'), 'МАТЧ ОКОНЧЕН');
    assert.equal(charText('petya').quote, RU_CHARACTERS.petya.quote);
    assert.equal(charText('petya').marks, CHAR_MARKS.petya[1], 'the black humour stays');
  } finally {
    _setSwearForTests(true);
    _setLangForTests('en');
  }
  assert.equal(t('MATCH OVER'), 'ALL F*CKING OVER');
  _setSwearForTests(false);
  try {
    assert.equal(t('MATCH OVER'), 'MATCH OVER');
    assert.equal(charText('valuta').quote, CHARACTERS.valuta.quote);
  } finally {
    _setSwearForTests(true);
  }
});

test('every character has its black humour and its swearing quote, short enough for the personal file', () => {
  for (const id of CHARACTER_IDS) {
    for (const [what, pair] of [['marks', CHAR_MARKS[id]], ['quote', CHAR_MAT_QUOTES[id]]] as const) {
      assert.equal(pair.length, 2, `${id} ${what}`);
      assert.ok(/[а-яё]/i.test(pair[1]), `${id} ${what}: the Russian is Russian`);
      for (const s of pair) assert.ok(s.length > 10 && s.length <= 170, `${id} ${what}: ${s.length} characters`);
    }
  }
});
