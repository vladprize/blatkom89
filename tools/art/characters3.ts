/**
 * Top-down rigs of the ten v0.23 characters, re-modelled from the product owner's sheets
 * (references/27…36): outfit, palette, head shape and accessories as seen from straight above.
 * Same conventions as characters.ts: facing +x, y+ = right side, z up, world px.
 */
import { hex } from './lib/raster.js';
import type { RGBA } from './lib/raster.js';
import type { Material, Prim, V3 } from './lib/model.js';
import { MAT } from './materials.js';
import type { Rig, PoseOffsets } from './characters.js';
import { surf, fur, WHITE, WHITE_SH, shoulderStripes, sleeveStripes, legStripe, goldChain, shadesOnEyes, cigar, backpack, pouches, VEST_OLIVE, SHEARLING } from './characters2.js';

const H = (...c: string[]): RGBA[] => c.map((x) => hex(x));
/** Manual shading for explicit pattern colours (they bypass the lighting). */
const lit = (ramp: RGBA[], nz: number): RGBA => (nz > 0.75 ? ramp[3]! : nz > 0.45 ? ramp[2]! : ramp[1]!);

// ── shared pieces ───────────────────────────────────────────────────────────
const IRON: Material = { ramp: H('#16181c', '#2c3036', '#4a5058', '#6e7680', '#98a0aa'), spec: { color: hex('#e0e6f0'), power: 16, threshold: 0.8 }, pattern: (c) => (Math.floor(c.t * 3) % 2 ? 0.7 : null) };
const LEATHER_STRAP: Material = { ramp: H('#120c08', '#201610', '#30221a', '#423024') };
const BRASS: Material = { ramp: H('#5a3a0c', '#9a6c18', '#d4a232', '#f6d470'), spec: { color: hex('#fff6d0'), power: 12, threshold: 0.78 } };
const WHITE_FUR: Material = { ramp: H('#8a8478', '#b4ae9e', '#d8d2c2', '#efeade', '#fbf8f0'), dither: true };
const BLACK_GLOVE: Material = { ramp: H('#060608', '#101014', '#1c1c22', '#2c2c34') };
const BLACK_LEATHER = H('#060608', '#0e0e12', '#18181e', '#26262e', '#363640');
const BOOTS: Material = { ramp: H('#060608', '#0e0e12', '#1c1c22', '#2e2e36'), spec: { color: hex('#9aa2c0'), power: 18, threshold: 0.8 } };
const RED_EYE: Material = { ramp: H('#ff2a1a'), flat: true };

/** A chain round the neck (any material), like goldChain without a pendant. */
function neckChain(p: Prim[], o: PoseOffsets, rx: number, ry: number, z: number, mat: Material, r = 0.7, cx = 0.6) {
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a0 = -1.8 + (3.6 * i) / N;
    const a1 = -1.8 + (3.6 * (i + 1)) / N;
    p.push({ k: 'cap', a: [cx + Math.cos(a0) * rx + o.dx, Math.sin(a0) * ry + o.dy, z + o.dz - Math.abs(Math.sin(a0)) * 0.6], b: [cx + Math.cos(a1) * rx + o.dx, Math.sin(a1) * ry + o.dy, z + o.dz - Math.abs(Math.sin(a1)) * 0.6], r, mat, group: 'chain' });
  }
}

/** Red star patch on top of a shoulder (side -1: the left). */
function starPatch(p: Prim[], o: PoseOffsets, rig: { shoulderY: number; shoulderZ: number; armR: number }, side: -1 | 1, size = 1.4) {
  const k = size / 1.4;
  p.push({
    k: 'ell',
    c: [-0.2 + o.dx, side * rig.shoulderY + o.dy, rig.shoulderZ + rig.armR + 0.15 + o.dz],
    r: [size, size, 0.3],
    mat: {
      ramp: H('#5a0a0c', '#a01c1a', '#d0302a'),
      pattern: (c) => {
        const a = Math.atan2(c.ly, c.lx);
        const r = Math.hypot(c.lx, c.ly);
        return r < (0.55 + 0.5 * Math.abs(Math.cos(a * 2.5))) * k ? hex('#f0c040') : null;
      },
    },
    group: 'patch',
  });
}

/** An ammunition belt from a to b (body space) with brass rounds along it. */
function bandolier(p: Prim[], o: PoseOffsets, a: V3, b: V3) {
  p.push({ k: 'cap', a: [a[0] + o.dx, a[1] + o.dy, a[2] + o.dz], b: [b[0] + o.dx, b[1] + o.dy, b[2] + o.dz], r: 1.0, mat: LEATHER_STRAP, group: 'bandolier' });
  const n = 9;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    p.push({ k: 'ell', c: [a[0] + (b[0] - a[0]) * t + o.dx, a[1] + (b[1] - a[1]) * t + o.dy, a[2] + (b[2] - a[2]) * t + 0.8 + o.dz], r: [0.45, 0.32, 0.75], mat: BRASS, group: 'round' });
  }
}

/** Default hand plus a band round the wrist (watch, bracelet, wrap, shackle). */
function handWith(p: Prim[], at: V3, side: -1 | 1, rig: Rig, band: Material | null, bandSide: -1 | 0 | 1 = 0) {
  p.push({ k: 'ell', c: at, r: [rig.armR * 0.85, rig.armR * 0.8, rig.armR * 0.75], mat: rig.pal.hand, group: 'hand' + side });
  if (band && (bandSide === 0 || bandSide === side)) p.push({ k: 'ell', c: [at[0] - rig.armR * 0.7, at[1], at[2] + 0.2], r: [rig.armR * 0.32, rig.armR * 0.82, rig.armR * 0.6], mat: band, group: 'band' + side });
}

