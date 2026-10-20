/**
 * Top-down rigs of the nine shop characters, re-modelled from the product owner's sheets
 * (references/08…16): outfit, palette, head shape and accessories as seen from straight above.
 * Same conventions as characters.ts: facing +x, y+ = right side, z up, world px.
 */
import { hex } from './lib/raster.js';
import type { RGBA } from './lib/raster.js';
import type { Material, Prim, V3, PatternCtx } from './lib/model.js';
import { MAT } from './materials.js';
import type { Rig, PoseOffsets } from './characters.js';

const H = (...c: string[]): RGBA[] => c.map((x) => hex(x));

/** z of an ellipsoid's top surface at offset (dx, dy) from its centre, plus `lift`. */
export function surf(c: V3, r: V3, dx: number, dy: number, lift = 0): number {
  const t = 1 - (dx / r[0]) ** 2 - (dy / r[1]) ** 2;
  return c[2] + r[2] * Math.sqrt(Math.max(0, t)) + lift;
}

export const scales = (base: RGBA[], step = 1.2, light?: RGBA): Material => ({
  ramp: base,
  pattern: (c: PatternCtx) => {
    const u = c.x * step + (Math.floor(c.y * step) % 2) * 0.5;
    const v = c.y * step;
    const fu = u - Math.floor(u);
    const fv = v - Math.floor(v);
    if (light && (Math.floor(c.x * 0.7) * 7 + Math.floor(c.y * 0.7) * 3) % 11 === 0) return light;
    return fu < 0.18 || fv < 0.12 ? -1 : null;
  },
});

export const fur = (ramp: RGBA[]): Material => ({ ramp, dither: true });

// ── shared outfit pieces ────────────────────────────────────────────────────
export const WHITE = hex('#ece6da');
export const WHITE_SH = hex('#a9a296');
export const SHADES: Material = { ramp: H('#040506', '#0a0c10', '#141820', '#202634'), spec: { color: hex('#9aaccc'), power: 18, threshold: 0.82 } };
const CHAIN: Material = { ...MAT.gold, pattern: (c) => (Math.floor(c.t * 3) % 2 ? 0.7 : null) };
const BLACK_CLOTH = H('#08080a', '#121215', '#1d1d22', '#2b2b32', '#3e3e48');

/** Two white stripes over each shoulder (tracksuit), running front to back. */
export const shoulderStripes = (c: PatternCtx, from = 6.0): RGBA | null => {
  const ay = Math.abs(c.ly);
  if ((ay > from && ay < from + 1.0) || (ay > from + 1.8 && ay < from + 2.8)) return c.nz > 0.5 ? WHITE : WHITE_SH;
  return null;
};
/** A white stripe down each side of a tracksuit sleeve (capsule lateral coordinate). */
export const sleeveStripes = (c: PatternCtx): RGBA | number | null => {
  const s = Math.abs(c.s);
  return s > 0.35 && s < 1.0 ? WHITE : s >= 1.0 && s < 1.25 ? -1 : null;
};
/** White side stripe on tracksuit trousers. */
export const legStripe = (c: PatternCtx): RGBA | null => (Math.abs(c.s) > 1.0 && Math.abs(c.s) < 1.5 ? WHITE : null);

/** Gold chain around the front of the neck with a pendant on the chest. */
export function goldChain(p: Prim[], o: PoseOffsets, rx = 5.4, ry = 5.7, z = 13.6, pendant = 1.2, cx = 0.6) {
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a0 = -1.8 + (3.6 * i) / N;
    const a1 = -1.8 + (3.6 * (i + 1)) / N;
    const zA = z + o.dz - Math.abs(Math.sin(a0)) * 0.6;
    const zB = z + o.dz - Math.abs(Math.sin(a1)) * 0.6;
    p.push({ k: 'cap', a: [cx + Math.cos(a0) * rx + o.dx, Math.sin(a0) * ry + o.dy, zA], b: [cx + Math.cos(a1) * rx + o.dx, Math.sin(a1) * ry + o.dy, zB], r: 0.7, mat: CHAIN, group: 'chain' });
  }
  if (pendant > 0) p.push({ k: 'ell', c: [cx + rx + 0.9 + o.dx, o.dy, z - 0.7 + o.dz], r: [pendant, pendant * 0.9, 0.6], mat: MAT.gold, group: 'pendant' });
}

/** Sunglasses pushed up onto the crown (dx: offset along the head, spread: lens distance from the midline). */
export function shadesOnHead(p: Prim[], hc: V3, hr: V3, dx: number, spread: number, lens = 1.35, frame: Material = MAT.gold) {
  for (const s of [-1, 1]) {
    const z = surf(hc, hr, dx, s * spread, 0.35);
    p.push({ k: 'ell', c: [hc[0] + dx, hc[1] + s * spread, z], r: [lens * 0.9, lens * 1.12, 0.5], mat: SHADES, group: 'shades' });
  }
  const zb = surf(hc, hr, dx, 0, 0.5);
  p.push({ k: 'cap', a: [hc[0] + dx + 0.2, hc[1] - spread + lens * 0.8, zb], b: [hc[0] + dx + 0.2, hc[1] + spread - lens * 0.8, zb], r: 0.24, mat: frame, group: 'shades' });
  for (const s of [-1, 1]) {
    const y0 = s * (spread + lens * 1.0);
    const y1 = s * hr[1] * 0.92;
    p.push({ k: 'cap', a: [hc[0] + dx, hc[1] + y0, surf(hc, hr, dx, y0, 0.3)], b: [hc[0] + dx - 3.2, hc[1] + y1, surf(hc, hr, dx - 3.2, y1, 0.15)], r: 0.2, mat: frame, group: 'shades' });
  }
}

/** Sunglasses worn over the eyes (front of the head). */
export function shadesOnEyes(p: Prim[], hc: V3, hr: V3, dx: number, spread: number, lens = 1.3) {
  for (const s of [-1, 1]) {
    const z = surf(hc, hr, dx, s * spread, 0.25);
    p.push({ k: 'ell', c: [hc[0] + dx, hc[1] + s * spread, z], r: [lens * 0.8, lens * 1.1, 0.55], mat: SHADES, group: 'shades' });
  }
  const zb = surf(hc, hr, dx, 0, 0.35);
  p.push({ k: 'cap', a: [hc[0] + dx, hc[1] - spread + lens * 0.8, zb], b: [hc[0] + dx, hc[1] + spread - lens * 0.8, zb], r: 0.24, mat: MAT.black, group: 'shades' });
}

/** Aviator goggles on the forehead: round lenses in metal rims + a strap round the back of the head. */
function goggles(p: Prim[], hc: V3, hr: V3, dx: number, spread: number, lens: number, strap: Material) {
  const rim: Material = { ramp: H('#2a2a2e', '#4a4a52', '#76767e', '#a8a8b0'), spec: { color: hex('#f0f0f8'), power: 16, threshold: 0.8 } };
  for (const s of [-1, 1]) {
    const z = surf(hc, hr, dx, s * spread, 0.45);
    p.push({ k: 'ell', c: [hc[0] + dx, hc[1] + s * spread, z], r: [lens, lens, 0.8], mat: rim, group: 'goggles' });
    p.push({ k: 'ell', c: [hc[0] + dx + 0.1, hc[1] + s * spread, z + 0.35], r: [lens * 0.7, lens * 0.7, 0.6], mat: SHADES, group: 'goggles' });
  }
  const N = 7;
  for (let i = 0; i < N; i++) {
    const a0 = Math.PI * 0.42 + (Math.PI * 1.16 * i) / N;
    const a1 = Math.PI * 0.42 + (Math.PI * 1.16 * (i + 1)) / N;
    const pt = (a: number): V3 => {
      const x = Math.cos(a) * hr[0] * 0.98;
      const y = Math.sin(a) * hr[1] * 0.98;
      return [hc[0] + x + dx * 0.3, hc[1] + y, surf(hc, hr, x * 0.92, y * 0.92, 0.1) - 0.4];
    };
    p.push({ k: 'cap', a: pt(a0), b: pt(a1), r: 0.45, mat: strap, group: 'strap' });
  }
}

/** Cigar (or cigarette) from `a` along direction (dx, dy), with a glowing tip. */
export function cigar(p: Prim[], a: V3, dx: number, dy: number, len = 3.6, r = 0.75, mat: Material = { ramp: H('#2a1408', '#4a2610', '#6a3a1a', '#8a5226') }) {
  const l = Math.hypot(dx, dy) || 1;
  const b: V3 = [a[0] + (dx / l) * len, a[1] + (dy / l) * len, a[2]];
  p.push({ k: 'cap', a, b, r, mat, group: 'cigar' });
  p.push({ k: 'ell', c: [b[0] + (dx / l) * 0.3, b[1] + (dy / l) * 0.3, b[2] + 0.1], r: [r * 0.85, r * 0.85, r * 0.7], mat: MAT.ember, group: 'ember' });
}

