/**
 * Builds the static top-down map from a MapDef: tiled floors, painted decals, props, walls with
 * drop shadows, roof details and the overhead layer (trees, pipes, archway roofs) that fades when
 * the local player walks underneath.
 */
import * as Phaser from 'phaser';
import { PROP_DEFS, propFootprint } from '@blatkom/shared';
import type { FloorType, MapDef, PropPlacement, WallRect } from '@blatkom/shared';
import { D } from './depth.js';
import { paintedText, paintedArrow, hazardStripes, paintedStar, stain, hopscotch, manhole, solidRect, laundry, clutterSheet, stairsDecal, dashedRect, paintedCross, craneJib, CRANE_TAIL } from './paint.js';
import type { ClutterFrame } from './paint.js';

// keep in sync with tools/art PROP_VARIANTS (props.ts, props2.ts, props3.ts)
const PROP_VARIANTS: Record<string, number> = {
  garage: 5,
  container: 4,
  car_zhiguli: 5,
  car_volga: 4,
  garage_shell: 3,
  shelf: 6,
  fridge_case: 3,
  counter: 4,
  coat_rack: 2,
  ambulance: 3,
  produce_stall: 3,
  tent: 3,
  flagpole: 3,
  grave: 4,
  grave_mound: 3,
  tomb: 2,
  dome: 6,
  dome_small: 6,
  boat: 3,
  bugler: 2,
  rock: 3,
};
const TEX_SCALE = 0.5;

type ClutterSet = { area: number; frames: Array<[ClutterFrame, number]> };
const INDUSTRIAL: ClutterSet = { area: 2400, frames: [['debris_0', 3], ['debris_1', 3], ['debris_2', 2], ['bolt_0', 3], ['bolt_1', 2], ['crack_0', 3], ['oil_0', 1.5], ['oil_1', 1], ['butt_0', 2], ['paper_1', 1], ['card_0', 1], ['rag_0', 1], ['can_0', 1]] };
const STREET: ClutterSet = { area: 2200, frames: [['debris_0', 2], ['debris_2', 2], ['butt_0', 3], ['butt_1', 2], ['glass_0', 2], ['leaf_0', 2], ['leaf_1', 2], ['leaf_2', 1], ['paper_0', 1], ['news_0', 0.7], ['bottle_0', 1], ['weeds_0', 2], ['weeds_1', 1.5], ['crack_0', 2], ['can_0', 1], ['tape_0', 0.25]] };
const INDOOR: ClutterSet = { area: 3200, frames: [['paper_0', 3], ['paper_1', 3], ['news_0', 1.5], ['butt_0', 2], ['butt_1', 1], ['card_0', 0.7], ['can_0', 0.6], ['tape_0', 0.5]] };
const GREEN: ClutterSet = { area: 1800, frames: [['leaf_0', 3], ['leaf_1', 3], ['leaf_2', 2], ['weeds_0', 3], ['weeds_1', 3], ['bottle_0', 0.6], ['paper_0', 0.5], ['butt_0', 0.8]] };
const CLUTTER: Record<FloorType, ClutterSet | null> = {
  concrete_slab: INDUSTRIAL,
  concrete_dirty: INDUSTRIAL,
  concrete_painted: { ...INDOOR, area: 3000 },
  metal_plate: { ...INDUSTRIAL, area: 2800 },
  linoleum_checker: INDOOR,
  tile_white: INDOOR,
  wood: INDOOR,
  asphalt: STREET,
  asphalt_cracked: { ...STREET, area: 1700 },
  gravel: { ...STREET, area: 2600 },
  dirt: GREEN,
  grass: GREEN,
  sand: { area: 2600, frames: [['leaf_0', 1], ['butt_0', 1], ['bottle_0', 0.5], ['weeds_0', 1], ['can_0', 0.5]] },
  carpet_red: { ...INDOOR, area: 4200 },
  parquet: { ...INDOOR, area: 3600 },
  tile_green: { area: 3400, frames: [['paper_0', 3], ['paper_1', 2], ['card_0', 1], ['butt_0', 1], ['tape_0', 0.5]] },
  tile_beige: { area: 3000, frames: [['paper_0', 3], ['paper_1', 2], ['news_0', 1], ['card_0', 1.5], ['can_0', 1], ['bottle_0', 0.5], ['leaf_0', 0.3]] },
  marble: { ...INDOOR, area: 5200 },
  paving: { ...STREET, area: 2600 },
  cobble: { ...STREET, area: 2800 },
};

