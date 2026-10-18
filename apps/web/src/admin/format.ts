/** Russian number/date/duration formatting for the dashboard. */
const nf = new Intl.NumberFormat('ru-RU');
const pf = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 });
const df = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
const dayf = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

export const NO_DATA = 'нет данных';

export function num(v: number | null | undefined): string {
  return v === null || v === undefined ? NO_DATA : nf.format(v);
}

export function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? NO_DATA : pf.format(v);
}

export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return NO_DATA;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин ${s % 60} с`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
}

export function playtime(sec: number): string {
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60} мин`;
}

export function dateTime(iso: string | null | undefined): string {
  return iso ? `${df.format(new Date(iso))} UTC` : '—';
}

export function shortDay(day: string): string {
  return dayf.format(new Date(`${day}T00:00:00Z`));
}

export const MAP_NAMES: Record<string, string> = { factory: 'Заводская проходная', garages: 'Гаражный кооператив', yard: 'Советский двор' };
export const CHARACTER_NAMES: Record<string, string> = { petya: 'Петя «Комендант»', valuta: 'Валюта', uchastkovy: 'Участковый', mihalych: 'Михалыч «Дембель»' };
export const PLATFORM_NAMES: Record<string, string> = {
  telegram_ios: 'Telegram iOS',
  telegram_android: 'Telegram Android',
  telegram_desktop: 'Telegram Desktop',
  telegram_web: 'Telegram Web',
  telegram_other: 'Telegram (другое)',
  browser_mobile: 'Браузер (моб.)',
  browser_desktop: 'Браузер (ПК)',
  unknown: 'Неизвестно',
};
export const ACHIEVEMENT_NAMES: Record<string, string> = {
  first_match: 'Первое дело',
  first_win: 'Авторитет',
  ten_matches: 'Свой человек',
  win_streak: 'Держит район',
  multi_kill: 'Разборка',
  played_with_friends: 'Свои люди',
};
