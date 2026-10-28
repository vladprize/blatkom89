/**
 * The $BLAT Tournament (V2.0 part D «Блатной кон», renamed and staked in v0.2.17): ranked matches with
 * fixed sides — 1×1, 2×2, 3×3, 5×5 — people only. The player's tournament numbers, the format, the stake
 * (everyone stakes the same, the winners take the pool — or no stake: the tournament rating only),
 * «Find opponents» (a public room of the format and the stake that starts by itself when full) and
 * «Create a room» (invite friends, pick the map and the sides), the tables of players and gangs, the
 * player's matches with what they won or lost.
 */
import { KON_FORMATS, KON_RULES, KON_STAKE_AMOUNTS, konConfig, DEFAULT_MATCH_CONFIG } from '@blatkom/shared';
import type { KonFormat, KonHistoryEntry, KonResponse, KonStake, KonTopResponse } from '@blatkom/shared';
import { h } from '../dom.js';
import { getLang, plural, t } from '../../i18n/index.js';
import { mapName } from '../../i18n/content.js';
import { blatCoin, fmtBlat } from './blat.js';
import { openSheet } from '../sheet.js';

/** «2×2» */
export const konLabel = (f: KonFormat) => f.replace('x', '×');

/** The rules line of a format: «2 against 2 · to 15 eliminations · 4 min». */
export function konRules(f: KonFormat, durationMs?: number): string {
  const r = KON_RULES[f];
  const min = Math.round((durationMs ?? konConfig(DEFAULT_MATCH_CONFIG, f).durationMs) / 60_000);
  return t('{n} against {n} · to {limit} eliminations · {min} min', { n: r.size, limit: r.teamScoreLimit, min });
}

/** The pool of a full room: everyone's stake together. */
export const konPool = (f: KonFormat, stake: number) => KON_RULES[f].size * 2 * stake;

/** The stake line: «Stake 500 $BLAT each · pool 2 000». */
export function stakeLine(f: KonFormat, stake: number): string {
  return t('Stake {stake} $BLAT each · pool {pool}', { stake: fmtBlat(stake), pool: fmtBlat(konPool(f, stake)) });
}

/**
 * The tournament's icon: a gold cup with the $BLAT coin (the menu's button, the screen's title). Drawn
 * on a 16-pixel grid so it stays crisp at 2× and 3×.
 */
export function tourneyIcon(size = 32): HTMLElement {
  const r = (x: number, y: number, w: number, hh: number, c: string) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${c}"/>`;
  const svg =
    `<svg viewBox="0 0 16 16" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">` +
    // handles, the bowl (rim, shine, shade), the stem and the base
    r(2, 3, 2, 1, '#b8862a') + r(2, 3, 1, 4, '#b8862a') + r(2, 6, 3, 1, '#b8862a') + r(12, 3, 2, 1, '#b8862a') + r(13, 3, 1, 4, '#b8862a') + r(11, 6, 3, 1, '#b8862a') +
    r(4, 2, 8, 5, '#f6d675') + r(5, 7, 6, 1, '#e2b34a') + r(6, 8, 4, 1, '#d9a53a') + r(4, 2, 8, 1, '#fff3c4') + r(10, 3, 2, 4, '#d9a53a') + r(5, 3, 1, 3, '#fffbe6') +
    r(7, 9, 2, 2, '#b8862a') + r(5, 11, 6, 1, '#e2b34a') + r(4, 12, 8, 2, '#7a5410') + r(5, 12, 6, 1, '#b8862a') +
    `</svg>`;
  const el = h('span', { class: 'tourney-icon', style: `width:${size}px;height:${size}px` });
  el.innerHTML = svg;
  el.append(blatCoin(16, ''));
  return el;
}

const when = (iso: string) => new Date(iso).toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const signedBlat = (n: number) => (n > 0 ? `+${fmtBlat(n)}` : n < 0 ? `−${fmtBlat(-n)}` : '0');

