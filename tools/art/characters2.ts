/**
 * Top-down rigs of the ten shop characters (see packages/shared/src/game-rules/characters.ts for
 * their stories). Same conventions as characters.ts: facing +x, y+ = right side, z up, world px.
 */
import { hex } from './lib/raster.js';
import type { RGBA } from './lib/raster.js';
import type { Material, Prim, V3, PatternCtx } from './lib/model.js';
import { MAT } from './materials.js';
import type { Rig, PoseOffsets } from './characters.js';
import type { CharacterId } from '../../packages/shared/src/game-rules/characters.js';

const H = (...c: string[]): RGBA[] => c.map((x) => hex(x));

/** z of an ellipsoid's top surface at offset (dx, dy) from its centre, plus `lift`. */
function surf(c: V3, r: V3, dx: number, dy: number, lift = 0): number {
  const t = 1 - (dx / r[0]) ** 2 - (dy / r[1]) ** 2;
  return c[2] + r[2] * Math.sqrt(Math.max(0, t)) + lift;
}

const eyes = (p: Prim[], hc: V3, hr: V3, x: number, y: number, iris: Material, size = 0.75, glint = true) => {
  for (const s of [-1, 1]) {
    const z = surf(hc, hr, x, s * y, 0.15);
    p.push({ k: 'ell', c: [hc[0] + x, hc[1] + s * y, z], r: [size, size * 0.85, size * 0.7], mat: iris, group: 'eye' });
    p.push({ k: 'ell', c: [hc[0] + x + size * 0.25, hc[1] + s * y, z + 0.25], r: [size * 0.45, size * 0.4, size * 0.5], mat: MAT.eyeDark, group: 'eye' });
    if (glint) p.push({ k: 'ell', c: [hc[0] + x + size * 0.35, hc[1] + s * (y - size * 0.25), z + 0.55], r: [0.2, 0.2, 0.25], mat: MAT.glint, group: 'eye' });
  }
};

const scales = (base: RGBA[], step = 1.2, light?: RGBA): Material => ({
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

const fur = (ramp: RGBA[]): Material => ({ ramp, dither: true });

// ── Ворона «Клава» — crow, cardigan, red headscarf, handbag ───────────────────
const CROW = H('#07080c', '#11131a', '#1d2130', '#2e3448', '#4a5470');
const CARDIGAN = H('#2a1a12', '#46301f', '#664830', '#856244');
const SCARF = H('#5a0c10', '#9a1a1a', '#c8302a', '#e85a40');
const vorona: Rig = {
  id: 'vorona',
  torsoC: [-0.2, 0, 8.2],
  torsoR: [5.6, 10.6, 5.2],
  shoulderY: 8.3,
  shoulderZ: 11.3,
  armR: 2.3,
  headC: [0.4, 0, 14.8],
  hipY: 4.0,
  footR: [2.4, 1.5, 1.1],
  toes: true,
  pal: {
    torso: {
      ramp: CARDIGAN,
      dither: true,
      pattern: (c) => {
        // flowered dress at the open front of the cardigan
        if (c.lx > 1.5 && Math.abs(c.ly) < 3.0 - (c.lx - 1.5) * 0.3) {
          const fx = c.x * 1.2;
          const fy = c.y * 1.2;
          const d = (Math.round(fx) - fx) ** 2 + (Math.round(fy) - fy) ** 2;
          return d < 0.08 ? hex('#e8e0c8') : hex('#2a4a7a');
        }
        if (c.lx > 1.2 && Math.abs(Math.abs(c.ly) - 3.1) < 0.3) return hex('#1e130c');
        return null;
      },
    },
    sleeve: { ramp: CARDIGAN, dither: true, pattern: (c) => (c.t > 0.86 ? 0.6 : null) },
    hand: { ramp: H('#0a0b10', '#151822', '#232836', '#343c50') },
    pants: { ramp: H('#2a1e18', '#3e2c22', '#56402e', '#6e5440') },
    shoe: { ramp: H('#06060a', '#101014', '#1c1c22', '#2c2c34') },
  },
  torsoExtras(p, o) {
    p.push({ k: 'ell', c: [1.0 + o.dx, o.dy, 12.4 + o.dz], r: [5.0, 6.0, 1.6], yaw: o.yaw, mat: { ramp: CARDIGAN, dither: true }, group: 'collar' });
    // handbag hanging at the left
    p.push({ k: 'box', c: [2.6 + o.dx, -11.6 + o.dy, 7.6 + o.dz], h: [2.7, 1.5, 1.8], yaw: 0.2 + o.yaw, mat: { ramp: H('#2a1408', '#4a2610', '#6e3c1c', '#8e5428'), spec: { color: hex('#c09060'), power: 10, threshold: 0.8 } }, group: 'bag', bevel: 0.7 });
    p.push({ k: 'ell', c: [2.6 + o.dx, -11.6 + o.dy, 9.5 + o.dz], r: [0.6, 0.6, 0.4], mat: MAT.gold, group: 'clasp' });
  },
  head(p, o) {
    const hc: V3 = [0.4 + o.dx, o.dy, 14.8 + o.dz];
    const hr: V3 = [4.6, 4.2, 3.9];
    p.push({ k: 'ell', c: hc, r: hr, mat: { ramp: CROW, spec: { color: hex('#7f95c8'), power: 9, threshold: 0.84 } }, group: 'head' });
    p.push({ k: 'cap', a: [hc[0] + 2.6, hc[1], hc[2] + 0.8], b: [hc[0] + 10.4, hc[1], hc[2] + 0.2], r: 2.0, r2: 0.4, mat: { ramp: H('#26262c', '#3e3e46', '#5e5e68', '#86868f', '#aeaeb6'), spec: { color: hex('#e0e4f0'), power: 14, threshold: 0.84 } }, group: 'beak' });
    eyes(p, hc, hr, 2.4, 2.9, MAT.eyeDark, 0.7);
    const scarf: Material = {
      ramp: SCARF,
      pattern: (c) => {
        const fx = c.x * 1.05;
        const fy = c.y * 1.05;
        const d = (Math.round(fx) - fx) ** 2 + (Math.round(fy) - fy) ** 2;
        return d < 0.07 && (Math.round(fx) + Math.round(fy)) % 2 === 0 ? hex('#f2e8d0') : null;
      },
    };
    p.push({ k: 'ell', c: [hc[0] - 2.4, hc[1], hc[2] + 1.0], r: [4.2, 5.0, 3.6], yaw: o.yaw * 0.5, mat: scarf, group: 'scarf' });
    p.push({ k: 'ell', c: [hc[0] + 0.6, hc[1] + 4.2, hc[2] - 1.4], r: [1.4, 1.2, 1.1], mat: { ramp: SCARF }, group: 'knot' });
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [hc[0] - 5.2, hc[1] + s * 0.9, hc[2] - 0.2], b: [hc[0] - 8.6, hc[1] + s * 2.4 + o.sway * 0.5, hc[2] - 1.4], r: 1.05, r2: 0.7, mat: { ramp: SCARF }, group: 'scarftail' });
  },
  tail(p, o) {
    const m: Material = { ramp: CROW, spec: { color: hex('#6f85b8'), power: 9, threshold: 0.86 } };
    for (const [y, l] of [
      [-1.6, 11.5],
      [0, 12.6],
      [1.6, 11.5],
    ] as const)
      p.push({ k: 'cap', a: [-5.2, y * 0.6, 7.2], b: [-l, y * 1.8 + o.sway * 0.6, 7.0], r: 1.3, r2: 0.7, mat: m, group: 'tail' });
  },
};

