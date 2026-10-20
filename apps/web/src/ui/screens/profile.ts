/** Profile screen («Dossier»): nickname, level and XP, statistics, achievements, recent matches. */
import { h, fmtDuration } from '../dom.js';
import { fitAlias, whenSized } from '../fit.js';
import { avatarButton } from '../avatars.js';
import { isCharacterId } from '@blatkom/shared';
import type { AchievementStatus, MatchHistoryEntry, PublicProfile } from '@blatkom/shared';
import type { OnlineClient } from '../../net/OnlineClient.js';
import { t, num } from '../../i18n/index.js';
import { achievementText, charName, mapName } from '../../i18n/content.js';
import { signed } from './results.js';

export interface ProfileData {
  profile: PublicProfile;
  history: Array<Omit<MatchHistoryEntry, 'endedAt'> & { endedAt?: string }>;
  achievements: AchievementStatus[];
}

export async function loadOnlineProfile(online: OnlineClient): Promise<ProfileData> {
  const [profile, hist, ach] = await Promise.all([online.refreshProfile(), online.api.history().catch(() => ({ matches: [] })), online.api.achievements().catch(() => ({ achievements: [] }))]);
  return { profile, history: hist.matches, achievements: ach.achievements };
}

export function renderProfileView(d: ProfileData, o: { local: boolean; onRename: () => void; onAvatar: () => void }): HTMLElement {
  const p = d.profile;
  const kd = p.deaths > 0 ? num(p.kills / p.deaths, 2) : String(p.kills);
  const pct = p.xpForNextLevel > 0 ? Math.round((p.xpIntoLevel / p.xpForNextLevel) * 100) : 100;
  const stat = (v: string | number, label: string) => h('div', { class: 'stat' }, h('b', null, String(v)), h('span', null, label));
  const hours = Math.floor(p.playtimeSec / 3600);
  const mins = Math.floor((p.playtimeSec % 3600) / 60);
  const unlocked = d.achievements.filter((a) => a.unlockedAt).length;
  const nick = h('div', { class: 'h1 grow nick-line', 'data-testid': 'profile-name' }, h('span', { class: 'fit-text' }, p.displayName));
  const head = h(
    'div',
    { class: 'row', style: 'margin-top:6px;flex-wrap:nowrap' },
    avatarButton(p.avatar, o.onAvatar, 'ava-btn--big'),
    h('div', { class: 'lvlbadge lvlbadge--big', title: t('Level') }, h('small', null, t('LVL')), String(p.level)),
    nick,
    h('button', { class: 'btn btn--small', onclick: o.onRename, 'aria-label': t('Change alias') }, `✎ ${t('Alias')}`),
  );
  // the whole alias stays visible: the heading's size (as .h1: 26–40 px with the screen) shrinks for
  // long ones, a very long one takes two lines
  whenSized(head, () => fitAlias(nick, { max: () => Math.min(40, Math.max(26, window.innerWidth * 0.05)), min: 20, minTwoLines: 16 }));
  return h(
    'div',
    { class: 'col' },
    h(
      'div',
      { class: 'panel col' },
      h('span', { class: 'tag' }, t('Dossier')),
      head,
      h('div', { class: 'xpbar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i', { style: `width:${pct}%` })),
      h('div', { class: 'muted' }, p.xpForNextLevel > 0 ? t('{a} / {b} XP to level {n} · {total} in total', { a: p.xpIntoLevel, b: p.xpForNextLevel, n: p.level + 1, total: p.xp }) : t('Top level · {total} XP', { total: p.xp })),
      o.local ? h('div', { class: 'muted', style: 'font-size:14px' }, t('Local profile: kept only in this browser. XP comes from practice against bots.')) : null,
    ),
    h(
      'div',
      { class: 'panel col' },
      h('span', { class: 'tag' }, t('Statistics')),
      h(
        'div',
        { class: 'stats', style: 'margin-top:6px' },
        o.local ? null : stat(p.rating, t('rating')),
        stat(p.matchesPlayed, t('matches')),
        stat(p.wins, t('wins')),
        stat(p.losses, t('losses')),
        stat(p.kills, t('eliminations')),
        stat(p.assists, t('assists')),
        stat(p.deaths, t('deaths')),
        stat(kd, t('E/D')),
        stat(p.bestWinStreak, t('best streak')),
        stat(t('{h} h {m} min', { h: hours, m: mins }), t('on the job')),
      ),
    ),
    h(
      'div',
      { class: 'panel col' },
      h('span', { class: 'tag' }, t('Achievements · {n}/{total}', { n: unlocked, total: d.achievements.length })),
      h('div', { style: 'height:4px' }),
      d.achievements.length === 0 ? h('div', { class: 'muted' }, t('No data')) : null,
      ...d.achievements.map((a) => {
        const text = achievementText(a.id);
        return h('div', { class: `ach ${a.unlockedAt ? '' : 'locked'}` }, h('div', { class: 'ico' }, a.unlockedAt ? '★' : '☆'), h('div', { class: 'col', style: 'gap:2px' }, h('div', { class: 't' }, text.title), h('div', { class: 'muted' }, text.description)));
      }),
    ),
    h(
      'div',
      { class: 'panel col' },
      h('span', { class: 'tag' }, t('Recent matches')),
      h('div', { style: 'height:4px' }),
      d.history.length === 0
        ? h('div', { class: 'muted' }, t('No matches played yet.'))
        : h(
            'div',
            { class: 'table-scroll' },
            h(
              'table',
              { class: 'table' },
              h('thead', null, h('tr', null, h('th', null, t('Map')), h('th', null, t('Character')), h('th', { class: 'num' }, t('Place')), h('th', { class: 'num' }, t('Elim')), h('th', { class: 'num' }, t('Ast')), h('th', { class: 'num' }, t('Dth')), h('th', { class: 'num' }, 'XP'), o.local ? null : h('th', { class: 'num' }, t('Rtg')), h('th', { class: 'num' }, t('Time')))),
              h(
                'tbody',
                null,
                ...d.history.slice(0, 15).map((m) =>
                  h(
                    'tr',
                    m.won ? { class: 'won' } : null,
                    h('td', null, mapName(m.mapId)),
                    h('td', null, isCharacterId(m.character) ? charName(m.character) : m.character),
                    h('td', { class: 'num' }, `${m.place}/${m.players}`),
                    h('td', { class: 'num' }, String(m.kills)),
                    h('td', { class: 'num' }, String(m.assists)),
                    h('td', { class: 'num' }, String(m.deaths)),
                    h('td', { class: 'num' }, `+${m.xpGained}`),
                    o.local ? null : h('td', { class: `num ${m.ratingDelta > 0 ? 'up' : m.ratingDelta < 0 ? 'down' : ''}` }, signed(m.ratingDelta)),
                    h('td', { class: 'num' }, fmtDuration(m.durationMs)),
                  ),
                ),
              ),
            ),
          ),
    ),
  );
}