const OUTCOME: Record<KonHistoryEntry['outcome'], () => string> = {
  win: () => t('win'),
  loss: () => t('loss'),
  draw: () => t('draw'),
};

/**
 * Asks once more before a staked match: the stake, the pool and the rules. `onYes` — the player agreed;
 * `onNo` — they closed it.
 */
export function confirmStake(root: HTMLElement, o: { format: KonFormat; stake: number; onYes: () => void; onNo?: () => void }): void {
  let yes = false;
  const sheet = openSheet(root, {
    title: t('Stake {n} $BLAT', { n: fmtBlat(o.stake) }),
    testid: 'stake-confirm',
    onClose: () => {
      if (yes) o.onYes();
      else o.onNo?.();
    },
    body: h(
      'div',
      { class: 'col stakeconfirm' },
      h('div', { class: 'stakeconfirm__big' }, blatCoin(32, ''), h('b', null, fmtBlat(o.stake)), h('span', null, t('from each player'))),
      h('div', { class: 'muted' }, `${konLabel(o.format)} · ${t('pool {n} $BLAT', { n: fmtBlat(konPool(o.format, o.stake)) })}`),
      h(
        'ul',
        { class: 'stakeconfirm__rules' },
        h('li', null, t('Everyone stakes the same; the stake is taken when the match starts.')),
        h('li', null, t('The winning side shares the whole pool equally.')),
        h('li', null, t('A draw — every stake comes back.')),
        h('li', null, t('Leave the match — your stake stays in the pool.')),
        h('li', null, t('If the match breaks off, the stakes come back.')),
      ),
      h('div', { class: 'muted stakeconfirm__note' }, t('$BLAT are in-game points: they can’t be bought, sold or withdrawn.')),
    ),
    actions: h(
      'div',
      { class: 'row stakeconfirm__actions' },
      h('button', { class: 'btn grow', 'data-testid': 'stake-cancel', onclick: () => sheet.close() }, t('Cancel')),
      h(
        'button',
        {
          class: 'btn btn--red grow',
          'data-testid': 'stake-yes',
          onclick: () => {
            yes = true;
            sheet.close();
          },
        },
        t('I stake {n}', { n: fmtBlat(o.stake) }),
      ),
    ),
  });
}

/** The stake the player can actually play for now (a stake they can't afford falls back to none). */
export function playableStake(data: KonResponse, stake: KonStake): KonStake {
  const st = data.stakes;
  return stake === 0 || (!!st && st.enabled && st.refusal === null && st.balance >= stake && st.dailyLeft >= stake) ? stake : 0;
}

