/**
 * Top-down rigs of the twelve characters of v0.2.18 part 2, re-modelled from the product owner's sheets
 * (references/65…76): outfit, palette, head shape and accessories as seen from straight above.
 * Same conventions as characters.ts: facing +x, y+ = right side, z up, world px.
 *
 * The sheets' blood splatters and tattoos stay on the sheets; the abilities drawn on them (claws that
 * strike, webs, splitting) are looks only — every character fights with the same weapons and numbers.
 */
import { hex } from './lib/raster.js';
import type { RGBA } from './lib/raster.js';
import type { Material, PatternCtx, Prim, V3 } from './lib/model.js';
import { MAT } from './materials.js';
import type { Rig, PoseOffsets } from './characters.js';
import { surf, fur, scales, shoulderStripes, sleeveStripes, legStripe, goldChain, shadesOnEyes, cigar, SHEARLING } from './characters2.js';

const H = (...c: string[]): RGBA[] => c.map((x) => hex(x));
/** Manual shading for explicit pattern colours (they bypass the lighting). */
const lit = (ramp: RGBA[], nz: number): RGBA => (nz > 0.75 ? ramp[3]! : nz > 0.45 ? ramp[2]! : ramp[1]!);

// ── shared pieces ───────────────────────────────────────────────────────────
const TANK = H('#6a665e', '#9e988c', '#c8c2b4', '#e6e0d4', '#f6f2ea');
const CHAIN: Material = { ...MAT.gold, pattern: (c) => (Math.floor(c.t * 3) % 2 ? 0.7 : null) };
const IRON: Material = { ramp: H('#16181c', '#2c3036', '#4a5058', '#6e7680', '#98a0aa'), spec: { color: hex('#e0e6f0'), power: 16, threshold: 0.8 }, pattern: (c) => (Math.floor(c.t * 4) % 2 ? 0.7 : null) };
const STRAP: Material = { ramp: H('#140c06', '#24160c', '#382414', '#4e3420', '#64442c') };
const BLACK_CLOTH = H('#08080a', '#121215', '#1d1d22', '#2b2b32', '#3e3e48');
const BOOTS: Material = { ramp: H('#060608', '#0e0e12', '#1c1c22', '#2e2e36'), spec: { color: hex('#9aa2c0'), power: 18, threshold: 0.8 } };
const DARK_PANTS: Material = { ramp: H('#121216', '#1c1c22', '#28282f', '#36363e', '#46464f') };
const GLOVE: Material = { ramp: H('#0c0a08', '#18140f', '#262019', '#383026') };
const CLAW: Material = { ramp: H('#5a5244', '#8e8470', '#beb49c', '#e2dac4', '#f6f0e0') };
const PINK: Material = { ramp: H('#6a3a3e', '#a05a60', '#c87a7e', '#e2a0a0') };
const SCAR: Material = { ramp: H('#c06a6a'), flat: true };

/**
 * A ribbed white vest («майка») on the torso: bare skin over the shoulders beyond the straps and in the
 * scooped neckline at the front; the rest white with fine ribs.
 */
function tank(skin: RGBA[], straps = 6.8) {
  return (c: PatternCtx): RGBA | number | null => {
    const ay = Math.abs(c.ly);
    if (ay > straps) return lit(skin, c.nz);
    if (c.lx > 2.0 && ay < 3.4 - (c.lx - 2.0) * 0.35) return lit(skin, c.nz);
    return Math.abs(((c.ly * 1.7 + 40) % 1.3) - 0.65) < 0.09 ? -1 : null;
  };
}

/** A strap from a to b across the torso (body space), with a ring at `ringAt` (0…1). */
function strap(p: Prim[], o: PoseOffsets, a: V3, b: V3, mat: Material = STRAP, r = 0.6, ringAt = -1) {
  p.push({ k: 'cap', a: [a[0] + o.dx, a[1] + o.dy, a[2] + o.dz], b: [b[0] + o.dx, b[1] + o.dy, b[2] + o.dz], r, mat, group: 'strap' });
  if (ringAt >= 0) {
    const t = ringAt;
    p.push({ k: 'ell', c: [a[0] + (b[0] - a[0]) * t + o.dx, a[1] + (b[1] - a[1]) * t + o.dy, a[2] + (b[2] - a[2]) * t + 0.5 + o.dz], r: [0.8, 0.8, 0.4], mat: IRON, group: 'ring' });
  }
}

/** A standing tracksuit collar round the neck with a light edge. */
function trackCollar(p: Prim[], o: PoseOffsets, ramp: RGBA[], edge: RGBA, z = 12.9, rx = 5.0, ry = 5.8) {
  p.push({
    k: 'ell',
    c: [1.0 + o.dx, o.dy, z + o.dz],
    r: [rx, ry, 1.7],
    yaw: o.yaw,
    mat: { ramp, pattern: (c) => { const r = Math.sqrt((c.lx / rx) ** 2 + (c.ly / ry) ** 2); return r > 0.8 && r < 0.92 ? edge : null; } },
    group: 'collar',
  });
}

/** Default hand plus a band round the wrist (watch, bracelet) and claws or blades forward. */
function paw(p: Prim[], at: V3, side: -1 | 1, rig: Rig, o: { band?: Material; bandSide?: -1 | 0 | 1; claws?: Material; clawLen?: number; clawR?: number; clawOut?: number }) {
  p.push({ k: 'ell', c: at, r: [rig.armR * 0.85, rig.armR * 0.8, rig.armR * 0.75], mat: rig.pal.hand, group: 'hand' + side });
  if (o.band && (!o.bandSide || o.bandSide === side)) p.push({ k: 'ell', c: [at[0] - rig.armR * 0.7, at[1], at[2] + 0.2], r: [rig.armR * 0.32, rig.armR * 0.82, rig.armR * 0.6], mat: o.band, group: 'band' + side });
  if (o.claws) {
    const len = o.clawLen ?? 2.6;
    const out = o.clawOut ?? 0.25;
    for (const k of [-1, 0, 1]) {
      const a: V3 = [at[0] + rig.armR * 0.55, at[1] + k * rig.armR * 0.38, at[2] + 0.1];
      p.push({ k: 'cap', a, b: [a[0] + len, a[1] + k * 0.5 + side * out * len, a[2] - 0.5], r: o.clawR ?? 0.36, r2: 0.08, mat: o.claws, group: 'claw' + side });
    }
  }
}

/** Eyes on the front of a head: a coloured eye, a pupil and a glint (z on the head's surface). */
function eyes(p: Prim[], hc: V3, hr: V3, dx: number, spread: number, iris: Material, size = 0.75, pupil: 'round' | 'slit' | 'bar' = 'round') {
  for (const s of [-1, 1]) {
    const z = surf(hc, hr, dx, s * spread, 0.15);
    p.push({ k: 'ell', c: [hc[0] + dx, hc[1] + s * spread, z], r: [size, size * 0.8, size * 0.6], mat: iris, group: 'eye' });
    const pr: V3 = pupil === 'slit' ? [size * 0.45, size * 0.18, 0.4] : pupil === 'bar' ? [size * 0.2, size * 0.55, 0.4] : [size * 0.42, size * 0.42, 0.4];
    p.push({ k: 'ell', c: [hc[0] + dx + size * 0.25, hc[1] + s * spread, z + 0.2], r: pr, mat: MAT.eyeDark, group: 'eye' });
    p.push({ k: 'ell', c: [hc[0] + dx + size * 0.1, hc[1] + s * spread - size * 0.3, z + 0.35], r: [0.18, 0.18, 0.15], mat: MAT.glint, group: 'eye' });
  }
}

/** A heavy gold chain (thick links) round the neck with a medallion. */
function heavyChain(p: Prim[], o: PoseOffsets, rx: number, ry: number, z: number, medal = 1.4, cx = 0.6) {
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a0 = -1.8 + (3.6 * i) / N;
    const a1 = -1.8 + (3.6 * (i + 1)) / N;
    p.push({ k: 'cap', a: [cx + Math.cos(a0) * rx + o.dx, Math.sin(a0) * ry + o.dy, z + o.dz - Math.abs(Math.sin(a0)) * 0.6], b: [cx + Math.cos(a1) * rx + o.dx, Math.sin(a1) * ry + o.dy, z + o.dz - Math.abs(Math.sin(a1)) * 0.6], r: 1.0, mat: CHAIN, group: 'chain' });
  }
  if (medal > 0) p.push({ k: 'ell', c: [cx + rx + 1.1 + o.dx, o.dy, z - 0.8 + o.dz], r: [medal, medal * 0.9, 0.7], mat: MAT.gold, group: 'pendant' });
}