/** Backpack on the back with two shoulder straps. */
export function backpack(p: Prim[], o: PoseOffsets, rig: { torsoC: V3; torsoR: V3 }, mat: Material, strap: Material, size: V3 = [2.4, 4.8, 3.0]) {
  const x = rig.torsoC[0] - rig.torsoR[0] + 0.6;
  const z = rig.torsoC[2] + 1.6;
  p.push({ k: 'box', c: [x + o.dx, o.dy, z + o.dz], h: size, yaw: o.yaw, mat, group: 'pack', bevel: 1.0 });
  p.push({ k: 'box', c: [x - size[0] * 0.8 + o.dx, o.dy, z - 0.8 + o.dz], h: [1.0, size[1] * 0.75, size[2] * 0.6], yaw: o.yaw, mat, group: 'packpocket', bevel: 0.6 });
  for (const s of [-1, 1]) {
    const y = s * 3.4;
    p.push({ k: 'cap', a: [x + 1.6 + o.dx, y + o.dy, z + size[2] - 0.2 + o.dz], b: [rig.torsoC[0] + 1.6 + o.dx, s * 4.2 + o.dy, rig.torsoC[2] + rig.torsoR[2] - 0.2 + o.dz], r: 0.55, mat: strap, group: 'strap' + s });
  }
}

/** Pouches of a tactical vest on the front of the shoulders (visible around the head from above). */
export function pouches(p: Prim[], o: PoseOffsets, rig: { torsoC: V3; torsoR: V3 }, mat: Material, spots: Array<[number, number]>) {
  for (const [x, y] of spots) {
    const z = surf(rig.torsoC, rig.torsoR, x - rig.torsoC[0], y, -0.2);
    p.push({ k: 'box', c: [x + o.dx, y + o.dy, z + o.dz], h: [1.05, 1.15, 0.9], yaw: o.yaw, mat, group: 'pouch', bevel: 0.35 });
  }
}

// ── Карлыч «Информатор» — raven, worn leather jacket, red shirt, gold chain, tape player ──────
const RAVEN = H('#030304', '#09090c', '#111216', '#1a1c22', '#292c35');
const RAVEN_LEATHER: Material = { ramp: H('#0b0807', '#16110e', '#231a15', '#33261e', '#48382c'), spec: { color: hex('#b8a08a'), power: 10, threshold: 0.74 } };
const DARK_RED = H('#3a080a', '#5e0e12', '#86161a', '#a82420', '#c83a30');
const vorona: Rig = {
  id: 'vorona',
  torsoC: [-0.2, 0, 8.3],
  torsoR: [5.7, 11.0, 5.3],
  shoulderY: 8.6,
  shoulderZ: 11.5,
  armR: 2.4,
  headC: [0.4, 0, 15.0],
  hipY: 4.1,
  footR: [2.6, 1.5, 1.1],
  toes: true,
  pal: {
    torso: {
      ...RAVEN_LEATHER,
      pattern: (c) => {
        // open jacket front: red shirt
        if (c.lx > 1.0 && Math.abs(c.ly) < 3.6 - (c.lx - 1.0) * 0.25) return hex(c.nz > 0.6 ? '#a82420' : '#6e1014');
        // worn creases on the leather
        if (Math.abs(((c.x * 0.8 + c.y * 0.35 + 40) % 2.6) - 1.3) < 0.08) return 0.7;
        return null;
      },
    },
    sleeve: { ...RAVEN_LEATHER, pattern: (c) => (c.t > 0.84 && c.t < 0.94 ? hex('#160f0c') : Math.abs(((c.t * 7) % 1) - 0.5) < 0.05 ? 0.7 : null) },
    hand: { ramp: H('#050507', '#0d0e13', '#191c26', '#2a3040') },
    pants: { ramp: H('#0a0a0e', '#141419', '#202028', '#30303a') },
    shoe: { ramp: H('#06060a', '#101014', '#1c1c22', '#2c2c34') },
  },
  torsoExtras(p, o) {
    // red shirt collar around the neck, then the wide leather collar flaps
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [-1.2 + o.dx, s * 6.2 + o.dy, 12.6 + o.dz], r: [3.6, 2.0, 1.5], yaw: s * 0.7 + o.yaw, mat: RAVEN_LEATHER, group: 'collar' + s });
    p.push({ k: 'ell', c: [1.6 + o.dx, o.dy, 13.0 + o.dz], r: [5.2, 6.4, 1.6], yaw: o.yaw, mat: { ramp: DARK_RED, pattern: (c) => (c.lx > 3.0 && Math.abs(c.ly) < 1.0 ? hex('#3a080a') : null) }, group: 'shirt' });
    goldChain(p, o, 5.5, 5.9, 13.7, 0);
    // cassette player on a strap over the right shoulder, hanging at the left of the chest
    p.push({ k: 'cap', a: [-3.0 + o.dx, 6.6 + o.dy, 13.4 + o.dz], b: [3.6 + o.dx, -6.4 + o.dy, 12.2 + o.dz], r: 0.45, mat: { ramp: H('#0a0a0c', '#18181c', '#26262c') }, group: 'tapestrap' });
    p.push({ k: 'box', c: [4.4 + o.dx, -7.2 + o.dy, 11.0 + o.dz], h: [1.8, 2.6, 1.1], yaw: 0.25 + o.yaw, mat: { ramp: H('#1a1a1e', '#2e2e34', '#46464e', '#62626c'), spec: { color: hex('#d0d4e0'), power: 14, threshold: 0.84 }, pattern: (c) => (Math.abs(c.ly) < 1.6 && c.lx > -0.6 && c.lx < 0.7 ? hex('#7a1a16') : null) }, group: 'tape', bevel: 0.4 });
  },
  head(p, o) {
    const hc: V3 = [0.4 + o.dx, o.dy, 15.0 + o.dz];
    const hr: V3 = [4.7, 4.3, 4.0];
    const feathers: Material = { ramp: RAVEN, dither: true, spec: { color: hex('#5a6684'), power: 9, threshold: 0.86 } };
    p.push({ k: 'ell', c: hc, r: hr, mat: feathers, group: 'head' });
    // ruffled feather tufts at the back of the head
    for (const [y, l] of [
      [-1.4, 1.8],
      [0, 2.4],
      [1.4, 1.8],
    ] as const)
      p.push({ k: 'cap', a: [hc[0] - 2.6, hc[1] + y * 0.6, hc[2] + 2.4], b: [hc[0] - 2.6 - l, hc[1] + y, hc[2] + 2.0], r: 0.8, r2: 0.3, mat: feathers, group: 'tuft' });
    // big charcoal beak with a lighter hooked tip
    p.push({ k: 'cap', a: [hc[0] + 2.4, hc[1], hc[2] + 0.4], b: [hc[0] + 10.6, hc[1], hc[2] - 0.6], r: 2.3, r2: 0.55, mat: { ramp: H('#16161a', '#2a2a30', '#43434b', '#62626c', '#8e8e98'), spec: { color: hex('#e0e4f0'), power: 14, threshold: 0.82 } }, group: 'beak' });
    p.push({ k: 'ell', c: [hc[0] + 10.4, hc[1], hc[2] - 1.0], r: [0.9, 0.55, 0.6], mat: { ramp: H('#5a5a64', '#8a8a96') }, group: 'beak' });
    // amber eyes
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 2.2, s * 3.0, 0.15);
      p.push({ k: 'ell', c: [hc[0] + 2.2, hc[1] + s * 3.0, z], r: [0.75, 0.62, 0.55], mat: { ramp: H('#f08a1a'), flat: true }, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] + 2.45, hc[1] + s * 3.0, z + 0.25], r: [0.38, 0.34, 0.45], mat: MAT.eyeDark, group: 'eye' });
    }
  },
  tail(p, o) {
    const m: Material = { ramp: RAVEN, spec: { color: hex('#4a5672'), power: 9, threshold: 0.9 } };
    for (const [y, l] of [
      [-1.6, 11.0],
      [0, 12.4],
      [1.6, 11.0],
    ] as const)
      p.push({ k: 'cap', a: [-5.2, y * 0.6, 7.0], b: [-l, y * 1.8 + o.sway * 0.6, 6.8], r: 1.3, r2: 0.7, mat: m, group: 'tail' });
  },
};

