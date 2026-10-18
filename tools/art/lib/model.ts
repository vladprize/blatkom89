/**
 * Top-down orthographic renderer for simple 3D primitives with pixel-art cel shading.
 * Characters and props are modelled as ellipsoids, capsules, boxes and cylinders in world units
 * (facing +x, z up) and rendered straight down at 2 texels per world pixel.
 */
import { Img, BAYER4, mix } from './raster.js';
import type { RGBA } from './raster.js';

export type V3 = [number, number, number];

export interface PatternCtx {
  /** World coordinates of the surface point. */
  x: number;
  y: number;
  z: number;
  /** Primitive-local coordinates (ellipsoid/box: rotated local frame; capsule: t along, s lateral). */
  lx: number;
  ly: number;
  lz: number;
  t: number;
  s: number;
  nx: number;
  ny: number;
  nz: number;
  u: number;
  v: number;
}

export interface Material {
  /** Colour ramp from darkest to lightest. */
  ramp: RGBA[];
  spec?: { color: RGBA; power: number; threshold: number };
  /** Return a ramp offset (number) or an explicit colour, or null for no change. */
  pattern?: (c: PatternCtx) => number | RGBA | null;
  /** Unlit (eyes, embers). */
  flat?: boolean;
  dither?: boolean;
}

interface Base {
  mat: Material;
  group?: string;
}
export type Prim =
  | (Base & { k: 'ell'; c: V3; r: V3; yaw?: number })
  | (Base & { k: 'cap'; a: V3; b: V3; r: number; r2?: number })
  | (Base & { k: 'box'; c: V3; h: V3; yaw?: number; bevel?: number })
  | (Base & { k: 'cyl'; c: V3; r: number; z0: number; z1: number; bevel?: number })
  | (Base & { k: 'poly'; pts: Array<[number, number]>; z: number });

interface Hit {
  z: number;
  nx: number;
  ny: number;
  nz: number;
  lx: number;
  ly: number;
  lz: number;
  t: number;
  s: number;
}

const LIGHT = norm([-0.22, -0.28, 1]);
const HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);

