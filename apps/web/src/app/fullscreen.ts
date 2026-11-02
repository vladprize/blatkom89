/**
 * v0.2.18 — full screen (the owner: «кнопка полный экран, которая делает полный экран и в браузере на компе и
 * на телефоне»). One button, the best way each place has:
 *  - Telegram (Bot API 8.0+): the Mini App's own fullscreen (WebApp.requestFullscreen / exitFullscreen);
 *  - a browser with the Fullscreen API (computers, Android, iPad): the whole page goes full screen;
 *  - an iPhone's browser (Safari and Chrome give no full screen to pages): a short note — «Share → Add to
 *    Home Screen»; opened from the home screen the game has no browser bars (the web app manifest).
 * Opened from the home screen already («standalone»), the page is full screen and the button hides.
 */
import { tg } from '../telegram/tg.js';

export type FullscreenWay = 'telegram' | 'api' | 'homescreen' | 'none';

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void; webkitFullscreenEnabled?: boolean };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const doc = () => document as FsDoc;
const rootEl = () => document.documentElement as FsEl;

/** The page itself is full screen through the Fullscreen API (the button's own full screen). */
function apiFullscreen(): boolean {
  const d = doc();
  return !!(d.fullscreenElement ?? d.webkitFullscreenElement);
}

/**
 * Opened from the home screen (an installed web app): no browser bars to hide. The Fullscreen API's own
 * full screen matches «display-mode: fullscreen» as well — that one is the button's, not an installed app.
 */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  if (typeof window.matchMedia !== 'function') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return !apiFullscreen() && window.matchMedia('(display-mode: fullscreen)').matches;
}

/** An iPhone (or an iPod) — its browsers can't put a page in full screen. */
function isIphone(): boolean {
  return /iPhone|iPod/i.test(navigator.userAgent);
}

export function fullscreenWay(): FullscreenWay {
  const t = tg();
  if (t) return t.isVersionAtLeast('8.0') && typeof t.requestFullscreen === 'function' ? 'telegram' : 'none';
  if (isStandalone()) return 'none';
  const d = doc();
  const el = rootEl();
  if ((d.fullscreenEnabled || d.webkitFullscreenEnabled) && (typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function')) return 'api';
  if (isIphone()) return 'homescreen';
  return 'none';
}

export function isFullscreen(): boolean {
  const t = tg();
  if (t) return t.isFullscreen === true;
  return apiFullscreen();
}

/** On, off — or the home-screen note on an iPhone. Never throws (a refused request just stays as it was). */
export async function toggleFullscreen(): Promise<'on' | 'off' | 'homescreen' | 'unavailable'> {
  const way = fullscreenWay();
  if (way === 'homescreen') return 'homescreen';
  if (way === 'none') return 'unavailable';
  const on = isFullscreen();
  try {
    if (way === 'telegram') {
      const t = tg()!;
      if (on) t.exitFullscreen?.();
      else t.requestFullscreen?.();
      return on ? 'off' : 'on';
    }
    const d = doc();
    if (on) {
      if (typeof d.exitFullscreen === 'function') await d.exitFullscreen();
      else await d.webkitExitFullscreen?.();
      return 'off';
    }
    const el = rootEl();
    if (typeof el.requestFullscreen === 'function') await el.requestFullscreen({ navigationUI: 'hide' });
    else await el.webkitRequestFullscreen?.();
    return 'on';
  } catch {
    return 'unavailable';
  }
}

/** Calls `cb` whenever full screen goes on or off (the buttons repaint their icon). Returns the unsubscribe. */
export function onFullscreenChange(cb: () => void): () => void {
  const handler = () => cb();
  document.addEventListener('fullscreenchange', handler);
  document.addEventListener('webkitfullscreenchange', handler);
  const t = tg();
  t?.onEvent?.('fullscreenChanged', handler);
  return () => {
    document.removeEventListener('fullscreenchange', handler);
    document.removeEventListener('webkitfullscreenchange', handler);
    t?.offEvent?.('fullscreenChanged', handler);
  };
}

/** The icon: four corners pointing out (go full screen) or in (leave it), drawn as inline SVG. */
export function fullscreenIcon(on: boolean): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2.4');
  path.setAttribute('stroke-linecap', 'square');
  path.setAttribute('d', on ? 'M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6' : 'M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6');
  svg.append(path);
  return svg;
}