// ── Черри «Зайчиха» — cream rabbit, blonde bun, white crop top, red jacket off the shoulders, jeans ──
const CREAM = H('#7a5e44', '#b08e6c', '#d8b894', '#ecd4b2', '#f8ead4');
const BLONDE: Material = { ramp: H('#6a4a1e', '#a07a36', '#cfa556', '#e8c878', '#f8e4a8'), dither: true, pattern: (c) => (Math.abs(((c.y * 1.5 + Math.sin(c.x * 1.1) * 1.2 + 40) % 1.6) - 0.8) < 0.11 ? -1 : null) };
const RED_JACKET = H('#3a0608', '#6a0e12', '#9a1a1c', '#c4282a', '#e04a3c');
const JEANS: Material = { ramp: H('#141c2a', '#1e2a40', '#2c3c5c', '#3e507a', '#566a96'), dither: true };
const zaychiha: Rig = {
  id: 'zaychiha',
  torsoC: [-0.2, 0, 8.0],
  torsoR: [5.0, 9.8, 4.8],
  shoulderY: 7.8,
  shoulderZ: 11.0,
  armR: 2.0,
  headC: [0.6, 0, 14.6],
  hipY: 3.6,
  footR: [2.5, 1.2, 1.0],
  pal: {
    torso: {
      ramp: TANK,
      pattern: (c) => {
        // the red jacket has slipped down the back; bare shoulders; a white top
        if (c.lx < -2.8) return lit(RED_JACKET, c.nz);
        const ay = Math.abs(c.ly);
        if (ay > 6.2) return lit(CREAM, c.nz);
        if (c.lx > 1.8 && ay < 3.4 - (c.lx - 1.8) * 0.4) return lit(CREAM, c.nz);
        return null;
      },
    },
    sleeve: { ramp: RED_JACKET, spec: { color: hex('#f0b0a0'), power: 10, threshold: 0.8 }, pattern: (c) => (c.t > 0.84 && c.t < 0.95 ? hex('#2a0406') : null) },
    hand: fur(CREAM),
    pants: JEANS,
    shoe: BOOTS,
  },
  torsoExtras(p, o) {
    // the jacket's collar hanging low behind the shoulders
    p.push({ k: 'ell', c: [-4.2 + o.dx, o.dy, 11.0 + o.dz], r: [1.9, 8.2, 1.7], yaw: o.yaw, mat: { ramp: RED_JACKET }, group: 'jacketback' });
    goldChain(p, o, 4.0, 4.3, 12.8, 0.6);
  },
  head(p, o) {
    const hc: V3 = [0.6 + o.dx, o.dy, 14.6 + o.dz];
    const hr: V3 = [4.0, 3.5, 3.5];
    p.push({ k: 'ell', c: hc, r: hr, mat: fur(CREAM), group: 'head' });
    // long ears standing up and leaning back, pink inside
    for (const s of [-1, 1]) {
      p.push({ k: 'cap', a: [hc[0] - 0.6, hc[1] + s * 2.0, hc[2] + 2.6], b: [hc[0] - 4.0, hc[1] + s * 6.0, hc[2] + 7.2], r: 1.5, r2: 1.0, mat: fur(CREAM), group: 'ear' + s });
      p.push({ k: 'cap', a: [hc[0] - 0.4, hc[1] + s * 2.1, hc[2] + 3.1], b: [hc[0] - 3.6, hc[1] + s * 5.8, hc[2] + 7.6], r: 0.7, r2: 0.4, mat: PINK, group: 'ear' + s });
      // gold hoops
      p.push({ k: 'ell', c: [hc[0] - 0.2, hc[1] + s * 3.7, hc[2] - 0.9], r: [0.8, 0.35, 1.0], mat: MAT.gold, group: 'earring' + s });
    }
    // blonde hair over the crown and a bun on top
    p.push({ k: 'ell', c: [hc[0] - 0.9, hc[1], hc[2] + 1.1], r: [3.3, 3.8, 2.6], mat: BLONDE, group: 'hair' });
    p.push({ k: 'ell', c: [hc[0] - 2.2, hc[1], hc[2] + 3.4], r: [2.0, 2.1, 1.7], mat: BLONDE, group: 'bun' });
    // muzzle, pink nose, brown eyes
    p.push({ k: 'ell', c: [hc[0] + 3.2, hc[1], hc[2] - 1.0], r: [1.8, 2.0, 1.5], mat: fur(H('#9a7e62', '#c8aa88', '#e6d0b0', '#f6e8d2')), group: 'muzzle' });
    p.push({ k: 'ell', c: [hc[0] + 4.7, hc[1], hc[2] - 0.5], r: [0.55, 0.75, 0.45], mat: PINK, group: 'nose' });
    eyes(p, hc, hr, 2.1, 1.9, { ramp: H('#6a3a14'), flat: true }, 0.75);
    cigar(p, [hc[0] + 4.2, hc[1] + 1.2, hc[2] - 1.4], 1.0, 0.8, 2.8, 0.42, MAT.cigarette);
  },
  tail(p) {
    p.push({ k: 'ell', c: [-5.4, 0, 6.8], r: [1.5, 1.5, 1.4], mat: fur(H('#a49e92', '#cfc9bc', '#ebe6da', '#f8f5ee')), group: 'tail' });
  },
};

// ── Длинный «Заяц» — grey hare, very long ears laid back, black tracksuit with white stripes, gold ──
const GREY_FUR = H('#2e2c2c', '#4a4646', '#6a6464', '#8c8684', '#b0aaa6');
const zayac: Rig = {
  id: 'zayac',
  torsoC: [-0.2, 0, 8.2],
  torsoR: [5.4, 10.4, 5.0],
  shoulderY: 8.2,
  shoulderZ: 11.4,
  armR: 2.15,
  headC: [0.8, 0, 14.8],
  hipY: 3.9,
  footR: [2.8, 1.3, 1.1],
  pal: {
    torso: {
      ramp: BLACK_CLOTH,
      pattern: (c) => {
        const st = shoulderStripes(c, 6.2);
        if (st) return st;
        if (c.lx > 3.2 && Math.abs(c.ly) < 2.2) return lit(GREY_FUR, c.nz);
        return c.lx > 0 && Math.abs(c.ly) < 0.22 ? hex('#5a5a62') : null;
      },
    },
    sleeve: { ramp: BLACK_CLOTH, pattern: sleeveStripes },
    hand: fur(GREY_FUR),
    pants: { ramp: BLACK_CLOTH, pattern: legStripe },
    shoe: { ramp: H('#0c0c0e', '#1a1a1e', '#2c2c32', '#44444c'), pattern: (c) => (c.lz < -0.5 ? hex('#d8d4ca') : null) },
  },
  hand(p, at, side, rig) {
    paw(p, at, side, rig, { band: MAT.gold, bandSide: -1 });
  },
  torsoExtras(p, o) {
    trackCollar(p, o, BLACK_CLOTH, hex('#d8d4ca'));
    goldChain(p, o, 4.6, 5.0, 13.4, 0.9);
  },
  head(p, o) {
    const hc: V3 = [0.8 + o.dx, o.dy, 14.8 + o.dz];
    const hr: V3 = [4.2, 3.6, 3.6];
    p.push({ k: 'ell', c: hc, r: hr, mat: fur(GREY_FUR), group: 'head' });
    // very long ears laid back over the shoulders
    for (const s of [-1, 1]) {
      p.push({ k: 'cap', a: [hc[0] - 0.8, hc[1] + s * 1.5, hc[2] + 2.6], b: [hc[0] - 9.0, hc[1] + s * 3.2 + o.sway * 0.2, hc[2] + 4.6], r: 1.65, r2: 1.05, mat: fur(GREY_FUR), group: 'ear' + s });
      p.push({ k: 'cap', a: [hc[0] - 1.4, hc[1] + s * 1.5, hc[2] + 3.2], b: [hc[0] - 8.4, hc[1] + s * 3.1 + o.sway * 0.2, hc[2] + 5.0], r: 0.7, r2: 0.4, mat: { ramp: H('#5a4648', '#7a6064', '#9a7c80') }, group: 'ear' + s });
    }
    p.push({ k: 'ell', c: [hc[0] + 3.3, hc[1], hc[2] - 1.0], r: [1.9, 2.1, 1.6], mat: fur(H('#5a5652', '#7e7a74', '#a6a098', '#c8c2b8')), group: 'muzzle' });
    p.push({ k: 'ell', c: [hc[0] + 4.9, hc[1], hc[2] - 0.5], r: [0.55, 0.75, 0.45], mat: { ramp: H('#2a1a1a', '#4a2e2e', '#6a4444') }, group: 'nose' });
    eyes(p, hc, hr, 2.2, 1.9, { ramp: H('#d8a020'), flat: true }, 0.7);
    // a heavy brow and the scar across the face
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [hc[0] + 1.6, hc[1] + s * 1.0, surf(hc, hr, 1.6, s * 1.0, 0.5)], b: [hc[0] + 2.4, hc[1] + s * 2.9, surf(hc, hr, 2.4, s * 2.9, 0.5)], r: 0.45, mat: fur(GREY_FUR), group: 'brow' });
    p.push({ k: 'cap', a: [hc[0] + 1.2, hc[1] - 2.8, surf(hc, hr, 1.2, -2.8, 0.25)], b: [hc[0] + 3.8, hc[1] + 0.4, surf(hc, hr, 3.8, 0.4, 0.4)], r: 0.2, mat: SCAR, group: 'scar' });
    cigar(p, [hc[0] + 4.4, hc[1] + 1.2, hc[2] - 1.4], 1.0, 0.9, 3.0, 0.42, MAT.cigarette);
  },
  tail(p) {
    p.push({ k: 'ell', c: [-5.8, 0, 6.8], r: [1.4, 1.4, 1.3], mat: fur(GREY_FUR), group: 'tail' });
  },
};

