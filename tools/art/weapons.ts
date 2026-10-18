/**
 * Weapon models for the paper-doll character art. Every weapon is modelled once in its own local
 * space — x forward along the barrel, origin at the right-hand grip, y to the right, z up (0 = hand
 * height) — and rendered three ways from that single model:
 *   - top-down sprite held in the hands (`w_<id>`, origin = grip) and lying on the floor (`pickup_<id>`);
 *   - side view (shop images, HUD silhouettes `ico_<id>`).
 * Torso frames are rendered per pose class (pistol / long / melee) without a weapon; the canonical
 * grip transform of every torso frame is exported so the client can attach any weapon sprite.
 */
import { hex } from './lib/raster.js';
import type { RGBA } from './lib/raster.js';
import type { Material, Prim, V3 } from './lib/model.js';
import { MAT } from './materials.js';
import type { PoseOffsets } from './characters.js';
import type { WeaponId, WeaponPose } from '../../packages/shared/src/game-rules/weapons.js';

const H = (...c: string[]): RGBA[] => c.map((x) => hex(x));

export const WMAT = {
  gunmetal: MAT.gunmetal,
  steel: MAT.steel,
  wood: MAT.wood,
  gold: MAT.gold,
  black: { ramp: H('#08080a', '#121216', '#1e1e24', '#2c2c34', '#3e3e48'), spec: { color: hex('#7a8090'), power: 16, threshold: 0.86 } } as Material,
  polymer: { ramp: H('#0b0b0d', '#16161a', '#222228', '#303038') } as Material,
  bakelite: { ramp: H('#2c1006', '#55200c', '#7c3414', '#a04a20', '#c0642e') } as Material,
  plum: { ramp: H('#26090a', '#461512', '#68241a', '#8a3624', '#a84a30') } as Material,
  walnut: { ramp: H('#1e0e06', '#3a1c0c', '#5a2e16', '#7c4422', '#9a5c30') } as Material,
  ash: { ramp: H('#5a3a1a', '#8a5e30', '#b48650', '#d6ac74', '#ecca98') } as Material,
  olive: { ramp: H('#161c0c', '#253016', '#374522', '#4c5d30', '#667a42') } as Material,
  oliveSteel: { ramp: H('#1a2010', '#2c361a', '#414e28', '#5a6a38'), spec: { color: hex('#b0b89a'), power: 14, threshold: 0.86 } } as Material,
  brass: { ramp: H('#3e2806', '#7a5014', '#b8842c', '#e2b450', '#fbe08a'), spec: { color: hex('#fff3c4'), power: 12, threshold: 0.75 } } as Material,
  yellow: { ramp: H('#4a3004', '#8a5e08', '#c89212', '#eab830', '#fbdc6a') } as Material,
  red: { ramp: H('#360806', '#681210', '#9a2016', '#c63622', '#e05a3a') } as Material,
  rubber: { ramp: H('#120a08', '#1e130e', '#2e1e16', '#3e2a20') } as Material,
  enamel: { ramp: H('#7c776c', '#aaa498', '#cfc9bc', '#e8e2d4', '#f8f4ea') } as Material,
  string: { ramp: H('#cfc6aa', '#efe8d0'), flat: true } as Material,
  ember: MAT.ember,
  glint: MAT.glint,
};

export interface WeaponModel {
  /** Prims in both views. */
  prims: Prim[];
  /** Top-down only (magazines folded out sideways so they read from above). */
  top?: Prim[];
  /** Side view only (magazines and grips pointing down). */
  side?: Prim[];
  /** Muzzle point (local x, y). */
  muzzle: [number, number];
}

const cap = (a: V3, b: V3, r: number, mat: Material, group: string, r2?: number): Prim => ({ k: 'cap', a, b, r, r2, mat, group });
const box = (x0: number, x1: number, cy: number, hw: number, cz: number, hz: number, mat: Material, group: string, bevel = 0.35): Prim => ({ k: 'box', c: [(x0 + x1) / 2, cy, cz], h: [(x1 - x0) / 2, hw, hz], mat, group, bevel });
const ell = (c: V3, r: V3, mat: Material, group: string): Prim => ({ k: 'ell', c, r, mat, group });
const ringed = (m: Material, every: number, from: number, to: number, off = -1): Material => ({ ...m, pattern: (c) => (c.x > from && c.x < to && Math.floor(c.x * every) % 2 === 0 ? off : null) });

/** A pistol grip angled down and back (side view; hidden under the hands from above). */
const pistolGrip = (x: number, mat: Material, len = 4.2, r = 1.05): Prim => cap([x, 0, -0.6], [x - 1.3, 0, -0.6 - len], r, mat, 'pgrip', r * 0.95);
/** Curved box magazine: folded out to the right in the top view, pointing down in the side view. */
const curvedMag = (x: number, mat: Material, len = 1, r = 0.92): { top: Prim[]; side: Prim[] } => ({
  top: [cap([x, 0.9, -0.4], [x + 1.6 * len, 3.5 * len, -0.8], r, mat, 'mag', r * 0.95)],
  side: [cap([x - 0.2, 0, -0.9], [x + 1.1 * len, 0, -4.0 * len], r * 1.05, mat, 'mag'), cap([x + 1.1 * len, 0, -4.0 * len], [x + 3.0 * len, 0, -6.6 * len], r, mat, 'mag')],
});
const straightMag = (x0: number, x1: number, mat: Material, depth = 4.2, out = 2.6): { top: Prim[]; side: Prim[] } => ({
  top: [box(x0, x1, out * 0.75, out * 0.45, -0.3, 0.6, mat, 'mag')],
  side: [box(x0, x1, 0, 0.9, -0.6 - depth / 2, depth / 2, mat, 'mag')],
});
const merge = (...parts: Array<{ top: Prim[]; side: Prim[] }>) => ({ top: parts.flatMap((p) => p.top), side: parts.flatMap((p) => p.side) });