// ── Мурка «Наводчица» — tabby cat, burgundy leather jacket, black top, long dark hair, cigarette ──
const TABBY = H('#2a2420', '#4a3e36', '#6e5e52', '#948272', '#b8a692');
const tabby: Material = { ramp: TABBY, dither: true, pattern: (c) => (Math.abs(((c.x * 0.9 + Math.sin(c.y * 0.8) * 1.2 + 40) % 2.4) - 1.2) < 0.3 ? -1.4 : null) };
const HAIR: Material = { ramp: H('#0c0806', '#18100c', '#261a14', '#36261c', '#4a3628'), dither: true, pattern: (c) => (Math.abs(((c.y * 1.4 + Math.sin(c.x * 0.9) * 1.5 + 40) % 1.8) - 0.9) < 0.12 ? -1 : null) };
const BURGUNDY: Material = { ramp: H('#1e0408', '#3a0a10', '#5c121a', '#7e1c26', '#a02a34'), spec: { color: hex('#e0a0a8'), power: 10, threshold: 0.72 } };
const koshka: Rig = {
  id: 'koshka',
  torsoC: [-0.2, 0, 8.2],
  torsoR: [5.2, 10.2, 5.0],
  shoulderY: 8.0,
  shoulderZ: 11.2,
  armR: 2.1,
  headC: [0.6, 0, 14.8],
  hipY: 3.8,
  footR: [2.6, 1.3, 1.1],
  pal: {
    torso: {
      ...BURGUNDY,
      pattern: (c) => {
        // the open jacket: a black lace top, tabby fur at the neckline
        if (c.lx > 1.0 && Math.abs(c.ly) < 3.4 - (c.lx - 1.0) * 0.2) {
          if (c.lx > 3.7) return lit(TABBY, c.nz);
          return (Math.floor((c.x + 40) * 2.4) + Math.floor((c.y + 40) * 2.4)) % 3 === 0 ? hex('#2e2630') : hex(c.nz > 0.6 ? '#16121a' : '#0a080c');
        }
        if (Math.abs(((c.x * 0.8 - c.y * 0.35 + 40) % 2.6) - 1.3) < 0.08) return 0.7;
        return null;
      },
    },
    sleeve: { ...BURGUNDY, pattern: (c) => (c.t > 0.82 && c.t < 0.93 ? hex('#2a060c') : Math.abs(((c.t * 6) % 1) - 0.5) < 0.05 ? 0.7 : null) },
    hand: BLACK_GLOVE,
    pants: { ramp: BLACK_LEATHER, spec: { color: hex('#8a8aa0'), power: 14, threshold: 0.8 } },
    shoe: BOOTS,
  },
  torsoExtras(p, o) {
    // wide lapels of the jacket
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [0.8 + o.dx, s * 4.4 + o.dy, 12.3 + o.dz], r: [3.4, 1.5, 1.2], yaw: s * -0.35 + o.yaw, mat: BURGUNDY, group: 'lapel' + s });
    goldChain(p, o, 4.4, 4.6, 13.2, 0.9);
    // a little bag on a strap across the chest, at the left hip
    p.push({ k: 'cap', a: [-2.6 + o.dx, 7.2 + o.dy, 12.6 + o.dz], b: [3.2 + o.dx, -6.4 + o.dy, 10.8 + o.dz], r: 0.32, mat: { ramp: H('#1a0e06', '#2e1a0c', '#46280e') }, group: 'strap' });
    p.push({ k: 'box', c: [2.4 + o.dx, -8.6 + o.dy, 8.2 + o.dz], h: [1.5, 1.4, 1.3], yaw: o.yaw, mat: { ramp: H('#1a0e06', '#2e1a0c', '#46280e', '#5e3a1a') }, group: 'bag', bevel: 0.4 });
    // long dark hair down the back
    p.push({ k: 'ell', c: [-3.4 + o.dx, o.dy, 13.6 + o.dz], r: [3.6, 5.8, 2.2], yaw: o.yaw, mat: HAIR, group: 'hairback' });
    for (const [y, l] of [
      [-3.4, 4.6],
      [-1.2, 6.0],
      [1.2, 5.8],
      [3.4, 4.4],
    ] as const)
      p.push({ k: 'cap', a: [-3.0 + o.dx, y + o.dy, 13.8 + o.dz], b: [-3.0 - l + o.dx, y * 1.15 + o.sway * 0.3 + o.dy, 12.4 + o.dz], r: 1.3, r2: 0.6, mat: HAIR, group: 'hairlock' });
  },
  head(p, o) {
    const hc: V3 = [0.6 + o.dx, o.dy, 14.8 + o.dz];
    const hr: V3 = [4.4, 4.0, 3.8];
    p.push({ k: 'ell', c: hc, r: hr, mat: tabby, group: 'head' });
    // dark hair over the crown and the back of the head
    p.push({ k: 'ell', c: [hc[0] - 1.6, hc[1] + 0.3, hc[2] + 1.0], r: [3.4, 4.6, 3.3], mat: HAIR, group: 'hair' });
    for (const s of [-1, 1]) {
      // pointed ears through the hair
      p.push({ k: 'cap', a: [hc[0] - 0.2, hc[1] + s * 3.2, hc[2] + 2.6], b: [hc[0] - 1.0, hc[1] + s * 5.4, hc[2] + 5.8], r: 1.7, r2: 0.35, mat: fur(H('#4a3e36', '#6e5e52', '#948272', '#b8a692', '#d2c2ac')), group: 'ear' + s });
      p.push({ k: 'cap', a: [hc[0] + 0.2, hc[1] + s * 3.2, hc[2] + 3.0], b: [hc[0] - 0.6, hc[1] + s * 5.0, hc[2] + 5.5], r: 0.85, r2: 0.2, mat: { ramp: H('#6a3a3a', '#a06060') }, group: 'ear' + s });
      // gold hoop earrings
      p.push({ k: 'ell', c: [hc[0] - 0.4, hc[1] + s * 4.3, hc[2] - 0.6], r: [0.7, 0.35, 0.9], mat: MAT.gold, group: 'earring' + s });
    }
    // short cream muzzle, pink nose
    p.push({ k: 'ell', c: [hc[0] + 3.6, hc[1], hc[2] - 1.0], r: [2.0, 2.2, 1.7], mat: fur(H('#8a7a68', '#b8a890', '#dcceb6', '#f2e8d6')), group: 'muzzle' });
    p.push({ k: 'ell', c: [hc[0] + 5.3, hc[1], hc[2] - 0.4], r: [0.6, 0.8, 0.5], mat: { ramp: H('#7a3a40', '#b05a62', '#d27a80') }, group: 'nose' });
    for (const s of [-1, 1]) {
      // big amber eyes with slit pupils, whiskers
      const z = surf(hc, hr, 2.4, s * 2.1, 0.2);
      p.push({ k: 'ell', c: [hc[0] + 2.4, hc[1] + s * 2.1, z], r: [0.95, 0.75, 0.6], yaw: s * -0.3, mat: { ramp: H('#e8a020'), flat: true }, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] + 2.65, hc[1] + s * 2.1, z + 0.25], r: [0.4, 0.18, 0.45], mat: MAT.eyeDark, group: 'eye' });
      p.push({ k: 'cap', a: [hc[0] + 4.4, hc[1] + s * 1.6, hc[2] - 0.8], b: [hc[0] + 3.6, hc[1] + s * 5.4, hc[2] - 0.9], r: 0.18, mat: { ramp: H('#cfcac0', '#f2efe6'), flat: true }, group: 'whisker' });
    }
    cigar(p, [hc[0] + 4.6, hc[1] - 1.4, hc[2] - 1.3], 1.0, -0.8, 3.0, 0.45, MAT.cigarette);
  },
  tail(p, o) {
    const m: Material = { ramp: TABBY, dither: true, pattern: (c) => (Math.floor(c.t * 7) % 2 === 0 ? -1.2 : null) };
    const sw = o.sway * 1.3;
    p.push({ k: 'cap', a: [-5.2, 0.6, 6.4], b: [-11, 2.8 + sw * 0.5, 6.0], r: 1.15, r2: 1.0, mat: m, group: 'tail' });
    p.push({ k: 'cap', a: [-11, 2.8 + sw * 0.5, 6.0], b: [-15.4, 6.2 + sw, 6.4], r: 1.0, r2: 0.7, mat: m, group: 'tail' });
  },
};

