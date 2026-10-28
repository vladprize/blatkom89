import { h, portrait, fmtDuration } from '../dom.js';
import { amount } from './shop.js';
import { BASE_RULES, CTF_RULES, isTeamMode, levelForXp, SCORING, TOKEN_REWARD, tokenBreakdown } from '@blatkom/shared';
import type { Standing, Team, KonFormat } from '@blatkom/shared';
import type { ResultsData } from '../../game/session/types.js';
import { t, plural, count } from '../../i18n/index.js';
import { achievementText, mapName } from '../../i18n/content.js';
import { konLabel } from './kon.js';
import { modeName } from '../modes.js';
import { blatAmount, blatCoin, fmtBlat } from './blat.js';

const teamLabel = (team: Team) => (team === 0 ? t('RED TEAM') : t('BLUE TEAM'));

/** +16 / −16 / ±0 */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

/** «4 eliminations × 5 = 20 · 1 assist × 2 = 2 · finished +5» — how the match talons were counted. */
function talonBreakdown(me: Standing | undefined, gained: number): string | null {
  if (!me) return null;
  const b = tokenBreakdown({ kills: me.kills, assists: me.assists, completed: true });
  if (b.total !== gained) return null; // left early or an older server: no breakdown
  const parts: string[] = [];
  if (me.kills > 0) parts.push(`${count(me.kills, 'elimination')} × ${TOKEN_REWARD.perKill} = ${b.kills}`);
  if (me.assists > 0) parts.push(`${count(me.assists, 'assist')} × ${TOKEN_REWARD.perAssist} = ${b.assists}`);
  parts.push(t('finished +{n}', { n: b.completion }));
  if (b.capped) parts.push(t('capped at {n} per match', { n: TOKEN_REWARD.maxPerMatch }));
  return parts.join(' · ');
}

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
  /** Online: the room chat (under the buttons). */
  chat?: HTMLElement | null;
  /** V2.0 part D: the match was a «Блатной кон» match of this format. */
  kon?: KonFormat | null;
}): HTMLElement {
  const r = o.results;
  const mode = r.gameMode ?? 'ffa';
  const teams = isTeamMode(mode) && r.teams ? r.teams : null;
  const objective = mode === 'ctf' || mode === 'bases';
  const top = r.standings[0];
  const draw = !teams && !!top && r.standings.length > 1 && r.standings[1]!.place === top.place;
  const winner = draw || teams ? undefined : top;
  const reason = r.reason === 'score' ? t('Score limit reached') : r.reason === 'time' ? t('Time’s up') : t('Match called off');
  const me = r.standings.find((s) => s.id === o.myId);
  const personal = r.personal;
  const xpPanel = () => {
    if (!personal) return null;
    const lvl = levelForXp(personal.totalXp);
    const pct = lvl.nextLevelCost > 0 ? Math.round((lvl.intoLevel / lvl.nextLevelCost) * 100) : 100;
    const how = personal.tokensGained !== undefined ? talonBreakdown(me, personal.tokensGained) : null;
    return h(
      'div',
      { class: 'panel col xpgain' },
      h('span', { class: 'tag' }, t('Experience')),
      h('div', { class: 'row', style: 'margin-top:6px;flex-wrap:nowrap' }, h('div', { class: 'lvlbadge' }, h('small', null, t('LVL')), String(personal.level)), h('div', { class: 'h1 grow' }, `+${personal.xpGained} XP`)),
      h('div', { class: 'xpbar' }, h('i', { style: `width:${pct}%` })),
      h('div', { class: 'muted' }, personal.leveledUp ? t('Promoted — level {n}!', { n: personal.level }) : lvl.nextLevelCost > 0 ? t('{a} / {b} to level {n}', { a: lvl.intoLevel, b: lvl.nextLevelCost, n: personal.level + 1 }) : t('Top level')),
      // V2.0 part D: a Kon match moves the Kon rating instead of the general one
      personal.kon
        ? h(
            'div',
            { class: 'ratingline ratingline--kon', 'data-testid': 'kon-line' },
            t('Tournament rating'),
            ' ',
            h('b', null, String(personal.kon.rating)),
            ' ',
            h('span', { class: personal.kon.delta > 0 ? 'up' : personal.kon.delta < 0 ? 'down' : 'muted' }, signed(personal.kon.delta)),
            ' · ',
            h('span', { class: 'muted' }, personal.kon.outcome === 'win' ? t('win') : personal.kon.outcome === 'draw' ? t('draw') : t('loss')),
          )
        : personal.rating !== undefined
        ? h(
            'div',
            { class: 'ratingline', 'data-testid': 'rating-line' },
            t('Rating'),
            ' ',
            h('b', null, String(personal.rating)),
            ' ',
            h('span', { class: (personal.ratingDelta ?? 0) > 0 ? 'up' : (personal.ratingDelta ?? 0) < 0 ? 'down' : 'muted' }, signed(personal.ratingDelta ?? 0)),
          )
        : null,
      personal.tokensGained !== undefined
        ? h(
            'div',
            { class: 'col tokens-gain', style: 'gap:2px' },
            h('div', { class: 'row' }, h('b', null, '+', amount(personal.tokensGained, 'tokens')), h('span', { class: 'muted' }, t('{talons} · {total} in total — spend them in the Arsenal', { talons: plural(personal.tokensGained, 'talon'), total: personal.totalTokens ?? 0 }))),
            how ? h('div', { class: 'muted', style: 'font-size:14px', 'data-testid': 'talon-breakdown' }, how) : null,
          )
        : null,
      // v0.2.17: the $BLAT Tournament's stake — the pool won, the stake lost, or the stake back
      personal.stake
        ? h(
            'div',
            { class: 'row stakeline', 'data-testid': 'stake-line', 'data-outcome': personal.stake.outcome },
            blatCoin(16, ''),
            h('b', null, personal.stake.outcome === 'win' ? `+${fmtBlat(personal.stake.payout - personal.stake.stake)}` : personal.stake.outcome === 'loss' ? `−${fmtBlat(personal.stake.stake)}` : personal.stake.payout > personal.stake.stake ? `+${fmtBlat(personal.stake.payout - personal.stake.stake)}` : '±0'),
            h(
              'span',
              { class: 'muted' },
              personal.stake.outcome === 'win'
                ? t('$BLAT: your share of the pool ({n})', { n: fmtBlat(personal.stake.payout) })
                : personal.stake.outcome === 'loss'
                  ? t('$BLAT: the stake stays in the pool')
                  : personal.stake.outcome === 'draw'
                    ? t('$BLAT: a draw — the stake is back')
                    : t('$BLAT: the stake is back'),
              ` · ${t('{total} in total', { total: fmtBlat(personal.totalBlat ?? 0) })}`,
            ),
          )
        : null,
      // V2.0: $BLAT for the levels reached in this match
      personal.blatGained
        ? h('div', { class: 'row blat-gain', 'data-testid': 'blat-gain' }, blatAmount(personal.blatGained), h('span', { class: 'muted' }, t('$BLAT for the new level · {total} in total', { total: fmtBlat(personal.totalBlat ?? 0) })))
        : null,
      ...personal.newAchievements.map((a) => h('div', { class: 'ach' }, h('div', { class: 'ico' }, '★'), h('div', { class: 'col', style: 'gap:2px' }, h('div', { class: 't' }, achievementText(a).title), h('div', { class: 'muted' }, achievementText(a).description)))),
      o.localProfile ? h('div', { class: 'muted', style: 'font-size:14px' }, t('Local profile — kept in this browser.')) : null,
    );
  };
  const row = (s: Standing, rank: number) =>
    h(
      'tr',
      { class: `${s.id === o.myId ? 'me' : ''} ${s.team === 0 ? 'tr--red' : s.team === 1 ? 'tr--blue' : ''}` },
      h('td', null, String(rank)),
      h('td', null, s.isBot ? `${s.name} · ${t('bot')}` : s.name),
      objective ? h('td', { class: 'num' }, String(s.objectives ?? 0)) : null,
      h('td', { class: 'num' }, String(s.kills)),
      h('td', { class: 'num' }, String(s.assists)),
      h('td', { class: 'num' }, String(s.deaths)),
      h('td', { class: 'num' }, String(s.score)),
    );
  const body: HTMLElement[] = [];
  if (teams) {
    for (const team of (teams.winner === 1 ? [1, 0] : [0, 1]) as Team[]) {
      body.push(h('tr', { class: `teamrow teamrow--${team === 0 ? 'red' : 'blue'}` }, h('td', { colspan: objective ? '6' : '5' }, teamLabel(team), teams.winner === team ? ` · ${t('winners')}` : ''), h('td', { class: 'num' }, String(teams.scores[team]))));
      r.standings.filter((s) => s.team === team).forEach((s, i) => body.push(row(s, i + 1)));
    }
  } else r.standings.forEach((s) => body.push(row(s, s.place)));
  let banner: HTMLElement | null = null;
  if (teams) {
    const [red, blue] = teams.scores;
    banner =
      teams.winner === null
        ? h('div', { class: 'panel col teamwin' }, h('div', { class: 'h1' }, t('Draw')), h('div', { class: 'hand' }, `${red} : ${blue} · ${t('the district stays split — settle it in the rematch.')}`))
        : h(
            'div',
            { class: `panel col teamwin teamwin--${teams.winner === 0 ? 'red' : 'blue'}` },
            h('div', { class: 'muted' }, me?.team === teams.winner ? t('Your team takes the district') : me ? t('This time the district went to the others') : ''),
            h('div', { class: 'h1' }, teams.winner === 0 ? t('Red team wins') : t('Blue team wins')),
            h('div', { class: 'teamwin__score' }, h('b', { class: 'red' }, String(red)), ' : ', h('b', { class: 'blue' }, String(blue))),
          );
  } else if (winner) {
    banner = h(
      'div',
      { class: 'panel row' },
      portrait(winner.character),
      h(
        'div',
        { class: 'col', style: 'gap:2px' },
        h('div', { class: 'muted' }, t('Boss of the district')),
        h('div', { class: 'h1' }, winner.name),
        h('div', { class: 'hand' }, `${count(winner.score, 'point')} · ${count(winner.kills, 'elimination')} · ${count(winner.assists, 'assist')}`),
      ),
    );
  } else if (draw) banner = h('div', { class: 'panel col' }, h('div', { class: 'h1' }, t('Draw')), h('div', { class: 'hand' }, t('The district is left without a boss — settle it in the rematch.')));
  return h(
    'div',
    { class: 'screen screen--solid' },
    h(
      'div',
      { class: 'wrap' },
      h('div', { class: 'row' }, h('span', { class: 'tag' }, t('Match report')), h('span', { class: 'muted' }, `${mapName(r.mapId)} · ${o.kon ? t('$BLAT Tournament {f}', { f: konLabel(o.kon) }) : modeName(mode)} · ${fmtDuration(r.durationMs)} · ${reason}`)),
      banner,
      h(
        'div',
        { class: 'panel table-scroll' },
        h(
          'table',
          { class: 'table' },
          h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, t('Player')), objective ? h('th', { class: 'num' }, mode === 'ctf' ? t('Flags') : t('Bases')) : null, h('th', { class: 'num' }, t('Elim')), h('th', { class: 'num' }, t('Ast')), h('th', { class: 'num' }, t('Deaths')), h('th', { class: 'num' }, t('Points')))),
          h('tbody', null, ...body),
        ),
      ),
      h(
        'div',
        { class: 'muted', style: 'font-size:14px' },
        t('Points: elimination +{k}, assist +{a} ({d}+ damage to the opponent within {s} s before they are eliminated).', { k: SCORING.killPoints, a: SCORING.assistPoints, d: SCORING.assistMinDamage, s: SCORING.assistWindowMs / 1000 }),
        mode === 'teams'
          ? ` ${t('A team scores one for every elimination.')}`
          : mode === 'ctf'
            ? ` ${t('A team scores one for every flag brought home. Player points: capture +{c}, return +{r}, steal +{s}.', { c: CTF_RULES.capturePoints, r: CTF_RULES.returnPoints, s: CTF_RULES.takePoints })}`
            : mode === 'bases'
              ? ` ${t('Every base held brings its team a point a second; taking a base gives +{b} to everyone inside.', { b: BASE_RULES.capturePoints })}`
              : '',
      ),
      personal ? xpPanel() : o.offline ? h('div', { class: 'muted' }, o.offlineNote ?? t('Practice doesn’t count towards the online profile, XP or talons.')) : h('div', { class: 'muted' }, me ? t('Filing the results…') : ''),
      h('div', { class: 'row' }, h('button', { class: 'btn btn--red grow', onclick: o.onRematch }, o.offline ? t('Again') : t('Rematch')), h('button', { class: 'btn grow', onclick: o.onMenu }, t('To menu'))),
      o.chat ?? null,
    ),
  );
}
