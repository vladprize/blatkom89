/**
 * BLAT DROP (V2.0 part C): the announcement date and a countdown by the server's clock — the same for
 * every player wherever their device's clock is; the player's $BLAT and counted friends, how $BLAT
 * accumulate and where the preparation stands (from the real state: no date / waiting / the date has
 * come). Black, red and bordeaux, the coin. An announcement date, not a promise: the panel says that no
 * token, price, profit or listing is guaranteed.
 */
import { BLAT_LEVEL_CAP_REWARD, BLAT_LEVEL_FIRST, REFERRAL_TIERS, dropCountdown, dropMsLeft } from '@blatkom/shared';
import type { BlatDropInfo } from '@blatkom/shared';
import { h } from '../dom.js';
import { getLang, plural, t } from '../../i18n/index.js';
import { blatAmount, blatCoin, fmtBlat } from './blat.js';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The panel. `fetchedAt` is this device's clock when the answer arrived: the difference to the server's
 * clock is kept, so a phone set ten minutes wrong still counts down to the same second as everyone.
 * The timer stops by itself once the panel has left the page.
 */
export function renderBlatDrop(info: BlatDropInfo, fetchedAt: number = Date.now(), mine: { balance: number; confirmed: number } | null = null): HTMLElement {
  const announceAt = info.announceAt;
  const target = announceAt ? Date.parse(announceAt) : null;
  const prepText = (left: number | null) =>
    left === null ? t('Status: $BLAT are being accumulated; the announcement date isn’t set yet.') : left > 0 ? t('Status: $BLAT are being accumulated until the announcement date.') : t('Status: the announcement date has come.');
  const prep = h('div', { class: 'blatdrop__prep', 'data-testid': 'drop-prep' }, prepText(target === null ? null : dropMsLeft(announceAt!, info.serverNow, fetchedAt, Date.now())));
  const unit = (label: string, id: string) => {
    const b = h('b', { 'data-testid': `drop-${id}` }, '--');
    return { b, el: h('span', { class: 'blatdrop__unit' }, b, h('small', null, label)) };
  };
  const units = [unit(t('days'), 'd'), unit(t('hrs'), 'h'), unit(t('min'), 'm'), unit(t('sec'), 's')];
  const status = h('div', { class: 'blatdrop__status', 'data-testid': 'drop-status' });
  const el = h(
    'div',
    { class: 'blatdrop', 'data-testid': 'blat-drop', 'data-set': String(target !== null) },
    h('div', { class: 'blatdrop__coin' }, blatCoin(96, '')),
    h('div', { class: 'blatdrop__title' }, 'BLAT DROP'),
    h('div', { class: 'blatdrop__label' }, 'BLAT DROP ANNOUNCE DATE'),
    target !== null
      ? h(
          'div',
          { class: 'blatdrop__date', 'data-testid': 'drop-date' },
          new Intl.DateTimeFormat(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(target),
        )
      : h('div', { class: 'blatdrop__date blatdrop__date--none', 'data-testid': 'drop-date' }, t('The announcement date isn’t set yet')),
    target !== null ? h('div', { class: 'blatdrop__count', 'data-testid': 'drop-count' }, ...units.map((u) => u.el)) : null,
    status,
    h('div', { class: 'blatdrop__clock' }, t('By the server’s clock — the same for every player')),
    mine
      ? h(
          'div',
          { class: 'blatdrop__mine' },
          h('span', { class: 'blatdrop__stat', 'data-testid': 'drop-balance' }, blatAmount(mine.balance, 16), h('small', null, t('your $BLAT'))),
          h('span', { class: 'blatdrop__stat', 'data-testid': 'drop-friends' }, h('b', null, fmtBlat(mine.confirmed)), h('small', null, `${plural(mine.confirmed, 'friend')} ${t('by your link')}`)),
        )
      : null,
    prep,
    h(
      'div',
      { class: 'blatdrop__how' },
      h('b', null, t('How $BLAT accumulate:')),
      h(
        'ul',
        null,
        h('li', null, t('every new level — once ({first} at the start, up to {cap} a level)', { first: fmtBlat(BLAT_LEVEL_FIRST), cap: fmtBlat(BLAT_LEVEL_CAP_REWARD) })),
        h('li', null, t('every friend who comes through your link and plays a whole online match — from {n}', { n: fmtBlat(REFERRAL_TIERS[0]!.reward) })),
      ),
    ),
    h('div', { class: 'blatdrop__note' }, t('$BLAT are in-game points. BLAT DROP is an announcement date, not a promise: no token, price, profit or listing is guaranteed.')),
  );
  if (target === null) return el;
  let seen = false;
  const tick = () => {
    if (el.isConnected) seen = true;
    else if (seen) return clearInterval(timer);
    const left = dropMsLeft(announceAt!, info.serverNow, fetchedAt, Date.now());
    const p = dropCountdown(left);
    units[0]!.b.textContent = String(p.d);
    units[1]!.b.textContent = pad(p.h);
    units[2]!.b.textContent = pad(p.m);
    units[3]!.b.textContent = pad(p.s);
    status.textContent = left <= 0 ? t('The date has come — watch the news') : '';
    prep.textContent = prepText(left);
  };
  const timer = setInterval(tick, 1000);
  tick();
  return el;
}