// ── Сонька «Искусительница» — olive python, red tracksuit, shades on the head, gold $ chain ────
const PYTHON = H('#141c0a', '#243014', '#3a4a20', '#566a32', '#7a8e4a');
const pythonSkin: Material = {
  ramp: PYTHON,
  pattern: (c) => {
    // dark blotches with lighter edges + fine scale grid
    const gx = c.x * 0.42 + (Math.floor(c.y * 0.42) % 2) * 0.5;
    const gy = c.y * 0.42;
    const d = (gx - Math.round(gx)) ** 2 + (gy - Math.round(gy)) ** 2;
    if (d < 0.06) return hex('#121808');
    if (d < 0.1) return hex('#a8a05a');
    const u = c.x * 1.6 + (Math.floor(c.y * 1.6) % 2) * 0.5;
    return u - Math.floor(u) < 0.14 ? -1 : null;
  },
};
export const TRACK_RED = H('#3a080c', '#68101a', '#9a1a24', '#c4282c', '#e2483e');
const zmeya: Rig = {
  id: 'zmeya',
  torsoC: [-0.2, 0, 8.3],
  torsoR: [5.5, 10.6, 5.2],
  shoulderY: 8.3,
  shoulderZ: 11.4,
  armR: 2.25,
  headC: [0.6, 0, 15.0],
  hipY: 3.9,
  footR: [2.6, 1.4, 1.1],
  pal: {
    torso: {
      ramp: TRACK_RED,
      pattern: (c) => {
        if (c.lx > 1.6 && Math.abs(c.ly) < 2.8) return hex('#141416'); // black tee at the open zip
        if (c.lx > 1.4 && Math.abs(Math.abs(c.ly) - 3.0) < 0.22) return WHITE_SH; // zip edges
        return shoulderStripes(c);
      },
    },
    sleeve: { ramp: TRACK_RED, pattern: sleeveStripes },
    hand: scales(PYTHON, 2.2),
    pants: { ramp: H('#0c0c10', '#16161c', '#222228', '#323238') },
    shoe: { ramp: H('#1c1c20', '#2e2e34', '#ccc6b8', '#ece6da') },
  },
  torsoExtras(p, o) {
    p.push({ k: 'ell', c: [1.4 + o.dx, o.dy, 12.8 + o.dz], r: [4.6, 5.6, 1.6], yaw: o.yaw, mat: { ramp: TRACK_RED, pattern: (c) => (Math.sqrt((c.lx / 4.6) ** 2 + (c.ly / 5.6) ** 2) > 0.82 ? WHITE : null) }, group: 'collar' });
    goldChain(p, o, 5.3, 5.5, 13.7, 1.2);
    backpack(p, o, zmeya, { ramp: H('#2a1608', '#44260e', '#623a18', '#7e5024') }, { ramp: H('#1a0e06', '#2e1a0c', '#46280e') }, [2.2, 4.2, 2.6]);
  },
  head(p, o) {
    const hc: V3 = [0.9 + o.dx, o.dy, 14.4 + o.dz];
    const hr: V3 = [5.2, 3.9, 3.0];
    p.push({ k: 'ell', c: hc, r: hr, mat: pythonSkin, group: 'head' });
    // long flat snout
    p.push({ k: 'cap', a: [hc[0] + 2.0, hc[1], hc[2] + 0.3], b: [hc[0] + 7.6, hc[1], hc[2] - 0.4], r: 2.8, r2: 1.6, mat: pythonSkin, group: 'snout' });
    // cream lip line along the jaw
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [hc[0] + 2.4, hc[1] + s * 2.7, hc[2] - 1.4], b: [hc[0] + 7.8, hc[1] + s * 1.4, hc[2] - 1.4], r: 0.5, mat: { ramp: H('#8a7a3a', '#c8b46a', '#e4d494') }, group: 'lip' });
    // golden eyes with slit pupils
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 3.0, s * 2.5, 0.35);
      p.push({ k: 'ell', c: [hc[0] + 3.0, hc[1] + s * 2.5, z], r: [0.95, 0.72, 0.6], mat: { ramp: H('#e0a020'), flat: true }, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] + 3.15, hc[1] + s * 2.5, z + 0.3], r: [0.62, 0.16, 0.5], mat: MAT.eyeDark, group: 'eye' });
    }
    shadesOnHead(p, hc, hr, -0.8, 1.9, 1.35);
    // forked red tongue
    const tongue: Material = { ramp: H('#7a0816', '#c8202e'), flat: true };
    p.push({ k: 'cap', a: [hc[0] + 8.2, hc[1], hc[2] - 0.9], b: [hc[0] + 10.8, hc[1] + 0.3, hc[2] - 1.1], r: 0.32, mat: tongue, group: 'tongue' });
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [hc[0] + 10.8, hc[1] + 0.3, hc[2] - 1.1], b: [hc[0] + 12.0, hc[1] + 0.3 + s * 0.9, hc[2] - 1.2], r: 0.22, mat: tongue, group: 'tongue' });
  },
  tail(p, o) {
    const sw = o.sway;
    p.push({ k: 'cap', a: [-5.5, 0.5, 4.8], b: [-11, 2.4 + sw * 0.6, 3.6], r: 2.4, r2: 1.9, mat: pythonSkin, group: 'tail' });
    p.push({ k: 'cap', a: [-11, 2.4 + sw * 0.6, 3.6], b: [-15, -0.6 + sw, 3.0], r: 1.9, r2: 1.3, mat: pythonSkin, group: 'tail' });
    p.push({ k: 'cap', a: [-15, -0.6 + sw, 3.0], b: [-17.8, -4.2 + sw * 1.3, 2.6], r: 1.3, r2: 0.45, mat: pythonSkin, group: 'tail' });
  },
};

// ── Толян «Технарь» — monitor lizard, black tactical jacket with pouches, goggles, cigar ──────
const MONITOR = H('#241a0c', '#3c2c14', '#5a4420', '#78602e', '#9a8044');
const monitorSkin: Material = {
  ramp: MONITOR,
  dither: true,
  pattern: (c) => {
    const n = Math.sin(c.x * 3.1 + Math.cos(c.y * 2.3) * 2) * Math.sin(c.y * 2.7 + c.x * 0.9);
    if (n > 0.82) return hex('#b8a066');
    if (n < -0.86) return hex('#1a1208');
    return null;
  },
};
const TACTICAL = { ramp: H('#0c0c0e', '#17171b', '#24242a', '#34343c', '#484852'), spec: { color: hex('#8890a0'), power: 12, threshold: 0.86 } } as Material;
const varan: Rig = {
  id: 'varan',
  torsoC: [-0.3, 0, 8.4],
  torsoR: [6.0, 11.4, 5.5],
  shoulderY: 8.9,
  shoulderZ: 11.6,
  armR: 2.5,
  headC: [0.8, 0, 14.6],
  hipY: 4.4,
  footR: [3.0, 1.8, 1.2],
  pal: {
    torso: {
      ...TACTICAL,
      pattern: (c) => {
        // quilted seams
        if (Math.abs(((c.y + 40) % 2.4) - 1.2) < 0.1 || Math.abs(((c.x + 40) % 3.2) - 1.6) < 0.08) return -1;
        return null;
      },
    },
    sleeve: { ...TACTICAL, pattern: (c) => (c.t > 0.82 && c.t < 0.94 ? -1 : null) },
    hand: { ramp: H('#060608', '#101014', '#1c1c22', '#2c2c34') },
    pants: { ramp: H('#0e0e12', '#18181e', '#26262e', '#363640') },
    shoe: { ramp: H('#060608', '#0e0e12', '#1c1c22', '#2e2e36') },
  },
  torsoExtras(p, o) {
    p.push({ k: 'ell', c: [1.0 + o.dx, o.dy, 12.9 + o.dz], r: [5.0, 6.2, 1.7], yaw: o.yaw, mat: TACTICAL, group: 'collar' });
    // red star patch on top of the left shoulder
    p.push({ k: 'ell', c: [-0.2 + o.dx, -varan.shoulderY + o.dy, varan.shoulderZ + varan.armR + 0.15 + o.dz], r: [1.4, 1.4, 0.3], mat: { ramp: H('#5a0a0c', '#a01c1a', '#d0302a'), pattern: (c) => { const a = Math.atan2(c.ly, c.lx); const r = Math.hypot(c.lx, c.ly); return r < 0.55 + 0.5 * Math.abs(Math.cos(a * 2.5)) ? hex('#f0c040') : null; } }, group: 'patch' });
    pouches(p, o, varan, { ramp: H('#1a1810', '#2e2a1a', '#463e26', '#5e5434') }, [
      [3.4, -5.4],
      [3.4, 5.4],
      [1.4, -7.4],
      [1.4, 7.4],
      [4.4, -3.4],
    ]);
    backpack(p, o, varan, { ramp: H('#0a0a0c', '#16161a', '#24242a', '#36363e') }, { ramp: H('#060608', '#121216', '#1e1e24') }, [2.4, 4.6, 2.8]);
  },
  head(p, o) {
    const hc: V3 = [1.0 + o.dx, o.dy, 14.2 + o.dz];
    const hr: V3 = [6.0, 3.8, 3.0];
    p.push({ k: 'ell', c: hc, r: hr, mat: monitorSkin, group: 'head' });
    p.push({ k: 'cap', a: [hc[0] + 2.6, hc[1], hc[2] + 0.5], b: [hc[0] + 10.0, hc[1], hc[2] - 0.3], r: 2.6, r2: 1.6, mat: monitorSkin, group: 'snout' });
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 2.6, s * 2.8, 0.25);
      p.push({ k: 'ell', c: [hc[0] + 2.6, hc[1] + s * 2.8, z], r: [0.8, 0.6, 0.55], mat: { ramp: H('#e89a20'), flat: true }, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] + 2.8, hc[1] + s * 2.8, z + 0.25], r: [0.4, 0.2, 0.45], mat: MAT.eyeDark, group: 'eye' });
      // heavy brow ridge
      p.push({ k: 'cap', a: [hc[0] + 1.6, hc[1] + s * 2.0, z + 0.6], b: [hc[0] + 3.6, hc[1] + s * 3.0, z + 0.4], r: 0.5, mat: monitorSkin, group: 'brow' });
    }
    goggles(p, hc, hr, -1.2, 1.9, 1.45, { ramp: H('#0a0a0c', '#18181c', '#26262c') });
    cigar(p, [hc[0] + 6.6, hc[1] + 2.2, hc[2] - 1.0], 1.0, 0.9, 3.6, 0.72);
  },
  tail(p, o) {
    const banded: Material = { ...monitorSkin, pattern: (c) => (Math.floor((c.x + 40) * 0.6) % 2 === 0 ? -1 : null) };
    const sw = o.sway;
    p.push({ k: 'cap', a: [-5.8, 0, 5.4], b: [-12, -1.6 + sw * 0.6, 3.8], r: 2.6, r2: 1.9, mat: banded, group: 'tail' });
    p.push({ k: 'cap', a: [-12, -1.6 + sw * 0.6, 3.8], b: [-18.5, 1.2 + sw * 1.2, 2.8], r: 1.9, r2: 0.6, mat: banded, group: 'tail' });
  },
};

