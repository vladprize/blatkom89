/**
 * Fable cut (the trial build): the geometry of light and shadow. No Phaser, no DOM — plain numbers, so it is
 * tested in node.
 *
 * What stops light is taken from the map itself (its walls and props), the same table the collision is built
 * from: a wall throws a shadow to the light's edge and its top stays dark but for a lit rim on the side the
 * lamp is on; a crate, a car or a barrel is lower than the lamp — its top is lit and its shadow has a length.
 */
import { PROP_DEFS, propFootprint } from '@blatkom/shared';
import type { MapDef } from '@blatkom/shared';

export interface Occluder {
  kind: 'rect' | 'circle';
  /** Bounds (a circle's bounding box). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** A circle's centre and radius (a rect: its centre, 0). */
  cx: number;
  cy: number;
  r: number;
  /** How far the shadow runs, as a multiple of the distance from the lamp (Infinity: to the light's edge). */
  reach: number;
  /** A wall: its top is dark, a rim of it is lit. A prop: its top is lit. */
  wall: boolean;
  /** Tall enough to stop a light held in a hand (a muzzle flash, the player's own lamp). */
  solid: boolean;
}

/** How deep into a wall the light gets: the lit rim of its top, in world px. */
export const RIM = 5;

/** Walls that light passes: a mesh, railings, water. A heating main is low — it is a prop here. */
const SEE_THROUGH = new Set(['fence_chain', 'fence_iron', 'water']);

export function buildOccluders(map: MapDef): Occluder[] {
  const out: Occluder[] = [];
  for (const w of map.walls) {
    if (SEE_THROUGH.has(w.style)) continue;
    if (w.w <= 0 || w.h <= 0) continue;
    if (w.style === 'heat_pipe') {
      out.push({ kind: 'rect', x: w.x, y: w.y, w: w.w, h: w.h, cx: w.x + w.w / 2, cy: w.y + w.h / 2, r: 0, reach: 1.3, wall: false, solid: false });
      continue;
    }
    out.push({ kind: 'rect', x: w.x, y: w.y, w: w.w, h: w.h, cx: w.x + w.w / 2, cy: w.y + w.h / 2, r: 0, reach: Infinity, wall: true, solid: true });
  }
  for (const p of map.props) {
    const def = PROP_DEFS[p.type];
    if (def.shape === 'none' || !def.blocksMove) continue;
    const reach = def.blocksShot ? (def.layer === 'high' ? 2.5 : 1.55) : 1.22;
    if (def.shape === 'circle') {
      const r = def.radius ?? Math.min(def.w, def.h) / 2;
      out.push({ kind: 'circle', x: p.x - r, y: p.y - r, w: r * 2, h: r * 2, cx: p.x, cy: p.y, r, reach, wall: false, solid: def.blocksShot });
    } else {
      const fp = propFootprint(def, p.rot);
      const inset = def.inset ?? 0;
      const w = fp.w - inset * 2;
      const h = fp.h - inset * 2;
      if (w <= 0 || h <= 0) continue;
      out.push({ kind: 'rect', x: p.x - fp.w / 2 + inset, y: p.y - fp.h / 2 + inset, w, h, cx: p.x, cy: p.y, r: 0, reach, wall: false, solid: def.blocksShot });
    }
  }
  return out;
}

/** A coarse grid over the occluders: which of them a light of a given reach can touch. */
export class OccluderIndex {
  private readonly cell = 96;
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: number[][];
  private readonly mark: Uint32Array;
  private stamp = 1;

  constructor(
    readonly list: Occluder[],
    width: number,
    height: number,
  ) {
    this.cols = Math.max(1, Math.ceil(width / this.cell));
    this.rows = Math.max(1, Math.ceil(height / this.cell));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    this.mark = new Uint32Array(list.length);
    list.forEach((o, i) => {
      const c0 = this.col(o.x);
      const c1 = this.col(o.x + o.w);
      const r0 = this.row(o.y);
      const r1 = this.row(o.y + o.h);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c]!.push(i);
    });
  }

  private col(x: number) {
    return Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cell)));
  }

  private row(y: number) {
    return Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cell)));
  }

  /** The occluders whose bounds touch the box, each once. */
  query(x0: number, y0: number, x1: number, y1: number, out: Occluder[], solidOnly = false): Occluder[] {
    out.length = 0;
    const id = ++this.stamp;
    if (id === 0xffffffff) {
      this.mark.fill(0);
      this.stamp = 1;
    }
    const c0 = this.col(x0);
    const c1 = this.col(x1);
    const r0 = this.row(y0);
    const r1 = this.row(y1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (const i of this.cells[r * this.cols + c]!) {
          if (this.mark[i] === id) continue;
          this.mark[i] = id;
          const o = this.list[i]!;
          if (solidOnly && !o.solid) continue;
          if (o.x > x1 || o.x + o.w < x0 || o.y > y1 || o.y + o.h < y0) continue;
          out.push(o);
        }
      }
    }
    return out;
  }
}