// ── Василиск «Кожаный Гребень» — basilisk lizard, red crest, aviators, leather jacket, loud red shirt ──
const LIZARD = H('#2e3410', '#4e5a18', '#748424', '#9cae36', '#c4d058');
const lizard = scales(LIZARD, 1.3, hex('#d8e070'));
const CREST: Material = { ramp: H('#3a0a04', '#6e1608', '#a82a10', '#d4461c', '#f07a34'), pattern: (c) => (Math.abs(((c.t * 3) % 1) - 0.5) < 0.08 ? -1 : null) };
const LEATHER: Material = { ramp: H('#060608', '#0e0e12', '#18181e', '#26262e', '#363640'), spec: { color: hex('#9a9ab4'), power: 14, threshold: 0.76 } };
const LOUD_SHIRT = (c: PatternCtx): RGBA => {
  const d = (Math.floor((c.x + 40) * 1.1) * 5 + Math.floor((c.y + 40) * 1.1) * 3) % 7;
  return d === 0 ? hex('#f0c040') : d === 3 ? hex('#1a0a08') : lit(H('#4a0808', '#7a1010', '#a81c18', '#cc3424'), c.nz);
};
const vasilisk: Rig = {
  id: 'vasilisk',
  torsoC: [-0.2, 0, 8.2],
  torsoR: [5.4, 10.6, 5.0],
  shoulderY: 8.2,
  shoulderZ: 11.4,
  armR: 2.2,
  headC: [1.4, 0, 14.6],
  hipY: 3.9,
  footR: [2.9, 1.3, 1.1],
  pal: {
    torso: { ...LEATHER, pattern: (c) => (c.lx > 1.4 && Math.abs(c.ly) < 3.6 - (c.lx - 1.4) * 0.25 ? LOUD_SHIRT(c) : null) },
    sleeve: { ...LEATHER, pattern: (c) => (c.t > 0.86 ? -1 : null) },
    hand: lizard,
    pants: DARK_PANTS,
    shoe: BOOTS,
  },
  hand(p, at, side, rig) {
    paw(p, at, side, rig, { band: MAT.gold, bandSide: -1 });
  },
  torsoExtras(p, o) {
    // the jacket's wide lapels, the shirt's collar over them, a gold chain
    for (const s of [-1, 1]) {
      p.push({ k: 'ell', c: [0.9 + o.dx, s * 4.6 + o.dy, 12.4 + o.dz], r: [3.6, 1.6, 1.2], yaw: s * -0.35 + o.yaw, mat: LEATHER, group: 'lapel' + s });
      p.push({ k: 'ell', c: [2.6 + o.dx, s * 3.0 + o.dy, 13.2 + o.dz], r: [1.8, 1.0, 0.7], yaw: s * -0.6 + o.yaw, mat: { ramp: H('#4a0808', '#7a1010', '#a81c18', '#cc3424') }, group: 'shirtcollar' + s });
    }
    goldChain(p, o, 4.6, 4.9, 13.4, 1.0);
  },
  head(p, o) {
    const hc: V3 = [1.4 + o.dx, o.dy, 14.6 + o.dz];
    const hr: V3 = [5.0, 3.2, 3.0];
    p.push({ k: 'ell', c: hc, r: hr, mat: lizard, group: 'head' });
    // a long snout, a light lip line
    p.push({ k: 'ell', c: [hc[0] + 3.8, hc[1], hc[2] - 0.8], r: [2.6, 2.2, 1.8], mat: lizard, group: 'snout' });
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [hc[0] + 2.0, hc[1] + s * 2.4, hc[2] - 1.4], b: [hc[0] + 6.0, hc[1] + s * 1.0, hc[2] - 1.6], r: 0.3, mat: { ramp: H('#c8c470', '#e0dc90') }, group: 'lip' });
    shadesOnEyes(p, hc, hr, 1.6, 2.0, 1.25);
    // the crest: a row of tall red spikes from the brow down the back of the neck
    for (let i = 0; i < 8; i++) {
      const x = hc[0] + 1.8 - i * 1.15;
      const z = hc[2] + (i < 5 ? 2.4 : 1.8 - (i - 5) * 0.8);
      const h = 3.6 - Math.abs(i - 2.5) * 0.45;
      p.push({ k: 'cap', a: [x, hc[1] + (i % 2 ? 0.25 : -0.25), z], b: [x - 2.2, hc[1] + (i % 2 ? 0.6 : -0.6), z + h], r: 1.05, r2: 0.2, mat: CREST, group: 'crest' });
    }
    cigar(p, [hc[0] + 5.2, hc[1] + 1.4, hc[2] - 1.4], 1.0, 0.9, 2.8, 0.42, MAT.cigarette);
  },
  tail(p, o) {
    const sw = o.sway * 1.2;
    p.push({ k: 'cap', a: [-5.0, 0, 6.4], b: [-10.0, 1.0 + sw * 0.4, 5.4], r: 1.7, r2: 1.2, mat: lizard, group: 'tail' });
    p.push({ k: 'cap', a: [-10.0, 1.0 + sw * 0.4, 5.4], b: [-15.6, 3.4 + sw, 4.6], r: 1.2, r2: 0.4, mat: lizard, group: 'tail' });
  },
};

