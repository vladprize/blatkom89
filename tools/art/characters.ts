/**
 * Top-down character rigs for the four playable characters, following the reference sheets in
 * /references (03–06). Models face +x; y+ is the character's right side; z is up.
 */
import { hex } from './lib/raster.js';
import type { RGBA } from './lib/raster.js';
import type { Material, Prim, V3, PatternCtx } from './lib/model.js';

export type CharId = 'petya' | 'valuta' | 'uchastkovy' | 'mihalych';
export type WeaponKey = 'pistol' | 'obrez' | 'avtomat' | 'montirovka';

const H = (...c: string[]): RGBA[] => c.map((x) => hex(x));

// ── Shared materials ─────────────────────────────────────────────────────────
export const MAT = {
  gunmetal: { ramp: H('#0e0f12', '#1b1d22', '#2b2e35', '#444852', '#666c78'), spec: { color: hex('#a9b2c4'), power: 22, threshold: 0.82 } } as Material,
  wood: { ramp: H('#3a1a0a', '#5e2c12', '#86441e', '#a85c2c', '#c87a40') } as Material,
  steel: { ramp: H('#24272d', '#3f444d', '#626874', '#8b929e', '#b4bac4'), spec: { color: hex('#e6ecf4'), power: 18, threshold: 0.8 } } as Material,
  redPaint: { ramp: H('#4a0a0c', '#86120f', '#c0201a', '#e8452e') } as Material,
  gold: { ramp: H('#5e400c', '#9a6c18', '#d4a232', '#f6d470'), spec: { color: hex('#fff7d0'), power: 12, threshold: 0.7 } } as Material,
  cigarette: { ramp: H('#9a958a', '#c9c4b8', '#efebe2') } as Material,
  ember: { ramp: H('#ff8a24'), flat: true } as Material,
  black: { ramp: H('#060608', '#101014', '#1c1c22') } as Material,
  eyeDark: { ramp: H('#0a0806'), flat: true } as Material,
  eyeYellow: { ramp: H('#ffd23c'), flat: true } as Material,
  eyeAmber: { ramp: H('#f0b030'), flat: true } as Material,
  glint: { ramp: H('#fff8e8'), flat: true } as Material,
};

interface Palette {
  torso: Material;
  sleeve: Material;
  hand: Material;
  pants: Material;
  shoe: Material;
}

export interface Rig {
  id: CharId;
  torsoC: V3;
  torsoR: V3;
  shoulderY: number;
  shoulderZ: number;
  armR: number;
  headC: V3;
  hipY: number;
  footR: V3;
  pal: Palette;
  /** Extra torso details (collars, chains, medals, epaulettes). */
  torsoExtras(p: Prim[], o: PoseOffsets): void;
  head(p: Prim[], o: PoseOffsets): void;
  tail?(p: Prim[], o: PoseOffsets): void;
}

export interface PoseOffsets {
  /** Whole-upper-body offset (recoil, hit). */
  dx: number;
  dy: number;
  dz: number;
  yaw: number;
  breathe: number;
  sway: number;
}

// ── Patterns ─────────────────────────────────────────────────────────────────
const stripeArm = (white: RGBA, dark: RGBA) => (c: PatternCtx) => {
  const s = Math.abs(c.s);
  if (s > 0.35 && s < 1.0) return white;
  if (s >= 1.0 && s < 1.25) return dark;
  return null;
};