/** Skeleton (wire) stock: two rails and a butt plate. */
function wireStock(x0: number, x1: number, half: number, mat: Material, butt: Material): Prim[] {
  return [cap([x0, -half, 0.4], [x1, -half, 0.1], 0.36, mat, 'stock'), cap([x0, half, 0.4], [x1, half, 0.1], 0.36, mat, 'stock'), cap([x1, -half - 0.3, 0.1], [x1, half + 0.3, 0.1], 0.55, butt, 'butt')];
}

const holed = (m: Material, x0: number, x1: number): Material => ({ ...m, pattern: (c) => (c.x > x0 && c.x < x1 && Math.abs(c.s) < 0.42 ? hex('#0c0806') : null) });

export const WEAPON_MODELS: Record<WeaponId, () => WeaponModel> = {
  // ── sidearms (pose «pistol»: both hands on the grip) ─────────────────────────
  pistol: () => ({
    prims: [box(0, 9.2, 0, 1.05, 0.5, 0.85, WMAT.gunmetal, 'slide', 0.45), box(0.6, 8.2, 0, 0.95, -0.55, 0.5, WMAT.gunmetal, 'frame'), box(0.3, 1.3, 0, 0.55, 1.4, 0.25, WMAT.gunmetal, 'sight'), pistolGrip(0.4, WMAT.bakelite)],
    side: [cap([1.2, 0, -1.1], [3.4, 0, -1.7], 0.3, WMAT.gunmetal, 'guard')],
    muzzle: [9.4, 0],
  }),
  pb: () => ({
    prims: [box(0, 7.4, 0, 1.05, 0.5, 0.85, WMAT.gunmetal, 'slide', 0.45), box(0.6, 7.0, 0, 0.95, -0.55, 0.5, WMAT.gunmetal, 'frame'), cap([6.8, 0, 0.4], [15.6, 0, 0.4], 1.12, ringed(WMAT.black, 1.1, 13.5, 15.6, 1), 'sil'), pistolGrip(0.4, WMAT.bakelite)],
    muzzle: [15.9, 0],
  }),
  nagan: () => ({
    prims: [box(-0.6, 3.4, 0, 1.0, 0.3, 0.85, WMAT.steel, 'frame'), cap([1.0, 0, 0.45], [4.0, 0, 0.45], 1.45, ringed(WMAT.steel, 1.6, 1.0, 4.0, -1), 'cyl'), cap([4.0, 0, 0.7], [12.6, 0, 0.7], 0.6, WMAT.steel, 'barrel'), box(11.8, 12.4, 0, 0.3, 1.3, 0.3, WMAT.steel, 'sight'), pistolGrip(-0.1, WMAT.walnut, 4.0, 1.12)],
    side: [ell([-0.8, 0, 1.4], [0.7, 0.4, 0.5], WMAT.steel, 'hammer')],
    muzzle: [12.8, 0],
  }),
  stechkin: () => ({
    prims: [box(0, 10.2, 0, 1.15, 0.5, 0.9, WMAT.gunmetal, 'slide', 0.45), box(0.6, 9.2, 0, 1.05, -0.6, 0.55, WMAT.gunmetal, 'frame'), ell([1.6, 1.15, 0.6], [0.6, 0.3, 0.4], WMAT.steel, 'selector'), pistolGrip(0.3, WMAT.bakelite, 5.2, 1.2)],
    side: [cap([1.1, 0, -1.2], [3.6, 0, -1.8], 0.3, WMAT.gunmetal, 'guard')],
    muzzle: [10.5, 0],
  }),
  mauser: () => ({
    prims: [box(-2.2, 4.6, 0, 1.15, 0.6, 0.95, WMAT.gunmetal, 'body', 0.4), cap([4.6, 0, 0.9], [14.8, 0, 0.9], 0.65, WMAT.gunmetal, 'barrel'), box(1.2, 4.4, 0, 0.9, -1.2, 1.3, WMAT.gunmetal, 'magwell'), ell([-2.4, 0, 1.3], [0.75, 0.5, 0.55], WMAT.steel, 'hammer'), cap([-1.2, 0, -0.6], [-3.1, 0, -4.9], 1.35, ringed(WMAT.walnut, 2.2, -4, 0, -1), 'pgrip')],
    muzzle: [15.0, 0],
  }),
  // ── melee (pose «melee»: one hand, swung around the right shoulder) ──────────
  montirovka: () => ({
    prims: [cap([-1.6, 0, 0.3], [13.65, 0, 0.5], 0.85, MAT.steel, 'shaft'), cap([11.1, 0, 0.5], [13.65, 0, 0.5], 0.9, MAT.redPaint, 'paint'), cap([13.65, 0, 0.5], [14.64, -2.88, 0.5], 0.85, MAT.redPaint, 'hook', 0.6)],
    muzzle: [14.2, -1.4],
  }),
  finka: () => ({
    prims: [
      cap([-2.6, 0, 0], [1.6, 0, 0], 0.95, { ...WMAT.ash, pattern: (c) => (Math.floor((c.x + 3) * 2.2) % 3 === 0 ? hex('#3a2416') : null) }, 'handle'),
      box(1.6, 2.3, 0, 1.45, 0.1, 0.45, WMAT.brass, 'guard'),
      box(2.3, 9.0, 0, 0.72, 0.1, 0.22, MAT.steel, 'blade', 0.3),
      ell([9.2, 0.1, 0.1], [1.4, 0.55, 0.22], MAT.steel, 'tip'),
    ],
    side: [box(2.3, 8.6, 0, 0.3, 0.0, 0.85, MAT.steel, 'blade2')],
    muzzle: [10, 0],
  }),
  bita: () => ({
    prims: [cap([-2.4, 0, 0], [17.5, 0, 0.2], 0.72, { ...WMAT.ash, pattern: (c) => (c.x < 2.6 ? hex(Math.floor(c.x * 3) % 2 ? '#1a1a20' : '#26262e') : null) }, 'bat', 1.75), ell([-2.7, 0, 0], [0.55, 1.05, 0.9], WMAT.ash, 'knob')],
    muzzle: [18, 0],
  }),
  lopata: () => ({
    prims: [cap([-2.4, 0, 0], [10.2, 0, 0], 0.75, WMAT.wood, 'handle'), box(9.6, 15.4, 0, 2.3, 0.1, 0.25, WMAT.oliveSteel, 'blade', 0.4), ell([15.3, 0, 0.1], [2.2, 2.3, 0.26], WMAT.oliveSteel, 'tip'), cap([9.0, 0, 0.1], [10.6, 0, 0.1], 0.95, MAT.steel, 'collar')],
    side: [box(9.6, 16.6, 0, 0.3, 0.0, 1.9, WMAT.oliveSteel, 'blade2')],
    muzzle: [17, 0],
  }),
  kuvalda: () => ({
    prims: [cap([-2.4, 0, 0], [14.2, 0, 0], 0.8, WMAT.ash, 'handle'), box(13.2, 16.8, 0, 3.4, 0.4, 1.6, { ...WMAT.black, pattern: (c) => (Math.abs(c.ly) > 3.0 ? 1 : null) }, 'head', 0.5)],
    side: [box(13.2, 16.8, 0, 1.6, 0.4, 3.0, WMAT.black, 'head2', 0.5)],
    muzzle: [17, 0],
  }),
  // ── primaries (pose «long»: right hand on the grip, left hand on the handguard ≈ x 8.5) ──
  obrez: () => ({
    prims: [
      cap([-4.6, 0, -0.5], [1.4, 0, 0.2], 1.4, WMAT.wood, 'stock', 1.15),
      box(-0.4, 2.6, 0, 1.3, 0.5, 1.0, MAT.steel, 'action'),
      cap([2.6, -0.85, 0.9], [15.0, -0.85, 0.9], 0.92, WMAT.gunmetal, 'barrelL'),
      cap([2.6, 0.85, 0.9], [15.0, 0.85, 0.9], 0.92, WMAT.gunmetal, 'barrelR'),
      cap([4.4, 0, 0.0], [9.2, 0, 0.0], 1.15, WMAT.wood, 'forend'),
    ],
    side: [cap([0.2, 0, -0.2], [2.4, 0, -1.4], 0.32, MAT.steel, 'guard')],
    muzzle: [15.3, 0],
  }),
  avtomat: () => akModel(WMAT.wood, WMAT.gunmetal, WMAT.bakelite, 1),
  zolotoy: () => akModel(WMAT.walnut, WMAT.gold, WMAT.gold, 1.12),
  uzi: () => ({
    prims: [box(-2.0, 9.0, 0, 1.5, 0.6, 1.4, WMAT.black, 'recv', 0.45), cap([9.0, 0, 0.9], [11.9, 0, 0.9], 0.62, WMAT.gunmetal, 'barrel'), ...wireStock(-2.4, 6.8, 1.75, MAT.steel, MAT.steel), ell([4.2, 0, 2.15], [0.6, 0.5, 0.4], WMAT.gunmetal, 'knob')],
    side: [cap([2.4, 0, -0.8], [1.4, 0, -6.6], 1.05, WMAT.polymer, 'pgrip'), cap([4.4, 0, -0.6], [4.2, 0, -2.0], 0.45, WMAT.black, 'guard')],
    muzzle: [12.1, 0],
  }),
  ksyuha: () => {
    const m = merge(curvedMag(2.4, WMAT.plum, 0.9, 0.85));
    return {
      prims: [...wireStock(-3.4, -9.4, 0.9, MAT.steel, WMAT.black), box(-3.4, 4.8, 0, 1.2, 0.3, 1.35, WMAT.gunmetal, 'recv', 0.45), cap([4.8, 0, 0.4], [8.6, 0, 0.4], 1.15, WMAT.plum, 'guard'), cap([8.6, 0, 0.7], [10.2, 0, 0.7], 0.6, WMAT.gunmetal, 'barrel'), cap([10.2, 0, 0.7], [12.7, 0, 0.7], 0.98, WMAT.gunmetal, 'booster', 0.8), pistolGrip(-0.4, WMAT.plum, 3.8, 0.95)],
      ...m,
      muzzle: [12.9, 0],
    };
  },
  toz: () => ({
    prims: [cap([-10.6, 0, -0.6], [-2.4, 0, 0.2], 1.38, WMAT.walnut, 'stock', 1.1), box(-2.4, 3.6, 0, 1.25, 0.4, 1.3, WMAT.black, 'recv', 0.4), cap([3.6, 0, 1.0], [20.6, 0, 1.0], 0.7, WMAT.gunmetal, 'barrel'), cap([3.6, 0, -0.4], [15.8, 0, -0.4], 0.62, WMAT.gunmetal, 'tube'), cap([6.4, 0, 0.1], [11.6, 0, 0.1], 1.28, ringed(WMAT.walnut, 1.5, 6.4, 11.6, -1), 'pump'), pistolGrip(-0.9, WMAT.walnut, 3.4, 1.0)],
    muzzle: [20.8, 0],
  }),
  mosinka: () => ({
    prims: [
      cap([-11.8, 0, -0.7], [-2.0, 0, 0.0], 1.38, WMAT.wood, 'stock', 1.0),
      cap([-2.0, 0, 0.0], [17.0, 0, 0.2], 1.0, WMAT.wood, 'fore', 0.82),
      box(-2.0, 3.6, 0, 0.95, 0.6, 1.2, WMAT.gunmetal, 'recv'),
      cap([3.6, 0, 0.95], [25.6, 0, 0.95], 0.52, WMAT.gunmetal, 'barrel'),
      cap([9.0, 0, 0.6], [9.8, 0, 0.6], 1.08, MAT.steel, 'band1'),
      cap([15.2, 0, 0.6], [16.0, 0, 0.6], 1.0, MAT.steel, 'band2'),
      cap([0.6, 0, 1.1], [1.0, 2.7, 0.7], 0.45, MAT.steel, 'bolt'),
      ell([1.0, 3.0, 0.7], [0.75, 0.75, 0.6], MAT.steel, 'knob'),
    ],
    muzzle: [25.8, 0],
  }),
  pkm: () => ({
    prims: [
      cap([-11.2, 0, -0.5], [-3.0, 0, 0.3], 1.25, holed(WMAT.wood, -9.4, -4.6), 'stock', 0.95),
      box(-3.0, 8.0, 0, 1.4, 0.5, 1.5, WMAT.gunmetal, 'recv', 0.45),
      cap([8.0, 0, 1.0], [23.6, 0, 1.0], 0.66, ringed(WMAT.gunmetal, 0.9, 9, 16, -1), 'barrel'),
      cap([22.8, 0, 1.0], [25.2, 0, 1.0], 0.82, WMAT.gunmetal, 'hider'),
      cap([8.0, 0, -0.3], [15.6, 0, -0.3], 0.5, WMAT.gunmetal, 'gas'),
      cap([7.4, 0, 2.3], [10.2, 0, 2.3], 0.38, WMAT.wood, 'handle'),
      pistolGrip(-0.6, WMAT.bakelite, 3.6, 1.0),
    ],
    top: [box(-1.2, 4.0, 2.7, 1.6, -0.9, 2.0, WMAT.olive, 'ammo', 0.5), cap([1.4, 1.3, 0.4], [1.4, 0.4, 0.7], 0.5, WMAT.brass, 'belt')],
    side: [box(-1.2, 4.0, 0, 1.6, -3.6, 2.2, WMAT.olive, 'ammo', 0.5)],
    muzzle: [25.4, 0],
  }),
  svd: () => {
    const m = straightMag(1.4, 3.6, WMAT.bakelite, 3.0, 2.4);
    return {
      prims: [
        cap([-11.2, 0, -0.6], [-3.0, 0, 0.2], 1.32, holed(WMAT.wood, -9.0, -4.8), 'stock', 1.0),
        box(-3.0, 4.0, 0, 1.15, 0.4, 1.3, WMAT.gunmetal, 'recv'),
        cap([4.0, 0, 0.5], [11.0, 0, 0.5], 1.1, { ...WMAT.wood, pattern: (c) => (c.x > 5 && c.x < 10 && Math.floor(c.x * 1.4) % 2 === 0 && Math.abs(c.s) < 0.3 ? hex('#1a0c06') : null) }, 'guard'),
        cap([11.0, 0, 0.8], [22.6, 0, 0.8], 0.5, WMAT.gunmetal, 'barrel'),
        cap([21.6, 0, 0.8], [23.6, 0, 0.8], 0.66, ringed(WMAT.gunmetal, 2, 21.6, 23.6, -1), 'hider'),
        cap([-1.6, -0.45, 2.7], [6.4, -0.45, 2.7], 0.9, WMAT.black, 'scope'),
        ell([-1.9, -0.45, 2.7], [0.6, 1.1, 1.0], WMAT.black, 'eyepiece'),
        ell([6.7, -0.45, 2.7], [0.45, 1.05, 1.0], { ...WMAT.black, pattern: (c) => (c.nx > 0.7 ? hex('#4a6a8a') : null) }, 'lens'),
        pistolGrip(-0.5, WMAT.bakelite, 3.6, 1.0),
      ],
      ...m,
      muzzle: [23.8, 0],
    };
  },
  rpg: () => ({
    prims: [
      cap([-10.8, 0, 0.6], [13.0, 0, 0.6], 1.25, WMAT.oliveSteel, 'tube'),
      cap([-12.4, 0, 0.6], [-10.4, 0, 0.6], 1.3, WMAT.oliveSteel, 'bell', 1.85),
      cap([1.0, 0, 0.6], [7.0, 0, 0.6], 1.62, ringed(WMAT.wood, 1.2, 1.0, 7.0, -1), 'shield'),
      cap([13.0, 0, 0.6], [16.6, 0, 0.6], 0.82, WMAT.olive, 'stem'),
      cap([13.4, -0.8, 0.6], [14.6, -2.2, 0.6], 0.3, WMAT.olive, 'fin'),
      cap([13.4, 0.8, 0.6], [14.6, 2.2, 0.6], 0.3, WMAT.olive, 'fin'),
      ell([19.4, 0, 0.6], [3.2, 2.2, 2.2], WMAT.olive, 'warhead'),
      cap([21.8, 0, 0.6], [24.0, 0, 0.6], 0.62, WMAT.olive, 'nose', 0.25),
      box(2.4, 5.0, -1.9, 0.6, 1.8, 0.6, WMAT.black, 'sight'),
    ],
    side: [cap([0.0, 0, -0.5], [-1.0, 0, -4.2], 0.95, WMAT.wood, 'pgrip'), cap([6.2, 0, -0.5], [5.6, 0, -3.8], 0.85, WMAT.wood, 'fgrip')],
    muzzle: [24.2, 0],
  }),
  val: () => {
    const m = straightMag(1.6, 3.6, WMAT.polymer, 3.2, 2.4);
    return {
      prims: [...wireStock(-3.0, -10.0, 0.85, MAT.steel, WMAT.rubber), box(-3.0, 5.0, 0, 1.2, 0.4, 1.35, WMAT.black, 'recv', 0.45), cap([5.0, 0, 0.6], [19.6, 0, 0.6], 1.15, ringed(WMAT.black, 0.7, 6, 19, 1), 'sil'), pistolGrip(-0.4, WMAT.polymer, 3.8, 1.0)],
      ...m,
      muzzle: [19.9, 0],
    };
  },
  sayga: () => {
    const m = straightMag(1.6, 4.8, WMAT.polymer, 3.8, 2.8);
    return {
      prims: [cap([-10.2, 0, -0.6], [-3.0, 0, 0.2], 1.32, WMAT.polymer, 'stock', 1.05), box(-3.0, 5.0, 0, 1.3, 0.35, 1.45, WMAT.black, 'recv', 0.45), cap([5.0, 0, 0.45], [10.6, 0, 0.45], 1.22, WMAT.polymer, 'guard'), cap([10.6, 0, 0.8], [17.6, 0, 0.8], 0.76, WMAT.gunmetal, 'barrel'), pistolGrip(-0.4, WMAT.polymer, 3.8, 1.0)],
      ...m,
      muzzle: [17.8, 0],
    };
  },
  tommy: () => ({
    prims: [
      cap([-11.2, 0, -0.5], [-3.0, 0, 0.2], 1.38, WMAT.walnut, 'stock', 1.0),
      box(-3.0, 6.0, 0, 1.2, 0.5, 1.4, WMAT.gunmetal, 'recv', 0.45),
      cap([6.0, 0, 0.8], [15.6, 0, 0.8], 0.92, ringed(WMAT.gunmetal, 2.2, 6.0, 15.6, -1), 'barrel'),
      cap([15.6, 0, 0.8], [17.4, 0, 0.8], 0.78, WMAT.gunmetal, 'comp'),
      ell([9.4, 0, -0.2], [1.1, 1.1, 0.8], WMAT.walnut, 'fgrip'),
      pistolGrip(-0.6, WMAT.walnut, 3.8, 1.05),
    ],
    top: [{ k: 'cyl', c: [2.4, 0, 0], r: 3.2, z0: -2.6, z1: -0.5, mat: { ...WMAT.gunmetal, pattern: (c) => (c.t > 0.86 ? 1 : c.t < 0.3 ? -1 : null) }, group: 'drum' }],
    side: [ell([2.4, 0, -3.0], [3.2, 1.2, 3.2], WMAT.gunmetal, 'drum'), cap([9.4, 0, -0.6], [8.9, 0, -3.9], 0.95, WMAT.walnut, 'vgrip')],
    muzzle: [17.6, 0],
  }),
  tulka: () => {
    const engraved = (m: Material): Material => ({ ...m, pattern: (c) => (Math.abs(Math.sin(c.x * 2.1 + c.y * 3.3)) < 0.12 ? hex('#e2b450') : null) });
    return {
      prims: [
        cap([-10.6, 0, -0.5], [-1.4, 0, 0.2], 1.36, engraved(WMAT.walnut), 'stock', 1.05),
        box(-1.4, 2.6, 0, 1.3, 0.5, 1.2, engraved(MAT.steel), 'action'),
        cap([2.6, -0.76, 0.85], [20.6, -0.76, 0.85], 0.72, WMAT.gunmetal, 'barrelL'),
        cap([2.6, 0.76, 0.85], [20.6, 0.76, 0.85], 0.72, WMAT.gunmetal, 'barrelR'),
        cap([3.0, 0, 0.0], [8.4, 0, 0.0], 1.25, WMAT.walnut, 'forend'),
      ],
      side: [cap([0.0, 0, -0.3], [2.2, 0, -1.4], 0.3, MAT.steel, 'guard')],
      muzzle: [20.8, 0],
    };
  },
  ognemet: () => ({
    prims: [
      cap([-9.0, 0, 0.2], [-2.0, 0, 0.9], 1.05, WMAT.wood, 'stock', 0.9),
      cap([-2.0, 0, 1.2], [14.2, 0, 1.2], 0.88, MAT.steel, 'tube'),
      cap([14.2, 0, 1.2], [16.2, 0, 1.2], 1.15, WMAT.brass, 'nozzle', 0.8),
      ell([16.8, 0, 1.3], [0.75, 0.6, 0.5], WMAT.ember, 'pilot'),
      cap([-6.6, 0.5, -0.6], [2.6, 0.5, -0.6], 2.35, { ...WMAT.red, pattern: (c) => (Math.abs(c.x + 2) < 0.4 ? hex('#2a0806') : null) }, 'tank'),
      cap([2.6, 1.6, -0.2], [4.4, 0.6, 1.0], 0.5, WMAT.rubber, 'hose'),
    ],
    side: [pistolGrip(-0.8, WMAT.wood, 3.4, 1.0)],
    muzzle: [17.0, 0],
  }),
  arbalet: () => ({
    prims: [
      box(-8.6, 10.2, 0, 1.0, 0.2, 0.9, { ...WMAT.walnut, pattern: (c) => (Math.abs(c.ly) < 0.28 && c.x > 1.4 ? hex('#1a0c06') : null) }, 'stock', 0.4),
      cap([-10.4, 0, -0.3], [-7.4, 0, 0.0], 1.42, WMAT.walnut, 'butt'),
      cap([10.0, 0, 0.8], [7.8, -7.6, 0.8], 0.62, WMAT.black, 'limbL', 0.36),
      cap([10.0, 0, 0.8], [7.8, 7.6, 0.8], 0.62, WMAT.black, 'limbR', 0.36),
      cap([7.8, -7.6, 1.0], [1.6, 0, 1.15], 0.2, WMAT.string, 'stringL'),
      cap([7.8, 7.6, 1.0], [1.6, 0, 1.15], 0.2, WMAT.string, 'stringR'),
      cap([1.6, 0, 1.35], [13.0, 0, 1.35], 0.3, WMAT.ash, 'bolt'),
      ell([13.3, 0, 1.35], [0.8, 0.42, 0.32], MAT.steel, 'head'),
      ell([2.5, 0, 1.45], [1.05, 0.62, 0.22], WMAT.red, 'fletch'),
    ],
    side: [pistolGrip(-0.4, WMAT.walnut, 3.6, 1.0)],
    muzzle: [13.6, 0],
  }),
  gvozdomet: () => ({
    prims: [
      box(-3.0, 8.0, 0, 1.6, 0.7, 1.8, { ...WMAT.yellow, pattern: (c) => (c.x > -2.6 && c.x < 0 && Math.floor((c.x + c.y) * 1.2) % 2 === 0 ? hex('#16120c') : null) }, 'body', 0.6),
      cap([8.0, 0, 0.4], [11.6, 0, 0.1], 0.82, WMAT.black, 'nose', 0.5),
      cap([-3.0, 0, 0.2], [-6.2, 0.6, -0.6], 0.6, WMAT.red, 'hose'),
      pistolGrip(-0.8, WMAT.rubber, 3.8, 1.05),
    ],
    top: [box(-1.4, 5.4, 2.1, 0.62, -0.4, 0.45, ringed(WMAT.gunmetal, 3, -1.4, 5.4, 1), 'nails')],
    side: [box(-0.6, 6.8, 0, 0.6, -3.0, 0.8, ringed(WMAT.gunmetal, 3, -0.6, 6.8, 1), 'nails')],
    muzzle: [11.8, 0],
  }),
  muha: () => ({
    prims: [
      cap([-10.0, 0, 0.6], [15.0, 0, 0.6], 1.12, { ...WMAT.olive, pattern: (c) => (Math.abs(c.x - 12.6) < 0.5 ? hex('#c89a2a') : null) }, 'tube'),
      cap([-10.6, 0, 0.6], [-9.4, 0, 0.6], 1.24, WMAT.black, 'capR'),
      cap([14.6, 0, 0.6], [15.8, 0, 0.6], 1.24, WMAT.black, 'capF'),
      box(3.0, 4.0, 0, 0.6, 1.9, 0.5, WMAT.black, 'sight1'),
      box(9.2, 10.0, 0, 0.6, 1.9, 0.5, WMAT.black, 'sight2'),
      cap([0, -1.1, 1.5], [5.0, -1.1, 1.5], 0.4, WMAT.black, 'trigger'),
    ],
    top: [cap([-8.4, 1.2, 0.6], [12.4, 1.2, 0.6], 0.28, { ramp: H('#2e2618', '#4a3e26', '#62543a') }, 'strap')],
    muzzle: [16.0, 0],
  }),
  granatomet: () => ({
    prims: [
      ...wireStock(-3.0, -9.6, 0.9, MAT.steel, WMAT.rubber),
      box(-3.0, 6.0, 0, 1.4, 0.5, 1.5, WMAT.black, 'body', 0.5),
      cap([6.0, 0, 0.0], [14.6, 0, 0.0], 1.42, ringed(WMAT.gunmetal, 0.8, 12.6, 14.6, 1), 'barrel'),
      cap([-1.0, 0, 1.8], [12.0, 0, 1.8], 1.15, WMAT.black, 'magtube'),
      pistolGrip(-0.4, WMAT.polymer, 3.8, 1.05),
    ],
    muzzle: [14.8, 0],
  }),
};