// ── Туз «Ленивец» — shaggy sloth, cream face mask, maroon tracksuit, vest, ace pendant, long claws ──
const SLOTH = H('#2a1e14', '#463424', '#664e36', '#86684a', '#a6866a');
const shaggy: Material = { ramp: SLOTH, dither: true, pattern: (c) => (Math.abs(((c.x * 1.3 + Math.sin(c.y * 1.7) * 1.0 + 40) % 1.5) - 0.75) < 0.12 ? -1 : null) };
const SLOTH_FACE = H('#5a4a38', '#8a765e', '#b8a284', '#d8c4a4', '#eee0c4');
const MAROON = H('#24060c', '#420c16', '#62141f', '#84202c', '#a0303a');
const lenivec: Rig = {
  id: 'lenivec',
  torsoC: [-0.4, 0, 8.6],
  torsoR: [6.4, 12.0, 6.0],
  shoulderY: 9.6,
  shoulderZ: 11.8,
  armR: 2.7,
  headC: [0.8, 0, 15.0],
  hipY: 4.8,
  footR: [3.0, 1.8, 1.2],
  pal: {
    torso: {
      ramp: MAROON,
      pattern: (c) => {
        const st = shoulderStripes(c, 7.4);
        if (st) return st;
        // the open track jacket: a white vest
        if (c.lx > 1.2 && Math.abs(c.ly) < 4.2 - (c.lx - 1.2) * 0.25) return lit(TANK, c.nz);
        return null;
      },
    },
    sleeve: { ramp: MAROON, pattern: sleeveStripes },
    hand: shaggy,
    pants: { ramp: MAROON, pattern: legStripe },
    shoe: { ramp: H('#0c0806', '#1a120c', '#2a1e14', '#3c2c1e') },
  },
  hand(p, at, side, rig) {
    paw(p, at, side, rig, { band: MAT.gold, bandSide: -1, claws: CLAW, clawLen: 3.4, clawR: 0.45, clawOut: 0.35 });
  },
  torsoExtras(p, o) {
    trackCollar(p, o, MAROON, hex('#e6e0d4'), 13.4, 5.6, 6.6);
    goldChain(p, o, 5.0, 5.4, 13.8, 0);
    // the ace of spades on a gold plate
    p.push({ k: 'ell', c: [6.8 + o.dx, o.dy, 13.2 + o.dz], r: [1.4, 1.2, 0.55], mat: { ...MAT.gold, pattern: (c) => (Math.hypot(c.lx * 1.2, c.ly) < 0.55 || (c.lx < -0.3 && Math.abs(c.ly) < 0.2) ? hex('#141414') : null) }, group: 'pendant' });
  },
  head(p, o) {
    const hc: V3 = [0.8 + o.dx, o.dy, 15.0 + o.dz];
    const hr: V3 = [4.6, 4.4, 4.0];
    p.push({ k: 'ell', c: hc, r: hr, mat: shaggy, group: 'head' });
    // the pale face and its dark eye stripes running back
    p.push({ k: 'ell', c: [hc[0] + 1.9, hc[1], hc[2] + 1.5], r: [2.7, 3.4, 2.5], mat: fur(SLOTH_FACE), group: 'face' });
    for (const s of [-1, 1]) {
      const z = surf([hc[0] + 1.9, hc[1], hc[2] + 1.5], [2.7, 3.4, 2.5], 0.6, s * 1.9, 0.1);
      p.push({ k: 'ell', c: [hc[0] + 2.2, hc[1] + s * 2.2, z], r: [1.6, 0.75, 0.4], yaw: s * 0.55, mat: { ramp: H('#1a120a', '#2a1e14', '#3a2a1c') }, group: 'mask' });
    }
    eyes(p, [hc[0] + 1.9, hc[1], hc[2] + 1.5], [2.7, 3.4, 2.5], 1.0, 1.8, { ramp: H('#140c08'), flat: true }, 0.5);
    p.push({ k: 'ell', c: [hc[0] + 4.4, hc[1], hc[2] + 0.4], r: [0.9, 1.3, 0.7], mat: { ramp: H('#140c08', '#241810', '#36261a') }, group: 'nose' });
    cigar(p, [hc[0] + 4.4, hc[1] + 1.8, hc[2] - 1.6], 1.0, 0.9, 3.0, 0.42, MAT.cigarette);
  },
};

// ── Рыцарь «Козёл» — white goat, curled ridged horns, ear tag «89», vest, harness and a chain ─────
const GOAT = H('#6e685e', '#a29a8c', '#c8c0b0', '#e2dccf', '#f4f0e6');
const goat: Material = { ramp: GOAT, dither: true, pattern: (c) => (Math.abs(((c.x * 1.4 + Math.sin(c.y * 1.9) * 0.9 + 40) % 1.4) - 0.7) < 0.1 ? -1 : null) };
const HORN: Material = { ramp: H('#2e261c', '#4e4232', '#76664e', '#9e8c6e', '#c4b292'), pattern: (c) => (Math.abs(((c.t * 6) % 1) - 0.5) < 0.12 ? -1 : null) };
const kozel: Rig = {
  id: 'kozel',
  torsoC: [-0.4, 0, 8.6],
  torsoR: [6.0, 11.6, 5.6],
  shoulderY: 9.2,
  shoulderZ: 11.8,
  armR: 2.6,
  headC: [1.2, 0, 15.2],
  hipY: 4.6,
  footR: [3.0, 1.6, 1.2],
  pal: {
    torso: { ramp: TANK, pattern: tank(GOAT, 7.0) },
    sleeve: goat,
    hand: GLOVE,
    pants: { ramp: H('#16161a', '#22222a', '#30303a', '#42424e') },
    shoe: BOOTS,
  },
  torsoExtras(p, o) {
    // a leather strap from the left shoulder to the right hip, a chain the other way
    strap(p, o, [-1.6, -8.6, 13.2], [4.4, 8.2, 10.6], STRAP, 0.75, 0.42);
    strap(p, o, [-1.2, 8.8, 13.4], [4.8, -7.6, 11.0], IRON, 0.55);
    goldChain(p, o, 4.6, 4.9, 13.6, 0.8);
  },
  head(p, o) {
    const hc: V3 = [1.2 + o.dx, o.dy, 15.2 + o.dz];
    const hr: V3 = [4.2, 3.5, 3.6];
    p.push({ k: 'ell', c: hc, r: hr, mat: goat, group: 'head' });
    // the long face, a dark nose, a beard under the chin
    p.push({ k: 'ell', c: [hc[0] + 3.6, hc[1], hc[2] - 1.2], r: [2.8, 2.1, 1.8], mat: goat, group: 'snout' });
    p.push({ k: 'ell', c: [hc[0] + 6.0, hc[1], hc[2] - 0.9], r: [0.7, 1.1, 0.6], mat: { ramp: H('#2a2420', '#4a403a', '#6a5e56') }, group: 'nose' });
    p.push({ k: 'ell', c: [hc[0] + 4.4, hc[1], hc[2] - 3.2], r: [1.4, 1.0, 1.4], mat: goat, group: 'beard' });
    eyes(p, hc, hr, 2.2, 2.2, { ramp: H('#e0b030'), flat: true }, 0.7, 'bar');
    // ears sticking out sideways: a yellow tag on the left, a gold ring on the right
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [hc[0] - 0.4, hc[1] + s * 2.8, hc[2] + 0.6], b: [hc[0] - 1.4, hc[1] + s * 6.4, hc[2] - 0.2], r: 1.1, r2: 0.75, mat: goat, group: 'ear' + s });
    p.push({ k: 'box', c: [hc[0] - 1.2, hc[1] - 5.6, hc[2] + 0.4], h: [0.95, 0.7, 0.95], mat: { ramp: H('#8a5a0a', '#c8861a', '#f0b030', '#ffd060'), pattern: (c) => (Math.abs(c.lx) < 0.5 && Math.abs(c.ly) < 0.3 && c.nz > 0.6 ? hex('#2a1a08') : null) }, group: 'tag', bevel: 0.2 });
    p.push({ k: 'ell', c: [hc[0] - 1.2, hc[1] + 6.0, hc[2] - 0.6], r: [0.7, 0.35, 0.9], mat: MAT.gold, group: 'earring' });
    // big ridged horns curling back and out
    for (const s of [-1, 1]) {
      const pts: V3[] = [
        [hc[0] + 0.2, hc[1] + s * 1.5, hc[2] + 2.8],
        [hc[0] - 3.0, hc[1] + s * 2.8, hc[2] + 5.4],
        [hc[0] - 6.6, hc[1] + s * 4.4, hc[2] + 5.0],
        [hc[0] - 8.0, hc[1] + s * 6.6, hc[2] + 3.0],
        [hc[0] - 6.8, hc[1] + s * 8.0, hc[2] + 1.6],
      ];
      const rr = [1.6, 1.35, 1.05, 0.75, 0.4];
      for (let i = 0; i < pts.length - 1; i++) p.push({ k: 'cap', a: pts[i]!, b: pts[i + 1]!, r: rr[i]!, r2: rr[i + 1]!, mat: HORN, group: 'horn' + s });
    }
    cigar(p, [hc[0] + 5.2, hc[1] + 1.6, hc[2] - 2.0], 1.0, 0.8, 3.0, 0.42, MAT.cigarette);
  },
  tail(p, o) {
    p.push({ k: 'ell', c: [-6.6, 0.2 + o.sway * 0.2, 7.6], r: [1.2, 0.9, 1.3], mat: goat, group: 'tail' });
  },
};

