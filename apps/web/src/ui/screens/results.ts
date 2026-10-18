import { h, portrait, fmtDuration } from '../dom.js';
import { ACHIEVEMENTS, getMap } from '@blatkom/shared';
import type { ResultsData } from '../../game/session/types.js';

export function renderResults(o: { results: ResultsData; myId: string; offline: boolean; onRematch: () => void; onMenu: () => void }): HTMLElement {
  const r = o.results;
  const top = r.standings[0];
  const draw = !!top && r.standings.length > 1 && r.standings[1]!.place === top.place;
  const winner = draw ? undefined : top;
  const reason = r.reason === 'score' ? 'Достигнут лимит устранений' : r.reason === 'time' ? 'Время вышло' : 'Матч прерван';
  const me = r.standings.find((s) => s.id === o.myId);
  const personal = r.personal;
  return h(
    'div',
    { class: 'screen screen--solid' },
    h(
      'div',
      { class: 'wrap' },
      h('div', { class: 'row' }, h('span', { class: 'tag' }, 'Итоги матча'), h('span', { class: 'muted' }, `${getMap(r.mapId).name} · ${fmtDuration(r.durationMs)} · ${reason}`)),
      winner
        ? h('div', { class: 'panel row' }, portrait(winner.character), h('div', { class: 'col', style: 'gap:2px' }, h('div', { class: 'muted' }, 'Хозяин района'), h('div', { class: 'h1' }, winner.name), h('div', { class: 'hand' }, `${winner.kills} устранений`)))
        : draw
          ? h('div', { class: 'panel col' }, h('div', { class: 'h1' }, 'Ничья'), h('div', { class: 'hand' }, 'Район остался без хозяина — разберётесь в реванше.'))
          : null,
      h(
        'div',
        { class: 'panel' },
        h(
          'table',
          { class: 'table' },
          h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Игрок'), h('th', { class: 'num' }, 'Устр.'), h('th', { class: 'num' }, 'Смерти'), h('th', { class: 'num' }, 'Очки'))),
          h(
            'tbody',
            null,
            ...r.standings.map((s) =>
              h(
                'tr',
                { class: s.id === o.myId ? 'me' : '' },
                h('td', null, String(s.place)),
                h('td', null, s.isBot ? `${s.name} · бот` : s.name),
                h('td', { class: 'num' }, String(s.kills)),
                h('td', { class: 'num' }, String(s.deaths)),
                h('td', { class: 'num' }, String(s.score)),
              ),
            ),
          ),
        ),
      ),
      o.offline
        ? h('div', { class: 'muted' }, 'Тренировка не влияет на профиль и опыт.')
        : personal
          ? h(
              'div',
              { class: 'panel col' },
              h('span', { class: 'tag' }, 'Опыт'),
              h('div', { class: 'h1' }, `+${personal.xpGained} опыта`),
              h('div', { class: 'muted' }, `Уровень ${personal.level}${personal.leveledUp ? ' — новый уровень!' : ''}`),
              ...personal.newAchievements.map((a) => h('div', { class: 'ach' }, h('div', { class: 'ico' }, '★'), h('div', { class: 'col', style: 'gap:2px' }, h('div', { class: 't' }, ACHIEVEMENTS[a].title), h('div', { class: 'muted' }, ACHIEVEMENTS[a].description)))),
            )
          : h('div', { class: 'muted' }, me ? 'Сохраняем результаты…' : ''),
      h('div', { class: 'row' }, h('button', { class: 'btn btn--red grow', onclick: o.onRematch }, o.offline ? 'Ещё раз' : 'Реванш'), h('button', { class: 'btn grow', onclick: o.onMenu }, 'В меню')),
    ),
  );
}
