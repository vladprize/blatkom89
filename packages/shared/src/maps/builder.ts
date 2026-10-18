import type {
  DecalPlacement,
  FloorRect,
  FloorType,
  LightDef,
  MapDef,
  MapId,
  OverheadDef,
  PickupSpawn,
  PropPlacement,
  Rotation,
  SpawnPoint,
  WallRect,
  WallStyle,
} from './types.js';
import type { PropType } from './props.js';
import type { WeaponId } from '../game-rules/weapons.js';

export type Side = 'n' | 's' | 'e' | 'w';
export interface Door {
  side: Side;
  /** Offset of the door start from the room's left/top edge (outer coordinates). */
  at: number;
  width: number;
}

/** Fluent helper used to author maps in code with readable, reviewable geometry. */
export class MapBuilder {
  private readonly def: MapDef;

  constructor(id: MapId, name: string, subtitle: string, description: string, width: number, height: number, baseFloor: FloorType) {
    this.def = {
      id,
      name,
      subtitle,
      description,
      width,
      height,
      baseFloor,
      floors: [],
      walls: [],
      props: [],
      decals: [],
      lights: [],
      overhead: [],
      spawns: [],
      pickups: [],
      supplyPoints: [],
      medkits: [],
      ambient: { color: 0x2a3550, level: 0.55 },
      minimapFloor: '#3a3632',
    };
  }

  ambient(color: number, level: number): this {
    this.def.ambient = { color, level };
    return this;
  }

  minimap(color: string): this {
    this.def.minimapFloor = color;
    return this;
  }

  floor(type: FloorType, x: number, y: number, w: number, h: number): this {
    this.def.floors.push({ type, x, y, w, h } satisfies FloorRect);
    return this;
  }

  wall(style: WallStyle, x: number, y: number, w: number, h: number, tag?: string): this {
    const r: WallRect = { style, x, y, w, h };
    if (tag) r.tag = tag;
    this.def.walls.push(r);
    return this;
  }

  /** Horizontal wall from x0 to x1 at y with thickness t, with gaps [start, end) in absolute x. */
  hwall(style: WallStyle, x0: number, x1: number, y: number, t: number, gaps: Array<[number, number]> = []): this {
    for (const [a, b] of splitByGaps(x0, x1, gaps)) this.wall(style, a, y, b - a, t);
    return this;
  }

  vwall(style: WallStyle, x: number, y0: number, y1: number, t: number, gaps: Array<[number, number]> = []): this {
    for (const [a, b] of splitByGaps(y0, y1, gaps)) this.wall(style, x, a, t, b - a);
    return this;
  }

  /** Closed room outline (outer bounds x,y,w,h) with wall thickness t and door gaps. */
  room(style: WallStyle, x: number, y: number, w: number, h: number, t: number, doors: Door[] = [], floor?: FloorType): this {
    if (floor) this.floor(floor, x + t, y + t, w - 2 * t, h - 2 * t);
    const gaps = (side: Side, origin: number) =>
      doors.filter((d) => d.side === side).map((d) => [origin + d.at, origin + d.at + d.width] as [number, number]);
    this.hwall(style, x, x + w, y, t, gaps('n', x));
    this.hwall(style, x, x + w, y + h - t, t, gaps('s', x));
    this.vwall(style, x, y + t, y + h - t, t, gaps('w', y));
    this.vwall(style, x + w - t, y + t, y + h - t, t, gaps('e', y));
    return this;
  }

  prop(type: PropType, x: number, y: number, rot: Rotation = 0, variant?: number): this {
    const p: PropPlacement = { type, x, y, rot };
    if (variant !== undefined) p.variant = variant;
    this.def.props.push(p);
    return this;
  }

  /** Places `count` props in a line starting at x,y stepping by dx,dy. */
  row(type: PropType, x: number, y: number, count: number, dx: number, dy: number, rot: Rotation = 0, variantSeed = 0): this {
    for (let i = 0; i < count; i++) this.prop(type, x + dx * i, y + dy * i, rot, (variantSeed + i) % 4);
    return this;
  }

  decal(d: DecalPlacement): this {
    this.def.decals.push(d);
    return this;
  }

  light(x: number, y: number, radius: number, color: number, intensity: number, extra: Partial<LightDef> = {}): this {
    this.def.lights.push({ x, y, radius, color, intensity, fixture: 'lamp', flicker: 'none', ...extra });
    return this;
  }

  overhead(o: OverheadDef): this {
    this.def.overhead.push(o);
    return this;
  }

  tree(x: number, y: number, size = 40, seed = 0): this {
    this.prop('tree_trunk', x, y);
    this.overhead({ kind: 'tree', x: x - size / 2, y: y - size / 2, w: size, h: size, seed });
    return this;
  }

  spawn(x: number, y: number, angleDeg: number): this {
    this.def.spawns.push({ x, y, angle: (angleDeg * Math.PI) / 180 } satisfies SpawnPoint);
    return this;
  }

  pickup(weapon: WeaponId, x: number, y: number, respawnMs = 18_000): this {
    this.def.pickups.push({ weapon, x, y, respawnMs } satisfies PickupSpawn);
    return this;
  }

  /** A first-aid kit (heals MEDKIT_HEAL, respawns after `respawnMs`). */
  medkit(x: number, y: number, respawnMs = 22_000): this {
    this.def.medkits.push({ x, y, respawnMs });
    return this;
  }

  /** A spot where a «дефицит» supply crate may appear during the match. */
  supply(x: number, y: number): this {
    this.def.supplyPoints.push({ x, y });
    return this;
  }

  build(): MapDef {
    return this.def;
  }
}

function splitByGaps(a0: number, a1: number, gaps: Array<[number, number]>): Array<[number, number]> {
  const sorted = gaps.slice().sort((p, q) => p[0] - q[0]);
  const out: Array<[number, number]> = [];
  let cur = a0;
  for (const [g0, g1] of sorted) {
    if (g0 > cur) out.push([cur, Math.min(g0, a1)]);
    cur = Math.max(cur, g1);
  }
  if (cur < a1) out.push([cur, a1]);
  return out.filter(([p, q]) => q - p > 0.5);
}