// ── Пингвин «Бродяга» — penguin, orange beak, white vest, a heavy gold chain, orange feet ─────────
const PENGUIN = H('#08080c', '#121218', '#1e1e28', '#2e2e3a', '#44445a');
const penguin: Material = { ramp: PENGUIN, spec: { color: hex('#8a8aa8'), power: 12, threshold: 0.8 } };
const BEAK: Material = { ramp: H('#7a3a08', '#b86012', '#e88a20', '#f8b048', '#ffd27a') };
const pingvin: Rig = {
  id: 'pingvin',
  torsoC: [-0.4, 0, 8.6],
  torsoR: [6.4, 11.6, 6.0],
  shoulderY: 9.4,
  shoulderZ: 11.6,
  armR: 2.5,
  headC: [1.0, 0, 15.2],
  hipY: 4.4,
  footR: [3.2, 1.8, 0.9],
  toes: true,
  pal: {
    torso: { ramp: TANK, pattern: tank(PENGUIN, 6.8) },
    sleeve: penguin,
    hand: penguin,
    pants: { ramp: H('#0c0e16', '#161a26', '#222838', '#30384c') },
    shoe: BEAK,
  },
  torsoExtras(p, o) {
    heavyChain(p, o, 5.0, 5.6, 13.6, 0);
  },
  head(p, o) {
    const hc: V3 = [1.0 + o.dx, o.dy, 15.2 + o.dz];
    const hr: V3 = [4.4, 4.0, 4.0];
    p.push({ k: 'ell', c: hc, r: hr, mat: penguin, group: 'head' });
    // white patches round the eyes, a cold stare, a scar over the left one
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [hc[0] + 1.6, hc[1] + s * 3.2, hc[2] - 1.0], r: [2.4, 1.5, 2.2], yaw: s * 0.3, mat: { ramp: H('#9a9aa0', '#c8c8cc', '#e6e6e8', '#f6f6f8') }, group: 'cheek' });
    eyes(p, hc, hr, 2.4, 2.1, { ramp: H('#2a1a10'), flat: true }, 0.55);
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [hc[0] + 2.0, hc[1] + s * 1.2, surf(hc, hr, 2.0, s * 1.2, 0.5)], b: [hc[0] + 2.6, hc[1] + s * 3.0, surf(hc, hr, 2.6, s * 3.0, 0.45)], r: 0.4, mat: penguin, group: 'brow' });
    p.push({ k: 'cap', a: [hc[0] + 0.6, hc[1] - 3.2, surf(hc, hr, 0.6, -3.2, 0.3)], b: [hc[0] + 3.0, hc[1] - 1.2, surf(hc, hr, 3.0, -1.2, 0.4)], r: 0.2, mat: SCAR, group: 'scar' });
    // the long orange beak
    p.push({ k: 'cap', a: [hc[0] + 3.0, hc[1], hc[2] - 0.2], b: [hc[0] + 8.2, hc[1], hc[2] - 1.0], r: 1.55, r2: 0.45, mat: BEAK, group: 'beak' });
    cigar(p, [hc[0] + 5.0, hc[1] + 1.0, hc[2] - 1.8], 1.0, 0.8, 2.8, 0.42, MAT.cigarette);
  },
  tail(p) {
    p.push({ k: 'ell', c: [-6.6, 0, 6.2], r: [1.6, 2.4, 0.8], mat: penguin, group: 'tail' });
  },
};

// ── Зверь «Тигр» — tiger, white ruff, roaring, leather vest with a sheepskin collar, a heavy chain ──
const TIGER = H('#5a2406', '#9a420c', '#d06a18', '#ec8c2c', '#f8b05a');
const STRIPE = hex('#140a06');
const tigerArm: Material = { ramp: TIGER, dither: true, pattern: (c) => (Math.abs(((c.t * 5 + c.s * 0.25 + 10) % 1) - 0.5) < 0.1 ? STRIPE : null) };
const tigerHead: Material = { ramp: TIGER, dither: true, pattern: (c) => (c.lx < 2.4 && Math.abs(((c.ly * 0.9 + Math.sin(c.lx * 0.8) * 0.9 + 40) % 2.2) - 1.1) < 0.2 ? STRIPE : null) };
const WHITE_FUR = H('#8a847a', '#b8b2a6', '#dcd6ca', '#f0ece2', '#fbf8f2');
const VEST: Material = { ramp: H('#1a0e08', '#2e1a10', '#46281a', '#5e3a26', '#7a4e34'), spec: { color: hex('#e0b090'), power: 10, threshold: 0.78 } };
const tigr: Rig = {
  id: 'tigr',
  torsoC: [-0.4, 0, 8.8],
  torsoR: [6.6, 12.6, 6.0],
  shoulderY: 10.0,
  shoulderZ: 12.0,
  armR: 2.9,
  headC: [1.4, 0, 15.6],
  hipY: 5.0,
  footR: [3.2, 1.9, 1.3],
  pal: {
    torso: { ...VEST, pattern: (c) => (c.lx > 1.6 && Math.abs(c.ly) < 4.0 - (c.lx - 1.6) * 0.25 ? (Math.abs(((c.ly * 1.7 + 40) % 1.3) - 0.65) < 0.09 ? lit(TANK, c.nz * 0.7) : lit(TANK, c.nz)) : null) },
    sleeve: tigerArm,
    hand: GLOVE,
    pants: { ramp: H('#141210', '#221e1a', '#322c26', '#463e36') },
    shoe: BOOTS,
  },
  torsoExtras(p, o) {
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [0.4 + o.dx, s * 7.0 + o.dy, 14.0 + o.dz], r: [4.4, 2.9, 2.0], yaw: s * 0.45 + o.yaw, mat: SHEARLING, group: 'collar' + s });
    p.push({ k: 'ell', c: [-3.6 + o.dx, o.dy, 14.2 + o.dz], r: [2.4, 7.6, 2.0], yaw: o.yaw, mat: SHEARLING, group: 'collarback' });
    heavyChain(p, o, 5.4, 5.8, 14.2, 0);
  },
  head(p, o) {
    const hc: V3 = [1.4 + o.dx, o.dy, 15.6 + o.dz];
    const hr: V3 = [5.0, 4.6, 4.2];
    p.push({ k: 'ell', c: hc, r: hr, mat: tigerHead, group: 'head' });
    for (const s of [-1, 1]) {
      // white ruffs on the cheeks, round ears with a white spot
      p.push({ k: 'ell', c: [hc[0] + 1.6, hc[1] + s * 3.9, hc[2] - 1.2], r: [2.6, 1.9, 1.9], yaw: s * 0.3, mat: fur(WHITE_FUR), group: 'ruff' + s });
      p.push({ k: 'ell', c: [hc[0] - 1.6, hc[1] + s * 4.0, hc[2] + 2.2], r: [1.4, 1.7, 1.0], mat: { ramp: TIGER, pattern: (c) => (Math.hypot(c.lx, c.ly) < 0.6 ? hex('#f0ece2') : null) }, group: 'ear' + s });
    }
    // the white muzzle, the roar: a red mouth and fangs at the front
    p.push({ k: 'ell', c: [hc[0] + 4.4, hc[1], hc[2] - 1.4], r: [2.4, 2.7, 1.9], mat: fur(WHITE_FUR), group: 'muzzle' });
    p.push({ k: 'ell', c: [hc[0] + 6.4, hc[1], hc[2] - 2.0], r: [1.3, 1.9, 0.9], mat: { ramp: H('#3a0608', '#6a0e12', '#9a1a1c') }, group: 'mouth' });
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [hc[0] + 6.4, hc[1] + s * 1.2, hc[2] - 1.4], b: [hc[0] + 7.4, hc[1] + s * 1.0, hc[2] - 2.6], r: 0.4, r2: 0.12, mat: CLAW, group: 'fang' });
    p.push({ k: 'ell', c: [hc[0] + 6.0, hc[1], hc[2] - 0.4], r: [0.7, 0.9, 0.5], mat: { ramp: H('#4a2424', '#7a3e3e', '#a05a58') }, group: 'nose' });
    eyes(p, hc, hr, 3.0, 2.2, { ramp: H('#c8d040'), flat: true }, 0.7, 'round');
    for (const s of [-1, 1]) p.push({ k: 'cap', a: [hc[0] + 2.4, hc[1] + s * 1.0, surf(hc, hr, 2.4, s * 1.0, 0.55)], b: [hc[0] + 3.0, hc[1] + s * 3.2, surf(hc, hr, 3.0, s * 3.2, 0.5)], r: 0.5, mat: tigerHead, group: 'brow' });
  },
  tail(p, o) {
    const m: Material = { ramp: TIGER, dither: true, pattern: (c) => (Math.abs(((c.t * 4 + 10) % 1) - 0.5) < 0.12 ? STRIPE : null) };
    const sw = o.sway * 1.3;
    p.push({ k: 'cap', a: [-6.8, 0.4, 6.8], b: [-12.4, 2.4 + sw * 0.5, 6.0], r: 1.35, r2: 1.15, mat: m, group: 'tail' });
    p.push({ k: 'cap', a: [-12.4, 2.4 + sw * 0.5, 6.0], b: [-17.2, 5.8 + sw, 6.6], r: 1.15, r2: 0.8, mat: m, group: 'tail' });
    p.push({ k: 'ell', c: [-17.6, 6.2 + sw, 6.7], r: [1.0, 0.9, 0.8], mat: { ramp: H('#0a0604', '#1a0e08', '#2a1a10') }, group: 'tail' });
  },
};

