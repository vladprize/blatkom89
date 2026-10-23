/**
 * Over a story mission's canvas (HTML, like the room chat): the objective line under the score and
 * health panels, and the characters' lines — a portrait and a speech bubble — where the room chat sits in
 * online matches (phones: under the kill feed; computers: above the health panel). Nothing here takes a
 * tap or a click: the game underneath keeps every input.
 */
import { STORY_RULES } from '@blatkom/shared';
import { hudBus, hudLayout } from '../game/scenes/hudBus.js';
import type { HudLayout } from '../game/scenes/hudBus.js';
import { sfx } from '../game/audio/Sfx.js';
import { charName } from '../i18n/content.js';
import { getLang, t } from '../i18n/index.js';
import { asset, h } from '../ui/dom.js';
import type { StorySession } from './StorySession.js';
import { MISSION_SCRIPTS, PEOPLE_2089, line } from './script.js';
import type { Beat } from './script.js';

/** How long a line stays up (ms), and the pause between two. */
const BARK_MS = 3400;
const BARK_GAP_MS = 250;

export function speakerName(who: Beat['who']): string {
  if (who === 'caption') return '';
  if (who === 'petr' || who === 'volkov' || who === 'arkady') return line(PEOPLE_2089[who].name);
  return charName(who);
}

/** The picture of a speaker: a character of 1989 as themselves, a person of 2089 by their avatar. */
export function speakerArt(who: Beat['who']): string | null {
  if (who === 'caption') return null;
  if (who === 'petr' || who === 'volkov' || who === 'arkady') return PEOPLE_2089[who].art;
  return who;
}

export class StoryOverlay {
  private readonly el = h('div', { class: 'storylay', 'data-testid': 'story-overlay' });
  private readonly goalText = h('span', { 'data-testid': 'story-goal-text' });
  private readonly goalLives = h('span', { class: 'storygoal__lives', 'data-testid': 'story-lives' });
  private readonly goalEl = h('div', { class: 'storygoal', 'data-testid': 'story-goal' }, this.goalText, this.goalLives);
  private readonly barkBox = h('div', { class: 'storybark-box' });
  private readonly queue: Beat[] = [];
  private bark: HTMLElement | null = null;
  private barkUntil = 0;
  private nextBarkAt = 0;
  private timer = 0;
  private raf = 0;
  private lastGoal = '';

  constructor(
    private readonly session: StorySession,
    private readonly o: { canvas: () => HTMLCanvasElement | null },
  ) {
    this.el.append(this.goalEl, this.barkBox);
  }

  mount(parent: HTMLElement): void {
    parent.append(this.el);
    hudBus.on('hud-layout', this.onResize, this);
    window.addEventListener('resize', this.onResize);
    this.layout();
    this.timer = window.setInterval(() => this.tick(), 100);
    this.tick();
  }

  destroy(): void {
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    hudBus.off('hud-layout', this.onResize, this);
    window.removeEventListener('resize', this.onResize);
    this.el.remove();
  }

  /** The objective text, the lines due, the bubble's time on screen. */
  private tick() {
    const s = this.session;
    const script = MISSION_SCRIPTS[s.mission.id];
    if (!script) return;
    const g = s.goal();
    const text = s.outcome() ? '' : line(script.goal).replace('{left}', String(g.left)).replace('{score}', String(Math.min(g.score, g.limit))).replace('{limit}', String(g.limit));
    // «clear» and «survive»: the hero's lives as hearts (full ones left, hollow ones lost)
    const lives = g.lives === null ? '' : '♥'.repeat(g.lives) + '♡'.repeat(Math.max(0, STORY_RULES.lives - g.lives));
    const sig = `${text}|${lives}|${getLang()}`;
    if (sig !== this.lastGoal) {
      this.lastGoal = sig;
      this.goalText.textContent = text;
      this.goalLives.textContent = lives;
      this.goalLives.title = g.lives === null ? '' : t('Lives: {n}', { n: g.lives });
      this.goalLives.style.display = lives ? '' : 'none';
    }
    this.goalEl.style.display = text && s.phase() === 'active' ? '' : 'none';
    for (const k of s.drainCues()) {
      const b = script.barks[k];
      if (b) this.queue.push(b);
    }
    const now = performance.now();
    if (this.bark && now >= this.barkUntil) {
      const old = this.bark;
      this.bark = null;
      old.classList.add('storybark--out');
      setTimeout(() => old.remove(), 240);
      this.nextBarkAt = now + BARK_GAP_MS;
    }
    if (!this.bark && this.queue.length > 0 && now >= this.nextBarkAt) this.show(this.queue.shift()!, now);
  }

  private show(b: Beat, now: number) {
    const art = speakerArt(b.who);
    this.bark = h(
      'div',
      { class: 'storybark', 'data-testid': 'story-bark' },
      art ? h('img', { class: 'storybark__ava', src: asset(`assets/portraits/${art}_small.png`), alt: '', draggable: 'false' }) : null,
      h('div', { class: 'storybark__bubble' }, h('b', null, speakerName(b.who)), h('span', null, line(b.say))),
    );
    this.barkBox.append(this.bark);
    this.barkUntil = now + BARK_MS + Math.min(2400, line(b.say).length * 25);
    sfx.play('click', { volume: 0.35 });
  }

  private readonly onResize = () => {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.layout());
  };

  /** HUD pixels → page pixels through the canvas rectangle. */
  private layout() {
    const l: HudLayout | null = hudLayout();
    const canvas = this.o.canvas();
    if (!l || !canvas) {
      this.el.style.visibility = 'hidden';
      return;
    }
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const k = r.width / l.W;
    this.el.style.visibility = '';
    this.el.classList.toggle('storylay--touch', l.touch);
    const gs = this.goalEl.style;
    gs.left = `${Math.round(r.left + l.goal.x * k)}px`;
    gs.top = `${Math.round(r.top + l.goal.y * k)}px`;
    gs.fontSize = `${l.touch ? 13 : Math.round(Math.min(18, Math.max(13, 10 * k)))}px`;
    const bs = this.barkBox.style;
    bs.left = `${Math.round(r.left + l.chat.left * k)}px`;
    bs.width = `${Math.round(Math.min(l.touch ? 300 : 380, Math.max(220, l.chat.width * k)))}px`;
    if (l.chat.top !== undefined) {
      bs.top = `${Math.round(r.top + l.chat.top * k)}px`;
      bs.bottom = '';
    } else {
      bs.bottom = `${Math.round(window.innerHeight - r.bottom + (l.chat.bottom ?? 0) * k)}px`;
      bs.top = '';
    }
  }
}
