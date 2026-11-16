/**
 * Fable cut: the map's lamps baked once, at the match's start, into textures with their shadows in them.
 *
 * A lamp that never flickers goes into one picture of the whole map (the night's own light, darker at the
 * foot of the walls, and every steady lamp on top); a lamp that flickers keeps a picture of its own so it can
 * dim. After that a frame costs what it cost before — a picture per lamp in view — but the light stops at the
 * walls, pours through the doorways and the crates throw shadows.
 */
import type { LightDef, MapDef } from '@blatkom/shared';
import { OccluderIndex, inside, outline, shadowHull } from './shadows.js';
import type { Occluder } from './shadows.js';

/** A light pool's falloff: bright core, long soft shoulder (the classic picture's pool). */
export const POOL_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0.18, 0.86],
  [0.4, 0.52],
  [0.62, 0.24],
  [0.82, 0.07],
  [1, 0],
];

/** The same pool on wet ground (rain): a tighter, hotter core — the lamp's own reflection in the asphalt. */
const WET_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0.07, 0.9],
  [0.18, 0.6],
  [0.4, 0.43],
  [0.62, 0.2],
  [0.82, 0.06],
  [1, 0],
];

export interface BakeOptions {
  /** Texels per world pixel. */
  res: number;
  /** Lamp positions sampled per lamp: one is a hard shadow, more a penumbra. */
  samples: number;
  /** The night's own light, in light-map units (0–255 a channel). */
  ambient: readonly [number, number, number];
  /** Light-map units a lamp of intensity 1 adds at its centre (0–1). */
  gain: number;
  /** The ground is wet: the lamps are mirrored in it. */
  wet?: boolean;
}

export interface Cookie {
  /** The lamp's index in the map's list. */
  index: number;
  canvas: HTMLCanvasElement;
  /** Where it lies, in world px. */
  x: number;
  y: number;
  size: number;
}

export interface Baked {
  base: HTMLCanvasElement;
  cookies: Cookie[];
  res: number;
  /** Where each lamp's light comes from after it is moved off the wall it hangs on. */
  origins: Array<{ x: number; y: number }>;
  /** How long the baking took. */
  ms: number;
}

/** How big a lamp is: its light comes from a disc this wide, which is what softens the shadows' edges. */
const LAMP_SIZE = 4.5;

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/**
 * A canvas that is done with gives its memory back at once: a phone's browser counts every canvas against one
 * small budget and frees them late (the lamps of a map are some thirty canvases, baked again on every new map).
 */
function release(c: HTMLCanvasElement) {
  c.width = 0;
  c.height = 0;
}

function path(ctx: CanvasRenderingContext2D, pts: number[]) {
  ctx.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
  ctx.closePath();
}

/** A point inside a wall is moved just outside its nearest edge: a lamp on a wall lights the side it hangs on. */
export function offTheWall(near: Occluder[], x: number, y: number): { x: number; y: number } {
  for (let pass = 0; pass < 2; pass++) {
    for (const o of near) {
      if (!o.wall || !inside(o, x, y)) continue;
      const l = x - o.x;
      const r = o.x + o.w - x;
      const t = y - o.y;
      const b = o.y + o.h - y;
      const m = Math.min(l, r, t, b);
      if (m === l) x = o.x - 1.5;
      else if (m === r) x = o.x + o.w + 1.5;
      else if (m === t) y = o.y - 1.5;
      else y = o.y + o.h + 1.5;
    }
  }
  return { x, y };
}

const hullScratch: number[] = [];
const outlineScratch: number[] = [];

/**
 * One lamp: its pool with the shadows cut out. Each sample of the lamp's disc draws what it lights (white),
 * minus every occluder's shadow; the samples are averaged, then the pool's colour and falloff are laid in.
 */