// ── Арах «Паук» — hairy black spider, red eyes, fangs, white vest, gold chain, extra legs, a cigar ──
const SPIDER = H('#0a0a0c', '#16161a', '#24242a', '#36363e', '#4a4a54');
const hairy: Material = { ramp: SPIDER, dither: true, pattern: (c) => (Math.abs(((c.x * 2.1 + Math.sin(c.y * 2.6) * 0.8 + 40) % 1.1) - 0.55) < 0.07 ? hex('#6a6a74') : null) };
const SPIDER_EYE: Material = { ramp: H('#ff2a1a'), flat: true };
const pauk: Rig = {
  id: 'pauk',
  torsoC: [-0.2, 0, 8.4],
  torsoR: [6.0, 11.4, 5.6],
  shoulderY: 9.0,
  shoulderZ: 11.6,
  armR: 2.5,
  headC: [1.4, 0, 14.8],
  hipY: 4.4,
  footR: [2.8, 1.6, 1.1],
  pal: {
    torso: { ramp: TANK, pattern: tank(SPIDER, 6.8) },
    sleeve: hairy,
    hand: hairy,
    pants: { ramp: H('#0e0e12', '#18181e', '#24242c', '#34343e') },
    shoe: BOOTS,
  },
  hand(p, at, side, rig) {
    paw(p, at, side, rig, { band: MAT.gold, bandSide: 1 });
  },
  torsoExtras(p, o) {
    heavyChain(p, o, 4.9, 5.4, 13.6, 1.2);
    // two more pairs of hairy legs from the sides, bent up at the knee and down to the floor
    for (const s of [-1, 1] as const) {
      for (const [x, back] of [
        [-2.0, 0],
        [-4.6, 1],
      ] as const) {
        const root: V3 = [x + o.dx, s * 9.6 + o.dy, 9.6 + o.dz];
        const knee: V3 = [x - 0.6 - back * 1.8 + o.dx, s * 15.6 + o.dy + s * o.sway * 0.3, 13.8 + o.dz];
        const foot: V3 = [x - 1.0 - back * 4.6 + o.dx, s * (20.6 - back * 0.6) + o.dy, 3.0];
        p.push({ k: 'cap', a: root, b: knee, r: 1.35, r2: 1.05, mat: hairy, group: 'leg' + s });
        p.push({ k: 'cap', a: knee, b: foot, r: 1.05, r2: 0.45, mat: hairy, group: 'leg' + s });
        p.push({ k: 'ell', c: knee, r: [1.15, 1.15, 1.0], mat: { ramp: H('#2a2a30', '#44444c', '#5e5e68') }, group: 'knee' + s });
      }
    }
  },
  head(p, o) {
    const hc: V3 = [1.4 + o.dx, o.dy, 14.8 + o.dz];
    const hr: V3 = [4.6, 4.2, 3.8];
    p.push({ k: 'ell', c: hc, r: hr, mat: hairy, group: 'head' });
    // tufts of bristle on the crown
    for (const [x, y] of [
      [-1.6, -2.2],
      [-2.4, 0.4],
      [-1.2, 2.4],
      [0.2, -0.8],
      [0.4, 1.4],
    ] as const)
      p.push({ k: 'cap', a: [hc[0] + x, hc[1] + y, surf(hc, hr, x, y, -0.4)], b: [hc[0] + x - 2.0, hc[1] + y * 1.3, surf(hc, hr, x, y, 1.8)], r: 0.45, r2: 0.1, mat: { ramp: H('#2a2a30', '#4a4a54', '#6a6a74') }, group: 'bristle' });
    // eight red eyes: two big ones in front, six small behind
    for (const s of [-1, 1]) {
      for (const [dx, dy, r] of [
        [2.9, 1.3, 0.85],
        [2.1, 2.6, 0.5],
        [1.4, 1.0, 0.45],
        [0.7, 2.4, 0.4],
      ] as const) {
        const z = surf(hc, hr, dx, s * dy, 0.2);
        p.push({ k: 'ell', c: [hc[0] + dx, hc[1] + s * dy, z], r: [r, r, r * 0.7], mat: SPIDER_EYE, group: 'eye' });
        p.push({ k: 'ell', c: [hc[0] + dx + r * 0.2, hc[1] + s * dy - r * 0.3, z + r * 0.5], r: [r * 0.3, r * 0.3, 0.15], mat: MAT.glint, group: 'eye' });
      }
      // ivory fangs hanging forward and down
      p.push({ k: 'cap', a: [hc[0] + 3.9, hc[1] + s * 1.5, hc[2] - 1.6], b: [hc[0] + 5.8, hc[1] + s * 1.0, hc[2] - 3.4], r: 0.6, r2: 0.15, mat: CLAW, group: 'fang' });
    }
    cigar(p, [hc[0] + 4.6, hc[1] - 0.2, hc[2] - 1.0], 1.0, 0.25, 3.6, 0.7);
  },
  tail(p, o) {
    // the abdomen behind, banded with grey
    p.push({ k: 'ell', c: [-8.6, o.sway * 0.2, 7.8], r: [5.0, 5.6, 4.4], mat: { ramp: SPIDER, dither: true, pattern: (c) => (Math.abs(((c.lx * 0.9 + 40) % 2.2) - 1.1) < 0.18 ? hex('#4a4a54') : null) }, group: 'abdomen' });
  },
};

// ── Жнец «Богомол» — green mantis, huge red eyes, long antennae, vest and straps, folded wings, blades ──
const MANTIS = H('#1e2a0a', '#34481a', '#506a26', '#6e8c34', '#92ae48');
const chitin: Material = { ramp: MANTIS, spec: { color: hex('#e0f0b0'), power: 12, threshold: 0.8 }, pattern: (c) => (Math.abs(((c.t * 4) % 1) - 0.5) < 0.06 ? -1 : null) };
const mantisHead: Material = { ramp: MANTIS, spec: { color: hex('#e0f0b0'), power: 12, threshold: 0.8 } };
const COMPOUND: Material = { ramp: H('#3a0606', '#7a0e0e', '#c02020', '#ee4a3a', '#ff8a70'), spec: { color: hex('#ffe0d0'), power: 10, threshold: 0.7 }, pattern: (c) => ((Math.floor((c.x + 40) * 2.6) + Math.floor((c.y + 40) * 2.6)) % 2 ? -1 : null) };
const WING: Material = { ramp: H('#2e3c14', '#4a5e22', '#6a8030', '#8ca244'), pattern: (c) => (Math.abs(((c.lx * 1.2 + 40) % 1.6) - 0.8) < 0.07 || Math.abs(c.ly) < 0.12 ? -1 : null) };
const BLADE: Material = { ramp: H('#26300e', '#3e4e1a', '#5e7628', '#84a03a'), pattern: (c) => (c.s > 0.35 ? hex('#d02a20') : null) };
const bogomol: Rig = {
  id: 'bogomol',
  torsoC: [-0.4, 0, 8.2],
  torsoR: [4.8, 9.4, 4.6],
  shoulderY: 7.6,
  shoulderZ: 11.0,
  armR: 1.75,
  headC: [1.6, 0, 15.0],
  hipY: 3.4,
  footR: [2.6, 1.1, 1.0],
  pal: {
    torso: { ramp: TANK, pattern: tank(MANTIS, 6.0) },
    sleeve: chitin,
    hand: mantisHead,
    pants: chitin,
    shoe: { ramp: H('#141c06', '#24300e', '#384a18') },
  },
  hand(p, at, side, rig) {
    paw(p, at, side, rig, {});
    // the raptorial blade folded back along the forearm, red at the edge
    p.push({ k: 'cap', a: [at[0] + 0.4, at[1] + side * 0.6, at[2] + 0.6], b: [at[0] - 4.2, at[1] + side * 2.4, at[2] + 1.8], r: 0.75, r2: 0.15, mat: BLADE, group: 'blade' + side });
  },
  torsoExtras(p, o) {
    // folded wings down the back
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [-6.2 + o.dx, s * 1.7 + o.dy, 10.6 + o.dz], r: [7.2, 2.5, 0.6], yaw: s * 0.12 + o.yaw, mat: WING, group: 'wing' + s });
    // leather straps crossing the chest and pouches at the belt
    strap(p, o, [-1.2, -7.0, 12.6], [3.8, 6.6, 10.2], STRAP, 0.55);
    strap(p, o, [-1.2, 7.0, 12.6], [3.8, -6.6, 10.2], STRAP, 0.55);
    for (const y of [-5.4, 5.4]) p.push({ k: 'box', c: [3.4 + o.dx, y + o.dy, 9.4 + o.dz], h: [1.1, 1.2, 1.0], yaw: o.yaw, mat: { ramp: H('#1a120a', '#2c1e12', '#40301c', '#56422a') }, group: 'pouch', bevel: 0.35 });
  },
  head(p, o) {
    const hc: V3 = [1.6 + o.dx, o.dy, 15.0 + o.dz];
    const hr: V3 = [2.8, 3.4, 2.6];
    // a triangular head: wide at the eyes, narrow at the jaws
    p.push({ k: 'ell', c: hc, r: hr, mat: mantisHead, group: 'head' });
    p.push({ k: 'ell', c: [hc[0] + 2.6, hc[1], hc[2] - 0.9], r: [2.1, 1.5, 1.5], mat: mantisHead, group: 'face' });
    for (const s of [-1, 1]) {
      p.push({ k: 'ell', c: [hc[0] + 0.6, hc[1] + s * 3.5, hc[2] + 0.5], r: [2.1, 1.8, 1.9], mat: COMPOUND, group: 'eye' });
      p.push({ k: 'cap', a: [hc[0] + 4.2, hc[1] + s * 0.9, hc[2] - 1.4], b: [hc[0] + 5.4, hc[1] + s * 0.3, hc[2] - 1.8], r: 0.45, r2: 0.15, mat: { ramp: H('#2a1a08', '#4a3010', '#6a4a1c') }, group: 'mandible' });
      // long antennae, forward then sweeping back — v0.2.19 (the owner: «нет куска уса»): thick enough to be
      // drawn whole at the game's scale, tan like the sheet's
      const m: Material = { ramp: H('#3a2e10', '#7a6428', '#b89a4a') };
      p.push({ k: 'cap', a: [hc[0] + 1.6, hc[1] + s * 0.8, hc[2] + 2.0], b: [hc[0] + 5.6, hc[1] + s * 3.8, hc[2] + 5.0], r: 0.62, r2: 0.52, mat: m, group: 'antenna' });
      p.push({ k: 'cap', a: [hc[0] + 5.6, hc[1] + s * 3.8, hc[2] + 5.0], b: [hc[0] - 1.6, hc[1] + s * 10.4 + o.sway * 0.4, hc[2] + 5.6], r: 0.52, r2: 0.36, mat: m, group: 'antenna' });
    }
    // three little simple eyes on the crown
    for (const [x, y] of [
      [0.6, 0],
      [-0.2, -0.7],
      [-0.2, 0.7],
    ] as const)
      p.push({ k: 'ell', c: [hc[0] + x, hc[1] + y, surf(hc, hr, x, y, 0.1)], r: [0.3, 0.3, 0.2], mat: { ramp: H('#e8c040'), flat: true }, group: 'ocellus' });
  },
};

