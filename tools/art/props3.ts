/**
 * Props of the three v0.23 locations from the product owner's map sheets: «Кладбище», «Красная
 * площадь» and the pioneer camp «Звёздочка». Same conventions as props.ts / props2.ts: modelled at the
 * rotation-0 footprint from PROP_DEFS, centred on the origin, z up, the front of vehicles facing −y.
 * No real people: the monuments are generic figures (a mourner, a bugler, a soldier's obelisk).
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
  granite: { ramp: H('#1e1d1f', '#2e2d30', '#423f44', '#58545a', '#706b72'), spec: { color: hex('#b8b4c0'), power: 14, threshold: 0.9 } } as Material,
  graniteRed: { ramp: H('#2a1210', '#42201c', '#5c302a', '#784038', '#925248'), spec: { color: hex('#e0b0a8'), power: 14, threshold: 0.9 } } as Material,
  stone: { ramp: H('#3a3834', '#55524c', '#706c64', '#8c877e', '#a8a298') } as Material,
  marble: { ramp: H('#6a6862', '#94918a', '#bab6ae', '#d6d2c8', '#ece8de') } as Material,
  plaster: { ramp: H('#7a766c', '#a29e94', '#c6c2b8', '#e0dcd2', '#f2eee6') } as Material,
  iron: { ramp: H('#0c0d10', '#16181c', '#22252a', '#30343a', '#42474e'), spec: { color: hex('#8a92a0'), power: 14, threshold: 0.86 } } as Material,
  steel: { ramp: H('#1c1f24', '#2e333a', '#454b54', '#626a74', '#858d98'), spec: { color: hex('#c4ccd8'), power: 14, threshold: 0.86 } } as Material,
  gold: { ramp: H('#5e400c', '#9a6c18', '#d4a232', '#f6d470'), spec: { color: hex('#fff7d0'), power: 12, threshold: 0.7 } } as Material,
  wood: { ramp: H('#2c1c10', '#46301c', '#624428', '#7e5a36', '#987048') } as Material,
  woodPale: { ramp: H('#3a2c1c', '#5a462e', '#7a6040', '#967a52', '#ae9266') } as Material,
  woodGrey: { ramp: H('#2a2824', '#3e3b35', '#55514a', '#6e6a60', '#86817a') } as Material,
  khaki: { ramp: H('#1e2212', '#30361c', '#464e2a', '#5e6838', '#76824a'), dither: true } as Material,
  rubber: { ramp: H('#070708', '#111114', '#1c1c20', '#2a2a30') } as Material,
  red: { ramp: H('#3a0808', '#6a1010', '#9a1a16', '#c42a20', '#e2443a') } as Material,
  leaf: { ramp: H('#0e1a0e', '#18291a', '#243c24', '#335230', '#46683e'), dither: true } as Material,
  soil: { ramp: H('#140e08', '#22180e', '#302214', '#3e2c1a') } as Material,
  bronze: { ramp: H('#14180f', '#232a1a', '#344028', '#4a5a38', '#647a4c'), spec: { color: hex('#b8c890'), power: 12, threshold: 0.82 } } as Material,
  glass: { ramp: H('#0c1418', '#14232a', '#1e3640', '#2c4e5a'), spec: { color: hex('#a8d8e8'), power: 6, threshold: 0.6 } } as Material,
  white: { ramp: H('#5e5c56', '#8a8780', '#b2aea4', '#d2cec4', '#e8e4da') } as Material,
  blanket: { ramp: H('#2a0e0c', '#46181a', '#622428', '#7e3236', '#9a4246') } as Material,
};

/** A five-pointed star as a flat polygon at height z (radius r, rotated by a). */
function star(x: number, y: number, z: number, r: number, col: string, group: string, a = -Math.PI / 2): Prim {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.42 : r;
    const t = a + (i * Math.PI) / 5;
    pts.push([x + Math.cos(t) * rr, y + Math.sin(t) * rr]);
  }
  return { k: 'poly', pts, z, mat: flat(col), group };
}

/** A slim Orthodox-style cross of gold on top of a dome, seen from above. */
function domeCross(p: Prim[], x: number, y: number, z: number, s: number) {
  p.push(cap([x, y - s, z], [x, y + s, z], 0.45, M.gold, 'cross'));
  p.push(cap([x - s * 0.55, y - s * 0.35, z + 0.2], [x + s * 0.55, y - s * 0.35, z + 0.2], 0.4, M.gold, 'cross'));
}

