/**
 * The story mode's flow in the app (v0.2.13, part 4a): the hub, a mission's ticket (from the server, or
 * this browser's own in the offline build — story/backend.ts), the
 * comic before it, the mission itself with its overlay, and the end — the comic after it and what it
 * paid, or one tap to go again.
 */
import { STORY_CHAPTERS, campaignMissions, nextMission } from '@blatkom/shared';
import type { StoryCampaign, StoryDone, StoryMission, StoryReward } from '@blatkom/shared';
import type { GameSession } from '../game/session/types.js';
import type { StoryBackend } from './backend.js';
import { apiErrorText } from '../net/errors.js';
import { t } from '../i18n/index.js';
import { h, toast } from '../ui/dom.js';
import { openSheet } from '../ui/sheet.js';
import { storageGet, storagePersistent, storageSet } from '../app/settings.js';
import { missionHeading, renderCards, renderStory, renderStoryFail, renderStoryWin } from '../ui/screens/story.js';
import { StorySession } from './StorySession.js';
import { StoryOverlay } from './overlay.js';
import { playComic } from './comic.js';
import { music } from '../game/audio/Music.js';
import { sceneForMap, sceneUrl } from './scenes.js';
import { CAMPAIGN_OPENING, MISSION_SCRIPTS, PROLOGUE } from './script.js';

/** The prologue was seen in this browser (it plays by itself on the first visit only). */
const PROLOGUE_KEY = 'blatkom89.story.prologue.v1';

/** What the story needs from the app shell. */
export interface StoryHost {
  root: HTMLElement;
  /** The server's progress online, this browser's in the offline build. */
  backend: () => StoryBackend | null;
  /** A mission paid something: the app updates the profile it shows. */
  afterReward: (r: StoryReward) => void;
  go: (screen: 'story' | 'storyEnd', push?: boolean) => void;
  screen: () => string;
  render: (el: HTMLElement) => void;
  topbar: (title: string) => HTMLElement;
  beginSession: (s: GameSession) => void;
  endSession: (showPreview?: boolean) => void;
  canvas: () => HTMLCanvasElement | null;
}

interface Running {
  mission: StoryMission;
  ticket: string;
  /** When the ticket came (the server pays no sooner than STORY_MIN_MS after it). */
  ticketAt: number;
}

export class StoryController {
  private done: StoryDone[] = [];
  private chapter: Record<StoryCampaign, number> = { petya: 1, uchastkovy: 1 };
  private overlay: StoryOverlay | null = null;
  private running: Running | null = null;
  private busy = false;
  private closeComic: (() => void) | null = null;

  constructor(private readonly host: StoryHost) {}

  /** The hub: the prologue, the campaigns, the card index. */
  show(push = true): void {
    const backend = this.host.backend();
    if (!backend) return;
    this.closeComic?.();
    this.host.go('story', push);
    music.setWanted(true);
    const body = h('div', { class: 'col center' }, h('div', { class: 'spinner' }));
    const wrap = h('div', { class: 'wrap' }, this.host.topbar(t('Story')), body);
    this.host.render(h('div', { class: 'screen screen--dim screen--fit screen--story' }, wrap));
    const draw = () => {
      if (this.host.screen() !== 'story') return;
      wrap.lastElementChild!.replaceWith(
        renderStory({
          done: this.done,
          chapter: this.chapter,
          onChapter: (c, n) => {
            this.chapter = { ...this.chapter, [c]: n };
            draw();
          },
          offline: backend.local,
          unsaved: backend.local && !storagePersistent(),
          onPlay: (m) => void this.play(m),
          onPrologue: () => this.prologue(),
          onCards: () => openSheet(this.host.root, { title: t('Card index'), body: renderCards(this.done), testid: 'story-cards-sheet' }),
        }),
      );
    };
    void backend
      .progress()
      .then((done) => {
        this.done = done;
        // each campaign opens on the chapter of its next mission (or the last one written, all done)
        const ids = new Set(done.map((d) => d.id));
        for (const c of ['petya', 'uchastkovy'] as const) {
          const next = nextMission(c, ids);
          const written = STORY_CHAPTERS.filter((x) => x.campaign === c && x.ready).map((x) => x.chapter);
          this.chapter = { ...this.chapter, [c]: next?.chapter ?? Math.max(1, ...written) };
        }
        draw();
        // the first visit: the prologue plays by itself
        if (this.done.length === 0 && !storageGet(PROLOGUE_KEY) && this.host.screen() === 'story') this.prologue();
      })
      .catch((e) => {
        if (this.host.screen() === 'story') body.replaceWith(h('div', { class: 'panel' }, apiErrorText(e)));
      });
  }

  private prologue() {
    this.closeComic?.();
    this.closeComic = playComic(this.host.root, PROLOGUE, {
      title: t('Prologue'),
      onDone: () => {
        this.closeComic = null;
        storageSet(PROLOGUE_KEY, '1');
      },
    });
  }

