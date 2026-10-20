/**
 * Props of the four locations from the product owner's map sheets: «Стройка», «Гастроном»,
 * «Дом культуры» and «Больница». Same conventions as props.ts: modelled at the rotation-0 footprint
 * from PROP_DEFS, centred on the origin, z up, the front of vehicles facing −y.
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
  wood: { ramp: H('#2c1c10', '#46301c', '#624428', '#7e5a36', '#987048') } as Material,
  woodPale: { ramp: H('#3a2c1c', '#5a462e', '#7a6040', '#967a52') } as Material,
  woodRed: { ramp: H('#2a120c', '#441e14', '#5e2c1c', '#7a3c26') } as Material,
  steel: { ramp: H('#1c1f24', '#2e333a', '#454b54', '#626a74', '#858d98'), spec: { color: hex('#c4ccd8'), power: 14, threshold: 0.86 } } as Material,
  steelDark: { ramp: H('#101215', '#1b1e23', '#2a2e35', '#3c414a') } as Material,
  chrome: { ramp: H('#3a3e44', '#5a6068', '#848c96', '#aab2bc', '#d0d6de'), spec: { color: hex('#ffffff'), power: 18, threshold: 0.8 } } as Material,
  black: { ramp: H('#060607', '#0f1012', '#1a1b1e', '#28292e') } as Material,
  piano: { ramp: H('#050506', '#0c0c0e', '#16161a', '#222228'), spec: { color: hex('#6a6a76'), power: 16, threshold: 0.96 } } as Material,
  rubber: { ramp: H('#070708', '#111114', '#1c1c20', '#2a2a30') } as Material,
  concrete: { ramp: H('#2c2b29', '#41403c', '#57554f', '#6e6b63', '#86827a'), dither: true } as Material,
  stone: { ramp: H('#3a3834', '#55524c', '#706c64', '#8c877e', '#a8a298') } as Material,
  glass: { ramp: H('#0c1418', '#14232a', '#1e3640', '#2c4e5a'), spec: { color: hex('#a8d8e8'), power: 6, threshold: 0.6 } } as Material,
  canvas: { ramp: H('#2e2c1c', '#47442c', '#615d3e', '#7c7650') } as Material,
  white: { ramp: H('#5e5c56', '#8a8780', '#b2aea4', '#d2cec4', '#e8e4da') } as Material,
  enamel: { ramp: H('#6a6e6a', '#949894', '#bcc0ba', '#dcdfd8') } as Material,
  sand: { ramp: H('#4a3c26', '#6a5838', '#8a764e', '#a89264', '#c0aa7a'), dither: true } as Material,
  yellow: { ramp: H('#4a3606', '#7a5a0c', '#ad8414', '#d6a826', '#f0c848') } as Material,
  velvet: { ramp: H('#2a0806', '#460e0a', '#661812', '#86221a', '#a02e22') } as Material,
  bronze: { ramp: H('#14180f', '#232a1a', '#344028', '#4a5a38', '#647a4c'), spec: { color: hex('#b8c890'), power: 12, threshold: 0.82 } } as Material,
  leaf: { ramp: H('#0e1a0e', '#18291a', '#243c24', '#335230', '#46683e'), dither: true } as Material,
  soil: { ramp: H('#140e08', '#22180e', '#302214') } as Material,
  felt: { ramp: H('#0a2a16', '#0f3a1e', '#164a28', '#1e5c32') } as Material,
  green: { ramp: H('#16201a', '#223228', '#2e4636', '#3c5a46', '#4c6e56') } as Material,
  olive: { ramp: H('#22260f', '#363d1a', '#4c5626', '#646f34') } as Material,
};

/** Red bricks laid in rows, mortar lines, a few chipped ones. */
const BRICKS: Material = {
  ramp: ramp('#8a3a24'),
  pattern: (c) => {
    if (c.nz > 0.7) {
      const row = Math.floor((c.ly + 50) / 3.2);
      const off = row % 2 ? 2.6 : 0;
      if ((c.ly + 50) % 3.2 < 0.55 || (c.lx + 50 + off) % 5.2 < 0.55) return hex('#3a2c22');
      return (noise2(Math.floor((c.lx + 50 + off) / 5.2), row, 5) - 0.5) * 1.4;
    }
    return (c.z + 20) % 2.4 < 0.5 ? -1.3 : null;
  },
};

/** Goods on a shop shelf top, per variant. */
function shelfGoods(p: Prim[], w: number, h: number, variant: number, z: number) {
  const hw = w / 2;
  const palettes: string[][] = [
    ['#b83020', '#d8d0b8', '#3a6a3a', '#c89a2a', '#e0d8c0'], // tins and jars
    ['#2a4a26', '#5a3a14', '#1a3a2a', '#c8c0a0', '#6a2018'], // bottles
    ['#e8e4dc', '#d8e0e8', '#c8d8d0', '#e8d8d0'], // pharmacy boxes
    ['#6a1c18', '#1c3a5a', '#2a4a2a', '#7a5a1c', '#3a2a4a', '#5a5a52'], // books
    ['#a0682a', '#b47a36', '#8a5420', '#c08a44'], // bread
    ['#c8a040', '#b83020', '#2a5a8a', '#e0d8c0', '#4a7a3a'], // packets
  ];
  const pal = palettes[variant % palettes.length]!;
  const kind = variant % palettes.length;
  for (let row = 0; row < 2; row++) {
    const y = (row ? 1 : -1) * (h / 4);
    for (let x = -hw + 3; x <= hw - 3; x += kind === 3 ? 1.6 : 3.6) {
      const k = Math.floor(noise2(Math.round(x * 3), row, 40 + kind) * pal.length);
      const col = pal[k]!;
      const gap = noise2(Math.round(x * 5), row, 77 + kind) > 0.88;
      if (gap) continue;
      if (kind === 0) p.push(cyl(x, y, 1.5, z + 3, solid(col), `g${row}${x}`, 0.3, z));
      else if (kind === 1) p.push(cyl(x, y, 1.1, z + 4.5, { ramp: ramp(col), spec: { color: hex('#e0f0e8'), power: 10, threshold: 0.75 } }, `g${row}${x}`, 0.4, z));
      else if (kind === 2) p.push(box([x, y, z + 2.4], [3, h / 2 - 1.5, 2.4], solid(col), `g${row}${x}`, 0.2));
      else if (kind === 3) p.push(box([x, 0, z + 3], [1.3, h - 3, 3 + noise2(Math.round(x * 7), 0, 3) * 1.5], solid(col), `g${x}`, 0.1));
      else if (kind === 4) p.push(ell([x, y, z + 1.2], [1.9, h / 4 - 0.5, 1.5], { ramp: ramp(col), pattern: (c) => (Math.abs(c.lx) < 0.3 ? -1 : null) }, `g${row}${x}`));
      else p.push(box([x, y, z + 2.6], [3.2, h / 2 - 1.6, 2.6], solid(col), `g${row}${x}`, 0.2));
    }
    if (kind === 3) break;
  }
}