// ── Гоша «Связной» — scarlet macaw, red tracksuit, olive tactical vest, goggles, pipe ─────────
const MACAW_RED = H('#4a0606', '#7e0e0e', '#b41a16', '#dc3020', '#f45a36');
const macawHead: Material = {
  ramp: MACAW_RED,
  dither: true,
  pattern: (c) => {
    // bare white face patch with fine feather lines around the eyes
    if (c.lx > 0.8 && Math.abs(c.ly) > 1.4 && Math.abs(c.ly) < 4.0 && c.lx < 4.4) return Math.abs(((c.lx + c.ly * 0.3) * 2.4) % 1) < 0.12 ? hex('#7a6a64') : hex(c.nz > 0.5 ? '#f2ece4' : '#c8c0b6');
    // yellow on the nape
    if (c.lx < -2.6 && Math.abs(c.ly) > 2.2) return hex('#e8b018');
    return null;
  },
};
export const VEST_OLIVE = H('#1c2010', '#2e341a', '#444c28', '#5c6636', '#76824a');
const popugay: Rig = {
  id: 'popugay',
  torsoC: [-0.2, 0, 8.3],
  torsoR: [5.7, 10.9, 5.3],
  shoulderY: 8.5,
  shoulderZ: 11.5,
  armR: 2.35,
  headC: [0.4, 0, 15.0],
  hipY: 4.1,
  footR: [2.5, 1.5, 1.1],
  toes: true,
  pal: {
    torso: {
      ramp: VEST_OLIVE,
      pattern: (c) => {
        // olive vest over the jacket; the red tracksuit shows at the shoulders
        const ay = Math.abs(c.ly);
        if (ay > 6.6) return shoulderStripes(c, 7.4) ?? (c.nz > 0.7 ? TRACK_RED[3]! : c.nz > 0.4 ? TRACK_RED[2]! : TRACK_RED[1]!);
        if (ay > 6.1) return hex('#14180a');
        return Math.abs(((c.x + 40) % 2.0) - 1.0) < 0.1 ? -1 : null;
      },
    },
    sleeve: { ramp: TRACK_RED, pattern: sleeveStripes },
    hand: { ramp: MACAW_RED, dither: true },
    pants: { ramp: H('#141c34', '#1e2a4c', '#2a3a66', '#3a4e84') },
    shoe: { ramp: H('#2a1608', '#44260e', '#623a18', '#7e5024') },
  },
  torsoExtras(p, o) {
    p.push({ k: 'ell', c: [1.2 + o.dx, o.dy, 12.9 + o.dz], r: [4.8, 5.8, 1.6], yaw: o.yaw, mat: { ramp: TRACK_RED, pattern: (c) => (Math.sqrt((c.lx / 4.8) ** 2 + (c.ly / 5.8) ** 2) > 0.82 ? WHITE : null) }, group: 'collar' });
    pouches(p, o, popugay, { ramp: H('#14180a', '#242a14', '#36401e', '#4a562a') }, [
      [3.6, -5.0],
      [3.6, 5.0],
      [1.8, -6.0],
    ]);
    // walkie-talkie clipped at the right of the chest, antenna up
    p.push({ k: 'box', c: [2.6 + o.dx, 6.4 + o.dy, 12.4 + o.dz], h: [0.9, 1.3, 1.0], yaw: o.yaw, mat: { ramp: H('#0a0a0c', '#1a1a1e', '#2c2c32') }, group: 'radio', bevel: 0.3 });
    p.push({ k: 'cap', a: [2.0 + o.dx, 6.8 + o.dy, 13.2 + o.dz], b: [0.4 + o.dx, 7.6 + o.dy, 15.6 + o.dz], r: 0.22, mat: MAT.black, group: 'radio' });
    // gold hammer-and-sickle medallion on a chain
    goldChain(p, o, 5.3, 5.6, 13.7, 1.3);
    backpack(p, o, popugay, { ramp: H('#1a1e0e', '#2c3218', '#424a24', '#5a6432') }, { ramp: H('#14180a', '#222812', '#323a1a') }, [2.3, 4.4, 2.8]);
  },
  head(p, o) {
    const hc: V3 = [0.6 + o.dx, o.dy, 15.0 + o.dz];
    const hr: V3 = [4.8, 4.4, 4.1];
    p.push({ k: 'ell', c: hc, r: hr, mat: macawHead, group: 'head' });
    // big hooked beak: pale upper mandible, black lower
    p.push({ k: 'cap', a: [hc[0] + 3.4, hc[1], hc[2] + 0.8], b: [hc[0] + 7.6, hc[1], hc[2] - 0.4], r: 2.4, r2: 1.1, mat: { ramp: H('#5a5650', '#8a847a', '#b8b2a6', '#e0dace'), spec: { color: hex('#ffffff'), power: 12, threshold: 0.84 } }, group: 'beak' });
    p.push({ k: 'cap', a: [hc[0] + 7.4, hc[1], hc[2] - 0.4], b: [hc[0] + 8.2, hc[1], hc[2] - 2.2], r: 1.0, r2: 0.45, mat: { ramp: H('#2a2824', '#4a4640', '#6a645a') }, group: 'beak' });
    p.push({ k: 'ell', c: [hc[0] + 4.4, hc[1], hc[2] - 1.8], r: [2.0, 1.8, 1.2], mat: { ramp: H('#060608', '#121216', '#202026') }, group: 'jaw' });
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 2.2, s * 3.1, 0.25);
      p.push({ k: 'ell', c: [hc[0] + 2.2, hc[1] + s * 3.1, z], r: [0.75, 0.65, 0.55], mat: { ramp: H('#f2d24a'), flat: true }, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] + 2.4, hc[1] + s * 3.1, z + 0.3], r: [0.4, 0.36, 0.45], mat: MAT.eyeDark, group: 'eye' });
    }
    goggles(p, hc, hr, -0.9, 1.9, 1.4, { ramp: H('#2a1608', '#44260e', '#623a18') });
    // pipe in the corner of the beak
    p.push({ k: 'cap', a: [hc[0] + 5.6, hc[1] + 1.8, hc[2] - 1.2], b: [hc[0] + 8.0, hc[1] + 4.2, hc[2] - 1.0], r: 0.4, mat: { ramp: H('#1a0e06', '#3a200e', '#5a3418') }, group: 'pipe' });
    p.push({ k: 'cyl', c: [hc[0] + 8.3, hc[1] + 4.5, 0], r: 0.95, z0: hc[2] - 1.6, z1: hc[2] - 0.2, mat: { ramp: H('#1a0e06', '#3a200e', '#5a3418', '#784a24'), pattern: (c) => (c.nz > 0.9 ? hex('#ff8a24') : null) }, group: 'pipe' });
  },
  tail(p, o) {
    const cols: Array<[string[], number, number]> = [
      [['#5a0a0a', '#9a1414', '#d02a1e'], -1.6, 13.0],
      [['#0a1e5a', '#16349a', '#2a54d0'], -0.5, 15.0],
      [['#5a0a0a', '#9a1414', '#d02a1e'], 0.5, 15.5],
      [['#6a4a06', '#b0820e', '#e8b018'], 1.6, 13.0],
    ];
    for (const [c, y, l] of cols) p.push({ k: 'cap', a: [-5.0, y * 0.5, 7.2], b: [-l, y * 1.4 + o.sway * 0.7, 6.4], r: 1.0, r2: 0.5, mat: { ramp: H(...c) }, group: 'tail' });
  },
};