// ── Сизый «Химик» — grey pigeon with glowing green eyes, maroon tracksuit, olive vest with vials ──
const PIGEON = H('#1e1c26', '#34303e', '#4c4658', '#686274', '#8a8496');
const pigeon: Material = { ramp: PIGEON, dither: true, pattern: (c) => (Math.abs(((c.x * 1.1 + Math.sin(c.y * 1.3) + 40) % 1.9) - 0.95) < 0.1 ? -1 : null) };
const NECK_SHEEN: Material = { ramp: H('#1a2a22', '#24443a', '#3a6a52', '#5a8a64', '#7aa080'), dither: true, pattern: (c) => (Math.floor((c.x + c.y + 40) * 1.3) % 3 === 0 ? hex('#6a4a8a') : null) };
const MAROON = H('#22060c', '#3e0c16', '#5e1420', '#7e1e2c', '#9c2c3a');
const TOXIC: Material = { ramp: H('#4ac81a', '#9cff48'), flat: true };
const golub: Rig = {
  id: 'golub',
  torsoC: [-0.2, 0, 8.2],
  torsoR: [5.6, 10.8, 5.2],
  shoulderY: 8.4,
  shoulderZ: 11.4,
  armR: 2.3,
  headC: [0.8, 0, 14.8],
  hipY: 4.0,
  footR: [2.4, 1.4, 1.0],
  toes: true,
  pal: {
    torso: {
      ramp: VEST_OLIVE,
      pattern: (c) => {
        // olive vest over the maroon tracksuit (white stripes over the shoulders)
        const ay = Math.abs(c.ly);
        if (ay > 6.4) return shoulderStripes(c, 7.2) ?? lit(MAROON, c.nz);
        if (ay > 5.9) return hex('#14180a');
        // a radiation badge on the left of the chest
        const bx = c.lx - 2.2;
        const by = c.ly + 3.4;
        const r = Math.hypot(bx, by);
        if (r < 1.3) {
          if (r < 0.3) return hex('#141008');
          const sector = Math.floor((Math.atan2(by, bx) + Math.PI) / (Math.PI / 3));
          return sector % 2 === 0 && r > 0.42 && r < 1.1 ? hex('#141008') : hex('#f0c828');
        }
        return Math.abs(((c.x + 40) % 2.0) - 1.0) < 0.1 ? -1 : null;
      },
    },
    sleeve: { ramp: MAROON, pattern: sleeveStripes },
    hand: pigeon,
    pants: { ramp: H('#16141a', '#222028', '#302e38', '#424050') },
    shoe: { ramp: H('#5a1a22', '#8e3038', '#c0565a', '#e07a78') },
  },
  torsoExtras(p, o) {
    // maroon scarf round the neck, the ends down the back
    p.push({ k: 'ell', c: [1.0 + o.dx, o.dy, 13.0 + o.dz], r: [4.8, 5.6, 1.8], yaw: o.yaw, mat: { ramp: MAROON, dither: true }, group: 'scarf' });
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [-2.8 + o.dx, s * 1.4 + o.dy, 13.2 + o.dz], b: [-7.4 + o.dx, s * 2.4 + o.sway * 0.6 + o.dy, 11.6 + o.dz], r: 1.1, r2: 0.7, mat: { ramp: MAROON }, group: 'scarfend' });
    // glowing green vials in the vest's pockets
    for (const [x, y] of [
      [3.4, 4.6],
      [2.6, 6.2],
      [1.4, -6.6],
    ] as const) {
      const z = surf(golub.torsoC, golub.torsoR, x - golub.torsoC[0], y, 0.1);
      p.push({ k: 'cap', a: [x - 0.7 + o.dx, y + o.dy, z - 0.3 + o.dz], b: [x + 0.7 + o.dx, y + o.dy, z + 0.4 + o.dz], r: 0.55, mat: TOXIC, group: 'vial' });
    }
    // the backpack with a radiation sign
    backpack(
      p,
      o,
      golub,
      {
        ramp: H('#1c2010', '#2e341a', '#444c28', '#5c6636'),
        pattern: (c) => {
          if (c.nz < 0.8) return null;
          const r = Math.hypot(c.lx, c.ly);
          if (r > 1.6) return null;
          if (r < 0.35) return hex('#141008');
          const sector = Math.floor((Math.atan2(c.ly, c.lx) + Math.PI) / (Math.PI / 3));
          return sector % 2 === 0 && r > 0.5 && r < 1.35 ? hex('#141008') : hex('#e8c020');
        },
      },
      { ramp: H('#14180a', '#222812', '#323a1a') },
      [2.2, 4.2, 2.6],
    );
  },
  head(p, o) {
    const hc: V3 = [0.8 + o.dx, o.dy, 14.8 + o.dz];
    const hr: V3 = [4.2, 3.8, 3.7];
    // the iridescent neck under the head
    p.push({ k: 'ell', c: [hc[0] - 0.8, hc[1], hc[2] - 1.6], r: [3.6, 4.0, 2.4], mat: NECK_SHEEN, group: 'neck' });
    p.push({ k: 'ell', c: hc, r: hr, mat: pigeon, group: 'head' });
    // ruffled feathers on the crown
    for (const [x, y] of [
      [-1.6, -1.0],
      [-2.4, 0.6],
      [-0.8, 1.4],
    ] as const)
      p.push({ k: 'cap', a: [hc[0] + x, hc[1] + y, hc[2] + 3.0], b: [hc[0] + x - 1.8, hc[1] + y * 1.6, hc[2] + 3.6], r: 0.6, r2: 0.2, mat: pigeon, group: 'tuft' });
    // short dark beak with a pale cere
    p.push({ k: 'cap', a: [hc[0] + 3.2, hc[1], hc[2] + 0.2], b: [hc[0] + 6.4, hc[1], hc[2] - 0.6], r: 1.05, r2: 0.45, mat: { ramp: H('#2a2a30', '#46464e', '#62626c') }, group: 'beak' });
    p.push({ k: 'ell', c: [hc[0] + 3.4, hc[1], hc[2] + 0.9], r: [0.9, 0.8, 0.5], mat: { ramp: H('#c8c4b8', '#ece8dc') }, group: 'cere' });
    // glowing green eyes
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 1.8, s * 2.7, 0.2);
      p.push({ k: 'ell', c: [hc[0] + 1.8, hc[1] + s * 2.7, z], r: [1.05, 0.9, 0.7], mat: TOXIC, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] + 2.0, hc[1] + s * 2.75, z + 0.3], r: [0.32, 0.3, 0.4], mat: MAT.eyeDark, group: 'eye' });
    }
    cigar(p, [hc[0] + 4.8, hc[1] + 1.0, hc[2] - 0.8], 1.0, 0.9, 3.0, 0.45, MAT.cigarette);
  },
  tail(p, o) {
    const m: Material = { ramp: H('#1e1c26', '#34303e', '#4c4658', '#686274'), pattern: (c) => (c.t > 0.8 ? hex('#141218') : null) };
    for (const [y, l] of [
      [-1.6, 10.0],
      [0, 11.0],
      [1.6, 10.0],
    ] as const)
      p.push({ k: 'cap', a: [-5.6, y * 0.5, 6.6], b: [-l, y * 1.4 + o.sway * 0.4, 6.0], r: 1.2, r2: 0.8, mat: m, group: 'tail' });
  },
};

// ── Прусак «Подпольщик» — cockroach in a hooded jacket, round shades, antennae, rucksack ─────────
const CHITIN: Material = { ramp: H('#3a1808', '#5e2c12', '#86441e', '#ae6230', '#d28448'), spec: { color: hex('#f8d8b0'), power: 14, threshold: 0.76 } };
const HOODIE = H('#120c08', '#1e1610', '#2c2218', '#3c3022', '#4e402e');
const tarakan: Rig = {
  id: 'tarakan',
  torsoC: [-0.2, 0, 8.2],
  torsoR: [5.6, 10.8, 5.2],
  shoulderY: 8.4,
  shoulderZ: 11.4,
  armR: 2.25,
  headC: [1.0, 0, 14.4],
  hipY: 4.0,
  footR: [2.6, 1.4, 1.1],
  pal: {
    torso: { ramp: HOODIE, dither: true, pattern: (c) => (Math.abs(((c.x * 0.7 + c.y * 0.2 + 40) % 2.6) - 1.3) < 0.08 ? -1 : null) },
    sleeve: { ramp: HOODIE, pattern: (c) => (c.t > 0.84 ? -1 : null) },
    hand: CHITIN,
    pants: { ramp: H('#14100c', '#201a14', '#2e261e', '#40362a') },
    shoe: { ramp: H('#1a0e06', '#2e1a0c', '#46280e', '#5e3a1a') },
  },
  torsoExtras(p, o) {
    starPatch(p, o, tarakan, -1);
    goldChain(p, o, 4.4, 4.7, 13.0, 0.9);
    pouches(p, o, tarakan, { ramp: H('#2a2014', '#3e301e', '#56442a', '#6e5838') }, [
      [3.4, -5.0],
      [3.4, 5.0],
      [1.6, 6.6],
    ]);
    backpack(p, o, tarakan, { ramp: H('#2e2214', '#44341e', '#5e4a2a', '#7a6238') }, { ramp: H('#1a120a', '#2a1e10', '#3c2c18') }, [2.8, 5.2, 3.2]);
    // a rolled-up mat across the top of the rucksack
    p.push({ k: 'cap', a: [-6.8 + o.dx, -4.6 + o.dy, 14.6 + o.dz], b: [-6.8 + o.dx, 4.6 + o.dy, 14.6 + o.dz], r: 1.2, mat: { ramp: H('#3a1010', '#5a1a16', '#7a2a20', '#9a3a2a') }, group: 'bedroll' });
  },
  head(p, o) {
    const hc: V3 = [1.0 + o.dx, o.dy, 14.4 + o.dz];
    const fc: V3 = [hc[0] + 1.2, hc[1], hc[2] - 0.2];
    const fr: V3 = [4.0, 3.4, 3.2];
    // the hood is up; the glossy chitin face sticks out of it
    p.push({ k: 'ell', c: [hc[0] - 2.8, hc[1], hc[2] + 0.2], r: [3.6, 4.5, 3.8], mat: { ramp: HOODIE, dither: true }, group: 'hood' });
    p.push({ k: 'ell', c: fc, r: fr, mat: CHITIN, group: 'face' });
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [fc[0] + 3.0, fc[1] + s * 1.2, fc[2] - 1.2], b: [fc[0] + 4.4, fc[1] + s * 0.4, fc[2] - 1.4], r: 0.55, r2: 0.25, mat: { ramp: H('#1a0a04', '#3a1a0a', '#5a2c14') }, group: 'mandible' });
    shadesOnEyes(p, fc, fr, 1.2, 1.55, 1.2);
    // long antennae from the forehead, sweeping back over the shoulders
    const m: Material = { ramp: H('#4a2210', '#7a3e1c', '#a85a2c', '#c87a40') };
    for (const s of [-1, 1]) {
      p.push({ k: 'cap', a: [fc[0] + 2.0, fc[1] + s * 0.9, fc[2] + 2.0], b: [fc[0] + 4.6, fc[1] + s * 3.4, fc[2] + 5.0], r: 0.45, r2: 0.38, mat: m, group: 'antenna' });
      p.push({ k: 'cap', a: [fc[0] + 4.6, fc[1] + s * 3.4, fc[2] + 5.0], b: [fc[0] - 3.6, fc[1] + s * 9.0 + o.sway * 0.4, fc[2] + 6.2], r: 0.38, r2: 0.28, mat: m, group: 'antenna' });
      p.push({ k: 'cap', a: [fc[0] - 3.6, fc[1] + s * 9.0 + o.sway * 0.4, fc[2] + 6.2], b: [fc[0] - 10.4, fc[1] + s * 11.0 + o.sway * 0.8, fc[2] + 4.6], r: 0.28, r2: 0.18, mat: m, group: 'antenna' });
    }
    cigar(p, [fc[0] + 3.2, fc[1] + 1.4, fc[2] - 1.4], 1.0, 0.9, 3.0, 0.45, MAT.cigarette);
  },
  tail(p, o) {
    // two little cerci under the jacket's hem
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [-5.2, s * 1.6, 5.4], b: [-8.6, s * 2.8 + o.sway * 0.3, 4.8], r: 0.6, r2: 0.25, mat: CHITIN, group: 'cercus' });
  },
};