export function renderKon(o: {
  data: KonResponse;
  format: KonFormat;
  onFormat: (f: KonFormat) => void;
  stake: KonStake;
  onStake: (s: KonStake) => void;
  onFind: () => void;
  onCreate: () => void;
  top: KonTopResponse | null;
  topBy: 'players' | 'gangs';
  onTop: (by: 'players' | 'gangs') => void;
  busy?: boolean;
}): HTMLElement {
  const me = o.data.me;
  const st = o.data.stakes;
  // what may be staked now (the server checks again)
  const can = (s: KonStake) => playableStake(o.data, s) === s;
  const stake = playableStake(o.data, o.stake);
  const waiting = o.data.waitingByStake?.[String(stake)] ?? (stake === 0 ? o.data.waiting : null);
  const formats = h(
    'div',
    { class: 'seg kon__formats', role: 'radiogroup', 'aria-label': t('Format') },
    ...KON_FORMATS.map((f) =>
      h(
        'button',
        { role: 'radio', 'aria-pressed': String(f === o.format), 'aria-checked': String(f === o.format), 'data-testid': `kon-format-${f}`, onclick: () => f !== o.format && o.onFormat(f) },
        h('b', null, konLabel(f)),
        waiting && waiting[f] > 0 ? h('small', { class: 'kon__waiting' }, t('{n} waiting', { n: waiting[f] })) : null,
      ),
    ),
  );
  const stakesOn = !!st && st.enabled;
  const stakes = stakesOn
    ? h(
        'div',
        { class: 'seg kon__stakes', role: 'radiogroup', 'aria-label': t('Stake') },
        h('button', { role: 'radio', 'aria-pressed': String(stake === 0), 'aria-checked': String(stake === 0), 'data-testid': 'kon-stake-0', onclick: () => stake !== 0 && o.onStake(0) }, h('b', null, t('No stake')), h('small', null, t('rating only'))),
        ...KON_STAKE_AMOUNTS.map((s) =>
          h(
            'button',
            { role: 'radio', 'aria-pressed': String(s === stake), 'aria-checked': String(s === stake), 'data-testid': `kon-stake-${s}`, disabled: !can(s), onclick: () => s !== stake && o.onStake(s) },
            h('b', null, blatCoin(16, ''), fmtBlat(s)),
            h('small', null, t('pool {n}', { n: fmtBlat(konPool(o.format, s)) })),
          ),
        ),
      )
    : null;
  const stakeNote = !st
    ? null
    : !st.enabled
      ? t('Stakes are switched off for now — the tournament plays for the rating.')
      : st.refusal === 'account_new'
        ? t('Stakes open on the account’s second day ({when}). Until then — the tournament for the rating.', { when: st.from ? when(st.from) : '—' })
        : st.refusal === 'blat_flagged'
          ? t('Your $BLAT are being checked — stakes aren’t available until it’s done.')
          : t('Your $BLAT: {n} · today you can still stake {left}', { n: fmtBlat(st.balance), left: fmtBlat(st.dailyLeft) });
  const topTable = o.top
    ? o.top.rows.length
      ? h(
          'div',
          { class: 'kontop', 'data-testid': 'kon-top' },
          ...o.top.rows.map((r) =>
            h(
              'div',
              { class: 'kontop__row', 'data-me': String(o.top!.me?.id === r.id) },
              h('span', { class: 'kontop__place' }, String(r.place)),
              h('span', { class: 'kontop__name' }, r.tag ? `[${r.tag}] ${r.name}` : r.name),
              h('b', { class: 'kontop__rating' }, String(r.rating)),
              h('span', { class: 'muted kontop__rec' }, `${r.wins}–${r.losses}–${r.draws}`),
            ),
          ),
          o.top.me && o.top.me.place > 100 ? h('div', { class: 'kontop__row', 'data-me': 'true' }, h('span', { class: 'kontop__place' }, String(o.top.me.place)), h('span', { class: 'kontop__name' }, o.top.me.name), h('b', { class: 'kontop__rating' }, String(o.top.me.rating)), h('span', { class: 'muted kontop__rec' }, `${o.top.me.wins}–${o.top.me.losses}–${o.top.me.draws}`)) : null,
        )
      : h('div', { class: 'muted' }, o.topBy === 'gangs' ? t('No gang has played a tournament match yet.') : t('Nobody has played a tournament match yet — be the first.'))
    : h('div', { class: 'col center' }, h('div', { class: 'spinner' }));
  return h(
    'div',
    { class: 'col kon', 'data-testid': 'kon' },
    h(
      'div',
      { class: 'panel col kon__me' },
      h('span', { class: 'tag' }, t('Your tournament')),
      h(
        'div',
        { class: 'kon__stats' },
        h('div', { class: 'kon__rating', 'data-testid': 'kon-rating' }, h('b', null, String(me.rating)), h('small', null, t('Tournament rating'))),
        h('div', { class: 'kon__rec' }, h('b', { 'data-testid': 'kon-wins' }, String(me.wins)), h('small', null, t('won'))),
        h('div', { class: 'kon__rec' }, h('b', { 'data-testid': 'kon-losses' }, String(me.losses)), h('small', null, t('lost'))),
        h('div', { class: 'kon__rec' }, h('b', null, String(me.draws)), h('small', null, t('drawn'))),
        h('div', { class: 'kon__rec' }, h('b', null, String(me.streak)), h('small', null, t('streak (best {n})', { n: me.bestStreak }))),
      ),
    ),
    h(
      'div',
      { class: 'panel col kon__play' },
      h('span', { class: 'tag' }, t('Format')),
      formats,
      h('div', { class: 'muted kon__rules', 'data-testid': 'kon-rules' }, konRules(o.format)),
      stakes ? h('div', { class: 'kon__stakehead' }, h('b', null, t('Stake')), h('span', { class: 'muted' }, t('everyone stakes the same — the winners take the pool'))) : null,
      stakes,
      stakeNote ? h('div', { class: 'muted kon__stakenote', 'data-testid': 'kon-stake-note' }, stakeNote) : null,
      h(
        'div',
        { class: 'row kon__actions' },
        h(
          'button',
          { class: 'btn btn--red grow', 'data-testid': 'kon-find', disabled: !!o.busy, onclick: o.onFind },
          stake > 0 ? t('Find opponents · {n}', { n: fmtBlat(stake) }) : t('Find opponents'),
          h('span', { class: 'sub' }, stake > 0 ? t('pool {n} $BLAT · starts when both sides are full', { n: fmtBlat(konPool(o.format, stake)) }) : t('the match starts when both sides are full')),
        ),
        h('button', { class: 'btn grow', 'data-testid': 'kon-create', disabled: !!o.busy, onclick: o.onCreate }, t('Create a room'), h('span', { class: 'sub' }, stake > 0 ? t('with a stake of {n} — invite friends', { n: fmtBlat(stake) }) : t('invite friends, pick the map and the sides'))),
      ),
      h(
        'div',
        { class: 'kon__note' },
        stakesOn
          ? t('People only. Everyone stakes the same; the winning side shares the pool, a draw returns the stakes, a leaver’s stake stays in the pool. Without a stake — the tournament rating, wins and streaks.')
          : t('People only: the tournament rating, wins and streaks are what is at stake.'),
      ),
    ),
    h(
      'div',
      { class: 'kon__cols' },
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, t('Tournament rating')),
        h(
          'div',
          { class: 'seg seg--tiny kon__topby', role: 'tablist' },
          h('button', { 'aria-pressed': String(o.topBy === 'players'), 'data-testid': 'kon-top-players', onclick: () => o.topBy !== 'players' && o.onTop('players') }, t('Players')),
          h('button', { 'aria-pressed': String(o.topBy === 'gangs'), 'data-testid': 'kon-top-gangs', onclick: () => o.topBy !== 'gangs' && o.onTop('gangs') }, t('Gangs')),
        ),
        topTable,
      ),
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, t('Your tournament matches')),
        o.data.history.length
          ? h(
              'div',
              { class: 'konhist', 'data-testid': 'kon-history' },
              ...o.data.history.map((e) =>
                h(
                  'div',
                  { class: 'konhist__row', 'data-outcome': e.outcome },
                  h('span', { class: 'muted konhist__when' }, when(e.endedAt)),
                  h('b', { class: 'konhist__fmt' }, konLabel(e.format)),
                  h('span', { class: 'konhist__res' }, e.left ? t('left — loss') : OUTCOME[e.outcome]()),
                  h('b', { class: 'konhist__delta' }, signed(e.delta)),
                  h(
                    'span',
                    { class: 'muted konhist__who' },
                    `${mapName(e.mapId)} · ${t('vs {names}', { names: e.rivals.join(', ') || '—' })}`,
                    e.stake ? h('span', { class: 'konhist__stake', 'data-sign': (e.payout ?? 0) - e.stake > 0 ? 'plus' : (e.payout ?? 0) - e.stake < 0 ? 'minus' : 'zero' }, ` · ${signedBlat((e.payout ?? 0) - e.stake)} $BLAT`) : null,
                  ),
                  h('span', { class: 'muted konhist__kd' }, `${e.kills} ${plural(e.kills, 'elimination')}`),
                ),
              ),
            )
          : h('div', { class: 'muted' }, t('No tournament matches yet.')),
      ),
    ),
  );
}