// ── Змея «Зинаида» — snake, office suit, auburn perm, long tail ──────────────
const SNAKE = H('#0e2a12', '#1a4420', '#2a6430', '#3e8642', '#62aa5a');
const SUIT_TEAL = H('#0e1c1e', '#182e32', '#244448', '#345e62', '#4c7c80');
const zmeya: Rig = {
  id: 'zmeya',
  torsoC: [-0.2, 0, 8.3],
  torsoR: [5.4, 10.4, 5.2],
  shoulderY: 8.2,
  shoulderZ: 11.4,
  armR: 2.2,
  headC: [0.4, 0, 15.0],
  hipY: 3.9,
  footR: [2.6, 1.3, 1.1],
  pal: {
    torso: {
      ramp: SUIT_TEAL,
      pattern: (c) => {
        if (c.lx > 1.8 && Math.abs(c.ly) < 2.6 - (c.lx - 1.8) * 0.35) return hex('#efe8da'); // blouse
        if (c.lx > 1.5 && Math.abs(Math.abs(c.ly) - 2.9) < 0.3) return hex('#0a1416'); // lapels
        return null;
      },
    },
    sleeve: { ramp: SUIT_TEAL, pattern: (c) => (c.t > 0.88 ? hex('#efe8da') : null) },
    hand: scales(SNAKE, 2.2),
    pants: { ramp: H('#120e10', '#1e181c', '#2e262c', '#40363e') },
    shoe: { ramp: H('#3a0808', '#640e10', '#8e1a1a', '#b83026'), spec: { color: hex('#ffb0a0'), power: 14, threshold: 0.84 } },
  },
  torsoExtras(p, o) {
    p.push({ k: 'ell', c: [3.0 + o.dx, -3.6 + o.dy, 13.0 + o.dz], r: [0.9, 0.9, 0.5], mat: MAT.gold, group: 'brooch' });
    p.push({ k: 'ell', c: [3.0 + o.dx, -3.6 + o.dy, 13.3 + o.dz], r: [0.45, 0.45, 0.4], mat: { ramp: H('#5a0a1a', '#a01a3a'), flat: false }, group: 'brooch' });
  },
  head(p, o) {
    const hc: V3 = [0.8 + o.dx, o.dy, 14.4 + o.dz];
    const hr: V3 = [5.2, 4.1, 2.9];
    const skin = scales(SNAKE, 1.5, hex('#8acb6a'));
    // triangular viper head: wide jaw at the back, snout forward
    p.push({ k: 'ell', c: hc, r: hr, mat: skin, group: 'head' });
    p.push({ k: 'cap', a: [hc[0] + 2.0, hc[1], hc[2] + 0.2], b: [hc[0] + 7.4, hc[1], hc[2] - 0.6], r: 2.9, r2: 1.5, mat: skin, group: 'snout' });
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 2.6, s * 2.6, 0.3);
      p.push({ k: 'ell', c: [hc[0] + 2.6, hc[1] + s * 2.6, z], r: [1.0, 0.75, 0.6], mat: MAT.eyeYellow, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] + 2.75, hc[1] + s * 2.6, z + 0.3], r: [0.65, 0.18, 0.5], mat: MAT.eyeDark, group: 'eye' });
    }
    // forked tongue
    p.push({ k: 'cap', a: [hc[0] + 8.2, hc[1], hc[2] - 1.0], b: [hc[0] + 10.6, hc[1], hc[2] - 1.2], r: 0.3, mat: { ramp: H('#a01020', '#e0304a'), flat: true }, group: 'tongue' });
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [hc[0] + 10.6, hc[1], hc[2] - 1.2], b: [hc[0] + 11.8, hc[1] + s * 0.9, hc[2] - 1.3], r: 0.22, mat: { ramp: H('#a01020', '#e0304a'), flat: true }, group: 'tongue' });
    // the perm («химия»): copper curls on the crown and the back
    const curls: Material = { ramp: H('#4a1a08', '#7a3010', '#a8481c', '#cc6a30', '#e8904c') };
    const spots: Array<[number, number, number]> = [
      [-3.2, -2.6, 1.6],
      [-3.4, 0, 1.9],
      [-3.2, 2.6, 1.6],
      [-1.4, -3.4, 1.7],
      [-1.0, -1.2, 2.3],
      [-1.0, 1.2, 2.3],
      [-1.4, 3.4, 1.7],
      [0.8, -2.2, 2.0],
      [0.8, 0, 2.3],
      [0.8, 2.2, 2.0],
      [-5.0, -1.2, 0.8],
      [-5.0, 1.2, 0.8],
    ];
    for (const [x, y, zl] of spots) p.push({ k: 'ell', c: [hc[0] + x * 0.9 - 1.6, hc[1] + y * 0.85, hc[2] + zl + 0.8], r: [1.35, 1.35, 1.25], mat: curls, group: 'perm' });
  },
  tail(p, o) {
    const skin = scales(SNAKE, 1.6);
    const sw = o.sway;
    p.push({ k: 'cap', a: [-5.5, 0.5, 4.8], b: [-11, 2.4 + sw * 0.6, 3.6], r: 2.3, r2: 1.9, mat: skin, group: 'tail' });
    p.push({ k: 'cap', a: [-11, 2.4 + sw * 0.6, 3.6], b: [-15, -0.6 + sw, 3.0], r: 1.9, r2: 1.3, mat: skin, group: 'tail' });
    p.push({ k: 'cap', a: [-15, -0.6 + sw, 3.0], b: [-17.6, -4.2 + sw * 1.3, 2.6], r: 1.3, r2: 0.5, mat: skin, group: 'tail' });
  },
};