// ── Серый «Качок» — huge grey rat with green slime, red striped vest, straps, bare arms ─────────
const RAT = H('#2a2826', '#46423e', '#66605a', '#88827a', '#aca69c');
const slimeAt = (c: { x: number; y: number }): RGBA | null => {
  const n = Math.sin(c.x * 0.8 + Math.sin(c.y * 0.6) * 2.2) * Math.sin(c.y * 0.7 - c.x * 0.3 + 1.3);
  return n > 0.8 ? hex(n > 0.9 ? '#b8ff5a' : '#62c81e') : null;
};
const ratSlime: Material = { ramp: RAT, dither: true, pattern: (c) => slimeAt(c) };
const RAT_HEAD = H('#3a3632', '#5a5450', '#7c766e', '#a09a90', '#c4beb2');
const ratHead: Material = { ramp: RAT_HEAD, dither: true, pattern: (c) => slimeAt({ x: c.x + 3.1, y: c.y + 1.7 }) };
const RAT_RED = H('#3a080a', '#62101a', '#8e1a22', '#b42a2a', '#d4443a');
const PINK_PAW: Material = { ramp: H('#5a3a3a', '#8a5a58', '#b07e7a', '#d0a29a') };
const krysa: Rig = {
  id: 'krysa',
  torsoC: [-0.4, 0, 8.6],
  torsoR: [6.6, 12.6, 5.9],
  shoulderY: 10.2,
  shoulderZ: 12.0,
  armR: 2.95,
  headC: [1.2, 0, 15.2],
  hipY: 5.0,
  footR: [3.2, 2.0, 1.3],
  pal: {
    torso: {
      ramp: RAT_RED,
      pattern: (c) => {
        // a red sleeveless top with two white stripes each side; bare slimy shoulders
        const ay = Math.abs(c.ly);
        if (ay > 8.8) return slimeAt(c) ?? lit(RAT, c.nz);
        if ((ay > 2.2 && ay < 2.9) || (ay > 3.6 && ay < 4.2)) return c.nz > 0.5 ? WHITE : WHITE_SH;
        return null;
      },
    },
    sleeve: ratSlime,
    hand: PINK_PAW,
    pants: { ramp: H('#121214', '#1e1e22', '#2c2c32', '#3e3e46') },
    shoe: { ramp: H('#0e0c0a', '#1c1814', '#2c2620', '#3e362c') },
  },
  hand(p, at, side, rig) {
    // red-and-white striped wrist wraps
    handWith(p, at, side, rig, { ramp: RAT_RED, pattern: (c) => (Math.floor((c.x + 40) * 2.2) % 2 ? WHITE : null) });
  },
  torsoExtras(p, o) {
    // crossed leather straps with brass buckles
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [-4.6 + o.dx, s * 9.0 + o.dy, 12.8 + o.dz], b: [4.6 + o.dx, -s * 7.6 + o.dy, 12.2 + o.dz], r: 0.85, mat: { ...LEATHER_STRAP, pattern: (c) => (Math.abs(((c.t * 4) % 1) - 0.5) < 0.07 ? BRASS.ramp[2]! : null) }, group: 'strap' + s });
    // gold chain with a hammer-and-sickle medallion
    goldChain(p, o, 5.8, 6.4, 14.0, 1.6, 0.8);
  },
  head(p, o) {
    const hc: V3 = [1.2 + o.dx, o.dy, 15.2 + o.dz];
    const hr: V3 = [4.8, 4.6, 4.2];
    p.push({ k: 'ell', c: hc, r: hr, mat: ratHead, group: 'head' });
    // round ears, pink inside
    for (const s of [-1, 1]) {
      p.push({ k: 'ell', c: [hc[0] - 1.8, hc[1] + s * 4.4, hc[2] + 2.0], r: [1.9, 1.7, 1.0], mat: ratHead, group: 'ear' + s });
      p.push({ k: 'ell', c: [hc[0] - 1.6, hc[1] + s * 4.4, hc[2] + 2.5], r: [1.1, 1.0, 0.7], mat: { ramp: H('#7a4a4a', '#a8706c') }, group: 'ear' + s });
    }
    // long snout, open jaw with fangs, pink nose
    p.push({ k: 'cap', a: [hc[0] + 2.4, hc[1], hc[2] - 0.2], b: [hc[0] + 8.6, hc[1], hc[2] - 1.0], r: 2.8, r2: 1.4, mat: ratHead, group: 'snout' });
    p.push({ k: 'ell', c: [hc[0] + 6.2, hc[1], hc[2] - 2.6], r: [2.8, 2.4, 0.9], mat: { ramp: H('#3a0608', '#5e0c10'), flat: true }, group: 'mouth' });
    for (const s of [-1, 1])
      for (const x of [7.4, 5.4]) p.push({ k: 'cap', a: [hc[0] + x, hc[1] + s * 1.5, hc[2] - 1.6], b: [hc[0] + x + 0.4, hc[1] + s * 1.3, hc[2] - 3.0], r: 0.42, r2: 0.12, mat: { ramp: H('#c8c0a8', '#f2ecd8'), flat: true }, group: 'fang' });
    p.push({ k: 'ell', c: [hc[0] + 9.8, hc[1], hc[2] - 0.8], r: [0.9, 1.0, 0.7], mat: { ramp: H('#7a3a40', '#b0606a', '#d8868c') }, group: 'nose' });
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 2.8, s * 2.6, 0.2);
      p.push({ k: 'ell', c: [hc[0] + 2.8, hc[1] + s * 2.6, z], r: [0.85, 0.7, 0.55], mat: RED_EYE, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] + 3.0, hc[1] + s * 2.65, z + 0.25], r: [0.3, 0.28, 0.4], mat: MAT.eyeDark, group: 'eye' });
      p.push({ k: 'cap', a: [hc[0] + 8.4, hc[1] + s * 1.4, hc[2] - 0.6], b: [hc[0] + 7.6, hc[1] + s * 5.4, hc[2] - 0.8], r: 0.18, mat: { ramp: H('#cfcac0', '#f2efe6'), flat: true }, group: 'whisker' });
    }
  },
  tail(p, o) {
    const m: Material = { ...PINK_PAW, pattern: (c) => (Math.floor(c.t * 14) % 2 ? -1 : null) };
    const sw = o.sway * 1.2;
    p.push({ k: 'cap', a: [-6.6, 0, 6.0], b: [-12.4, -2.6 + sw * 0.5, 4.6], r: 1.5, r2: 1.1, mat: m, group: 'tail' });
    p.push({ k: 'cap', a: [-12.4, -2.6 + sw * 0.5, 4.6], b: [-18.4, -1.0 + sw, 3.6], r: 1.1, r2: 0.6, mat: m, group: 'tail' });
    p.push({ k: 'cap', a: [-18.4, -1.0 + sw, 3.6], b: [-22.0, 2.6 + sw * 1.3, 3.2], r: 0.6, r2: 0.3, mat: m, group: 'tail' });
  },
};

