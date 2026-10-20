import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DirectMessageBody, MAX_NAME_LENGTH, RATING_RULES, nameKey, numberedAlias, ratingDelta, sameAlias } from '../index.js';

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