interface Cullable {
  o: { setVisible(v: boolean): unknown };
  b: Phaser.Geom.Rectangle;
}

interface Overhead {
  obj: { setAlpha(a: number): unknown };
  rect: Phaser.Geom.Rectangle;
  baseAlpha: number;
  current: number;
  /** Custom cover test (a crane jib is a long diagonal strip, not its bounding box). */
  covers?: (x: number, y: number) => boolean;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function hash(a: number, b: number, c = 0): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class MapRenderer {
  private readonly overheads: Overhead[] = [];
  private decalId = 0;
  private readonly cullables: Cullable[] = [];
  private lastCull: { x: number; y: number; w: number; h: number } | null = null;
  /** Lake/river surfaces: drifted slowly in animate(). */
  private readonly water: Array<{ t: Phaser.GameObjects.TileSprite; x0: number; y0: number }> = [];

  constructor(
    private readonly scene: Phaser.Scene,
    readonly map: MapDef,
  ) {}

  build(): void {
    this.buildFloors();
    this.buildDecals();
    this.buildClutter();
    this.buildProps();
    this.buildWalls();
    this.buildOverhead();
    // static decoration that is far off-screen is hidden (cheap manual culling for mobile GPUs/CPUs)
    for (const obj of this.scene.children.list) {
      if (obj instanceof Phaser.GameObjects.Image || obj instanceof Phaser.GameObjects.TileSprite) {
        if (obj.depth <= D.FLOOR_OVER || obj.depth >= D.OVERHEAD) continue;
        this.cullables.push({ o: obj, b: obj.getBounds() });
      }
    }
  }

  /** Hides static map objects outside the camera view (re-evaluated only after the camera moves). */
  cull(view: Phaser.Geom.Rectangle): void {
    const l = this.lastCull;
    if (l && Math.abs(l.x - view.x) < 24 && Math.abs(l.y - view.y) < 24 && l.w === view.width && l.h === view.height) return;
    this.lastCull = { x: view.x, y: view.y, w: view.width, h: view.height };
    const m = 64;
    const x0 = view.x - m;
    const y0 = view.y - m;
    const x1 = view.right + m;
    const y1 = view.bottom + m;
    for (const c of this.cullables) c.o.setVisible(c.b.right >= x0 && c.b.x <= x1 && c.b.bottom >= y0 && c.b.y <= y1);
  }

  /** Cheap per-frame animation of the static map (the water drifts). */
  animate(timeMs: number): void {
    if (!this.water.length) return;
    const dx = timeMs * 0.0016;
    const dy = Math.sin(timeMs / 2600) * 3;
    for (const w of this.water) {
      if (!w.t.visible) continue;
      w.t.tilePositionX = w.x0 + dx;
      w.t.tilePositionY = w.y0 + dy;
    }
  }

  /** Deterministic litter scattered over floors (papers, butts, bolts, debris, leaves…). */
  private buildClutter() {
    const m = this.map;
    const key = clutterSheet(this.scene);
    const floorAt = (x: number, y: number): FloorType => {
      for (let i = m.floors.length - 1; i >= 0; i--) {
        const f = m.floors[i]!;
        if (x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h) return f.type;
      }
      return m.baseFloor;
    };
    const blocked = (x: number, y: number) => {
      for (const w of m.walls) if (x > w.x - 3 && x < w.x + w.w + 3 && y > w.y - 3 && y < w.y + w.h + 3) return true;
      for (const p of m.props) {
        const def = PROP_DEFS[p.type];
        if (def.layer === 'floor') continue;
        const fp = propFootprint(def, p.rot);
        if (Math.abs(x - p.x) < fp.w / 2 + 2 && Math.abs(y - p.y) < fp.h / 2 + 2) return true;
      }
      return false;
    };
    // sample a jittered grid so litter is spread out, then thin it per floor density
    const cell = 34;
    let n = 0;
    for (let gy = 0; gy < m.height; gy += cell) {
      for (let gx = 0; gx < m.width; gx += cell) {
        const x = gx + hash(gx, gy, 11) * cell;
        const y = gy + hash(gx, gy, 12) * cell;
        const set = CLUTTER[floorAt(x, y)];
        if (!set) continue;
        if (hash(gx, gy, 13) > (cell * cell) / set.area) continue;
        if (blocked(x, y)) continue;
        const total = set.frames.reduce((s, [, wgt]) => s + wgt, 0);
        let pick = hash(gx, gy, 14) * total;
        let frame: ClutterFrame = set.frames[0]![0];
        for (const [f, wgt] of set.frames) {
          pick -= wgt;
          if (pick <= 0) {
            frame = f;
            break;
          }
        }
        this.scene.add
          .image(Math.round(x), Math.round(y), key, frame)
          .setScale(TEX_SCALE)
          .setRotation(hash(gx, gy, 15) * Math.PI * 2)
          .setAlpha(0.92)
          .setDepth(D.DECAL + 0.05);
        n++;
      }
    }
    return n;
  }

  private tile(x: number, y: number, w: number, h: number, key: string, depth: number, seed: number) {
    const t = this.scene.add.tileSprite(x, y, w, h, key).setOrigin(0, 0).setDepth(depth);
    t.setTileScale(TEX_SCALE, TEX_SCALE);
    t.tilePositionX = Math.floor(hash(seed, 1) * 256);
    t.tilePositionY = Math.floor(hash(seed, 2) * 256);
    return t;
  }

  private buildFloors() {
    const m = this.map;
    this.tile(0, 0, m.width, m.height, `floor_${m.baseFloor}`, D.FLOOR, 7);
    m.floors.forEach((f, i) => {
      this.tile(f.x, f.y, f.w, f.h, `floor_${f.type}`, D.FLOOR_OVER, i + 11);
      // subtle dark seam where floor materials meet
      const g = this.scene.add.graphics().setDepth(D.FLOOR_OVER);
      g.lineStyle(1, 0x000000, 0.35).strokeRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1);
    });
  }