// ── Аркадич «Цеховик» — lion with a big mane, red coat with a white fur collar, shades, cigar ────
const LION = H('#6a3e10', '#9a6020', '#c4862e', '#e2a84a', '#f6cc78');
const MANE = H('#3a1606', '#5e260c', '#843a14', '#a8521e', '#c8702c');
const VELVET: Material = { ramp: H('#2e0408', '#520a10', '#7a1218', '#a01c20', '#c42e2a'), dither: true };
const lev: Rig = {
  id: 'lev',
  torsoC: [-0.4, 0, 8.6],
  torsoR: [6.4, 12.2, 5.8],
  shoulderY: 9.8,
  shoulderZ: 12.0,
  armR: 2.7,
  headC: [0.8, 0, 15.6],
  hipY: 4.8,
  footR: [3.0, 1.8, 1.2],
  pal: {
    torso: {
      ...VELVET,
      // the black shirt at the open front of the coat
      pattern: (c) => (c.lx > 1.6 && Math.abs(c.ly) < 3.2 - (c.lx - 1.6) * 0.25 ? hex(c.nz > 0.6 ? '#1e1c22' : '#121116') : null),
    },
    sleeve: { ...VELVET, pattern: (c) => (c.t > 0.8 ? lit(WHITE_FUR.ramp, c.nz) : null) },
    hand: fur(LION),
    pants: { ramp: H('#1a1a1e', '#26262c', '#36363e', '#4a4a54') },
    shoe: BOOTS,
  },
  hand(p, at, side, rig) {
    // a gold watch on the left wrist, a signet ring on the right hand
    handWith(p, at, side, rig, MAT.gold, -1);
    if (side === 1) p.push({ k: 'ell', c: [at[0] + 0.6, at[1] + 0.9, at[2] + 0.9], r: [0.5, 0.5, 0.4], mat: MAT.gold, group: 'ring' });
  },
  torsoExtras(p, o) {
    // a wide white fur collar over the shoulders and round the back
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [0.4 + o.dx, s * 6.2 + o.dy, 13.2 + o.dz], r: [4.6, 3.0, 2.0], yaw: s * 0.4 + o.yaw, mat: WHITE_FUR, group: 'collar' + s });
    p.push({ k: 'ell', c: [-3.0 + o.dx, o.dy, 13.4 + o.dz], r: [2.6, 7.0, 2.0], yaw: o.yaw, mat: WHITE_FUR, group: 'collarback' });
    // fur trim down the front edges of the coat
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [3.4 + o.dx, s * 3.6 + o.dy, 12.6 + o.dz], b: [5.8 + o.dx, s * 3.0 + o.dy, 9.2 + o.dz], r: 1.0, mat: WHITE_FUR, group: 'trim' + s });
    // two gold chains, the lower one with a big lion medallion
    goldChain(p, o, 5.2, 5.5, 13.8, 0);
    goldChain(p, o, 5.8, 6.0, 13.4, 1.9, 0.8);
  },
  head(p, o) {
    const hc: V3 = [0.8 + o.dx, o.dy, 15.6 + o.dz];
    const hr: V3 = [4.6, 4.3, 4.0];
    const maneM: Material = { ramp: MANE, dither: true, pattern: (c) => (Math.abs(((Math.atan2(c.y - o.dy, c.x - hc[0] + 2) * 5 + 40) % 1) - 0.5) < 0.1 ? -1 : null) };
    // the mane: a ruff behind and around the head, locks over the shoulders
    p.push({ k: 'ell', c: [hc[0] - 2.2, hc[1], hc[2] - 0.2], r: [5.0, 6.8, 3.8], mat: maneM, group: 'mane' });
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.5 + i / 8);
      p.push({ k: 'cap', a: [hc[0] - 1.8 + Math.cos(a) * 3.6, hc[1] + Math.sin(a) * 5.0, hc[2] + 1.0], b: [hc[0] - 1.8 + Math.cos(a) * 8.2, hc[1] + Math.sin(a) * 8.8 + o.sway * 0.2, hc[2] - 1.8], r: 1.6, r2: 0.7, mat: maneM, group: 'lock' });
    }
    p.push({ k: 'ell', c: [hc[0] + 0.6, hc[1], hc[2] + 0.2], r: hr, mat: fur(LION), group: 'head' });
    // a tuft of mane on the crown
    p.push({ k: 'ell', c: [hc[0] - 1.6, hc[1], hc[2] + 2.6], r: [2.6, 3.0, 2.0], mat: maneM, group: 'crown' });
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [hc[0] - 0.8, hc[1] + s * 3.8, hc[2] + 2.4], r: [1.2, 1.1, 1.0], mat: fur(LION), group: 'ear' + s });
    // muzzle, nose, shades, cigar
    p.push({ k: 'ell', c: [hc[0] + 4.6, hc[1], hc[2] - 1.2], r: [2.6, 2.8, 2.0], mat: fur(H('#a88a60', '#ccb084', '#e8d0a6', '#f6e8cc')), group: 'muzzle' });
    p.push({ k: 'ell', c: [hc[0] + 6.8, hc[1], hc[2] - 0.4], r: [0.9, 1.2, 0.7], mat: { ramp: H('#2a1610', '#4a2a1e', '#6a3e2c') }, group: 'nose' });
    shadesOnEyes(p, [hc[0] + 0.6, hc[1], hc[2] + 0.2], hr, 2.8, 2.0, 1.45);
    cigar(p, [hc[0] + 5.8, hc[1] + 1.8, hc[2] - 1.6], 1.0, 0.8, 3.8, 0.75);
  },
  tail(p, o) {
    const sw = o.sway * 1.2;
    p.push({ k: 'cap', a: [-6.4, 0.8, 6.4], b: [-12.6, 2.8 + sw * 0.5, 5.4], r: 1.1, r2: 0.9, mat: fur(LION), group: 'tail' });
    p.push({ k: 'cap', a: [-12.6, 2.8 + sw * 0.5, 5.4], b: [-16.0, 5.6 + sw, 5.0], r: 0.9, r2: 0.7, mat: fur(LION), group: 'tail' });
    p.push({ k: 'ell', c: [-16.6, 6.2 + sw, 5.0], r: [1.6, 1.4, 1.2], mat: { ramp: MANE, dither: true }, group: 'tuft' });
  },
};

// ── Бугай «Вышибала» — water buffalo, big horns, red jacket with a fur collar, bandolier, cigar ──
const BUFFALO = H('#1a100a', '#2c1c12', '#40291a', '#563824', '#6e4a30');
const RED_JACKET: Material = { ramp: H('#3a0608', '#640c10', '#901818', '#b82420', '#d63a2c'), spec: { color: hex('#f0b0a0'), power: 10, threshold: 0.78 } };
const buyvol: Rig = {
  id: 'buyvol',
  torsoC: [-0.6, 0, 8.8],
  torsoR: [6.8, 13.0, 6.0],
  shoulderY: 10.4,
  shoulderZ: 12.2,
  armR: 3.0,
  headC: [1.2, 0, 15.6],
  hipY: 5.2,
  footR: [3.4, 2.1, 1.3],
  pal: {
    torso: {
      ...RED_JACKET,
      // the open front: dark brown fur of the chest
      pattern: (c) => (c.lx > 1.8 && Math.abs(c.ly) < 3.6 - (c.lx - 1.8) * 0.2 ? lit(BUFFALO, c.nz) : null),
    },
    sleeve: { ...RED_JACKET, pattern: (c) => (c.t > 0.84 ? hex('#1a0a06') : null) },
    hand: fur(BUFFALO),
    pants: { ramp: H('#16141a', '#222028', '#302e38', '#424050') },
    shoe: { ramp: H('#0c0806', '#1a120c', '#2a1e14', '#3c2c1e') },
  },
  hand(p, at, side, rig) {
    handWith(p, at, side, rig, MAT.gold, 1);
  },
  torsoExtras(p, o) {
    // the fur collar
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [0.2 + o.dx, s * 6.8 + o.dy, 13.8 + o.dz], r: [4.4, 2.8, 2.0], yaw: s * 0.45 + o.yaw, mat: SHEARLING, group: 'collar' + s });
    p.push({ k: 'ell', c: [-3.4 + o.dx, o.dy, 14.0 + o.dz], r: [2.4, 7.2, 2.0], yaw: o.yaw, mat: SHEARLING, group: 'collarback' });
    starPatch(p, o, buyvol, -1, 1.6);
    bandolier(p, o, [-3.2, 10.0, 13.6], [5.0, -8.0, 12.8]);
    // gold chain with a big dollar medallion
    goldChain(p, o, 5.4, 6.0, 14.2, 1.8, 0.8);
  },
  head(p, o) {
    const hc: V3 = [1.2 + o.dx, o.dy, 15.6 + o.dz];
    const hr: V3 = [5.0, 4.8, 4.4];
    const skin = fur(BUFFALO);
    p.push({ k: 'ell', c: hc, r: hr, mat: skin, group: 'head' });
    // broad muzzle and nostrils
    p.push({ k: 'ell', c: [hc[0] + 4.8, hc[1], hc[2] - 1.2], r: [3.0, 3.4, 2.4], mat: fur(H('#3e342c', '#5a4e44', '#7a6c60', '#9a8a7c')), group: 'muzzle' });
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [hc[0] + 7.2, hc[1] + s * 1.3, hc[2] - 0.8], r: [0.5, 0.6, 0.4], mat: MAT.black, group: 'nostril' });
    // the horns: thick at the head, sweeping out and back
    const horn: Material = { ramp: H('#4a3e2a', '#7a6a4a', '#a89878', '#d0c4a6', '#ece2ca'), pattern: (c) => (c.t > 0.78 ? hex('#2a2218') : Math.abs(((c.t * 8) % 1) - 0.5) < 0.08 ? -1 : null) };
    for (const s of [-1, 1]) {
      p.push({ k: 'cap', a: [hc[0] - 0.8, hc[1] + s * 3.4, hc[2] + 2.6], b: [hc[0] - 0.4, hc[1] + s * 8.4, hc[2] + 2.8], r: 1.6, r2: 1.15, mat: horn, group: 'horn' + s });
      p.push({ k: 'cap', a: [hc[0] - 0.4, hc[1] + s * 8.4, hc[2] + 2.8], b: [hc[0] + 2.8, hc[1] + s * 10.4, hc[2] + 4.2], r: 1.15, r2: 0.4, mat: horn, group: 'horn' + s });
      // ears under the horns
      p.push({ k: 'ell', c: [hc[0] - 1.6, hc[1] + s * 5.6, hc[2] + 0.6], r: [1.6, 2.0, 0.8], yaw: s * 0.3, mat: skin, group: 'ear' + s });
      // red eyes under a heavy brow
      const z = surf(hc, hr, 2.8, s * 3.0, 0.2);
      p.push({ k: 'ell', c: [hc[0] + 2.9, hc[1] + s * 3.0, z], r: [0.8, 0.65, 0.55], mat: RED_EYE, group: 'eye' });
      p.push({ k: 'cap', a: [hc[0] + 1.8, hc[1] + s * 2.0, z + 0.8], b: [hc[0] + 2.8, hc[1] + s * 4.0, z + 0.6], r: 0.55, mat: skin, group: 'brow' });
    }
    p.push({ k: 'ell', c: [hc[0] - 0.8, hc[1] - 7.0, hc[2] + 0.2], r: [0.8, 0.4, 0.9], mat: MAT.gold, group: 'earring' });
    cigar(p, [hc[0] + 6.4, hc[1] - 2.0, hc[2] - 2.0], 1.0, -0.9, 3.8, 0.8);
  },
  tail(p, o) {
    p.push({ k: 'cap', a: [-7.2, 0, 6.6], b: [-11.6, 0.6 + o.sway * 0.4, 5.4], r: 0.7, r2: 0.5, mat: fur(BUFFALO), group: 'tail' });
    p.push({ k: 'ell', c: [-12.0, 0.7 + o.sway * 0.4, 5.3], r: [1.1, 0.9, 0.8], mat: { ramp: H('#0e0a06', '#1a120c', '#2a1e14') }, group: 'tuft' });
  },
};

