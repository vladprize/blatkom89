/**
 * The story mode's screens (v0.2.13, part 4a): the hub — the prologue, the two campaigns with their
 * chapters and missions, the finale on the way, the card index of the district's people — and the end
 * of a mission: done (with what it paid) or failed (with one tap to go again).
 */
import { STORY_CARD_INDEX, STORY_CAST, STORY_CHAPTERS, campaignMissions, chapterMissions, charactersMet, isMissionOpen, parseSkin, storyChapter } from '@blatkom/shared';
import type { CharacterId, StoryCampaign, StoryDone, StoryMission, StoryReward } from '@blatkom/shared';
import { count, plural, t } from '../../i18n/index.js';
import { achievementText, charName, finishName, mapName, weaponName } from '../../i18n/content.js';
import { asset, fmtDuration, h, portrait } from '../dom.js';
import { CAMPAIGNS, CHAPTER_TITLES, FAIL_LINES, MISSION_SCRIPTS, line } from '../../story/script.js';
import { sceneForMap, sceneThumbUrl } from '../../story/scenes.js';
import type { StoryFail } from '../../story/StorySession.js';
import { fmtBlat } from './blat.js';

const CAMPAIGN_ORDER: readonly StoryCampaign[] = ['petya', 'uchastkovy'];

/** «Clear out», «Duel»… — what a mission asks for, in two words. */
export function missionKind(m: StoryMission): string {
  switch (m.objective.kind) {
    case 'clear':
      return t('Clear out');
    case 'team':
      return m.npcs.filter((n) => n.side === 'enemy').length === 1 && m.npcs.every((n) => n.side === 'enemy') ? t('Duel') : t('Side against side');
    case 'flag':
      return t('Snatch and carry');
    case 'bases':
      return t('Hold the spots');
    case 'survive':
      return t('Hold out');
  }
}

export function missionTitle(m: StoryMission): string {
  const s = MISSION_SCRIPTS[m.id];
  return s ? line(s.title) : m.id;
}

/** «Mission 3 · Light Bulbs» */
export function missionHeading(m: StoryMission): string {
  return t('Mission {n} · {title}', { n: m.n, title: missionTitle(m) });
}

/** A chapter's rewards in words: the achievement, the talons, the characters and skins. */
function chapterRewards(c: StoryCampaign, chapter: number, offline: boolean): string {
  const ch = storyChapter(c, chapter);
  if (!ch) return '';
  const parts: string[] = [];
  if (ch.achievement) parts.push(`«${achievementText(ch.achievement).title}»`);
  // offline (no server): the achievement and its experience only
  if (offline) return parts.join(' · ');
  parts.push(count(ch.talons, 'talon'));
  for (const id of ch.characters) parts.push(t('the character {name}', { name: charName(id) }));
  for (const s of ch.skins) {
    const p = parseSkin(s);
    if (p) parts.push(t('{weapon}: the «{finish}» skin', { finish: finishName(p.finish), weapon: weaponName(p.weapon) }));
  }
  return parts.join(' · ');
}

function missionRow(m: StoryMission, done: Map<string, StoryDone>, ids: ReadonlySet<string>, onPlay: (m: StoryMission) => void, offline: boolean): HTMLElement {
  const d = done.get(m.id);
  const open = isMissionOpen(m.id, ids);
  const state = d ? 'done' : open ? 'open' : 'locked';
  // a place with its big picture: the row becomes a little banner of it
  const sc = sceneForMap(m.map);
  return h(
    'div',
    { class: `smission smission--${state}${sc ? ' smission--pic' : ''}`, 'data-testid': `story-mission-${m.id}`, 'data-state': state, ...(sc ? { 'data-scene': sc, style: `--pic:url("${sceneThumbUrl(sc)}")` } : {}) },
    h('span', { class: 'smission__n' }, String(m.n)),
    h(
      'div',
      { class: 'smission__txt' },
      h('b', null, missionTitle(m)),
      h('small', null, `${missionKind(m)} · ${mapName(m.map)}`),
      h('small', { class: 'smission__reward' }, d ? t('Best time {time}', { time: fmtDuration(d.bestMs) }) : offline ? t('First time: +{xp} XP', { xp: m.xp }) : t('First time: +{n} {talons}, +{xp} XP', { n: m.talons, talons: plural(m.talons, 'talon'), xp: m.xp })),
    ),
    state === 'locked'
      ? h('span', { class: 'smission__lock', 'aria-label': t('Locked: finish the mission before it') }, '🔒')
      : h('button', { class: `btn btn--small ${state === 'open' ? 'btn--red' : ''}`, 'data-testid': `story-play-${m.id}`, onclick: () => onPlay(m) }, state === 'open' ? t('Play') : t('Again')),
  );
}