// ── Варан «Валера» — monitor lizard, quilted jacket, flat cap ────────────────
const LIZARD = H('#3a3218', '#5a4e26', '#7c6e38', '#a0904e', '#c4b26a');
const VATNIK = H('#1c221c', '#2a332a', '#3a463a', '#4e5c4c', '#667662');
const varan: Rig = {
  id: 'varan',
  torsoC: [-0.3, 0, 8.4],
  torsoR: [6.0, 11.4, 5.5],
  shoulderY: 8.9,
  shoulderZ: 11.6,
  armR: 2.5,
  headC: [0.4, 0, 15.0],
  hipY: 4.4,
  footR: [3.0, 1.8, 1.2],
  pal: {
    torso: { ramp: VATNIK, pattern: (c) => (Math.abs(((c.x + 20) % 1.8) - 0.9) < 0.14 ? -1 : c.lx > 3.6 && Math.abs(c.ly) < 0.35 ? hex('#0c1012') : null) },
    sleeve: { ramp: VATNIK, pattern: (c) => (Math.abs(((c.t * 9) % 1) - 0.5) < 0.1 ? -1 : null) },
    hand: scales(LIZARD, 2.0),
    pants: { ramp: H('#16181e', '#22262e', '#323844', '#464e5c') },
    shoe: { ramp: H('#0e0c0a', '#1c1814', '#2c2620', '#40382e') },
  },
  torsoExtras(p, o) {
    // a ledger tucked under the left arm and a pencil
    p.push({ k: 'box', c: [1.2 + o.dx, -10.6 + o.dy, 9.4 + o.dz], h: [2.8, 0.7, 2.0], yaw: 0.1 + o.yaw, mat: { ramp: H('#2a3a5a', '#3a5078', '#4c6894') }, group: 'ledger', bevel: 0.3 });
    p.push({ k: 'ell', c: [0.8 + o.dx, o.dy, 12.8 + o.dz], r: [5.2, 6.4, 1.7], mat: { ramp: VATNIK }, group: 'collar' });
  },
  head(p, o) {
    const hc: V3 = [1.0 + o.dx, o.dy, 14.2 + o.dz];
    const hr: V3 = [6.2, 3.7, 3.0];
    const skin = scales(LIZARD, 1.4, hex('#b8a46a'));
    p.push({ k: 'ell', c: hc, r: hr, mat: skin, group: 'head' });
    p.push({ k: 'cap', a: [hc[0] + 2.6, hc[1], hc[2] + 0.6], b: [hc[0] + 10.0, hc[1], hc[2] - 0.2], r: 2.6, r2: 1.5, mat: skin, group: 'snout' });
    eyes(p, hc, hr, 2.4, 2.7, { ramp: H('#e8b830'), flat: true }, 0.8);
    // tongue
    p.push({ k: 'cap', a: [hc[0] + 10.6, hc[1], hc[2] - 0.6], b: [hc[0] + 12.4, hc[1], hc[2] - 0.7], r: 0.3, mat: { ramp: H('#c06080', '#e890a8'), flat: true }, group: 'tongue' });
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [hc[0] + 12.4, hc[1], hc[2] - 0.7], b: [hc[0] + 13.4, hc[1] + s * 0.8, hc[2] - 0.8], r: 0.22, mat: { ramp: H('#c06080', '#e890a8'), flat: true }, group: 'tongue' });
    // flat cap (кепка) with a short visor
    const capM: Material = { ramp: H('#22242a', '#34383e', '#4a5058', '#62686e'), dither: true };
    p.push({ k: 'ell', c: [hc[0] - 3.0, hc[1], hc[2] + 2.2], r: [3.8, 3.9, 1.5], mat: capM, group: 'cap' });
    p.push({ k: 'ell', c: [hc[0] + 0.4, hc[1], hc[2] + 2.0], r: [1.6, 3.4, 0.55], mat: { ramp: H('#16181c', '#26292e', '#383c42') }, group: 'visor' });
    // pencil behind the ear
    p.push({ k: 'cap', a: [hc[0] - 1.0, hc[1] + 3.8, hc[2] + 1.0], b: [hc[0] - 4.2, hc[1] + 4.6, hc[2] + 1.6], r: 0.35, mat: { ramp: H('#c08a20', '#e8b440'), flat: true }, group: 'pencil' });
  },
  tail(p, o) {
    const skin: Material = { ...scales(LIZARD, 1.3), pattern: (c) => (Math.floor(c.x * 0.6) % 2 === 0 ? -1 : null) };
    const sw = o.sway;
    p.push({ k: 'cap', a: [-5.8, 0, 5.4], b: [-12, -1.6 + sw * 0.6, 3.8], r: 2.6, r2: 1.9, mat: skin, group: 'tail' });
    p.push({ k: 'cap', a: [-12, -1.6 + sw * 0.6, 3.8], b: [-18.5, 1.2 + sw * 1.2, 2.8], r: 1.9, r2: 0.6, mat: skin, group: 'tail' });
  },
};