// ── Рогов «Сиделец» — rhino in orange prison overalls, tattoos, harness, a broken shackle, cigar ──
const RHINO = H('#2e2e30', '#48484c', '#64646a', '#84848a', '#a4a4aa');
const rhinoSkin: Material = { ramp: RHINO, dither: true, pattern: (c) => (Math.abs(((c.x * 1.2 + Math.sin(c.y * 1.6) * 0.7 + 40) % 1.7) - 0.85) < 0.08 ? -1 : null) };
const rhinoHead: Material = {
  ...rhinoSkin,
  pattern: (c) => {
    // a crown tattooed on the crown of the head
    const x = c.lx + 1.4;
    const ay = Math.abs(c.ly);
    if (c.nz > 0.7 && x > -1.1 && x < 0.9 && ay < 1.6) {
      if (x < -0.8 || (x > 0.0 && (ay < 0.25 || Math.abs(ay - 1.25) < 0.25))) return hex('#141418');
      return null;
    }
    return rhinoSkin.pattern!(c);
  },
};
const PRISON = H('#4a1a06', '#7a2c0a', '#b0440e', '#d85e16', '#f07a26');
const nosorog: Rig = {
  id: 'nosorog',
  torsoC: [-0.6, 0, 8.8],
  torsoR: [6.8, 13.0, 6.0],
  shoulderY: 10.4,
  shoulderZ: 12.2,
  armR: 3.0,
  headC: [1.4, 0, 15.4],
  hipY: 5.2,
  footR: [3.4, 2.1, 1.3],
  pal: {
    torso: {
      ramp: PRISON,
      dither: true,
      pattern: (c) => {
        // a white «89» number patch on the left of the chest
        if (c.lx > 0.6 && c.lx < 3.4 && c.ly > -7.6 && c.ly < -3.4) {
          const digit = c.lx > 1.1 && c.lx < 2.9 && ((c.ly > -6.9 && c.ly < -5.9) || (c.ly > -5.1 && c.ly < -4.1));
          const hole = digit && c.lx > 1.6 && c.lx < 2.4 && (Math.abs(c.ly + 6.4) < 0.2 || Math.abs(c.ly + 4.6) < 0.2);
          return digit && !hole ? hex('#1a1410') : c.nz > 0.5 ? hex('#ece6da') : hex('#bcb4a6');
        }
        if (Math.abs(c.ly) < 0.3 && c.lx > 0) return -1;
        return null;
      },
    },
    sleeve: { ramp: PRISON, pattern: (c) => (c.t > 0.84 ? -1 : null) },
    hand: rhinoSkin,
    pants: { ramp: PRISON },
    shoe: { ramp: H('#0c0c0e', '#18181c', '#26262c', '#36363e') },
  },
  hand(p, at, side, rig) {
    // an iron shackle still on each wrist
    handWith(p, at, side, rig, IRON);
  },
  torsoExtras(p, o) {
    // harness straps over the shoulders
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [-5.2 + o.dx, s * 4.8 + o.dy, 13.8 + o.dz], b: [5.4 + o.dx, s * 5.0 + o.dy, 12.6 + o.dz], r: 0.95, mat: LEATHER_STRAP, group: 'harness' + s });
    // the handcuff chain round the neck with a crown tag
    neckChain(p, o, 6.0, 6.6, 14.6, IRON, 0.8);
    p.push({ k: 'box', c: [7.2 + o.dx, o.dy, 13.6 + o.dz], h: [1.0, 1.1, 0.3], yaw: o.yaw, mat: BRASS, group: 'tag', bevel: 0.2 });
  },
  head(p, o) {
    const hc: V3 = [1.4 + o.dx, o.dy, 15.4 + o.dz];
    const hr: V3 = [5.6, 4.6, 4.2];
    p.push({ k: 'ell', c: hc, r: hr, mat: rhinoHead, group: 'head' });
    // the long heavy snout
    p.push({ k: 'cap', a: [hc[0] + 3.0, hc[1], hc[2] - 0.4], b: [hc[0] + 7.8, hc[1], hc[2] - 1.2], r: 3.4, r2: 2.6, mat: rhinoSkin, group: 'snout' });
    // the big horn and a small one behind it
    const horn: Material = { ramp: H('#4a4234', '#7a7058', '#a89c80', '#d0c6aa', '#ece4cc') };
    p.push({ k: 'cap', a: [hc[0] + 7.4, hc[1], hc[2] + 1.0], b: [hc[0] + 10.6, hc[1], hc[2] + 5.8], r: 1.9, r2: 0.3, mat: horn, group: 'horn' });
    p.push({ k: 'cap', a: [hc[0] + 3.6, hc[1], hc[2] + 2.8], b: [hc[0] + 4.8, hc[1], hc[2] + 4.8], r: 1.1, r2: 0.25, mat: horn, group: 'horn2' });
    for (const s of [-1, 1]) {
      // small ears on top, little red eyes
      p.push({ k: 'cap', a: [hc[0] - 2.4, hc[1] + s * 2.8, hc[2] + 3.0], b: [hc[0] - 3.4, hc[1] + s * 4.2, hc[2] + 5.0], r: 1.2, r2: 0.5, mat: rhinoSkin, group: 'ear' + s });
      const z = surf(hc, hr, 2.4, s * 3.4, 0.1);
      p.push({ k: 'ell', c: [hc[0] + 2.4, hc[1] + s * 3.4, z], r: [0.6, 0.5, 0.45], mat: { ramp: H('#d81e14'), flat: true }, group: 'eye' });
    }
    cigar(p, [hc[0] + 6.6, hc[1] + 2.6, hc[2] - 2.0], 1.0, 0.9, 3.8, 0.8);
  },
  tail(p, o) {
    p.push({ k: 'cap', a: [-7.2, 0, 6.6], b: [-10.8, 0.4 + o.sway * 0.4, 5.6], r: 0.6, r2: 0.4, mat: rhinoSkin, group: 'tail' });
  },
};