// ── Витёк «Безумец» — piranha, black hooded jacket, red bandana, red mohawk fin, vest ────────
const PIRANHA = H('#1a2024', '#2c363c', '#46525a', '#66747c', '#8c9aa2');
const piranhaSkin: Material = {
  ramp: PIRANHA,
  spec: { color: hex('#dfeaf0'), power: 12, threshold: 0.84 },
  pattern: (c) => {
    const n = Math.sin(c.x * 4.1 + c.y * 1.3) * Math.sin(c.y * 3.7 - c.x * 0.7);
    return n > 0.86 ? hex('#141a1e') : null;
  },
};
const piranya: Rig = {
  id: 'piranya',
  torsoC: [-0.2, 0, 8.2],
  torsoR: [5.7, 10.8, 5.2],
  shoulderY: 8.4,
  shoulderZ: 11.3,
  armR: 2.35,
  headC: [0.6, 0, 14.6],
  hipY: 4.0,
  footR: [2.6, 1.5, 1.1],
  pal: {
    torso: {
      ramp: BLACK_CLOTH,
      pattern: (c) => {
        // brown tactical vest panels over the hoodie
        if (Math.abs(c.ly) < 6.0 && c.lx > -3.5) return Math.abs(((c.x + 40) % 2.2) - 1.1) < 0.1 ? hex('#1e140a') : c.nz > 0.7 ? hex('#4e3a22') : hex('#36281a');
        return null;
      },
    },
    sleeve: { ramp: BLACK_CLOTH, pattern: (c) => (c.t > 0.18 && c.t < 0.34 && c.s < 0 ? hex('#a82020') : c.t > 0.85 ? -1 : null) },
    hand: { ramp: PIRANHA },
    pants: { ramp: H('#141820', '#1e2430', '#2a3242', '#3a4456') },
    shoe: { ramp: H('#0a0806', '#16120e', '#241e18', '#342c24') },
  },
  torsoExtras(p, o) {
    // hood bunched up behind the neck
    p.push({ k: 'ell', c: [-3.6 + o.dx, o.dy, 13.0 + o.dz], r: [3.0, 5.2, 2.0], yaw: o.yaw, mat: { ramp: BLACK_CLOTH, dither: true }, group: 'hood' });
    // red bandana round the neck, knot at the back
    p.push({ k: 'ell', c: [1.0 + o.dx, o.dy, 12.9 + o.dz], r: [5.2, 5.9, 1.7], yaw: o.yaw, mat: { ramp: H('#4a080a', '#7e1014', '#b01c1c', '#d63426'), pattern: (c) => (((Math.floor((c.x + 40) * 1.6) + Math.floor((c.y + 40) * 1.6)) % 5 === 0 ? hex('#e8d8c0') : null)) }, group: 'bandana' });
    pouches(p, o, piranya, { ramp: H('#1e140a', '#33240f', '#4a3618', '#604824') }, [
      [3.4, -5.2],
      [3.4, 5.2],
      [1.6, -6.6],
    ]);
    backpack(p, o, piranya, { ramp: H('#22180c', '#3a2a14', '#56401e', '#70562a') }, { ramp: H('#140e06', '#24180c', '#382612') }, [2.2, 4.2, 2.6]);
  },
  head(p, o) {
    const hc: V3 = [1.0 + o.dx, o.dy, 14.6 + o.dz];
    const hr: V3 = [5.8, 4.6, 3.9];
    p.push({ k: 'ell', c: hc, r: hr, mat: piranhaSkin, group: 'head' });
    // huge underbite jaw with a row of fangs along the front
    p.push({ k: 'ell', c: [hc[0] + 4.2, hc[1], hc[2] - 1.2], r: [3.6, 4.4, 2.4], mat: { ...piranhaSkin, pattern: undefined, ramp: H('#2c363c', '#46525a', '#66747c', '#c8c0a8') }, group: 'jaw' });
    p.push({ k: 'ell', c: [hc[0] + 4.6, hc[1], hc[2] - 0.6], r: [2.6, 3.6, 1.0], mat: { ramp: H('#3a0608', '#5e0c10'), flat: true }, group: 'mouth' });
    for (let i = -4; i <= 4; i++) {
      const y = i * 0.95;
      const x = hc[0] + 4.2 + 3.4 * Math.sqrt(Math.max(0, 1 - (y / 4.4) ** 2));
      p.push({ k: 'cap', a: [x - 0.6, hc[1] + y, hc[2] + 0.2], b: [x + 0.6, hc[1] + y, hc[2] + 1.4], r: 0.5, r2: 0.1, mat: { ramp: H('#d8d0c0', '#fbf8ee'), flat: true }, group: 'teeth' });
    }
    // red eyes, a scar across the left one
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 1.8, s * 3.3, 0.2);
      p.push({ k: 'ell', c: [hc[0] + 1.8, hc[1] + s * 3.3, z], r: [1.05, 0.85, 0.7], mat: { ramp: H('#e02a1a'), flat: true }, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] + 2.0, hc[1] + s * 3.35, z + 0.3], r: [0.42, 0.38, 0.45], mat: MAT.eyeDark, group: 'eye' });
    }
    p.push({ k: 'cap', a: [hc[0] + 0.2, hc[1] - 4.4, surf(hc, hr, -0.8, -4.0, 0.2)], b: [hc[0] + 3.6, hc[1] - 1.8, surf(hc, hr, 2.6, -1.8, 0.25)], r: 0.28, mat: { ramp: H('#8a1a1a', '#c03030'), flat: true }, group: 'scar' });
    // red spiky dorsal fin like a mohawk, front to back
    const finM: Material = { ramp: H('#4a0606', '#7e0e0e', '#b41a16', '#dc3020') };
    for (let i = 0; i < 6; i++) {
      const x = hc[0] + 1.6 - i * 1.5;
      const z = surf(hc, hr, x - hc[0], 0, 0);
      p.push({ k: 'cap', a: [x, hc[1], z - 0.4], b: [x - 1.6, hc[1] + (i % 2 ? 0.4 : -0.4), z + 2.4 - i * 0.15], r: 0.85, r2: 0.2, mat: finM, group: 'fin' });
    }
  },
  tail(p, o) {
    const m: Material = { ramp: PIRANHA };
    const sw = o.sway * 0.8;
    p.push({ k: 'cap', a: [-5.2, 0, 5.4], b: [-8.6, sw * 0.5, 5.0], r: 1.6, r2: 1.0, mat: m, group: 'tail' });
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [-8.6, sw * 0.5, 5.0], b: [-12.2, s * 3.6 + sw, 4.8], r: 1.1, r2: 0.45, mat: { ramp: H('#4a0606', '#7e0e0e', '#b41a16') }, group: 'tailfin' });
  },
};