function akModel(woodM: Material, metal: Material, magM: Material, magLen: number): WeaponModel {
  const m = curvedMag(2.4, magM, magLen, 0.92);
  return {
    prims: [
      cap([-10.6, 0, -0.6], [-3.5, 0, 0.0], 1.3, woodM, 'stock', 1.05),
      box(-3.5, 5.2, 0, 1.25, 0.3, 1.4, metal, 'recv', 0.45),
      cap([5.2, 0, 0.4], [11.2, 0, 0.4], 1.15, woodM, 'guard'),
      cap([5.4, 0, 1.6], [10.2, 0, 1.6], 0.5, woodM, 'gas'),
      cap([11.2, 0, 0.7], [19.0, 0, 0.7], 0.55, metal, 'barrel'),
      box(16.8, 17.8, 0, 0.45, 1.0, 0.9, metal, 'sight'),
      cap([18.6, 0, 0.7], [19.8, 0, 0.7], 0.72, metal, 'brake'),
      pistolGrip(-0.4, magM === WMAT.gold ? woodM : WMAT.bakelite, 3.8, 1.0),
    ],
    ...m,
    muzzle: [20.0, 0],
  };
}

// ── View transforms ─────────────────────────────────────────────────────────

/** Top-down prims of a weapon (local space). */
export function topPrims(id: WeaponId): Prim[] {
  const m = WEAPON_MODELS[id]();
  return [...m.prims, ...(m.top ?? [])];
}