// ── Petya «Комендант» — rooster, red tracksuit with white stripes ───────────
const PETYA_RED = H('#33080c', '#5e0f14', '#8f171a', '#bd2420', '#e2402e');
const PETYA_WHITE = hex('#ece6da');
const PETYA_WHITE_SH = hex('#a9a296');
const petya: Rig = {
  id: 'petya',
  torsoC: [-0.2, 0, 8.4],
  torsoR: [5.7, 11, 5.4],
  shoulderY: 8.6,
  shoulderZ: 11.6,
  armR: 2.35,
  headC: [0.2, 0, 15.2],
  hipY: 4.2,
  footR: [2.6, 1.6, 1.2],
  pal: {
    torso: {
      ramp: PETYA_RED,
      pattern: (c) => {
        const ay = Math.abs(c.ly);
        if (ay > 6.0 && ay < 7.0) return c.nz > 0.55 ? PETYA_WHITE : PETYA_WHITE_SH;
        if (ay > 7.8 && ay < 8.8) return c.nz > 0.5 ? PETYA_WHITE : PETYA_WHITE_SH;
        if (c.lx > 3.6 && Math.abs(c.ly) < 0.45) return hex('#d8d2c4');
        return null;
      },
    },
    sleeve: { ramp: PETYA_RED, pattern: stripeArm(PETYA_WHITE, hex('#5a0e12')) },
    hand: { ramp: H('#7a3e0a', '#c06a14', '#e89a2a', '#ffc45a') },
    pants: {
      ramp: H('#0b0b0f', '#17171d', '#25252d', '#393943'),
      pattern: (c) => (Math.abs(c.s) > 1.1 && Math.abs(c.s) < 1.6 ? PETYA_WHITE : null),
    },
    shoe: { ramp: H('#7a3e0a', '#c06a14', '#e89a2a', '#ffc45a') },
  },
  torsoExtras(p, o) {
    // tracksuit collar: red with white zip edge around the neck
    p.push({ k: 'ell', c: [1.2 + o.dx, o.dy, 12.8 + o.dz], r: [5.4, 6.2, 1.9], yaw: o.yaw, mat: { ramp: PETYA_RED, pattern: (c) => { const r = Math.sqrt((c.lx / 5.4) ** 2 + (c.ly / 6.2) ** 2); return r > 0.78 && r < 0.9 ? PETYA_WHITE : null; } }, group: 'collar' });
  },
  head(p, o) {
    const hc: V3 = [0.4 + o.dx, o.dy, 15.0 + o.dz];
    const feathers: Material = { ramp: H('#5a4630', '#8e7854', '#bfac84', '#e2d4b0', '#f6eedb'), dither: true };
    p.push({ k: 'ell', c: hc, r: [5.0, 4.7, 4.3], mat: feathers, group: 'head', yaw: o.yaw * 0.5 });
    // wattle + beak
    p.push({ k: 'ell', c: [hc[0] + 5.6, hc[1], hc[2] - 3.2], r: [1.8, 1.5, 1.6], mat: { ramp: H('#5a0c0e', '#9c1414', '#d92a1e', '#ff5a3c') }, group: 'wattle' });
    p.push({ k: 'cap', a: [hc[0] + 4.2, hc[1], hc[2] - 0.6], b: [hc[0] + 8.6, hc[1], hc[2] - 1.4], r: 1.75, r2: 0.5, mat: { ramp: H('#8a4a08', '#d08a12', '#f2b630', '#ffe07a') }, group: 'beak' });
    // comb: serrated ridge front-to-back
    const comb: Material = { ramp: H('#4a080a', '#8a1010', '#c81c16', '#ee3a26', '#ff6a48') };
    const lobes: Array<[number, number, number, number]> = [
      [-4.6, 1.5, 1.3, 0.2],
      [-2.6, 2.0, 1.0, 1.0],
      [-0.4, 2.2, 1.45, 1.4],
      [1.8, 1.9, 1.05, 1.1],
      [3.6, 1.4, 1.25, 0.4],
    ];
    for (const [x, rx, ry, zb] of lobes) p.push({ k: 'ell', c: [hc[0] + x, hc[1], hc[2] + 4.0 + zb], r: [rx, ry, 1.9], mat: comb, group: 'comb' });
    // eyes (angry, at the sides)
    for (const s of [-1, 1]) {
      p.push({ k: 'ell', c: [hc[0] + 3.0, hc[1] + s * 3.3, hc[2] + 1.9], r: [0.75, 0.6, 0.6], mat: MAT.eyeAmber, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] + 3.4, hc[1] + s * 3.35, hc[2] + 2.2], r: [0.45, 0.45, 0.5], mat: MAT.eyeDark, group: 'eye' });
    }
  },
  tail(p, o) {
    const tail: Material = { ramp: H('#07080b', '#0f1418', '#18232a', '#24363c'), spec: { color: hex('#4f8f86'), power: 9, threshold: 0.8 } };
    const sw = o.sway;
    p.push({ k: 'cap', a: [-5.5, -1.2, 8.5], b: [-11.5, -2.6 + sw, 10.5], r: 1.4, r2: 0.6, mat: tail, group: 'tail' });
    p.push({ k: 'cap', a: [-5.5, 0.2, 9], b: [-13, 0.8 + sw, 11.2], r: 1.6, r2: 0.6, mat: tail, group: 'tail' });
    p.push({ k: 'cap', a: [-5.5, 1.4, 8.5], b: [-11, 3.4 + sw, 10.2], r: 1.3, r2: 0.5, mat: tail, group: 'tail' });
  },
};

