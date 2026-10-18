import { h, portrait, fmtDuration, plural } from '../dom.js';
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
  const reason = r.reason === 'score' ? 'Достигнут лимит очков' : r.reason === 'time' ? 'Время вышло' : 'Матч прерван';
  const me = r.standings.find((s) => s.id === o.myId);
  const personal = r.personal;
  const xpPanel = () => {
    if (!personal) return null;
    const lvl = levelForXp(personal.totalXp);
    const pct = lvl.nextLevelCost > 0 ? Math.round((lvl.intoLevel / lvl.nextLevelCost) * 100) : 100;
    return h(
      'div',
      { class: 'panel col xpgain' },
      h('span', { class: 'tag' }, 'Опыт'),
      h('div', { class: 'row', style: 'margin-top:6px;flex-wrap:nowrap' }, h('div', { class: 'lvlbadge' }, h('small', null, 'УР.'), String(personal.level)), h('div', { class: 'h1 grow' }, `+${personal.xpGained} опыта`)),
      h('div', { class: 'xpbar' }, h('i', { style: `width:${pct}%` })),
      h('div', { class: 'muted' }, personal.leveledUp ? `Новый уровень — ${personal.level}!` : lvl.nextLevelCost > 0 ? `${lvl.intoLevel} / ${lvl.nextLevelCost} до ${personal.level + 1}-го уровня` : 'Максимальный уровень'),
      ...personal.newAchievements.map((a) => h('div', { class: 'ach' }, h('div', { class: 'ico' }, '★'), h('div', { class: 'col', style: 'gap:2px' }, h('div', { class: 't' }, ACHIEVEMENTS[a].title), h('div', { class: 'muted' }, ACHIEVEMENTS[a].description)))),
      o.localProfile ? h('div', { class: 'muted', style: 'font-size:14px' }, 'Локальный профиль — хранится в этом браузере.') : null,
    );
  };
  return h(
    'div',
    { class: 'screen screen--solid' },
    h(
      'div',
      { class: 'wrap' },
      h('div', { class: 'row' }, h('span', { class: 'tag' }, 'Итоги матча'), h('span', { class: 'muted' }, `${getMap(r.mapId).name} · ${fmtDuration(r.durationMs)} · ${reason}`)),
      winner
        ? h(
            'div',
            { class: 'panel row' },
            portrait(winner.character),
            h(
              'div',
              { class: 'col', style: 'gap:2px' },
              h('div', { class: 'muted' }, 'Хозяин района'),
              h('div', { class: 'h1' }, winner.name),
              h('div', { class: 'hand' }, `${winner.score} ${plural(winner.score, ['очко', 'очка', 'очков'])} · ${winner.kills} ${plural(winner.kills, ['устранение', 'устранения', 'устранений'])} · помощь: ${winner.assists}`),
            ),
          )
        : draw
          ? h('div', { class: 'panel col' }, h('div', { class: 'h1' }, 'Ничья'), h('div', { class: 'hand' }, 'Район остался без хозяина — разберётесь в реванше.'))
          : null,
      h(
        'div',
        { class: 'panel table-scroll' },
        h(
          'table',
          { class: 'table' },
          h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Игрок'), h('th', { class: 'num' }, 'Устр.'), h('th', { class: 'num' }, 'Пом.'), h('th', { class: 'num' }, 'Смерти'), h('th', { class: 'num' }, 'Очки'))),
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
                h('td', { class: 'num' }, String(s.assists)),
                h('td', { class: 'num' }, String(s.deaths)),
                h('td', { class: 'num' }, String(s.score)),
              ),
            ),
          ),
        ),
      ),
      h('div', { class: 'muted', style: 'font-size:14px' }, `Очки: устранение +${SCORING.killPoints}, помощь +${SCORING.assistPoints} (от ${SCORING.assistMinDamage} урона по сопернику за ${SCORING.assistWindowMs / 1000} с до его устранения).`),
      personal ? xpPanel() : o.offline ? h('div', { class: 'muted' }, o.offlineNote ?? 'Тренировка не влияет на онлайн-профиль и опыт.') : h('div', { class: 'muted' }, me ? 'Сохраняем результаты…' : ''),
      h('div', { class: 'row' }, h('button', { class: 'btn btn--red grow', onclick: o.onRematch }, o.offline ? 'Ещё раз' : 'Реванш'), h('button', { class: 'btn grow', onclick: o.onMenu }, 'В меню')),
    ),
  );
}