function campaignPanel(c: StoryCampaign, done: Map<string, StoryDone>, ids: ReadonlySet<string>, chapter: number, onChapter: (c: StoryCampaign, n: number) => void, onPlay: (m: StoryMission) => void, offline: boolean): HTMLElement {
  const info = CAMPAIGNS[c];
  const all = campaignMissions(c);
  const doneN = all.filter((m) => done.has(m.id)).length;
  const chapters = STORY_CHAPTERS.filter((x) => x.campaign === c);
  const ch = chapters.find((x) => x.chapter === chapter) ?? chapters[0]!;
  const ms = chapterMissions(c, ch.chapter);
  return h(
    'div',
    { class: `panel col scamp scamp--${c}`, 'data-testid': `story-campaign-${c}` },
    h('span', { class: 'tag' }, t('Campaign')),
    h(
      'div',
      { class: 'scamp__head' },
      portrait(info.hero),
      h('div', { class: 'col', style: 'gap:2px;min-width:0' }, h('div', { class: 'scamp__title' }, `«${line(info.title)}»`), h('div', { class: 'muted scamp__tagline' }, line(info.tagline))),
      h('div', { class: 'scamp__progress', 'data-testid': `story-progress-${c}` }, h('b', null, `${doneN}/${all.length}`), h('small', null, plural(all.length, 'mission'))),
    ),
    h(
      'div',
      { class: 'seg scamp__chapters', role: 'tablist' },
      ...chapters.map((x) =>
        h(
          'button',
          { role: 'tab', 'aria-pressed': String(x.chapter === ch.chapter), 'aria-selected': String(x.chapter === ch.chapter), class: x.ready ? '' : 'soon', onclick: () => x.chapter !== ch.chapter && onChapter(c, x.chapter) },
          h('b', null, String(x.chapter)),
          h('small', null, line(CHAPTER_TITLES[c][x.chapter - 1] ?? ['', ''])),
        ),
      ),
    ),
    ch.ready
      ? h('div', { class: 'col smissions' }, ...ms.map((m) => missionRow(m, done, ids, onPlay, offline)))
      : h('div', { class: 'scamp__soon' }, h('b', null, t('Chapter {n} is being written', { n: ch.chapter })), h('span', { class: 'muted' }, t('It comes in one of the next updates — the missions you finish now stay yours.'))),
    h('div', { class: 'muted scamp__reward' }, t('For the chapter: {rewards}', { rewards: chapterRewards(c, ch.chapter, offline) })),
  );
}

export function renderStory(o: {
  done: StoryDone[];
  chapter: Record<StoryCampaign, number>;
  onChapter: (c: StoryCampaign, n: number) => void;
  onPlay: (m: StoryMission) => void;
  onPrologue: () => void;
  onCards: () => void;
  /** The offline build: progress on this device, experience and achievements only. */
  offline?: boolean;
  /** …and this browser won't keep it after the tab closes (Safari, a file opened from disk). */
  unsaved?: boolean;
}): HTMLElement {
  const done = new Map(o.done.map((d) => [d.id, d]));
  const ids = new Set(done.keys());
  const met = charactersMet(ids);
  return h(
    'div',
    { class: 'col story', 'data-testid': 'story' },
    h(
      'div',
      { class: 'panel story__intro' },
      h('span', { class: 'tag' }, '2089 → 1989'),
      h('div', { class: 'story__lead' }, t('In 2089 the city’s disputes go to BLATKOM: both sides wake up in a simulation of 1989, half human, half beast — and whoever holds the district there is right out here.')),
      h('div', { class: 'story__btns' }, h('button', { class: 'btn btn--small', 'data-testid': 'story-prologue', onclick: o.onPrologue }, t('Prologue ▶')), h('button', { class: 'btn btn--small', 'data-testid': 'story-cards', onclick: o.onCards }, t('Card index · {n}/{all}', { n: STORY_CARD_INDEX.filter((c) => met.has(c)).length, all: STORY_CARD_INDEX.length }))),
    ),
    h('div', { class: 'story__camps' }, ...CAMPAIGN_ORDER.map((c) => campaignPanel(c, done, ids, o.chapter[c], o.onChapter, o.onPlay, !!o.offline))),
    o.offline
      ? o.unsaved
        ? h('div', { class: 'story__offline story__offline--warn', 'data-testid': 'story-unsaved' }, t('This browser doesn’t save the progress of a file opened from disk: it lasts until you close the tab. Open the file in Chrome or Firefox to keep it.'))
        : h('div', { class: 'muted story__offline' }, t('Offline: the progress stays in this browser on this device.'))
      : null,
    h('div', { class: 'panel story__finale' }, h('span', { class: 'tag' }, t('Finale')), h('b', null, t('«The Building Site» — the two of them against Arkadich')), h('span', { class: 'muted' }, t('Opens after both campaigns. The reward: «Neon-2089», a legendary skin for every weapon — only from the story.'))),
  );
}

