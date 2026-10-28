/**
 * $BLAT (V2.0): the balance, where it came from, the level rewards and the referral programme with the
 * player's own link. In-game points only — the screen says so plainly; nothing here can be bought, sold
 * or withdrawn (since v0.2.17 they change hands only as $BLAT Tournament stakes), and no price or market
 * value is ever shown.
 */
import { REFERRAL_TIERS, blatForLevel } from '@blatkom/shared';
import type { BlatEntry, BlatResponse } from '@blatkom/shared';
import { asset, h, toast, fill } from '../dom.js';
import { getLang, t } from '../../i18n/index.js';
import { shareInvite } from '../../telegram/tg.js';
import { inPane, paneTabs } from '../panes.js';

/**
 * The pixel coin: 16 px art (the bigger files are exact 2×/4×/8× copies). The largest file whose size
 * divides the shown size is scaled by a whole number, so every pixel stays square (48 → the 16 px file
 * ×3, 96 → 32 ×3, 128 → 128).
 */
export function blatCoin(size = 16, alt = ''): HTMLImageElement {
  const file = [128, 64, 32, 16].find((s) => size % s === 0) ?? 128;
  return h('img', { class: 'blatcoin', src: asset(`assets/ui/blat_coin_${file}.png`), width: String(size), height: String(size), alt, draggable: 'false' }) as HTMLImageElement;
}

/** 12 345 678 (Russian) / 12,345,678 (English). */
export function fmtBlat(n: number): string {
  return new Intl.NumberFormat(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { maximumFractionDigits: 0 }).format(n);
}

/** A balance with the coin: «🪙 12 345». */
export function blatAmount(n: number, size = 16): HTMLElement {
  return h('span', { class: 'blatamt' }, blatCoin(size), h('b', null, fmtBlat(n)));
}

const when = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

function source(e: BlatEntry): string {
  if (e.source === 'level') return t('Level {n}', { n: Number((e.ref ?? '').replace('level:', '')) || '?' });
  if (e.source === 'referral') return e.who ? t('Invitation: {name}', { name: e.who }) : t('Invitation');
  // v0.2.17: the $BLAT Tournament's stakes and the pools' allocations
  if (e.source === 'stake') return t('Stake in the $BLAT Tournament');
  if (e.source === 'stake_win') return t('Won in the $BLAT Tournament');
  if (e.source === 'stake_refund') return t('Stake returned');
  if (e.source === 'allocation') return t('Allocation');
  return t('From the administration');
}

const STATUS: Record<BlatResponse['referral']['recent'][number]['status'], () => string> = {
  pending: () => t('waiting for their first match'),
  confirmed: () => t('counted'),
  held: () => t('being checked'),
  rejected: () => t('not counted'),
};

