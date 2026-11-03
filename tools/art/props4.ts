/**
 * Props of the two v0.2.18 maps from the product owner's layouts: the market «Черкизон» and the mining
 * town «Воркута». Same conventions as props.ts … props3.ts: modelled at the rotation-0 footprint from
 * PROP_DEFS, centred on the origin, z up; a stall's open front faces +y. No brand anywhere: the goods are
 * plain colours (a tracksuit has one white piping, never three stripes), the monument is a generic
 * miner raising his lamp.
 */
import { hex, noise2 } from './lib/raster.js';
import type { RGBA } from './lib/raster.js';
import type { Material, Prim, V3 } from './lib/model.js';

const H = (...c: string[]): RGBA[] => c.map((x) => hex(x));
const box = (c: V3, size: V3, mat: Material, group?: string, bevel = 0.6, yaw = 0): Prim => ({ k: 'box', c: [c[0], c[1], c[2] - size[2] / 2], h: [size[0] / 2, size[1] / 2, size[2] / 2], mat, group, bevel, yaw });
const cyl = (x: number, y: number, r: number, z1: number, mat: Material, group?: string, bevel = 0.8, z0 = 0): Prim => ({ k: 'cyl', c: [x, y, 0], r, z0, z1, mat, group, bevel });
const cap = (a: V3, b: V3, r: number, mat: Material, group?: string, r2?: number): Prim => ({ k: 'cap', a, b, r, r2, mat, group });
const ell = (c: V3, r: V3, mat: Material, group?: string, yaw = 0): Prim => ({ k: 'ell', c, r, mat, group, yaw });

function ramp(base: string): RGBA[] {
  const b = hex(base);
  return [0.42, 0.62, 0.82, 1.0, 1.18].map((f) => [Math.min(255, b[0] * f), Math.min(255, b[1] * f), Math.min(255, b[2] * f), 255] as RGBA);
}
const solid = (c: string): Material => ({ ramp: ramp(c) });
const flat = (c: string): Material => ({ ramp: H(c), flat: true });

const M = {
  steel: { ramp: H('#1c1f24', '#2e333a', '#454b54', '#626a74', '#858d98'), spec: { color: hex('#c4ccd8'), power: 14, threshold: 0.86 } } as Material,
  steelDark: { ramp: H('#101215', '#1b1e23', '#2a2e35', '#3c414a') } as Material,
  rubber: { ramp: H('#070708', '#111114', '#1c1c20', '#2a2a30') } as Material,
  wood: { ramp: H('#2c1c10', '#46301c', '#624428', '#7e5a36', '#987048') } as Material,
  woodPale: { ramp: H('#3a2c1c', '#5a462e', '#7a6040', '#967a52', '#ae9266') } as Material,
  granite: { ramp: H('#1e1d1f', '#2e2d30', '#423f44', '#58545a', '#706b72'), spec: { color: hex('#b8b4c0'), power: 14, threshold: 0.9 } } as Material,
  bronze: { ramp: H('#1a140c', '#2e2214', '#48361e', '#66502c', '#86703e'), spec: { color: hex('#e0c890'), power: 12, threshold: 0.8 } } as Material,
  brick: { ramp: H('#2a100a', '#4a1c12', '#6a2a1a', '#843a24', '#9a4a30') } as Material,
  plastic: (c: string): Material => ({ ramp: ramp(c), spec: { color: hex('#e8f0f8'), power: 10, threshold: 0.84 } }),
  /** Snow: blue in the shade, white on top, a few glints. */
  snow: { ramp: H('#5a6a84', '#7e8ea8', '#a6b4cc', '#cad4e4', '#e8eef8'), pattern: (c) => (noise2(c.u, c.v, 77) > 0.97 ? hex('#ffffff') : null) } as Material,
  coal: { ramp: H('#060607', '#0e0e10', '#18181c', '#24242a', '#34343c'), spec: { color: hex('#6a6e7a'), power: 8, threshold: 0.96 }, dither: true } as Material,
};

