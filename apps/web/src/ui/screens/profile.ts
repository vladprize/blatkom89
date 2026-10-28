/** Profile screen («Dossier»): nickname, level and XP, statistics, achievements, recent matches. */
import { h, fmtDuration, founderTag } from '../dom.js';
import { fitAlias, whenSized } from '../fit.js';
import { avatarButton } from '../avatars.js';
import { ACHIEVEMENTS, isCharacterId } from '@blatkom/shared';
import type { AchievementStatus, MatchHistoryEntry, PublicProfile } from '@blatkom/shared';
import type { OnlineClient } from '../../net/OnlineClient.js';
import { t, num } from '../../i18n/index.js';
import { achievementText, charName, mapName } from '../../i18n/content.js';
import { signed } from './results.js';
import { inPane, paneTabs } from '../panes.js';

export interface ProfileData {
  profile: PublicProfile;
  history: Array<Omit<MatchHistoryEntry, 'endedAt'> & { endedAt?: string }>;
  achievements: AchievementStatus[];
}

export async function loadOnlineProfile(online: OnlineClient): Promise<ProfileData> {
  const [profile, hist, ach] = await Promise.all([online.refreshProfile(), online.api.history().catch(() => ({ matches: [] })), online.api.achievements().catch(() => ({ achievements: [] }))]);
  return { profile, history: hist.matches, achievements: ach.achievements };
}

/**
 * v0.2.17: the profile fits the window — on a computer the dossier, the numbers and the account on the
 * left, the achievements and the matches on the right (each list scrolls in its own panel); on a phone
 * one part at a time (the dossier with the numbers, the achievements, the matches, the account).
 */
export function renderProfileView(d: ProfileData, o: { local: boolean; onRename: () => void; onAvatar: () => void; account?: HTMLElement | null }): HTMLElement {
  const p = d.profile;
  const kd = p.deaths > 0 ? num(p.kills / p.deaths, 2) : String(p.kills);
  const pct = p.xpForNextLevel > 0 ? Math.round((p.xpIntoLevel / p.xpForNextLevel) * 100) : 100;
  const stat = (v: string | number, label: string) => h('div', { class: 'stat' }, h('b', null, String(v)), h('span', null, label));
  const hours = Math.floor(p.playtimeSec / 3600);
  const mins = Math.floor((p.playtimeSec % 3600) / 60);
  const unlocked = d.achievements.filter((a) => a.unlockedAt).length;
  const nick = h('div', { class: 'h1 grow nick-line', 'data-testid': 'profile-name' }, h('span', { class: 'fit-text' }, p.displayName), p.founder ? founderTag() : null);
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
  const root = h('div', { class: 'col profile fitcol', 'data-testid': 'profile' });
  const tabs = paneTabs(root, 'profile', [
    { id: 'a', label: t('Dossier'), testid: 'profile-pane-dossier' },
    { id: 'b', label: t('Achievements'), testid: 'profile-pane-achievements' },
    { id: 'c', label: t('Matches'), testid: 'profile-pane-matches' },
    ...(o.account ? [{ id: 'd' as const, label: t('Account'), testid: 'profile-pane-account' }] : []),
  ]);
  // a guest's account isn't safe yet (no email, no sign-in, no Telegram): the phone's tab says so with a dot
  if (o.account && !p.email && !(p.identities?.length ?? 0) && !p.telegramLinked) tabs.querySelector('[data-pane-tab=d]')?.classList.add('panetab--alert');
  if (o.account) {
    // the account's own content scrolls (on a computer it shares the right column), its tape label stays put
    const acc = inPane(o.account, 'd');
    acc.classList.add('profile__account');
    const tag = acc.querySelector(':scope > .tag');
    const body = h('div', { class: 'col profile__accbody' });
    for (const n of [...acc.childNodes]) if (n !== tag) body.append(n);
    acc.append(body);
  }
  const dossier = inPane(h(
      'div',
      { class: 'panel col profile__dossier' },
      h('span', { class: 'tag' }, t('Dossier')),
      head,
      h('div', { class: 'xpbar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i', { style: `width:${pct}%` })),
      h('div', { class: 'muted' }, p.xpForNextLevel > 0 ? t('{a} / {b} XP to level {n} · {total} in total', { a: p.xpIntoLevel, b: p.xpForNextLevel, n: p.level + 1, total: p.xp }) : t('Top level · {total} XP', { total: p.xp })),
      o.local ? h('div', { class: 'muted', style: 'font-size:14px' }, t('Local profile: kept only in this browser. XP comes from practice against bots.')) : null,
    ), 'a');
  const stats = inPane(h(
      'div',
      { class: 'panel col profile__stats' },
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
    ), 'a');
  const achs = inPane(h(
      'div',
      { class: 'panel col profile__achs' },
      h('span', { class: 'tag' }, t('Achievements · {n}/{total}', { n: unlocked, total: d.achievements.length })),
      h('div', { style: 'height:4px' }),
      d.achievements.length === 0 ? h('div', { class: 'muted' }, t('No data')) : null,
      h(
        'div',
        { class: 'achs fitscroll' },
        ...d.achievements.map((a) => {
          const text = achievementText(a.id);
          return h(
            'div',
            { class: `ach ${a.unlockedAt ? '' : 'locked'}`, 'data-ach': a.id },
            h('div', { class: 'ico' }, a.unlockedAt ? '★' : '☆'),
            h('div', { class: 'col', style: 'gap:2px;min-width:0' }, h('div', { class: 't' }, text.title), h('div', { class: 'muted' }, text.description)),
            h('span', { class: 'ach__xp' }, `+${ACHIEVEMENTS[a.id]?.xpReward ?? 0} XP`),
          );
        }),
      ),
    ), 'b');
  const matches = inPane(h(
      'div',
      { class: 'panel col profile__matches' },
      h('span', { class: 'tag' }, t('Recent matches')),
      h('div', { style: 'height:4px' }),
      d.history.length === 0
        ? h('div', { class: 'muted' }, t('No matches played yet.'))
        : h(
            'div',
            { class: 'table-scroll fitscroll' },
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
    ), 'c');
  // computers: who the player is on the left (the dossier, the numbers, the matches), the records on the
  // right (the achievements, the account); phones: the columns dissolve and one part shows at a time
  root.append(
    tabs,
    h('div', { class: 'col profile__col profile__col--left' }, dossier, stats, matches),
    h('div', { class: 'col profile__col profile__col--right' }, achs, o.account ?? null),
  );
  return root;
}