  private nextKey(prefix: string) {
    return `${this.map.id}_${prefix}_${this.decalId++}`;
  }

  private buildDecals() {
    for (const d of this.map.decals) {
      const seed = this.decalId * 31 + 5;
      switch (d.kind) {
        case 'text': {
          const key = paintedText(this.scene, this.nextKey('txt'), d.text, d.size, d.color, d.font ?? 'stencil', seed);
          this.scene.add
            .image(d.x, d.y, key)
            .setScale(TEX_SCALE)
            .setAngle(d.angle ?? 0)
            .setAlpha(d.alpha ?? 0.7)
            .setDepth(d.layer === 'roof' ? D.ROOF_DECAL : D.DECAL);
          break;
        }
        case 'arrow': {
          const key = paintedArrow(this.scene, this.nextKey('arrow'), d.w, d.h, d.color, d.text, seed);
          this.scene.add.image(d.x, d.y, key).setScale(TEX_SCALE).setAngle(d.angle).setAlpha(d.alpha ?? 0.8).setDepth(D.DECAL);
          break;
        }
        case 'hazard': {
          const key = hazardStripes(this.scene, this.nextKey('haz'), d.w, d.h, seed);
          this.scene.add.image(d.x, d.y, key).setOrigin(0, 0).setScale(TEX_SCALE).setAlpha(d.alpha ?? 0.75).setDepth(D.DECAL);
          break;
        }
        case 'stain': {
          const key = stain(this.scene, this.nextKey('stain'), d.r, d.color, d.seed ?? seed);
          this.scene.add.image(d.x, d.y, key).setScale(TEX_SCALE).setAlpha(d.alpha ?? 0.5).setDepth(D.DECAL);
          break;
        }
        case 'star': {
          const key = paintedStar(this.scene, this.nextKey('star'), d.r, d.color, seed);
          this.scene.add.image(d.x, d.y, key).setScale(TEX_SCALE).setAlpha(d.alpha ?? 0.8).setDepth(d.layer === 'roof' ? D.ROOF_DECAL : D.DECAL);
          break;
        }
        case 'line': {
          // roof-layer lines are banners and signboards: less worn, drawn over walls and tall props
          const roof = d.layer === 'roof';
          const key = solidRect(this.scene, this.nextKey('line'), d.w, d.h, d.color, seed, roof ? 0.12 : 0.6);
          this.scene.add.image(d.x, d.y, key).setOrigin(0, 0).setScale(TEX_SCALE).setAlpha(d.alpha ?? 0.6).setDepth(roof ? D.ROOF_DECAL - 0.01 : D.DECAL);
          break;
        }
        case 'stairs': {
          const key = stairsDecal(this.scene, this.nextKey('stairs'), d.w, d.h, seed);
          this.scene.add.image(d.x, d.y, key).setOrigin(0, 0).setScale(TEX_SCALE).setAlpha(d.alpha ?? 1).setDepth(D.DECAL - 0.02);
          break;
        }
        case 'dashrect': {
          const key = dashedRect(this.scene, this.nextKey('dash'), d.w, d.h, d.color, seed);
          this.scene.add.image(d.x, d.y, key).setOrigin(0, 0).setScale(TEX_SCALE).setAlpha(d.alpha ?? 0.8).setDepth(D.DECAL);
          break;
        }
        case 'cross': {
          const key = paintedCross(this.scene, this.nextKey('cross'), d.r, d.color, seed);
          this.scene.add.image(d.x, d.y, key).setScale(TEX_SCALE).setAlpha(d.alpha ?? 0.8).setDepth(D.DECAL);
          break;
        }
        case 'hopscotch': {
          const key = hopscotch(this.scene, this.nextKey('hop'), seed);
          this.scene.add.image(d.x, d.y, key).setScale(TEX_SCALE).setAngle(d.angle ?? 0).setAlpha(0.75).setDepth(D.DECAL);
          break;
        }
        case 'manhole': {
          const key = manhole(this.scene, this.nextKey('mh'));
          this.scene.add.image(d.x, d.y, key).setScale(TEX_SCALE).setDepth(D.DECAL);
          break;
        }
      }
    }
  }

