import { h, portrait, fmtDuration, plural } from '../dom.js';
import { amount, tokenWord } from './shop.js';
import { ACHIEVEMENTS, getMap, levelForXp, SCORING } from '@blatkom/shared';
import type { ResultsData } from '../../game/session/types.js';

export function renderResults(o: {
  results: ResultsData;
  myId: string;
  offline: boolean;
  /** Offline match counted towards the browser-only demo profile. */
  localProfile?: boolean;
  /** Replaces the default note under an offline table when there is no XP panel. */
  offlineNote?: string;
  onRematch: () => void;
  onMenu: () => void;
}): HTMLElement {
  const r = o.results;
  const top = r.standings[0];
  const draw = !!top && r.standings.length > 1 && r.standings[1]!.place === top.place;
  const winner = draw ? undefined : top;
  const reason = r.reason === 'score' ? 'Score limit reached' : r.reason === 'time' ? 'Time’s up' : 'Match called off';
  const me = r.standings.find((s) => s.id === o.myId);
  const personal = r.personal;
  const xpPanel = () => {
    if (!personal) return null;
    const lvl = levelForXp(personal.totalXp);
    const pct = lvl.nextLevelCost > 0 ? Math.round((lvl.intoLevel / lvl.nextLevelCost) * 100) : 100;
    return h(
      'div',
      { class: 'panel col xpgain' },
      h('span', { class: 'tag' }, 'Experience'),
      h('div', { class: 'row', style: 'margin-top:6px;flex-wrap:nowrap' }, h('div', { class: 'lvlbadge' }, h('small', null, 'LVL'), String(personal.level)), h('div', { class: 'h1 grow' }, `+${personal.xpGained} XP`)),
      h('div', { class: 'xpbar' }, h('i', { style: `width:${pct}%` })),
      h('div', { class: 'muted' }, personal.leveledUp ? `Promoted — level ${personal.level}!` : lvl.nextLevelCost > 0 ? `${lvl.intoLevel} / ${lvl.nextLevelCost} to level ${personal.level + 1}` : 'Top level'),
      personal.tokensGained !== undefined
        ? h('div', { class: 'row tokens-gain' }, h('b', null, '+', amount(personal.tokensGained, 'tokens')), h('span', { class: 'muted' }, `${tokenWord(personal.tokensGained)} · ${personal.totalTokens ?? 0} in total — spend them in the Arsenal`))
        : null,
      ...personal.newAchievements.map((a) => h('div', { class: 'ach' }, h('div', { class: 'ico' }, '★'), h('div', { class: 'col', style: 'gap:2px' }, h('div', { class: 't' }, ACHIEVEMENTS[a].title), h('div', { class: 'muted' }, ACHIEVEMENTS[a].description)))),
      o.localProfile ? h('div', { class: 'muted', style: 'font-size:14px' }, 'Local profile — kept in this browser.') : null,
    );
  };
  return h(
    'div',
    { class: 'screen screen--solid' },
    h(
      'div',
      { class: 'wrap' },
      h('div', { class: 'row' }, h('span', { class: 'tag' }, 'Match report'), h('span', { class: 'muted' }, `${getMap(r.mapId).name} · ${fmtDuration(r.durationMs)} · ${reason}`)),
      winner
        ? h(
            'div',
            { class: 'panel row' },
            portrait(winner.character),
            h(
              'div',
              { class: 'col', style: 'gap:2px' },
              h('div', { class: 'muted' }, 'Boss of the district'),
              h('div', { class: 'h1' }, winner.name),
              h('div', { class: 'hand' }, `${winner.score} ${plural(winner.score, 'point')} · ${winner.kills} ${plural(winner.kills, 'elimination')} · ${winner.assists} ${plural(winner.assists, 'assist')}`),
            ),
          )
        : draw
          ? h('div', { class: 'panel col' }, h('div', { class: 'h1' }, 'Draw'), h('div', { class: 'hand' }, 'The district is left without a boss — settle it in the rematch.'))
          : null,
      h(
        'div',
        { class: 'panel table-scroll' },
        h(
          'table',
          { class: 'table' },
          h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Player'), h('th', { class: 'num' }, 'Elim'), h('th', { class: 'num' }, 'Ast'), h('th', { class: 'num' }, 'Deaths'), h('th', { class: 'num' }, 'Points'))),
          h(
            'tbody',
            null,
            ...r.standings.map((s) =>
              h(
                'tr',
                { class: s.id === o.myId ? 'me' : '' },
                h('td', null, String(s.place)),
                h('td', null, s.isBot ? `${s.name} · bot` : s.name),
                h('td', { class: 'num' }, String(s.kills)),
                h('td', { class: 'num' }, String(s.assists)),
                h('td', { class: 'num' }, String(s.deaths)),
                h('td', { class: 'num' }, String(s.score)),
              ),
            ),
          ),
        ),
      ),
      h('div', { class: 'muted', style: 'font-size:14px' }, `Points: elimination +${SCORING.killPoints}, assist +${SCORING.assistPoints} (${SCORING.assistMinDamage}+ damage to the opponent within ${SCORING.assistWindowMs / 1000} s before they are eliminated).`),
      personal ? xpPanel() : o.offline ? h('div', { class: 'muted' }, o.offlineNote ?? 'Practice doesn’t count towards the online profile or XP.') : h('div', { class: 'muted' }, me ? 'Filing the results…' : ''),
      h('div', { class: 'row' }, h('button', { class: 'btn btn--red grow', onclick: o.onRematch }, o.offline ? 'Again' : 'Rematch'), h('button', { class: 'btn grow', onclick: o.onMenu }, 'To menu')),
    ),
  );
}
