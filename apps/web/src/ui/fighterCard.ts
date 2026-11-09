/**
 * v0.2.23 — the fighter card (the owner: «как можно больше портретов, как укомплектованы скины у игроков»):
 * one picture of a player as others see them — the character's art, the weapon in hand painted big in its
 * skin, the skin's grade in the frame and its light behind, the alias, the level and, for a legendary skin,
 * its eliminations. Drawn on a canvas (so it can be shared as a picture) in two shapes:
 * - `tall` — the Arsenal, the line-up before a match, the podium, a friend's page, the shared picture;
 * - `wide` — a strip: the killer's card while the player waits to respawn, «what took you down» after the match.
 * A legendary skin's card has its own moving background (rays and sparks in the skin's colours); a live
 * skin loops its paint on the card as it does in the hand. One shared timer moves every card on the page and
 * forgets the ones that left it.
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

const reducedMotion = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

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

const artSrc = (c: CharacterId) => (FULLBODY.has(c) ? asset(`assets/fullbody/${c}.png`) : asset(`assets/heroes/${c}.jpg`));
const plainWeaponSrc = (w: WeaponId) => asset(`assets/ui/weapons/${w}.png`);

/** The painted weapon's frames (one for a still finish, LIVE_FRAMES for a live one), as they get ready. */
const weaponFrames = new Map<string, Array<HTMLImageElement | undefined>>();
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
    frames = [];
    weaponFrames.set(key, frames);
    const n = isLiveFinish(f) && !reducedMotion() ? LIVE_FRAMES : 1;
    void (async () => {
      for (let i = 0; i < n; i++) {
        try {
          const url = await skinIconUrl(w, f, false, i);
          frames![i] = await image(url);
          onReady();
        } catch {
          return;
        }
      }
    })();
  }
  const n = frames.length;
  if (!n) return null;
  return frames[k % n] ?? frames[0] ?? null;
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

  /** `ratio`: height ÷ width (tall 1.42, wide 0.34 by default; the Arsenal's poster is 4 : 3). */
  constructor(d: FighterCardData, o: { shape?: CardShape; width: number; ratio?: number; className?: string }) {
    this.shape = o.shape ?? 'tall';
    this.w = Math.round(o.width);
    this.h = Math.round(o.width * (o.ratio ?? (this.shape === 'tall' ? 1.42 : 0.34)));
    const dpr = Math.min(3, Math.max(1, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
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
    void image(artSrc(d.character)).then(() => this.redraw(), () => {});
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
    if (art) void image(artSrc(d.character)).then(() => this.redraw(), () => {});
    live.add(this);
    wake();
  }

  destroy(): void {
    this.destroyed = true;
    live.delete(this);
    this.observer?.disconnect();
    this.observer = null;
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
    this.el.setAttribute('aria-label', `${d.label ? `${d.label}: ` : ''}${d.name} — ${ct.name}, ${weaponName(d.weapon)}, ${skin}`);
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
    if (perks?.glow || isLiveFinish(this.d.finish)) this.draw(now);
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
    const img = weaponFrame(this.d.weapon, this.d.finish, k, () => this.redraw());
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

  private art(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fade: 'bottom' | 'right') {
    const src = artSrc(this.d.character);
    const img = loaded.get(src);
    if (!img) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (FULLBODY.has(this.d.character)) {
      // the full-height picture stands on the card's floor, its height filling the space
      const s = h / img.naturalHeight;
      const dw = img.naturalWidth * s;
      ctx.drawImage(img, x + (w - dw) / 2, y, dw, h);
    } else {
      // the waist-up hero card covers the space, its head kept in view
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * s;
      const dh = img.naturalHeight * s;
      ctx.drawImage(img, x + (w - dw) / 2, y + Math.min(0, (h - dh) * 0.15), dw, dh);
    }
    ctx.restore();
    // fade into the card
    const g = fade === 'bottom' ? ctx.createLinearGradient(0, y + h * 0.55, 0, y + h) : ctx.createLinearGradient(x + w * 0.45, 0, x + w, 0);
    g.addColorStop(0, 'rgba(18,14,12,0)');
    g.addColorStop(1, 'rgba(18,14,12,1)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }

  private frame(ctx: CanvasRenderingContext2D, now: number) {
    const { w, h } = this;
    const { frame, glow } = this.glowColors();
    ctx.save();
    ctx.strokeStyle = frame;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    // epic and up: a light runs round the frame in the skin's colours (two, opposite, for a legendary)
    const perks = skinPerks(this.d.finish);
    if (perks?.glow && !reducedMotion()) {
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
      const runs = perks.cardBg ? 2 : 1;
      const len = P * 0.24;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.shadowColor = rgba(glow, 0.9);
      ctx.shadowBlur = 8;
      for (let r = 0; r < runs; r++) {
        const head = (now / 3200) * P + (r * P) / runs;
        const steps = 20;
        for (let i = 0; i < steps; i++) {
          const [x0, y0] = at(head - (len * i) / steps);
          const [x1, y1] = at(head - (len * (i + 1)) / steps);
          const k = 1 - i / steps;
          ctx.strokeStyle = i === 0 ? 'rgba(255,255,255,0.95)' : rgba(glow, 0.95 * k);
          ctx.lineWidth = 2 + 2 * k;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'butt';
      ctx.strokeStyle = frame;
    }
    // corner brackets
    const L = Math.min(w, h) * 0.12;
    ctx.lineWidth = 3;
    for (const [x, y, sx, sy] of [
      [3, 3, 1, 1],
      [w - 3, 3, -1, 1],
      [3, h - 3, 1, -1],
      [w - 3, h - 3, -1, -1],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x, y + sy * L);
      ctx.lineTo(x, y);
      ctx.lineTo(x + sx * L, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, o: { weight?: number; align?: CanvasTextAlign; max?: number; font?: string } = {}) {
    ctx.save();
    ctx.font = `${o.weight ?? 600} ${size}px ${o.font ?? 'Oswald, sans-serif'}`;
    ctx.fillStyle = color;
    ctx.textAlign = o.align ?? 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,.75)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    ctx.fillText(s, x, y, o.max);
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
    ctx.font = `700 ${size}px Oswald, sans-serif`;
    ctx.fillStyle = '#fff3e0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.toUpperCase(), w / 2, size * 0.88, w - 12);
    ctx.restore();
  }

  private skinLine(): { name: string; color: string } {
    const f = this.d.finish;
    if (!f) return { name: `${weaponName(this.d.weapon)} · ${t('standard paint')}`, color: MUTED };
    return { name: `${weaponName(this.d.weapon)} · «${finishName(f)}»`, color: GRADE_COLORS[FINISHES[f].rarity] };
  }

  // ── the two shapes ───────────────────────────────────────────────────────
  private drawTall(ctx: CanvasRenderingContext2D, now: number) {
    const { w, h } = this;
    // a small or squat card (the phone's kit, a crowded line-up): the alias and the skin only, bigger
    const compact = w < 120 || h / w < 1.25;
    const fs = compact ? Math.max(9, w * 0.085) : w * 0.07;
    const head = this.d.label ? fs * 1.7 : 0;
    this.background(ctx, now, w / 2, h * 0.6, w * 0.95);
    this.art(ctx, 0, head, w, h * (compact ? 0.7 : 0.74) - head, 'bottom');
    if (this.d.label) this.header(ctx, fs);
    if (!compact) this.ribbon(ctx, 0, head + w * 0.035, Math.max(7, w * 0.052));
    this.levelBadge(ctx, w - w * 0.035, head + w * 0.035, Math.max(9, w * 0.07));
    if (compact) {
      this.weapon(ctx, now, w / 2, h * 0.66, w * 0.92, -0.07);
      this.text(ctx, this.d.name, w / 2, h * 0.86, Math.max(10, w * 0.11), BEIGE, { weight: 700, align: 'center', max: w * 0.92 });
      const sl = this.skinLine();
      this.text(ctx, this.d.finish ? `«${finishName(this.d.finish)}»` : t('standard paint'), w / 2, h * 0.95, Math.max(8, w * 0.075), sl.color, { weight: 600, align: 'center', max: w * 0.92 });
      this.frame(ctx, now);
      return;
    }
    this.weapon(ctx, now, w / 2, h * 0.705, w * 0.9, -0.07);
    const ct = charText(this.d.character);
    const cg = CHARACTERS[this.d.character].grade;
    this.text(ctx, this.d.name, w / 2, h * 0.835, w * 0.092, BEIGE, { weight: 700, align: 'center', max: w * 0.92 });
    this.text(ctx, `${ct.name} «${ct.nickname}»`, w / 2, h * 0.887, w * 0.054, GRADE_COLORS[cg], { weight: 500, align: 'center', max: w * 0.92 });
    const sl = this.skinLine();
    this.text(ctx, sl.name, w / 2, h * 0.935, w * 0.054, sl.color, { weight: 600, align: 'center', max: w * 0.92 });
    if (skinPerks(this.d.finish)?.counter && typeof this.d.kills === 'number') this.text(ctx, `★ ${count(this.d.kills, 'elimination')}`, w / 2, h * 0.977, w * 0.045, '#f2d27a', { weight: 500, align: 'center', max: w * 0.92 });
    this.frame(ctx, now);
  }

  private drawWide(ctx: CanvasRenderingContext2D, now: number) {
    const { w, h } = this;
    this.background(ctx, now, w * 0.72, h * 0.55, w * 0.42);
    // the character on the left (its head and shoulders), fading into the card
    const aw = h * 1.05;
    this.art(ctx, 0, 0, aw, h, 'right');
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