// ── Попугай «Кеша» — parrot, white shirt, bow tie, suspenders, headphones ───
const PARROT = H('#0e3a14', '#1a5e20', '#2a8a2e', '#46b444', '#7ad66a');
const popugay: Rig = {
  id: 'popugay',
  torsoC: [-0.2, 0, 8.3],
  torsoR: [5.6, 10.8, 5.3],
  shoulderY: 8.4,
  shoulderZ: 11.5,
  armR: 2.3,
  headC: [0.4, 0, 15.0],
  hipY: 4.1,
  footR: [2.5, 1.5, 1.1],
  toes: true,
  pal: {
    torso: {
      ramp: H('#8a8478', '#b4ae9e', '#d8d2c2', '#efeadc', '#fbf8ee'),
      pattern: (c) => (Math.abs(Math.abs(c.ly) - 4.2) < 0.75 && c.lx > -5 ? hex(c.nz > 0.6 ? '#7a4a1e' : '#5a3412') : c.lx > 3.0 && Math.abs(c.ly) < 0.25 ? hex('#a8a294') : null),
    },
    sleeve: { ramp: H('#8a8478', '#b4ae9e', '#d8d2c2', '#efeadc'), pattern: (c) => (c.t > 0.55 && c.t < 0.62 ? -1 : null) },
    hand: fur(PARROT),
    pants: { ramp: H('#1a1e2a', '#262c3c', '#343c52', '#46506a') },
    shoe: { ramp: H('#4a3a10', '#7a6018', '#a88420', '#d0a830') },
  },
  torsoExtras(p, o) {
    // red bow tie
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [4.6 + o.dx, s * 1.2 + o.dy, 13.2 + o.dz], r: [0.9, 1.3, 0.6], mat: { ramp: H('#6a0a10', '#b01a1a', '#e03a2a') }, group: 'bow' });
    p.push({ k: 'ell', c: [4.7 + o.dx, o.dy, 13.4 + o.dz], r: [0.5, 0.5, 0.5], mat: { ramp: H('#6a0a10', '#b01a1a') }, group: 'bow' });
  },
  head(p, o) {
    const hc: V3 = [0.6 + o.dx, o.dy, 15.0 + o.dz];
    const hr: V3 = [4.7, 4.3, 4.1];
    p.push({ k: 'ell', c: hc, r: hr, mat: { ...fur(PARROT), pattern: (c) => (c.lx > 2.2 ? hex(c.lx > 3.4 ? '#f2c230' : '#e8402a') : null) }, group: 'head' });
    // hooked beak
    p.push({ k: 'cap', a: [hc[0] + 3.6, hc[1], hc[2] + 0.6], b: [hc[0] + 7.4, hc[1], hc[2] - 0.6], r: 2.0, r2: 0.9, mat: { ramp: H('#5a5650', '#8a8478', '#bab4a6', '#e2dccc') }, group: 'beak' });
    p.push({ k: 'cap', a: [hc[0] + 7.2, hc[1], hc[2] - 0.6], b: [hc[0] + 7.9, hc[1], hc[2] - 2.0], r: 0.8, r2: 0.4, mat: { ramp: H('#3a3630', '#6a6458') }, group: 'beak' });
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 2.0, s * 3.0, 0.2);
      p.push({ k: 'ell', c: [hc[0] + 2.0, hc[1] + s * 3.0, z], r: [1.15, 0.95, 0.6], mat: { ramp: H('#e8e4dc'), flat: true }, group: 'eyering' });
      p.push({ k: 'ell', c: [hc[0] + 2.2, hc[1] + s * 3.0, z + 0.35], r: [0.5, 0.45, 0.45], mat: MAT.eyeDark, group: 'eye' });
    }
    // red crest
    for (let i = 0; i < 4; i++) p.push({ k: 'cap', a: [hc[0] - 0.5 - i * 0.6, hc[1], hc[2] + 3.6], b: [hc[0] - 3.2 - i * 0.9, hc[1] + (i - 1.5) * 0.7, hc[2] + 4.6 - i * 0.3], r: 0.7, r2: 0.35, mat: { ramp: H('#7a0a10', '#c01a1a', '#ee4a2a') }, group: 'crest' });
    // headphones: band over the crown, cups on the sides
    p.push({ k: 'cap', a: [hc[0] - 0.4, hc[1] - 4.6, hc[2] + 1.4], b: [hc[0] - 0.4, hc[1] + 4.6, hc[2] + 1.4], r: 0.55, mat: { ramp: H('#0c0c10', '#1c1c24', '#30303c') }, group: 'phones' });
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [hc[0] - 0.4, hc[1] + s * 4.6, hc[2] + 0.4], r: [1.7, 1.0, 1.7], mat: { ramp: H('#0c0c10', '#1c1c24', '#30303c', '#4a4a5a') }, group: 'cup' + s });
  },
  tail(p, o) {
    const cols: Array<[string[], number]> = [
      [['#5a0a10', '#a01a1a', '#d8302a'], -1.4],
      [['#0a1e5a', '#16349a', '#2a54d0'], 0],
      [['#5a0a10', '#a01a1a', '#d8302a'], 1.4],
    ];
    for (const [c, y] of cols) p.push({ k: 'cap', a: [-5.0, y * 0.5, 7.2], b: [-14.5, y * 1.4 + o.sway * 0.7, 6.4], r: 1.0, r2: 0.55, mat: { ramp: H(...c) }, group: 'tail' });
  },
};

// ── Пиранья «Рая» — piranha, padded vest, apron, vendor cap ──────────────────
const FISH = H('#2a3036', '#46525a', '#6a7882', '#96a4ac', '#c4ced4');
const piranya: Rig = {
  id: 'piranya',
  torsoC: [-0.2, 0, 8.0],
  torsoR: [5.5, 10.2, 5.0],
  shoulderY: 8.0,
  shoulderZ: 11.0,
  armR: 2.2,
  headC: [0.4, 0, 14.5],
  hipY: 3.9,
  footR: [2.4, 1.5, 1.1],
  pal: {
    torso: {
      ramp: H('#0c1424', '#16223a', '#223456', '#324a74'),
      pattern: (c) => {
        if (c.lx > 0.5 && Math.abs(c.ly) < 4.2) return c.lx > 3.2 && Math.abs(c.ly) < 2 && Math.abs(c.lx - 4.0) < 0.3 ? hex('#a8a296') : hex(c.nz > 0.7 ? '#efeadc' : '#cfc8b8'); // apron
        if (Math.abs(((c.y + 20) % 2.2) - 1.1) < 0.12) return -1; // quilting
        return null;
      },
    },
    sleeve: { ramp: H('#4a0a10', '#7a1418', '#a8241e', '#cc3a28'), dither: true },
    hand: { ramp: FISH },
    pants: { ramp: H('#1e1a18', '#2e2824', '#423a34', '#58504a') },
    shoe: { ramp: H('#1a1410', '#2c241c', '#40362a', '#584a3a') },
  },
  torsoExtras(p, o) {
    p.push({ k: 'ell', c: [0.8 + o.dx, o.dy, 12.3 + o.dz], r: [5.0, 5.8, 1.6], mat: { ramp: H('#4a0a10', '#7a1418', '#a8241e'), dither: true }, group: 'sweater' });
  },
  head(p, o) {
    const hc: V3 = [1.2 + o.dx, o.dy, 14.6 + o.dz];
    const hr: V3 = [6.0, 4.8, 4.0];
    // silver back, red belly showing at the sides of the jaw
    p.push({ k: 'ell', c: hc, r: hr, mat: { ramp: FISH, spec: { color: hex('#eef6fa'), power: 12, threshold: 0.82 }, pattern: (c) => (c.nz < 0.45 ? hex(c.nz < 0.25 ? '#a8241e' : '#cc4a30') : null) }, group: 'head' });
    // underbite jaw with teeth along the front edge
    p.push({ k: 'ell', c: [hc[0] + 4.0, hc[1], hc[2] - 1.0], r: [3.4, 4.2, 2.4], mat: { ramp: H('#6a1410', '#a8241e', '#d04a32', '#e8705a') }, group: 'jaw' });
    for (let i = -3; i <= 3; i++) {
      const y = i * 1.1;
      const x = hc[0] + 4.0 + 3.3 * Math.sqrt(Math.max(0, 1 - (y / 4.2) ** 2));
      p.push({ k: 'cap', a: [x - 0.6, hc[1] + y, hc[2] + 0.6], b: [x + 0.7, hc[1] + y, hc[2] + 1.6], r: 0.55, r2: 0.12, mat: { ramp: H('#e8e4d8', '#ffffff'), flat: true }, group: 'teeth' });
    }
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 1.8, s * 3.3, 0.2);
      p.push({ k: 'ell', c: [hc[0] + 1.8, hc[1] + s * 3.3, z], r: [1.15, 0.9, 0.8], mat: { ramp: H('#e8a020'), flat: true }, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] + 2.0, hc[1] + s * 3.35, z + 0.35], r: [0.6, 0.5, 0.5], mat: MAT.eyeDark, group: 'eye' });
    }
    // white vendor cap, dorsal fin peeking out behind it
    p.push({ k: 'ell', c: [hc[0] - 3.0, hc[1], hc[2] + 2.6], r: [2.8, 3.4, 1.5], mat: { ramp: H('#a8a294', '#cfc8b8', '#efeadc', '#fbf8ee') }, group: 'cap' });
    p.push({ k: 'cap', a: [hc[0] - 4.4, hc[1], hc[2] + 2.0], b: [hc[0] - 7.4, hc[1], hc[2] + 1.0], r: 0.7, r2: 0.3, mat: { ramp: H('#2a3036', '#46525a', '#6a7882') }, group: 'fin' });
  },
  tail(p, o) {
    const m: Material = { ramp: H('#2a3036', '#46525a', '#6a7882', '#8e9ca4') };
    const sw = o.sway * 0.8;
    p.push({ k: 'cap', a: [-5.2, 0, 5.4], b: [-8.6, sw * 0.5, 5.0], r: 1.6, r2: 1.0, mat: m, group: 'tail' });
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [-8.6, sw * 0.5, 5.0], b: [-12.2, s * 3.6 + sw, 4.8], r: 1.0, r2: 0.4, mat: m, group: 'tailfin' });
  },
};