/** Side view: the weapon's right side, muzzle to the right, top up (model z → image up, model y → depth). */
export function sidePrims(id: WeaponId): Prim[] {
  const m = WEAPON_MODELS[id]();
  const out: Prim[] = [];
  for (const p of [...m.prims, ...(m.side ?? [])]) {
    switch (p.k) {
      case 'cap':
        out.push({ ...p, a: [p.a[0], -p.a[2], p.a[1]], b: [p.b[0], -p.b[2], p.b[1]] });
        break;
      case 'ell': {
        const yaw = p.yaw ?? 0;
        const rx = Math.sqrt((p.r[0] * Math.cos(yaw)) ** 2 + (p.r[1] * Math.sin(yaw)) ** 2);
        out.push({ k: 'ell', c: [p.c[0], -p.c[2], p.c[1]], r: [rx, p.r[2], p.r[1]], mat: p.mat, group: p.group });
        break;
      }
      case 'box': {
        const yaw = p.yaw ?? 0;
        const hx = Math.abs(p.h[0] * Math.cos(yaw)) + Math.abs(p.h[1] * Math.sin(yaw));
        out.push({ k: 'box', c: [p.c[0], -p.c[2], p.c[1]], h: [hx, p.h[2], p.h[1]], mat: p.mat, group: p.group, bevel: p.bevel });
        break;
      }
      case 'cyl':
        out.push({ k: 'box', c: [p.c[0], -(p.z0 + p.z1) / 2, p.c[1]], h: [p.r, (p.z1 - p.z0) / 2, p.r], mat: p.mat, group: p.group, bevel: p.bevel });
        break;
      case 'poly':
        break;
    }
  }
  return out;
}