  private propFrame(p: PropPlacement): string {
    const variants = PROP_VARIANTS[p.type] ?? 1;
    return `prop_${p.type}_${(p.variant ?? 0) % variants}`;
  }

  private buildProps() {
    let garageNo = 3;
    for (const p of this.map.props) {
      const def = PROP_DEFS[p.type];
      const frame = this.propFrame(p);
      const depth = def.layer === 'high' ? D.PROP_HIGH : def.layer === 'low' ? D.PROP_LOW : D.PROP_FLOOR;
      const rot = Phaser.Math.DegToRad(p.rot);
      if (def.layer !== 'floor') {
        const off = def.layer === 'high' ? 5 : 3;
        this.scene.add
          .image(p.x + off, p.y + off * 1.2, 'props', frame)
          .setScale(TEX_SCALE)
          .setRotation(rot)
          .setTintFill(0x000000)
          .setAlpha(def.layer === 'high' ? 0.45 : 0.35)
          .setDepth(def.layer === 'high' ? D.WALL_SHADOW : D.SHADOW);
      }
      this.scene.add.image(p.x, p.y, 'props', frame).setScale(TEX_SCALE).setRotation(rot).setDepth(depth);
      if (p.type === 'garage') {
        // painted garage number on the roof
        const fp = propFootprint(def, p.rot);
        const key = paintedText(this.scene, this.nextKey('gno'), `№${garageNo++}`, 9, '#d8d0bc', 'stencil', garageNo * 13);
        this.scene.add
          .image(p.x - fp.w * 0.18, p.y - fp.h * 0.15, key)
          .setScale(TEX_SCALE)
          .setAlpha(0.45)
          .setAngle(p.rot === 90 || p.rot === 270 ? 90 : 0)
          .setDepth(D.ROOF_DECAL);
      }
    }
  }