// ── Акула «Аркадий» — shark, burgundy double-breasted jacket, cigar ──────────
const SHARK = H('#1e2832', '#30404e', '#4a5e6e', '#6a8090', '#9ab0be');
const BURGUNDY = H('#2a0610', '#4a0c1c', '#6e1428', '#94203a', '#b8344c');
const akula: Rig = {
  id: 'akula',
  torsoC: [-0.3, 0, 8.5],
  torsoR: [6.1, 11.8, 5.6],
  shoulderY: 9.4,
  shoulderZ: 11.8,
  armR: 2.5,
  headC: [0.4, 0, 15.4],
  hipY: 4.4,
  footR: [3.0, 1.6, 1.2],
  pal: {
    torso: {
      ramp: BURGUNDY,
      pattern: (c) => {
        if (c.lx > 2.0 && Math.abs(c.ly) < 2.2 - (c.lx - 2.0) * 0.4) return Math.abs(c.ly) < 0.5 ? hex('#101014') : hex('#efeadc'); // shirt + tie
        for (const y of [-2.6, 2.6]) for (const x of [0.5, 2.8]) if ((c.lx - x) ** 2 + (c.ly - y) ** 2 < 0.3) return hex('#e8c050'); // gold buttons
        return null;
      },
    },
    sleeve: { ramp: BURGUNDY, pattern: (c) => (c.t > 0.86 ? hex('#efeadc') : null) },
    hand: { ramp: SHARK },
    pants: { ramp: H('#14141a', '#202028', '#30303a', '#44444f') },
    shoe: { ramp: H('#0a0806', '#1a120c', '#2c2016', '#463422'), spec: { color: hex('#c0a080'), power: 16, threshold: 0.82 } },
  },
  torsoExtras(p, o) {
    // wide 80s shoulder pads
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [-0.8 + o.dx, s * 8.6 + o.dy, 12.2 + o.dz], r: [3.4, 3.0, 1.5], mat: { ramp: BURGUNDY }, group: 'pad' + s });
  },
  head(p, o) {
    const hc: V3 = [0.6 + o.dx, o.dy, 14.8 + o.dz];
    const hr: V3 = [5.8, 4.6, 3.6];
    const skin: Material = { ramp: SHARK, spec: { color: hex('#d8e4ec'), power: 12, threshold: 0.84 }, pattern: (c) => (c.nz < 0.4 ? hex('#e8ecee') : null) };
    p.push({ k: 'ell', c: hc, r: hr, mat: skin, group: 'head' });
    p.push({ k: 'cap', a: [hc[0] + 3.0, hc[1], hc[2] + 0.2], b: [hc[0] + 8.8, hc[1], hc[2] - 0.6], r: 3.1, r2: 1.2, mat: skin, group: 'snout' });
    // grin: a row of teeth along the jaw line
    for (let i = -4; i <= 4; i++) {
      const y = i * 0.75;
      const x = hc[0] + 5.6 - Math.abs(i) * 0.45;
      p.push({ k: 'cap', a: [x, hc[1] + y, hc[2] - 1.0], b: [x + 0.6, hc[1] + y, hc[2] - 0.6], r: 0.3, r2: 0.1, mat: { ramp: H('#e8e4d8', '#fbf8ee'), flat: true }, group: 'teeth' });
    }
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 2.4, s * 3.6, 0.1);
      p.push({ k: 'ell', c: [hc[0] + 2.4, hc[1] + s * 3.6, z], r: [0.6, 0.5, 0.5], mat: MAT.eyeDark, group: 'eye' });
      // gills
      for (let g = 0; g < 3; g++) p.push({ k: 'cap', a: [hc[0] - 1.6 - g * 0.9, hc[1] + s * 3.5, hc[2] + 0.6], b: [hc[0] - 1.9 - g * 0.9, hc[1] + s * 4.3, hc[2] - 0.6], r: 0.18, mat: { ramp: H('#141c24'), flat: true }, group: 'gill' });
    }
    // dorsal fin rising from the back of the head
    p.push({ k: 'cap', a: [hc[0] - 3.0, hc[1], hc[2] + 2.6], b: [hc[0] - 7.6, hc[1], hc[2] + 6.4], r: 1.4, r2: 0.25, mat: { ramp: H('#16202a', '#26343e', '#3a4c5a', '#566c7c') }, group: 'fin' });
    // cigar
    p.push({ k: 'cap', a: [hc[0] + 6.2, hc[1] + 2.4, hc[2] - 0.8], b: [hc[0] + 9.6, hc[1] + 4.8, hc[2] - 0.8], r: 0.75, mat: { ramp: H('#3a2010', '#5e3418', '#7e4a24') }, group: 'cigar' });
    p.push({ k: 'ell', c: [hc[0] + 9.9, hc[1] + 5.0, hc[2] - 0.7], r: [0.7, 0.7, 0.55], mat: MAT.ember, group: 'ember' });
  },
  tail(p, o) {
    const m: Material = { ramp: SHARK };
    const sw = o.sway;
    p.push({ k: 'cap', a: [-6.0, 0, 6.0], b: [-11.5, sw * 0.6, 6.4], r: 2.0, r2: 1.1, mat: m, group: 'tail' });
    p.push({ k: 'cap', a: [-11.5, sw * 0.6, 6.4], b: [-15.0, -3.2 + sw, 7.2], r: 1.1, r2: 0.3, mat: m, group: 'tailfin' });
    p.push({ k: 'cap', a: [-11.5, sw * 0.6, 6.4], b: [-14.2, 2.6 + sw, 6.6], r: 0.9, r2: 0.3, mat: m, group: 'tailfin' });
  },
};

