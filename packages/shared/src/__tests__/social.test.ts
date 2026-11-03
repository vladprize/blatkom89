import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DirectMessageBody, LATIN_NAME_RE, MAX_NAME_LENGTH, MAX_NICK_LENGTH, MIN_NICK_LENGTH, NICK_RE, NICK_RULE, PRACTICE_NAMES, RATING_RULES, displayNameSchema, fillNickname, isNick, latinName, mulberry32, nameKey, nickInput, nickName, numberedAlias, numberedNick, randomNickname, ratingDelta, sameAlias, toLatin, toNick, transliterate } from '../index.js';

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

test('aliases (v0.2.19): one word of small Latin letters — the rule, conversion, transliteration, suggestions and filled players', () => {
  // the rule: a–z, 0–9 and _ . -, no spaces, no capitals, 3–20 characters, at least one letter or digit
  assert.equal(MIN_NICK_LENGTH, 3);
  assert.equal(MAX_NICK_LENGTH, 20);
  for (const ok of ['petya', 'ok_name', 'a.b-c', 'garik_89', 'x-ray.7', 'dok_jr', '007', 'z'.repeat(MAX_NICK_LENGTH)]) {
    assert.equal(displayNameSchema.safeParse(ok).success, true, ok);
    assert.ok(isNick(ok), ok);
    assert.match(ok, NICK_RE, ok);
    assert.equal(toNick(ok), ok, `an alias stays as it is: ${ok}`);
  }
  for (const bad of ['Petya', 'Caps', 'Garik_89', 'Quiet Quartermaster', 'Two Words', 'two words', 'O’Neil', "o'neil", 'ab', 'z'.repeat(MAX_NICK_LENGTH + 1), '___', '.-.', 'Петя', 'петя', 'José', 'müller', '王小明', 'vasya🙂', 'a<b>']) {
    assert.equal(displayNameSchema.safeParse(bad).success, false, bad);
    assert.ok(!isNick(bad), bad);
  }
  assert.equal(displayNameSchema.safeParse('Two Words').error?.issues[0]?.message, NICK_RULE, 'the server explains the rule');
  // any name as an alias: transliterated, small letters, words joined with «_», separators tidied, ≤ 20
  assert.equal(toNick('Petya Unikum'), 'petya_unikum');
  assert.equal(toNick('Петя Уникум'), 'petya_unikum');
  assert.equal(toNick('ВАСЯ ПУПКИН'), 'vasya_pupkin');
  assert.equal(toNick('Щукарь Ёжиков_89'), 'shchukar_yozhikov_89');
  assert.equal(toNick('Їжак Ґава'), 'yizhak_gava');
  assert.equal(toNick('José Müller-Łukasz'), 'jose_muller-lukasz');
  assert.equal(toNick('Тёмыч из 5-го 🙂'), 'tyomych_iz_5-go');
  assert.equal(toNick('O’Neil'), 'o_neil');
  assert.equal(toNick('Quiet Quartermaster'), 'quiet_quartermaster');
  assert.equal(toNick('__Garik__89__'), 'garik_89', 'runs of separators made one, none at either end');
  assert.equal(toNick('a  -  b'), 'a_b');
  assert.equal(toNick('Petya — Unikum!'), 'petya_unikum');
  assert.ok(toNick('А'.repeat(60)).length <= MAX_NICK_LENGTH);
  assert.ok(isNick(toNick('А'.repeat(60))));
  assert.equal(nickName('Mikhalych', 'comrade_1234'), 'mikhalych');
  assert.equal(nickName('Жора', 'comrade_1234'), 'zhora');
  assert.equal(nickName('王小明', 'comrade_1234'), 'comrade_1234', 'another script: the fallback');
  assert.equal(nickName('Ъ', 'comrade_1234'), 'comrade_1234', 'nothing left: the fallback');
  assert.equal(nickName('Ж', 'comrade_1234'), 'comrade_1234', 'too short («zh»): the fallback');
  // as typed in the alias field: small letters, a space becomes «_», nothing trimmed (the player is still typing)
  assert.equal(nickInput('Петя Уникум '), 'petya_unikum_');
  assert.equal(nickInput('O’Neil Big'), 'o_neil_big');
  assert.ok(nickInput('x'.repeat(40)).length <= MAX_NICK_LENGTH);
  // free variants of a taken alias
  assert.equal(numberedNick('petya', 2), 'petya_2');
  assert.equal(numberedNick('petya', 89), 'petya_89');
  assert.equal(numberedNick('z'.repeat(MAX_NICK_LENGTH), 12), 'z'.repeat(MAX_NICK_LENGTH - 3) + '_12', 'within the length limit');
  assert.equal(numberedNick('abcdefghijklmnopq_rs', 3), 'abcdefghijklmnopq_3', 'no doubled separator where the base is cut');
  for (const base of ['petya', 'z'.repeat(MAX_NICK_LENGTH), 'abcdefghijklmnopq_rs', 'a.b-c']) for (const n of [2, 89, 1989]) assert.ok(isNick(numberedNick(base, n)), `${base} ${n}`);
  // club names (and longer texts) keep Latin letters with spaces and capitals: transliterate / toLatin / latinName
  for (const [raw, latin] of [
    ['Петя Уникум', 'Petya Unikum'],
    ['ВАСЯ ПУПКИН', 'VASYA PUPKIN'],
    ['Щукарь Ёжиков_89', 'Shchukar Yozhikov_89'],
    ['Їжак Ґава', 'Yizhak Gava'],
    ['José Müller-Łukasz', 'Jose Muller-Lukasz'],
    ['Тёмыч из 5-го 🙂', 'Tyomych iz 5-go'],
  ] as const) {
    assert.equal(toLatin(raw), latin);
    assert.match(latin, LATIN_NAME_RE, latin);
  }
  assert.ok(toLatin('А'.repeat(60)).length <= 24);
  assert.equal(latinName('王小明', 'Comrade 1234'), 'Comrade 1234', 'another script: the fallback');
  assert.equal(latinName('Ъ', 'Comrade'), 'Comrade', 'nothing left: the fallback');
  assert.equal(latinName('Ж', 'Comrade'), 'Zh');
  assert.equal(transliterate('Двор — наш, лавочки — общие!'), 'Dvor — nash, lavochki — obshchie!', 'punctuation kept for longer texts');
  // suggestions, filled players and the practice bots all have valid aliases
  const rnd = mulberry32(7);
  for (let i = 0; i < 500; i++) {
    for (const lang of ['en', 'ru'] as const) {
      for (const name of [randomNickname(rnd, lang), fillNickname(rnd, lang)]) {
        assert.ok(isNick(name), `${lang}: ${name}`);
        assert.equal(displayNameSchema.safeParse(name).success, true, `${lang}: ${name}`);
      }
    }
  }
  for (const name of [...PRACTICE_NAMES.en, ...PRACTICE_NAMES.ru]) assert.ok(isNick(name), name);
});