/** Smooth value noise (bilinear between hashed lattice points). */
function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sm = (t: number) => t * t * (3 - 2 * t);
  const a = noise2(xi, yi, seed);
  const b = noise2(xi + 1, yi, seed);
  const c = noise2(xi, yi + 1, seed);
  const d = noise2(xi + 1, yi + 1, seed);
  return a + (b - a) * sm(xf) + (c - a) * sm(yf) + (a - b - c + d) * sm(xf) * sm(yf);
}

/** Snow lying on what faces up: soft patches where the surface is nearly flat, the material elsewhere. */
function snowy(base: Material, seed: number, amount = 0.72, cover = 0.5): Material {
  const s = M.snow.ramp;
  return {
    ...base,
    pattern: (c) => {
      if (c.nz > amount && vnoise(c.x / 3.5, c.y / 3.5, seed) > 1 - cover) return c.nz > 0.93 ? s[4]! : s[3]!;
      return base.pattern ? base.pattern(c) : null;
    },
  };
}

/** Corrugated sheet: ridges across x, a darker seam every `seam` px of y, optional rust blotches. */
function corrugated(base: string, seed: number, rust = 0.25): Material {
  return {
    ramp: ramp(base),
    pattern: (c) => {
      if (rust > 0 && vnoise(c.x / 4, c.y / 2.5, seed) > 1 - rust * 0.7) return vnoise(c.x, c.y, seed + 1) > 0.5 ? hex('#6a3a1c') : -1;
      return Math.floor((c.lx + 200) / 1.5) % 2 ? -0.7 : 0.25;
    },
  };
}

/** Awning canvas: stripes across x of two colours. */
function striped(a: string, b: string, width = 5): Material {
  const ra = ramp(a);
  const rb = ramp(b);
  return { ramp: ra, pattern: (c) => (Math.floor((c.lx + 300) / width) % 2 ? (c.nz > 0.8 ? rb[3]! : rb[2]!) : null) };
}

/** A tarp: one colour with wrinkles. */
function tarp(col: string, seed: number): Material {
  return { ramp: ramp(col), pattern: (c) => (noise2(Math.round(c.x / 2), Math.round(c.y / 5), seed) > 0.82 ? -1 : noise2(Math.round(c.x / 4), Math.round(c.y / 2), seed + 3) > 0.85 ? 0.8 : null) };
}

/** A carpet's ornament: a border, a central medallion and a diamond field. */
function carpet(field: string, border: string, motif: string): Material {
  const rf = ramp(field);
  const rb = ramp(border);
  const rm = ramp(motif);
  return {
    ramp: rf,
    pattern: (c) => {
      const ax = Math.abs(c.lx);
      const ay = Math.abs(c.ly);
      const edge = Math.max(ax / 12, ay / 5.6);
      if (edge > 0.82) return c.nz > 0.5 ? rb[3]! : rb[2]!;
      if (ax + ay * 2 < 5.4 && ax + ay * 2 > 3.6) return rm[3]!;
      if ((Math.floor(c.lx + 40) + Math.floor(c.ly * 1.4 + 40)) % 4 === 0) return rm[1]!;
      return null;
    },
  };
}

const STALL_ROOFS: Array<{ roof: string; rust: number; awning: [string, string] | null; tarpCol?: string }> = [
  { roof: '#6a4a34', rust: 0.35, awning: ['#b8261c', '#e8e0d0'] },
  { roof: '#4e5a68', rust: 0.15, awning: null, tarpCol: '#2a4a7e' },
  { roof: '#3e5a44', rust: 0.2, awning: ['#d8a82a', '#e8e0d0'] },
  { roof: '#5a5a56', rust: 0.45, awning: null, tarpCol: '#3a6a3a' },
  { roof: '#2a4a7e', rust: 0, awning: null },
  { roof: '#6a4030', rust: 0.3, awning: ['#a8201a', '#a8201a'] },
  { roof: '#c8bca0', rust: 0.05, awning: ['#a8201a', '#e8e0d0'] },
];