/** `banner` (v0.2.17): the BLAT DROP banner with its live countdown, under «For levels». */
export function renderBlat(d: BlatResponse, banner: HTMLElement | null = null): HTMLElement {
  const r = d.referral;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.link);
      toast(t('Link copied'));
    } catch {
      toast(r.link);
    }
  };
  const share = () => {
    if (!shareInvite(r.link, t('Come to BLATKOM ’89 — district business is serious business.'))) void copy();
  };
  const upcoming = Array.from({ length: 5 }, (_, i) => d.level + 1 + i).filter((l) => blatForLevel(l) > 0);
  const scale = REFERRAL_TIERS.map((tier, i) => {
    const next = REFERRAL_TIERS[i + 1];
    const label = next ? `${tier.from}–${next.from - 1}` : `${tier.from}+`;
    return h('span', { class: 'blatscale__step', 'data-active': String(r.confirmed + 1 >= tier.from && (!next || r.confirmed + 1 < next.from)) }, h('small', null, label), h('b', null, fmtBlat(tier.reward)));
  });
  const balance = inPane(h(
      'div',
      { class: 'panel col blat__balance' },
      h('span', { class: 'tag' }, t('Balance')),
      h('div', { class: 'blat__big', 'data-testid': 'blat-balance' }, blatCoin(48, '$BLAT'), h('b', null, fmtBlat(d.balance))),
      h('div', { class: 'muted' }, t('Earned in total: {n} · for levels {l} · for invitations {r}', { n: fmtBlat(d.earned), l: fmtBlat(d.bySource.level), r: fmtBlat(d.bySource.referral) })),
      h('div', { class: 'blat__note' }, t('In-game points, not money: they can’t be bought, sold or withdrawn and change hands only as stakes in the $BLAT Tournament. The $BLAT drop is planned in the Solana network.')),
    ), 'a');
  const levels = inPane(h(
        'div',
        { class: 'panel col blat__levels' },
        h('span', { class: 'tag' }, t('For levels')),
        h('div', null, t('Every new level pays once. You are at level {l}.', { l: d.level })),
        d.nextLevel ? h('div', { class: 'blat__next' }, t('Next: level {l}', { l: d.nextLevel.level }), ' ', blatAmount(d.nextLevel.reward)) : null,
        h('div', { class: 'blatlevels' }, ...upcoming.map((l) => h('span', { class: 'blatlevels__step' }, h('small', null, t('lvl {l}', { l })), h('b', null, fmtBlat(blatForLevel(l)))))),
        banner ? h('div', { class: 'blat__banner' }, banner) : null,
      ), 'a');
  const invite = inPane(h(
        'div',
        { class: 'panel col blat__invite', 'data-testid': 'blat-referral' },
        h('span', { class: 'tag' }, t('Invite friends')),
        h('div', { class: 'blat__link' }, h('input', { class: 'input', readonly: true, value: r.link, 'aria-label': t('Your link'), 'data-testid': 'blat-link', onfocus: (e: Event) => (e.target as HTMLInputElement).select() })),
        h(
          'div',
          { class: 'row blat__actions' },
          h('button', { class: 'btn btn--red btn--small', 'data-testid': 'blat-copy', onclick: () => void copy() }, t('Copy')),
          h('button', { class: 'btn btn--small', 'data-testid': 'blat-share', onclick: share }, t('Share')),
        ),
        h(
          'div',
          { class: 'blatstats' },
          ...[
            [t('invited'), r.invited, 'blat-invited'],
            [t('counted'), r.confirmed, 'blat-confirmed'],
            [t('waiting'), r.pending, 'blat-pending'],
            [t('being checked'), r.held, 'blat-held'],
          ].map(([label, n, id]) => h('span', { class: 'blatstats__item', 'data-testid': String(id) }, h('b', null, String(n)), h('small', null, String(label)))),
        ),
        h('div', null, t('Earned for invitations: {n}. The next friend brings {next}.', { n: fmtBlat(r.earned), next: fmtBlat(r.nextReward) })),
        h('div', { class: 'muted' }, t('A friend counts when they open the game through your link, get an account and play a whole online match. Players who already had an account don’t count.')),
        h('div', { class: 'blatscale' }, ...scale),
        r.recent.length
          ? h(
              'div',
              { class: 'blatrecent' },
              ...r.recent.map((x) => h('div', { class: 'blatrecent__row', 'data-status': x.status }, h('b', null, x.name), h('span', { class: 'muted' }, STATUS[x.status]()), x.reward > 0 ? blatAmount(x.reward) : null)),
            )
          : null,
      ), 'b');
  const history = inPane(h(
      'div',
      { class: 'panel col blat__history' },
      h('span', { class: 'tag' }, t('History')),
      d.history.length
        ? h(
            'div',
            { class: 'blathist', 'data-testid': 'blat-history' },
            ...d.history.map((e) =>
              h(
                'div',
                { class: 'blathist__row', 'data-sign': e.delta < 0 ? 'minus' : 'plus' },
                h('span', { class: 'muted' }, when(e.at)),
                h('b', { class: 'blathist__delta' }, e.delta < 0 ? `−${fmtBlat(-e.delta)}` : `+${fmtBlat(e.delta)}`),
                h('span', null, source(e)),
              ),
            ),
          )
        : h('div', { class: 'muted' }, t('Nothing yet.')),
    ), 'c');
  // v0.2.17: the balance fits the window — the balance and the levels on the left, the invitations and the
  // history on the right (the history scrolls in its panel); phones: one part at a time
  const root = h('div', { class: 'col blat fitcol', 'data-testid': 'blat' });
  const tabs = paneTabs(root, 'blat', [
    { id: 'a', label: t('Balance'), testid: 'blat-pane-balance' },
    { id: 'b', label: t('Friends'), testid: 'blat-pane-friends' },
    { id: 'c', label: t('History'), testid: 'blat-pane-history' },
  ]);
  fill(root, tabs, h('div', { class: 'col blat__col' }, balance, levels), h('div', { class: 'col blat__col' }, invite, history));
  return root;
}
