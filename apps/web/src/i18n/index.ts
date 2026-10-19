/**
 * Player-facing language: English (source strings in the code) or Russian (dictionary in ru.ts).
 *
 *   t('Quick Match')                          → 'Быстрый матч' in Russian
 *   t('At least {n} players needed', { n })   → placeholders are substituted after translation
 *   plural(5, 'talon')                        → 'talons' / 'талонов' (forms in RU_PLURALS)
 *
 * The admin dashboard is Russian-only and does not use this module. A test (i18n.test.ts) checks
 * that every literal passed to t() / plural() in the client has a Russian entry.
 */
import { RU, RU_PLURALS } from './ru.js';

export type Lang = 'en' | 'ru';
export const LANGS: readonly Lang[] = ['en', 'ru'];

const KEY = 'blatkom89.lang.v1';
/** Languages whose speakers get Russian by default (they can switch in the menu). */
const RUSSIAN_DEFAULT = new Set(['ru', 'be', 'kk', 'ky']);

function readSaved(): Lang | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'en' || v === 'ru' ? v : null;
  } catch {
    return null;
  }
}

/** Saved choice → Telegram user language → browser languages → English. */
export function detectLang(): Lang {
  const saved = readSaved();
  if (saved) return saved;
  const candidates: string[] = [];
  try {
    const code = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } } }).Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    if (code) candidates.push(code);
  } catch {
    /* no Telegram */
  }
  try {
    candidates.push(...(navigator.languages ?? []), navigator.language);
  } catch {
    /* no navigator */
  }
  for (const c of candidates) {
    if (!c) continue;
    const p = c.toLowerCase().slice(0, 2);
    if (RUSSIAN_DEFAULT.has(p)) return 'ru';
    if (p === 'en') return 'en';
  }
  return 'en';
}

let current: Lang = typeof window === 'undefined' ? 'en' : detectLang();
const listeners = new Set<(l: Lang) => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* storage unavailable */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  for (const cb of [...listeners]) cb(l);
}

export function onLangChange(cb: (l: Lang) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** For tests: switch without persisting or notifying. */
export function _setLangForTests(l: Lang): void {
  current = l;
}

function fill(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Translates an English UI string (the English text is the key). */
export function t(en: string, vars?: Record<string, string | number>): string {
  return fill(current === 'ru' ? (RU[en] ?? en) : en, vars);
}

/** Russian plural category of n: 0 = one (1, 21), 1 = few (2–4, 22–24), 2 = many (0, 5–20, 25…). */
export function ruPluralIndex(n: number): 0 | 1 | 2 {
  const a = Math.abs(Math.trunc(n));
  const d = a % 10;
  const dd = a % 100;
  if (d === 1 && dd !== 11) return 0;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 1;
  return 2;
}

/** The noun for n items: plural(5, 'point') → 'points' / 'очков'; plural(2, 'match', 'matches'). */
export function plural(n: number, one: string, many = `${one}s`): string {
  if (current === 'ru') {
    const forms = RU_PLURALS[one];
    if (forms) return forms[ruPluralIndex(n)];
  }
  return Math.abs(n) === 1 ? one : many;
}

/** n and its noun: count(3, 'talon') → '3 talons' / '3 талона'. */
export function count(n: number, one: string, many?: string): string {
  return `${n} ${plural(n, one, many)}`;
}

/** Number with the language's decimal separator. */
export function num(n: number, maxDigits = 1): string {
  return n.toLocaleString(current === 'ru' ? 'ru-RU' : 'en-GB', { maximumFractionDigits: maxDigits });
}
