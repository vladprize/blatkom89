/**
 * Weapon skins on screen: an atlas frame of «weapons» (the weapon in hand `w_*`, the HUD icon
 * `ico_*`) painted with a finish becomes its own canvas texture with the frame's full size, so it
 * keeps the frame's origin (the grip); the Arsenal's DOM icons get a painted data URL. Both are made
 * once and cached; a missing frame or a canvas that cannot be read falls back to the plain weapon.
 *
 * v0.2.19: a live finish (FINISHES[f].live) loops through LIVE_FRAMES pictures, LIVE_FRAME_MS each — one
 * texture or data URL per frame, painted with the frame's phase; whoever draws it asks for the frame of
 * «now» (the match's sprites and the HUD each frame, the Arsenal's icons on one shared timer). With the
 * system's «reduce motion» on, a live skin stays on its first frame.
 */
import type * as Phaser from 'phaser';
import { isLiveFinish } from '@blatkom/shared';
import type { FinishId, WeaponId } from '@blatkom/shared';
import { paintFinish } from './finish.js';
import { asset } from '../../ui/dom.js';

export const LIVE_FRAMES = 16;
export const LIVE_FRAME_MS = 110;

const reducedMotion = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** The frame of a live finish's loop to show now (0 with «reduce motion»). */
export function liveFrame(now = performance.now()): number {
  return reducedMotion() ? 0 : Math.floor(now / LIVE_FRAME_MS) % LIVE_FRAMES;
}

/**
 * Texture key of `frame` («w_avtomat», «ico_avtomat») painted with `finish` — for a live finish, its frame
 * `k` of the loop (by default the one to show now); '' when it cannot be made.
 */
export function skinTextureKey(textures: Phaser.Textures.TextureManager, frame: string, finish: FinishId, k?: number): string {
  const live = isLiveFinish(finish);
  const n = live ? (k ?? liveFrame()) : 0;
  const key = live ? `skin~${frame}~${finish}~${n}` : `skin~${frame}~${finish}`;
  if (textures.exists(key)) return key;
  if (!textures.exists('weapons')) return '';
  const atlas = textures.get('weapons');
  if (!atlas.has(frame)) return '';
  const f = atlas.get(frame);
  try {
    const tex = textures.createCanvas(key, f.realWidth, f.realHeight);
    if (!tex) return '';
    const ctx = tex.getContext();
    ctx.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, f.x, f.y, f.cutWidth, f.cutHeight);
    const img = ctx.getImageData(f.x, f.y, f.cutWidth, f.cutHeight);
    paintFinish(img.data, f.cutWidth, f.cutHeight, finish, n / LIVE_FRAMES);
    ctx.putImageData(img, f.x, f.y);
    tex.refresh();
    return key;
  } catch {
    if (textures.exists(key)) textures.remove(key);
    return '';
  }
}

/** Sets an image to the weapon frame, painted when a finish is given (a live one: its frame of now). */
export function setWeaponTexture(img: Phaser.GameObjects.Image, frame: string, finish: FinishId | null): void {
  const key = finish ? skinTextureKey(img.scene.textures, frame, finish) : '';
  if (key) {
    if (img.texture.key !== key) img.setTexture(key);
  } else if (img.texture.key !== 'weapons' || img.frame.name !== frame) img.setTexture('weapons', frame);
}

const icons = new Map<string, Promise<string>>();
/** The icons already painted, for drawing them at once (no flash of the plain weapon on a redraw). */
const ready = new Map<string, string>();
const bases = new Map<string, Promise<HTMLImageElement>>();

const iconKey = (weapon: WeaponId, finish: FinishId, small: boolean, k: number) => `${weapon}.${finish}${small ? '_s' : ''}${k ? `~${k}` : ''}`;

function baseIcon(weapon: WeaponId, small: boolean): Promise<HTMLImageElement> {
  const src = asset(`assets/ui/weapons/${weapon}${small ? '_s' : ''}.png`);
  let p = bases.get(src);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('icon not loaded'));
      img.src = src;
    });
    p.catch(() => bases.delete(src));
    bases.set(src, p);
  }
  return p;
}

/** The Arsenal icon (assets/ui/weapons) of `weapon` painted with `finish` (a live one: frame `k`), as a data URL. */
export function skinIconUrl(weapon: WeaponId, finish: FinishId, small = false, k = 0): Promise<string> {
  const key = iconKey(weapon, finish, small, k);
  let p = icons.get(key);
  if (!p) {
    p = baseIcon(weapon, small).then((img) => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      paintFinish(d.data, c.width, c.height, finish, isLiveFinish(finish) ? k / LIVE_FRAMES : 0);
      ctx.putImageData(d, 0, 0);
      const url = c.toDataURL();
      ready.set(key, url);
      return url;
    });
    p.catch(() => icons.delete(key));
    icons.set(key, p);
  }
  return p;
}

/** The painted icon if it is ready (its first frame for a live finish), else null. */
export function skinIconReady(weapon: WeaponId, finish: FinishId, small = false): string | null {
  return ready.get(iconKey(weapon, finish, small, 0)) ?? null;
}

interface LiveIcon {
  img: HTMLImageElement;
  finish: FinishId;
  urls: string[];
  shown: number;
  seen: boolean;
  born: number;
}
const liveIcons = new Set<LiveIcon>();
let ticker = 0;
const yieldToPage = () => new Promise<void>((r) => setTimeout(r, 0));

function tick() {
  const k = liveFrame();
  const now = performance.now();
  for (const e of liveIcons) {
    if (e.img.dataset.paint !== e.finish) {
      liveIcons.delete(e);
      continue;
    }
    if (!e.img.isConnected) {
      // gone from the page (the Arsenal redrew): forget it; one not on the page yet gets a while to arrive
      if (e.seen || now - e.born > 10_000) liveIcons.delete(e);
      continue;
    }
    e.seen = true;
    if (e.shown !== k && e.urls[k]) {
      e.img.src = e.urls[k]!;
      e.shown = k;
    }
  }
  if (liveIcons.size === 0) {
    clearInterval(ticker);
    ticker = 0;
  }
}

/**
 * Makes an Arsenal icon of a live finish loop: its frames are painted one at a time (the page stays
 * responsive), then one shared timer moves every live icon on the page to the frame of now.
 */
export function animateLiveIcon(img: HTMLImageElement, weapon: WeaponId, finish: FinishId, small = false): void {
  if (!isLiveFinish(finish) || reducedMotion()) return;
  void (async () => {
    const urls: string[] = [];
    for (let k = 0; k < LIVE_FRAMES; k++) {
      if (img.dataset.paint !== finish) return;
      const cached = ready.get(iconKey(weapon, finish, small, k));
      urls.push(cached ?? (await skinIconUrl(weapon, finish, small, k)));
      if (!cached) await yieldToPage();
    }
    if (img.dataset.paint !== finish) return;
    liveIcons.add({ img, finish, urls, shown: -1, seen: img.isConnected, born: performance.now() });
    if (!ticker) ticker = window.setInterval(tick, LIVE_FRAME_MS);
  })().catch(() => {});
}