/** Onion-dome materials: plain, striped or chequered like the cathedral on the square. */
function onion(variant: number): Material {
  const v = variant % 6;
  const pairs: Array<[string, string]> = [
    ['#2a3a4a', '#2a3a4a'], // chapel slate
    ['#c8a034', '#c8a034'], // gold
    ['#2e7a46', '#e8d8a8'], // green / cream spiral
    ['#b8261c', '#e8e0d0'], // red / white spiral
    ['#2a58a8', '#e8c84a'], // blue / gold chequer
    ['#3a8a5a', '#c8261c'], // green / red chevrons
  ];
  const [a, b] = pairs[v]!;
  const ra = ramp(a);
  const rb = ramp(b);
  if (v <= 1) return { ramp: ra, spec: { color: hex(v === 1 ? '#fff4c0' : '#a0b0c0'), power: 10, threshold: 0.8 } };
  return {
    ramp: ra,
    pattern: (c) => {
      const ang = Math.atan2(c.y, c.x);
      const r = Math.hypot(c.x, c.y);
      const band = v === 4 ? (Math.floor(ang * 2.5 + 20) + Math.floor(r * 0.5)) % 2 : Math.floor(ang * 3 + r * 0.45 + 40) % 2;
      if (!band) return null;
      return c.nz > 0.75 ? rb[3]! : c.nz > 0.45 ? rb[2]! : rb[1]!;
    },
  };
}