// ── Valuta «Фарцовщик» — black panther, leather jacket, gold chain ───────────
const LEATHER: Material = {
  ramp: H('#060609', '#101016', '#1b1b23', '#2a2a35', '#3c3d4b'),
  spec: { color: hex('#8a93b8'), power: 10, threshold: 0.7 },
};
const valuta: Rig = {
  id: 'valuta',
  torsoC: [-0.2, 0, 8.4],
  torsoR: [5.9, 11.2, 5.4],
  shoulderY: 8.8,
  shoulderZ: 11.6,
  armR: 2.45,
  headC: [0.2, 0, 15.2],
  hipY: 4.2,
  footR: [3.0, 1.5, 1.1],
  pal: {
    torso: {
      ...LEATHER,
      pattern: (c) => {
        // open front showing the argyle sweater
        if (c.lx > 1.2 && Math.abs(c.ly) < 3.2 - (c.lx - 1.2) * 0.3) {
          const d = (Math.floor((c.ly + 10) * 1.1) + Math.floor((c.lx + 10) * 1.1)) % 2;
          return d ? hex('#7d532d') : hex('#5c391f');
        }
        // seams / zipper lines
        if (Math.abs(Math.abs(c.ly) - 3.6) < 0.25 && c.lx > 0) return hex('#2c2c38');
        return null;
      },
    },
    sleeve: { ...LEATHER, pattern: (c) => (c.t > 0.82 && c.t < 0.92 ? hex('#2a2a35') : null) },
    hand: { ramp: H('#08080b', '#15151b', '#24242d', '#363844') },
    pants: { ramp: H('#09090c', '#141419', '#202027', '#30303a'), pattern: (c) => (Math.abs(c.s) > 1.0 && Math.abs(c.s) < 1.35 ? hex('#7a1418') : null) },
    shoe: { ramp: H('#040405', '#0e0e12', '#1e1e26', '#3a3c48'), spec: { color: hex('#9aa2c0'), power: 18, threshold: 0.8 } },
  },
  torsoExtras(p, o) {
    // jacket collar flaps + sweater at the open front
    p.push({ k: 'ell', c: [3.4 + o.dx, o.dy, 12.0 + o.dz], r: [3.2, 3.6, 1.6], mat: { ramp: H('#2a1a0e', '#4e3018', '#74492a', '#9a6a3c'), pattern: (c) => ((Math.floor((c.ly + 20) * 0.9) + Math.floor((c.lx + 20) * 0.9)) % 2 ? 0.6 : null) }, group: 'sweater' });
    for (const s of [-1, 1])
      p.push({ k: 'ell', c: [1.6 + o.dx, s * 5.4 + o.dy, 12.6 + o.dz], r: [3.6, 2.0, 1.6], yaw: s * 0.55 + o.yaw, mat: LEATHER, group: 'collar' + s });
    // gold chain around the neck (thick, visible around the head) + $ pendant
    const N = 12;
    for (let i = 0; i < N; i++) {
      const a0 = -1.8 + (3.6 * i) / N;
      const a1 = -1.8 + (3.6 * (i + 1)) / N;
      const zA = 13.6 + o.dz - Math.abs(Math.sin(a0)) * 0.6;
      const zB = 13.6 + o.dz - Math.abs(Math.sin(a1)) * 0.6;
      p.push({ k: 'cap', a: [0.6 + Math.cos(a0) * 5.4 + o.dx, Math.sin(a0) * 5.7 + o.dy, zA], b: [0.6 + Math.cos(a1) * 5.4 + o.dx, Math.sin(a1) * 5.7 + o.dy, zB], r: 0.8, mat: { ...MAT.gold, pattern: (c) => (Math.floor(c.t * 3) % 2 ? 0.7 : null) }, group: 'chain' });
    }
    p.push({ k: 'ell', c: [6.8 + o.dx, o.dy, 13.0 + o.dz], r: [1.3, 1.1, 0.7], mat: MAT.gold, group: 'pendant' });
  },
  head(p, o) {
    const hc: V3 = [0.4 + o.dx, o.dy, 15.2 + o.dz];
    const fur: Material = { ramp: H('#08080a', '#131317', '#1e1e25', '#2d2f39', '#4a4d5c'), spec: { color: hex('#6a7090'), power: 9, threshold: 0.84 } };
    p.push({ k: 'ell', c: hc, r: [5.0, 4.8, 4.4], mat: fur, group: 'head' });
    for (const s of [-1, 1]) {
      p.push({ k: 'ell', c: [hc[0] - 1.2, hc[1] + s * 4.1, hc[2] + 3.4], r: [1.7, 1.6, 1.6], mat: fur, group: 'ear' + s });
      p.push({ k: 'ell', c: [hc[0] - 1.0, hc[1] + s * 4.0, hc[2] + 3.9], r: [0.8, 0.8, 0.9], mat: { ramp: H('#2a1c22', '#3d2a32') }, group: 'ear' + s });
    }
    p.push({ k: 'ell', c: [hc[0] + 4.6, hc[1], hc[2] - 1.0], r: [2.8, 2.6, 2.1], mat: { ramp: H('#0c0c0f', '#19191f', '#282830', '#3a3c46') }, group: 'muzzle' });
    p.push({ k: 'ell', c: [hc[0] + 7.0, hc[1], hc[2] - 0.2], r: [0.8, 1.0, 0.6], mat: MAT.black, group: 'nose' });
    for (const s of [-1, 1]) {
      p.push({ k: 'ell', c: [hc[0] + 3.0, hc[1] + s * 2.5, hc[2] + 2.5], r: [1.15, 0.85, 0.7], yaw: s * -0.3, mat: MAT.eyeYellow, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] + 3.3, hc[1] + s * 2.5, hc[2] + 2.8], r: [0.4, 0.3, 0.5], mat: MAT.eyeDark, group: 'eye' });
      // whiskers
      p.push({ k: 'cap', a: [hc[0] + 5.4, hc[1] + s * 2.0, hc[2] - 0.5], b: [hc[0] + 4.6, hc[1] + s * 6.6, hc[2] - 0.6], r: 0.22, mat: { ramp: H('#cfcac0', '#f2efe6'), flat: true }, group: 'whisker' });
    }
    // cigarette
    p.push({ k: 'cap', a: [hc[0] + 5.6, hc[1] + 1.8, hc[2] - 1.0], b: [hc[0] + 8.6, hc[1] + 4.2, hc[2] - 1.0], r: 0.55, mat: MAT.cigarette, group: 'cig' });
    p.push({ k: 'ell', c: [hc[0] + 8.9, hc[1] + 4.45, hc[2] - 0.9], r: [0.6, 0.6, 0.5], mat: MAT.ember, group: 'ember' });
  },
  tail(p, o) {
    const fur: Material = { ramp: H('#060608', '#111115', '#1d1d24', '#2c2e38') };
    const sw = o.sway * 1.4;
    p.push({ k: 'cap', a: [-6.5, 0.8, 6.8], b: [-12, 2.8 + sw * 0.5, 6.0], r: 1.5, r2: 1.3, mat: fur, group: 'tail' });
    p.push({ k: 'cap', a: [-12, 2.8 + sw * 0.5, 6.0], b: [-16.5, 6.5 + sw, 5.4], r: 1.3, r2: 1.0, mat: fur, group: 'tail' });
  },
};