// ── Жора «Бизнесмен» — blue shark, navy pinstripe suit, white shirt, gold $ chain, cigar ──────
const SHARK = H('#18222e', '#283a4e', '#3e5670', '#5c7896', '#8aa4c0');
const NAVY_SUIT = H('#070a16', '#0e1428', '#18223e', '#24325a', '#344678');
const pinstripe = (c: PatternCtx): number | null => (Math.abs(((c.y + 40) % 2.0) - 1.0) < 0.09 ? 0.6 : null);
const akula: Rig = {
  id: 'akula',
  torsoC: [-0.3, 0, 8.5],
  torsoR: [6.1, 11.8, 5.6],
  shoulderY: 9.4,
  shoulderZ: 11.8,
  armR: 2.5,
  headC: [0.6, 0, 15.2],
  hipY: 4.4,
  footR: [3.0, 1.6, 1.2],
  pal: {
    torso: {
      ramp: NAVY_SUIT,
      spec: { color: hex('#8a9ac8'), power: 10, threshold: 0.86 },
      pattern: (c) => {
        if (c.lx > 1.8 && Math.abs(c.ly) < 2.6 - (c.lx - 1.8) * 0.35) return Math.abs(c.ly) < 0.55 ? hex(Math.floor(c.lx * 2) % 2 ? '#c8a040' : '#2a1a10') : hex('#efeadc'); // shirt + patterned tie
        if (c.lx > 1.4 && Math.abs(Math.abs(c.ly) - 3.0) < 0.3) return hex('#05070e'); // lapels
        return pinstripe(c);
      },
    },
    sleeve: { ramp: NAVY_SUIT, pattern: (c) => (c.t > 0.93 ? hex('#efeadc') : pinstripe(c)) },
    hand: { ramp: SHARK },
    pants: { ramp: NAVY_SUIT, pattern: pinstripe },
    shoe: { ramp: H('#0a0806', '#1a120c', '#2c2016', '#463422'), spec: { color: hex('#c0a080'), power: 16, threshold: 0.82 } },
  },
  hand(p, at, side, rig) {
    p.push({ k: 'ell', c: at, r: [rig.armR * 0.85, rig.armR * 0.8, rig.armR * 0.75], mat: rig.pal.hand, group: 'hand' + side });
    // gold watch on the left wrist
    if (side === -1) p.push({ k: 'ell', c: [at[0] - 1.6, at[1], at[2] + 0.4], r: [0.7, 1.4, 0.9], mat: MAT.gold, group: 'watch' });
  },
  torsoExtras(p, o) {
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [1.4 + o.dx, s * 5.6 + o.dy, 12.9 + o.dz], r: [3.8, 2.0, 1.5], yaw: s * 0.5 + o.yaw, mat: { ramp: NAVY_SUIT, pattern: pinstripe }, group: 'lapel' + s });
    goldChain(p, o, 5.8, 6.2, 13.8, 1.3);
  },
  head(p, o) {
    const hc: V3 = [0.8 + o.dx, o.dy, 14.8 + o.dz];
    const hr: V3 = [5.8, 4.6, 3.6];
    const skin: Material = { ramp: SHARK, spec: { color: hex('#d8e4ec'), power: 12, threshold: 0.84 }, pattern: (c) => (c.nz < 0.4 ? hex('#e4e8e8') : null) };
    p.push({ k: 'ell', c: hc, r: hr, mat: skin, group: 'head' });
    p.push({ k: 'cap', a: [hc[0] + 3.0, hc[1], hc[2] + 0.2], b: [hc[0] + 8.8, hc[1], hc[2] - 0.6], r: 3.1, r2: 1.2, mat: skin, group: 'snout' });
    // wide grin full of teeth
    p.push({ k: 'ell', c: [hc[0] + 5.2, hc[1], hc[2] - 1.6], r: [2.4, 3.8, 1.0], mat: { ramp: H('#3a0a10', '#5e121a'), flat: true }, group: 'mouth' });
    for (let i = -5; i <= 5; i++) {
      const y = i * 0.7;
      const x = hc[0] + 6.4 - Math.abs(i) * 0.38;
      p.push({ k: 'cap', a: [x - 0.3, hc[1] + y, hc[2] - 1.4], b: [x + 0.5, hc[1] + y, hc[2] - 0.8], r: 0.32, r2: 0.1, mat: { ramp: H('#e8e4d8', '#fbf8ee'), flat: true }, group: 'teeth' });
    }
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 2.6, s * 3.4, 0.15);
      p.push({ k: 'ell', c: [hc[0] + 2.6, hc[1] + s * 3.4, z], r: [0.7, 0.55, 0.5], mat: { ramp: H('#e8b030'), flat: true }, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] + 2.8, hc[1] + s * 3.4, z + 0.25], r: [0.38, 0.32, 0.45], mat: MAT.eyeDark, group: 'eye' });
      for (let g = 0; g < 3; g++) p.push({ k: 'cap', a: [hc[0] - 1.6 - g * 0.9, hc[1] + s * 3.5, hc[2] + 0.6], b: [hc[0] - 1.9 - g * 0.9, hc[1] + s * 4.3, hc[2] - 0.6], r: 0.18, mat: { ramp: H('#101820'), flat: true }, group: 'gill' });
    }
    // scar «×» on the snout
    const sz = surf(hc, hr, 4.4, -1.4, 0.35);
    p.push({ k: 'cap', a: [hc[0] + 3.8, hc[1] - 2.0, sz], b: [hc[0] + 5.0, hc[1] - 0.8, sz], r: 0.2, mat: { ramp: H('#0c1218'), flat: true }, group: 'scar' });
    p.push({ k: 'cap', a: [hc[0] + 3.8, hc[1] - 0.8, sz], b: [hc[0] + 5.0, hc[1] - 2.0, sz], r: 0.2, mat: { ramp: H('#0c1218'), flat: true }, group: 'scar' });
    // dorsal fin rising from the back of the head
    p.push({ k: 'cap', a: [hc[0] - 3.0, hc[1], hc[2] + 2.6], b: [hc[0] - 7.6, hc[1], hc[2] + 6.4], r: 1.5, r2: 0.25, mat: { ramp: H('#121a24', '#22303e', '#34485c', '#4e667e') }, group: 'fin' });
    cigar(p, [hc[0] + 6.6, hc[1] + 2.6, hc[2] - 1.0], 1.0, 0.75, 3.8, 0.8);
  },
  tail(p, o) {
    const m: Material = { ramp: SHARK };
    const sw = o.sway;
    p.push({ k: 'cap', a: [-6.0, 0, 6.0], b: [-11.5, sw * 0.6, 6.4], r: 2.0, r2: 1.1, mat: m, group: 'tail' });
    p.push({ k: 'cap', a: [-11.5, sw * 0.6, 6.4], b: [-15.0, -3.2 + sw, 7.2], r: 1.1, r2: 0.3, mat: m, group: 'tailfin' });
    p.push({ k: 'cap', a: [-11.5, sw * 0.6, 6.4], b: [-14.2, 2.6 + sw, 6.6], r: 0.9, r2: 0.3, mat: m, group: 'tailfin' });
  },
};

// ── Лёва «Наёмник» — leopard, brown leather jacket with a shearling collar, black turtleneck ──
const LEO = H('#5a3008', '#94561a', '#c4822c', '#e2a84a', '#f4cc7a');
const leoSpots = (base: RGBA[]): Material => ({
  ramp: base,
  dither: true,
  pattern: (c) => {
    const gx = c.x * 0.55 + (Math.floor(c.y * 0.55) % 2) * 0.5;
    const gy = c.y * 0.55;
    const d = (gx - Math.round(gx)) ** 2 + (gy - Math.round(gy)) ** 2;
    return d < 0.035 ? hex('#7a4a14') : d < 0.085 ? hex('#140c06') : null;
  },
});
const BROWN_LEATHER: Material = { ramp: H('#120a06', '#21130b', '#331e12', '#482c1b', '#603d26'), spec: { color: hex('#d0a888'), power: 10, threshold: 0.74 } };
export const SHEARLING: Material = { ramp: H('#6a5438', '#8e7652', '#b29a72', '#d2bc94', '#e8d6b2'), dither: true };
const leopard: Rig = {
  id: 'leopard',
  torsoC: [-0.2, 0, 8.4],
  torsoR: [5.8, 11.2, 5.4],
  shoulderY: 8.8,
  shoulderZ: 11.6,
  armR: 2.4,
  headC: [0.2, 0, 15.2],
  hipY: 4.2,
  footR: [2.9, 1.6, 1.2],
  pal: {
    torso: {
      ...BROWN_LEATHER,
      pattern: (c) => {
        if (c.lx > 1.4 && Math.abs(c.ly) < 3.0 - (c.lx - 1.4) * 0.3) return Math.floor((c.y + 40) * 2.2) % 2 ? hex('#141418') : hex('#1e1e24'); // ribbed turtleneck
        if (Math.abs(((c.x * 0.7 - c.y * 0.3 + 40) % 2.8) - 1.4) < 0.07) return 0.7;
        return null;
      },
    },
    sleeve: { ...BROWN_LEATHER, pattern: (c) => (c.t > 0.84 ? SHEARLING.ramp[3]! : null) },
    hand: { ramp: H('#060608', '#101014', '#1c1c22', '#2c2c34') },
    pants: { ramp: H('#0c0c12', '#16161e', '#22222c', '#32323e') },
    shoe: { ramp: H('#060608', '#0e0e12', '#1c1c22', '#2e2e36'), spec: { color: hex('#9aa2c0'), power: 18, threshold: 0.8 } },
  },
  torsoExtras(p, o) {
    // big shearling collar lying over the shoulders
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [0.2 + o.dx, s * 5.4 + o.dy, 12.9 + o.dz], r: [3.8, 2.2, 1.6], yaw: s * 0.45 + o.yaw, mat: SHEARLING, group: 'collar' + s });
    p.push({ k: 'ell', c: [-2.6 + o.dx, o.dy, 13.0 + o.dz], r: [2.0, 5.6, 1.6], yaw: o.yaw, mat: SHEARLING, group: 'collarback' });
    goldChain(p, o, 5.2, 5.5, 13.8, 1.2);
  },
  head(p, o) {
    const hc: V3 = [0.4 + o.dx, o.dy, 15.2 + o.dz];
    const hr: V3 = [5.0, 4.7, 4.3];
    p.push({ k: 'ell', c: hc, r: hr, mat: leoSpots(LEO), group: 'head' });
    for (const s of [-1, 1]) {
      p.push({ k: 'ell', c: [hc[0] - 1.4, hc[1] + s * 4.0, hc[2] + 3.0], r: [1.5, 1.4, 1.4], mat: fur(LEO), group: 'ear' + s });
      p.push({ k: 'ell', c: [hc[0] - 1.2, hc[1] + s * 4.0, hc[2] + 3.5], r: [0.7, 0.7, 0.8], mat: { ramp: H('#2a1a10', '#4a2e1a') }, group: 'ear' + s });
    }
    p.push({ k: 'ell', c: [hc[0] + 4.4, hc[1], hc[2] - 1.0], r: [2.6, 2.6, 2.0], mat: fur(H('#a89a80', '#d8ccb0', '#f2e8d0', '#fbf6e8')), group: 'muzzle' });
    p.push({ k: 'ell', c: [hc[0] + 6.6, hc[1], hc[2] - 0.2], r: [0.8, 1.0, 0.6], mat: { ramp: H('#6a2a2a', '#a04a4a', '#c87070') }, group: 'nose' });
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 3.0, s * 2.4, 0.2);
      p.push({ k: 'ell', c: [hc[0] + 3.0, hc[1] + s * 2.4, z], r: [1.0, 0.75, 0.6], yaw: s * -0.3, mat: { ramp: H('#d8c040'), flat: true }, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] + 3.25, hc[1] + s * 2.4, z + 0.25], r: [0.38, 0.26, 0.45], mat: MAT.eyeDark, group: 'eye' });
      p.push({ k: 'cap', a: [hc[0] + 5.0, hc[1] + s * 1.8, hc[2] - 0.7], b: [hc[0] + 4.2, hc[1] + s * 6.0, hc[2] - 0.8], r: 0.2, mat: { ramp: H('#cfcac0', '#f2efe6'), flat: true }, group: 'whisker' });
    }
    cigar(p, [hc[0] + 5.6, hc[1] - 1.8, hc[2] - 1.0], 1.0, -0.9, 3.0, 0.5, MAT.cigarette);
  },
  tail(p, o) {
    const m = leoSpots(LEO);
    const sw = o.sway * 1.3;
    p.push({ k: 'cap', a: [-6.2, -0.8, 6.6], b: [-12, -2.6 + sw * 0.5, 6.0], r: 1.4, r2: 1.2, mat: m, group: 'tail' });
    p.push({ k: 'cap', a: [-12, -2.6 + sw * 0.5, 6.0], b: [-16.4, -6.4 + sw, 5.6], r: 1.2, r2: 0.9, mat: m, group: 'tail' });
  },
};