/** Rotates and translates prims in the xy plane (pickups lying at an angle). */
export function transformPrims(prims: Prim[], angle: number, dx: number, dy: number, dz = 0): Prim[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const P = (v: V3): V3 => [v[0] * c - v[1] * s + dx, v[0] * s + v[1] * c + dy, v[2] + dz];
  return prims.map((p): Prim => {
    switch (p.k) {
      case 'cap':
        return { ...p, a: P(p.a), b: P(p.b) };
      case 'ell':
        return { ...p, c: P(p.c), yaw: (p.yaw ?? 0) + angle };
      case 'box':
        return { ...p, c: P(p.c), yaw: (p.yaw ?? 0) + angle };
      case 'cyl': {
        const q = P([p.c[0], p.c[1], 0]);
        return { ...p, c: [q[0], q[1], p.c[2]], z0: p.z0 + dz, z1: p.z1 + dz };
      }
      case 'poly':
        return { ...p, pts: p.pts.map(([x, y]) => { const q = P([x, y, 0]); return [q[0], q[1]] as [number, number]; }), z: p.z + dz };
    }
  });
}

/** Local-space bounding box (x0, y0, x1, y1) of the top-down model. */
export function topBounds(id: WeaponId): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number, r: number) => {
    x0 = Math.min(x0, x - r);
    y0 = Math.min(y0, y - r);
    x1 = Math.max(x1, x + r);
    y1 = Math.max(y1, y + r);
  };
  for (const p of topPrims(id)) {
    if (p.k === 'cap') {
      add(p.a[0], p.a[1], Math.max(p.r, p.r2 ?? p.r));
      add(p.b[0], p.b[1], Math.max(p.r, p.r2 ?? p.r));
    } else if (p.k === 'ell') add(p.c[0], p.c[1], Math.max(p.r[0], p.r[1]));
    else if (p.k === 'box') {
      add(p.c[0] - p.h[0], p.c[1] - p.h[1], 0);
      add(p.c[0] + p.h[0], p.c[1] + p.h[1], 0);
    } else if (p.k === 'cyl') add(p.c[0], p.c[1], p.r);
  }
  return [x0, y0, x1, y1];
}

