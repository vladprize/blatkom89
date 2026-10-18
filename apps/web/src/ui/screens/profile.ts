/** Profile screen («Dossier»): nickname, level and XP, statistics, achievements, recent matches. */
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
      h('span', { class: 'tag' }, 'Dossier'),
      h(
        'div',
        { class: 'row', style: 'margin-top:6px;flex-wrap:nowrap' },
        h('div', { class: 'lvlbadge lvlbadge--big', title: 'Level' }, h('small', null, 'LVL'), String(p.level)),
        h('div', { class: 'h1 grow nick-line', 'data-testid': 'profile-name' }, p.displayName),
        h('button', { class: 'btn btn--small', onclick: o.onRename, 'aria-label': 'Change alias' }, '✎ Alias'),
      ),
      h('div', { class: 'xpbar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i', { style: `width:${pct}%` })),
      h('div', { class: 'muted' }, p.xpForNextLevel > 0 ? `${p.xpIntoLevel} / ${p.xpForNextLevel} XP to level ${p.level + 1} · ${p.xp} in total` : `Top level · ${p.xp} XP`),
      o.local ? h('div', { class: 'muted', style: 'font-size:14px' }, 'Local profile: kept only in this browser. XP comes from practice against bots.') : null,
    ),
    h(
      'div',
      { class: 'panel col' },
      h('span', { class: 'tag' }, 'Statistics'),
      h(
        'div',
        { class: 'stats', style: 'margin-top:6px' },
        stat(p.matchesPlayed, 'matches'),
        stat(p.wins, 'wins'),
        stat(p.losses, 'losses'),
        stat(p.kills, 'eliminations'),
        stat(p.assists, 'assists'),
        stat(p.deaths, 'deaths'),
        stat(kd, 'E/D'),
        stat(p.bestWinStreak, 'best streak'),
        stat(`${hours} h ${mins} min`, 'on the job'),
      ),
    ),
    h(
      'div',
      { class: 'panel col' },
      h('span', { class: 'tag' }, `Achievements · ${unlocked}/${d.achievements.length}`),
      h('div', { style: 'height:4px' }),
      d.achievements.length === 0 ? h('div', { class: 'muted' }, 'No data') : null,
      ...d.achievements.map((a) => h('div', { class: `ach ${a.unlockedAt ? '' : 'locked'}` }, h('div', { class: 'ico' }, a.unlockedAt ? '★' : '☆'), h('div', { class: 'col', style: 'gap:2px' }, h('div', { class: 't' }, a.title), h('div', { class: 'muted' }, a.description)))),
    ),
    h(
      'div',
      { class: 'panel col' },
      h('span', { class: 'tag' }, 'Recent matches'),
      h('div', { style: 'height:4px' }),
      d.history.length === 0
        ? h('div', { class: 'muted' }, 'No matches played yet.')
        : h(
            'div',
            { class: 'table-scroll' },
            h(
              'table',
              { class: 'table' },
              h('thead', null, h('tr', null, h('th', null, 'Map'), h('th', null, 'Character'), h('th', { class: 'num' }, 'Place'), h('th', { class: 'num' }, 'Elim'), h('th', { class: 'num' }, 'Ast'), h('th', { class: 'num' }, 'Dth'), h('th', { class: 'num' }, 'XP'), h('th', { class: 'num' }, 'Time'))),
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
