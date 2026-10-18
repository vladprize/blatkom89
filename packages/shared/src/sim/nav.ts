import type { CollisionWorld } from '../maps/collision.js';
import { PLAYER_RADIUS } from '../constants/game.js';

/** Walkability grid derived from collision geometry (used by bots and map validation). */
export class NavGrid {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  readonly walkable: Uint8Array;

  constructor(
    readonly world: CollisionWorld,
    cell = 8,
    clearance = PLAYER_RADIUS + 1,
  ) {
    this.cell = cell;
    this.cols = Math.floor(world.width / cell);
    this.rows = Math.floor(world.height / cell);
    this.walkable = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = c * cell + cell / 2;
        const y = r * cell + cell / 2;
        this.walkable[r * this.cols + c] = world.overlapsCircle(x, y, clearance) ? 0 : 1;
      }
    }
  }

  index(x: number, y: number): number {
    const c = Math.floor(x / this.cell);
    const r = Math.floor(y / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  center(i: number): { x: number; y: number } {
    return { x: (i % this.cols) * this.cell + this.cell / 2, y: Math.floor(i / this.cols) * this.cell + this.cell / 2 };
  }

  isWalkable(x: number, y: number): boolean {
    const i = this.index(x, y);
    return i >= 0 && this.walkable[i] === 1;
  }

  /** Nearest walkable cell index within a small radius (or -1). */
  nearestWalkable(x: number, y: number, maxRing = 6): number {
    const c0 = Math.floor(x / this.cell);
    const r0 = Math.floor(y / this.cell);
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          const i = r * this.cols + c;
          if (this.walkable[i]) return i;
        }
      }
    }
    return -1;
  }

  /** Flood fill from a cell; returns a visited mask (used for reachability checks). */
  flood(start: number): Uint8Array {
    const seen = new Uint8Array(this.walkable.length);
    if (start < 0 || !this.walkable[start]) return seen;
    const queue = new Int32Array(this.walkable.length);
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const i = queue[head++]!;
      const c = i % this.cols;
      const r = (i / this.cols) | 0;
      const nb = [c > 0 ? i - 1 : -1, c < this.cols - 1 ? i + 1 : -1, r > 0 ? i - this.cols : -1, r < this.rows - 1 ? i + this.cols : -1];
      for (const j of nb) {
        if (j >= 0 && !seen[j] && this.walkable[j]) {
          seen[j] = 1;
          queue[tail++] = j;
        }
      }
    }
    return seen;
  }

  /** 8-connected A* returning world-space waypoints (simplified with line-of-walk smoothing). */
  findPath(sx: number, sy: number, tx: number, ty: number, maxExpand = 6000): Array<{ x: number; y: number }> | null {
    const start = this.nearestWalkable(sx, sy);
    const goal = this.nearestWalkable(tx, ty);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [{ x: tx, y: ty }];
    const n = this.walkable.length;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const gc = goal % this.cols;
    const gr = (goal / this.cols) | 0;
    const h = (i: number) => {
      const dc = Math.abs((i % this.cols) - gc);
      const dr = Math.abs(((i / this.cols) | 0) - gr);
      return Math.max(dc, dr) + 0.4142 * Math.min(dc, dr);
    };
    g[start] = 0;
    heap.push(start, h(start));
    let expanded = 0;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (++expanded > maxExpand) return null;
      const c = cur % this.cols;
      const r = (cur / this.cols) | 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
          const j = nr * this.cols + nc;
          if (!this.walkable[j] || closed[j]) continue;
          if (dr && dc && (!this.walkable[r * this.cols + nc] || !this.walkable[nr * this.cols + c])) continue;
          const cost = g[cur]! + (dr && dc ? 1.4142 : 1);
          if (cost < g[j]!) {
            g[j] = cost;
            came[j] = cur;
            heap.push(j, cost + h(j));
          }
        }
      }
    }
    if (came[goal] === -1) return null;
    const cells: number[] = [];
    for (let i = goal; i !== -1 && i !== start; i = came[i]!) cells.push(i);
    cells.reverse();
    // Smooth: keep a waypoint only when the straight segment is not walkable.
    const pts = cells.map((i) => this.center(i));
    const out: Array<{ x: number; y: number }> = [];
    let anchor = { x: sx, y: sy };
    for (let k = 0; k < pts.length; k++) {
      const next = pts[k + 1];
      if (next && this.segmentWalkable(anchor.x, anchor.y, next.x, next.y)) continue;
      out.push(pts[k]!);
      anchor = pts[k]!;
    }
    out.push({ x: tx, y: ty });
    return out;
  }

  segmentWalkable(ax: number, ay: number, bx: number, by: number): boolean {
    const d = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (!this.isWalkable(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= this.keys[i]!) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.ids[0]!;
    const lastId = this.ids.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l]! < this.keys[m]!) m = l;
        if (r < this.ids.length && this.keys[r]! < this.keys[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.ids[a], this.ids[b]] = [this.ids[b]!, this.ids[a]!];
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
  }
}