function norm(v: V3): V3 {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function bbox(p: Prim): [number, number, number, number] {
  switch (p.k) {
    case 'ell': {
      const m = Math.max(p.r[0], p.r[1]);
      return [p.c[0] - m, p.c[1] - m, p.c[0] + m, p.c[1] + m];
    }
    case 'cap': {
      const r = Math.max(p.r, p.r2 ?? p.r);
      return [Math.min(p.a[0], p.b[0]) - r, Math.min(p.a[1], p.b[1]) - r, Math.max(p.a[0], p.b[0]) + r, Math.max(p.a[1], p.b[1]) + r];
    }
    case 'box': {
      const m = Math.sqrt(p.h[0] ** 2 + p.h[1] ** 2);
      return [p.c[0] - m, p.c[1] - m, p.c[0] + m, p.c[1] + m];
    }
    case 'cyl':
      return [p.c[0] - p.r, p.c[1] - p.r, p.c[0] + p.r, p.c[1] + p.r];
    case 'poly': {
      const xs = p.pts.map((q) => q[0]);
      const ys = p.pts.map((q) => q[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
  }
}

function hit(p: Prim, x: number, y: number): Hit | null {
  switch (p.k) {
    case 'ell': {
      const yaw = p.yaw ?? 0;
      const co = Math.cos(yaw);
      const si = Math.sin(yaw);
      const dx = x - p.c[0];
      const dy = y - p.c[1];
      const lx = dx * co + dy * si;
      const ly = -dx * si + dy * co;
      const t = 1 - (lx / p.r[0]) ** 2 - (ly / p.r[1]) ** 2;
      if (t < 0) return null;
      const lz = p.r[2] * Math.sqrt(t);
      const n = norm([lx / p.r[0] ** 2, ly / p.r[1] ** 2, lz / p.r[2] ** 2]);
      return { z: p.c[2] + lz, nx: n[0] * co - n[1] * si, ny: n[0] * si + n[1] * co, nz: n[2], lx, ly, lz, t: 0, s: 0 };
    }
    case 'cap': {
      const ax = p.a[0];
      const ay = p.a[1];
      const dx = p.b[0] - ax;
      const dy = p.b[1] - ay;
      const dz = p.b[2] - p.a[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const steps = Math.max(2, Math.ceil(len / 0.35));
      const lxy = Math.sqrt(dx * dx + dy * dy) || 1;
      let best: Hit | null = null;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const cx = ax + dx * t;
        const cy = ay + dy * t;
        const cz = p.a[2] + dz * t;
        const r = p.r + ((p.r2 ?? p.r) - p.r) * t;
        const hx = x - cx;
        const hy = y - cy;
        const d2 = hx * hx + hy * hy;
        if (d2 > r * r) continue;
        const hz = Math.sqrt(r * r - d2);
        const z = cz + hz;
        if (!best || z > best.z) {
          const s = (hx * -dy + hy * dx) / lxy;
          best = { z, nx: hx / r, ny: hy / r, nz: hz / r, lx: hx, ly: hy, lz: hz, t, s };
        }
      }
      return best;
    }
    case 'box': {
      const yaw = p.yaw ?? 0;
      const co = Math.cos(yaw);
      const si = Math.sin(yaw);
      const dx = x - p.c[0];
      const dy = y - p.c[1];
      const lx = dx * co + dy * si;
      const ly = -dx * si + dy * co;
      if (Math.abs(lx) > p.h[0] || Math.abs(ly) > p.h[1]) return null;
      const b = p.bevel ?? 0.6;
      const ex = Math.max(0, Math.abs(lx) - (p.h[0] - b)) / b;
      const ey = Math.max(0, Math.abs(ly) - (p.h[1] - b)) / b;
      const nlx = Math.sign(lx) * ex * 0.75;
      const nly = Math.sign(ly) * ey * 0.75;
      const n = norm([nlx, nly, 1]);
      const z = p.c[2] + p.h[2] - (ex * ex + ey * ey) * b * 0.35;
      return { z, nx: n[0] * co - n[1] * si, ny: n[0] * si + n[1] * co, nz: n[2], lx, ly, lz: z - p.c[2], t: 0, s: 0 };
    }
    case 'cyl': {
      const dx = x - p.c[0];
      const dy = y - p.c[1];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > p.r) return null;
      const b = p.bevel ?? 0.8;
      const e = Math.max(0, d - (p.r - b)) / b;
      const n = norm([(dx / (d || 1)) * e * 0.8, (dy / (d || 1)) * e * 0.8, 1]);
      return { z: p.z1 - e * e * b * 0.3, nx: n[0], ny: n[1], nz: n[2], lx: dx, ly: dy, lz: p.z1 - p.z0, t: d / p.r, s: Math.atan2(dy, dx) };
    }
    case 'poly': {
      let inside = false;
      const pts = p.pts;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!;
        const [xj, yj] = pts[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (!inside) return null;
      return { z: p.z, nx: 0, ny: 0, nz: 1, lx: x, ly: y, lz: 0, t: 0, s: 0 };
    }
  }
}

export interface RenderOptions {
  /** Texels per world unit. */
  scale?: number;
  outline?: RGBA;
  /** Depth jump (world units) that produces an inner outline. */
  edge?: number;
  innerEdgeFactor?: number;
  /** World-space offset of the image centre. */
  cx?: number;
  cy?: number;
  ambient?: number;
}

const DEFAULT_OUTLINE: RGBA = [16, 11, 10, 255];

/** Renders primitives into a w×h image (texels) with the world origin at the image centre. */
export function render(prims: Prim[], w: number, h: number, opts: RenderOptions = {}): Img {
  const S = opts.scale ?? 2;
  const img = new Img(w, h);
  const depth = new Float32Array(w * h).fill(-Infinity);
  const group = new Int32Array(w * h).fill(-1);
  const groupIds = new Map<string, number>();
  const gid = (g: string | undefined, i: number) => {
    const key = g ?? `#${i}`;
    let id = groupIds.get(key);
    if (id === undefined) {
      id = groupIds.size;
      groupIds.set(key, id);
    }
    return id;
  };
  const ox = w / 2 - (opts.cx ?? 0) * S;
  const oy = h / 2 - (opts.cy ?? 0) * S;
  const ambient = opts.ambient ?? 0.32;

  prims.forEach((p, pi) => {
    const [x0, y0, x1, y1] = bbox(p);
    const u0 = Math.max(0, Math.floor(x0 * S + ox) - 1);
    const u1 = Math.min(w - 1, Math.ceil(x1 * S + ox) + 1);
    const v0 = Math.max(0, Math.floor(y0 * S + oy) - 1);
    const v1 = Math.min(h - 1, Math.ceil(y1 * S + oy) + 1);
    const g = gid(p.group, pi);
    for (let v = v0; v <= v1; v++) {
      for (let u = u0; u <= u1; u++) {
        const x = (u + 0.5 - ox) / S;
        const y = (v + 0.5 - oy) / S;
        const hh = hit(p, x, y);
        if (!hh) continue;
        const k = v * w + u;
        if (hh.z <= depth[k]!) continue;
        depth[k] = hh.z;
        group[k] = g;
        img.set(u, v, shadeTexel(p.mat, hh, x, y, u, v, ambient));
      }
    }
  });

  // inner edges: darken the lower texel where a higher, different group overhangs it
  const edge = opts.edge ?? 0.85;
  const f = opts.innerEdgeFactor ?? 0.42;
  const src = img.clone();
  for (let v = 0; v < h; v++)
    for (let u = 0; u < w; u++) {
      const k = v * w + u;
      if (group[k] === -1) continue;
      for (const [du, dv] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const uu = u + du;
        const vv = v + dv;
        if (uu < 0 || vv < 0 || uu >= w || vv >= h) continue;
        const kk = vv * w + uu;
        if (group[kk] === -1 || group[kk] === group[k]) continue;
        if (depth[kk]! - depth[k]! > edge) {
          const c = src.get(u, v);
          img.set(u, v, [c[0] * f, c[1] * f, c[2] * f * 1.05, 255]);
          break;
        }
      }
    }
  img.outline(opts.outline ?? DEFAULT_OUTLINE);
  return img;
}

function shadeTexel(m: Material, h: Hit, x: number, y: number, u: number, v: number, ambient: number): RGBA {
  const ctx: PatternCtx = { x, y, z: h.z, lx: h.lx, ly: h.ly, lz: h.lz, t: h.t, s: h.s, nx: h.nx, ny: h.ny, nz: h.nz, u, v };
  let offset = 0;
  if (m.pattern) {
    const r = m.pattern(ctx);
    if (Array.isArray(r)) return r as RGBA;
    if (typeof r === 'number') offset = r;
  }
  const n = m.ramp.length;
  if (m.flat) return m.ramp[Math.max(0, Math.min(n - 1, n - 1 + Math.round(offset)))]!;
  const d = Math.max(0, h.nx * LIGHT[0] + h.ny * LIGHT[1] + h.nz * LIGHT[2]);
  // Reserve the lightest ramp entry for surfaces facing the light almost directly.
  const t = Math.max(0, (d - ambient) / (1 - ambient));
  let fi = Math.pow(t, 1.6) * (n - 1.01) + offset;
  if (d > 0.992 && n > 3) fi = n - 1 + offset;
  if (m.dither) fi += (BAYER4[v & 3]![u & 3]! - 0.5) * 0.7;
  const idx = Math.max(0, Math.min(n - 1, Math.floor(fi)));
  let c = m.ramp[idx]!;
  if (m.spec) {
    const sp = Math.pow(Math.max(0, h.nx * HALF[0] + h.ny * HALF[1] + h.nz * HALF[2]), m.spec.power);
    if (sp > m.spec.threshold) c = mix(c, m.spec.color, 0.85);
  }
  return c;
}

/** Builds a 4-5 step ramp from a base colour (shadow hue-shifted toward purple, light toward yellow). */
export function ramp(base: RGBA, steps = 4, spread = 1): RGBA[] {
  const out: RGBA[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / (steps - 1)) * 2 - 1; // -1..1
    const f = 1 + t * 0.42 * spread;
    let c: RGBA = [base[0] * f, base[1] * f, base[2] * f, 255];
    if (t < 0) c = mix(c, [40, 20, 60, 255], -t * 0.18);
    else c = mix(c, [255, 236, 190, 255], t * 0.12);
    out.push([Math.min(255, Math.max(0, c[0])), Math.min(255, Math.max(0, c[1])), Math.min(255, Math.max(0, c[2])), 255]);
  }
  return out;
}
