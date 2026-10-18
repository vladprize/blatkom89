/** Profile screen («Досье»): nickname, level and XP, statistics, achievements, recent matches. */
import { h, fmtDuration } from '../dom.js';
import { getMap, CHARACTERS } from '@blatkom/shared';
import type { AchievementStatus, MatchHistoryEntry, PublicProfile } from '@blatkom/shared';
import type { OnlineClient } from '../../net/OnlineClient.js';

export interface ProfileData {
  profile: PublicProfile;
  history: Array<Omit<MatchHistoryEntry, 'endedAt'> & { endedAt?: string }>;
  achievements: AchievementStatus[];
}

export async function loadOnlineProfile(online: OnlineClient): Promise<ProfileData> {
  const [profile, hist, ach] = await Promise.all([online.refreshProfile(), online.api.history().catch(() => ({ matches: [] })), online.api.achievements().catch(() => ({ achievements: [] }))]);
  return { profile, history: hist.matches, achievements: ach.achievements };
}

export function renderProfileView(d: ProfileData, o: { local: boolean; onRename: () => void }): HTMLElement {
  const p = d.profile;
  const kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : String(p.kills);
  const pct = p.xpForNextLevel > 0 ? Math.round((p.xpIntoLevel / p.xpForNextLevel) * 100) : 100;
  const stat = (v: string | number, label: string) => h('div', { class: 'stat' }, h('b', null, String(v)), h('span', null, label));
  const hours = Math.floor(p.playtimeSec / 3600);
  const mins = Math.floor((p.playtimeSec % 3600) / 60);
  const unlocked = d.achievements.filter((a) => a.unlockedAt).length;
  return h(
    'div',
    { class: 'col' },
    h(
      'div',
      { class: 'panel col' },
      h('span', { class: 'tag' }, 'Досье'),
      h(
        'div',
        { class: 'row', style: 'margin-top:6px;flex-wrap:nowrap' },
        h('div', { class: 'lvlbadge lvlbadge--big', title: 'Уровень' }, h('small', null, 'УР.'), String(p.level)),
        h('div', { class: 'h1 grow nick-line', 'data-testid': 'profile-name' }, p.displayName),
        h('button', { class: 'btn btn--small', onclick: o.onRename, 'aria-label': 'Сменить кличку' }, '✎ Кличка'),
      ),
      h('div', { class: 'xpbar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i', { style: `width:${pct}%` })),
      h('div', { class: 'muted' }, p.xpForNextLevel > 0 ? `${p.xpIntoLevel} / ${p.xpForNextLevel} опыта до ${p.level + 1}-го уровня · всего ${p.xp}` : `Максимальный уровень · ${p.xp} опыта`),
      o.local ? h('div', { class: 'muted', style: 'font-size:14px' }, 'Локальный профиль: хранится только в этом браузере. Опыт идёт за тренировки с ботами.') : null,
    ),
    h(
      'div',
      { class: 'panel col' },
      h('span', { class: 'tag' }, 'Статистика'),
      h(
        'div',
        { class: 'stats', style: 'margin-top:6px' },
        stat(p.matchesPlayed, 'матчей'),
        stat(p.wins, 'побед'),
        stat(p.losses, 'поражений'),
        stat(p.kills, 'устранений'),
        stat(p.assists, 'помощи'),
        stat(p.deaths, 'смертей'),
        stat(kd, 'У/С'),
        stat(p.bestWinStreak, 'лучшая серия'),
        stat(`${hours} ч ${mins} мин`, 'в игре'),
      ),
    ),
    h(
      'div',
      { class: 'panel col' },
      h('span', { class: 'tag' }, `Достижения · ${unlocked}/${d.achievements.length}`),
      h('div', { style: 'height:4px' }),
      d.achievements.length === 0 ? h('div', { class: 'muted' }, 'Нет данных') : null,
      ...d.achievements.map((a) => h('div', { class: `ach ${a.unlockedAt ? '' : 'locked'}` }, h('div', { class: 'ico' }, a.unlockedAt ? '★' : '☆'), h('div', { class: 'col', style: 'gap:2px' }, h('div', { class: 't' }, a.title), h('div', { class: 'muted' }, a.description)))),
    ),
    h(
      'div',
      { class: 'panel col' },
      h('span', { class: 'tag' }, 'Последние матчи'),
      h('div', { style: 'height:4px' }),
      d.history.length === 0
        ? h('div', { class: 'muted' }, 'Ещё не было сыгранных матчей.')
        : h(
            'div',
            { class: 'table-scroll' },
            h(
              'table',
              { class: 'table' },
              h('thead', null, h('tr', null, h('th', null, 'Карта'), h('th', null, 'Персонаж'), h('th', { class: 'num' }, 'Место'), h('th', { class: 'num' }, 'Устр.'), h('th', { class: 'num' }, 'Пом.'), h('th', { class: 'num' }, 'См.'), h('th', { class: 'num' }, 'Опыт'), h('th', { class: 'num' }, 'Время'))),
              h(
                'tbody',
                null,
                ...d.history.slice(0, 15).map((m) =>
                  h(
                    'tr',
                    m.won ? { class: 'won' } : null,
                    h('td', null, getMap(m.mapId).name),
                    h('td', null, CHARACTERS[m.character]?.name ?? m.character),
                    h('td', { class: 'num' }, `${m.place}/${m.players}`),
                    h('td', { class: 'num' }, String(m.kills)),
                    h('td', { class: 'num' }, String(m.assists)),
                    h('td', { class: 'num' }, String(m.deaths)),
                    h('td', { class: 'num' }, `+${m.xpGained}`),
                    h('td', { class: 'num' }, fmtDuration(m.durationMs)),
                  ),
                ),
              ),
            ),
          ),
    ),
  );
}