  /** A mission: its ticket, the comic before it (the campaign's opening the first time), the mission. */
  async play(m: StoryMission, o: { again?: boolean } = {}): Promise<void> {
    const backend = this.host.backend();
    if (!backend || this.busy) return;
    this.busy = true;
    try {
      const ticket = await backend.start(m.id);
      const run: Running = { mission: m, ticket, ticketAt: Date.now() };
      const ids = new Set(this.done.map((d) => d.id));
      const first = campaignMissions(m.campaign)[0]?.id === m.id && !ids.has(m.id);
      const beats = o.again ? [] : [...(first ? CAMPAIGN_OPENING[m.campaign] : []), ...(MISSION_SCRIPTS[m.id]?.intro ?? [])];
      const go = () => {
        this.closeComic = null;
        this.launch(run);
      };
      this.closeComic?.();
      if (beats.length > 0) this.closeComic = playComic(this.host.root, beats, { title: missionHeading(m), map: m.map, scene: sceneForMap(m.map), onDone: go });
      else go();
    } catch (e) {
      toast(apiErrorText(e));
    } finally {
      this.busy = false;
    }
  }

  private launch(run: Running) {
    const s = new StorySession(run.mission);
    this.running = run;
    this.host.beginSession(s);
    this.overlay?.destroy();
    this.overlay = new StoryOverlay(s, { canvas: this.host.canvas });
    this.overlay.mount(this.host.root);
  }

  /** The app ends the session: the overlay goes with it. */
  unmount(): void {
    this.overlay?.destroy();
    this.overlay = null;
  }

  /** Called by the app when a story mission's match is over. */
  finished(s: StorySession): void {
    const run = this.running;
    const out = s.outcome();
    if (!run || !out || run.mission.id !== s.mission.id) return this.show(false);
    const m = run.mission;
    const ms = s.elapsedMs();
    const stats = s.heroStats();
    this.host.endSession(true);
    this.host.go('storyEnd', false);
    // the end of a mission is a menu again: the soundtrack comes back (quietly while the comic after it plays)
    music.setWanted(true);
    if (out.result === 'fail') {
      this.running = null;
      this.host.render(endScreen(m, renderStoryFail({ mission: m, reason: out.reason ?? 'lost', onRetry: () => void this.play(m, { again: true }), onHub: () => this.show(false) })));
      return;
    }
    // the win: the result goes to the server while the comic after the mission is read
    let reward: StoryReward | null = null;
    let error: string | null = null;
    let comicDone = false;
    const holder = h('div', { class: 'screen__body' });
    this.host.render(endScreen(m, holder));
    const draw = () => {
      if (!comicDone || this.host.screen() !== 'storyEnd') return;
      const ids = new Set((reward?.done ?? this.done).map((d) => d.id));
      const next = nextMission(m.campaign, ids);
      // the last mission written so far (v0.2.15): the campaign goes on in an update
      const all = campaignMissions(m.campaign);
      const continued = all[all.length - 1]?.id === m.id ? (STORY_CHAPTERS.find((x) => x.campaign === m.campaign && !x.ready)?.chapter ?? null) : null;
      holder.replaceChildren(
        renderStoryWin({
          mission: m,
          ms,
          reward,
          error,
          offline: this.host.backend()?.local ?? false,
          next: reward && next && next.id !== m.id ? next : null,
          continued,
          onNext: () => next && void this.play(next),
          onHub: () => this.show(false),
          onRetrySend: () => {
            error = null;
            draw();
            send();
          },
        }),
      );
    };
    const send = () => {
      const backend = this.host.backend();
      if (!backend) return;
      const wait = backend.minMs > 0 ? Math.max(0, run.ticketAt + backend.minMs + 500 - Date.now()) : 0;
      setTimeout(() => {
        backend
          .complete(run.ticket, ms, stats.kills, stats.deaths)
          .then((r) => {
            reward = r;
            this.done = r.done;
            this.host.afterReward(r);
            draw();
          })
          .catch((e) => {
            error = apiErrorText(e);
            draw();
          });
      }, wait);
    };
    send();
    this.running = null;
    const outro = MISSION_SCRIPTS[m.id]?.outro ?? [];
    const after = () => {
      this.closeComic = null;
      comicDone = true;
      draw();
    };
    if (outro.length > 0) this.closeComic = playComic(this.host.root, outro, { title: missionHeading(m), map: m.map, scene: sceneForMap(m.map), onDone: after });
    else after();
  }

  /** The pause menu's «Back to the story» (the mission is dropped, nothing is sent). */
  leave(): void {
    this.running = null;
    this.show(false);
  }
}

/** The end of a mission, over its place's big picture when the place has one. */
function endScreen(m: StoryMission, body: HTMLElement): HTMLElement {
  const sc = sceneForMap(m.map);
  return h('div', { class: `screen screen--dim center${sc ? ' screen--scene' : ''}` }, sc ? h('img', { class: 'screen__scene', 'data-testid': 'story-end-scene', src: sceneUrl(sc), alt: '', draggable: 'false' }) : null, body);
}