// ── Орёл «Орлов» — eagle, grey suit, party pin, fur hat, long coat ───────────
const COAT_GREY = H('#121418', '#1e2228', '#2c3138', '#3e444c', '#565e68');
const oryol: Rig = {
  id: 'oryol',
  torsoC: [-0.4, 0, 8.5],
  torsoR: [6.0, 11.4, 5.5],
  shoulderY: 9.0,
  shoulderZ: 11.7,
  armR: 2.4,
  headC: [0.4, 0, 15.4],
  hipY: 4.3,
  footR: [3.0, 1.6, 1.2],
  pal: {
    torso: {
      ramp: COAT_GREY,
      pattern: (c) => {
        if (c.lx > 2.0 && Math.abs(c.ly) < 2.1 - (c.lx - 2.0) * 0.4) return Math.abs(c.ly) < 0.5 ? hex('#a01a1a') : hex('#efeadc');
        if ((c.lx - 2.6) ** 2 + (c.ly + 3.4) ** 2 < 0.45) return hex('#d02020'); // party pin
        return null;
      },
    },
    sleeve: { ramp: COAT_GREY },
    hand: { ramp: H('#060608', '#121216', '#202028', '#32323c'), spec: { color: hex('#8a90a0'), power: 14, threshold: 0.84 } },
    pants: { ramp: COAT_GREY },
    shoe: { ramp: H('#040405', '#0e0e12', '#1c1c22', '#33343c'), spec: { color: hex('#9aa2c0'), power: 18, threshold: 0.8 } },
  },
  torsoExtras(p, o) {
    // long coat flaring behind
    p.push({ k: 'ell', c: [-6.4 + o.dx, o.dy, 6.4 + o.dz * 0.5], r: [4.4, 11.6, 3.6], mat: { ramp: COAT_GREY }, group: 'skirt' });
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [1.6 + o.dx, s * 5.8 + o.dy, 13.0 + o.dz], r: [3.6, 2.2, 1.6], yaw: s * 0.5 + o.yaw, mat: { ramp: COAT_GREY }, group: 'collar' + s });
  },
  head(p, o) {
    const hc: V3 = [0.6 + o.dx, o.dy, 15.0 + o.dz];
    const hr: V3 = [4.8, 4.4, 4.0];
    p.push({ k: 'ell', c: hc, r: hr, mat: fur(H('#8a8478', '#b8b2a4', '#ddd8cc', '#f2eee4', '#fbf8f0')), group: 'head' });
    // hooked yellow beak
    p.push({ k: 'cap', a: [hc[0] + 3.0, hc[1], hc[2] + 1.2], b: [hc[0] + 8.4, hc[1], hc[2] + 0.4], r: 2.3, r2: 1.1, mat: { ramp: H('#7a5008', '#b88010', '#e8b020', '#ffd84a') }, group: 'beak' });
    p.push({ k: 'cap', a: [hc[0] + 8.2, hc[1], hc[2] + 0.4], b: [hc[0] + 9.2, hc[1], hc[2] - 1.2], r: 1.0, r2: 0.45, mat: { ramp: H('#5a3a06', '#8a600c') }, group: 'beak' });
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 2.6, s * 2.8, 0.15);
      p.push({ k: 'ell', c: [hc[0] + 2.6, hc[1] + s * 2.8, z], r: [0.85, 0.7, 0.6], mat: MAT.eyeYellow, group: 'eye' });
      p.push({ k: 'ell', c: [hc[0] + 2.85, hc[1] + s * 2.8, z + 0.3], r: [0.42, 0.38, 0.45], mat: MAT.eyeDark, group: 'eye' });
      // stern brow
      p.push({ k: 'cap', a: [hc[0] + 1.6, hc[1] + s * 1.6, z + 0.9], b: [hc[0] + 3.4, hc[1] + s * 3.4, z + 0.5], r: 0.45, mat: fur(H('#b8b2a4', '#ddd8cc')), group: 'brow' });
    }
    // пыжиковая шапка: a tall round fur hat
    p.push({ k: 'ell', c: [hc[0] - 2.6, hc[1], hc[2] + 2.8], r: [3.8, 4.4, 2.8], mat: fur(H('#2e2216', '#4a3824', '#6a5236', '#8a6e4c', '#a88a64')), group: 'hat' });
  },
  tail(p, o) {
    for (const [y, c] of [
      [-1.4, '#6a4a2a'],
      [0, '#f2eee4'],
      [1.4, '#6a4a2a'],
    ] as const)
      p.push({ k: 'cap', a: [-7.0, y * 0.5, 6.4], b: [-13.0, y * 1.5 + o.sway * 0.4, 6.0], r: 1.2, r2: 0.7, mat: { ramp: H('#2a1a0e', c) }, group: 'tail' });
  },
};

// ── Леопард «Лео» — leopard, plaid jacket, aviator sunglasses ────────────────
const LEO = H('#6a3a0a', '#a0601a', '#cc8a2c', '#e8b048', '#f6d27a');
const leoSpots = (base: RGBA[]): Material => ({
  ramp: base,
  dither: true,
  pattern: (c) => {
    const gx = c.x * 0.55 + (Math.floor(c.y * 0.55) % 2) * 0.5;
    const gy = c.y * 0.55;
    const d = (gx - Math.round(gx)) ** 2 + (gy - Math.round(gy)) ** 2;
    return d < 0.05 ? hex('#1a120a') : d < 0.09 ? hex('#7a4a14') : null;
  },
});
const PLAID = (c: PatternCtx): RGBA | number | null => {
  const a = Math.floor((c.x + 40) * 0.9) % 4 === 0;
  const b = Math.floor((c.y + 40) * 0.9) % 4 === 0;
  return a && b ? hex('#0a0c20') : a || b ? -1 : null;
};
const leopard: Rig = {
  id: 'leopard',
  torsoC: [-0.2, 0, 8.4],
  torsoR: [5.7, 11.0, 5.4],
  shoulderY: 8.7,
  shoulderZ: 11.6,
  armR: 2.35,
  headC: [0.2, 0, 15.2],
  hipY: 4.2,
  footR: [2.9, 1.6, 1.2],
  pal: {
    torso: { ramp: H('#0e1440', '#1a2470', '#2a3aa8', '#4058d0', '#6a84ee'), spec: { color: hex('#c8d8ff'), power: 9, threshold: 0.8 }, pattern: (c) => (c.lx > 1.6 && Math.abs(c.ly) < 3.0 - (c.lx - 1.6) * 0.3 ? hex('#141418') : PLAID(c)) },
    sleeve: { ramp: H('#0e1440', '#1a2470', '#2a3aa8', '#4058d0'), spec: { color: hex('#c8d8ff'), power: 9, threshold: 0.8 }, pattern: (c) => (c.t > 0.72 ? -1 : PLAID(c)) },
    hand: leoSpots(LEO),
    pants: { ramp: H('#0c0c12', '#16161e', '#22222c', '#32323e'), spec: { color: hex('#7a7a90'), power: 14, threshold: 0.86 } },
    shoe: { ramp: H('#8a8478', '#bab4a6', '#e2dccc', '#fbf8ee') },
  },
  torsoExtras(p, o) {
    // headphones resting on the neck
    p.push({ k: 'cap', a: [0.6 + o.dx, -4.8 + o.dy, 13.0 + o.dz], b: [0.6 + o.dx, 4.8 + o.dy, 13.0 + o.dz], r: 0.5, mat: { ramp: H('#0c0c10', '#1c1c24', '#30303c') }, group: 'phones' });
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [1.4 + o.dx, s * 5.0 + o.dy, 12.6 + o.dz], r: [1.4, 0.9, 1.4], mat: { ramp: H('#0c0c10', '#1c1c24', '#3a3a48') }, group: 'cup' + s });
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
    // aviator sunglasses (mirror)
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 3.0, s * 2.1, 0.3);
      p.push({ k: 'ell', c: [hc[0] + 3.0, hc[1] + s * 2.1, z], r: [1.3, 1.5, 0.5], mat: { ramp: H('#101820', '#1e3040', '#3a6080', '#8ab8d8'), spec: { color: hex('#ffffff'), power: 10, threshold: 0.7 } }, group: 'shades' });
    }
    p.push({ k: 'cap', a: [hc[0] + 3.2, hc[1] - 1.0, surf(hc, hr, 3.2, 0, 0.25)], b: [hc[0] + 3.2, hc[1] + 1.0, surf(hc, hr, 3.2, 0, 0.25)], r: 0.22, mat: MAT.gold, group: 'shades' });
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [hc[0] + 5.0, hc[1] + s * 1.8, hc[2] - 0.7], b: [hc[0] + 4.2, hc[1] + s * 6.0, hc[2] - 0.8], r: 0.2, mat: { ramp: H('#cfcac0', '#f2efe6'), flat: true }, group: 'whisker' });
  },
  tail(p, o) {
    const m = leoSpots(LEO);
    const sw = o.sway * 1.3;
    p.push({ k: 'cap', a: [-6.2, -0.8, 6.6], b: [-12, -2.6 + sw * 0.5, 6.0], r: 1.4, r2: 1.2, mat: m, group: 'tail' });
    p.push({ k: 'cap', a: [-12, -2.6 + sw * 0.5, 6.0], b: [-16.4, -6.4 + sw, 5.6], r: 1.2, r2: 0.9, mat: m, group: 'tail' });
  },
};

