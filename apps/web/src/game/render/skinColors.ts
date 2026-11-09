/**
 * v0.2.23: a skin's own colours, for the light it gives off (rare and up: tracers, the muzzle's glow and
 * light; epic and up: the glow round the weapon, the burst of an elimination; the fighter cards' glow).
 * The colours come from the painter itself — a plain weapon-shaped strip painted with the finish — so
 * they follow the finish's design without a table to keep in step. Pure and cached; works without the
 * game's textures (in the Arsenal, on the cards, in tests).
 */
import type { FinishId } from '@blatkom/shared';
import { paintFinish } from './finish.js';

export type RGB = readonly [number, number, number];

export interface SkinColors {
  /** The finish's body colour (its saturated pixels, averaged). */
  main: RGB;
  /** A bright version for additive light: its brightest colourful pixels, lifted to full brightness. */
  glow: RGB;
  /** Both as 0xRRGGBB for Phaser tints. */
  mainHex: number;
  glowHex: number;
}

const W = 64;
const H = 16;

/** A weapon-like strip: transparent margin, a dark outline, metal grey front and wood brown back. */
function strip(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = (y * W + x) * 4;
      const edge = y === 2 || y === H - 3 || x === 2 || x === W - 3;
      const [r, g, b] = edge ? [12, 10, 9] : x > W * 0.55 ? [118, 118, 124] : [138, 82, 42];
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  return px;
}

const toHex = (c: RGB) => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);

/** The colours of a painted RGBA image (exported for the tests). */
export function colorsOf(px: Uint8ClampedArray): SkinColors {
  let r = 0;
  let g = 0;
  let b = 0;
  let wsum = 0;
  const bright: Array<{ l: number; s: number; c: RGB }> = [];
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3]! < 128) continue;
    const R = px[i]!;
    const G = px[i + 1]!;
    const B = px[i + 2]!;
    const mx = Math.max(R, G, B);
    const mn = Math.min(R, G, B);
    const l = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
    if (l < 0.1) continue; // the outline
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    const w = 0.08 + s * s;
    r += R * w;
    g += G * w;
    b += B * w;
    wsum += w;
    bright.push({ l, s, c: [R, G, B] });
  }
  const main: RGB = wsum > 0 ? [r / wsum, g / wsum, b / wsum] : [160, 150, 140];
  // the glow: the brightest of the colourful pixels (a grey finish glows white-ish)
  const colourful = bright.filter((p) => p.s > 0.28);
  const pool = (colourful.length >= 12 ? colourful : bright).sort((a, b2) => b2.l * (0.4 + b2.s) - a.l * (0.4 + a.s));
  const top = pool.slice(0, Math.max(4, Math.round(pool.length * 0.18)));
  let gr = 0;
  let gg = 0;
  let gb = 0;
  for (const p of top) {
    gr += p.c[0];
    gg += p.c[1];
    gb += p.c[2];
  }
  const n = Math.max(1, top.length);
  const raw: RGB = top.length ? [gr / n, gg / n, gb / n] : main;
  const peak = Math.max(1, raw[0], raw[1], raw[2]);
  // lifted to full brightness, then softened towards white a little (light, not paint)
  const lift = 255 / peak;
  const glow: RGB = [Math.min(255, raw[0] * lift * 0.85 + 38), Math.min(255, raw[1] * lift * 0.85 + 38), Math.min(255, raw[2] * lift * 0.85 + 38)];
  return { main, glow, mainHex: toHex(main), glowHex: toHex(glow) };
}

const cache = new Map<FinishId, SkinColors>();

/** The colours of a finish (computed once). */
export function finishColors(f: FinishId): SkinColors {
  let c = cache.get(f);
  if (!c) {
    const px = strip();
    paintFinish(px, W, H, f, 0);
    c = colorsOf(px);
    cache.set(f, c);
  }
  return c;
}

/** CSS rgb() of a colour, with an alpha. */
export function rgba(c: RGB, a = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}