  private buildWalls() {
    const shadows = this.scene.add.graphics().setDepth(D.WALL_SHADOW);
    const edges = this.scene.add.graphics().setDepth(D.WALL + 0.5);
    const shore = this.scene.add.graphics().setDepth(D.FLOOR_OVER + 0.3);
    for (const [i, w] of this.map.walls.entries()) {
      if (w.style === 'water') {
        this.waterRect(w, shore);
        continue;
      }
      if (w.style === 'fence_iron') {
        shadows.fillStyle(0x000000, 0.22).fillRect(w.x + 2, w.y + 2.4, w.w, w.h);
        this.ironFence(w, edges);
        continue;
      }
      const thin = w.style === 'fence_chain';
      if (!thin) {
        const tall = w.style === 'roof_flat' || w.style === 'roof_church' || w.style === 'kremlin';
        const off = tall ? 10 : w.style === 'fence_concrete' ? 3 : 5;
        shadows.fillStyle(0x000000, tall ? 0.5 : 0.42);
        shadows.fillRect(w.x + off, w.y + off * 1.2, w.w, w.h);
      }
      if (w.style === 'fence_chain') {
        this.chainFence(w, edges);
        continue;
      }
      const tex = w.style === 'roof_garage' || w.style === 'roof_booth' ? 'wall_corrugated' : `wall_${w.style}`;
      this.tile(w.x, w.y, w.w, w.h, tex, D.WALL, i * 7 + 3);
      // bevel: light top/left edge, dark bottom/right edge, crisp outline
      edges.fillStyle(0xffffff, 0.1).fillRect(w.x, w.y, w.w, 1).fillRect(w.x, w.y, 1, w.h);
      edges.fillStyle(0x000000, 0.35).fillRect(w.x, w.y + w.h - 1, w.w, 1).fillRect(w.x + w.w - 1, w.y, 1, w.h);
      edges.lineStyle(1, 0x0b0908, 0.9).strokeRect(w.x - 0.5, w.y - 0.5, w.w + 1, w.h + 1);
      if (w.style === 'roof_flat') this.roofDetails(w, i, edges);
      if (w.style === 'roof_church') this.hipRoof(w, edges);
      if (w.style === 'fence_concrete') {
        const vertical = w.h > w.w;
        const len = vertical ? w.h : w.w;
        edges.fillStyle(0x8a857a, 0.9);
        for (let s = 0; s <= len; s += 48) {
          if (vertical) edges.fillRect(w.x - 1, w.y + s - 2, w.w + 2, 4);
          else edges.fillRect(w.x + s - 2, w.y - 1, 4, w.h + 2);
        }
      }
    }
  }

  /** A wrought-iron railing: bars (rotated for vertical runs), a top rail and square posts with finials. */
  private ironFence(w: WallRect, g: Phaser.GameObjects.Graphics) {
    const vertical = w.h > w.w;
    const len = vertical ? w.h : w.w;
    const thick = vertical ? w.w : w.h;
    const bars = this.scene.add.tileSprite(w.x + w.w / 2, w.y + w.h / 2, len, thick + 2, 'wall_fence_iron');
    bars.setTileScale(TEX_SCALE, TEX_SCALE).setDepth(D.WALL);
    if (vertical) bars.setRotation(Math.PI / 2);
    g.lineStyle(1, 0x3c4048, 1);
    if (vertical) g.lineBetween(w.x + w.w / 2, w.y, w.x + w.w / 2, w.y + w.h);
    else g.lineBetween(w.x, w.y + w.h / 2, w.x + w.w, w.y + w.h / 2);
    const step = len / Math.max(1, Math.round(len / 26));
    for (let s = 0; s <= len + 0.5; s += step) {
      const px = vertical ? w.x + w.w / 2 : w.x + Math.min(s, len);
      const py = vertical ? w.y + Math.min(s, len) : w.y + w.h / 2;
      g.fillStyle(0x121418, 1).fillRect(px - 2.5, py - 2.5, 5, 5);
      g.fillStyle(0x6a707a, 1).fillRect(px - 1, py - 1, 2, 2);
    }
  }

