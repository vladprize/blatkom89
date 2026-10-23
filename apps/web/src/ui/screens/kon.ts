/**
 * «Блатной кон» (V2.0 part D): ranked matches with fixed sides — 1×1, 2×2, 3×3, 5×5 — people only.
 * The player's Kon numbers, the format, «Find opponents» (a public Kon room that starts by itself when
 * full) and «Create a room» (invite friends, pick the map and the sides), the tables of players and
 * gangs, the player's Kon matches. No stakes: the Kon rating is all that is at stake.
 */
import { KON_FORMATS, KON_RULES, konConfig, DEFAULT_MATCH_CONFIG } from '@blatkom/shared';
import type { KonFormat, KonHistoryEntry, KonResponse, KonTopResponse } from '@blatkom/shared';
import { h } from '../dom.js';
import { getLang, plural, t } from '../../i18n/index.js';
import { mapName } from '../../i18n/content.js';

/** «2×2» */
export const konLabel = (f: KonFormat) => f.replace('x', '×');

/** The rules line of a format: «2 against 2 · to 15 eliminations · 4 min». */
export function konRules(f: KonFormat, durationMs?: number): string {
  const r = KON_RULES[f];
  const min = Math.round((durationMs ?? konConfig(DEFAULT_MATCH_CONFIG, f).durationMs) / 60_000);
  return t('{n} against {n} · to {limit} eliminations · {min} min', { n: r.size, limit: r.teamScoreLimit, min });
}

const when = (iso: string) => new Date(iso).toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

const OUTCOME: Record<KonHistoryEntry['outcome'], () => string> = {
  win: () => t('win'),
  loss: () => t('loss'),
  draw: () => t('draw'),
};

export function renderKon(o: {
  data: KonResponse;
  format: KonFormat;
  onFormat: (f: KonFormat) => void;
  onFind: () => void;
  onCreate: () => void;
  top: KonTopResponse | null;
  topBy: 'players' | 'gangs';
  onTop: (by: 'players' | 'gangs') => void;
  busy?: boolean;
}): HTMLElement {
  const me = o.data.me;
  const formats = h(
    'div',
    { class: 'seg kon__formats', role: 'radiogroup', 'aria-label': t('Format') },
    ...KON_FORMATS.map((f) =>
      h(
        'button',
        { role: 'radio', 'aria-pressed': String(f === o.format), 'aria-checked': String(f === o.format), 'data-testid': `kon-format-${f}`, onclick: () => f !== o.format && o.onFormat(f) },
        h('b', null, konLabel(f)),
        o.data.waiting[f] > 0 ? h('small', { class: 'kon__waiting' }, t('{n} waiting', { n: o.data.waiting[f] })) : null,
      ),
    ),
  );
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
      : h('div', { class: 'muted' }, o.topBy === 'gangs' ? t('No gang has played a Kon match yet.') : t('Nobody has played a Kon match yet — be the first.'))
    : h('div', { class: 'col center' }, h('div', { class: 'spinner' }));
  return h(
    'div',
    { class: 'col kon', 'data-testid': 'kon' },
    h(
      'div',
      { class: 'panel col kon__me' },
      h('span', { class: 'tag' }, t('Your Kon')),
      h(
        'div',
        { class: 'kon__stats' },
        h('div', { class: 'kon__rating', 'data-testid': 'kon-rating' }, h('b', null, String(me.rating)), h('small', null, t('Kon rating'))),
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
      h(
        'div',
        { class: 'row kon__actions' },
        h('button', { class: 'btn btn--red grow', 'data-testid': 'kon-find', disabled: !!o.busy, onclick: o.onFind }, t('Find opponents'), h('span', { class: 'sub' }, t('the match starts when both sides are full'))),
        h('button', { class: 'btn grow', 'data-testid': 'kon-create', disabled: !!o.busy, onclick: o.onCreate }, t('Create a room'), h('span', { class: 'sub' }, t('invite friends, pick the map and the sides'))),
      ),
      h('div', { class: 'kon__note' }, t('People only, no stakes: the Kon rating, wins and streaks are all that is at stake. $BLAT has nothing to do with it.')),
    ),
    h(
      'div',
      { class: 'kon__cols' },
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, t('Kon rating')),
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
        h('span', { class: 'tag' }, t('Your Kon matches')),
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
                  h('span', { class: 'muted konhist__who' }, `${mapName(e.mapId)} · ${t('vs {names}', { names: e.rivals.join(', ') || '—' })}`),
                  h('span', { class: 'muted konhist__kd' }, `${e.kills} ${plural(e.kills, 'elimination')}`),
                ),
              ),
            )
          : h('div', { class: 'muted' }, t('No Kon matches yet.')),
      ),
    ),
  );
}