/** Returns primitives for the props in this module, or null for an unknown type. */
export function propPrims3(type: string, w: number, h: number, variant = 0): Prim[] | null {
  const p: Prim[] = [];
  const hw = w / 2;
  const hh = h / 2;
  switch (type) {
    // ── shared ────────────────────────────────────────────────────────────
    case 'flagpole': {
      // the pole stands at the centre; the banner hangs out along +x
      p.push(cyl(0, 0, 1.6, 3, M.stone, 'foot', 0.4));
      p.push(cyl(0, 0, 0.8, 56, M.steel, 'pole', 0.2));
      p.push(ell([0, 0, 56.6], [1.2, 1.2, 1.2], M.gold, 'finial'));
      const cols = ['#b8201a', '#c0281e', '#a81c18'];
      const col = cols[variant % cols.length]!;
      const banner: Material = {
        ramp: ramp(col),
        pattern: (c) => {
          // a gentle wave and, on variant 0, a gold star in the upper corner
          if (variant % 3 === 0 && Math.hypot(c.x - 3.6, c.y + 1.2) < 1.4) return hex('#e8c040');
          if (variant % 3 === 1 && c.x > 10.2) return hex('#e8c040');
          return Math.sin(c.x * 0.9) * 0.6;
        },
      };
      // the banner seen from above: a strip waving in the wind
      for (let i = 0; i < 4; i++) p.push({ k: 'box', c: [2.4 + i * 3.4, Math.sin(i * 1.3) * 0.9, 50 - i * 0.6], h: [1.8, 1.5, 5.6], mat: banner, group: 'banner' + i, bevel: 0.3 });
      break;
    }
    // ── cemetery ──────────────────────────────────────────────────────────
    case 'grave': {
      // a headstone on a low plinth (its flowerbed in front, +y, is the separate floor prop grave_mound)
      const v = variant % 4;
      p.push(box([0, 0, 1.4], [w - 1, h - 1, 1.4], M.stone, 'plinth', 0.4));
      if (v === 0) {
        // a black granite stele with a gilt line
        p.push(box([0, -0.4, 15], [w - 3, 4.6, 13.6], { ...M.granite, pattern: (c) => (c.nz > 0.8 && Math.abs(c.lx) < 3.4 && Math.abs(c.ly) < 0.6 ? hex('#d8c078') : null) }, 'stone', 0.6));
      } else if (v === 1) {
        // a wrought-iron cross with a little roof
        p.push(cap([0, 0, 1], [0, 0, 15], 0.8, M.iron, 'post'));
        p.push(cap([-5.6, 0, 11], [5.6, 0, 11], 0.7, M.iron, 'bar'));
        p.push(box([0, 0, 15.6], [4, 2.6, 0.8], M.iron, 'roof', 0.3));
      } else if (v === 2) {
        // a small painted obelisk with a red star
        p.push(box([0, 0, 13], [6.4, 5.6, 11.6], solid('#4a5a6a'), 'obelisk', 0.5));
        p.push(box([0, 0, 15.4], [4, 3.6, 2.4], solid('#5a6a7a'), 'tip', 1.4));
        p.push(star(0, 0, 15.6, 2.6, '#c8261c', 'star'));
      } else {
        // a weathered wooden cross
        p.push(cap([0, 0, 1], [0, 0, 14], 0.9, M.woodGrey, 'post'));
        p.push(cap([-4.8, 0, 10.6], [4.8, 0, 10.6], 0.8, M.woodGrey, 'bar'));
      }
      break;
    }
    case 'grave_mound': {
      // the flowerbed of a grave: a stone curb round dark soil with flowers, a wreath or weeds
      const v = variant % 3;
      const soil: Material = {
        ...M.soil,
        pattern: (c) => {
          const n = noise2(Math.round(c.x * 2.2), Math.round(c.y * 2.2), 31 + v);
          if (v === 0 && n > 0.8) return hex(['#c8261c', '#e8dcc8', '#e0a830', '#b0182a'][Math.floor(noise2(Math.round(c.x), Math.round(c.y), 32) * 4)]!);
          if (v === 2 && n > 0.45) return hex(n > 0.75 ? '#3a5a2a' : '#2a4422');
          return null;
        },
      };
      if (v !== 2) p.push(box([0, 0, 1.6], [w - 1, h - 1, 1.6], M.stone, 'curb', 0.4));
      p.push(ell([0, 0, v === 2 ? 1.4 : 1.8], [hw - 2.4, hh - 2.4, v === 2 ? 1.8 : 1.4], soil, 'soil'));
      if (v === 1) {
        p.push(ell([0, -2, 3.2], [4.6, 4.6, 1.2], { ramp: H('#0e1a0e', '#1c321c', '#2a4a2a', '#3a5e36'), pattern: (c) => (Math.hypot(c.x, c.y + 2) < 2.2 ? hex('#140e08') : noise2(Math.round(c.x * 2), Math.round(c.y * 2), 33) > 0.72 ? hex('#c8261c') : null) }, 'wreath'));
        p.push(box([0, 2.8, 3.6], [3.6, 0.8, 0.3], flat('#b8261c'), 'ribbon', 0.1));
      }
      if (v === 0) p.push(cyl(3.6, -hh + 4, 1.2, 4, { ramp: H('#5a1410', '#9a2018', '#c8361c') }, 'lamp', 0.3));
      break;
    }
    case 'tomb': {
      // a granite slab with a tall headstone at the −y end and a wreath
      p.push(box([0, 2, 3.6], [w - 1, h - 6, 3.6], { ...M.granite, pattern: (c) => (c.nz > 0.8 && Math.abs(Math.abs(c.lx) - (hw - 3)) < 0.4 ? -1 : null) }, 'slab', 0.6));
      p.push(box([0, -hh + 3, 16], [w - 2, 5, 16], { ...(variant % 2 ? M.graniteRed : M.granite), pattern: (c) => (c.nz > 0.8 && Math.abs(c.lx) < 4 && Math.abs(c.ly) < 0.5 ? hex('#c8b070') : null) }, 'head', 0.6));
      p.push(ell([0, 6, 4.4], [4.4, 4.4, 1.2], { ramp: H('#0e1a0e', '#1c321c', '#2a4a2a'), pattern: (c) => (Math.hypot(c.x, c.y - 6) < 2 ? hex('#141008') : noise2(Math.round(c.x * 2), Math.round(c.y * 2), 4) > 0.75 ? hex('#c8261c') : null) }, 'wreath'));
      break;
    }
    case 'wreath': {
      p.push(ell([0, 0, 1.4], [hw - 1, hh - 1, 1.4], { ramp: H('#0e1a0e', '#1c321c', '#2a4a2a', '#3a5e36'), pattern: (c) => (Math.hypot(c.x, c.y) < hw * 0.45 ? hex('#100c08') : noise2(Math.round(c.x * 2), Math.round(c.y * 2), 5) > 0.7 ? hex(['#c8261c', '#e8d8c0'][Math.round(noise2(Math.round(c.x), Math.round(c.y), 6))]!) : null) }, 'wreath'));
      p.push(box([0, hh - 2.4, 2.6], [hw, 1.4, 0.4], flat('#b8261c'), 'ribbon', 0.1));
      break;
    }
    case 'mourner': {
      // a grieving figure in a long cloak on a low pedestal, old bronze gone green, the head bowed to +y
      p.push(box([0, 0, 2], [w - 1, h - 1, 2], M.stone, 'step', 0.5));
      p.push(box([0, 0, 8], [w - 5, h - 5, 6], { ...M.stone, pattern: (c) => (c.nz < 0.5 && Math.abs(c.z - 6) < 0.4 ? -1 : null) }, 'pedestal', 0.6));
      const fig = M.bronze;
      p.push(ell([0, -1.2, 19], [7.4, 8.4, 11], fig, 'cloak'));
      p.push(ell([0, 2.8, 27.4], [5, 4, 3.6], fig, 'shoulders'));
      p.push(ell([0, 5.4, 30.4], [2.6, 2.8, 2.8], fig, 'head'));
      p.push(ell([0, 8.2, 22], [2.2, 1.4, 1.8], { ramp: H('#4a0c0a', '#7a1410', '#a81c18') }, 'flowers'));
      break;
    }
    case 'memorial': {
      // a stepped granite base, an obelisk with a red star, an eternal flame in front (+y)
      p.push(box([0, 0, 2], [w - 1, h - 1, 2], M.granite, 'step1', 0.5));
      p.push(box([0, -2, 5], [w - 9, h - 13, 3], M.granite, 'step2', 0.5));
      p.push(box([0, -4, 30], [12, 12, 25], { ...M.granite, pattern: (c) => (c.nz < 0.5 && Math.abs(((c.z + 40) % 6) - 3) < 0.25 ? -1 : null) }, 'obelisk', 0.6));
      p.push(box([0, -4, 34], [8, 8, 4], M.granite, 'tip', 1.6));
      p.push(star(0, -4, 34.4, 3.6, '#c8261c', 'star'));
      p.push(cyl(0, hh - 6, 4.6, 6, M.iron, 'bowl', 0.6));
      p.push(star(0, hh - 6, 6.2, 4.2, '#d8a838', 'flamestar'));
      p.push(ell([0, hh - 6, 7.4], [2.4, 2.4, 2.2], { ramp: H('#ff8a24', '#ffd060'), flat: true }, 'flame'));
      break;
    }
    case 'dome':
    case 'dome_small': {
      // a dome or an onion on a drum, with a gold cross; variants: slate, gold, green, red, blue, green-red
      const r = hw - 1.5;
      p.push(cyl(0, 0, r * 0.82, 6, { ramp: ramp('#c8c0b0'), pattern: (c) => (Math.floor((Math.atan2(c.y, c.x) + 4) * 2.6) % 2 ? -1 : null) }, 'drum', 0.5));
      p.push(ell([0, 0, 6 + r * 0.55], [r, r, r * 0.95], onion(variant), 'dome'));
      p.push(ell([0, 0, 6 + r * 1.42], [r * 0.24, r * 0.24, r * 0.32], M.gold, 'tip'));
      domeCross(p, 0, 0, 6 + r * 1.78, Math.max(2.4, r * 0.32));
      break;
    }
    // ── Red Square ────────────────────────────────────────────────────────
    case 'spire': {
      // a tented tower roof: green tiles rising to a gold spire with a red star
      const steps = 7;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const s = (hw - 1) * (1 - t * 0.86);
        p.push(box([0, 0, 4 + i * 5.2], [s * 2, s * 2, 5.4], { ramp: H('#0e2a1c', '#164030', '#205840', '#2e7252', '#3e8a64'), pattern: (c) => (Math.abs(((c.lx + c.ly + 40) % 3) - 1.5) < 0.2 ? -1 : null) }, 'tier' + i, 0.6));
      }
      p.push(cyl(0, 0, 1.2, 46, M.gold, 'spire', 0.3));
      p.push(star(0, 0, 46.4, 6.2, '#d8262a', 'star'));
      p.push(star(0, 0, 46.6, 3.2, '#ff7060', 'starglow'));
      break;
    }
    case 'btr': {
      // an eight-wheeled armoured personnel carrier, the nose at −y
      const hull: Material = { ...M.khaki, pattern: (c) => (c.nz > 0.8 && Math.abs(c.lx) < 3.6 && Math.abs(c.ly - 8) < 3 ? hex('#1e2212') : noise2(Math.round(c.x), Math.round(c.y), 12) > 0.9 ? -1 : null) };
      for (const s of [-1, 1]) for (const y of [-30, -14, 10, 28]) p.push(cyl(s * (hw - 3.2), y, 4.4, 9.2, M.rubber, `w${s}${y}`, 0.6));
      p.push(box([0, 2, 16], [w - 6, h - 4, 11], hull, 'hull', 2.4));
      p.push(box([0, -hh + 6, 14], [w - 12, 8, 4], hull, 'nose', 2));
      p.push(cyl(0, 4, 7, 20.4, M.khaki, 'turret', 1.2));
      p.push(cap([0, -2, 19.6], [0, -24, 19.6], 1.1, M.steel, 'gun'));
      p.push(box([-hw + 7, -hh + 15, 16.4], [5, 4, 0.6], M.glass, 'vision1', 0.2));
      p.push(box([hw - 7, -hh + 15, 16.4], [5, 4, 0.6], M.glass, 'vision2', 0.2));
      p.push(star(-hw + 7, 16, 16.4, 3.2, '#c8261c', 'star'));
      break;
    }
    case 'hedgehog': {
      // a Czech hedgehog: three steel beams welded crosswise
      const beam = M.steel;
      p.push(cap([-hw + 1.5, -hh + 1.5, 1], [hw - 1.5, hh - 1.5, 14], 1.4, beam, 'b1'));
      p.push(cap([hw - 1.5, -hh + 1.5, 1], [-hw + 1.5, hh - 1.5, 14], 1.4, beam, 'b2'));
      p.push(cap([0, -hh + 1, 13], [0, hh - 1, 1], 1.4, beam, 'b3'));
      break;
    }
    case 'barrier': {
      // a crowd-control barrier: two feet and a railing
      p.push(cap([-hw + 1, 0, 9], [hw - 1, 0, 9], 0.8, M.steel, 'rail'));
      p.push(cap([-hw + 1, 0, 3], [hw - 1, 0, 3], 0.6, M.steel, 'rail2'));
      for (let x = -hw + 4; x < hw - 2; x += 4) p.push(cap([x, 0, 3], [x, 0, 9], 0.35, M.steel, 'bar' + x));
      for (const s of [-1, 1]) p.push(box([s * (hw - 1.6), 0, 1], [2, h - 0.5, 1], M.steel, 'foot' + s, 0.2));
      p.push(box([0, 0, 9.8], [w * 0.4, 0.6, 1.6], flat('#c8261c'), 'sign', 0.1));
      break;
    }
    // ── pioneer camp ──────────────────────────────────────────────────────
    case 'campfire': {
      // a ring of stones, crossed logs and the fire (the light is placed by the map)
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        p.push(ell([Math.cos(a) * (hw - 4), Math.sin(a) * (hh - 4), 1.4], [2.6, 2.2, 1.8], M.stone, 'stone' + i, a));
      }
      p.push(ell([0, 0, 0.4], [hw - 6, hh - 6, 0.6], { ramp: H('#140c08', '#2a1810', '#3e2414') }, 'ash'));
      for (const a of [0.3, 1.4, 2.5]) p.push(cap([Math.cos(a) * 7, Math.sin(a) * 7, 1.6], [-Math.cos(a) * 7, -Math.sin(a) * 7, 3.4], 1.4, M.wood, 'log' + a));
      p.push(ell([0, 0, 4], [4.6, 4.6, 4.2], { ramp: H('#c83a14', '#ff8a24', '#ffc040', '#fff0a0'), pattern: (c) => (Math.hypot(c.x, c.y) < 2 ? hex('#fff6c8') : null) }, 'fire'));
      for (const a of [0.9, 2.4, 4.1, 5.5]) p.push(ell([Math.cos(a) * 3.4, Math.sin(a) * 3.4, 3], [1.6, 1.6, 2.4], { ramp: H('#e04a14', '#ffa030'), flat: true }, 'tongue' + a));
      break;
    }
    case 'watchtower': {
      // four legs with braces, a plank platform, a pitched roof (the lamp on it is the map's light)
      const leg = M.woodGrey;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) p.push(cap([sx * (hw - 3), sy * (hh - 3), 0], [sx * (hw - 6), sy * (hh - 6), 40], 1.2, leg, `leg${sx}${sy}`));
      for (const sx of [-1, 1]) p.push(cap([sx * (hw - 4), -hh + 4, 10], [sx * (hw - 5), hh - 4, 30], 0.6, leg, 'brace' + sx));
      p.push(box([0, 0, 42], [w - 8, h - 8, 3], { ...M.wood, pattern: (c) => (Math.abs(((c.lx + 40) % 3) - 1.5) < 0.25 ? -1 : null) }, 'deck', 0.4));
      for (const s of [-1, 1]) p.push(box([0, s * (hh - 5), 47], [w - 8, 1.2, 5], M.wood, 'rail' + s, 0.2));
      p.push(box([-hw / 4 + 0.5, 0, 56], [hw - 3, h - 4, 4], { ramp: H('#2a1810', '#422618', '#5e3a22', '#7a4e2e'), pattern: (c) => (Math.abs(((c.ly + 40) % 2.4) - 1.2) < 0.2 ? -1 : null) }, 'roofL', 0.8));
      p.push(box([hw / 4 - 0.5, 0, 58], [hw - 3, h - 4, 4], { ramp: H('#2a1810', '#422618', '#5e3a22', '#7a4e2e', '#946036') }, 'roofR', 0.8));
      p.push(star(0, 0, 60.4, 3.4, '#c8261c', 'star'));
      break;
    }
    case 'goal': {
      // a football goal: white posts and crossbar, the net behind (−x)
      const post: Material = { ramp: H('#8a8780', '#b2aea4', '#d8d4ca', '#f2eee4') };
      for (const s of [-1, 1]) p.push(cyl(hw - 1.4, s * (hh - 1.4), 1.1, 18, post, 'post' + s, 0.3));
      p.push(cap([hw - 1.4, -hh + 1.4, 18], [hw - 1.4, hh - 1.4, 18], 1, post, 'bar'));
      p.push(box([-1, 0, 16], [w - 4, h - 3, 0.4], { ramp: H('#6a6a64', '#9a9a92'), pattern: (c) => ((Math.floor((c.x + 40) * 1.2) + Math.floor((c.y + 40) * 1.2)) % 2 ? null : hex('#3a3a36')) }, 'net', 0.1));
      break;
    }
    case 'boat': {
      // a wooden rowing boat, the bow at −y, oars along the sides
      const hull: Material = { ramp: ramp(['#5a6e7e', '#7a4a2a', '#4a6a3a'][variant % 3]!), pattern: (c) => (c.nz > 0.85 ? null : Math.abs(((c.z + 40) % 2.2) - 1.1) < 0.2 ? -1 : null) };
      p.push(ell([0, 2, 4], [hw - 1, hh - 3, 4.4], hull, 'hull'));
      p.push(ell([0, -hh + 6, 4], [hw - 4, 6, 4], hull, 'bow'));
      p.push(ell([0, 2, 6.6], [hw - 3.4, hh - 6, 2.2], { ramp: H('#1e140c', '#2e2016', '#3e2c1e') }, 'inside'));
      for (const y of [-6, 4, 14]) p.push(box([0, y, 6.4], [w - 5, 2.2, 1], M.woodPale, 'thwart' + y, 0.2));
      for (const s of [-1, 1]) p.push(cap([s * (hw - 2), -6, 7.4], [s * (hw - 2.6), 18, 7.2], 0.5, M.woodPale, 'oar' + s));
      break;
    }
    case 'bunk_bed': {
      // a two-tier pioneer bed seen from above: the top bunk with a blanket and a pillow
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) p.push(cyl(sx * (hw - 1.2), sy * (hh - 1.2), 0.8, 20, M.iron, `post${sx}${sy}`, 0.2));
      p.push(box([0, 0, 18], [w - 2, h - 2, 3], { ramp: ramp('#d8d4c8') }, 'mattress', 0.8));
      p.push(box([0, 3, 19.6], [w - 3, h - 10, 1.6], { ...M.blanket, pattern: (c) => (Math.abs(c.ly + 6) < 0.6 || Math.abs(c.ly - 10) < 0.6 ? hex('#e8e0d0') : null) }, 'blanket', 0.6));
      p.push(box([0, -hh + 4, 20], [w - 6, 5, 2.2], M.white, 'pillow', 1));
      break;
    }
    case 'long_table': {
      // a dining-hall table with plates and a bench along each long side
      p.push(box([0, 0, 13], [w - 2, h - 12, 2], { ramp: H('#5e5c56', '#8a8780', '#b2aea4', '#d2cec4'), pattern: (c) => (c.nz > 0.8 && Math.abs(c.ly) < 2 && Math.abs(((c.lx + 80) % 12) - 6) < 0.3 ? -1 : null) }, 'top', 0.6));
      for (const s of [-1, 1]) for (const x of [-hw + 5, hw - 5]) p.push(box([x, s * 2.6, 11], [2, 2, 11], M.iron, `leg${s}${x}`, 0.2));
      for (let x = -hw + 7; x < hw - 4; x += 9) {
        for (const s of [-1, 1]) {
          p.push(cyl(x, s * 3.4, 1.9, 14.4, M.white, `plate${x}${s}`, 0.3, 13));
          p.push(cyl(x + 3.4, s * 4.6, 0.9, 16, { ramp: H('#6a6a64', '#9a9a92', '#c8c8c0') }, `cup${x}${s}`, 0.2, 13));
        }
      }
      for (const s of [-1, 1]) p.push(box([0, s * (hh - 2.4), 7], [w - 4, 4, 2], M.woodPale, 'bench' + s, 0.4));
      break;
    }
    case 'bugler': {
      // a white plaster pioneer blowing a bugle (or beating a drum) on a pedestal
      p.push(box([0, 0, 2.4], [w - 1, h - 1, 2.4], M.stone, 'step', 0.5));
      p.push(box([0, 0, 15], [w - 7, h - 7, 12.6], M.plaster, 'pedestal', 0.6));
      const fig = M.plaster;
      p.push(ell([0, 0.8, 24], [4.6, 3.8, 8.6], fig, 'body'));
      p.push(ell([0, 0, 35.2], [2.6, 2.6, 2.8], fig, 'head'));
      p.push(ell([0, -1.6, 32], [3.6, 2, 1.4], { ramp: H('#7a1410', '#a81c18', '#c8261c') }, 'tie'));
      if (variant % 2 === 0) {
        // the bugle raised to the lips, the other hand on the hip
        p.push(cap([2.2, -1.6, 32.6], [6.4, -9.6, 36.6], 1.1, fig, 'arm'));
        p.push(cap([0.4, -2.8, 35], [6.6, -11.4, 38], 0.6, M.gold, 'bugle', 1.8));
        p.push(cap([-3.4, 0.6, 30], [-5.6, 2.4, 25.4], 1.1, fig, 'arm2'));
      } else {
        // a drum on a strap, both sticks raised
        p.push(cyl(0, -4.6, 3.6, 25, { ramp: H('#7a1410', '#a81c18', '#c8261c', '#e8e0d0'), pattern: (c) => (c.nz > 0.8 ? hex('#ece6da') : null) }, 'drum', 0.5, 20));
        for (const s of [-1, 1]) p.push(cap([s * 3.4, -2, 30], [s * 3, -8, 33], 1, fig, 'arm' + s));
      }
      break;
    }
    case 'rock': {
      const v = variant % 3;
      const mat: Material = { ramp: H('#1c1e20', '#2c2f32', '#404448', '#575c60', '#6e7478'), dither: true, pattern: (c) => (noise2(Math.round(c.x * 1.5), Math.round(c.y * 1.5), 21 + v) > 0.84 ? hex('#33402a') : null) };
      p.push(ell([v === 1 ? 2 : 0, 0, 5], [hw - 2, hh - 2, 7], mat, 'rock'));
      p.push(ell([v === 2 ? -6 : -5, v === 0 ? 4 : -3, 4], [hw * 0.5, hh * 0.55, 6], mat, 'rock2'));
      break;
    }
    default:
      return null;
  }
  return p;
}

export const PROP_VARIANTS3: Record<string, number> = {
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
