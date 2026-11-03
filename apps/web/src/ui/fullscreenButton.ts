/**
 * v0.2.18: the full-screen button (app/fullscreen.ts decides how) — in the menu's corner, in the pause menu
 * and over the match (left of the chat button). On an iPhone's browser it explains how to add the game to
 * the home screen, where it opens without the browser's bars.
 */
import { h, toast } from './dom.js';
import { t } from '../i18n/index.js';
import { openSheet } from './sheet.js';
import { fullscreenIcon, fullscreenWay, isFullscreen, onFullscreenChange, toggleFullscreen } from '../app/fullscreen.js';
import { hudBus, hudLayout } from '../game/scenes/hudBus.js';
import type { HudLayout } from '../game/scenes/hudBus.js';

/** «Share → Add to Home Screen» — the iPhone's way to play without the browser's bars. */
export function showHomescreenHint(root: HTMLElement): void {
  const chrome = /CriOS/i.test(navigator.userAgent);
  openSheet(root, {
    title: t('Full screen on an iPhone'),
    testid: 'homescreen-hint',
    body: h(
      'div',
      { class: 'col fshint' },
      h('div', null, t('iPhone browsers don’t let a page go full screen. Add the game to the home screen — from there it opens without the browser’s bars, sideways too:')),
      h(
        'ol',
        { class: 'fshint__steps' },
        h('li', null, chrome ? t('Tap Share in the address bar (or ⋯ → Share).') : t('Tap Share at the bottom of Safari (the square with the arrow).')),
        h('li', null, t('Choose «Add to Home Screen».')),
        h('li', null, t('Open BLATKOM ’89 from the home screen — your account stays the same.')),
      ),
      h('div', { class: 'muted' }, t('Telegram can open the game full screen too: the bot’s Play button.')),
    ),
  });
}

/** Toggles full screen; the iPhone gets the home-screen note. */
export function fullscreenAction(root: HTMLElement): void {
  void toggleFullscreen().then((r) => {
    if (r === 'homescreen') showHomescreenHint(root);
    else if (r === 'unavailable') toast(t('Full screen isn’t available here'));
  });
}

/** A button that toggles full screen and follows the state (hidden where there is no way to do it). */
export function fullscreenButton(root: HTMLElement, cls = 'iconbtn', testid = 'fullscreen', o: { label?: boolean } = {}): HTMLButtonElement | null {
  const way = fullscreenWay();
  if (way === 'none') return null;
  const btn = h('button', { class: `${cls} fsbtn${o.label ? ' fsbtn--label' : ''}`, 'data-testid': testid }) as HTMLButtonElement;
  const paint = () => {
    const on = isFullscreen();
    const label = on ? t('Exit full screen') : t('Full screen');
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(on));
    btn.title = label;
    // v0.2.19 (the owner: «полный экран на компе вообще не обнаружил»): on a computer the icon says what it does
    btn.replaceChildren(fullscreenIcon(on), ...(o.label ? [h('span', { class: 'fsbtn__label' }, label)] : []));
  };
  btn.addEventListener('click', () => fullscreenAction(root));
  const off = onFullscreenChange(() => {
    if (!btn.isConnected) return off();
    paint();
  });
  paint();
  return btn;
}

/**
 * Over a match: the button under the menu button (the HUD publishes where — clear of the score boxes and
 * the chat button), so a phone held sideways can go full screen without leaving the match. Not on an
 * iPhone's browser (the note is in the pause menu).
 */
export class MatchFullscreenButton {
  private readonly btn: HTMLButtonElement | null;
  private raf = 0;

  constructor(
    root: HTMLElement,
    private readonly canvas: () => HTMLCanvasElement | null,
  ) {
    const way = fullscreenWay();
    this.btn = way === 'api' || way === 'telegram' ? fullscreenButton(root, 'fsbtn--match', 'match-fullscreen') : null;
    if (!this.btn) return;
    this.btn.style.visibility = 'hidden';
    root.append(this.btn);
    hudBus.on('hud-layout', this.onResize, this);
    window.addEventListener('resize', this.onResize);
    this.layout();
  }

  private readonly onResize = () => {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.layout());
  };

  private layout() {
    const b = this.btn;
    if (!b) return;
    const l: HudLayout | null = hudLayout();
    const canvas = this.canvas();
    if (!l || !canvas) {
      b.style.visibility = 'hidden';
      return;
    }
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const k = r.width / l.W;
    const size = Math.round(Math.max(30, l.fsBtn.size * k));
    const s = b.style;
    s.width = s.height = `${size}px`;
    s.left = `${Math.round(r.left + l.fsBtn.x * k - size / 2)}px`;
    s.top = `${Math.round(r.top + l.fsBtn.y * k - size / 2)}px`;
    s.visibility = '';
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    hudBus.off('hud-layout', this.onResize, this);
    window.removeEventListener('resize', this.onResize);
    this.btn?.remove();
  }
}
