import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { RU, RU_PLURALS } from './ru.js';
import { t, plural, count, ruPluralIndex, _setLangForTests } from './index.js';
import { randomNickname } from '../profile/nickname-words.js';

const webSrc = fileURLToPath(new URL('..', import.meta.url));
const serverSrc = fileURLToPath(new URL('../../../server/src', import.meta.url));

function tsFiles(dir: string, skip: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (!skip(p)) out.push(...tsFiles(p, skip));
    } else if (p.endsWith('.ts') && !p.endsWith('.test.ts') && !skip(p)) out.push(p);
  }
  return out;
}

/** Every literal passed to t() and every unit passed to plural() / count() in the client. */
function clientKeys() {
  const keys = new Map<string, string>();
  const units = new Map<string, string>();
  const dynamic: string[] = [];
  // the admin dashboard is Russian-only; index.ts defines t() itself
  for (const file of tsFiles(webSrc, (p) => /^admin([\\/]|$)|^i18n[\\/]index\.ts$/.test(relative(webSrc, p)))) {
    const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const where = (n: ts.Node) => `${relative(webSrc, file)}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const name = n.expression.text;
        const a0 = n.arguments[0];
        if (name === 't' && a0) {
          if (ts.isStringLiteral(a0)) keys.set(a0.text, where(n));
          else dynamic.push(where(n));
        }
        if (name === 'plural' || name === 'count') for (const a of n.arguments.slice(1)) if (ts.isStringLiteral(a)) units.set(a.text, where(n));
      }
      ts.forEachChild(n, visit);
    };
    visit(src);
  }
  return { keys, units, dynamic };
}

test('every UI string of the client has a Russian translation with the same placeholders', () => {
  const { keys } = clientKeys();
  assert.ok(keys.size > 400, `found only ${keys.size} keys`);
  const missing = [...keys].filter(([k]) => !(k in RU)).map(([k, w]) => `${w}: ${k}`);
  assert.deepEqual(missing, [], 'missing in ru.ts');
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  const wrong = Object.entries(RU).filter(([en, ru]) => ph(en) !== ph(ru)).map(([en]) => en);
  assert.deepEqual(wrong, [], 'placeholders differ');
  for (const [en, ru] of Object.entries(RU)) assert.ok(ru.trim().length > 0, `empty translation: ${en}`);
});

test('t() is called with literal keys (only the server-message fallback is dynamic)', () => {
  const { dynamic } = clientKeys();
  assert.ok(dynamic.every((w) => w.startsWith(`net${'/'}errors.ts`) || w.startsWith('net\\errors.ts')), dynamic.join('; '));
});

test('every plural unit has Russian forms', () => {
  const { units } = clientKeys();
  const missing = [...units.keys()].filter((u) => !RU_PLURALS[u]);
  assert.deepEqual(missing, []);
});

test('player-facing English messages of the server have Russian translations', () => {
  const messages = new Set<string>();
  for (const file of tsFiles(serverSrc, (p) => /[\\/]admin([\\/]|$)/.test(relative(serverSrc, p)))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/new HttpError\(\d+, '[a-z_]+', '((?:[^'\\]|\\.)+)'/g)) messages.add(m[1]!);
    for (const m of text.matchAll(/this\.error\(c, '[a-z_]+', '((?:[^'\\]|\\.)+)'/g)) messages.add(m[1]!);
  }
  const english = [...messages].filter((m) => !/[А-Яа-яЁё]/.test(m));
  assert.ok(english.length > 20, `found ${english.length}`);
  assert.deepEqual(
    english.filter((m) => !(m in RU)),
    [],
  );
});

test('Russian plurals and substitution', () => {
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25, 111, 104].map(ruPluralIndex), [0, 1, 2, 2, 0, 1, 2, 2, 1]);
  _setLangForTests('ru');
  try {
    assert.equal(count(1, 'talon'), '1 талон');
    assert.equal(count(3, 'talon'), '3 талона');
    assert.equal(count(12, 'talon'), '12 талонов');
    assert.equal(t('Players {n}/{max}', { n: 3, max: 10 }), 'Игроки 3/10');
    assert.equal(t('No such key in the dictionary'), 'No such key in the dictionary');
    assert.match(randomNickname(() => 0.5), /^[А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+$/);
  } finally {
    _setLangForTests('en');
  }
  assert.equal(plural(1, 'point'), 'point');
  assert.equal(plural(2, 'point'), 'points');
  assert.equal(t('Players {n}/{max}', { n: 3, max: 10 }), 'Players 3/10');
  assert.match(randomNickname(() => 0.5), /^[A-Z][a-z]+ [A-Z][a-z ]+$/);
});