// ── Батя «Крыша» — elephant, red tracksuit, fur-trimmed vest, shades on the head, gold star chain
const ELEPHANT = H('#34343a', '#4e4e56', '#6c6c76', '#8e8e98', '#b2b2bc');
const SUEDE = H('#2a1608', '#44260e', '#623a18', '#7e5024', '#9a6832');
const slon: Rig = {
  id: 'slon',
  torsoC: [-0.6, 0, 8.8],
  torsoR: [7.0, 13.2, 6.0],
  shoulderY: 10.6,
  shoulderZ: 12.2,
  armR: 3.0,
  headC: [0.4, 0, 16.0],
  hipY: 5.4,
  footR: [3.4, 2.2, 1.3],
  pal: {
    torso: {
      ramp: SUEDE,
      dither: true,
      pattern: (c) => {
        const ay = Math.abs(c.ly);
        // open vest front: red tracksuit with a white zip
        if (c.lx > 1.4 && ay < 3.6 - (c.lx - 1.4) * 0.3) return ay < 0.3 ? WHITE : hex(c.nz > 0.6 ? '#c4282c' : '#8a1820');
        // fur trim along the vest edges and the arm holes
        if ((c.lx > 1.2 && Math.abs(ay - 3.9) < 0.55) || ay > 10.4) return hex(c.nz > 0.5 ? '#e0cca6' : '#b29a72');
        return null;
      },
    },
    sleeve: { ramp: TRACK_RED, pattern: sleeveStripes },
    hand: { ramp: ELEPHANT, dither: true },
    pants: { ramp: TRACK_RED, pattern: legStripe },
    shoe: { ramp: H('#1e1208', '#352010', '#52341c', '#704c2a') },
  },
  hand(p, at, side, rig) {
    p.push({ k: 'ell', c: at, r: [rig.armR * 0.85, rig.armR * 0.8, rig.armR * 0.75], mat: rig.pal.hand, group: 'hand' + side });
    p.push({ k: 'ell', c: [at[0] - 1.8, at[1], at[2] + 0.3], r: [0.6, 1.9, 1.3], mat: MAT.gold, group: 'bracelet' });
  },
  torsoExtras(p, o) {
    p.push({ k: 'ell', c: [1.2 + o.dx, o.dy, 13.6 + o.dz], r: [5.6, 6.8, 1.9], yaw: o.yaw, mat: { ramp: TRACK_RED, pattern: (c) => (Math.sqrt((c.lx / 5.6) ** 2 + (c.ly / 6.8) ** 2) > 0.82 ? WHITE : null) }, group: 'collar' });
    goldChain(p, o, 6.2, 6.8, 14.6, 1.6, 0.8);
    backpack(p, o, slon, { ramp: SUEDE }, { ramp: H('#1e1208', '#352010', '#52341c') }, [2.6, 5.4, 3.2]);
  },
  head(p, o) {
    const hc: V3 = [0.6 + o.dx, o.dy, 15.8 + o.dz];
    const hr: V3 = [5.6, 5.4, 4.8];
    const skin: Material = { ...fur(ELEPHANT), pattern: (c) => (Math.abs(((c.x * 1.3 + Math.sin(c.y * 1.7) * 0.6 + 40) % 1.6) - 0.8) < 0.08 ? -1 : null) };
    p.push({ k: 'ell', c: hc, r: hr, mat: skin, group: 'head' });
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [hc[0] - 1.6, hc[1] + s * 8.2, hc[2] - 0.6], r: [4.6, 4.4, 1.0], yaw: s * -0.25, mat: { ...skin, pattern: (c) => (Math.abs(c.ly) < 2.6 && Math.abs(c.lx) < 3.0 ? hex('#8a6e6e') : null) }, group: 'ear' + s });
    const trunk: Material = { ramp: ELEPHANT, pattern: (c) => (Math.floor(c.t * 9) % 2 === 0 ? -1 : null) };
    p.push({ k: 'cap', a: [hc[0] + 3.6, hc[1], hc[2] + 0.6], b: [hc[0] + 8.4, hc[1], hc[2] - 0.2], r: 2.2, r2: 1.7, mat: trunk, group: 'trunk' });
    p.push({ k: 'cap', a: [hc[0] + 8.4, hc[1], hc[2] - 0.2], b: [hc[0] + 11.4, hc[1] + 0.8 + o.sway * 0.3, hc[2] - 1.4], r: 1.7, r2: 1.2, mat: trunk, group: 'trunk' });
    // long tusks
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [hc[0] + 4.0, hc[1] + s * 2.6, hc[2] - 1.8], b: [hc[0] + 9.0, hc[1] + s * 3.6, hc[2] - 1.2], r: 0.8, r2: 0.35, mat: { ramp: H('#a89c80', '#d8ccae', '#f2e8d0', '#fbf8ee') }, group: 'tusk' });
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 3.4, s * 3.2, 0.15);
      p.push({ k: 'ell', c: [hc[0] + 3.4, hc[1] + s * 3.2, z], r: [0.55, 0.5, 0.45], mat: MAT.eyeDark, group: 'eye' });
    }
    shadesOnHead(p, hc, hr, -0.4, 2.2, 1.55);
    cigar(p, [hc[0] + 6.2, hc[1] - 2.0, hc[2] - 2.2], 1.0, -1.0, 3.8, 0.8);
  },
  tail(p, o) {
    p.push({ k: 'cap', a: [-7.2, 0, 6.6], b: [-11.4, 0.6 + o.sway * 0.4, 5.4], r: 0.6, r2: 0.4, mat: { ramp: ELEPHANT }, group: 'tail' });
    p.push({ k: 'ell', c: [-11.8, 0.7 + o.sway * 0.4, 5.3], r: [1.0, 0.8, 0.7], mat: { ramp: H('#1a1a1e', '#2c2c32') }, group: 'tuft' });
  },
};