/** Whether the point lies inside the occluder (`inset`: that far inside its edge). */
export function inside(o: Occluder, x: number, y: number, inset = 0): boolean {
  if (o.kind === 'circle') {
    const dx = x - o.cx;
    const dy = y - o.cy;
    const r = o.r - inset;
    return r > 0 && dx * dx + dy * dy < r * r;
  }
  return x > o.x + inset && x < o.x + o.w - inset && y > o.y + inset && y < o.y + o.h - inset;
}

/** The outline of an occluder as it stops light: a wall drawn in by its rim, a circle as a polygon. */
export function outline(o: Occluder, out: number[] = []): number[] {
  out.length = 0;
  if (o.kind === 'circle') {
    const n = o.r > 20 ? 16 : 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push(o.cx + Math.cos(a) * o.r, o.cy + Math.sin(a) * o.r);
    }
    return out;
  }
  // a thin wall keeps at least a pixel of dark top so it still reads as a wall
  const rim = o.wall ? Math.max(0, Math.min(RIM, (Math.min(o.w, o.h) - 2) / 2)) : 0;
  const x0 = o.x + rim;
  const y0 = o.y + rim;
  const x1 = o.x + o.w - rim;
  const y1 = o.y + o.h - rim;
  out.push(x0, y0, x1, y0, x1, y1, x0, y1);
  return out;
}

/** Convex hull (Andrew's monotone chain) of a flat list of points; returns a flat list, counter-clockwise. */
export function convexHull(pts: number[], out: number[] = []): number[] {
  const n = pts.length / 2;
  out.length = 0;
  if (n < 3) {
    for (const v of pts) out.push(v);
    return out;
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i);
  idx.sort((a, b) => pts[a * 2]! - pts[b * 2]! || pts[a * 2 + 1]! - pts[b * 2 + 1]!);
  const cross = (o: number, a: number, b: number) => (pts[a * 2]! - pts[o * 2]!) * (pts[b * 2 + 1]! - pts[o * 2 + 1]!) - (pts[a * 2 + 1]! - pts[o * 2 + 1]!) * (pts[b * 2]! - pts[o * 2]!);
  const hull: number[] = [];
  for (const i of idx) {
    while (hull.length >= 2 && cross(hull[hull.length - 2]!, hull[hull.length - 1]!, i) <= 0) hull.pop();
    hull.push(i);
  }
  const lower = hull.length + 1;
  for (let k = idx.length - 2; k >= 0; k--) {
    const i = idx[k]!;
    while (hull.length >= lower && cross(hull[hull.length - 2]!, hull[hull.length - 1]!, i) <= 0) hull.pop();
    hull.push(i);
  }
  hull.pop();
  for (const i of hull) out.push(pts[i * 2]!, pts[i * 2 + 1]!);
  return out;
}

const scratchPts: number[] = [];
const scratchOutline: number[] = [];

/**
 * The shadow an occluder throws from a lamp at (lx, ly): the convex hull of its outline and of that outline
 * pushed away from the lamp — to `far` for a wall, by its `reach` for a prop. Null when the lamp is inside it.
 */
export function shadowHull(o: Occluder, lx: number, ly: number, far: number, out: number[] = []): number[] | null {
  if (inside(o, lx, ly)) return null;
  const pts = outline(o, scratchOutline);
  scratchPts.length = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const px = pts[i]!;
    const py = pts[i + 1]!;
    scratchPts.push(px, py);
    const dx = px - lx;
    const dy = py - ly;
    const d = Math.hypot(dx, dy) || 1e-6;
    const k = Number.isFinite(o.reach) ? Math.min(o.reach, far / d) : far / d;
    // a point never comes nearer than it is
    const kk = Math.max(1, k);
    scratchPts.push(lx + dx * kk, ly + dy * kk);
  }
  return convexHull(scratchPts, out);
}

/** What a hand-held light sees from a point: the distance it reaches along each of `n` sorted directions. */
export class Visibility {
  n = 0;
  ang: Float32Array;
  dist: Float32Array;
  private near: Occluder[] = [];
  private angles: number[] = [];

  constructor(capacity = 1024) {
    this.ang = new Float32Array(capacity);
    this.dist = new Float32Array(capacity);
  }