// ── Слон «Борис» — elephant, doorman's uniform with gold braid, white gloves ─
const ELEPHANT = H('#3e3e46', '#5a5a64', '#7a7a86', '#9c9ca8', '#c0c0ca');
const LIVERY = H('#2a0810', '#4a101c', '#6a1828', '#8c2436', '#ac3446');
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
      ramp: LIVERY,
      pattern: (c) => {
        if (Math.abs(Math.abs(c.ly) - 3.0) < 0.35 && c.lx > -1) return hex('#e8c050'); // braid
        for (const y of [-3.0, 3.0]) for (const x of [0, 1.8, 3.6]) if ((c.lx - x) ** 2 + (c.ly - y) ** 2 < 0.35) return hex('#ffe08a');
        return null;
      },
    },
    sleeve: { ramp: LIVERY, pattern: (c) => (c.t > 0.8 && c.t < 0.88 ? hex('#e8c050') : null) },
    hand: { ramp: H('#a8a294', '#d0cabc', '#efeadc', '#fbf8ee') },
    pants: { ramp: H('#14141a', '#20202a', '#30303c', '#444452'), pattern: (c) => (Math.abs(c.s) > 1.0 && Math.abs(c.s) < 1.4 ? hex('#c89a30') : null) },
    shoe: { ramp: H('#040405', '#0e0e12', '#1c1c22', '#33343c'), spec: { color: hex('#9aa2c0'), power: 18, threshold: 0.8 } },
  },
  torsoExtras(p, o) {
    // epaulettes with fringe
    for (const s of [-1, 1]) {
      p.push({ k: 'ell', c: [-0.4 + o.dx, s * 10.0 + o.dy, 13.2 + o.dz], r: [2.6, 1.8, 0.8], mat: { ramp: H('#7a5a10', '#b8902a', '#e8c050', '#ffe08a') }, group: 'epau' + s });
      for (let i = -2; i <= 2; i++) p.push({ k: 'cap', a: [-0.4 + i * 0.9 + o.dx, s * 11.3 + o.dy, 12.8 + o.dz], b: [-0.4 + i * 0.9 + o.dx, s * 12.6 + o.dy, 12.2 + o.dz], r: 0.25, mat: { ramp: H('#b8902a', '#e8c050') }, group: 'fringe' + s });
    }
    p.push({ k: 'ell', c: [-6.8 + o.dx, o.dy, 6.6 + o.dz * 0.5], r: [4.2, 12.4, 3.8], mat: { ramp: LIVERY }, group: 'skirt' });
  },
  head(p, o) {
    const hc: V3 = [0.6 + o.dx, o.dy, 15.6 + o.dz];
    const hr: V3 = [5.6, 5.4, 4.8];
    p.push({ k: 'ell', c: hc, r: hr, mat: fur(ELEPHANT), group: 'head' });
    // big ears to the sides
    for (const s of [-1, 1]) {
      p.push({ k: 'ell', c: [hc[0] - 1.6, hc[1] + s * 8.2, hc[2] - 0.6], r: [4.4, 4.2, 1.0], yaw: s * -0.25, mat: { ...fur(ELEPHANT), pattern: (c) => (Math.abs(c.ly) < 2.6 && Math.abs(c.lx) < 3.0 ? hex('#a87a7a') : null) }, group: 'ear' + s });
    }
    // trunk curling forward and down, small tusks
    const trunk: Material = { ramp: ELEPHANT, pattern: (c) => (Math.floor(c.t * 9) % 2 === 0 ? -1 : null) };
    p.push({ k: 'cap', a: [hc[0] + 3.6, hc[1], hc[2] + 0.6], b: [hc[0] + 8.4, hc[1], hc[2] - 0.2], r: 2.1, r2: 1.6, mat: trunk, group: 'trunk' });
    p.push({ k: 'cap', a: [hc[0] + 8.4, hc[1], hc[2] - 0.2], b: [hc[0] + 11.4, hc[1] + 0.8 + o.sway * 0.3, hc[2] - 1.4], r: 1.6, r2: 1.1, mat: trunk, group: 'trunk' });
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [hc[0] + 4.0, hc[1] + s * 2.4, hc[2] - 1.6], b: [hc[0] + 6.8, hc[1] + s * 3.0, hc[2] - 2.0], r: 0.6, r2: 0.3, mat: { ramp: H('#c8c0a8', '#efe8d4', '#fbf8ee') }, group: 'tusk' });
    eyes(p, hc, hr, 3.2, 3.2, MAT.eyeDark, 0.55, false);
    // doorman's cap: crown, gold band, visor
    p.push({ k: 'ell', c: [hc[0] - 2.4, hc[1], hc[2] + 3.2], r: [3.8, 4.0, 1.9], mat: { ramp: LIVERY, pattern: (c) => (Math.sqrt((c.lx / 3.8) ** 2 + (c.ly / 4.0) ** 2) > 0.8 ? hex('#e8c050') : null) }, group: 'cap' });
    p.push({ k: 'ell', c: [hc[0] + 1.2, hc[1], hc[2] + 2.8], r: [1.3, 3.2, 0.55], mat: { ramp: H('#040406', '#0e0e12', '#1e1e26'), spec: { color: hex('#9aa4c0'), power: 14, threshold: 0.8 } }, group: 'visor' });
  },
  tail(p, o) {
    p.push({ k: 'cap', a: [-7.2, 0, 6.6], b: [-11.4, 0.6 + o.sway * 0.4, 5.4], r: 0.6, r2: 0.4, mat: { ramp: ELEPHANT }, group: 'tail' });
    p.push({ k: 'ell', c: [-11.8, 0.7 + o.sway * 0.4, 5.3], r: [1.0, 0.8, 0.7], mat: { ramp: H('#1a1a1e', '#2c2c32') }, group: 'tuft' });
  },
};

