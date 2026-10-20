/**
 * Alias identity. Two aliases are the same alias when they differ only in letter case, spacing, Ё/Е or
 * Cyrillic letters that look like Latin ones («Петя» = «ПЕТЯ», «Сом» = «Com»): nobody can pass for
 * another player in the Top-100 or in a friend's list. The server keeps this key unique among living
 * accounts (users.name_key). The key is computed here, not by the database: database locales differ
 * in how — and whether — they fold Cyrillic letters.
 */
import { MAX_NAME_LENGTH } from '../constants/game.js';

/** Cyrillic (and a few other) letters drawn like Latin ones, in either case. */
const LOOKALIKES: Readonly<Record<string, string>> = Object.freeze({
  а: 'a',
  в: 'b',
  е: 'e',
  ё: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  і: 'i',
  ј: 'j',
  ѕ: 's',
  ԁ: 'd',
  ԛ: 'q',
  ԝ: 'w',
  '’': "'",
});

/** The identity of an alias (unique among living accounts). */
export function nameKey(name: string): string {
  const s = name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  let out = '';
  for (const ch of s) out += LOOKALIKES[ch] ?? ch;
  return out;
}

/** Same alias? */
export function sameAlias(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}

/** «Name 2», «Name 3», … within the length limit. */
export function numberedAlias(base: string, n: number): string {
  const tail = ` ${n}`;
  return base.slice(0, MAX_NAME_LENGTH - tail.length).trimEnd() + tail;
}