/** Returns primitives for the props in this module, or null for an unknown type. */
export function propPrims2(type: string, w: number, h: number, variant = 0): Prim[] | null {
  const p: Prim[] = [];
  const hw = w / 2;
  const hh = h / 2;
  switch (type) {
    // ── construction site ────────────────────────────────────────────────
    case 'brick_pallet':
      p.push(box([0, 0, 2], [w - 1, h - 1, 2], M.woodPale, 'pallet', 0.3));
      p.push(box([0, 0, 13], [w - 3, h - 3, 11], BRICKS, 'bricks', 0.4));
      p.push(box([0, 0, 13.3], [1.1, h - 2, 0.5], M.steelDark, 'strap', 0.1));
      break;
    case 'cinder_blocks':
      p.push(
        box([0, 0, 24], [w - 1, h - 1, 24], {
          ramp: H('#2c2b28', '#43413c', '#5a5852', '#726f68', '#8a867e'),
          dither: true,
          pattern: (c) => {
            if (c.nz > 0.7) {
              const bx = (c.lx + 50) % 12;
              const by = (c.ly + 50) % 8;
              if (bx < 0.6 || by < 0.6) return -1.6;
              if (by > 2.2 && by < 5.8 && ((bx > 2 && bx < 5.4) || (bx > 6.6 && bx < 10))) return hex('#171614');
              return null;
            }
            return (c.z + 30) % 8 < 0.6 ? -1.2 : (c.lx + c.ly + 50) % 12 < 0.6 ? -0.8 : null;
          },
        }, 'b', 0.5),
      );
      break;
    case 'concrete_pipes': {
      const pipe: Material = { ramp: ramp('#7a7670'), dither: true, pattern: (c) => (noise2(c.u >> 1, c.v >> 1, 7) > 0.9 ? -0.8 : Math.abs(c.t - 0.5) > 0.47 ? -1.2 : null) };
      for (const [y, z] of [
        [-10, 9.6],
        [10, 9.6],
        [0, 25],
      ] as const) {
        p.push(cap([-hw + 10, y, z], [hw - 10, y, z], 9.4, pipe, `p${y}${z}`));
        for (const s of [-1, 1]) p.push(ell([s * (hw - 1.4), y, z], [0.8, 6, 6], { ramp: H('#0e0d0c', '#1a1916') }, `h${s}${y}${z}`));
      }
      break;
    }
    case 'timber':
      for (let layer = 0; layer < 3; layer++)
        for (let i = 0; i < 3; i++)
          p.push(box([((layer + i) % 2) * 0.8 - 0.4, -5 + i * 5, 3 + layer * 3], [w - 2 - (layer % 2) * 2, 4.4, 2.8], { ...M.woodPale, pattern: (c) => (Math.abs(c.lx % 9) < 0.4 ? -0.8 : null) }, `t${layer}${i}`, 0.3));
      p.push(box([-hw + 6, 0, 9.6], [1.6, h - 1, 0.6], M.steelDark, 'band1', 0.1));
      p.push(box([hw - 6, 0, 9.6], [1.6, h - 1, 0.6], M.steelDark, 'band2', 0.1));
      break;
    case 'cement_bags': {
      const bag: Material = { ramp: H('#4a4840', '#66635a', '#827e74', '#9c988c', '#b0ab9e'), dither: true, pattern: (c) => (Math.abs(c.lx) < 1.6 && Math.abs(c.ly) < 1.2 ? -0.9 : null) };
      for (const z of [3, 7.6])
        for (const [x, y] of [
          [-6, -4],
          [6, -4],
          [-6, 4],
          [6, 4],
        ] as const)
          if (z < 5 || x < 0) p.push(ell([x, y, z], [6, 4, 2.6], bag, `b${x}${y}${z}`, (x + y) * 0.04));
      break;
    }
    case 'mixer_truck': {
      const cabL = 30;
      p.push(box([0, -hh + cabL / 2 + 1, 20], [w - 4, cabL, 20], { ramp: ramp('#b8401c'), pattern: (c) => (c.nz > 0.5 && c.ly < -cabL / 2 + 6 ? hex('#16232a') : null) }, 'cab', 2));
      for (const sx of [-6, 6]) p.push(box([sx, -hh + cabL - 4, 20.8], [3, 2, 0.8], flat('#ffb030'), 'beacon' + sx, 0.2));
      p.push(box([0, 14, 9], [w - 10, h - cabL - 8, 5], M.steelDark, 'frame'));
      p.push(
        ell([0, 18, 22], [hw - 4, (h - cabL) / 2 - 6, 13], {
          ramp: ramp('#c8c4b8'),
          pattern: (c) => (Math.abs(((c.ly + c.lx * 0.9 + 200) % 13) - 6.5) < 1.6 ? hex('#c8501c') : noise2(c.u >> 1, c.v >> 1, 3) > 0.92 ? -0.8 : null),
        }, 'drum'),
      );
      p.push(box([0, hh - 3, 14], [8, 6, 5], M.steel, 'chute'));
      for (const s of [-1, 1]) for (const y of [-hh + 22, 16, hh - 16]) p.push(box([s * (hw - 0.6), y, 5], [1.4, 10, 5], M.rubber, `w${s}${y}`, 0.4));
      break;
    }
    case 'excavator': {
      for (const s of [-1, 1]) p.push(box([s * (hw - 6), 12, 8], [11, h - 26, 8], { ramp: H('#0e0e10', '#1a1a1e', '#26262c', '#34343a'), pattern: (c) => (Math.floor((c.ly + 200) * 0.8) % 2 ? -1 : null) }, 'track' + s, 1));
      p.push(box([0, 16, 22], [w - 18, 42, 14], { ramp: ramp('#c89a1c'), pattern: (c) => (c.nz > 0.5 && c.ly < -12 && c.lx < 2 ? hex('#16232a') : null) }, 'body', 2));
      p.push(box([9, 30, 26], [12, 10, 5], M.steelDark, 'engine', 0.6));
      p.push(box([0, 36, 18], [w - 20, 6, 10], { ramp: ramp('#8a6a14') }, 'counterweight', 1));
      p.push(cap([4, -4, 26], [4, -hh + 20, 30], 3.6, { ramp: ramp('#c89a1c') }, 'boom'));
      p.push(cap([4, -hh + 20, 30], [4, -hh + 9, 14], 2.8, { ramp: ramp('#b88a18') }, 'stick'));
      p.push(box([4, -hh + 7, 9], [16, 9, 7], { ramp: H('#16161a', '#24242a', '#34343c'), pattern: (c) => (c.ly < -3.5 ? -1.4 : null) }, 'bucket', 1));
      break;
    }
    case 'sand_pile':
      p.push(ell([0, 0, 0], [hw - 2, hh - 2, 15], { ...M.sand, pattern: (c) => (noise2(c.u >> 1, c.v >> 1, 9) > 0.9 ? 0.9 : noise2(c.u, c.v, 11) > 0.95 ? -1 : null) }, 'mound'));
      p.push(ell([6, -4, 8], [hw * 0.45, hh * 0.45, 10], M.sand, 'mound2'));
      p.push(cap([-hw + 14, hh - 16, 6], [-hw + 4, hh - 6, 16], 0.7, M.woodPale, 'shovel'));
      p.push(box([-hw + 14, hh - 16, 6], [4, 5, 1], M.steel, 'blade', 0.2, 0.8));
      break;
    case 'crane_mast': {
      p.push(box([0, 0, 3], [w, h, 3], M.concrete, 'slab', 0.5));
      const steel: Material = { ramp: ramp('#c8901c') };
      const k = hw - 3;
      for (const [x, y] of [
        [-k, -k],
        [k, -k],
        [-k, k],
        [k, k],
      ] as const)
        p.push(cyl(x, y, 2.2, 44, steel, `post${x}${y}`, 0.4));
      for (const z of [12, 26, 40]) {
        p.push(cap([-k, -k, z], [k, -k, z], 0.7, steel, `rx${z}a`));
        p.push(cap([-k, k, z], [k, k, z], 0.7, steel, `rx${z}b`));
        p.push(cap([-k, -k, z], [-k, k, z], 0.7, steel, `ry${z}a`));
        p.push(cap([k, -k, z], [k, k, z], 0.7, steel, `ry${z}b`));
        p.push(cap([-k, -k, z], [k, k, z + 10], 0.5, steel, `d${z}`));
      }
      // ladder inside the mast
      for (let z = 4; z < 44; z += 4) p.push(cap([-3, 0, z], [3, 0, z], 0.4, M.steelDark, 'rung' + z));
      break;
    }
    case 'scaffold': {
      const tube: Material = { ...M.steel };
      for (const y of [-hh + 2, hh - 2]) p.push(cap([-hw + 1, y, 30], [hw - 1, y, 30], 0.7, tube, 'rail' + y));
      for (let x = -hw + 2; x <= hw - 2; x += 15) for (const y of [-hh + 2, hh - 2]) p.push(cyl(x, y, 0.9, 30, tube, `post${x}${y}`, 0.2));
      for (let i = 0; i < 4; i++) p.push(box([-hw + 8 + i * 16, 0, 29], [14, h - 4, 1.2], { ...M.woodPale, pattern: (c) => (Math.abs(c.ly) < 0.3 ? -1 : null) }, 'plank' + i, 0.2));
      p.push(cap([-hw + 2, -hh + 2, 2], [hw - 2, hh - 2, 28], 0.5, tube, 'brace'));
      break;
    }
    case 'rebar':
      for (let i = 0; i < 6; i++) {
        const y = -hh + 2 + i * ((h - 4) / 5);
        p.push(cap([-hw + 1 + (i % 2) * 2, y, 1], [hw - 1 - (i % 3), y + (i % 2 ? 0.6 : -0.6), 1], 0.6, { ramp: H('#2a160b', '#4a2410', '#6a3618', '#8a4a22'), pattern: (c) => (Math.floor(c.t * 30) % 2 ? -0.8 : null) }, 'r' + i));
      }
      p.push(box([-hw + 8, 0, 2], [2, h - 1, 1], M.steelDark, 'tie1', 0.1));
      p.push(box([hw - 8, 0, 2], [2, h - 1, 1], M.steelDark, 'tie2', 0.1));
      break;
    case 'wheelbarrow':
      p.push(box([0, -2, 8], [w - 2, h - 10, 6], { ramp: ramp('#3a5a3a'), pattern: (c) => (c.nz > 0.5 && Math.abs(c.lx) < hw - 3 && Math.abs(c.ly) < (h - 10) / 2 - 2 ? hex('#4a4640') : null) }, 'tray', 1.6));
      p.push(cyl(0, -hh + 2.5, 2.4, 5, M.rubber, 'wheel', 0.6));
      for (const s of [-1, 1]) p.push(cap([s * 3, 4, 6], [s * 4.5, hh - 1, 7], 0.7, M.woodPale, 'handle' + s));
      break;

    // ── shop ─────────────────────────────────────────────────────────────
    case 'shelf': {
      const woodFrame = variant === 3 || variant === 4;
      p.push(box([0, 0, 24], [w - 1, h - 1, 24], woodFrame ? { ...M.wood } : { ramp: H('#22262a', '#343a40', '#4a525a', '#606a74') }, 'frame', 0.5));
      p.push(box([0, 0, 24.2], [w - 3, h - 3, 0.4], woodFrame ? M.woodRed : { ramp: H('#5a626a', '#78828c') }, 'board', 0.1));
      shelfGoods(p, w - 2, h - 2, variant, 24.2);
      break;
    }
    case 'fridge_case': {
      const goods = [
        ['#a8322a', '#c86a5a', '#8a2a22', '#d8a090'], // meat
        ['#e8e4dc', '#3a6aa8', '#e0d8a0', '#c8d8e8'], // dairy
        ['#8a9aa8', '#5a6a7a', '#c8c0a0', '#aab4bc'], // fish and tins
      ][variant % 3]!;
      p.push(box([0, 0, 12], [w - 1, h - 1, 12], { ramp: H('#6a6e6c', '#9a9e9a', '#c4c8c2', '#dee0da'), pattern: (c) => (c.nz < 0.5 && Math.abs(c.z - 4) < 1 ? hex('#3a6a8a') : null) }, 'body', 1));
      p.push(
        box([0, 0, 12.6], [w - 5, h - 5, 0.6], {
          ramp: H('#14232a', '#1e3640', '#2c4e5a'),
          spec: { color: hex('#c8f0ff'), power: 8, threshold: 0.6 },
          pattern: (c) => {
            const cell = Math.floor((c.lx + 50) / 4) * 7 + Math.floor((c.ly + 50) / 3.4);
            if ((c.lx + 50) % 4 < 0.5 || (c.ly + 50) % 3.4 < 0.5) return null;
            return hex(goods[Math.floor(noise2(cell, variant, 21) * goods.length)]!);
          },
        }, 'glass', 0.2),
      );
      break;
    }
    case 'counter': {
      if (variant === 1) {
        // deli: an open chilled counter with sausages, salami and a ham on a white tray
        p.push(box([0, 0, 11], [w - 1, h - 1, 11], { ramp: ramp('#c8c4b8'), pattern: (c) => (c.nz < 0.5 && c.z < 4 ? hex('#7a1c16') : null) }, 'body', 1));
        p.push(box([0, 0, 11.4], [w - 4, h - 4, 0.4], { ramp: H('#c8ccc8', '#e8ece8') }, 'tray', 0.2));
        const meat = ['#9a3a24', '#b8604a', '#7a2a1c', '#c88a6a'];
        for (let i = 0; i < 9; i++) {
          const x = -hw + 5 + i * ((w - 10) / 8);
          p.push(ell([x, -2.2, 12.6], [2.4, 1.3, 1.1], { ramp: ramp(meat[i % meat.length]!), pattern: (c) => (noise2(c.u, c.v, i) > 0.85 ? 1 : null) }, 'sau' + i, 0.2));
          p.push(ell([x + 1.4, 2.4, 12.6], [1.4, 1.4, 1.1], { ramp: ramp(meat[(i + 2) % meat.length]!), pattern: (c) => (Math.abs(c.lx) < 0.3 ? hex('#e8d8c8') : null) }, 'sal' + i));
        }
      } else if (variant === 2) {
        // reception: light wood with papers, a phone and a bell
        p.push(box([0, 0, 13], [w - 1, h - 1, 13], { ramp: ramp('#8a6a48') }, 'top', 0.6));
        p.push(box([-hw + 8, 0, 13.3], [8, 6, 0.3], flat('#d8d4c8'), 'paper', 0.1, 0.2));
        p.push(box([4, 1, 13.3], [6, 5, 0.3], flat('#e8e4d8'), 'paper2', 0.1, -0.2));
        p.push(box([hw - 8, -1, 14.6], [5, 4, 1.6], M.black, 'phone', 0.5));
        p.push(ell([-4, 2, 13.6], [1.4, 1.4, 1], M.chrome, 'bell'));
      } else if (variant === 3) {
        // cloakroom counter with numbered tokens
        p.push(box([0, 0, 13], [w - 1, h - 1, 13], M.woodRed, 'top', 0.6));
        for (let i = 0; i < 5; i++) p.push(cyl(-hw + 6 + i * 4, 0, 1.2, 13.6, M.chrome, 'tok' + i, 0.2, 13));
      } else {
        p.push(box([0, 0, 13], [w - 1, h - 1, 13], { ...M.wood, pattern: (c) => (c.nz < 0.5 && c.z < 9 ? -0.6 : null) }, 'top', 0.6));
        p.push(box([0, -hh + 2, 13.4], [w - 4, 2, 0.4], { ramp: ramp('#c8b484') }, 'edge', 0.1));
        p.push(box([hw - 9, 1, 14.2], [6, 5, 1.2], { ramp: ramp('#5a6a5a') }, 'scales', 0.4));
        p.push(box([-hw + 8, 1, 13.4], [7, 4, 0.4], flat('#c8c0a8'), 'paper', 0.1, 0.3));
      }
      break;
    }
    case 'cash_desk':
      p.push(box([0, 0, 12], [w - 1, h - 1, 12], { ramp: ramp('#6a5038') }, 'desk', 0.6));
      p.push(box([-4, -1, 17], [12, 9, 5], { ramp: ramp('#7a7e7a'), pattern: (c) => (c.nz > 0.5 && c.ly > 0 ? (Math.floor((c.lx + 50) * 1.2) % 2 ? hex('#2a2a2a') : hex('#d8d4c8')) : null) }, 'register', 0.8));
      p.push(box([-4, -4, 19], [8, 2, 1.6], flat('#3a8a3a'), 'display', 0.2));
      p.push(box([9, 2, 12.6], [8, 6, 0.6], { ramp: ramp('#3a3a3a') }, 'tray', 0.2));
      break;
    case 'produce_stall': {
      p.push(box([0, 0, 8], [w - 1, h - 1, 8], M.wood, 'stand', 0.5));
      const fruit = ['#d87a1c', '#4a8a2a', '#b82a1c', '#d8b82a', '#7a3a6a', '#3a6a2a'];
      let n = 0;
      for (let cx = 0; cx < 3; cx++)
        for (let cy = 0; cy < 2; cy++) {
          const x = -hw + 7 + cx * ((w - 14) / 2);
          const y = -hh + 6 + cy * (h - 12);
          p.push(box([x, y, 11], [11, 9, 3], M.woodPale, `crate${cx}${cy}`, 0.3));
          const col = fruit[(cx * 2 + cy + variant) % fruit.length]!;
          for (let k = 0; k < 6; k++) p.push(ell([x - 3.5 + (k % 3) * 3.5, y - 2 + Math.floor(k / 3) * 4, 12], [1.7, 1.7, 1.4], { ramp: ramp(col), spec: { color: hex('#ffffff'), power: 8, threshold: 0.8 } }, `f${n++}`));
        }
      break;
    }
    case 'sacks': {
      const burlap: Material = { ramp: H('#2e2618', '#4a3e28', '#66583a', '#82724e', '#9a8a62'), dither: true, pattern: (c) => (Math.abs(c.lx) < 0.6 ? -0.8 : null) };
      for (const [x, y, z] of [
        [-6, -4, 3.4],
        [6, -4, 3.4],
        [-6, 5, 3.4],
        [6, 5, 3.4],
        [0, 0, 8],
      ] as const)
        p.push(ell([x, y, z], [6.4, 4.4, 3], burlap, `s${x}${y}${z}`, (x - y) * 0.03));
      break;
    }
    case 'soda_machine':
      p.push(box([0, 0, 28], [w - 1, h - 1, 28], { ramp: ramp('#b83224'), pattern: (c) => (c.nz > 0.5 ? (Math.abs(c.ly) < 2 ? hex('#e8e0d0') : null) : c.ly > (h - 1) / 2 - 0.5 && c.z > 14 && c.z < 22 ? hex('#1c2a30') : null) }, 'body', 1.2));
      p.push(cyl(-3, 3, 1.4, 29, M.glass, 'cup', 0.3, 28));
      break;

    // ── house of culture ─────────────────────────────────────────────────
    case 'theater_seats': {
      const n = 5;
      const step = (w - 2) / n;
      for (let i = 0; i < n; i++) {
        const x = -hw + 1 + step * (i + 0.5);
        p.push(box([x, -1, 7], [step - 2, h - 5, 3], M.velvet, 'seat' + i, 1));
        p.push(box([x, hh - 1.6, 12], [step - 1.6, 3, 9], M.velvet, 'back' + i, 1));
        p.push(box([x - step / 2, 0, 9], [1, h - 2, 3], M.wood, 'arm' + i, 0.2));
      }
      p.push(box([hw - 1, 0, 9], [1, h - 2, 3], M.wood, 'armEnd', 0.2));
      break;
    }
    case 'stage_speaker':
      p.push(box([0, 0, 22], [w - 1, h - 1, 22], { ramp: H('#060607', '#101012', '#1c1c20', '#2a2a30'), pattern: (c) => (c.nz > 0.5 && Math.abs(c.lx) < 4.5 && Math.abs(c.ly) < 4.5 ? ((c.lx * c.lx + c.ly * c.ly) < 9 ? hex('#26262c') : hex('#141416')) : null) }, 'cab', 0.8));
      p.push(box([0, -hh + 1.5, 22.4], [w - 4, 1, 0.4], flat('#7a7a80'), 'grille', 0.1));
      break;
    case 'drum_kit': {
      const head: Material = { ramp: H('#8a8478', '#b8b2a4', '#dcd6c8'), pattern: (c) => (c.t > 0.85 ? hex('#8a1c18') : null) };
      p.push(cyl(0, 2, 6, 9, head, 'bass', 0.6));
      p.push(cyl(-7, -4, 3.4, 11, head, 'tom1', 0.5));
      p.push(cyl(6, -5, 3.4, 11, head, 'tom2', 0.5));
      p.push(cyl(-9, 6, 3.6, 8, head, 'snare', 0.5));
      p.push(cyl(9, 5, 4.2, 7, head, 'floor', 0.5));
      for (const [x, y, r] of [
        [-12, -7, 4.6],
        [12, -8, 5],
        [-12, 9, 4],
      ] as const)
        p.push(cyl(x, y, r * 0.75, 14, { ramp: H('#3a2a08', '#5a4410', '#8a6a1c', '#b08a2c'), pattern: (c) => (c.t < 0.2 ? hex('#2a2008') : Math.floor(c.t * 6) % 2 ? -0.6 : null) }, `cym${x}${y}`, 0.2, 13.4));
      p.push(cyl(0, hh - 3, 2.6, 7, M.black, 'stool', 0.5));
      break;
    }
    case 'pool_table':
      p.push(box([0, 0, 11], [w - 1, h - 1, 11], M.wood, 'frame', 1));
      p.push(box([0, 0, 11.3], [w - 7, h - 7, 0.4], { ...M.felt, pattern: (c) => (noise2(c.u, c.v, 31) > 0.97 ? -0.6 : null) }, 'felt', 0.2));
      for (const x of [-hw + 3.2, 0, hw - 3.2]) for (const y of [-hh + 3.2, hh - 3.2]) p.push(cyl(x, y, 1.4, 11.6, M.black, `pk${x}${y}`, 0.2, 11.2));
      for (const [x, y, col] of [
        [-8, -3, '#e8e4dc'],
        [6, 2, '#b82a1c'],
        [9, -4, '#d8b82a'],
        [11, 4, '#2a4a8a'],
        [-12, 5, '#1c1c1c'],
      ] as const)
        p.push(ell([x, y, 12.2], [1, 1, 1], { ramp: ramp(col), spec: { color: hex('#ffffff'), power: 14, threshold: 0.75 } }, `b${x}${y}`));
      p.push(cap([-hw + 4, hh + 1, 12.4], [hw - 12, -hh + 7, 12], 0.5, M.woodPale, 'cue'));
      break;
    case 'cafe_table':
      p.push(cyl(0, 0, 5.6, 10, { ramp: H('#8a8478', '#b8b2a4', '#dcd6c8', '#ece8e0'), pattern: (c) => (c.t < 0.9 && (Math.floor((c.x + 50) / 1.6) + Math.floor((c.y + 50) / 1.6)) % 2 ? hex('#a8302a') : null) }, 'top', 0.6));
      p.push(cyl(1.4, -1, 0.9, 11.4, M.glass, 'glass', 0.2, 10));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        p.push(box([Math.cos(a) * 8, Math.sin(a) * 8, 6], [4.6, 4.6, 1.2], M.woodRed, 'chair' + i, 0.4, a));
      }
      break;
    case 'piano':
      p.push(box([0, -1, 22], [w - 1, h - 3, 22], M.piano, 'body', 0.8));
      p.push(box([0, hh - 2.2, 11], [w - 4, 4, 1.2], { ramp: H('#c8c4b8', '#e8e4d8'), pattern: (c) => ((c.lx + 50) % 2.2 < 0.6 ? hex('#141414') : null) }, 'keys', 0.1));
      p.push(box([-hw + 6, -2, 22.4], [6, 4, 0.4], flat('#d8c890'), 'sheet', 0.1, 0.1));
      p.push(cyl(hw - 5, -2, 1.4, 25, { ramp: ramp('#c8a040') }, 'candle', 0.3, 22));
      break;
    case 'statue': {
      p.push(box([0, 0, 18], [w - 6, h - 6, 18], { ...M.stone, pattern: (c) => (c.nz < 0.5 && Math.abs(c.z - 14) < 0.6 ? -1.2 : null) }, 'pedestal', 0.8));
      p.push(box([0, 0, 2], [w - 1, h - 1, 2], M.stone, 'step', 0.5));
      // a bronze orator: coat, head, an arm thrown forward
      p.push(ell([0, 1.5, 30], [7, 5.4, 13], M.bronze, 'coat'));
      p.push(ell([0, 3.4, 24], [7.6, 4.8, 6], M.bronze, 'hem'));
      p.push(ell([0, 0.4, 44.5], [3.2, 3.4, 3.4], M.bronze, 'head'));
      p.push(ell([0, 1.6, 42], [4.2, 3, 1.4], M.bronze, 'collar'));
      p.push(cap([3.4, -0.6, 38], [8.4, -10.5, 42], 1.6, M.bronze, 'arm'));
      p.push(ell([8.8, -11.2, 42.4], [1.4, 1.6, 1.2], M.bronze, 'hand'));
      p.push(cap([-3.6, 1.4, 37], [-5, 5, 29], 1.4, M.bronze, 'arm2'));
      p.push(box([0, hh - 4.6, 14], [10, 0.4, 4], flat('#c8b070'), 'plaque', 0.1));
      break;
    }
    case 'bust':
      p.push(box([0, 0, 16], [w - 5, h - 5, 16], M.stone, 'pedestal', 0.6));
      p.push(ell([0, 1, 18.5], [5, 3.6, 3], M.bronze, 'shoulders'));
      p.push(ell([0, 0, 23.5], [2.6, 2.9, 3.2], M.bronze, 'head'));
      break;
    case 'planter': {
      p.push(box([0, 0, 9], [w - 1, h - 1, 9], { ...M.concrete, pattern: (c) => (c.nz > 0.5 && Math.abs(c.lx) < hw - 3 && Math.abs(c.ly) < hh - 3 ? hex('#1c140c') : null) }, 'box', 0.6));
      for (let i = 0; i < 14; i++) {
        const a = noise2(i, 1, 7) * Math.PI * 2;
        const r = noise2(i, 2, 7) * (hw - 6);
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i < 6) p.push(ell([x, y, 11], [3.4, 3, 2.6], M.leaf, 'leaf' + i, a));
        else p.push(ell([x, y, 11.6], [1.2, 1.2, 1], flat(['#c8302a', '#e0b82a', '#d8d0c0', '#c8502a'][i % 4]!), 'fl' + i));
      }
      break;
    }
    case 'column':
      p.push(cyl(0, 0, w / 2 - 1, 48, { ramp: H('#4a4640', '#6e6a62', '#948e84', '#b4aea4', '#cac4b8'), pattern: (c) => (Math.floor(((c.s + Math.PI) / (Math.PI * 2)) * 16) % 2 ? -0.6 : null) }, 'shaft', 1));
      p.push(cyl(0, 0, w / 2 - 0.2, 50, { ...M.stone, pattern: (c) => (c.t > 0.86 ? -1 : c.t > 0.7 ? 0.8 : c.t < 0.25 ? -0.8 : null) }, 'capital', 0.8, 47));
      break;
    case 'coat_rack': {
      p.push(cap([-hw + 1, 0, 28], [hw - 1, 0, 28], 0.6, M.chrome, 'rail'));
      for (const s of [-1, 1]) p.push(cyl(s * (hw - 1), 0, 0.8, 28, M.chrome, 'leg' + s, 0.2));
      const cols = variant === 1 ? ['#a8302a', '#2a4a8a', '#c8a030', '#3a6a3a', '#6a2a6a', '#d8d0c0'] : ['#3a3430', '#4a4038', '#2a2c30', '#5a4a3a', '#3a3a2a'];
      for (let i = 0; i < 8; i++) {
        const x = -hw + 4 + i * ((w - 8) / 7);
        p.push(ell([x, 0.5, 18], [2.6, 4, 10], { ramp: ramp(cols[i % cols.length]!), pattern: (c) => (Math.abs(c.lx) < 0.3 ? -0.8 : null) }, 'coat' + i, (noise2(i, 0, 3) - 0.5) * 0.4));
      }
      break;
    }
    case 'sofa':
      p.push(box([0, 1, 7], [w - 4, h - 5, 4], M.velvet, 'seat', 1.4));
      p.push(box([0, -hh + 2, 12], [w - 1, 4, 10], M.velvet, 'back', 1.4));
      for (const s of [-1, 1]) p.push(box([s * (hw - 2), 1, 10], [4, h - 3, 7], M.velvet, 'arm' + s, 1.2));
      for (let i = 0; i < 3; i++) p.push(box([-hw + 7 + i * ((w - 14) / 2), 1.2, 7.4], [(w - 10) / 3 - 1, h - 7, 0.6], { ramp: ramp('#86221a') }, 'cush' + i, 0.6));
      break;
    case 'curtain':
      p.push(box([0, 0, 40], [w, h - 1, 40], { ramp: H('#1e0604', '#3a0c08', '#5a140e', '#7a1c14', '#982a1e'), pattern: (c) => Math.sin((c.lx + 50) * 1.3) * 1.2 }, 'c', 1));
      p.push(cap([-hw, -hh + 1, 40.6], [hw, -hh + 1, 40.6], 0.6, { ramp: ramp('#b8902a') }, 'rod'));
      break;
    case 'mixing_desk':
      p.push(box([0, 0, 11], [w - 1, h - 1, 11], { ramp: H('#0c0c0e', '#18181c', '#26262c', '#36363e') }, 'desk', 0.6));
      for (let i = 0; i < 9; i++) {
        const x = -hw + 4 + i * ((w - 8) / 8);
        p.push(box([x, 1, 11.4], [0.6, 6, 0.4], flat('#4a4a50'), 'slot' + i, 0.05));
        p.push(box([x, 1 + (noise2(i, 0, 5) - 0.5) * 4, 11.9], [1.6, 1, 0.8], flat('#e0dcd0'), 'fader' + i, 0.1));
        p.push(cyl(x, -4, 0.7, 12, flat(i % 3 === 0 ? '#e04a2a' : i % 3 === 1 ? '#e0c040' : '#4ac06a'), 'knob' + i, 0.1, 11));
      }
      break;

    // ── hospital ─────────────────────────────────────────────────────────
    case 'hospital_bed':
      p.push(box([0, 0, 9], [w - 1, h - 1, 3], M.enamel, 'frame', 0.6));
      p.push(box([0, 1, 12], [w - 4, h - 5, 3], { ramp: H('#7a8a8a', '#a8b4b2', '#ccd6d2', '#e2e8e4') }, 'mattress', 1.2));
      p.push(ell([0, -hh + 6, 13.6], [hw - 4, 3.4, 1.8], M.white, 'pillow'));
      p.push(box([0, 5, 13.6], [w - 3, h * 0.55, 1.4], { ramp: H('#2c3a34', '#3e5048', '#52665c', '#687c70'), pattern: (c) => (Math.abs(c.ly + h * 0.24) < 0.8 ? hex('#d8d8d0') : null) }, 'blanket', 1));
      for (const y of [-hh + 1, hh - 1]) p.push(cap([-hw + 1, y, 16], [hw - 1, y, 16], 0.8, M.chrome, 'rail' + y));
      break;
    case 'operating_table':
      p.push(box([0, 0, 13], [w - 2, h - 2, 3], M.chrome, 'top', 0.6));
      p.push(box([0, 2, 14], [w - 4, h - 8, 1.4], { ramp: H('#1e4a3a', '#2a5e4a', '#367260', '#448672') }, 'sheet', 0.8));
      p.push(ell([0, -hh + 4, 14.8], [hw - 3, 2.6, 1.2], M.white, 'pillow'));
      p.push(box([0, 0, 6], [6, 10, 6], M.steelDark, 'pedestal', 0.6));
      break;
    case 'med_screen':
      for (let i = 0; i < 3; i++) {
        const x = -hw + w / 6 + i * (w / 3);
        p.push(box([x, (i % 2 ? 1 : -1) * 0.8, 26], [w / 3 - 1, 1.6, 22], { ramp: H('#2a4a40', '#3a5e52', '#4a7264', '#5a8676') }, 'panel' + i, 0.3, i % 2 ? 0.12 : -0.12));
        p.push(cap([x - w / 6 + 0.5, 0, 26], [x + w / 6 - 0.5, 0, 26], 0.6, M.chrome, 'top' + i));
      }
      break;
    case 'med_cabinet':
      p.push(box([0, 0, 26], [w - 1, h - 1, 26], { ramp: H('#7a7e7a', '#a4a8a2', '#ccd0c8', '#e4e6e0') }, 'body', 0.8));
      p.push(
        box([0, 0, 26.4], [w - 4, h - 4, 0.4], {
          ramp: H('#1e3640', '#2c4e5a', '#3e6470'),
          spec: { color: hex('#e0f8ff'), power: 8, threshold: 0.6 },
          pattern: (c) => ((c.lx + 50) % 3.2 < 1.2 ? hex(['#d8d0c0', '#8a4a2a', '#3a6a8a', '#e8e4dc'][Math.floor(noise2(Math.floor((c.lx + 50) / 3.2), 0, 8) * 4)]!) : null),
        }, 'glass', 0.1),
      );
      p.push(cross(0, 0, 26.8, 3, '#c8302a', 'cross'));
      break;
    case 'xray':
      p.push(box([0, 4, 10], [w - 4, h - 12, 10], { ramp: ramp('#c8ccc8') }, 'table', 1));
      p.push(box([0, 4, 10.6], [w - 10, h - 16, 0.6], { ramp: H('#2a3a3a', '#3a4e4e') }, 'pad', 0.4));
      p.push(box([-hw + 5, -hh + 6, 30], [8, 10, 30], { ramp: ramp('#8a8e8a') }, 'column', 0.8));
      p.push(cap([-hw + 5, -hh + 6, 30], [4, 0, 28], 2.4, { ramp: ramp('#aeb2ae') }, 'arm'));
      p.push(box([6, 2, 26], [12, 10, 4], { ramp: ramp('#6a6e6a') }, 'head', 0.8));
      p.push(box([hw - 6, -hh + 4, 22], [9, 2, 14], { ramp: H('#2a8aa8', '#6ae0ff', '#c8f8ff'), flat: true, pattern: (c) => (Math.abs(c.lx) < 0.6 && c.z > 12 ? hex('#ffffff') : null) }, 'screen', 0.2));
      break;
    case 'bench_row': {
      const n = 5;
      const step = (w - 2) / n;
      p.push(cap([-hw + 1, 1, 4], [hw - 1, 1, 4], 0.9, M.chrome, 'beam'));
      for (let i = 0; i < n; i++) {
        const x = -hw + 1 + step * (i + 0.5);
        p.push(box([x, 0, 7], [step - 1.4, h - 4, 1.6], { ramp: H('#163a2a', '#1f4e38', '#2a6248', '#387658') }, 'seat' + i, 0.8));
        p.push(box([x, hh - 1.4, 12], [step - 1.4, 2.2, 7], { ramp: H('#163a2a', '#1f4e38', '#2a6248', '#387658') }, 'back' + i, 0.6));
      }
      break;
    }
    case 'wheelchair':
      for (const s of [-1, 1]) p.push(box([s * (hw - 1), 1, 7], [1, 12, 7], { ramp: H('#0a0a0c', '#1c1c20', '#3a3a40'), pattern: (c) => (Math.abs(c.ly) < 4.4 && Math.abs(c.z - 3.5) < 2.6 ? -1 : null) }, 'wheel' + s, 0.2));
      p.push(box([0, 1, 8], [w - 4, 8, 1.4], { ramp: ramp('#2a4a7a') }, 'seat', 0.6));
      p.push(box([0, hh - 2, 12], [w - 4, 1.6, 6], { ramp: ramp('#2a4a7a') }, 'back', 0.4));
      for (const s of [-1, 1]) p.push(cap([s * 4, hh - 1, 14], [s * 4, hh + 1, 14], 0.6, M.chrome, 'handle' + s));
      break;
    case 'stretcher':
      p.push(box([0, 0, 11], [w - 1, h - 1, 2], M.chrome, 'frame', 0.4));
      p.push(box([0, 1, 12.4], [w - 3, h - 4, 1.4], M.white, 'sheet', 0.8));
      p.push(ell([0, -hh + 4, 13.4], [hw - 2, 2.4, 1.2], M.white, 'pillow'));
      for (const s of [-1, 1]) for (const y of [-hh + 2, hh - 2]) p.push(cyl(s * (hw - 1.5), y, 1, 2, M.rubber, `w${s}${y}`, 0.2));
      break;
    case 'ambulance': {
      const body = ['#d8d4c4', '#4c5a2c', '#8a8e8c'][variant % 3]!;
      const cabL = 18;
      p.push(box([0, 0, 22], [w - 1, h - 1, 22], { ramp: ramp(body), pattern: (c) => (c.nz > 0.5 && c.ly < -hh + cabL && c.ly > -hh + 4 ? hex('#16232a') : null) }, 'body', 3));
      if (variant % 3 === 0) {
        p.push(box([0, 8, 22.4], [w - 6, 4, 0.4], flat('#b8261c'), 'stripe', 0.1));
        p.push(cross(0, 18, 22.8, 7, '#c8261c', 'cross'));
        p.push(box([0, -hh + cabL + 2, 24], [10, 3, 2], { ramp: H('#1a3aa8', '#4a8aff'), flat: true }, 'light', 0.3));
      } else if (variant % 3 === 1) {
        p.push(box([0, 10, 22.6], [w - 10, h * 0.4, 0.6], { ramp: ramp('#56663a') }, 'roofPanel', 0.4));
      }
      for (const s of [-1, 1]) for (const y of [-hh + 16, hh - 14]) p.push(box([s * (hw - 0.4), y, 4], [1.4, 9, 4], M.rubber, `w${s}${y}`, 0.4));
      break;
    }
    case 'tent': {
      // variants: 0 field hospital (red cross), 1 army (plain, a stencilled star), 2 a pioneers' tourist tent
      const v = variant % 3;
      const cols = [
        ['#2a2a1c', '#3e3e28', '#55553a', '#6c6c4c', '#84845e'],
        ['#1e2414', '#2e361e', '#40492a', '#535e38', '#687446'],
        ['#1a2a44', '#243c60', '#30507a', '#406894', '#5482ac'],
      ][v]!;
      const canvasMat: Material = { ramp: H(...cols), pattern: (c) => (Math.abs(c.lx) < 0.5 ? -1.2 : null) };
      // a pitched roof: two sloped boxes meeting at the ridge (x = 0)
      p.push(box([-hw / 2 + 0.5, 0, 16], [hw - 1, h - 1, 16], { ...canvasMat, pattern: (c) => (c.nz > 0.5 ? (c.lx > hw / 2 - 1.5 ? 1 : null) : null) }, 'left', 2));
      p.push(box([hw / 2 - 0.5, 0, 22], [hw - 1, h - 1, 22], canvasMat, 'right', 2));
      if (v === 0) p.push(cross(hw / 2, 0, 22.4, 8, '#c8261c', 'cross'));
      else if (v === 1) p.push({ k: 'poly', pts: Array.from({ length: 10 }, (_, i) => [hw / 2 + Math.cos(-Math.PI / 2 + (i * Math.PI) / 5) * (i % 2 ? 2.4 : 5.6), Math.sin(-Math.PI / 2 + (i * Math.PI) / 5) * (i % 2 ? 2.4 : 5.6)] as [number, number]), z: 22.4, mat: { ramp: H('#5a1410', '#8a1c16'), flat: true }, group: 'star' });
      else {
        // an orange fly-sheet stripe and guy ropes
        p.push(box([hw / 2 - 0.5, 0, 22.3], [hw - 3, 3, 0.3], { ramp: H('#c85a14'), flat: true }, 'stripe', 0.1));
        for (const sy of [-1, 1]) p.push(cap([0, sy * (hh - 1), 20], [0, sy * (hh + 3), 1], 0.3, { ramp: H('#8a8478', '#b8b2a4') }, 'rope' + sy));
      }
      break;
    }
    case 'iv_stand':
      p.push(cyl(0, 0, 0.7, 30, M.chrome, 'pole', 0.2));
      p.push(box([0, 0, 2], [6, 6, 1], M.chrome, 'base', 0.2));
      p.push(ell([1.6, 0, 28], [1.4, 1, 2.4], { ramp: H('#8ab4c8', '#c8e8f0'), spec: { color: hex('#ffffff'), power: 8, threshold: 0.7 } }, 'bag'));
      break;
    default:
      return null;
  }
  return p;
}

/** A flat cross (red cross on roofs and cabinets). */
function cross(x: number, y: number, z: number, r: number, col: string, group: string): Prim {
  return {
    k: 'poly',
    pts: [
      [x - r * 0.3, y - r],
      [x + r * 0.3, y - r],
      [x + r * 0.3, y - r * 0.3],
      [x + r, y - r * 0.3],
      [x + r, y + r * 0.3],
      [x + r * 0.3, y + r * 0.3],
      [x + r * 0.3, y + r],
      [x - r * 0.3, y + r],
      [x - r * 0.3, y + r * 0.3],
      [x - r, y + r * 0.3],
      [x - r, y - r * 0.3],
      [x - r * 0.3, y - r * 0.3],
    ],
    z,
    mat: flat(col),
    group,
  };
}

export const PROP_VARIANTS2: Record<string, number> = {
  tent: 3,
  shelf: 6,
  fridge_case: 3,
  counter: 4,
  coat_rack: 2,
  ambulance: 3,
  produce_stall: 3,
};