  /**
   * Casts from (lx, ly) to `radius`: a ring of `uniform` rays, and three at every corner an occluder shows
   * (the corner and a hair either side — where a shadow's edge begins). Walls are lit `RIM` deep; a crate's
   * top is lit to its far edge and its shadow begins there. Corner rays that leave (−π, π] are wrapped.
   */
  compute(index: OccluderIndex, lx: number, ly: number, radius: number, uniform = 48, extra?: number[]): this {
    const near = index.query(lx - radius, ly - radius, lx + radius, ly + radius, this.near, true);
    const angles = this.angles;
    angles.length = 0;
    for (let i = 0; i < uniform; i++) angles.push(-Math.PI + (i / uniform) * Math.PI * 2);
    // directions the caller wants sampled as well (a beam's edges), each within (−π, π]
    if (extra) for (const a of extra) angles.push(a);
    const EPS = 0.0016;
    const r2 = (radius + 2) * (radius + 2);
    // an occluder the light stands in stops nothing (a lamp on a wall, a player pressed into a crate's corner)
    let k = 0;
    for (let i = 0; i < near.length; i++) {
      const o = near[i]!;
      if (inside(o, lx, ly)) continue;
      near[k++] = o;
      if (o.kind === 'circle') {
        const dx = o.cx - lx;
        const dy = o.cy - ly;
        const d = Math.hypot(dx, dy);
        if (d <= o.r || d - o.r > radius) continue;
        const a = Math.atan2(dy, dx);
        const s = Math.asin(Math.min(1, o.r / d));
        angles.push(a - s - EPS, a - s + EPS, a + s - EPS, a + s + EPS);
        continue;
      }
      for (let c = 0; c < 4; c++) {
        const px = c === 0 || c === 3 ? o.x : o.x + o.w;
        const py = c < 2 ? o.y : o.y + o.h;
        const dx = px - lx;
        const dy = py - ly;
        if (dx * dx + dy * dy > r2) continue;
        const a = Math.atan2(dy, dx);
        angles.push(a - EPS, a, a + EPS);
      }
    }
    near.length = k;
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i]!;
      if (a > Math.PI) angles[i] = a - Math.PI * 2;
      else if (a <= -Math.PI) angles[i] = a + Math.PI * 2;
    }
    angles.sort((a, b) => a - b);
    if (angles.length > this.ang.length) {
      this.ang = new Float32Array(angles.length * 2);
      this.dist = new Float32Array(angles.length * 2);
    }
    let n = 0;
    let last = -10;
    for (const a of angles) {
      if (a - last < 0.0004) continue;
      last = a;
      this.ang[n] = a;
      this.dist[n] = castLit(near, lx, ly, Math.cos(a), Math.sin(a), radius);
      n++;
    }
    this.n = n;
    return this;
  }
}

/** How far light gets along a ray: to the first wall and `RIM` into it, or across a prop's top to its far edge. */
export function castLit(near: Occluder[], ox: number, oy: number, dx: number, dy: number, maxDist: number): number {
  let best = maxDist;
  for (let i = 0; i < near.length; i++) {
    const o = near[i]!;
    let tIn: number;
    let tOut: number;
    if (o.kind === 'circle') {
      const fx = ox - o.cx;
      const fy = oy - o.cy;
      const b = fx * dx + fy * dy;
      const c = fx * fx + fy * fy - o.r * o.r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const s = Math.sqrt(disc);
      tIn = -b - s;
      tOut = -b + s;
    } else {
      tIn = -Infinity;
      tOut = Infinity;
      if (Math.abs(dx) < 1e-9) {
        if (ox < o.x || ox > o.x + o.w) continue;
      } else {
        const inv = 1 / dx;
        const t1 = (o.x - ox) * inv;
        const t2 = (o.x + o.w - ox) * inv;
        tIn = Math.max(tIn, Math.min(t1, t2));
        tOut = Math.min(tOut, Math.max(t1, t2));
      }
      if (Math.abs(dy) < 1e-9) {
        if (oy < o.y || oy > o.y + o.h) continue;
      } else {
        const inv = 1 / dy;
        const t1 = (o.y - oy) * inv;
        const t2 = (o.y + o.h - oy) * inv;
        tIn = Math.max(tIn, Math.min(t1, t2));
        tOut = Math.min(tOut, Math.max(t1, t2));
      }
    }
    if (tOut < tIn || tOut <= 0 || tIn >= best) continue;
    // the ray starts inside it: an occluder the light stands in stops nothing
    if (tIn < 0) continue;
    const lit = o.wall ? Math.min(tIn + RIM, tOut) : tOut;
    if (lit < best) best = lit;
  }
  return best;
}

/** Whether light from (ax, ay) reaches (bx, by) past everything tall (`near`: the occluders to test). */
export function lightReaches(near: Occluder[], ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return true;
  return castLit(near, ax, ay, dx / d, dy / d, d) >= d - 0.01;
}