/** The card index: the district's people, met ones in colour, the others waiting in their chapter. */
export function renderCards(done: StoryDone[]): HTMLElement {
  const met = charactersMet(new Set(done.map((d) => d.id)));
  return h(
    'div',
    { class: 'scards', 'data-testid': 'story-cardgrid' },
    ...STORY_CARD_INDEX.map((c: CharacterId) => {
      const seen = met.has(c);
      const where = STORY_CAST[c];
      return h(
        'div',
        { class: `scard ${seen ? 'scard--met' : ''}`, 'data-testid': `story-card-${c}`, 'data-met': String(seen) },
        h('img', { class: 'scard__img', src: asset(`assets/portraits/${c}.png`), alt: '', draggable: 'false' }),
        h('b', null, seen ? charName(c) : '???'),
        h('small', null, seen ? t('Met') : where ? t('Chapter {n} · «{campaign}»', { n: where.chapter, campaign: line(CAMPAIGNS[where.campaign].title) }) : ''),
      );
    }),
  );
}

/** A mission done: what it paid (the first time) and where to go next. */
export function renderStoryWin(o: { mission: StoryMission; ms: number; reward: StoryReward | null; error: string | null; next: StoryMission | null; offline?: boolean; onNext: () => void; onHub: () => void; onRetrySend: () => void }): HTMLElement {
  const r = o.reward;
  const lines: HTMLElement[] = [];
  if (r?.first) {
    if (r.talons > 0) lines.push(h('li', null, `+${count(r.talons, 'talon')}`));
    if (r.xp > 0) lines.push(h('li', null, t('+{n} XP', { n: r.xp })));
    if (r.blatGained > 0) lines.push(h('li', null, t('+{n} $BLAT for the levels you reached', { n: fmtBlat(r.blatGained) })));
    if (r.achievement) lines.push(h('li', { class: 'gold' }, t('Achievement: «{title}»', { title: achievementText(r.achievement).title })));
    for (const c of r.characters) lines.push(h('li', { class: 'gold' }, t('New character: {name}', { name: charName(c) })));
    for (const s of r.skins) {
      const p = parseSkin(s);
      if (p) lines.push(h('li', { class: 'gold' }, t('New skin: {weapon} «{finish}»', { finish: finishName(p.finish), weapon: weaponName(p.weapon) })));
    }
    for (const c of r.compensated) lines.push(h('li', null, t('Already yours: {thing} — +{n} {talons} instead', { thing: c.kind === 'character' ? charName(c.id as CharacterId) : c.id, n: c.talons, talons: plural(c.talons, 'talon') })));
  } else if (r) lines.push(h('li', { class: 'muted' }, t('Done before — the rewards came the first time. Best time: {time}', { time: fmtDuration(r.done.find((d) => d.id === o.mission.id)?.bestMs ?? o.ms) })));
  return h(
    'div',
    { class: 'panel col center sresult sresult--win', 'data-testid': 'story-win' },
    h('span', { class: 'tag' }, t('Mission complete')),
    h('div', { class: 'sresult__title' }, missionHeading(o.mission)),
    h('div', { class: 'muted' }, t('Time: {time}', { time: fmtDuration(o.ms) })),
    o.error
      ? h('div', { class: 'col center', style: 'gap:8px' }, h('div', { class: 'sresult__err', 'data-testid': 'story-send-error' }, t('The result didn’t reach the server: {error}', { error: o.error })), h('button', { class: 'btn btn--small', onclick: o.onRetrySend }, t('Send again')))
      : r
        ? h('ul', { class: 'sresult__rewards', 'data-testid': 'story-rewards' }, ...lines)
        : h('div', { class: 'spinner' }),
    h('div', { class: 'sresult__btns' }, o.next ? h('button', { class: 'btn btn--red', 'data-testid': 'story-next', onclick: o.onNext }, t('Next: {title}', { title: missionTitle(o.next) })) : null, h('button', { class: 'btn', 'data-testid': 'story-hub', onclick: o.onHub }, t('Back to the story'))),
  );
}

/** A mission lost: why, and one tap to go again. */
export function renderStoryFail(o: { mission: StoryMission; reason: StoryFail; onRetry: () => void; onHub: () => void }): HTMLElement {
  return h(
    'div',
    { class: 'panel col center sresult sresult--fail', 'data-testid': 'story-fail' },
    h('span', { class: 'tag' }, t('Mission failed')),
    h('div', { class: 'sresult__title' }, missionHeading(o.mission)),
    h('div', { class: 'sresult__caption' }, line(FAIL_LINES[o.reason])),
    h('div', { class: 'sresult__btns' }, h('button', { class: 'btn btn--red', 'data-testid': 'story-retry', onclick: o.onRetry }, t('Again')), h('button', { class: 'btn', 'data-testid': 'story-hub', onclick: o.onHub }, t('Back to the story'))),
  );
}
