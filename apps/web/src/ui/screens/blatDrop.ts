/**
 * BLAT DROP (V2.0 part C): the announcement date and a countdown by the server's clock — the same for
 * every player wherever their device's clock is; the player's $BLAT and counted friends, how $BLAT
 * accumulate and where the preparation stands (from the real state: no date / waiting / the date has
 * come). Black, red and bordeaux, the coin. An announcement date, not a promise: the panel says that no
 * token, price, profit or listing is guaranteed.
 */
import { BLAT_POOLS, BLAT_SUPPLY, dropCountdown, dropMsLeft } from '@blatkom/shared';
import type { BlatDropInfo, BlatPool } from '@blatkom/shared';
import { asset, h, toast } from '../dom.js';
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
    h('div', { class: 'blatdrop__chain', 'data-testid': 'drop-solana' }, solanaLogo(18), t('The drop is planned in the Solana network')),
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
    h('div', { class: 'blatdrop__note' }, t('$BLAT are in-game points. BLAT DROP is an announcement date, not a promise: no token, price, profit or listing is guaranteed.')),
  );
  const out = dropGrid(el, target, info.wallet ?? null);
  if (target === null) return out;
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
  return out;
}

const solanaLogo = (size: number) => h('img', { class: 'logo-sol', src: asset('assets/ui/logos/solana.png'), alt: 'Solana', width: String(size), height: String(size), draggable: 'false' });
const phantomLogo = (size: number) => h('img', { class: 'logo-phantom', src: asset('assets/ui/logos/phantom.png'), alt: 'Phantom', width: String(size), height: String(size), draggable: 'false' });

const POOL_LABEL: Record<BlatPool, () => string> = {
  players: () => t('Players'),
  founder: () => t('Founder'),
  influencers: () => t('Influencers'),
  friends: () => t('Friends of the project'),
  reserve: () => t('Reserve'),
};

/**
 * v0.2.17: BLAT DROP with the owner's additions — the countdown card, Play-to-Earn and the year's plans,
 * the supply (2 000 000 000, by pools) and the project's Solana wallet with «Copy». On a wide screen the
 * three stand side by side; on a phone they are tabs (nothing to scroll).
 */
function dropGrid(count: HTMLElement, target: number | null, wallet: string | null): HTMLElement {
  const dateText = target !== null ? new Intl.DateTimeFormat(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(target) : t('soon');
  const plans = h(
    'section',
    { class: 'panel col droppane droppane--plans', 'data-testid': 'drop-plans' },
    h('span', { class: 'tag' }, 'Play-to-Earn'),
    h('div', { class: 'droppane__lead' }, t('BLATKOM ’89 is out to change the Play-to-Earn market: $BLAT go to everyone who plays, not to those who pay.')),
    h('b', { class: 'droppane__h' }, t('How to earn $BLAT')),
    h(
      'ul',
      { class: 'droppane__list' },
      h('li', null, t('Level up — every new level pays $BLAT')),
      h('li', null, t('Invite friends — for every friend who plays a whole online match')),
      h('li', null, t('Play the story — missions give experience, experience gives levels')),
      h('li', null, t('Win the $BLAT Tournament — take your opponents’ stakes')),
    ),
    h('b', { class: 'droppane__h' }, t('Plans for the year')),
    h(
      'ol',
      { class: 'droppane__road' },
      h('li', null, h('b', null, t('Now')), ' — ', t('$BLAT are earned: levels, friends, the story, the tournament')),
      h('li', null, h('b', null, dateText), ' — ', t('the announcement of the drop date')),
      h('li', null, h('b', null, t('Then')), ' — ', t('the $BLAT token drop in the Solana network: its date comes with the announcement')),
      h('li', null, h('b', null, t('Through 2027')), ' — ', t('OPG wars and tournament seasons, new story chapters, maps and characters')),
    ),
    h('div', { class: 'muted droppane__small' }, t('Following the path of successful game tokens in Telegram: first players earn points, then the drop. These are plans, not promises.')),
  );
  const copy = async () => {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet);
      toast(t('Address copied'));
    } catch {
      toast(wallet);
    }
  };
  const tokens = h(
    'section',
    { class: 'panel col droppane droppane--tokens', 'data-testid': 'drop-tokenomics' },
    h('span', { class: 'tag' }, t('Tokenomics')),
    h('div', { class: 'droppane__supply' }, t('Total supply'), h('b', null, `${fmtBlat(BLAT_SUPPLY)} $BLAT`)),
    h(
      'div',
      { class: 'tokbars' },
      ...(Object.keys(BLAT_POOLS) as BlatPool[]).map((k) => {
        const pct = (BLAT_POOLS[k] / BLAT_SUPPLY) * 100;
        return h(
          'div',
          { class: `tokbar tokbar--${k}`, 'data-testid': `pool-${k}` },
          h('span', { class: 'tokbar__label' }, POOL_LABEL[k]()),
          h('span', { class: 'tokbar__track' }, h('i', { style: `width:${pct.toFixed(1)}%` })),
          h('span', { class: 'tokbar__num' }, `${Math.round(pct)}%`, h('small', null, fmtBlat(BLAT_POOLS[k]))),
        );
      }),
    ),
    wallet
      ? h(
          'div',
          { class: 'dropwallet', 'data-testid': 'drop-wallet' },
          h('b', { class: 'droppane__h' }, t('Project wallet')),
          h('div', { class: 'dropwallet__brands' }, h('span', null, solanaLogo(20), 'Solana'), h('span', null, phantomLogo(20), 'Phantom')),
          h('div', { class: 'dropwallet__row' }, h('code', { class: 'dropwallet__addr', 'data-testid': 'drop-wallet-address' }, wallet), h('button', { class: 'btn btn--small btn--red', 'data-testid': 'drop-wallet-copy', onclick: () => void copy() }, t('Copy'))),
        )
      : null,
  );
  const panes = [
    { id: 'count', label: t('Countdown') },
    { id: 'plans', label: t('Plans') },
    { id: 'tokens', label: t('Tokenomics') },
  ];
  const grid = h('div', { class: 'dropgrid', 'data-pane': 'count' });
  const tabs = h(
    'div',
    { class: 'seg dropgrid__tabs', role: 'tablist' },
    ...panes.map((p) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-pressed': String(p.id === 'count'),
          'data-testid': `drop-pane-${p.id}`,
          onclick: (e: Event) => {
            grid.dataset.pane = p.id;
            for (const b of tabs.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === e.currentTarget));
          },
        },
        p.label,
      ),
    ),
  );
  count.classList.add('droppane', 'droppane--count');
  grid.append(tabs, count, plans, tokens);
  return grid;
}