// ── Uchastkovy «Всех знает» — wolf, militia uniform, peaked cap ──────────────
const NAVY = H('#0c1220', '#162038', '#233356', '#344b7c', '#4d68a2');
const RED = H('#4a0c10', '#8e1a1d', '#c42a26', '#e8503c');
const uchastkovy: Rig = {
  id: 'uchastkovy',
  torsoC: [-0.2, 0, 8.4],
  torsoR: [5.8, 11.2, 5.4],
  shoulderY: 8.7,
  shoulderZ: 11.6,
  armR: 2.4,
  headC: [0.2, 0, 15.2],
  hipY: 4.3,
  footR: [2.9, 1.7, 1.2],
  pal: {
    torso: {
      ramp: NAVY,
      pattern: (c) => {
        if (c.lx > 3.2 && Math.abs(c.ly) < 0.35) return hex('#c9a43a'); // buttons line
        if (Math.abs(Math.abs(c.ly) - 2.4) < 0.3 && c.lx > 2.8) return hex('#101a30'); // lapels
        return null;
      },
    },
    sleeve: { ramp: NAVY, pattern: (c) => (c.t > 0.86 && c.t < 0.95 ? RED[2]! : null) },
    hand: { ramp: H('#3e3f46', '#62646e', '#8a8c96', '#b4b6be') },
    pants: { ramp: NAVY, pattern: (c) => (Math.abs(c.s) > 1.1 && Math.abs(c.s) < 1.45 ? RED[2]! : null) },
    shoe: { ramp: H('#040405', '#0e0e12', '#1c1c22', '#33343c'), spec: { color: hex('#8a92a8'), power: 16, threshold: 0.82 } },
  },
  torsoExtras(p, o) {
    // red shoulder boards with a gold stripe
    for (const s of [-1, 1]) {
      p.push({ k: 'box', c: [-0.6 + o.dx, s * 8.3 + o.dy, 12.2 + o.dz], h: [2.6, 1.3, 0.6], yaw: o.yaw, mat: { ramp: RED, pattern: (c) => (Math.abs(c.lx) < 0.35 ? hex('#d8b040') : null) }, group: 'board' + s, bevel: 0.4 });
    }
    // collar with red tabs
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [2.6 + o.dx, s * 3.6 + o.dy, 12.6 + o.dz], r: [1.8, 1.4, 1.1], mat: { ramp: RED }, group: 'tab' + s });
    // holster belt strap across the back
    p.push({ k: 'cap', a: [-4 + o.dx, -7 + o.dy, 12.6 + o.dz], b: [-2 + o.dx, 7 + o.dy, 12.9 + o.dz], r: 0.6, mat: { ramp: H('#2a160a', '#4a2a14', '#6a4020') }, group: 'strap' });
  },
  head(p, o) {
    const hc: V3 = [0.2 + o.dx, o.dy, 15.2 + o.dz];
    const fur: Material = { ramp: H('#3a3b42', '#5d5f69', '#868892', '#b0b2ba', '#d4d6dc'), dither: true };
    // snout under the visor
    p.push({ k: 'cap', a: [hc[0] + 3.0, hc[1], hc[2] - 0.6], b: [hc[0] + 10.6, hc[1], hc[2] - 1.0], r: 2.9, r2: 1.7, mat: { ramp: H('#5f616b', '#8a8c96', '#b4b6be', '#d8dae0'), dither: true }, group: 'snout' });
    p.push({ k: 'ell', c: [hc[0] + 11.6, hc[1], hc[2] - 0.6], r: [1.2, 1.3, 0.8], mat: MAT.black, group: 'nose' });
    p.push({ k: 'ell', c: hc, r: [5.0, 4.7, 4.2], mat: fur, group: 'head' });
    // ears poking out at the sides under the cap
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [hc[0] - 1.5, hc[1] + s * 5.6, hc[2] + 1.6], r: [1.6, 1.4, 1.2], mat: fur, group: 'ear' + s });
    // peaked cap: crown, red band ring, visor, cockade
    const crown: Material = {
      ramp: H('#0a0f1c', '#131c32', '#1e2c4c', '#2e426c', '#46608e'),
      pattern: (c) => {
        const rr = Math.sqrt((c.lx / 6.6) ** 2 + (c.ly / 6.2) ** 2);
        if (rr > 0.8) return RED[rr > 0.92 ? 1 : 2]!;
        return null;
      },
    };
    p.push({ k: 'ell', c: [hc[0] - 0.4, hc[1], hc[2] + 3.6], r: [6.6, 6.2, 2.0], mat: crown, group: 'cap' });
    p.push({ k: 'ell', c: [hc[0] + 6.2, hc[1], hc[2] + 2.2], r: [1.7, 4.4, 0.6], mat: { ramp: H('#040406', '#0e0e12', '#1e1e26'), spec: { color: hex('#9aa4c0'), power: 14, threshold: 0.8 } }, group: 'visor' });
    p.push({ k: 'ell', c: [hc[0] + 4.6, hc[1], hc[2] + 5.0], r: [0.9, 0.8, 0.6], mat: MAT.gold, group: 'cockade' });
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [hc[0] + 6.6, hc[1] + s * 1.7, hc[2] + 0.4], r: [0.6, 0.5, 0.5], mat: MAT.eyeAmber, group: 'eye' });
  },
  tail(p, o) {
    const fur: Material = { ramp: H('#2a2b31', '#43454e', '#5f616b', '#7f818b'), dither: true };
    const sw = o.sway;
    p.push({ k: 'cap', a: [-6.5, 0.8, 6.8], b: [-10.5, 2.0 + sw * 0.6, 6.4], r: 1.5, r2: 2.2, mat: fur, group: 'tail' });
    p.push({ k: 'cap', a: [-10.5, 2.0 + sw * 0.6, 6.4], b: [-13.2, 2.8 + sw, 6.0], r: 2.2, r2: 0.9, mat: { ramp: H('#1c1d22', '#33343b', '#4c4e57', '#686a74'), dither: true }, group: 'tail' });
  },
};