// ── Славик «Барыга» — lobster, navy tracksuit with white stripes, black vest, shades, cigar ────
const SHELL = H('#4a0806', '#7a120c', '#a82014', '#d43a22', '#f06a44');
const TRACK_NAVY = H('#06081a', '#0c1230', '#16204e', '#22306e', '#32448e');
const lobster: Rig = {
  id: 'lobster',
  torsoC: [-0.2, 0, 8.4],
  torsoR: [5.8, 11.0, 5.4],
  shoulderY: 8.8,
  shoulderZ: 11.6,
  armR: 2.3,
  headC: [0.4, 0, 15.0],
  hipY: 4.2,
  footR: [2.8, 1.6, 1.2],
  pal: {
    torso: {
      ramp: H('#08080a', '#121216', '#1c1c22', '#2a2a32', '#3a3a44'),
      pattern: (c) => {
        // black vest over the tracksuit; navy with white stripes at the shoulders
        const ay = Math.abs(c.ly);
        if (ay > 5.8) return shoulderStripes(c, 6.4) ?? (c.nz > 0.7 ? TRACK_NAVY[3]! : c.nz > 0.4 ? TRACK_NAVY[2]! : TRACK_NAVY[1]!);
        if (c.lx > 1.4 && ay < 0.3) return hex('#4a4a54');
        return null;
      },
    },
    sleeve: { ramp: TRACK_NAVY, pattern: sleeveStripes },
    hand: { ramp: SHELL },
    pants: { ramp: TRACK_NAVY, pattern: legStripe },
    shoe: { ramp: H('#1c1c20', '#2e2e34', '#ccc6b8', '#ece6da') },
  },
  hand(p, at, side) {
    // a big claw: palm + two pincers opening forward
    const m: Material = { ramp: SHELL, spec: { color: hex('#ffd0b0'), power: 12, threshold: 0.82 } };
    p.push({ k: 'ell', c: [at[0] + 0.6, at[1], at[2]], r: [2.6, 2.0, 1.6], mat: m, group: 'claw' + side });
    p.push({ k: 'cap', a: [at[0] + 2.2, at[1] - side * 0.5, at[2] + 0.2], b: [at[0] + 5.6, at[1] - side * 1.2, at[2] + 0.2], r: 1.3, r2: 0.45, mat: m, group: 'claw' + side });
    p.push({ k: 'cap', a: [at[0] + 2.2, at[1] + side * 0.9, at[2]], b: [at[0] + 4.8, at[1] + side * 1.9, at[2] - 0.2], r: 1.0, r2: 0.35, mat: m, group: 'pincer' + side });
  },
  torsoExtras(p, o) {
    p.push({ k: 'ell', c: [1.2 + o.dx, o.dy, 12.9 + o.dz], r: [4.8, 5.8, 1.6], yaw: o.yaw, mat: { ramp: TRACK_NAVY, pattern: (c) => (Math.sqrt((c.lx / 4.8) ** 2 + (c.ly / 5.8) ** 2) > 0.82 ? WHITE : null) }, group: 'collar' });
    pouches(p, o, lobster, { ramp: H('#0a0a0c', '#16161a', '#24242a', '#34343c') }, [
      [3.4, -4.6],
      [3.4, 4.6],
    ]);
    goldChain(p, o, 5.3, 5.6, 13.7, 1.4);
    backpack(p, o, lobster, { ramp: H('#0a0a0c', '#16161a', '#24242a', '#36363e') }, { ramp: H('#060608', '#121216', '#1e1e24') }, [2.2, 4.4, 2.6]);
  },
  head(p, o) {
    const hc: V3 = [0.8 + o.dx, o.dy, 14.6 + o.dz];
    const hr: V3 = [5.6, 4.2, 3.6];
    const shell: Material = { ramp: SHELL, spec: { color: hex('#ffd8c0'), power: 12, threshold: 0.84 }, pattern: (c) => (Math.abs(((c.x + 30) % 2.4) - 1.2) < 0.15 ? -1 : null) };
    p.push({ k: 'ell', c: hc, r: hr, mat: shell, group: 'head' });
    p.push({ k: 'cap', a: [hc[0] + 4.0, hc[1], hc[2] + 0.8], b: [hc[0] + 8.0, hc[1], hc[2] + 0.2], r: 1.2, r2: 0.25, mat: shell, group: 'rostrum' });
    shadesOnEyes(p, hc, hr, 3.0, 2.1, 1.4);
    // long antennae sweeping back over the shoulders
    for (const s of [-1, 1]) {
      p.push({ k: 'cap', a: [hc[0] + 5.0, hc[1] + s * 1.0, hc[2] + 0.6], b: [hc[0] + 9.0, hc[1] + s * 6.0, hc[2] + 1.6], r: 0.35, r2: 0.28, mat: { ramp: SHELL }, group: 'antenna' });
      p.push({ k: 'cap', a: [hc[0] + 9.0, hc[1] + s * 6.0, hc[2] + 1.6], b: [hc[0] + 4.0, hc[1] + s * 14.0 + o.sway * 0.4, hc[2] + 2.0], r: 0.28, r2: 0.15, mat: { ramp: SHELL }, group: 'antenna' });
    }
    cigar(p, [hc[0] + 5.6, hc[1] + 1.6, hc[2] - 1.4], 1.0, 0.9, 3.6, 0.75);
  },
  tail(p, o) {
    const m: Material = { ramp: SHELL };
    for (let i = 0; i < 3; i++) p.push({ k: 'ell', c: [-6.4 - i * 2.2, o.sway * 0.2 * i, 6.4 - i * 0.6], r: [1.6, 3.4 - i * 0.5, 1.4], mat: m, group: 'seg' + i });
    for (const a of [-0.7, 0, 0.7]) p.push({ k: 'cap', a: [-12.4, 0, 5.0], b: [-12.4 - Math.cos(a) * 3.4, Math.sin(a) * 3.0 + o.sway * 0.5, 4.8], r: 0.9, r2: 1.3, mat: m, group: 'fan' });
  },
};

// ── Гарик «Пендос» — bald eagle, leather bomber with a shearling collar, red scarf, shades ─────
const EAGLE_WHITE = H('#8a8478', '#b8b2a4', '#ddd8cc', '#f2eee4', '#fbf8f0');
const BOMBER: Material = { ramp: H('#140b06', '#24140b', '#381f11', '#4e2d19', '#683e24'), spec: { color: hex('#d8a880'), power: 10, threshold: 0.74 } };
const SCARF_RED = H('#4a0608', '#7a0e12', '#a81a1a', '#cc2c22', '#e64a34');
const oryol: Rig = {
  id: 'oryol',
  torsoC: [-0.3, 0, 8.4],
  torsoR: [5.9, 11.2, 5.4],
  shoulderY: 8.8,
  shoulderZ: 11.6,
  armR: 2.45,
  headC: [0.4, 0, 15.2],
  hipY: 4.3,
  footR: [2.9, 1.6, 1.2],
  toes: true,
  pal: {
    torso: { ...BOMBER, pattern: (c) => (Math.abs(((c.x * 0.6 + c.y * 0.4 + 40) % 2.6) - 1.3) < 0.07 ? 0.7 : null) },
    sleeve: { ...BOMBER, pattern: (c) => (c.t > 0.86 ? hex('#1c120c') : null) },
    hand: { ramp: H('#060608', '#101014', '#1c1c22', '#2c2c34') },
    pants: { ramp: H('#1a2232', '#263248', '#344462', '#465a80') },
    shoe: { ramp: H('#1e1208', '#352010', '#52341c', '#704c2a') },
  },
  torsoExtras(p, o) {
    // red star patch on the left shoulder
    p.push({ k: 'ell', c: [-0.2 + o.dx, -oryol.shoulderY + o.dy, oryol.shoulderZ + oryol.armR + 0.15 + o.dz], r: [1.3, 1.3, 0.3], mat: { ramp: H('#5a0a0c', '#a01c1a', '#d0302a'), pattern: (c) => { const a = Math.atan2(c.ly, c.lx); const r = Math.hypot(c.lx, c.ly); return r < 0.5 + 0.45 * Math.abs(Math.cos(a * 2.5)) ? hex('#f0c040') : null; } }, group: 'patch' });
    // shearling collar over the shoulders
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [0.0 + o.dx, s * 5.6 + o.dy, 12.9 + o.dz], r: [3.8, 2.3, 1.7], yaw: s * 0.45 + o.yaw, mat: SHEARLING, group: 'collar' + s });
    p.push({ k: 'ell', c: [-2.8 + o.dx, o.dy, 13.0 + o.dz], r: [2.0, 5.8, 1.7], yaw: o.yaw, mat: SHEARLING, group: 'collarback' });
    // red scarf: a ring round the neck and two ends flying back
    p.push({ k: 'ell', c: [1.2 + o.dx, o.dy, 13.4 + o.dz], r: [4.6, 5.4, 1.6], yaw: o.yaw, mat: { ramp: SCARF_RED, dither: true }, group: 'scarf' });
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [-3.0 + o.dx, s * 1.6 + o.dy, 13.6 + o.dz], b: [-9.0 + o.dx, s * 3.0 + o.sway * 0.8 + o.dy, 12.2 + o.dz], r: 1.2, r2: 0.8, mat: { ramp: SCARF_RED }, group: 'scarfend' });
    pouches(p, o, oryol, { ramp: H('#1a140c', '#2e2416', '#463822', '#5e4c30') }, [
      [3.4, -5.2],
      [3.4, 5.2],
    ]);
    backpack(p, o, oryol, { ramp: H('#1c1a10', '#2e2a1a', '#463e26', '#5e5434') }, { ramp: H('#120e08', '#201a10', '#302616') }, [2.2, 4.2, 2.6]);
  },
  head(p, o) {
    const hc: V3 = [0.6 + o.dx, o.dy, 15.0 + o.dz];
    const hr: V3 = [4.8, 4.4, 4.0];
    p.push({ k: 'ell', c: hc, r: hr, mat: fur(EAGLE_WHITE), group: 'head' });
    // ruffled white nape feathers
    for (const y of [-1.6, 0, 1.6]) p.push({ k: 'cap', a: [hc[0] - 2.6, hc[1] + y * 0.6, hc[2] + 1.6], b: [hc[0] - 4.8, hc[1] + y * 1.2, hc[2] + 0.8], r: 0.9, r2: 0.35, mat: fur(EAGLE_WHITE), group: 'nape' });
    // big hooked yellow beak
    p.push({ k: 'cap', a: [hc[0] + 3.0, hc[1], hc[2] + 0.9], b: [hc[0] + 8.4, hc[1], hc[2] + 0.2], r: 2.3, r2: 1.1, mat: { ramp: H('#7a5008', '#b88010', '#e8b020', '#ffd84a') }, group: 'beak' });
    p.push({ k: 'cap', a: [hc[0] + 8.2, hc[1], hc[2] + 0.2], b: [hc[0] + 9.2, hc[1], hc[2] - 1.4], r: 1.0, r2: 0.45, mat: { ramp: H('#5a3a06', '#8a600c', '#b88010') }, group: 'beak' });
    // black aviator shades over the eyes
    shadesOnEyes(p, hc, hr, 2.2, 2.0, 1.7);
  },
  tail(p, o) {
    for (const [y, l] of [
      [-1.4, 12.0],
      [0, 13.2],
      [1.4, 12.0],
    ] as const)
      p.push({ k: 'cap', a: [-6.4, y * 0.5, 6.6], b: [-l, y * 1.5 + o.sway * 0.4, 6.2], r: 1.3, r2: 0.8, mat: { ramp: H('#6a6458', '#a8a294', '#d8d2c4', '#f2eee4') }, group: 'tail' });
  },
};

export const EXTRA_RIGS: Record<'vorona' | 'zmeya' | 'varan' | 'popugay' | 'piranya' | 'akula' | 'oryol' | 'leopard' | 'slon' | 'lobster', Rig> = { vorona, zmeya, varan, popugay, piranya, akula, oryol, leopard, slon, lobster };

export type { PoseOffsets };
