import type { MapDef, Rotation } from './types.js';
import { PROP_DEFS } from './props.js';
import type { PropDef } from './props.js';

export interface Shape {
  kind: 'rect' | 'circle';
  /** Axis-aligned bounds (for circles: the bounding box). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Circle centre/radius (unused for rects). */
  cx: number;
  cy: number;
  r: number;
  blocksMove: boolean;
  blocksShot: boolean;
  source: 'wall' | 'prop' | 'bounds';
}

export interface RayHit {
  /** Distance along the ray. */
  t: number;
  /** Surface normal at the hit point. */
  nx: number;
  ny: number;
  shape: number;
}

const CELL = 64;
const BOUNDS_THICKNESS = 64;

export function propFootprint(def: PropDef, rot: Rotation): { w: number; h: number } {
  return rot === 90 || rot === 270 ? { w: def.h, h: def.w } : { w: def.w, h: def.h };
}

export class CollisionWorld {
  readonly width: number;
  readonly height: number;
  readonly shapes: Shape[] = [];
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: number[][];
  private readonly stamp: Uint32Array;
  private stampId = 1;

  constructor(map: MapDef) {
    this.width = map.width;
    this.height = map.height;
    for (const w of map.walls) {
      const shootThrough = w.style === 'fence_chain';
      this.addRect(w.x, w.y, w.w, w.h, true, !shootThrough, 'wall');
    }
    for (const p of map.props) {
      const def: PropDef = PROP_DEFS[p.type];
      if (def.shape === 'none' || !def.blocksMove) continue;
      if (def.shape === 'circle') {
        const r = def.radius ?? Math.min(def.w, def.h) / 2;
        this.addCircle(p.x, p.y, r, true, def.blocksShot, 'prop');
      } else {
        const fp = propFootprint(def, p.rot);
        const inset = def.inset ?? 0;
        this.addRect(
          p.x - fp.w / 2 + inset,
          p.y - fp.h / 2 + inset,
          fp.w - inset * 2,
          fp.h - inset * 2,
          true,
          def.blocksShot,
          'prop',
        );
      }
    }
    const T = BOUNDS_THICKNESS;
    this.addRect(-T, -T, this.width + 2 * T, T, true, true, 'bounds');
    this.addRect(-T, this.height, this.width + 2 * T, T, true, true, 'bounds');
    this.addRect(-T, 0, T, this.height, true, true, 'bounds');
    this.addRect(this.width, 0, T, this.height, true, true, 'bounds');

    this.cols = Math.ceil((this.width + 2 * T) / CELL);
    this.rows = Math.ceil((this.height + 2 * T) / CELL);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    this.stamp = new Uint32Array(this.shapes.length);
    this.shapes.forEach((s, i) => {
      const [c0, r0, c1, r1] = this.cellRange(s.x, s.y, s.x + s.w, s.y + s.h);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c]!.push(i);
    });
  }

  private addRect(x: number, y: number, w: number, h: number, move: boolean, shot: boolean, source: Shape['source']) {
    if (w <= 0 || h <= 0) return;
    this.shapes.push({ kind: 'rect', x, y, w, h, cx: x + w / 2, cy: y + h / 2, r: 0, blocksMove: move, blocksShot: shot, source });
  }

  private addCircle(cx: number, cy: number, r: number, move: boolean, shot: boolean, source: Shape['source']) {
    this.shapes.push({ kind: 'circle', x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, cx, cy, r, blocksMove: move, blocksShot: shot, source });
  }

  private cellRange(x0: number, y0: number, x1: number, y1: number): [number, number, number, number] {
    const T = BOUNDS_THICKNESS;
    const c0 = Math.max(0, Math.floor((x0 + T) / CELL));
    const r0 = Math.max(0, Math.floor((y0 + T) / CELL));
    const c1 = Math.min(this.cols - 1, Math.floor((x1 + T) / CELL));
    const r1 = Math.min(this.rows - 1, Math.floor((y1 + T) / CELL));
    return [c0, r0, c1, r1];
  }

  /** Collects unique shape indices whose cells overlap the box. */
  candidates(x0: number, y0: number, x1: number, y1: number, out: number[]): number[] {
    out.length = 0;
    const id = ++this.stampId;
    if (id === 0xffffffff) {
      this.stamp.fill(0);
      this.stampId = 1;
    }
    const [c0, r0, c1, r1] = this.cellRange(x0, y0, x1, y1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (const i of this.cells[r * this.cols + c]!) {
          if (this.stamp[i] !== id) {
            this.stamp[i] = id;
            out.push(i);
          }
        }
      }
    }
    return out;
  }

  private readonly scratch: number[] = [];

  /**
   * Pushes a circle out of every movement-blocking shape. Mutates `pos`.
   * Returns the number of contacts and writes accumulated contact normals into `normals`.
   */
  resolveCircle(pos: { x: number; y: number }, r: number, normals?: number[]): number {
    let contacts = 0;
    if (normals) normals.length = 0;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      const cand = this.candidates(pos.x - r, pos.y - r, pos.x + r, pos.y + r, this.scratch);
      for (const i of cand) {
        const s = this.shapes[i]!;
        if (!s.blocksMove) continue;
        let nx = 0;
        let ny = 0;
        let push = 0;
        if (s.kind === 'rect') {
          const qx = pos.x < s.x ? s.x : pos.x > s.x + s.w ? s.x + s.w : pos.x;
          const qy = pos.y < s.y ? s.y : pos.y > s.y + s.h ? s.y + s.h : pos.y;
          const dx = pos.x - qx;
          const dy = pos.y - qy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 > 1e-12) {
            const d = Math.sqrt(d2);
            nx = dx / d;
            ny = dy / d;
            push = r - d;
          } else {
            const left = pos.x - s.x;
            const right = s.x + s.w - pos.x;
            const top = pos.y - s.y;
            const bottom = s.y + s.h - pos.y;
            const m = Math.min(left, right, top, bottom);
            if (m === left) nx = -1;
            else if (m === right) nx = 1;
            else if (m === top) ny = -1;
            else ny = 1;
            push = m + r;
          }
        } else {
          const dx = pos.x - s.cx;
          const dy = pos.y - s.cy;
          const rr = r + s.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          if (d2 > 1e-12) {
            const d = Math.sqrt(d2);
            nx = dx / d;
            ny = dy / d;
            push = rr - d;
          } else {
            nx = 1;
            push = rr;
          }
        }
        pos.x += nx * push;
        pos.y += ny * push;
        contacts++;
        moved = true;
        if (normals) normals.push(nx, ny);
      }
      if (!moved) break;
    }
    return contacts;
  }

  overlapsCircle(x: number, y: number, r: number): boolean {
    if (x - r < 0 || y - r < 0 || x + r > this.width || y + r > this.height) return true;
    const cand = this.candidates(x - r, y - r, x + r, y + r, this.scratch);
    for (const i of cand) {
      const s = this.shapes[i]!;
      if (!s.blocksMove) continue;
      if (s.kind === 'rect') {
        const qx = x < s.x ? s.x : x > s.x + s.w ? s.x + s.w : x;
        const qy = y < s.y ? s.y : y > s.y + s.h ? s.y + s.h : y;
        const dx = x - qx;
        const dy = y - qy;
        if (dx * dx + dy * dy < r * r) return true;
      } else {
        const dx = x - s.cx;
        const dy = y - s.cy;
        const rr = r + s.r;
        if (dx * dx + dy * dy < rr * rr) return true;
      }
    }
    return false;
  }

  /**
   * Casts a ray against shot-blocking (or move-blocking) geometry.
   * `dx, dy` must be a unit vector. Returns null when nothing is hit within `maxDist`.
   */
  raycast(ox: number, oy: number, dx: number, dy: number, maxDist: number, mode: 'shot' | 'move' = 'shot'): RayHit | null {
    const ex = ox + dx * maxDist;
    const ey = oy + dy * maxDist;
    const cand = this.candidates(Math.min(ox, ex), Math.min(oy, ey), Math.max(ox, ex), Math.max(oy, ey), this.scratch);
    let best: RayHit | null = null;
    let bestT = maxDist;
    for (const i of cand) {
      const s = this.shapes[i]!;
      if (mode === 'shot' ? !s.blocksShot : !s.blocksMove) continue;
      if (s.kind === 'rect') {
        let tmin = -Infinity;
        let tmax = Infinity;
        let nx = 0;
        let ny = 0;
        if (Math.abs(dx) < 1e-12) {
          if (ox < s.x || ox > s.x + s.w) continue;
        } else {
          const inv = 1 / dx;
          let t1 = (s.x - ox) * inv;
          let t2 = (s.x + s.w - ox) * inv;
          let n = -1;
          if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
            n = 1;
          }
          if (t1 > tmin) {
            tmin = t1;
            nx = n;
            ny = 0;
          }
          tmax = Math.min(tmax, t2);
        }
        if (Math.abs(dy) < 1e-12) {
          if (oy < s.y || oy > s.y + s.h) continue;
        } else {
          const inv = 1 / dy;
          let t1 = (s.y - oy) * inv;
          let t2 = (s.y + s.h - oy) * inv;
          let n = -1;
          if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
            n = 1;
          }
          if (t1 > tmin) {
            tmin = t1;
            nx = 0;
            ny = n;
          }
          tmax = Math.min(tmax, t2);
        }
        if (tmax < tmin || tmax < 0) continue;
        const t = Math.max(0, tmin);
        if (t < bestT) {
          bestT = t;
          best = { t, nx, ny, shape: i };
        }
      } else {
        const t = rayCircle(ox, oy, dx, dy, s.cx, s.cy, s.r);
        if (t !== null && t < bestT) {
          bestT = t;
          const hx = ox + dx * t - s.cx;
          const hy = oy + dy * t - s.cy;
          const l = Math.sqrt(hx * hx + hy * hy) || 1;
          best = { t, nx: hx / l, ny: hy / l, shape: i };
        }
      }
    }
    return best;
  }

  lineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-6) return true;
    return this.raycast(ax, ay, dx / d, dy / d, d, 'shot') === null;
  }
}

/** Distance along a unit ray to the first intersection with a circle, or null. */
export function rayCircle(ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, r: number): number | null {
  const fx = ox - cx;
  const fy = oy - cy;
  const b = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0; // origin inside the circle
  if (b > 0) return null;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}
