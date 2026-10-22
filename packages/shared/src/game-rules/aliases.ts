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

// ── Latin names (v0.3) ──────────────────────────────────────────────────────────────────────────────
/**
 * Aliases and club names are written in Latin letters only (the owner's rule: the game is played across
 * Europe and America; everybody must be able to read every name). What the server and the client accept.
 */
export const LATIN_NAME_RE = /^[A-Za-z0-9 _.\-’']+$/;

const CYRILLIC: Readonly<Record<string, string>> = Object.freeze({
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya', і: 'i', ї: 'yi', є: 'ye', ґ: 'g', ў: 'u', ә: 'a', ғ: 'gh', қ: 'q', ң: 'ng', ө: 'o', ұ: 'u', ү: 'u', һ: 'h',
});
/** Latin letters NFKD doesn't take apart. */
const LATIN_EXTRA: Readonly<Record<string, string>> = Object.freeze({ ß: 'ss', æ: 'ae', Æ: 'AE', ø: 'o', Ø: 'O', œ: 'oe', Œ: 'OE', ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', þ: 'th', Þ: 'Th', ı: 'i' });

/** Cyrillic letters spelled in Latin ones («Петя» → «Petya», «ВАСЯ» → «VASYA»), accents dropped; nothing else changes. */
export function transliterate(raw: string): string {
  const words = raw.normalize('NFKC').split(/(\s+)/);
  const out = words
    .map((w) => {
      if (!/[\u0400-\u04ff]/.test(w)) return w;
      const letters = [...w].filter((c) => /\p{L}/u.test(c));
      const shout = letters.length > 1 && letters.every((c) => c === c.toUpperCase() && c !== c.toLowerCase());
      let res = '';
      for (const ch of w) {
        const low = ch.toLowerCase();
        const m = CYRILLIC[low];
        if (m === undefined) res += ch;
        else if (shout) res += m.toUpperCase();
        else res += ch !== low && m ? m[0]!.toUpperCase() + m.slice(1) : m;
      }
      return res;
    })
    .join('');
  return [...out]
    .map((c) => LATIN_EXTRA[c] ?? c)
    .join('')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');
}

/**
 * A name in Latin letters: transliterated (see above), anything else that isn't allowed in a name
 * removed, spaces tidied, at most 24 characters. May come out empty (a name in another script): see
 * `latinName`.
 */
export function toLatin(raw: string): string {
  return transliterate(raw)
    .replace(/[^A-Za-z0-9 _.\-’']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
}

/** `toLatin`, or the fallback when too little is left (fewer than two characters, no letter or digit). */
export function latinName(raw: string, fallback: string): string {
  const s = toLatin(raw);
  return s.length >= 2 && /[A-Za-z0-9]/.test(s) ? s : fallback;
}