// ── Mihalych «Дембель» — bear, olive coat, telnyashka, medals ────────────────
const OLIVE = H('#20250f', '#353d1d', '#4f592b', '#6b773c', '#8a9754');
const mihalych: Rig = {
  id: 'mihalych',
  torsoC: [-0.6, 0, 8.6],
  torsoR: [6.8, 12.8, 5.8],
  shoulderY: 10.2,
  shoulderZ: 12.0,
  armR: 2.9,
  headC: [0.2, 0, 15.8],
  hipY: 5.2,
  footR: [3.2, 2.0, 1.3],
  pal: {
    torso: {
      ramp: OLIVE,
      pattern: (c) => {
        // telnyashka at the open collar
        if (c.lx > 1.5 && Math.abs(c.ly) < 3.4 - (c.lx - 1.5) * 0.35) return Math.floor(c.lx * 1.6) % 2 ? hex('#1d3566') : hex('#e6e6ea');
        // pockets & seams
        if (c.lx > -2 && c.lx < 1.2 && Math.abs(Math.abs(c.ly) - 6.2) < 1.6) return Math.abs(Math.abs(c.ly) - 6.2) > 1.3 ? hex('#262c13') : 0.4;
        if (Math.abs(c.ly) < 0.3 && c.lx < -1) return hex('#2a3015');
        return null;
      },
      dither: true,
    },
    sleeve: { ramp: OLIVE, pattern: (c) => (c.t > 0.84 && c.t < 0.95 ? hex('#2a3015') : null) },
    hand: { ramp: H('#2e1a0e', '#4d2e18', '#6e4424', '#925c32') },
    pants: { ramp: H('#121a2c', '#1c2944', '#2a3c64', '#3c5486') },
    shoe: { ramp: H('#1e1208', '#352010', '#52341c', '#704c2a') },
  },
  torsoExtras(p, o) {
    // medals on the chest (left side)
    const medals: Array<[number, number, string]> = [
      [4.6, -6.8, '#d4a232'],
      [5.0, -5.0, '#c0201a'],
      [4.2, -8.4, '#d4a232'],
    ];
    for (const [x, y, col] of medals) p.push({ k: 'ell', c: [x + o.dx, y + o.dy, 13.4 + o.dz], r: [0.85, 0.8, 0.6], mat: { ramp: H('#3a2a08', col, '#ffe9a0') }, group: 'medal' });
    // telnyashka neck ring + coat collar
    p.push({ k: 'ell', c: [1.4 + o.dx, o.dy, 13.0 + o.dz], r: [6.6, 7.0, 1.8], mat: { ramp: H('#c8c8cc', '#e6e6ea'), flat: true, pattern: (c) => (Math.floor((Math.atan2(c.ly, c.lx) + 4) * 5.5) % 2 ? hex('#1d3566') : null) }, group: 'telnyashka' });
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [1.0 + o.dx, s * 6.4 + o.dy, 13.6 + o.dz], r: [3.6, 2.2, 1.6], yaw: s * 0.5 + o.yaw, mat: { ramp: OLIVE }, group: 'collar' + s });
    // coat skirt flaring at the back
    p.push({ k: 'ell', c: [-6.5 + o.dx, o.dy, 6.2 + o.dz * 0.5], r: [4.2, 11.4, 3.6], mat: { ramp: OLIVE }, group: 'skirt' });
  },
  head(p, o) {
    const hc: V3 = [0.4 + o.dx, o.dy, 15.8 + o.dz];
    const fur: Material = { ramp: H('#2a170c', '#472a16', '#683f22', '#8d5a30', '#ae7642'), dither: true };
    p.push({ k: 'ell', c: hc, r: [6.0, 5.8, 5.0], mat: fur, group: 'head' });
    for (const s of [-1, 1]) {
      p.push({ k: 'ell', c: [hc[0] - 1.6, hc[1] + s * 5.0, hc[2] + 3.6], r: [2.2, 2.2, 1.8], mat: fur, group: 'ear' + s });
      p.push({ k: 'ell', c: [hc[0] - 1.3, hc[1] + s * 4.9, hc[2] + 4.3], r: [1.1, 1.1, 1.0], mat: { ramp: H('#3a2014', '#5a3420', '#7a4a2c') }, group: 'ear' + s });
    }
    p.push({ k: 'ell', c: [hc[0] + 5.2, hc[1], hc[2] - 1.2], r: [3.4, 3.1, 2.5], mat: { ramp: H('#6a4626', '#94683c', '#ba8c5a', '#d8ac78') }, group: 'muzzle' });
    p.push({ k: 'ell', c: [hc[0] + 8.0, hc[1], hc[2] - 0.2], r: [1.2, 1.5, 0.8], mat: MAT.black, group: 'nose' });
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [hc[0] + 3.0, hc[1] + s * 2.9, hc[2] + 3.2], r: [0.65, 0.6, 0.6], mat: MAT.eyeDark, group: 'eye' });
    p.push({ k: 'cap', a: [hc[0] + 6.4, hc[1] - 2.0, hc[2] - 1.6], b: [hc[0] + 9.6, hc[1] - 4.4, hc[2] - 1.6], r: 0.6, mat: MAT.cigarette, group: 'cig' });
    p.push({ k: 'ell', c: [hc[0] + 9.9, hc[1] - 4.6, hc[2] - 1.5], r: [0.65, 0.65, 0.5], mat: MAT.ember, group: 'ember' });
  },
};