// ── Игла «Ёж-мутант» — hedgehog, a mass of long pale quills, glowing eyes, open jaws, steel claws ──
const HEDGEHOG = H('#1e1814', '#362c24', '#524438', '#6e5e50', '#8e7e6e');
const QUILL: Material = { ramp: H('#2a201a', '#6a5848', '#a8968a', '#d8cabc', '#f2eadc'), pattern: (c) => (c.t < 0.22 ? -2 : c.t > 0.86 ? 1 : null) };
const ezh: Rig = {
  id: 'ezh',
  torsoC: [-0.4, 0, 8.6],
  torsoR: [6.0, 11.4, 5.6],
  shoulderY: 9.2,
  shoulderZ: 11.8,
  armR: 2.5,
  headC: [1.6, 0, 14.8],
  hipY: 4.6,
  footR: [3.0, 1.6, 1.2],
  pal: {
    torso: { ramp: TANK, pattern: tank(HEDGEHOG, 6.8) },
    sleeve: fur(HEDGEHOG),
    hand: fur(HEDGEHOG),
    pants: { ramp: H('#1e1c14', '#2e2c1e', '#424030', '#585640') },
    shoe: BOOTS,
  },
  hand(p, at, side, rig) {
    paw(p, at, side, rig, { claws: MAT.steel, clawLen: 4.4, clawR: 0.34, clawOut: 0.3 });
  },
  torsoExtras(p, o) {
    strap(p, o, [-1.4, -8.4, 13.0], [4.4, 7.8, 10.4], STRAP, 0.7, 0.45);
    strap(p, o, [-1.4, 8.4, 13.0], [4.4, -7.8, 10.4], STRAP, 0.7);
    // the quills: rows of long spikes over the back, fanning out and back
    const rows: Array<[number, number, number]> = [
      [-1.6, 5, 6.4],
      [-3.4, 6, 7.4],
      [-5.0, 7, 8.0],
      [-6.0, 6, 7.0],
    ];
    rows.forEach(([x, n, len], ri) => {
      for (let i = 0; i < n; i++) {
        const v = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
        const y = v * (9.6 - ri * 0.8);
        const z = surf([-0.4, 0, 8.6], [6.0, 11.4, 5.6], x + 0.4, y, -0.6);
        const out = v * 0.55;
        p.push({ k: 'cap', a: [x + o.dx, y + o.dy, z + o.dz], b: [x - len * 0.85 + o.dx, y + out * len + (ri % 2 ? 0.6 : -0.6) + o.dy + o.sway * 0.2, z + len * 0.45 - ri * 0.4 + o.dz], r: 0.62, r2: 0.1, mat: QUILL, group: 'quill' });
      }
    });
  },
  head(p, o) {
    const hc: V3 = [1.6 + o.dx, o.dy, 14.8 + o.dz];
    const hr: V3 = [4.0, 3.6, 3.4];
    p.push({ k: 'ell', c: hc, r: hr, mat: fur(HEDGEHOG), group: 'head' });
    // the long snout, black nose, open jaws with teeth
    p.push({ k: 'ell', c: [hc[0] + 3.8, hc[1], hc[2] - 1.2], r: [2.8, 1.9, 1.6], mat: fur(H('#3e3228', '#5e4e40', '#7e6c5c', '#9e8c7a')), group: 'snout' });
    p.push({ k: 'ell', c: [hc[0] + 6.4, hc[1], hc[2] - 1.0], r: [0.7, 0.8, 0.6], mat: MAT.black, group: 'nose' });
    p.push({ k: 'ell', c: [hc[0] + 4.4, hc[1], hc[2] - 2.6], r: [2.0, 1.6, 0.7], mat: { ramp: H('#3a0608', '#6a0e12', '#8a1a1c') }, group: 'mouth' });
    for (const s of [-1, 1]) for (const x of [3.2, 4.4, 5.4]) p.push({ k: 'ell', c: [hc[0] + x, hc[1] + s * (1.6 - (x - 3.2) * 0.3), hc[2] - 2.0], r: [0.25, 0.25, 0.55], mat: CLAW, group: 'tooth' });
    eyes(p, hc, hr, 2.2, 2.0, { ramp: H('#ffd23c'), flat: true }, 0.7, 'slit');
    // quills on the crown, swept back
    for (let i = 0; i < 7; i++) {
      const y = (i / 6) * 2 - 1;
      p.push({ k: 'cap', a: [hc[0] - 0.4, hc[1] + y * 2.6, hc[2] + 2.4], b: [hc[0] - 5.6, hc[1] + y * 4.6, hc[2] + 4.6 - Math.abs(y)], r: 0.55, r2: 0.1, mat: QUILL, group: 'quill' });
    }
    // small round ears among them
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [hc[0] - 0.4, hc[1] + s * 3.4, hc[2] + 1.4], r: [0.9, 0.9, 0.6], mat: fur(HEDGEHOG), group: 'ear' + s });
  },
};