// ── Самсон «Бригадир» — gorilla, dark red tracksuit, gold crown chain, watch, bandolier, cigar ───
const GORILLA = H('#0a0a0c', '#141418', '#1e1e24', '#2a2a32', '#383842');
const gorillaFur = fur(GORILLA);
const GORILLA_FACE: Material = { ramp: H('#2a2a30', '#3e3e46', '#56565e', '#6e6e78', '#8a8a94') };
const DARK_RED = H('#2a0408', '#4a0a10', '#6e1218', '#901c20', '#ae2a2a');
const gorilla: Rig = {
  id: 'gorilla',
  torsoC: [-0.6, 0, 8.8],
  torsoR: [7.0, 13.4, 6.1],
  shoulderY: 10.8,
  shoulderZ: 12.4,
  armR: 3.2,
  headC: [1.2, 0, 15.4],
  hipY: 5.2,
  footR: [3.4, 2.2, 1.3],
  pal: {
    torso: {
      ramp: DARK_RED,
      pattern: (c) => {
        // the zip open at the chest: black fur
        if (c.lx > 1.8 && Math.abs(c.ly) < 3.2 - (c.lx - 1.8) * 0.2) return lit(GORILLA, c.nz);
        return shoulderStripes(c, 7.8);
      },
    },
    sleeve: { ramp: DARK_RED, pattern: sleeveStripes },
    hand: gorillaFur,
    pants: { ramp: DARK_RED, pattern: legStripe },
    shoe: BOOTS,
  },
  hand(p, at, side, rig) {
    handWith(p, at, side, rig, MAT.gold, -1);
  },
  torsoExtras(p, o) {
    p.push({ k: 'ell', c: [1.2 + o.dx, o.dy, 13.8 + o.dz], r: [5.6, 6.8, 1.9], yaw: o.yaw, mat: { ramp: DARK_RED, pattern: (c) => (Math.sqrt((c.lx / 5.6) ** 2 + (c.ly / 6.8) ** 2) > 0.82 ? WHITE : null) }, group: 'collar' });
    bandolier(p, o, [-3.4, -10.4, 13.8], [5.2, 8.4, 13.0]);
    // gold chain with a crown medallion
    goldChain(p, o, 5.2, 5.8, 14.0, 1.8, 0.8);
  },
  head(p, o) {
    const hc: V3 = [1.2 + o.dx, o.dy, 15.4 + o.dz];
    const hr: V3 = [4.4, 4.6, 4.4];
    // the crest at the back of the skull
    p.push({ k: 'ell', c: [hc[0] - 1.8, hc[1], hc[2] + 1.4], r: [3.6, 3.4, 3.8], mat: gorillaFur, group: 'crest' });
    p.push({ k: 'ell', c: hc, r: hr, mat: gorillaFur, group: 'head' });
    // grey leathery face sticking out in front: heavy brow ridge, broad nose, jaw
    p.push({ k: 'ell', c: [hc[0] + 4.2, hc[1], hc[2] - 0.4], r: [2.6, 3.6, 2.8], mat: GORILLA_FACE, group: 'face' });
    p.push({ k: 'cap', a: [hc[0] + 3.2, hc[1] - 3.0, hc[2] + 2.4], b: [hc[0] + 3.2, hc[1] + 3.0, hc[2] + 2.4], r: 1.1, mat: GORILLA_FACE, group: 'brow' });
    p.push({ k: 'ell', c: [hc[0] + 6.0, hc[1], hc[2] - 2.0], r: [2.2, 3.2, 1.8], mat: GORILLA_FACE, group: 'jaw' });
    p.push({ k: 'ell', c: [hc[0] + 6.2, hc[1], hc[2] + 0.2], r: [1.4, 2.2, 1.4], mat: GORILLA_FACE, group: 'nose' });
    for (const s of [-1, 1]) {
      p.push({ k: 'ell', c: [hc[0] + 7.2, hc[1] + s * 0.9, hc[2] + 0.6], r: [0.5, 0.6, 0.4], mat: MAT.black, group: 'nostril' });
      p.push({ k: 'ell', c: [hc[0] + 4.6, hc[1] + s * 1.9, hc[2] + 1.6], r: [0.5, 0.6, 0.5], mat: { ramp: H('#d04a1a'), flat: true }, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] - 0.4, hc[1] + s * 4.6, hc[2] - 0.2], r: [1.1, 0.8, 1.0], mat: GORILLA_FACE, group: 'ear' + s });
    }
    cigar(p, [hc[0] + 7.0, hc[1] - 2.4, hc[2] - 1.4], 1.0, -0.9, 3.8, 0.8);
  },
};

// ── Борька «Беглый» — scarred pig with tusks, rust vest, straps, a slaughterhouse chain and tag ───
const PIG = H('#6a2e2e', '#9a4a48', '#c26a64', '#de8c84', '#f2b0a6');
const pigScar = (c: { x: number; y: number }): RGBA | null => {
  const n = Math.sin(c.x * 2.3 + c.y * 0.7) * Math.sin(c.y * 1.9 - c.x * 1.1 + 0.6);
  if (n > 0.86) return hex('#6a0e0e');
  if (Math.abs(((c.x * 0.9 + c.y * 1.4 + 40) % 5.3) - 2.6) < 0.09) return hex('#8a3a3a');
  return null;
};
const pigSkin: Material = { ramp: PIG, dither: true, pattern: (c) => pigScar(c) };
const RUST_VEST = H('#3a1206', '#62200c', '#8a3214', '#b0461e', '#cc5e2a');
const svinya: Rig = {
  id: 'svinya',
  torsoC: [-0.6, 0, 8.8],
  torsoR: [7.0, 13.2, 6.0],
  shoulderY: 10.6,
  shoulderZ: 12.2,
  armR: 3.1,
  headC: [1.2, 0, 15.4],
  hipY: 5.4,
  footR: [3.4, 2.2, 1.3],
  pal: {
    torso: {
      ramp: RUST_VEST,
      dither: true,
      pattern: (c) => {
        // the open vest: scarred pink chest and belly; bare shoulders
        const ay = Math.abs(c.ly);
        if (ay > 9.6 || (c.lx > 0.6 && ay < 3.8 - (c.lx - 0.6) * 0.2)) return pigScar(c) ?? lit(PIG, c.nz);
        return null;
      },
    },
    // bare arms, bandaged forearms with blood on the wraps
    sleeve: { ...pigSkin, pattern: (c) => (c.t > 0.62 && c.t < 0.9 ? (Math.sin(c.t * 40 + c.s * 3) > 0.85 ? hex('#8a1414') : lit(H('#6a6458', '#a8a294', '#d8d2c4', '#f2eee4'), c.nz)) : pigScar(c)) },
    hand: pigSkin,
    pants: { ramp: H('#1e140c', '#2e2016', '#402e20', '#56402c') },
    shoe: { ramp: H('#1a100a', '#2a1a10', '#3c2818', '#523822') },
  },
  torsoExtras(p, o) {
    // crossed straps
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [-4.8 + o.dx, s * 9.2 + o.dy, 12.8 + o.dz], b: [4.6 + o.dx, -s * 7.8 + o.dy, 12.2 + o.dz], r: 0.8, mat: LEATHER_STRAP, group: 'strap' + s });
    // a heavy chain round the neck with a brass «89» tag
    neckChain(p, o, 6.0, 6.8, 14.6, IRON, 0.85);
    p.push({
      k: 'box',
      c: [7.4 + o.dx, o.dy, 13.6 + o.dz],
      h: [1.1, 1.3, 0.3],
      yaw: o.yaw,
      mat: { ...BRASS, pattern: (c) => (Math.abs(c.lx) < 0.6 && (Math.abs(c.ly + 0.5) < 0.22 || Math.abs(c.ly - 0.5) < 0.22) ? hex('#2a1a06') : null) },
      group: 'tag',
      bevel: 0.2,
    });
  },
  head(p, o) {
    const hc: V3 = [1.2 + o.dx, o.dy, 15.4 + o.dz];
    const hr: V3 = [5.2, 5.0, 4.4];
    p.push({ k: 'ell', c: hc, r: hr, mat: pigSkin, group: 'head' });
    // the snout: a flat disc with two nostrils
    p.push({ k: 'cap', a: [hc[0] + 3.6, hc[1], hc[2] - 1.0], b: [hc[0] + 6.8, hc[1], hc[2] - 1.0], r: 2.4, r2: 2.2, mat: pigSkin, group: 'snout' });
    p.push({ k: 'ell', c: [hc[0] + 7.4, hc[1], hc[2] - 0.9], r: [0.8, 2.2, 1.8], mat: { ramp: H('#8a4a48', '#b86a66', '#d68a84') }, group: 'disc' });
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [hc[0] + 7.9, hc[1] + s * 0.8, hc[2] - 0.6], r: [0.4, 0.45, 0.6], mat: { ramp: H('#2a0a0a'), flat: true }, group: 'nostril' });
    // tusks out of the lower jaw
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [hc[0] + 4.4, hc[1] + s * 2.4, hc[2] - 2.6], b: [hc[0] + 5.6, hc[1] + s * 3.4, hc[2] - 0.6], r: 0.55, r2: 0.2, mat: { ramp: H('#a89c80', '#d8ccae', '#f2e8d0') }, group: 'tusk' });
    for (const s of [-1, 1]) {
      // red eyes, floppy ears
      const z = surf(hc, hr, 2.6, s * 2.8, 0.2);
      p.push({ k: 'ell', c: [hc[0] + 2.6, hc[1] + s * 2.8, z], r: [0.75, 0.6, 0.5], mat: RED_EYE, group: 'eye' });
      p.push({ k: 'cap', a: [hc[0] - 0.8, hc[1] + s * 3.6, hc[2] + 2.8], b: [hc[0] + 1.6, hc[1] + s * 6.8, hc[2] + 1.6], r: 1.9, r2: 0.6, mat: pigSkin, group: 'ear' + s });
    }
    // a steel ring through the right ear
    p.push({ k: 'ell', c: [hc[0] + 0.6, hc[1] + 6.2, hc[2] + 1.0], r: [0.5, 0.9, 0.9], mat: IRON, group: 'earring' });
  },
  tail(p, o) {
    // a little curly tail
    let prev: V3 = [-6.8, 0, 6.6];
    for (let i = 1; i <= 6; i++) {
      const a = i * 1.1;
      const pt: V3 = [-8.2 - Math.cos(a) * 1.2, Math.sin(a) * 1.2 + o.sway * 0.2, 6.6 + i * 0.15];
      p.push({ k: 'cap', a: prev, b: pt, r: 0.45, mat: pigSkin, group: 'tail' });
      prev = pt;
    }
  },
};