export const RIGS: Record<CharId, Rig> = { petya, valuta, uchastkovy, mihalych };

// ── Pose construction ────────────────────────────────────────────────────────

export type TorsoAnim = 'idle' | 'shoot' | 'reload' | 'hit' | 'swing';

export interface TorsoPose {
  weapon: WeaponKey;
  anim: TorsoAnim;
  frame: number;
  frames: number;
}

function rot(x: number, y: number, a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

/** Two-segment arm with an elbow pushed outward from the body. */
function arm(p: Prim[], rig: Rig, side: -1 | 1, hand: V3, o: PoseOffsets, sleeve: Material) {
  const sh: V3 = [-0.2 + o.dx, side * rig.shoulderY + o.dy, rig.shoulderZ + o.dz];
  const mid: V3 = [(sh[0] + hand[0]) / 2, (sh[1] + hand[1]) / 2, (sh[2] + hand[2]) / 2 + 0.6];
  const dx = hand[0] - sh[0];
  const dy = hand[1] - sh[1];
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  // perpendicular pointing away from the body midline
  let px = -dy / l;
  let py = dx / l;
  if (py * side < 0) {
    px = -px;
    py = -py;
  }
  const bend = Math.min(3.6, Math.max(0, 11 - l) * 0.55 + 1.2);
  const elbow: V3 = [mid[0] + px * bend, mid[1] + py * bend, mid[2]];
  p.push({ k: 'cap', a: sh, b: elbow, r: rig.armR, r2: rig.armR * 0.92, mat: sleeve, group: 'arm' + side });
  p.push({ k: 'cap', a: elbow, b: hand, r: rig.armR * 0.92, r2: rig.armR * 0.82, mat: sleeve, group: 'arm' + side });
  p.push({ k: 'ell', c: hand, r: [rig.armR * 0.85, rig.armR * 0.8, rig.armR * 0.75], mat: rig.pal.hand, group: 'hand' + side });
}

interface WeaponPlacement {
  prims: Prim[];
  right: V3;
  left: V3 | null;
}

/** Weapon geometry in body space for the given offsets. `tilt` rotates the weapon around its grip. */
export function weaponPrims(w: WeaponKey, o: PoseOffsets, recoil: number, tilt: number, lower: number, swingAngle = 0): WeaponPlacement {
  const prims: Prim[] = [];
  const z = 11.2 + o.dz - lower;
  const tf = (x: number, y: number, gx: number, gy: number): [number, number] => {
    const [rx, ry] = rot(x - gx, y - gy, tilt);
    return [rx + gx - recoil + o.dx, ry + gy + o.dy];
  };
  if (w === 'pistol') {
    const g: [number, number] = [11.5, 0.8];
    const [x0, y0] = tf(12.5, 0.8, ...g);
    const [x1, y1] = tf(20.5, 0.8, ...g);
    const a = Math.atan2(y1 - y0, x1 - x0);
    prims.push({ k: 'box', c: [(x0 + x1) / 2, (y0 + y1) / 2, z + 0.4], h: [4.2, 1.05, 0.9], yaw: a, mat: MAT.gunmetal, group: 'gun', bevel: 0.5 });
    prims.push({ k: 'box', c: [x0 + 0.6, y0 + 0.1, z + 1.2], h: [1.2, 0.7, 0.4], yaw: a, mat: MAT.gunmetal, group: 'gun' });
    const [rx, ry] = tf(11.6, 1.7, ...g);
    const [lx, ly] = tf(11.2, -0.6, ...g);
    return { prims, right: [rx, ry, z], left: [lx, ly, z - 0.2] };
  }
  if (w === 'avtomat') {
    const g: [number, number] = [9, 5];
    const P = (x: number, y: number) => tf(x, y, ...g);
    const [sx0, sy0] = P(-1.5, 6.6);
    const [sx1, sy1] = P(5.5, 5.4);
    const [rx0, ry0] = P(5.5, 5.4);
    const [rx1, ry1] = P(14, 3.9);
    const [hx1, hy1] = P(20, 2.9);
    const [bx1, by1] = P(28, 1.9);
    prims.push({ k: 'cap', a: [sx0, sy0, z - 0.2], b: [sx1, sy1, z + 0.2], r: 1.25, r2: 1.05, mat: MAT.wood, group: 'gun' });
    const ang = Math.atan2(ry1 - ry0, rx1 - rx0);
    prims.push({ k: 'box', c: [(rx0 + rx1) / 2, (ry0 + ry1) / 2, z + 0.3], h: [4.4, 1.25, 1.0], yaw: ang, mat: MAT.gunmetal, group: 'gun', bevel: 0.5 });
    prims.push({ k: 'cap', a: [rx1, ry1, z + 0.4], b: [hx1, hy1, z + 0.4], r: 1.15, mat: MAT.wood, group: 'gun' });
    prims.push({ k: 'cap', a: [hx1, hy1, z + 0.7], b: [bx1, by1, z + 0.7], r: 0.55, mat: MAT.gunmetal, group: 'gun' });
    // curved magazine sticking out to the side
    const [mx, my] = P(11.5, 5.8);
    prims.push({ k: 'cap', a: [mx, my, z - 0.4], b: [mx + 1.6, my + 2.6, z - 0.8], r: 0.9, mat: MAT.gunmetal, group: 'gun' });
    const [rhx, rhy] = P(9, 5.2);
    const [lhx, lhy] = P(17.2, 2.2);
    return { prims, right: [rhx, rhy, z], left: [lhx, lhy, z] };
  }
  if (w === 'obrez') {
    const g: [number, number] = [7.5, 4.4];
    const P = (x: number, y: number) => tf(x, y, ...g);
    const [gx0, gy0] = P(3.0, 5.4);
    const [gx1, gy1] = P(8.5, 3.9);
    prims.push({ k: 'cap', a: [gx0, gy0, z], b: [gx1, gy1, z + 0.2], r: 1.35, r2: 1.15, mat: MAT.wood, group: 'gun' });
    for (const s of [-0.85, 0.85]) {
      const [ax, ay] = P(8.5, 3.6 + s);
      const [bx, by] = P(22.5, 2.3 + s);
      prims.push({ k: 'cap', a: [ax, ay, z + 0.5], b: [bx, by, z + 0.5], r: 0.92, mat: MAT.gunmetal, group: 'gun' });
    }
    const [fx0, fy0] = P(11, 3.4);
    const [fx1, fy1] = P(16, 2.9);
    prims.push({ k: 'cap', a: [fx0, fy0, z - 0.3], b: [fx1, fy1, z - 0.3], r: 1.05, mat: MAT.wood, group: 'gun' });
    const [rhx, rhy] = P(7.6, 4.6);
    const [lhx, lhy] = P(14, 2.6);
    return { prims, right: [rhx, rhy, z], left: [lhx, lhy, z] };
  }
  // montirovka (crowbar): held in the right hand, swung in an arc around the right shoulder
  const base = swingAngle;
  const shx = -0.2 + o.dx;
  const shy = 8.6 + o.dy;
  const [hx, hy] = rot(8.5, 1.5, base);
  const handX = shx + hx;
  const handY = shy + hy;
  const [tx, ty] = rot(22, 3.5, base);
  const tipX = shx + tx;
  const tipY = shy + ty;
  const [kx, ky] = rot(23.4, 0.8, base);
  prims.push({ k: 'cap', a: [handX - (tipX - handX) * 0.12, handY - (tipY - handY) * 0.12, z + 0.3], b: [tipX, tipY, z + 0.5], r: 0.85, mat: MAT.steel, group: 'gun' });
  prims.push({ k: 'cap', a: [tipX, tipY, z + 0.5], b: [shx + kx, shy + ky, z + 0.5], r: 0.85, r2: 0.6, mat: MAT.redPaint, group: 'gun' });
  const [mx, my] = rot(19.5, 3.1, base);
  prims.push({ k: 'cap', a: [shx + mx, shy + my, z + 0.5], b: [tipX, tipY, z + 0.5], r: 0.9, mat: MAT.redPaint, group: 'gun' });
  return { prims, right: [handX, handY, z], left: null };
}

const ease = (t: number) => t * t * (3 - 2 * t);

export function torsoPrims(id: CharId, pose: TorsoPose): Prim[] {
  const rig = RIGS[id];
  const t = pose.frames > 1 ? pose.frame / (pose.frames - 1) : 0;
  const o: PoseOffsets = { dx: 0, dy: 0, dz: 0, yaw: 0, breathe: 0, sway: 0 };
  let recoil = 0;
  let tilt = 0;
  let lower = 0;
  let swing = 0;
  let leftOverride: V3 | null = null;
  switch (pose.anim) {
    case 'idle':
      o.breathe = pose.frame % 2 ? 0.35 : 0;
      o.sway = pose.frame % 2 ? 0.8 : -0.4;
      break;
    case 'shoot': {
      const k = pose.weapon === 'obrez' ? 3.4 : pose.weapon === 'avtomat' ? 1.9 : 1.6;
      recoil = [k, k * 0.45, 0][pose.frame] ?? 0;
      o.dx = -recoil * 0.25;
      o.sway = 0.3;
      break;
    }
    case 'reload': {
      const b = Math.sin(Math.PI * t);
      tilt = (pose.weapon === 'obrez' ? 0.75 : 0.5) * b;
      lower = 1.4 * b;
      o.sway = b;
      break;
    }
    case 'hit':
      o.dx = pose.frame === 0 ? -2.0 : -1.0;
      o.yaw = pose.frame === 0 ? 0.16 : 0.08;
      o.dy = pose.frame === 0 ? 0.8 : 0.4;
      recoil = 1.2;
      o.sway = -1;
      break;
    case 'swing': {
      // windup → strike across the front → follow-through → recover
      const angles = [1.15, 0.55, -0.45, -1.15, 0.25];
      swing = angles[pose.frame] ?? 0;
      o.yaw = -swing * 0.12;
      break;
    }
  }
  if (pose.weapon === 'montirovka' && pose.anim !== 'swing') swing = pose.anim === 'hit' ? 0.6 : 0.35;

  const p: Prim[] = [];
  const tr = rig.torsoR;
  p.push({
    k: 'ell',
    c: [rig.torsoC[0] + o.dx, rig.torsoC[1] + o.dy, rig.torsoC[2] + o.dz + o.breathe * 0.4],
    r: [tr[0], tr[1] + o.breathe * 0.25, tr[2] + o.breathe],
    yaw: o.yaw,
    mat: rig.pal.torso,
    group: 'torso',
  });
  rig.torsoExtras(p, o);
  rig.tail?.(p, o);
  rig.head(p, o);

  const wp = weaponPrims(pose.weapon, o, recoil, tilt, lower, swing);
  p.push(...wp.prims);
  arm(p, rig, 1, wp.right, o, rig.pal.sleeve);
  let left = wp.left;
  if (pose.anim === 'reload') {
    const pouch: V3 = [4.5 + o.dx, -6.8 + o.dy, 9.4];
    const b = ease(Math.sin(Math.PI * t));
    if (left) left = [left[0] + (pouch[0] - left[0]) * b, left[1] + (pouch[1] - left[1]) * b, left[2] + (pouch[2] - left[2]) * b];
  }
  if (!left) leftOverride = [5.5 + o.dx, -9.2 + o.dy, 9.4];
  arm(p, rig, -1, left ?? leftOverride!, o, rig.pal.sleeve);
  return p;
}

export type LegAnim = 'idle' | 'walk' | 'run';

export function legsPrims(id: CharId, anim: LegAnim, frame: number, frames: number): Prim[] {
  const rig = RIGS[id];
  const p: Prim[] = [];
  const phase = (frame / frames) * Math.PI * 2;
  const amp = anim === 'idle' ? 0 : anim === 'walk' ? 8.0 : 11.0;
  const lift = anim === 'run' ? 2.2 : 1.0;
  for (const side of [-1, 1] as const) {
    const s = Math.sin(phase + (side === 1 ? Math.PI : 0));
    const fx = s * amp + (anim === 'idle' ? (side === 1 ? 2.2 : -1.2) : 0);
    const fz = 1.2 + Math.max(0, Math.cos(phase + (side === 1 ? Math.PI : 0))) * lift;
    const hy = rig.hipY + 0.8;
    const hip: V3 = [-0.6, side * hy, 6.5];
    const ankle: V3 = [fx - 0.6, side * (hy + 0.5), fz + 1.0];
    p.push({ k: 'cap', a: hip, b: ankle, r: 2.3, r2: 1.9, mat: rig.pal.pants, group: 'leg' + side });
    p.push({ k: 'ell', c: [fx + 1.0, side * (hy + 0.6), fz], r: [rig.footR[0] + 0.4, rig.footR[1], rig.footR[2]], mat: rig.pal.shoe, group: 'foot' + side });
    if (id === 'petya') {
      // bird toes
      for (const a of [-0.45, 0, 0.45]) {
        const [tx, ty] = rot(rig.footR[0] + 1.1, 0, a);
        p.push({ k: 'cap', a: [fx + 1.0, side * (hy + 0.6), fz], b: [fx + 1.0 + tx, side * (hy + 0.6) + ty, fz - 0.2], r: 0.6, mat: rig.pal.shoe, group: 'foot' + side });
      }
    }
  }
  return p;
}

/** Falling backwards: f = 0 standing … 1 lying flat. */
export function deathPrims(id: CharId, f: number, weapon: WeaponKey): Prim[] {
  const rig = RIGS[id];
  const e = ease(Math.min(1, f));
  const p: Prim[] = [];
  const o: PoseOffsets = { dx: -7 * e, dy: 0, dz: -5.5 * e, yaw: 0.12 * e, breathe: 0, sway: 2 * e };
  // legs extended forward
  for (const side of [-1, 1] as const) {
    const foot: V3 = [4 + 9 * e, side * (rig.hipY + 1.5 * e), 1.4];
    p.push({ k: 'cap', a: [-2 * e, side * rig.hipY, 5.5 - 3 * e], b: foot, r: 2.3, r2: 1.9, mat: rig.pal.pants, group: 'leg' + side });
    p.push({ k: 'ell', c: [foot[0] + 1.2, foot[1], 1.4], r: rig.footR, mat: rig.pal.shoe, group: 'foot' + side });
  }
  const tr = rig.torsoR;
  p.push({ k: 'ell', c: [rig.torsoC[0] + o.dx, o.dy, rig.torsoC[2] + o.dz], r: [tr[0] + 3.5 * e, tr[1] - 1 * e, tr[2] - 2.2 * e], yaw: o.yaw, mat: rig.pal.torso, group: 'torso' });
  // neck rings / chains slide under the collapsing torso
  rig.torsoExtras(p, { ...o, dz: o.dz - 6 * e, dx: o.dx - 3 * e });
  rig.tail?.(p, { ...o, dx: o.dx * 0.5 });
  // head drops behind the torso
  const ho: PoseOffsets = { ...o, dx: -15 * e, dz: -10 * e, dy: 1.5 * e };
  rig.head(p, ho);
  for (const side of [-1, 1] as const) {
    const hand: V3 = [2 - 9 * e, side * (rig.shoulderY + 3 + 7 * e), 10.5 - 8 * e];
    arm(p, rig, side, hand, { ...o, dz: o.dz * 0.9 }, rig.pal.sleeve);
  }
  if (f < 0.5) {
    const wp = weaponPrims(weapon, o, 2 * e, 0.8 * e, 3 * e, 0.4);
    p.push(...wp.prims);
  }
  return p;
}

export const MUZZLE_OFFSETS: Record<WeaponKey, { forward: number; side: number }> = {
  pistol: { forward: 21, side: 0.8 },
  obrez: { forward: 23, side: 2.3 },
  avtomat: { forward: 28.5, side: 1.9 },
  montirovka: { forward: 24, side: 9 },
};
