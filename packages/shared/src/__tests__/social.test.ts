import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DirectMessageBody, LATIN_NAME_RE, MAX_NAME_LENGTH, PRACTICE_NAMES, RATING_RULES, displayNameSchema, fillNickname, latinName, mulberry32, nameKey, numberedAlias, randomNickname, ratingDelta, sameAlias, toLatin, transliterate } from '../index.js';

test('alias identity ignores letter case, spacing, Ё/Е and Cyrillic look-alikes of Latin letters', () => {
  assert.ok(sameAlias('Петя', 'ПЕТЯ'));
  assert.ok(sameAlias('  Петя   Комендант ', 'петя комендант'));
  assert.ok(sameAlias('Пётр', 'Петр'));
  assert.ok(sameAlias('Сом', 'Com'), 'Cyrillic С/о/м look like Latin C/o/m');
  assert.ok(sameAlias('ВАСЯ', 'BACЯ'));
  assert.ok(sameAlias('Михалыч’', "Михалыч'"));
  assert.ok(!sameAlias('Петя', 'Петя 2'));
  assert.ok(!sameAlias('Волк', 'Волки'));
  assert.ok(!sameAlias('Ваня', 'Bаня 1'));
  assert.equal(nameKey('Ｐｅｔｙａ'), 'petya', 'full-width letters fold too');
});

test('numbered aliases stay within the length limit', () => {
  assert.equal(numberedAlias('Петя', 2), 'Петя 2');
  const long = 'Ж'.repeat(MAX_NAME_LENGTH);
  assert.equal(numberedAlias(long, 12).length, MAX_NAME_LENGTH);
  assert.ok(numberedAlias(long, 12).endsWith(' 12'));
  assert.equal(numberedAlias('Ab ' + 'c'.repeat(MAX_NAME_LENGTH), 3).length, MAX_NAME_LENGTH);
});

test('rating: free-for-all by place among everyone present, teams by outcome, leavers lose, solo matches count nothing', () => {
  const k = RATING_RULES.k;
  assert.equal(ratingDelta({ place: 1, playersAtEnd: 6, completed: true }), k / 2);
  assert.equal(ratingDelta({ place: 6, playersAtEnd: 6, completed: true }), -k / 2);
  assert.equal(ratingDelta({ place: 2, playersAtEnd: 3, completed: true }), 0, 'the middle place keeps the rating');
  const ffa = [1, 2, 3, 4, 5, 6].map((place) => ratingDelta({ place, playersAtEnd: 6, completed: true }));
  for (let i = 1; i < ffa.length; i++) assert.ok(ffa[i]! <= ffa[i - 1]!, 'a better place never gives less');
  assert.equal(ratingDelta({ place: 1, playersAtEnd: 1, completed: true }), 0);
  assert.equal(ratingDelta({ place: 1, playersAtEnd: 6, completed: false }), RATING_RULES.leaver);
  assert.equal(ratingDelta({ place: 4, playersAtEnd: 6, completed: true, teamOutcome: 'win' }), RATING_RULES.team);
  assert.equal(ratingDelta({ place: 1, playersAtEnd: 6, completed: true, teamOutcome: 'loss' }), -RATING_RULES.team);
  assert.equal(ratingDelta({ place: 1, playersAtEnd: 6, completed: true, teamOutcome: 'draw' }), 0);
});

test('direct messages are trimmed, lose control characters and keep line breaks; empty or long ones are refused', () => {
  assert.equal(DirectMessageBody.parse({ text: '  привет\u0000\u001b[31m  ' }).text, 'привет[31m');
  assert.equal(DirectMessageBody.parse({ text: 'раз\nдва' }).text, 'раз\nдва');
  assert.ok(!DirectMessageBody.safeParse({ text: ' \u0007 ' }).success);
  assert.ok(!DirectMessageBody.safeParse({ text: 'я'.repeat(501) }).success);
  assert.ok(!DirectMessageBody.safeParse({ text: 'ok', extra: 1 }).success);
});

test('aliases in Latin letters (v0.3): the rule, transliteration, suggestions and filled players', () => {
  for (const ok of ['Petya', 'Quiet Quartermaster', 'Garik_89', 'Dok Jr', 'O’Neil', 'x-ray.7']) assert.equal(displayNameSchema.safeParse(ok).success, true, ok);
  for (const bad of ['Петя', 'José', 'Müller', '王小明', 'Vasya🙂', 'a<b>']) assert.equal(displayNameSchema.safeParse(bad).success, false, bad);
  assert.equal(toLatin('Петя Уникум'), 'Petya Unikum');
  assert.equal(toLatin('ВАСЯ ПУПКИН'), 'VASYA PUPKIN');
  assert.equal(toLatin('Щукарь Ёжиков_89'), 'Shchukar Yozhikov_89');
  assert.equal(toLatin('Їжак Ґава'), 'Yizhak Gava');
  assert.equal(toLatin('José Müller-Łukasz'), 'Jose Muller-Lukasz');
  assert.equal(toLatin('Тёмыч из 5-го 🙂'), 'Tyomych iz 5-go');
  assert.ok(toLatin('А'.repeat(60)).length <= 24);
  assert.equal(latinName('王小明', 'Comrade 1234'), 'Comrade 1234', 'another script: the fallback');
  assert.equal(latinName('Ъ', 'Comrade'), 'Comrade', 'nothing left: the fallback');
  assert.equal(latinName('Ж', 'Comrade'), 'Zh');
  assert.equal(transliterate('Двор — наш, лавочки — общие!'), 'Dvor — nash, lavochki — obshchie!', 'punctuation kept for longer texts');
  const rnd = mulberry32(7);
  for (let i = 0; i < 500; i++) {
    for (const lang of ['en', 'ru'] as const) {
      for (const name of [randomNickname(rnd, lang), fillNickname(rnd, lang)]) assert.equal(displayNameSchema.safeParse(name).success, true, `${lang}: ${name}`);
    }
  }
  for (const name of [...PRACTICE_NAMES.en, ...PRACTICE_NAMES.ru]) assert.match(name, LATIN_NAME_RE, name);
});
