/**
 * v0.2.23 — the fighter card (the owner: «как можно больше портретов, как укомплектованы скины у игроков»):
 * one picture of a player as others see them — the character's art, the weapon painted in its skin (on a tall
 * card in the lower right corner, clear of the figure), the skin's grade in the frame and its light, the alias,
 * the level and, for a legendary skin, its eliminations. Drawn on a canvas (so it can be shared as a picture) in
 * two shapes:
 * - `tall` — the Arsenal, the line-up before a match, the podium, a friend's page, the shared picture;
 * - `wide` — a strip: the killer's card while the player waits to respawn, «what took you down» after the match.
 * A legendary skin's card has its own moving background (rays and sparks in the skin's colours); a live
 * skin loops its paint on the card as it does in the hand. v0.2.24: a legendary character's card moves too —
 * a foil sheen sweeps over the picture, the character's motes drift over it (legendLooks.ts) and a light runs
 * round the frame in the character's colour. One shared timer moves every card on the page and forgets the
 * ones that left it.
 *
 * The art: the character's full-height picture when there is one (assets/fullbody/<id>.png, FULLBODY), else
 * the waist-up hero card (assets/heroes/<id>.jpg).
 */
import { CHARACTERS, FINISHES, GRADE_COLORS, isLiveFinish, skinPerks } from '@blatkom/shared';
import type { CharacterId, FinishId, Grade, WeaponId } from '@blatkom/shared';
import { asset } from './dom.js';
import { charText, finishName, rarityLabel, weaponName } from '../i18n/content.js';
import { t, count } from '../i18n/index.js';
import { finishColors, rgba } from '../game/render/skinColors.js';
import type { RGB } from '../game/render/skinColors.js';
import { LIVE_FRAMES, LIVE_FRAME_MS, skinIconUrl } from '../game/render/skins.js';
import { legendLook } from '../game/render/legendLooks.js';
import type { LegendLook } from '../game/render/legendLooks.js';
import { FULLBODY } from './fullbody.js';

export type CardShape = 'tall' | 'wide';

export interface FighterCardData {
  name: string;
  character: CharacterId;
  level?: number | null;
  weapon: WeaponId;
  /** The skin on that weapon (null: the plain weapon). */
  finish: FinishId | null;
  /** Eliminations with this skin (a legendary skin's counter), when known. */
  kills?: number | null;
  /** A line over the card: «Took you down», «1st place»… */
  label?: string | null;
  /** The label's colour (default red). */
  labelColor?: string;
  /** A practice bot (no level badge). */
  bot?: boolean;
}

const BG = '#120e0c';
const BEIGE = '#e8dcc0';
const MUTED = '#a89c86';
const PLAIN: RGB = [168, 160, 146];
/** The frame's running light: its glow (how much wider, how bright), then the line itself. */
const GLOW_PASSES: readonly (readonly [number, number])[] = [
  [7, 0.14],
  [3.5, 0.26],
  [0, 1],
];

const reducedMotion = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const frac = (v: number): number => v - Math.floor(v);

/** A five-pointed star's path round (cx, cy): outer radius R, inner r, turned by `a`. */
function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, r: number, a: number) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const ang = a - Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r : R;
    if (k) ctx.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
    else ctx.moveTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
  }
  ctx.closePath();
}

// ── images, loaded once ───────────────────────────────────────────────────
const images = new Map<string, Promise<HTMLImageElement>>();
const loaded = new Map<string, HTMLImageElement>();

function image(src: string): Promise<HTMLImageElement> {
  let p = images.get(src);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        loaded.set(src, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`not loaded: ${src}`));
      img.src = src;
    });
    p.catch(() => images.delete(src));
    images.set(src, p);
  }
  return p;
}

/** The character's picture: full height (a big tall card, when the art exists) or the waist-up hero card. */
const artSrc = (c: CharacterId, full: boolean) => (full && FULLBODY.has(c) ? asset(`assets/fullbody/${c}.jpg`) : asset(`assets/heroes/${c}.jpg`));
const plainWeaponSrc = (w: WeaponId) => asset(`assets/ui/weapons/${w}.png`);

/**
 * A picture's own background colour at its edges — what a tall card fills around it (the headroom over the head,
 * the sides of a full-height figure), so the card's red is the picture's red (the owner: «такой же красный фон,
 * идентичный тому, что внутри карточки»). `top`: the top rows only (a waist-up portrait has only headroom);
 * else the top rows and both sides. Measured once per picture; the card's own dark if it can't be read.
 */