function bakeLamp(l: LightDef, origin: { x: number; y: number }, near: Occluder[], o: BakeOptions, mask: HTMLCanvasElement, peak: number): HTMLCanvasElement {
  const S = Math.ceil(l.radius * 2 * o.res);
  const out = canvasOf(S, S);
  const acc = out.getContext('2d')!;
  mask.width = S;
  mask.height = S;
  const m = mask.getContext('2d')!;
  const x0 = l.x - l.radius;
  const y0 = l.y - l.radius;
  const far = l.radius * 3;
  const n = Math.max(1, o.samples);
  for (let s = 0; s < n; s++) {
    let sx = origin.x;
    let sy = origin.y;
    if (s > 0) {
      const a = ((s - 1) / (n - 1)) * Math.PI * 2 + 0.4;
      const p = offTheWall(near, sx + Math.cos(a) * LAMP_SIZE, sy + Math.sin(a) * LAMP_SIZE);
      sx = p.x;
      sy = p.y;
    }
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = 'source-over';
    m.fillStyle = '#fff';
    m.fillRect(0, 0, S, S);
    m.setTransform(o.res, 0, 0, o.res, -x0 * o.res, -y0 * o.res);
    m.globalCompositeOperation = 'destination-out';
    m.fillStyle = '#000';
    for (const occ of near) {
      const hull = shadowHull(occ, sx, sy, far, hullScratch);
      m.beginPath();
      if (!hull) {
        // the lamp hangs over it: a prop's top is simply lit; a wall's top stays dark
        if (!occ.wall) continue;
        path(m, outline(occ, outlineScratch));
        m.fill();
        continue;
      }
      path(m, hull);
      if (occ.wall) m.fill();
      else {
        // a prop is lower than the lamp: its top is lit, the shadow lies behind it
        path(m, outline(occ, outlineScratch));
        m.fill('evenodd');
      }
    }
    acc.globalCompositeOperation = 'lighter';
    acc.globalAlpha = 1 / n;
    acc.drawImage(mask, 0, 0);
  }
  // the pool itself, where the mask let it through
  acc.globalAlpha = 1;
  acc.globalCompositeOperation = 'source-in';
  const c = S / 2;
  const g = acc.createRadialGradient(c, c, 0, c, c, c);
  const r = (l.color >> 16) & 255;
  const gr = (l.color >> 8) & 255;
  const b = l.color & 255;
  for (const [stop, a] of o.wet ? WET_STOPS : POOL_STOPS) g.addColorStop(stop, `rgba(${r},${gr},${b},${(a * peak).toFixed(4)})`);
  acc.fillStyle = g;
  acc.fillRect(0, 0, S, S);
  acc.globalCompositeOperation = 'source-over';
  return out;
}

/** Whether the lamp changes its brightness (and so cannot be baked into the map's one picture). */
export function flickers(l: LightDef): boolean {
  return l.flicker === 'soft' || l.flicker === 'broken';
}

export function bakeLights(map: MapDef, index: OccluderIndex, o: BakeOptions): Baked {
  const t0 = performance.now();
  const W = Math.ceil(map.width * o.res);
  const H = Math.ceil(map.height * o.res);
  const base = canvasOf(W, H);
  const ctx = base.getContext('2d')!;
  const amb = `rgb(${o.ambient[0]},${o.ambient[1]},${o.ambient[2]})`;
  ctx.fillStyle = amb;
  ctx.fillRect(0, 0, W, H);
  // the night is darker at the foot of a wall and of anything tall: a soft halo round each, its top left clean
  ctx.setTransform(o.res, 0, 0, o.res, 0, 0);
  const tall = index.list.filter((c) => c.wall || (c.solid && c.reach >= 2));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  for (const c of tall) {
    ctx.shadowColor = c.wall ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.34)';
    ctx.shadowBlur = (c.wall ? 11 : 7) * o.res;
    ctx.beginPath();
    if (c.kind === 'circle') ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
    else ctx.rect(c.x, c.y, c.w, c.h);
    ctx.fill();
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  for (const c of tall) {
    ctx.beginPath();
    if (c.kind === 'circle') ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
    else ctx.rect(c.x, c.y, c.w, c.h);
    ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const mask = canvasOf(4, 4);
  const near: Occluder[] = [];
  const cookies: Cookie[] = [];
  const origins: Array<{ x: number; y: number }> = [];
  ctx.globalCompositeOperation = 'lighter';
  map.lights.forEach((l, i) => {
    index.query(l.x - l.radius, l.y - l.radius, l.x + l.radius, l.y + l.radius, near);
    const origin = offTheWall(near, l.x, l.y);
    origins.push(origin);
    const peak = Math.min(1, l.intensity * o.gain * (o.wet ? 1.22 : 1));
    if (peak <= 0.01) return;
    const lamp = bakeLamp(l, origin, near, o, mask, peak);
    const x = l.x - l.radius;
    const y = l.y - l.radius;
    if (flickers(l)) cookies.push({ index: i, canvas: lamp, x, y, size: l.radius * 2 });
    else {
      ctx.drawImage(lamp, Math.round(x * o.res), Math.round(y * o.res));
      release(lamp);
    }
  });
  ctx.globalCompositeOperation = 'source-over';
  release(mask);
  return { base, cookies, res: o.res, origins, ms: performance.now() - t0 };
}
