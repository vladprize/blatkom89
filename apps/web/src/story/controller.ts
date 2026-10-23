/**
 * The story mode's flow in the app (v0.2.13, part 4a): the hub, a mission's ticket from the server, the
 * comic before it, the mission itself with its overlay, and the end — the comic after it and what it
 * paid, or one tap to go again.
 */
import { STORY_MIN_MS, campaignMissions, nextMission } from '@blatkom/shared';
import type { StoryCampaign, StoryDone, StoryMission, StoryReward } from '@blatkom/shared';
import type { OnlineClient } from '../net/OnlineClient.js';
import type { GameSession } from '../game/session/types.js';
import { apiErrorText } from '../net/errors.js';
import { t } from '../i18n/index.js';
import { h, toast } from '../ui/dom.js';
import { openSheet } from '../ui/sheet.js';
import { storageGet, storageSet } from '../app/settings.js';
import { missionHeading, renderCards, renderStory, renderStoryFail, renderStoryWin } from '../ui/screens/story.js';
import { StorySession } from './StorySession.js';
import { StoryOverlay } from './overlay.js';
import { playComic } from './comic.js';
import { CAMPAIGN_OPENING, MISSION_SCRIPTS, PROLOGUE } from './script.js';

/** The prologue was seen in this browser (it plays by itself on the first visit only). */
const PROLOGUE_KEY = 'blatkom89.story.prologue.v1';

/** What the story needs from the app shell. */
export interface StoryHost {
  root: HTMLElement;
  online: () => OnlineClient | null;
  go: (screen: 'story' | 'storyEnd', push?: boolean) => void;
  screen: () => string;
  render: (el: HTMLElement) => void;
  topbar: (title: string) => HTMLElement;
  beginSession: (s: GameSession) => void;
  endSession: (showPreview?: boolean) => void;
  canvas: () => HTMLCanvasElement | null;
  refreshStrip: () => void;
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
    const online = this.host.online();
    if (!online) return;
    this.closeComic?.();
    this.host.go('story', push);
    const body = h('div', { class: 'col center' }, h('div', { class: 'spinner' }));
    const wrap = h('div', { class: 'wrap' }, this.host.topbar(t('Story')), body);
    this.host.render(h('div', { class: 'screen screen--dim' }, wrap));
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
          onPlay: (m) => void this.play(m),
          onPrologue: () => this.prologue(),
          onCards: () => openSheet(this.host.root, { title: t('Card index'), body: renderCards(this.done), testid: 'story-cards-sheet' }),
        }),
      );
    };
    void online.api
      .story()
      .then((r) => {
        this.done = r.done;
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
    const online = this.host.online();
    if (!online || this.busy) return;
    this.busy = true;
    try {
      const { ticket } = await online.api.storyStart(m.id);
      const run: Running = { mission: m, ticket, ticketAt: Date.now() };
      const ids = new Set(this.done.map((d) => d.id));
      const first = campaignMissions(m.campaign)[0]?.id === m.id && !ids.has(m.id);
      const beats = o.again ? [] : [...(first ? CAMPAIGN_OPENING[m.campaign] : []), ...(MISSION_SCRIPTS[m.id]?.intro ?? [])];
      const go = () => {
        this.closeComic = null;
        this.launch(run);
      };
      this.closeComic?.();
      if (beats.length > 0) this.closeComic = playComic(this.host.root, beats, { title: missionHeading(m), map: m.map, onDone: go });
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
    if (out.result === 'fail') {
      this.running = null;
      this.host.render(h('div', { class: 'screen screen--dim center' }, renderStoryFail({ mission: m, reason: out.reason ?? 'lost', onRetry: () => void this.play(m, { again: true }), onHub: () => this.show(false) })));
      return;
    }
    // the win: the result goes to the server while the comic after the mission is read
    let reward: StoryReward | null = null;
    let error: string | null = null;
    let comicDone = false;
    const holder = h('div', { class: 'screen screen--dim center' });
    this.host.render(holder);
    const draw = () => {
      if (!comicDone || this.host.screen() !== 'storyEnd') return;
      const ids = new Set((reward?.done ?? this.done).map((d) => d.id));
      const next = nextMission(m.campaign, ids);
      holder.replaceChildren(
        renderStoryWin({
          mission: m,
          ms,
          reward,
          error,
          next: reward && next && next.id !== m.id ? next : null,
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
      const online = this.host.online();
      if (!online) return;
      const wait = Math.max(0, run.ticketAt + STORY_MIN_MS + 500 - Date.now());
      setTimeout(() => {
        online.api
          .storyComplete(run.ticket, ms, stats.kills, stats.deaths)
          .then((r) => {
            reward = r;
            this.done = r.done;
            if (online.profile) online.profile = { ...online.profile, tokens: r.tokens, xp: r.xpTotal, level: r.level };
            this.host.refreshStrip();
            // $BLAT and the rest of the profile as the server now has them
            void online
              .refreshProfile()
              .then(() => this.host.refreshStrip())
              .catch(() => {});
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
    if (outro.length > 0) this.closeComic = playComic(this.host.root, outro, { title: missionHeading(m), map: m.map, onDone: after });
    else after();
  }

  /** The pause menu's «Back to the story» (the mission is dropped, nothing is sent). */
  leave(): void {
    this.running = null;
    this.show(false);
  }
}