// ── Canonical grips of the torso poses ──────────────────────────────────────

export type PoseClass = WeaponPose;

export interface Grip {
  /** Weapon origin in body space (world px) and its rotation. */
  x: number;
  y: number;
  z: number;
  rot: number;
  right: V3;
  left: V3 | null;
}

/** Barrel direction of the long pose (the classic rifle hold: muzzle on the aim line, stock at the right shoulder). */
const LONG_ANGLE = Math.atan2(1.9 - 5.4, 28 - 5.5);
/** Melee weapons point from the hand slightly outward. */
const MELEE_ANGLE = Math.atan2(2.0, 13.5);

function rot2(x: number, y: number, a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

export function poseGrip(pose: PoseClass, o: PoseOffsets, recoil: number, tilt: number, lower: number, swing: number): Grip {
  const z = 11.2 + o.dz - lower;
  if (pose === 'melee') {
    const shx = -0.2 + o.dx;
    const shy = 8.6 + o.dy;
    const [hx, hy] = rot2(8.5, 1.5, swing);
    return { x: shx + hx, y: shy + hy, z, rot: swing + MELEE_ANGLE, right: [shx + hx, shy + hy, z], left: null };
  }
  const [gx, gy] = pose === 'pistol' ? [11.5, 0.8] : [9, 5];
  const tf = (x: number, y: number): [number, number] => {
    const [rx, ry] = rot2(x - gx, y - gy, tilt);
    return [rx + gx - recoil + o.dx, ry + gy + o.dy];
  };
  const [ox, oy] = tf(gx, gy);
  if (pose === 'pistol') {
    const [rx, ry] = tf(11.6, 1.7);
    const [lx, ly] = tf(11.2, -0.6);
    return { x: ox, y: oy, z, rot: tilt, right: [rx, ry, z], left: [lx, ly, z - 0.2] };
  }
  const [rx, ry] = tf(9, 5.2);
  const [lx, ly] = tf(17.2, 2.2);
  return { x: ox, y: oy, z, rot: LONG_ANGLE + tilt, right: [rx, ry, z], left: [lx, ly, z] };
}

/** The shop/HUD side view frames a weapon by its silhouette; top-down muzzle in body space at rest. */
export function muzzleAtRest(id: WeaponId, grip: Grip): { forward: number; side: number } {
  const m = WEAPON_MODELS[id]().muzzle;
  const [mx, my] = rot2(m[0], m[1], grip.rot);
  return { forward: Math.round((grip.x + mx) * 100) / 100, side: Math.round((grip.y + my) * 100) / 100 };
}

// ── Other sprites: first-aid kit, rockets, grenades ─────────────────────────

export function medkitPrims(): Prim[] {
  const cross = (c: { x: number; y: number }) => (Math.abs(c.x) < 1.15 && Math.abs(c.y) < 3.3) || (Math.abs(c.y) < 1.15 && Math.abs(c.x) < 3.3);
  return [
    box(-6, 6, 0, 4.4, 1.6, 1.6, { ...WMAT.enamel, pattern: (c) => (cross(c) ? hex(c.x + c.y < 0 ? '#e0402c' : '#b8241a') : Math.abs(Math.abs(c.x) - 5.2) < 0.3 ? -1 : null) }, 'box', 0.7),
    cap([-2.2, -4.6, 2.6], [2.2, -4.6, 2.6], 0.55, WMAT.rubber, 'handle'),
    box(-6.2, -5.4, 0, 4.5, 1.0, 1.0, MAT.steel, 'hinge', 0.3),
  ];
}

export function rocketPrims(kind: 'rocket' | 'grenade'): Prim[] {
  if (kind === 'grenade') return [cap([-2.2, 0, 0], [1.4, 0, 0], 1.05, WMAT.olive, 'shell'), ell([1.7, 0, 0], [1.1, 1.0, 1.0], WMAT.brass, 'fuse')];
  return [
    cap([-6.0, 0, 0], [-1.0, 0, 0], 0.75, WMAT.olive, 'stem'),
    cap([-5.6, -0.6, 0], [-4.4, -2.0, 0], 0.28, WMAT.olive, 'fin'),
    cap([-5.6, 0.6, 0], [-4.4, 2.0, 0], 0.28, WMAT.olive, 'fin'),
    ell([1.6, 0, 0], [3.0, 2.0, 2.0], WMAT.olive, 'warhead'),
    cap([3.8, 0, 0], [5.8, 0, 0], 0.55, WMAT.olive, 'nose', 0.22),
  ];
}