const edgeColors = new Map<string, string>();
function edgeColor(img: HTMLImageElement, src: string, top: boolean): string {
  const key = `${src}|${top ? 't' : 'a'}`;
  let c = edgeColors.get(key);
  if (c) return c;
  c = BG;
  try {
    const W = 24;
    const H = 36;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    if (g) {
      g.drawImage(img, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data;
      let r = 0;
      let gr = 0;
      let b = 0;
      let n = 0;
      for (let yy = 0; yy < H; yy++) {
        for (let xx = 0; xx < W; xx++) {
          const edge = yy < 2 || (!top && (xx < 2 || xx >= W - 2));
          if (!edge) continue;
          const i = (yy * W + xx) * 4;
          r += d[i]!;
          gr += d[i + 1]!;
          b += d[i + 2]!;
          n++;
        }
      }
      if (n) c = `rgb(${Math.round(r / n)},${Math.round(gr / n)},${Math.round(b / n)})`;
    }
  } catch {
    // a picture the canvas may not read: the card's own background
  }
  edgeColors.set(key, c);
  return c;
}

/** The painted weapon's frames (one for a still finish, LIVE_FRAMES for a live one), as they get ready. */
const weaponFrames = new Map<string, Array<HTMLImageElement | undefined>>();
/** v0.2.24: every card waiting on a painted weapon hears each frame arrive (before, only the first one asked). */
const frameWaiters = new Map<string, Set<() => void>>();
function weaponFrame(w: WeaponId, f: FinishId | null, k: number, onReady: () => void): HTMLImageElement | null {
  if (!f) {
    const src = plainWeaponSrc(w);
    const img = loaded.get(src);
    if (!img) void image(src).then(onReady, () => {});
    return img ?? null;
  }
  const key = `${w}.${f}`;
  let frames = weaponFrames.get(key);
  if (!frames) {
    const list: Array<HTMLImageElement | undefined> = [];
    frames = list;
    weaponFrames.set(key, list);
    const waiters = new Set<() => void>();
    frameWaiters.set(key, waiters);
    const n = isLiveFinish(f) && !reducedMotion() ? LIVE_FRAMES : 1;
    void (async () => {
      for (let i = 0; i < n; i++) {
        try {
          const url = await skinIconUrl(w, f, false, i);
          list[i] = await image(url);
          for (const cb of waiters) cb();
        } catch {
          break;
        }
      }
      frameWaiters.delete(key);
    })();
  }
  frameWaiters.get(key)?.add(onReady);
  const n = frames.length;
  if (!n) return null;
  return frames[k % n] ?? frames[0] ?? null;
}

/**
 * v0.2.25 (the owner: «у персонажей на карточках иногда сжимается текст ника»): a line too wide for its room is
 * set smaller (down to 62 % of its size), then cut with «…» — never squeezed sideways, which `fillText`'s own
 * width limit does.
 */
export function fitLine(ctx: CanvasRenderingContext2D, s: string, size: number, max: number | undefined, weight: number, font: string): { s: string; size: number } {
  if (!max || max <= 0) return { s, size };
  ctx.font = `${weight} ${size}px ${font}`;
  const w = ctx.measureText(s).width;
  if (w <= max) return { s, size };
  const z = Math.max(size * 0.62, Math.floor(size * (max / w) * 0.98 * 10) / 10);
  ctx.font = `${weight} ${z}px ${font}`;
  if (ctx.measureText(s).width <= max) return { s, size: z };
  let cut = s;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return { s: `${cut.trimEnd()}…`, size: z };
}

/** Whether the cards' font (Oswald) is loaded — once it is, it stays. */
let fontLoaded = false;
function fontIn(): boolean {
  if (fontLoaded) return true;
  try {
    fontLoaded = typeof document.fonts?.check !== 'function' || document.fonts.check('600 12px Oswald');
  } catch {
    fontLoaded = true;
  }
  return fontLoaded;
}

// ── one timer for every card on the page ──────────────────────────────────
const live = new Set<FighterCard>();
let raf = 0;
let last = 0;
function loop(now: number) {
  raf = 0;
  if (now - last >= 40) {
    last = now;
    for (const c of live) c.tick(now);
  }
  if (live.size) raf = requestAnimationFrame(loop);
}
function wake() {
  if (!raf && live.size) raf = requestAnimationFrame(loop);
}

export class FighterCard {
  readonly el: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private d: FighterCardData;
  private readonly w: number;
  private readonly h: number;
  private readonly shape: CardShape;
  private seen = false;
  private gone = 0;
  private destroyed = false;
  /** Only a card in view is animated (a row of sets scrolls; a sheet may cover the page). */
  private inView = true;
  private observer: IntersectionObserver | null = null;
  /** The screen's pixels per CSS pixel (the canvas is drawn at it, at most 3). */
  private readonly dpr: number;
  /** The art with its edges faded (see fadedArt), kept while the character and the size stay. */
  private faded: { key: string; c: HTMLCanvasElement } | null = null;
  /** v0.2.24: the full-height picture even on a small tall card (the menu's mini card, the lobby's line). */
  private readonly forceFull: boolean;
  /** v0.2.24: a thumbnail — no alias, counter or level on it (its owner's name is beside it). */
  private readonly mini: boolean;
  /**
   * v0.2.24: a moving tall card's still layers — under the weapon (the card's colours, the art, its shade) and over
   * it (the label, the grade, the level, the alias, the frame) — drawn once and copied each frame; only the light,
   * the motes, the sparks and a live skin are drawn anew.
   */
  private under: { key: string; c: HTMLCanvasElement } | null = null;
  private over: { key: string; c: HTMLCanvasElement } | null = null;
  /**
   * A painted weapon's frame has arrived (a live skin's come one by one, sixteen of them): a moving card shows it at
   * its next tick — redrawn the moment each arrived, a row of nine sets redrew 144 times in a burst as it opened.
   */
  private readonly onFrame = (): void => {
    if (!this.moves()) this.redraw();
  };

  /**
   * `ratio`: height ÷ width (tall 1.42, wide 0.34 by default; the Arsenal's poster is 4 : 3). `full`: the
   * full-height picture on a small tall card too; `mini`: a thumbnail without the texts.
   */
  constructor(d: FighterCardData, o: { shape?: CardShape; width: number; ratio?: number; className?: string; full?: boolean; mini?: boolean }) {
    this.shape = o.shape ?? 'tall';
    this.forceFull = !!o.full;
    this.mini = !!o.mini;
    this.w = Math.round(o.width);
    this.h = Math.round(o.width * (o.ratio ?? (this.shape === 'tall' ? 1.42 : 0.34)));
    const dpr = Math.min(3, Math.max(1, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    this.dpr = dpr;
    this.el = document.createElement('canvas');
    this.el.width = Math.round(this.w * dpr);
    this.el.height = Math.round(this.h * dpr);
    this.el.style.width = `${this.w}px`;
    this.el.style.height = `${this.h}px`;
    this.el.className = `fcard fcard--${this.shape}${o.className ? ` ${o.className}` : ''}`;
    this.el.setAttribute('role', 'img');
    this.el.dataset.testid = 'fighter-card';
    this.ctx = this.el.getContext('2d');
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.d = d;
    this.describe();
    this.draw(performance.now());
    // the art and the painted weapon arrive later: draw again then (and when the fonts are in)
    void image(artSrc(d.character, this.fullArt())).then(() => this.redraw(), () => {});
    if (document.fonts?.ready) void document.fonts.ready.then(() => this.redraw());
    live.add(this);
    wake();
    if (typeof IntersectionObserver === 'function') {
      this.observer = new IntersectionObserver((es) => {
        for (const e of es) this.inView = e.isIntersecting;
      });
      this.observer.observe(this.el);
    }
  }

  /** Shows another player or another weapon (the same canvas). */
  set(d: FighterCardData): void {
    const art = d.character !== this.d.character;
    this.d = d;
    this.describe();
    this.redraw();
    if (art) void image(artSrc(d.character, this.fullArt())).then(() => this.redraw(), () => {});
    live.add(this);
    wake();
  }

  destroy(): void {
    this.destroyed = true;
    live.delete(this);
    this.observer?.disconnect();
    this.observer = null;
    this.under = null;
    this.over = null;
  }

  /** Whether the card is animated: a skin that shines or moves, or a legendary character. */
  private moves(): boolean {
    if (reducedMotion()) return false;
    return !!skinPerks(this.d.finish)?.glow || isLiveFinish(this.d.finish) || !!legendLook(this.d.character);
  }

  /** One of the still layers at the canvas's own size, made again only when `key` changes. */
  private layer(slot: 'under' | 'over', key: string, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
    const cur = this[slot];
    // a layer with texts drawn before the game's font arrived is drawn again once it is in
    const k = `${key}|${slot === 'over' && !fontIn() ? '-' : 'f'}`;
    if (cur?.key === k) return cur.c;
    const c = cur?.c ?? document.createElement('canvas');
    // setting the size clears it
    c.width = this.el.width;
    c.height = this.el.height;
    const g = c.getContext('2d');
    if (!g) return null;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    paint(g);
    this[slot] = { key: k, c };
    return c;
  }

  /** Copies a layer onto the card, pixel for pixel. */
  private paste(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(c, 0, 0);
    ctx.restore();
  }

  /** The card as a PNG (for sharing). */
  toBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      try {
        this.el.toBlob((b) => resolve(b), 'image/png');
      } catch {
        resolve(null);
      }
    });
  }

  private describe() {
    const d = this.d;
    const ct = charText(d.character);
    const skin = d.finish ? `${finishName(d.finish)} (${rarityLabel(FINISHES[d.finish].rarity)})` : t('standard paint');
    const kills = skinPerks(d.finish)?.counter && typeof d.kills === 'number' ? `, ★ ${count(d.kills, 'elimination')}` : '';
    this.el.setAttribute('aria-label', `${d.label ? `${d.label}: ` : ''}${d.name} — ${ct.name}, ${weaponName(d.weapon)}, ${skin}${kills}`);
    this.el.dataset.character = d.character;
    this.el.dataset.weapon = d.weapon;
    this.el.dataset.finish = d.finish ?? '';
  }

  private redraw() {
    if (!this.destroyed) this.draw(performance.now());
  }

  /** Called by the shared timer: animate what moves, forget a card that left the page. */
  tick(now: number) {
    if (this.destroyed) {
      live.delete(this);
      return;
    }
    if (this.el.isConnected) {
      this.seen = true;
      this.gone = 0;
    } else {
      if (!this.gone) this.gone = now;
      // a card not on the page yet gets a while to arrive; one that left is forgotten
      if (now - this.gone > (this.seen ? 1500 : 10_000)) {
        live.delete(this);
        this.observer?.disconnect();
        this.observer = null;
      }
      return;
    }
    if (reducedMotion() || !this.inView) return;
    const perks = skinPerks(this.d.finish);
    if (perks?.glow || isLiveFinish(this.d.finish) || legendLook(this.d.character)) this.draw(now);
  }

  /** A small or squat tall card (the phone's kit, a crowded line-up, the podium): the portrait, a bigger weapon. */
  private compact(): boolean {
    return this.w < 120 || this.h / this.w < 1.25;
  }

  /**
   * v0.2.23: the full-height picture — on a tall card big enough to show the whole figure; small cards and the
   * wide ones keep the waist-up portrait (a face reads better there).
   */
  private fullArt(): boolean {
    if (this.shape !== 'tall' || !FULLBODY.has(this.d.character)) return false;
    return !this.compact() || (this.forceFull && this.h / this.w >= 1.25);
  }

  private grade(): Grade | null {
    return this.d.finish ? FINISHES[this.d.finish].rarity : null;
  }

  private draw(now: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.shape === 'tall') this.drawTall(ctx, now);
    else this.drawWide(ctx, now);
  }

  // ── pieces ──────────────────────────────────────────────────────────────
  private glowColors(): { glow: RGB; main: RGB; frame: string } {
    const g = this.grade();
    if (!this.d.finish || !g) return { glow: PLAIN, main: PLAIN, frame: '#5a5048' };
    const c = finishColors(this.d.finish);
    return { glow: c.glow, main: c.main, frame: GRADE_COLORS[g] };
  }

  private background(ctx: CanvasRenderingContext2D, now: number, cx: number, cy: number, r: number) {
    const { w, h } = this;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    const { glow } = this.glowColors();
    const g = this.grade();
    const strength = g === 'legendary' ? 0.55 : g === 'epic' ? 0.45 : g === 'rare' ? 0.35 : g ? 0.25 : 0.16;
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, rgba(glow, strength));
    rg.addColorStop(0.55, rgba(glow, strength * 0.35));
    rg.addColorStop(1, rgba(glow, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
    if (skinPerks(this.d.finish)?.cardBg) {
      // a legendary skin's own background: slow rays and twinkling sparks in its colours
      const still = reducedMotion();
      const a0 = still ? 0 : now / 9000;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(cx, cy);
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r * 1.6, a - 0.07, a + 0.07);
        ctx.closePath();
        ctx.fillStyle = rgba(glow, i % 2 ? 0.05 : 0.09);
        ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 18; i++) {
        const sx = ((Math.sin(i * 91.7) + 1) / 2) * w;
        const sy = ((Math.sin(i * 47.3 + 1.3) + 1) / 2) * h * 0.8;
        const tw = still ? 0.6 : (Math.sin(now / 420 + i * 1.7) + 1) / 2;
        if (tw < 0.25) continue;
        ctx.fillStyle = rgba(glow, 0.55 * tw);
        const s = 1 + tw * 1.6;
        ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
      }
      ctx.restore();
    }
  }

  private weapon(ctx: CanvasRenderingContext2D, now: number, cx: number, cy: number, width: number, tilt: number) {
    const k = isLiveFinish(this.d.finish) && !reducedMotion() ? Math.floor(now / LIVE_FRAME_MS) % LIVE_FRAMES : 0;
    const img = weaponFrame(this.d.weapon, this.d.finish, k, this.onFrame);
    if (!img) return;
    const iw = img.naturalWidth || 168;
    const ih = img.naturalHeight || 56;
    const s = width / iw;
    const { glow } = this.glowColors();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.imageSmoothingEnabled = false;
    ctx.shadowColor = rgba(glow, this.d.finish ? 0.85 : 0.35);
    ctx.shadowBlur = width * (this.grade() === 'legendary' ? 0.09 : this.grade() === 'epic' ? 0.07 : 0.05);
    ctx.drawImage(img, (-iw * s) / 2, (-ih * s) / 2, iw * s, ih * s);
    ctx.shadowBlur = 0;
    ctx.drawImage(img, (-iw * s) / 2, (-ih * s) / 2, iw * s, ih * s);
    ctx.restore();
  }

  /**
   * The character's art in a box. On a tall card (`full`, `bottom`) the art starts `room` under the box's top
   * (the owner: «небольшой отступ, чтобы голова не упиралась в верхнюю рамку»), its top edge faded into the card
   * (the card darkens its own lower part, see drawTall); on the wide card it fades out to the right.
   */
  private art(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fade: 'bottom' | 'right' | 'full', room = 0) {
    const full = fade === 'full';
    const src = artSrc(this.d.character, full);
    const img = loaded.get(src);
    if (!img) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (full) {
      // the whole figure: the picture's height fills the space under the headroom, its feet on the card's bottom;
      // round it (the headroom, the sides of a picture narrower than the card) the picture's own red, its edges
      // faded into it
      const s = (h - room) / img.naturalHeight;
      const dw = img.naturalWidth * s;
      const dh = img.naturalHeight * s;
      const dx = x + (w - dw) / 2;
      ctx.fillStyle = edgeColor(img, src, false);
      ctx.fillRect(x, y, w, h);
      // the pictures keep ~2 % of sky over the head: only that much fades at the top
      const side = dw < w - 1 ? Math.min(dw * 0.1, w * 0.1) : 0;
      ctx.drawImage(this.fadedArt(img, src, dw, dh, room ? dh * 0.02 : 0, side), dx, y + h - dh, dw, dh);
    } else if (room) {
      // the waist-up hero card covers the space under the headroom (cut at the bottom, not over the head); the
      // headroom is the portrait's own red, its top edge — a comb or a cap cut by the portrait's frame — faded into it
      const s = Math.max(w / img.naturalWidth, (h - room) / img.naturalHeight);
      const dw = img.naturalWidth * s;
      const dh = img.naturalHeight * s;
      ctx.fillStyle = edgeColor(img, src, true);
      ctx.fillRect(x, y, w, room + 1);
      ctx.drawImage(this.fadedArt(img, src, dw, dh, room * 0.8, 0), x + (w - dw) / 2, y + room, dw, dh);
    } else {
      // the waist-up hero card covers the space, its head kept in view
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * s;
      const dh = img.naturalHeight * s;
      ctx.drawImage(img, x + (w - dw) / 2, y + Math.min(0, (h - dh) * 0.15), dw, dh);
    }
    ctx.restore();
    if (fade !== 'right') return;
    // the wide card: the head and shoulders fade into the card towards the text
    const g = ctx.createLinearGradient(x + w * 0.45, 0, x + w, 0);
    g.addColorStop(0, 'rgba(18,14,12,0)');
    g.addColorStop(1, 'rgba(18,14,12,1)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }

  /**
   * The art at its size on the card with its top `top` px and its sides `side` px faded out (to the picture's own
   * red the card fills round it) — made once per card and size, then reused.
   */
  private fadedArt(img: HTMLImageElement, src: string, dw: number, dh: number, top: number, side: number): CanvasImageSource {
    if (top < 0.5 && side < 0.5) return img;
    const W = Math.max(1, Math.round(dw * this.dpr));
    const H = Math.max(1, Math.round(dh * this.dpr));
    const T = Math.round(top * this.dpr);
    const S = Math.min(Math.floor(W / 2), Math.round(side * this.dpr));
    const key = `${src}|${W}|${H}|${T}|${S}`;
    if (this.faded?.key === key) return this.faded.c;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    if (!g) return img;
    g.drawImage(img, 0, 0, W, H);
    // keep the picture where the masks are opaque (each mask fills the whole canvas — destination-in clears
    // whatever a fill leaves out; the gradients pad with their end colours)
    g.globalCompositeOperation = 'destination-in';
    if (T > 0) {
      const m = g.createLinearGradient(0, 0, 0, T);
      m.addColorStop(0, 'rgba(0,0,0,0)');
      m.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = m;
      g.fillRect(0, 0, W, H);
    }
    if (S > 0) {
      const m = g.createLinearGradient(0, 0, W, 0);
      m.addColorStop(0, 'rgba(0,0,0,0)');
      m.addColorStop(S / W, 'rgba(0,0,0,1)');
      m.addColorStop(1 - S / W, 'rgba(0,0,0,1)');
      m.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = m;
      g.fillRect(0, 0, W, H);
    }
    this.faded = { key, c };
    return c;
  }

  private frame(ctx: CanvasRenderingContext2D, now: number) {
    this.frameStill(ctx);
    this.frameLight(ctx, now);
  }

  /** The frame in the grade's colour and its corner brackets. */
  private frameStill(ctx: CanvasRenderingContext2D) {
    const { w, h } = this;
    const { frame } = this.glowColors();
    ctx.save();
    ctx.strokeStyle = frame;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    const L = Math.min(w, h) * 0.12;
    ctx.lineWidth = 3;
    // a card with a label: its strip marks the top (the top brackets cut into the label's first and last letters)
    const corners = [
      [3, 3, 1, 1],
      [w - 3, 3, -1, 1],
      [3, h - 3, 1, -1],
      [w - 3, h - 3, -1, -1],
    ] as const;
    for (const [x, y, sx, sy] of this.d.label ? corners.slice(2) : corners) {
      ctx.beginPath();
      ctx.moveTo(x, y + sy * L);
      ctx.lineTo(x, y);
      ctx.lineTo(x + sx * L, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Epic and up: a light runs round the frame in the skin's colours (two, opposite, for a legendary); v0.2.24: a
   * legendary character with a plainer skin — one in the character's colour.
   */
  private frameLight(ctx: CanvasRenderingContext2D, now: number) {
    const { w, h } = this;
    const { glow } = this.glowColors();
    const perks = skinPerks(this.d.finish);
    const legend = perks?.glow ? null : legendLook(this.d.character);
    const runGlow = legend ? legend.glow : glow;
    if ((perks?.glow || legend) && !reducedMotion()) {
      ctx.save();
      // along a rectangle just inside the edge (a line on the edge itself is half off the canvas)
      const i0 = 2.5;
      const iw = w - 2 * i0;
      const ih = h - 2 * i0;
      const P = 2 * (iw + ih);
      const at = (d: number): [number, number] => {
        let t = ((d % P) + P) % P;
        if (t < iw) return [i0 + t, i0];
        t -= iw;
        if (t < ih) return [w - i0, i0 + t];
        t -= ih;
        if (t < iw) return [w - i0 - t, h - i0];
        t -= iw;
        return [i0, h - i0 - t];
      };
      const runs = perks?.cardBg ? 2 : 1;
      const len = P * 0.24;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      // v0.2.24: the light's glow is two wider, fainter strokes under it — a shadow blur on each of its 20 pieces
      // (40 on a legendary skin's card) is 20–40 blur passes a frame on every card that shines
      const steps = 20;
      for (let r = 0; r < runs; r++) {
        const head = (now / 3200) * P + (r * P) / runs;
        for (const [extra, alpha] of GLOW_PASSES) {
          for (let i = 0; i < steps; i++) {
            const [x0, y0] = at(head - (len * i) / steps);
            const [x1, y1] = at(head - (len * (i + 1)) / steps);
            const k = 1 - i / steps;
            ctx.strokeStyle = extra ? rgba(runGlow, alpha * k) : i === 0 ? 'rgba(255,255,255,0.95)' : rgba(runGlow, 0.95 * k);
            ctx.lineWidth = 2 + 2 * k + extra;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
  }

  private text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, o: { weight?: number; align?: CanvasTextAlign; max?: number; font?: string } = {}) {
    ctx.save();
    const font = o.font ?? 'Oswald, sans-serif';
    const weight = o.weight ?? 600;
    const fit = fitLine(ctx, s, size, o.max, weight, font);
    ctx.font = `${weight} ${fit.size}px ${font}`;
    ctx.fillStyle = color;
    ctx.textAlign = o.align ?? 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,.75)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    ctx.fillText(fit.s, x, y);
    ctx.restore();
  }

  private ribbon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    const g = this.grade();
    const label = g ? rarityLabel(g).toUpperCase() : t('Standard').toUpperCase();
    ctx.save();
    ctx.font = `700 ${size}px Oswald, sans-serif`;
    const tw = ctx.measureText(label).width;
    const pad = size * 0.5;
    ctx.fillStyle = g ? GRADE_COLORS[g] : '#5a5048';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + tw + pad * 2 + size * 0.4, y);
    ctx.lineTo(x + tw + pad * 2, y + size * 1.5);
    ctx.lineTo(x, y + size * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = g === 'legendary' || g === 'common' ? '#1a1410' : '#fff6ea';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + pad, y + size * 0.78);
    ctx.restore();
  }

  private levelBadge(ctx: CanvasRenderingContext2D, rx: number, y: number, size: number) {
    const lvl = this.d.level;
    if (lvl === null || lvl === undefined || this.d.bot) return;
    const s = String(lvl);
    ctx.save();
    ctx.font = `700 ${size}px Oswald, sans-serif`;
    const tw = ctx.measureText(s).width;
    const bw = Math.max(size * 1.6, tw + size * 0.9);
    ctx.fillStyle = '#0b0908';
    ctx.fillRect(rx - bw - 1, y - 1, bw + 2, size * 1.5 + 2);
    ctx.fillStyle = '#d9b45a';
    ctx.fillRect(rx - bw, y, bw, size * 1.5);
    ctx.fillStyle = '#1a1410';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, rx - bw / 2, y + size * 0.8);
    ctx.font = `600 ${size * 0.5}px Oswald, sans-serif`;
    ctx.fillStyle = '#d9b45a';
    ctx.fillText(t('LVL'), rx - bw / 2, y + size * 1.5 + size * 0.42);
    ctx.restore();
  }

  private header(ctx: CanvasRenderingContext2D, size: number) {
    const label = this.d.label;
    if (!label) return;
    const { w } = this;
    ctx.save();
    ctx.fillStyle = this.d.labelColor ?? '#b8261e';
    ctx.fillRect(0, 0, w, size * 1.7);
    const fit = fitLine(ctx, label.toUpperCase(), size, w - 18, 700, 'Oswald, sans-serif');
    ctx.font = `700 ${fit.size}px Oswald, sans-serif`;
    ctx.fillStyle = '#fff3e0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fit.s, w / 2, size * 0.88);
    ctx.restore();
  }

  private skinLine(): { name: string; color: string } {
    const f = this.d.finish;
    if (!f) return { name: `${weaponName(this.d.weapon)} · ${t('standard paint')}`, color: MUTED };
    return { name: `${weaponName(this.d.weapon)} · «${finishName(f)}»`, color: GRADE_COLORS[FINISHES[f].rarity] };
  }

  // ── the two shapes ───────────────────────────────────────────────────────
  /**
   * The tall card. The owner (v0.2.23, on the first full-height cards): «как раньше — оружие снизу, справа, и без
   * этих надписей, либо сделай их меньше». So nothing lies across the figure: the art takes the whole card, the
   * weapon in its skin stands in the lower right corner on its own light, and one small line at the bottom keeps
   * the alias (and a legendary skin's ★ counter). The grade's ribbon and the level stay in the top corners; the
   * character, the weapon and the skin by name are only in the card's description (read by a screen reader).
   */
  private drawTall(ctx: CanvasRenderingContext2D, now: number) {
    const { w, h } = this;
    // a small or squat card (the phone's kit, a crowded line-up, the podium): the portrait, a bigger weapon
    const compact = this.compact();
    const full = this.fullArt();
    const fs = compact ? Math.max(9, w * 0.085) : w * 0.07;
    const head = this.d.label ? fs * 1.7 : 0;
    const ns = compact ? Math.max(9, w * 0.095) : Math.max(10, w * 0.056); // the alias's size
    const foot = ns * 1.75; // its strip at the bottom
    // a little headroom: the head clear of the frame (or of the label's strip)
    const room = Math.max(4, Math.round(h * 0.045));
    const squat = h / w < 1.25;
    // under the weapon: the card's colours and the art (which covers them once it is in), its lower part darker
    const under = (g: CanvasRenderingContext2D) => {
      this.background(g, now, w / 2, h * 0.5, w * 0.95);
      this.art(g, 0, head, w, h - head, full ? 'full' : 'bottom', room);
      // the card's lower part a little darker, so the weapon in its skin and the alias stand out (the owner:
      // «оружие / скины сильнее выделить — снизу затемнить градиентом немного карточки»)
      const g0 = h * (squat ? 0.56 : full ? 0.55 : 0.48);
      const shade = g.createLinearGradient(0, g0, 0, h);
      shade.addColorStop(0, 'rgba(10,8,7,0)');
      shade.addColorStop(0.5, 'rgba(10,8,7,0.5)');
      shade.addColorStop(1, 'rgba(10,8,7,0.92)');
      g.fillStyle = shade;
      g.fillRect(0, g0, w, h - g0);
    };
    // over it: the label, the grade, the level, the alias (and a legendary skin's eliminations), the frame
    const over = (g: CanvasRenderingContext2D) => {
      if (this.d.label) this.header(g, fs);
      if (!compact) this.ribbon(g, 0, head + w * 0.035, Math.max(7, w * 0.046));
      if (!this.mini) {
        this.levelBadge(g, w - w * 0.035, head + w * 0.035, Math.max(9, w * (compact ? 0.07 : 0.06)));
        // the alias: small, bottom left; a legendary skin's eliminations at the right
        const y = h - foot * 0.42;
        const pad = w * 0.06;
        const counter = skinPerks(this.d.finish)?.counter && typeof this.d.kills === 'number' ? `★ ${this.d.kills}` : '';
        let max = w - pad * 2;
        if (counter) {
          this.text(g, counter, w - pad, y, ns * 0.9, '#f2d27a', { weight: 600, align: 'right' });
          max -= this.measure(g, counter, ns * 0.9, 600) + pad * 0.6;
        }
        this.text(g, this.d.name, pad, y, ns, BEIGE, { weight: 600, max });
      }
      this.frameStill(g);
    };
    // a moving card copies both from its layers (once its art is in); a still one is drawn straight
    const d = this.d;
    const cache = this.moves() && loaded.has(artSrc(d.character, full));
    const u = cache ? this.layer('under', `${d.character}|${d.finish ?? ''}|${full}|${head}|${room}`, under) : null;
    if (u) this.paste(ctx, u);
    else under(ctx);
    this.legendFx(ctx, now, 0, head, w, h - head);
    // the weapon: the lower right corner, its butt towards the middle, the muzzle up to the right; on a squat card
    // (the phone's kit: the portrait cut at the chest, the face low and to the right) a little smaller, lower left
    const ww = w * (squat ? 0.66 : compact ? 0.74 : 0.6);
    const tilt = -0.16;
    const bh = (ww / 3) * Math.cos(-tilt) + ww * Math.sin(-tilt); // the turned icon's height (the icons are 3:1)
    const cx = squat ? w * 0.05 + ww / 2 : w - w * 0.045 - ww / 2;
    const cy = this.mini ? h - w * 0.05 - bh / 2 : h - foot - bh / 2 + bh * 0.08;
    this.weaponSpot(ctx, now, cx, cy, ww);
    this.weapon(ctx, now, cx, cy, ww, tilt);
    const o = cache ? this.layer('over', `${d.label ?? ''}|${d.labelColor ?? ''}|${d.finish ?? ''}|${d.level ?? ''}|${d.bot ? 1 : 0}|${d.name}|${d.kills ?? ''}`, over) : null;
    if (o) this.paste(ctx, o);
    else over(ctx);
    this.frameLight(ctx, now);
  }

  /**
   * v0.2.24: a legendary character's own light over its picture (the box x, y, w, h): a foil sheen sweeping
   * across now and then, and the character's motes — Аркадич's gold dust rising, Касатик's snow drifting down,
   * Пятак's five-pointed glints (legendLooks.ts). Still, with «reduce motion»: the motes where they are, no sheen.
   */
  private legendFx(ctx: CanvasRenderingContext2D, now: number, x: number, y: number, w: number, h: number) {
    const L = legendLook(this.d.character);
    if (!L) return;
    const still = reducedMotion();
    const t = still ? 0 : now;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    if (!still) {
      // the sheen crosses in the first 40 % of a 4.6 s cycle, then rests
      const k = (now % 4600) / 4600 / 0.4;
      if (k <= 1) {
        const bx = x - w * 0.5 + k * w * 2;
        const g = ctx.createLinearGradient(bx - w * 0.28, y + h * 0.1, bx + w * 0.28, y - h * 0.1);
        g.addColorStop(0, rgba(L.glow, 0));
        g.addColorStop(0.5, rgba(L.glow, 0.2));
        g.addColorStop(1, rgba(L.glow, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
      }
    }
    const n = Math.min(28, Math.round(10 + w / 12));
    const unit = Math.max(1, w / 170);
    for (let i = 0; i < n; i++) this.mote(ctx, L, t, i, x, y, w, h, unit);
    ctx.restore();
  }

  /** One of a legendary character's motes (`i` picks where it is in its own slow loop). */
  private mote(ctx: CanvasRenderingContext2D, L: LegendLook, t: number, i: number, x: number, y: number, w: number, h: number, unit: number) {
    const r1 = frac(Math.sin(i * 12.9898) * 43758.5453);
    const r2 = frac(Math.sin(i * 78.233) * 12543.123);
    const r3 = frac(Math.sin(i * 39.425) * 24634.6345);
    if (L.mote === 'gold') {
      // gold dust rising from below, swaying a little, twinkling
      const p = frac(t / (6000 + r2 * 3000) + r1);
      const px = x + r3 * w + Math.sin(t / 900 + i) * w * 0.02;
      const py = y + h * (1.02 - p * 1.06);
      const tw = 0.45 + 0.55 * Math.max(0, Math.sin(t / 300 + i * 1.9));
      const s = (1.1 + r2 * 1.6) * unit;
      ctx.fillStyle = rgba(L.glow, (0.25 + 0.55 * tw) * Math.min(1, p * 4, (1 - p) * 4));
      ctx.fillRect(px - s / 2, py - s / 2, s, s);
    } else if (L.mote === 'frost') {
      // snow drifting down and sideways, a few flakes as little crosses
      const p = frac(t / (7600 + r2 * 3400) + r1);
      const px = x + frac(r3 + t / 30000) * w + Math.sin(t / 1100 + i) * w * 0.03;
      const py = y + h * (p * 1.04 - 0.02);
      const s = (1 + r2 * 1.5) * unit;
      ctx.fillStyle = rgba(L.glow, (0.45 + 0.35 * r1) * Math.min(1, p * 5, (1 - p) * 5));
      if (r2 > 0.7) {
        ctx.fillRect(px - s * 1.4, py - s / 4, s * 2.8, s / 2);
        ctx.fillRect(px - s / 4, py - s * 1.4, s / 2, s * 2.8);
      } else ctx.fillRect(px - s / 2, py - s / 2, s, s);
    } else {
      // five-pointed glints flaring and fading where they are
      const tw = Math.max(0, Math.sin(t / 650 + i * 2.17 + r1 * 6));
      if (tw < 0.25 && t) return;
      const k = t ? (tw - 0.25) / 0.75 : 0.6;
      const R = (2.2 + r2 * 2.6) * unit * (0.5 + k);
      starPath(ctx, x + r3 * w, y + h * (0.06 + r1 * 0.86), R, R * 0.42, t / 2400 + i);
      ctx.fillStyle = rgba(i % 3 ? L.glow : ([255, 236, 200] as const), 0.35 + 0.5 * k);
      ctx.fill();
    }
  }

  /** Under the weapon in the corner: a soft shade off the art and, with a skin, its light (a legendary's sparks). */
  private weaponSpot(ctx: CanvasRenderingContext2D, now: number, cx: number, cy: number, ww: number) {
    const g = this.grade();
    const { glow } = this.glowColors();
    const r = ww * 0.64;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.5);
    const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    shade.addColorStop(0, 'rgba(10,8,7,0.6)');
    shade.addColorStop(0.6, 'rgba(10,8,7,0.32)');
    shade.addColorStop(1, 'rgba(10,8,7,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    if (g) {
      const strength = g === 'legendary' ? 0.6 : g === 'epic' ? 0.5 : g === 'rare' ? 0.4 : 0.26;
      ctx.globalCompositeOperation = 'lighter';
      const light = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      light.addColorStop(0, rgba(glow, strength));
      light.addColorStop(0.5, rgba(glow, strength * 0.4));
      light.addColorStop(1, rgba(glow, 0));
      ctx.fillStyle = light;
      ctx.fillRect(-r, -r, r * 2, r * 2);
    }
    ctx.restore();
    if (!skinPerks(this.d.finish)?.cardBg) return;
    // a legendary skin: sparks twinkle round the weapon (its rays are behind the art, mostly hidden by it)
    const still = reducedMotion();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39996;
      const rr = r * (0.5 + 0.5 * ((Math.sin(i * 12.9898) + 1) / 2));
      const tw = still ? 0.6 : (Math.sin(now / 380 + i * 1.7) + 1) / 2;
      if (tw < 0.3) continue;
      const s = Math.max(1.5, ww * 0.012) * (1 + tw);
      ctx.fillStyle = rgba(glow, 0.75 * tw);
      ctx.fillRect(cx + Math.cos(a) * rr - s / 2, cy + Math.sin(a) * rr * 0.55 - s / 2, s, s);
    }
    ctx.restore();
  }

  private drawWide(ctx: CanvasRenderingContext2D, now: number) {
    const { w, h } = this;
    this.background(ctx, now, w * 0.72, h * 0.55, w * 0.42);
    // the character on the left (its head and shoulders), fading into the card
    const aw = h * 1.05;
    this.art(ctx, 0, 0, aw, h, 'right');
    this.legendFx(ctx, now, 0, 0, aw * 0.9, h);
    const x0 = aw * 0.86;
    const pad = h * 0.07;
    const label = this.d.label;
    const ct = charText(this.d.character);
    const charLine = `${ct.name}${this.d.level !== null && this.d.level !== undefined && !this.d.bot ? ` · ${t('lvl {n}', { n: this.d.level })}` : ''}`;
    // the text keeps its column; the weapon takes the room right of the longest line (at least 38% of the
    // card — a long alias is squeezed rather than drawn under the weapon)
    const textMax = w * 0.62 - x0 - pad;
    const widest = Math.min(
      textMax,
      Math.max(
        label ? this.measure(ctx, label.toUpperCase(), h * 0.15, 700) : 0,
        this.measure(ctx, this.d.name, h * 0.22, 700),
        this.measure(ctx, charLine, h * 0.13, 500),
      ),
    );
    const wx0 = Math.max(x0 + widest + pad * 1.5, w * 0.5);
    const wx1 = w - pad;
    const ww = Math.min(w * 0.42, wx1 - wx0);
    if (label) this.text(ctx, label.toUpperCase(), x0, h * 0.25, h * 0.15, this.d.labelColor ?? '#ff6a5a', { weight: 700, max: textMax });
    this.text(ctx, this.d.name, x0, h * (label ? 0.5 : 0.42), h * 0.22, BEIGE, { weight: 700, max: textMax });
    this.text(ctx, charLine, x0, h * (label ? 0.68 : 0.62), h * 0.13, GRADE_COLORS[CHARACTERS[this.d.character].grade], { weight: 500, max: textMax });
    // the weapon big on the right (under the grade's ribbon), the skin's name under it, to the right edge
    this.weapon(ctx, now, (wx0 + wx1) / 2, h * 0.47, ww, -0.05);
    const counter = skinPerks(this.d.finish)?.counter && typeof this.d.kills === 'number' ? `★ ${this.d.kills}` : '';
    const counterW = counter ? this.measure(ctx, counter, h * 0.12, 600) + pad : 0;
    const sl = this.skinLine();
    this.text(ctx, sl.name, w - pad * 1.2, h * 0.88, h * 0.13, sl.color, { weight: 600, align: 'right', max: w - pad * 1.2 - x0 - counterW });
    if (this.grade()) this.ribbon(ctx, w - w * 0.2, 4, h * 0.1);
    if (counter) this.text(ctx, counter, x0, h * 0.88, h * 0.12, '#f2d27a', { weight: 600, max: w * 0.2 });
    this.frame(ctx, now);
  }

  /** A line's width in the card's font. */
  private measure(ctx: CanvasRenderingContext2D, s: string, size: number, weight: number): number {
    ctx.save();
    ctx.font = `${weight} ${size}px Oswald, sans-serif`;
    const m = ctx.measureText(s).width;
    ctx.restore();
    return m;
  }
}