// ── Касатик «Советский гангстер» — orca, white eye patches, flat cap, sheepskin coat, gold ──────────
const ORCA = H('#060608', '#0e0e12', '#1a1a20', '#2a2a32', '#3e3e48');
const orca: Material = { ramp: ORCA, spec: { color: hex('#9ea6c0'), power: 14, threshold: 0.78 } };
const COAT: Material = { ramp: H('#1e120a', '#34200f', '#4e3018', '#6a4424', '#865a32'), spec: { color: hex('#e8c8a0'), power: 10, threshold: 0.8 }, pattern: (c) => (Math.abs(((c.lx * 0.9 + 40) % 3.0) - 1.5) < 0.06 ? -1 : null) };
const TWEED: Material = { ramp: H('#16141a', '#24222a', '#34323c', '#46444e', '#5a5862'), pattern: (c) => (Math.abs(((c.x * 1.6 + Math.abs(((c.y * 1.6 + 40) % 2) - 1) + 40) % 1.2) - 0.6) < 0.12 ? -1 : null) };
const kasatka: Rig = {
  id: 'kasatka',
  torsoC: [-0.6, 0, 8.8],
  torsoR: [6.6, 12.8, 6.0],
  shoulderY: 10.2,
  shoulderZ: 12.2,
  armR: 2.9,
  headC: [1.2, 0, 15.6],
  hipY: 5.0,
  footR: [3.4, 1.9, 1.2],
  pal: {
    torso: { ...COAT, pattern: (c) => (c.lx > 1.8 && Math.abs(c.ly) < 3.4 - (c.lx - 1.8) * 0.2 ? lit(H('#121216', '#1e1e24', '#2c2c34', '#3c3c46'), c.nz) : null) },
    sleeve: { ...COAT, pattern: (c) => (c.t > 0.8 && c.t < 0.97 ? lit(H('#8e7652', '#b29a72', '#d2bc94', '#e8d6b2'), c.nz) : null) },
    hand: orca,
    pants: DARK_PANTS,
    shoe: BOOTS,
  },
  hand(p, at, side, rig) {
    paw(p, at, side, rig, { band: MAT.gold, bandSide: 1 });
  },
  torsoExtras(p, o) {
    // the coat's skirt round the hips, a big sheepskin collar
    p.push({ k: 'ell', c: [-1.6 + o.dx, o.dy, 6.4 + o.dz], r: [6.0, 12.2, 2.6], yaw: o.yaw, mat: COAT, group: 'skirt' });
    for (const s of [-1, 1]) p.push({ k: 'ell', c: [0.4 + o.dx, s * 6.8 + o.dy, 14.0 + o.dz], r: [4.6, 3.0, 2.1], yaw: s * 0.45 + o.yaw, mat: SHEARLING, group: 'collar' + s });
    p.push({ k: 'ell', c: [-3.6 + o.dx, o.dy, 14.2 + o.dz], r: [2.6, 7.6, 2.1], yaw: o.yaw, mat: SHEARLING, group: 'collarback' });
  },
  head(p, o) {
    const hc: V3 = [1.2 + o.dx, o.dy, 15.6 + o.dz];
    const hr: V3 = [4.8, 4.2, 4.0];
    p.push({ k: 'ell', c: hc, r: hr, mat: orca, group: 'head' });
    // the broad snout, the white patches behind the eyes, a scar
    p.push({ k: 'ell', c: [hc[0] + 3.6, hc[1], hc[2] - 1.2], r: [2.9, 3.1, 2.2], mat: orca, group: 'snout' });
    for (const s of [-1, 1]) {
      const z = surf(hc, hr, 1.6, s * 3.3, 0.15);
      p.push({ k: 'ell', c: [hc[0] + 1.6, hc[1] + s * 3.3, z], r: [2.2, 1.2, 0.6], yaw: s * 0.35, mat: { ramp: H('#c4c4c8', '#e2e2e4', '#f4f4f6') }, group: 'patch' });
    }
    eyes(p, hc, hr, 2.8, 2.6, { ramp: H('#1a1a1e'), flat: true }, 0.5);
    p.push({ k: 'cap', a: [hc[0] + 3.4, hc[1] - 2.6, hc[2] + 0.2], b: [hc[0] + 4.8, hc[1] - 1.0, hc[2] + 0.4], r: 0.2, mat: SCAR, group: 'scar' });
    p.push({ k: 'cap', a: [hc[0] + 3.4, hc[1] - 1.0, hc[2] + 0.4], b: [hc[0] + 4.8, hc[1] - 2.6, hc[2] + 0.2], r: 0.2, mat: SCAR, group: 'scar' });
    // the flat cap with a short peak
    p.push({ k: 'ell', c: [hc[0] - 1.2, hc[1], hc[2] + 2.4], r: [3.9, 3.5, 1.7], mat: TWEED, group: 'cap' });
    p.push({ k: 'ell', c: [hc[0] + 2.2, hc[1], hc[2] + 2.3], r: [1.5, 2.8, 0.5], mat: { ramp: H('#0e0c10', '#1a1820', '#28262e') }, group: 'peak' });
    cigar(p, [hc[0] + 5.6, hc[1] + 1.8, hc[2] - 1.8], 1.0, 0.9, 3.0, 0.42, MAT.cigarette);
  },
};

// ── Пятак «Морская звезда» — red starfish: the top arm is the head, a toothy mouth, white vest ─────
const STAR = H('#4a0c14', '#7e1a24', '#b02e36', '#d8504c', '#f07a64');
const bumps = (c: PatternCtx): RGBA | null => {
  const u = (c.x + 40) * 0.95;
  const v = (c.y + 40) * 0.95 + (Math.floor(u) % 2) * 0.5;
  const fu = u - Math.floor(u) - 0.5;
  const fv = v - Math.floor(v) - 0.5;
  return fu * fu + fv * fv < 0.05 ? hex(c.nz > 0.6 ? '#f0a050' : '#c87a34') : null;
};
const starSkin: Material = { ramp: STAR, dither: true, pattern: bumps };
const zvezda: Rig = {
  id: 'zvezda',
  torsoC: [-0.2, 0, 8.2],
  torsoR: [5.6, 10.8, 5.2],
  shoulderY: 8.6,
  shoulderZ: 11.4,
  armR: 2.5,
  headC: [1.0, 0, 15.0],
  hipY: 4.0,
  footR: [2.8, 1.4, 1.1],
  pal: {
    torso: { ramp: TANK, pattern: tank(STAR, 6.8) },
    sleeve: starSkin,
    hand: starSkin,
    pants: { ramp: H('#0c0e18', '#161a28', '#22283a', '#30384e'), pattern: legStripe },
    shoe: BOOTS,
  },
  hand(p, at, side, rig) {
    // the arm tapers to a blunt tip with pale suckers
    paw(p, at, side, rig, {});
    p.push({ k: 'ell', c: [at[0] + 0.6, at[1], at[2] - 0.5], r: [rig.armR * 0.7, rig.armR * 0.6, 0.4], mat: { ramp: H('#c87050', '#e89a70', '#f8c090') }, group: 'suckers' + side });
  },
  torsoExtras(p, o) {
    // a black belt with a gold buckle shows below the vest at the front
    p.push({ k: 'ell', c: [4.6 + o.dx, o.dy, 6.2 + o.dz], r: [1.4, 6.0, 0.9], yaw: o.yaw, mat: { ramp: H('#060608', '#121216', '#1e1e24') }, group: 'belt' });
    p.push({ k: 'box', c: [5.6 + o.dx, o.dy, 6.6 + o.dz], h: [0.6, 1.1, 0.7], yaw: o.yaw, mat: MAT.gold, group: 'buckle', bevel: 0.2 });
  },
  head(p, o) {
    const hc: V3 = [1.0 + o.dx, o.dy, 15.0 + o.dz];
    const hr: V3 = [4.2, 4.0, 4.0];
    // the top arm of the star: a broad base and a tip leaning back
    p.push({ k: 'ell', c: hc, r: hr, mat: starSkin, group: 'head' });
    p.push({ k: 'cap', a: [hc[0] - 0.4, hc[1], hc[2] + 2.4], b: [hc[0] - 4.6, hc[1] + o.sway * 0.2, hc[2] + 6.4], r: 3.0, r2: 1.1, mat: starSkin, group: 'arm' });
    // the wide mouth at the front, full of teeth
    p.push({ k: 'ell', c: [hc[0] + 4.2, hc[1], hc[2] - 0.2], r: [1.6, 3.0, 1.3], mat: { ramp: H('#1a0406', '#2e080a', '#460e10') }, group: 'mouth' });
    for (let i = 0; i < 9; i++) {
      const a = -1.2 + (2.4 * i) / 8;
      p.push({ k: 'cap', a: [hc[0] + 4.2 + Math.cos(a) * 1.3, hc[1] + Math.sin(a) * 2.9, hc[2] + 1.0], b: [hc[0] + 5.2 + Math.cos(a) * 1.1, hc[1] + Math.sin(a) * 2.5, hc[2] - 0.4], r: 0.36, r2: 0.08, mat: CLAW, group: 'tooth' });
    }
    eyes(p, hc, hr, 1.8, 2.2, { ramp: H('#f0c040'), flat: true }, 0.55);
    cigar(p, [hc[0] + 4.6, hc[1] + 2.4, hc[2] - 1.2], 1.0, 0.7, 2.8, 0.42, MAT.cigarette);
  },
};

export const V0218_RIGS: Record<'zaychiha' | 'zayac' | 'vasilisk' | 'lenivec' | 'kozel' | 'pingvin' | 'tigr' | 'pauk' | 'bogomol' | 'ezh' | 'kasatka' | 'zvezda', Rig> = {
  zaychiha,
  zayac,
  vasilisk,
  lenivec,
  kozel,
  pingvin,
  tigr,
  pauk,
  bogomol,
  ezh,
  kasatka,
  zvezda,
};