  /**
   * Water (a lake, a river): blocks movement, not bullets. Drawn just above the floors so boats and
   * jetties sit on it; the texture is world-aligned (no seams between pieces) and drifts in animate().
   * A pale foam line marks the shore wherever the neighbour is not water.
   */
  private waterRect(w: WallRect, g: Phaser.GameObjects.Graphics) {
    const t = this.scene.add.tileSprite(w.x, w.y, w.w, w.h, 'wall_water').setOrigin(0, 0).setDepth(D.FLOOR_OVER + 0.2);
    t.setTileScale(TEX_SCALE, TEX_SCALE);
    const x0 = w.x / TEX_SCALE;
    const y0 = w.y / TEX_SCALE;
    t.tilePositionX = x0;
    t.tilePositionY = y0;
    this.water.push({ t, x0, y0 });
    const wet = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return true;
      return this.map.walls.some((o) => o.style === 'water' && x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h);
    };
    const S = 4;
    // north/south edges
    for (const [y, out, band] of [
      [w.y, w.y - 1, w.y],
      [w.y + w.h, w.y + w.h, w.y + w.h - 2],
    ] as const)
      for (let x = w.x; x < w.x + w.w; x += S) {
        if (wet(x + S / 2, out)) continue;
        g.fillStyle(0x0a0e10, 0.35).fillRect(x, y - (band === w.y ? 0 : 3), S, 3);
        g.fillStyle(0xa8c8d0, 0.35 + ((x * 7) % 5) * 0.04).fillRect(x, band, S, 1.5);
      }
    // west/east edges
    for (const [x, out, band] of [
      [w.x, w.x - 1, w.x],
      [w.x + w.w, w.x + w.w, w.x + w.w - 2],
    ] as const)
      for (let y = w.y; y < w.y + w.h; y += S) {
        if (wet(out, y + S / 2)) continue;
        g.fillStyle(0x0a0e10, 0.35).fillRect(x - (band === w.x ? 0 : 3), y, 3, S);
        g.fillStyle(0xa8c8d0, 0.35 + ((y * 7) % 5) * 0.04).fillRect(band, y, 1.5, S);
      }
  }

  /** A hipped roof: four slopes shaded for light from the north-west, with dark hips and a ridge. */
  private hipRoof(w: WallRect, g: Phaser.GameObjects.Graphics) {
    const { x, y } = w;
    const W = w.w;
    const H = w.h;
    const horiz = W >= H;
    const r = (horiz ? H : W) / 2;
    const A = { x: x + r, y: y + r };
    const B = horiz ? { x: x + W - r, y: y + r } : { x: x + r, y: y + H - r };
    const P = (px: number, py: number) => new Phaser.Geom.Point(px, py);
    const north = horiz ? [P(x, y), P(x + W, y), P(B.x, B.y), P(A.x, A.y)] : [P(x, y), P(x + W, y), P(A.x, A.y)];
    const south = horiz ? [P(x, y + H), P(x + W, y + H), P(B.x, B.y), P(A.x, A.y)] : [P(x, y + H), P(x + W, y + H), P(B.x, B.y)];
    const west = horiz ? [P(x, y), P(x, y + H), P(A.x, A.y)] : [P(x, y), P(x, y + H), P(B.x, B.y), P(A.x, A.y)];
    const east = horiz ? [P(x + W, y), P(x + W, y + H), P(B.x, B.y)] : [P(x + W, y), P(x + W, y + H), P(B.x, B.y), P(A.x, A.y)];
    g.fillStyle(0xffffff, 0.1).fillPoints(north, true);
    g.fillStyle(0xffffff, 0.04).fillPoints(west, true);
    g.fillStyle(0x000000, 0.16).fillPoints(south, true);
    g.fillStyle(0x000000, 0.26).fillPoints(east, true);
    g.lineStyle(2, 0x0e1a12, 0.6);
    g.lineBetween(x + 1, y + 1, A.x, A.y).lineBetween(x + 1, y + H - 1, horiz ? A.x : B.x, horiz ? A.y : B.y);
    g.lineBetween(x + W - 1, y + 1, horiz ? B.x : A.x, horiz ? B.y : A.y).lineBetween(x + W - 1, y + H - 1, B.x, B.y);
    if (A.x !== B.x || A.y !== B.y) g.lineBetween(A.x, A.y, B.x, B.y);
    g.lineStyle(1, 0x8ac8a0, 0.25);
    if (A.x !== B.x || A.y !== B.y) g.lineBetween(A.x - 1, A.y - 1, B.x - 1, B.y - 1);
  }

  private chainFence(w: WallRect, g: Phaser.GameObjects.Graphics) {
    const vertical = w.h > w.w;
    const mesh = this.scene.add.tileSprite(w.x - (vertical ? 3 : 0), w.y - (vertical ? 0 : 3), vertical ? w.w + 6 : w.w, vertical ? w.h : w.h + 6, 'wall_fence_chain');
    mesh.setOrigin(0, 0).setTileScale(TEX_SCALE, TEX_SCALE).setAlpha(0.75).setDepth(D.WALL);
    const len = vertical ? w.h : w.w;
    g.fillStyle(0x5c6066, 1);
    for (let s = 0; s <= len; s += 32) {
      if (vertical) g.fillRect(w.x - 1.5, w.y + s - 1.5, w.w + 3, 3);
      else g.fillRect(w.x + s - 1.5, w.y - 1.5, 3, w.h + 3);
    }
    g.lineStyle(1, 0x9aa0a8, 0.8);
    if (vertical) g.lineBetween(w.x + w.w / 2, w.y, w.x + w.w / 2, w.y + w.h);
    else g.lineBetween(w.x, w.y + w.h / 2, w.x + w.w, w.y + w.h / 2);
  }

  private roofDetails(w: WallRect, i: number, g: Phaser.GameObjects.Graphics) {
    // parapet band
    g.lineStyle(4, 0x5a5650, 1).strokeRect(w.x + 2, w.y + 2, w.w - 4, w.h - 4);
    g.lineStyle(1, 0x1a1816, 1).strokeRect(w.x + 4.5, w.y + 4.5, w.w - 9, w.h - 9);
    const area = w.w * w.h;
    const n = Math.max(2, Math.floor(area / 9000));
    const kinds = ['roof_vent', 'roof_vent', 'roof_hatch', 'roof_antenna', 'roof_puddle', 'roof_antenna'];
    for (let k = 0; k < n; k++) {
      const fx = 0.12 + hash(i, k, 1) * 0.76;
      const fy = 0.15 + hash(i, k, 2) * 0.7;
      const frame = kinds[Math.floor(hash(i, k, 3) * kinds.length)]!;
      this.scene.add
        .image(w.x + w.w * fx, w.y + w.h * fy, 'props', frame)
        .setScale(TEX_SCALE)
        .setRotation(Math.floor(hash(i, k, 4) * 4) * (Math.PI / 2))
        .setDepth(D.WALL + 0.6);
    }
    if (area > 60000) {
      const mx = w.x + w.w * (0.3 + hash(i, 9, 5) * 0.4);
      const my = w.y + w.h / 2;
      this.scene.add.image(mx, my, 'props', 'roof_machine').setScale(TEX_SCALE).setDepth(D.WALL + 0.6);
    }
  }

  private buildOverhead() {
    for (const [i, o] of this.map.overhead.entries()) {
      let obj: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite;
      let alpha = 1;
      let covers: Overhead['covers'];
      switch (o.kind) {
        case 'crane': {
          const key = craneJib(this.scene, this.nextKey('crane'), o.w, o.h, o.seed ?? i);
          const ang = Phaser.Math.DegToRad(o.angle ?? 0);
          const ox = CRANE_TAIL / (o.w + CRANE_TAIL + 6);
          // the jib is high up: its shadow falls far from it
          this.scene.add.image(o.x + 16, o.y + 22, key).setOrigin(ox, 0.5).setScale(TEX_SCALE).setRotation(ang).setTintFill(0x000000).setAlpha(0.3).setDepth(D.SHADOW);
          obj = this.scene.add.image(o.x, o.y, key).setOrigin(ox, 0.5).setScale(TEX_SCALE).setRotation(ang);
          const ax = o.x - Math.cos(ang) * CRANE_TAIL;
          const ay = o.y - Math.sin(ang) * CRANE_TAIL;
          const bx = o.x + Math.cos(ang) * o.w;
          const by = o.y + Math.sin(ang) * o.w;
          covers = (x, y) => segDist(x, y, ax, ay, bx, by) < 22;
          break;
        }
        case 'tree': {
          const size = Math.max(o.w, o.h);
          const frame = size < 64 ? 'tree_0' : size < 80 ? 'tree_1' : 'tree_2';
          const native = size < 64 ? 56 : size < 80 ? 72 : 88;
          this.scene.add
            .image(o.x + o.w / 2 + 8, o.y + o.h / 2 + 10, 'props', frame)
            .setScale((TEX_SCALE * size) / native)
            .setTintFill(0x000000)
            .setAlpha(0.35)
            .setDepth(D.SHADOW);
          obj = this.scene.add.image(o.x + o.w / 2, o.y + o.h / 2, 'props', frame).setScale((TEX_SCALE * size) / native).setRotation(hash(i, 3) * Math.PI * 2);
          break;
        }
        case 'bush': {
          const frame = o.w > o.h ? 'bush_0' : 'bush_1';
          const nw = o.w > o.h ? 70 : 30;
          const nh = o.w > o.h ? 28 : 70;
          obj = this.scene.add.image(o.x + o.w / 2, o.y + o.h / 2, 'props', frame).setScale((TEX_SCALE * o.w) / nw, (TEX_SCALE * o.h) / nh);
          break;
        }
        case 'pipe': {
          const vertical = o.h > o.w;
          if (vertical) {
            obj = this.scene.add.tileSprite(o.x + o.w / 2, o.y + o.h / 2, o.h, 14, 'pipe').setRotation(Math.PI / 2);
          } else obj = this.scene.add.tileSprite(o.x + o.w / 2, o.y + o.h / 2, o.w, 14, 'pipe');
          (obj as Phaser.GameObjects.TileSprite).setTileScale(TEX_SCALE, TEX_SCALE);
          const sh = this.scene.add.graphics().setDepth(D.WALL_SHADOW);
          sh.fillStyle(0x000000, 0.3).fillRect(o.x + 6, o.y + 8, o.w, o.h);
          break;
        }
        case 'canopy': {
          obj = this.tile(o.x, o.y, o.w, o.h, 'wall_roof_flat', D.OVERHEAD, i * 13);
          alpha = 1;
          const g = this.scene.add.graphics().setDepth(D.OVERHEAD + 0.1);
          g.lineStyle(4, 0x5a5650, 1).strokeRect(o.x + 2, o.y + 2, o.w - 4, o.h - 4);
          this.overheads.push({ obj: g, rect: new Phaser.Geom.Rectangle(o.x, o.y, o.w, o.h), baseAlpha: 1, current: 1 });
          break;
        }
        case 'wires': {
          const key = laundry(this.scene, this.nextKey('laundry'), o.w, o.h, o.seed ?? i);
          obj = this.scene.add.image(o.x, o.y, key).setOrigin(0, 0).setScale(TEX_SCALE);
          break;
        }
      }
      obj.setDepth(D.OVERHEAD).setAlpha(alpha);
      const entry: Overhead = { obj, rect: new Phaser.Geom.Rectangle(o.x, o.y, o.w, o.h), baseAlpha: alpha, current: alpha };
      if (covers) entry.covers = covers;
      this.overheads.push(entry);
    }
  }

  /** Fades overhead objects that cover the local player. */
  updateOverhead(x: number, y: number, dtMs: number): void {
    const k = Math.min(1, dtMs / 120);
    for (const o of this.overheads) {
      const r = o.rect;
      const inside = o.covers ? o.covers(x, y) : x > r.x - 8 && x < r.right + 8 && y > r.y - 8 && y < r.bottom + 8;
      const target = inside ? o.baseAlpha * 0.28 : o.baseAlpha;
      o.current += (target - o.current) * k;
      o.obj.setAlpha(o.current);
    }
  }
}