// ── Алиса «Аферистка» — red fox, red top, black fur-trimmed jacket off the shoulders, gold heart ─
const FOX = H('#5a1e06', '#8a320c', '#b84c14', '#dc6a20', '#f08a34');
const foxFur = fur(FOX);
const FOX_WHITE = H('#8a8478', '#b8b2a4', '#ddd8cc', '#f2eee4', '#fbf8f0');
const GREY_FUR: Material = { ramp: H('#4a4844', '#6e6a64', '#94908a', '#b8b4ac', '#d8d4cc'), dither: true };
const lisa: Rig = {
  id: 'lisa',
  torsoC: [-0.2, 0, 8.2],
  torsoR: [5.1, 10.0, 4.9],
  shoulderY: 7.9,
  shoulderZ: 11.1,
  armR: 2.05,
  headC: [0.8, 0, 14.8],
  hipY: 3.8,
  footR: [2.6, 1.3, 1.1],
  pal: {
    torso: {
      ramp: BLACK_LEATHER,
      spec: { color: hex('#9a9ab0'), power: 12, threshold: 0.8 },
      pattern: (c) => {
        // the jacket hangs off the shoulders: in front the red top and the white chest fur
        if (c.lx > 0.6 && Math.abs(c.ly) < 4.6 - (c.lx - 0.6) * 0.15) {
          if (c.lx > 3.4) return lit(FOX_WHITE, c.nz);
          if (Math.abs(c.ly) < 0.45) return hex('#7a1410');
          return hex(c.nz > 0.7 ? '#e0382c' : c.nz > 0.45 ? '#b8241e' : '#861612');
        }
        return null;
      },
    },
    sleeve: { ramp: BLACK_LEATHER, pattern: (c) => (c.t > 0.8 ? lit(GREY_FUR.ramp, c.nz) : null) },
    hand: BLACK_GLOVE,
    pants: { ramp: BLACK_LEATHER, spec: { color: hex('#8a8aa0'), power: 14, threshold: 0.8 } },
    shoe: BOOTS,
  },
  hand(p, at, side, rig) {
    // gold bracelets on both wrists
    handWith(p, at, side, rig, MAT.gold);
  },
  torsoExtras(p, o) {
    // the jacket's fur trim round the shoulders and the back
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [-0.6 + o.dx, s * 6.6 + o.dy, 12.2 + o.dz], r: [3.4, 2.0, 1.5], yaw: s * 0.5 + o.yaw, mat: GREY_FUR, group: 'fur' + s });
    p.push({ k: 'ell', c: [-3.4 + o.dx, o.dy, 12.6 + o.dz], r: [2.0, 6.0, 1.5], yaw: o.yaw, mat: GREY_FUR, group: 'furback' });
    // gold chain with a red heart
    goldChain(p, o, 4.3, 4.5, 13.0, 0);
    p.push({ k: 'ell', c: [5.3 + o.dx, o.dy, 12.6 + o.dz], r: [0.8, 0.9, 0.5], mat: { ramp: H('#7a0a14', '#c01a28', '#f04050'), spec: { color: hex('#ffd0d8'), power: 12, threshold: 0.8 } }, group: 'heart' });
  },
  head(p, o) {
    const hc: V3 = [0.8 + o.dx, o.dy, 14.8 + o.dz];
    const hr: V3 = [4.4, 4.0, 3.7];
    p.push({ k: 'ell', c: hc, r: hr, mat: foxFur, group: 'head' });
    // white cheeks
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [hc[0] + 1.6, hc[1] + s * 2.6, hc[2] - 1.2], r: [2.0, 1.6, 1.6], mat: fur(FOX_WHITE), group: 'cheek' + s });
    // the long pointed snout, white below, a black nose
    p.push({ k: 'cap', a: [hc[0] + 2.4, hc[1], hc[2] - 0.6], b: [hc[0] + 7.4, hc[1], hc[2] - 1.0], r: 2.0, r2: 0.8, mat: foxFur, group: 'snout' });
    p.push({ k: 'ell', c: [hc[0] + 7.8, hc[1], hc[2] - 0.8], r: [0.6, 0.7, 0.5], mat: MAT.black, group: 'nose' });
    for (const s of [-1, 1]) {
      // big pointed ears with dark tips
      p.push({ k: 'cap', a: [hc[0] - 0.8, hc[1] + s * 2.4, hc[2] + 2.6], b: [hc[0] - 2.6, hc[1] + s * 4.6, hc[2] + 6.0], r: 1.7, r2: 0.3, mat: { ...foxFur, pattern: (c) => (c.t > 0.75 ? hex('#1a0e08') : null) }, group: 'ear' + s });
      p.push({ k: 'cap', a: [hc[0] - 0.5, hc[1] + s * 2.5, hc[2] + 3.0], b: [hc[0] - 2.0, hc[1] + s * 4.2, hc[2] + 5.4], r: 0.9, r2: 0.2, mat: { ramp: H('#c8b8a0', '#ece0cc') }, group: 'ear' + s });
      // amber eyes
      const z = surf(hc, hr, 2.4, s * 2.0, 0.2);
      p.push({ k: 'ell', c: [hc[0] + 2.4, hc[1] + s * 2.0, z], r: [0.9, 0.6, 0.55], yaw: s * -0.35, mat: { ramp: H('#e8b020'), flat: true }, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] + 2.6, hc[1] + s * 2.0, z + 0.25], r: [0.35, 0.16, 0.45], mat: MAT.eyeDark, group: 'eye' });
    }
    p.push({ k: 'ell', c: [hc[0] - 0.4, hc[1] + 4.0, hc[2] - 0.4], r: [0.7, 0.35, 0.9], mat: MAT.gold, group: 'earring' });
  },
  tail(p, o) {
    // the big bushy tail with a white tip
    const sw = o.sway * 1.2;
    p.push({ k: 'cap', a: [-5.2, 0.4, 6.4], b: [-10.6, 2.4 + sw * 0.5, 6.0], r: 2.4, r2: 3.2, mat: foxFur, group: 'tail' });
    p.push({ k: 'cap', a: [-10.6, 2.4 + sw * 0.5, 6.0], b: [-15.6, 5.4 + sw, 6.2], r: 3.2, r2: 2.2, mat: foxFur, group: 'tail' });
    p.push({ k: 'ell', c: [-17.2, 6.6 + sw, 6.2], r: [2.4, 2.0, 1.8], mat: fur(FOX_WHITE), group: 'tip' });
  },
};

export const V023_RIGS: Record<'koshka' | 'golub' | 'tarakan' | 'krysa' | 'lev' | 'buyvol' | 'nosorog' | 'gorilla' | 'svinya' | 'lisa', Rig> = { koshka, golub, tarakan, krysa, lev, buyvol, nosorog, gorilla, svinya, lisa };