// ── Лобстер «Омар Семёнович» — lobster, white shop coat, claws ───────────────
const SHELL = H('#4a0806', '#7a120c', '#a82014', '#d43a22', '#f06a44');
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
      ramp: H('#8a8478', '#b4ae9e', '#d8d2c2', '#efeadc', '#fbf8ee'),
      pattern: (c) => {
        if (c.lx > 2.4 && Math.abs(c.ly) < 1.8 - (c.lx - 2.4) * 0.4) return Math.abs(c.ly) < 0.45 ? hex('#1a2a5a') : hex('#c8d4e8'); // shirt + tie
        if (Math.abs(c.lx - 1.4) < 1.2 && Math.abs(c.ly + 5.0) < 1.1) return Math.abs(c.ly + 4.4) < 0.18 && c.lx > 1.6 ? hex('#1a2a8a') : hex('#c8c2b4'); // pocket + pen
        return null;
      },
    },
    sleeve: { ramp: H('#8a8478', '#b4ae9e', '#d8d2c2', '#efeadc'), pattern: (c) => (c.t > 0.86 ? hex(c.nz > 0.6 ? '#d43a22' : '#a82014') : null) },
    hand: { ramp: SHELL },
    pants: { ramp: H('#14182a', '#1e2440', '#2a3256', '#3a446e') },
    shoe: { ramp: H('#0a0806', '#1a120c', '#2c2016', '#463422') },
  },
  hand(p, at, side) {
    // a big claw: palm + two pincers opening forward
    const m: Material = { ramp: SHELL, spec: { color: hex('#ffd0b0'), power: 12, threshold: 0.82 } };
    p.push({ k: 'ell', c: [at[0] + 0.6, at[1], at[2]], r: [2.6, 2.0, 1.6], mat: m, group: 'claw' + side });
    p.push({ k: 'cap', a: [at[0] + 2.2, at[1] - side * 0.5, at[2] + 0.2], b: [at[0] + 5.6, at[1] - side * 1.2, at[2] + 0.2], r: 1.3, r2: 0.45, mat: m, group: 'claw' + side });
    p.push({ k: 'cap', a: [at[0] + 2.2, at[1] + side * 0.9, at[2]], b: [at[0] + 4.8, at[1] + side * 1.9, at[2] - 0.2], r: 1.0, r2: 0.35, mat: m, group: 'pincer' + side });
  },
  torsoExtras(p, o) {
    p.push({ k: 'ell', c: [1.0 + o.dx, o.dy, 12.6 + o.dz], r: [5.2, 6.4, 1.6], mat: { ramp: H('#8a8478', '#b4ae9e', '#d8d2c2', '#efeadc') }, group: 'collar' });
  },
  head(p, o) {
    const hc: V3 = [0.8 + o.dx, o.dy, 14.6 + o.dz];
    const hr: V3 = [5.6, 4.2, 3.6];
    const shell: Material = { ramp: SHELL, spec: { color: hex('#ffd8c0'), power: 12, threshold: 0.84 }, pattern: (c) => (Math.abs(((c.x + 30) % 2.4) - 1.2) < 0.15 ? -1 : null) };
    p.push({ k: 'ell', c: hc, r: hr, mat: shell, group: 'head' });
    // rostrum
    p.push({ k: 'cap', a: [hc[0] + 4.0, hc[1], hc[2] + 0.8], b: [hc[0] + 8.0, hc[1], hc[2] + 0.2], r: 1.2, r2: 0.25, mat: shell, group: 'rostrum' });
    // eye stalks
    for (const s of [-1, 1]) {
      p.push({ k: 'cap', a: [hc[0] + 3.0, hc[1] + s * 1.6, hc[2] + 2.2], b: [hc[0] + 4.4, hc[1] + s * 2.6, hc[2] + 3.4], r: 0.45, mat: shell, group: 'stalk' });
      p.push({ k: 'ell', c: [hc[0] + 4.6, hc[1] + s * 2.7, hc[2] + 3.6], r: [0.75, 0.7, 0.7], mat: { ramp: H('#0a0806', '#1a1210', '#2a2420') }, group: 'eye' });
    }
    // long antennae sweeping back over the shoulders
    for (const s of [-1, 1]) {
      p.push({ k: 'cap', a: [hc[0] + 5.0, hc[1] + s * 1.0, hc[2] + 0.6], b: [hc[0] + 9.0, hc[1] + s * 6.0, hc[2] + 1.6], r: 0.35, r2: 0.28, mat: { ramp: SHELL }, group: 'antenna' });
      p.push({ k: 'cap', a: [hc[0] + 9.0, hc[1] + s * 6.0, hc[2] + 1.6], b: [hc[0] + 4.0, hc[1] + s * 14.0 + o.sway * 0.4, hc[2] + 2.0], r: 0.28, r2: 0.15, mat: { ramp: SHELL }, group: 'antenna' });
    }
  },
  tail(p, o) {
    const m: Material = { ramp: SHELL };
    for (let i = 0; i < 3; i++) p.push({ k: 'ell', c: [-6.4 - i * 2.2, o.sway * 0.2 * i, 6.4 - i * 0.6], r: [1.6, 3.4 - i * 0.5, 1.4], mat: m, group: 'seg' + i });
    for (const a of [-0.7, 0, 0.7]) p.push({ k: 'cap', a: [-12.4, 0, 5.0], b: [-12.4 - Math.cos(a) * 3.4, Math.sin(a) * 3.0 + o.sway * 0.5, 4.8], r: 0.9, r2: 1.3, mat: m, group: 'fan' });
  },
};

export const EXTRA_RIGS: Record<Exclude<CharacterId, 'petya' | 'valuta' | 'uchastkovy' | 'mihalych'>, Rig> = { vorona, zmeya, varan, popugay, piranya, akula, oryol, leopard, slon, lobster };

export type { PoseOffsets };