/** Returns primitives for the props in this module, or null for an unknown type. */
export function propPrims4(type: string, w: number, h: number, variant = 0): Prim[] | null {
  const p: Prim[] = [];
  const hw = w / 2;
  const hh = h / 2;
  switch (type) {
    // ── Черкизон ──────────────────────────────────────────────────────────
    case 'stall': {
      // a market booth: a corrugated back roof with a ridge, the awning over the counter at the front (+y)
      const v = variant % STALL_ROOFS.length;
      const s = STALL_ROOFS[v]!;
      const backD = h - 14; // depth of the roofed part
      const yRoof = -hh + backD / 2;
      if (v === 4) {
        // the whole booth under a blue tarp held down by ropes and bricks
        p.push(box([0, 0, 25], [w - 1, h - 1, 25], tarp(s.roof, 41), 'tarp', 3));
        for (const x of [-hw + 10, 0, hw - 10]) p.push(cap([x, -hh + 1, 22], [x + 2, hh - 1, 22], 0.5, solid('#c8b88a'), 'rope' + x));
        for (const [x, y] of [
          [-hw + 6, -hh + 5],
          [hw - 7, hh - 6],
        ] as const)
          p.push(box([x, y, 26.6], [5, 3, 1.8], solid('#7a3a24'), 'brick' + x, 0.3));
        break;
      }
      // the back roof: two slopes meeting at the ridge across x
      p.push(box([0, yRoof - backD / 4, 26], [w - 1, backD / 2, 26], corrugated(s.roof, 40 + v, s.rust), 'roofN', 0.8));
      p.push(box([0, yRoof + backD / 4, 25], [w - 1, backD / 2, 25], { ...corrugated(s.roof, 50 + v, s.rust), ramp: ramp(s.roof).map((c) => [c[0] * 0.86, c[1] * 0.86, c[2] * 0.86, 255] as RGBA) }, 'roofS', 0.8));
      p.push(cap([-hw + 1, yRoof, 26.2], [hw - 1, yRoof, 26.2], 0.9, solid('#3a3a3c'), 'ridge'));
      // the awning: canvas stripes or a tarp, sloping to the front edge
      const awning = s.awning ? striped(s.awning[0], s.awning[1], 5) : tarp(s.tarpCol ?? '#2a4a7e', 43 + v);
      p.push(box([0, -hh + backD + 3.75, 21], [w + 0.5, 7.5, 2], awning, 'awn1', 0.4));
      p.push(box([0, -hh + backD + 10.75, 19], [w + 0.5, 6.5, 2], awning, 'awn2', 0.4));
      // a scalloped edge on striped awnings
      if (s.awning) for (let x = -hw + 2.5; x < hw; x += 5) p.push(ell([x, hh - 0.6, 16.6], [2.4, 1.2, 1], s.awning[0] === s.awning[1] ? solid('#e8e0d0') : solid(s.awning[0]), 'sc' + x));
      // things left on the roof
      const r = (k: number) => noise2(v, k, 91);
      if (v === 6) {
        // the shawarma stand: an exhaust pipe with a hood and the smoke stain round it
        p.push(cyl(hw - 10, -hh + 8, 2.4, 34, M.steel, 'pipe', 0.4));
        p.push(cyl(hw - 10, -hh + 8, 4, 35.4, M.steelDark, 'hood', 0.6, 33.6));
        p.push(ell([hw - 16, -hh + 12, 26.4], [6, 4, 0.4], { ramp: H('#2a2622', '#3a342e'), flat: true }, 'soot'));
      } else {
        if (r(1) > 0.4) p.push(cyl(-hw + 8 + r(2) * 16, -hh + 6 + r(3) * 6, 4.6, 29, M.rubber, 'tyre', 1.6, 26));
        if (r(4) > 0.35) p.push(box([hw - 10 - r(5) * 14, -hh + 9, 29], [9, 7, 4], M.woodPale, 'box', 0.4));
        if (r(6) > 0.5) p.push(cap([-hw + 4, -hh + 4, 26.8], [hw - 14, -hh + 10, 26.8], 0.35, solid('#1a1a1a'), 'cable'));
      }
      break;
    }
    case 'goods_table': {
      // a trestle table and what is sold on it
      const v = variant % 4;
      p.push(box([0, 0, 13], [w - 1, h - 1, 1.6], M.woodPale, 'top', 0.4));
      for (const sx of [-1, 1]) p.push(box([sx * (hw - 3), 0, 11.4], [2, h - 3, 11.4], M.wood, 'leg' + sx, 0.2));
      if (v === 0) {
        // cassettes and video tapes in rows, labels in plain colours
        const labels = ['#c8261c', '#e8c040', '#2a58a8', '#e8e0d0', '#3a8a5a'];
        for (let i = 0; i < 6; i++)
          for (let j = 0; j < 2; j++) {
            const x = -hw + 4 + i * ((w - 8) / 5.4);
            const y = -hh + 5 + j * 7;
            const tape = j === 0;
            p.push(box([x, y, 14.6 + (tape ? 1.6 : 0.8)], tape ? [4.4, 6, 1.6] : [4, 2.6, 0.8], { ramp: H('#0c0c0e', '#18181c', '#26262c'), pattern: (c) => (c.nz > 0.8 && Math.abs(c.lx) < 1.4 ? hex(labels[(i + j * 2) % labels.length]!) : null) }, `t${i}${j}`, 0.2));
          }
      } else if (v === 1) {
        // shoes in pairs: black, brown, white trainers (no maker's mark)
        const cols = ['#141210', '#4a2a14', '#d8d4c8', '#2a2a30', '#6a3a1c'];
        for (let i = 0; i < 5; i++) {
          const x = -hw + 5 + i * ((w - 10) / 4);
          const col = cols[i % cols.length]!;
          for (const sy of [-1, 1]) p.push(ell([x + sy * 1.4, sy * 3, 15.4], [1.7, 3.2, 1.6], { ramp: ramp(col), spec: { color: hex('#ffffff'), power: 10, threshold: 0.86 } }, `s${i}${sy}`));
        }
      } else if (v === 2) {
        // a radio-cassette player, a small TV and boxes
        p.push(box([-hw + 9, -1, 19], [13, 6, 5], solid('#2a2a2e'), 'radio', 0.6));
        for (const sx of [-1, 1]) p.push(cyl(-hw + 9 + sx * 4, -1, 2.2, 19.2, { ramp: H('#0a0a0c', '#16161a', '#2a2a30') }, 'spk' + sx, 0.4, 18.6));
        p.push(cap([-hw + 4, -4, 21], [-hw + 14, -4, 21], 0.5, M.steel, 'handle'));
        p.push(box([4, 0, 22], [10, 10, 8], solid('#5a4a38'), 'tv', 0.8));
        p.push(box([4, 2, 22.2], [7, 4, 0.4], { ramp: H('#10202a', '#1e3a4a'), spec: { color: hex('#a8d8e8'), power: 6, threshold: 0.6 } }, 'screen', 0.2));
        p.push(box([hw - 5, -2, 17.4], [6, 8, 3.4], solid('#b8a888'), 'box1', 0.3));
      } else {
        // tins, jars and cartons
        const tins = ['#b8261c', '#d8a82a', '#3a6a3a', '#2a58a8'];
        for (let i = 0; i < 7; i++) p.push(cyl(-hw + 4 + i * ((w - 8) / 6), -3 + (i % 2) * 6, 2, 18, { ramp: ramp(tins[i % 4]!), pattern: (c) => (c.t > 0.9 ? hex('#c8ccd4') : null) }, 'tin' + i, 0.3, 14.6));
        p.push(box([hw - 6, 3, 18], [8, 6, 3.6], solid('#c8b88a'), 'carton', 0.3));
      }
      break;
    }
    case 'clothes_rail': {
      // a rail on two posts, garments on hangers seen from above (shoulders and hoods)
      const v = variant % 3;
      const sets = [
        ['#b8261c', '#1e2a5a', '#141416', '#2a58a8', '#3a5a3a', '#7a1c4a'], // tracksuits
        ['#1e3a6a', '#2a4a7e', '#16284a', '#3a5a8a', '#22324e', '#2e4466'], // jeans
        ['#141210', '#3a2414', '#1c1a18', '#5a3a20', '#2a2420', '#46301c'], // leather and sheepskin
      ][v]!;
      p.push(cap([-hw + 1, 0, 30], [hw - 1, 0, 30], 0.6, M.steel, 'rail'));
      for (const s of [-1, 1]) p.push(cyl(s * (hw - 1), 0, 0.9, 30, M.steel, 'post' + s, 0.2));
      for (let i = 0; i < 8; i++) {
        const x = -hw + 4 + i * ((w - 8) / 7);
        const col = sets[i % sets.length]!;
        const piping = v === 0 && i % 2 === 0;
        p.push(box([x, 0, 28], [4.6, h - 2, 20], { ramp: ramp(col), pattern: (c) => (piping && Math.abs(c.lx) < 0.45 && c.nz > 0.5 ? hex('#e8e0d0') : v === 2 && c.nz > 0.8 && Math.abs(c.ly) > (h - 2) / 2 - 1.2 ? hex('#c8b898') : null) }, 'g' + i, 1));
        p.push(cap([x - 1.6, 0, 30.4], [x + 1.6, 0, 30.4], 0.4, M.steelDark, 'h' + i));
      }
      break;
    }
    case 'carpet_stand': {
      // carpets thrown over a bar: two slopes like a tent, each carpet its own ornament
      const v = variant % 3;
      const pal = [
        ['#7a1416', '#1a2240', '#e0c080'],
        ['#1a2a4e', '#7a1416', '#d8c8a0'],
        ['#6a2a14', '#2a1a12', '#c8a060'],
      ][v]!;
      const mat = carpet(pal[0]!, pal[1]!, pal[2]!);
      for (const s of [-1, 1]) for (const k of [0, 1]) p.push(box([-hw / 2 + k * hw + (k ? -0.5 : 0.5), s * (hh / 2), 24 - (s > 0 ? 3 : 0)], [hw - 1.5, hh - 0.6, 22], { ...mat, ramp: ramp(k ? pal[1]! : pal[0]!) }, `c${s}${k}`, 1.4));
      p.push(cap([-hw, 0, 25], [hw, 0, 25], 0.8, M.steel, 'bar'));
      break;
    }
    case 'porta_toilet': {
      const col = ['#2a58a8', '#3a7a4a'][variant % 2]!;
      p.push(box([0, 0, 34], [w - 1, h - 1, 34], { ...M.plastic(col), pattern: (c) => (Math.abs(Math.abs(c.ly) - (h - 1) / 2) < 1 ? -0.8 : null) }, 'cab', 2));
      p.push(box([0, 0, 35.2], [w - 3, h - 3, 1.2], M.plastic('#a8acb4'), 'roof', 1.2));
      p.push(cyl(hw - 5, -hh + 5, 1.6, 38, M.plastic('#2a2a2e'), 'vent', 0.4));
      break;
    }
    // ── Воркута ──────────────────────────────────────────────────────────
    case 'headframe': {
      // the mine's headframe: four lattice legs, braces, the top deck with the two sheave wheels, the struts to the south
      const steel = snowy({ ramp: H('#200c08', '#3a1610', '#5a2416', '#7a321e', '#94422a'), spec: { color: hex('#d8a890'), power: 12, threshold: 0.86 } }, 121, 0.8, 0.4);
      const L = hw - 16;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) p.push(cap([sx * (L + 6), sy * (L + 6), 0], [sx * L * 0.7, sy * L * 0.7, 64], 1.6, steel, `leg${sx}${sy}`));
      for (const z of [16, 32, 48]) {
        const r = L + 6 - (z / 64) * (L * 0.3 + 6);
        for (const s of [-1, 1]) {
          p.push(cap([-r, s * r, z], [r, s * r, z], 0.9, steel, `bx${z}${s}`));
          p.push(cap([s * r, -r, z], [s * r, r, z], 0.9, steel, `by${z}${s}`));
          p.push(cap([-r, s * r, z], [r, s * r, z + 16], 0.6, steel, `dx${z}${s}`));
        }
      }
      // the struts down to the south, where the winding house would be
      for (const sx of [-1, 1]) p.push(cap([sx * L * 0.7, L * 0.7, 62], [sx * (L + 4), hh - 2, 0], 1.8, steel, 'strut' + sx));
      p.push(box([0, 0, 66], [L * 1.6, L * 1.6, 3], snowy({ ramp: H('#1a1c20', '#2a2e34', '#3c424a', '#525a64'), pattern: (c) => (Math.abs(((c.lx + 100) % 4) - 2) < 0.4 || Math.abs(((c.ly + 100) % 4) - 2) < 0.4 ? -1 : null) }, 122, 0.7, 0.35), 'deck', 0.6));
      // the two wheels, with spokes, seen from above
      for (const sx of [-1, 1]) {
        const cx = sx * L * 0.42;
        p.push(cyl(cx, 0, L * 0.38, 70, { ramp: H('#2a0c08', '#4a1a12', '#6e2a1c', '#8e3a26') }, 'rim' + sx, 0.8, 67.5));
        p.push(cyl(cx, 0, L * 0.3, 70.2, { ramp: H('#0e0e10', '#1a1a1e') }, 'hole' + sx, 0.2, 69.6));
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI;
          p.push(cap([cx - Math.cos(a) * L * 0.33, -Math.sin(a) * L * 0.33, 70.4], [cx + Math.cos(a) * L * 0.33, Math.sin(a) * L * 0.33, 70.4], 0.5, solid('#8e3a26'), `sp${sx}${k}`));
        }
        p.push(cyl(cx, 0, 1.6, 71, M.steel, 'hub' + sx, 0.3, 69));
      }
      p.push({ k: 'poly', pts: Array.from({ length: 10 }, (_, i) => [Math.cos(-Math.PI / 2 + (i * Math.PI) / 5) * (i % 2 ? 2.4 : 5.6), -L * 0.66 + Math.sin(-Math.PI / 2 + (i * Math.PI) / 5) * (i % 2 ? 2.4 : 5.6)] as [number, number]), z: 68.2, mat: flat('#e8302a'), group: 'star' });
      break;
    }
    case 'coal_pile': {
      // a heap of coal with snow on its top
      const coal: Material = {
        ...M.coal,
        pattern: (c) => {
          if (c.nz > 0.8 && vnoise(c.x / 4, c.y / 4, 131) > 0.52) return c.nz > 0.94 ? M.snow.ramp[4]! : M.snow.ramp[3]!;
          return noise2(c.u, c.v, 132) > 0.9 ? 1 : null;
        },
      };
      p.push(ell([0, 0, 2], [hw - 2, hh - 2, 14], coal, 'heap'));
      p.push(ell([-hw * 0.3, -hh * 0.15, 8], [hw * 0.45, hh * 0.5, 12], coal, 'heap'));
      p.push(ell([hw * 0.35, hh * 0.2, 6], [hw * 0.4, hh * 0.45, 10], coal, 'heap'));
      for (let i = 0; i < 6; i++) p.push(ell([(noise2(i, 1, 133) - 0.5) * w * 0.9, (noise2(i, 2, 133) - 0.5) * h * 0.8, 1.6], [2.4, 2, 1.6], M.coal, 'lump' + i));
      break;
    }
    case 'snowdrift': {
      const v = variant % 3;
      const snow: Material = { ...M.snow, pattern: (c) => (noise2(c.u, c.v, 140 + v) > 0.97 ? hex('#ffffff') : noise2(c.u >> 2, c.v >> 2, 141 + v) > 0.86 ? -0.6 : null) };
      p.push(ell([0, 0, 2], [hw - 2, hh - 2, 9], snow, 'drift'));
      p.push(ell([(v - 1) * hw * 0.35, -1, 5], [hw * 0.5, hh * 0.7, 8], snow, 'drift2'));
      p.push(ell([-(v - 1) * hw * 0.3 + (v === 1 ? hw * 0.4 : 0), 2, 4], [hw * 0.4, hh * 0.6, 7], snow, 'drift3'));
      break;
    }
    case 'wagon': {
      // a coal hopper wagon (the long side along y), full of coal under snow
      const body = ['#4a2216', '#1e1e22'][variant % 2]!;
      const side: Material = { ramp: ramp(body), pattern: (c) => (c.nz < 0.5 && Math.abs(((c.ly + 400) % 14) - 7) < 0.6 ? -1.2 : null) };
      p.push(box([0, 0, 28], [w - 2, h - 8, 26], side, 'body', 1.2));
      p.push(box([0, 0, 28.4], [w - 6, h - 12, 0.6], { ramp: H('#0a0a0c', '#121216') }, 'inside', 0.2));
      const load: Material = { ...M.coal, pattern: (c) => (c.nz > 0.86 && vnoise(c.x / 4, c.y / 5, 151 + variant) > 0.58 ? M.snow.ramp[c.nz > 0.96 ? 4 : 3]! : noise2(c.u, c.v, 152) > 0.9 ? 1 : null) };
      p.push(box([0, 0, 29], [w - 7, h - 13, 2], load, 'coal', 1.5));
      for (let i = 0; i < 4; i++) p.push(ell([0, -hh + 20 + i * ((h - 40) / 3), 29], [hw - 6, 13, 4.2], load, 'coal'));
      for (const sy of [-1, 1]) {
        p.push(box([0, sy * (hh - 2.6), 8], [w - 10, 3, 4], M.steelDark, 'frame' + sy, 0.4));
        for (const sx of [-1, 1]) p.push(cyl(sx * (hw - 8), sy * (hh - 1.2), 1.8, 8, M.steel, `buf${sx}${sy}`, 0.4, 6));
      }
      for (const sy of [-1, 1]) for (const sx of [-1, 1]) p.push(box([sx * (hw - 2), sy * (hh - 20), 6], [2, 14, 6], M.rubber, `bogie${sx}${sy}`, 0.4));
      break;
    }
    case 'mine_cart': {
      p.push(box([0, 0, 16], [w - 2, h - 4, 14], snowy({ ramp: ramp('#5a3a24'), pattern: (c) => (Math.abs(Math.abs(c.lx) - (w - 2) / 2) < 1 ? -1 : null) }, 160, 0.9), 'tub', 1.4));
      p.push(ell([0, 0, 15.6], [hw - 3, hh - 4, 3.4], { ...M.coal, pattern: (c) => (c.nz > 0.9 && vnoise(c.x / 3, c.y / 3, 161) > 0.55 ? M.snow.ramp[4]! : null) }, 'coal'));
      for (const sy of [-1, 1]) for (const sx of [-1, 1]) p.push(box([sx * (hw - 1), sy * (hh - 7), 3], [2, 6, 3], M.steelDark, `w${sx}${sy}`, 0.3));
      break;
    }
    case 'miner_statue': {
      // a granite pedestal; a bronze miner in a helmet raising his lamp in the right hand, a pick in the left
      p.push(box([0, 0, 2], [w - 1, h - 1, 2], M.granite, 'step', 0.5));
      p.push(box([0, 0, 18], [w - 8, h - 8, 16], { ...M.granite, pattern: (c) => (c.nz < 0.5 && Math.abs(c.z - 15) < 0.5 ? -1 : null) }, 'pedestal', 0.6));
      const fig = snowy(M.bronze, 171, 0.9);
      p.push(ell([0, 1.4, 28], [6.4, 4.6, 10], fig, 'body'));
      p.push(ell([0, 1, 36.4], [5.6, 3.8, 2.6], fig, 'shoulders'));
      p.push(ell([0, 0.6, 40.6], [2.8, 3, 3], fig, 'head'));
      p.push(ell([0, 0.2, 42.6], [3.4, 3.6, 1.6], fig, 'helmet'));
      p.push(ell([0, -2.6, 42.4], [1, 0.8, 0.8], flat('#ffd060'), 'helmetlamp'));
      p.push(cap([4.2, 0, 37], [6.4, -6.4, 47], 1.4, fig, 'armR'));
      p.push(ell([6.6, -7.2, 48.4], [1.8, 1.8, 2.2], { ramp: H('#5a4a20', '#8a7030', '#c8a040'), flat: false }, 'lamp'));
      p.push(cap([-4.2, 0.6, 35], [-6, 3, 27], 1.3, fig, 'armL'));
      p.push(cap([-6.4, 3.4, 30], [-6.6, -5, 22], 0.6, M.woodPale, 'handle'));
      p.push(cap([-9.4, -5, 22.4], [-3.8, -5.4, 22.4], 0.8, M.steel, 'pick', 0.4));
      p.push(box([0, hh - 4.4, 13], [12, 0.4, 4], flat('#c8b070'), 'plaque', 0.1));
      break;
    }
    case 'chimney': {
      // a round brick chimney with red and white bands, soot at the mouth, snow on the rim
      const r = hw - 2;
      const shaft: Material = {
        ...M.brick,
        pattern: (c) => {
          if (c.t > 0.82) return Math.floor(c.t * 30) % 2 ? hex('#c8261c') : hex('#d8d4c8');
          return Math.abs(((c.z + 80) % 4) - 2) < 0.3 ? -1 : null;
        },
      };
      p.push(cyl(0, 0, r, 120, shaft, 'shaft', 1));
      p.push(cyl(0, 0, r + 0.6, 121.4, snowy({ ramp: H('#3a3a3c', '#55555a', '#6e6e74') }, 181, 0.85), 'rim', 0.6, 119.6));
      p.push(cyl(0, 0, r - 4.6, 121.6, { ramp: H('#040405', '#0a0a0c', '#141416') }, 'mouth', 0.2, 121));
      p.push(cyl(0, 0, r - 3.2, 121.5, { ramp: H('#141210', '#221c18', '#2e2620') }, 'soot', 0.2, 121.2));
      break;
    }
    default:
      return null;
  }
  return p;
}

export const PROP_VARIANTS4: Record<string, number> = {
  stall: 7,
  goods_table: 4,
  clothes_rail: 3,
  carpet_stand: 3,
  porta_toilet: 2,
  snowdrift: 3,
  wagon: 2,
};

/** A striped market parasol seen from above (overhead frames parasol_0, parasol_1). */
export function parasolPrims(size: number, variant: number): Prim[] {
  const [a, b] = ([['#c8261c', '#e8e0d0'], ['#2a58a8', '#e8e0d0']] as const)[variant % 2]!;
  const r = size / 2 - 1;
  const ra = ramp(a);
  const rb = ramp(b);
  const canopy: Material = { ramp: ra, pattern: (c) => (Math.floor(((Math.atan2(c.y, c.x) + Math.PI) / (Math.PI * 2)) * 8) % 2 ? (c.nz > 0.85 ? rb[4]! : c.nz > 0.6 ? rb[3]! : rb[2]!) : null) };
  return [ell([0, 0, 30], [r, r, 7], canopy, 'canopy'), cyl(0, 0, 1.2, 38, { ramp: H('#8a8478', '#d8d4c8') }, 'tip', 0.3, 36)];
}
