/**
 * Top-down prop models. Every prop is modelled at its rotation-0 footprint from PROP_DEFS
 * (packages/shared/src/maps/props.ts) so that art and collision always agree.
 */
import { hex, noise2 } from './lib/raster.js';
import type { RGBA } from './lib/raster.js';
import type { Material, Prim, V3, PatternCtx } from './lib/model.js';
import { MAT } from './characters.js';
import { propPrims2, PROP_VARIANTS2 } from './props2.js';

export const H = (...c: string[]): RGBA[] => c.map((x) => hex(x));

export const box = (c: V3, size: V3, mat: Material, group?: string, bevel = 0.6, yaw = 0): Prim => ({ k: 'box', c: [c[0], c[1], c[2] - size[2] / 2], h: [size[0] / 2, size[1] / 2, size[2] / 2], mat, group, bevel, yaw });
export const cyl = (x: number, y: number, r: number, z1: number, mat: Material, group?: string, bevel = 0.8): Prim => ({ k: 'cyl', c: [x, y, 0], r, z0: 0, z1, mat, group, bevel });
export const cap = (a: V3, b: V3, r: number, mat: Material, group?: string, r2?: number): Prim => ({ k: 'cap', a, b, r, r2, mat, group });
export const ell = (c: V3, r: V3, mat: Material, group?: string, yaw = 0): Prim => ({ k: 'ell', c, r, mat, group, yaw });

export const M = {
  wood: { ramp: H('#2c1c10', '#46301c', '#624428', '#7e5a36', '#987048'), pattern: (c: PatternCtx) => (Math.abs((c.lx * 2 + 40) % 8) < 0.9 ? -1.2 : (noise2(c.u, c.v, 3) - 0.5) * 0.8) } as Material,
  woodPale: { ramp: H('#3a2c1c', '#5a462e', '#7a6040', '#967a52') } as Material,
  green: { ramp: H('#161e16', '#243022', '#344632', '#4a5e44', '#627a58') } as Material,
  olive: { ramp: H('#22260f', '#363d1a', '#4c5626', '#646f34') } as Material,
  steel: { ramp: H('#1c1f24', '#2e333a', '#454b54', '#626a74', '#858d98'), spec: { color: hex('#c4ccd8'), power: 14, threshold: 0.86 } } as Material,
  steelDark: { ramp: H('#101215', '#1b1e23', '#2a2e35', '#3c414a') } as Material,
  rust: { ramp: H('#2a160b', '#46240f', '#663616', '#86481e', '#a05c28'), dither: true, pattern: (c: PatternCtx) => (noise2(c.u >> 1, c.v >> 1, 9) > 0.86 ? -1 : null) } as Material,
  red: { ramp: H('#320b0b', '#5a1412', '#821e16', '#a82c1c', '#c8442a') } as Material,
  blue: { ramp: H('#0c1626', '#16263e', '#22385a', '#304c78', '#446494') } as Material,
  yellow: { ramp: H('#4a3606', '#7a5a0c', '#ad8414', '#d6a826', '#f0c848') } as Material,
  black: { ramp: H('#060607', '#0f1012', '#1a1b1e', '#28292e') } as Material,
  rubber: { ramp: H('#070708', '#111114', '#1c1c20', '#2a2a30') } as Material,
  concrete: { ramp: H('#2c2b29', '#41403c', '#57554f', '#6e6b63', '#86827a'), dither: true } as Material,
  glass: { ramp: H('#0c1418', '#14232a', '#1e3640', '#2c4e5a'), spec: { color: hex('#a8d8e8'), power: 6, threshold: 0.6 } } as Material,
  khaki: { ramp: H('#2a2a18', '#424226', '#5c5c36', '#787848', '#90905a') } as Material,
  canvas: { ramp: H('#2e2c1c', '#47442c', '#615d3e', '#7c7650'), pattern: (c: PatternCtx) => (Math.abs(((c.lx + 100) % 6) - 3) < 0.4 ? -0.8 : null) } as Material,
  paper: { ramp: H('#8a8478', '#b8b2a4', '#ddd8cc'), flat: true } as Material,
  leaf: { ramp: H('#0e1a0e', '#18291a', '#243c24', '#335230', '#46683e'), dither: true } as Material,
  brass: { ramp: H('#3e2c0c', '#6a4c14', '#987022', '#c09434') } as Material,
  hazard: { ramp: H('#c09418'), flat: true, pattern: (c: PatternCtx) => (Math.floor((c.u + c.v) / 6) % 2 ? hex('#141414') : null) } as Material,
  white: { ramp: H('#6a6862', '#9a978e', '#c4c0b6', '#e0ddd4') } as Material,
  sand: { ramp: H('#5a4a30', '#7a6644', '#9a845a', '#b4a070'), dither: true } as Material,
};

const DOOR_COLORS = ['#3a5a3a', '#34506e', '#6e3a24', '#5a5a52', '#6e5a24'];
const CAR_COLORS = ['#b8ac88', '#7a2420', '#3c5a74', '#d4d0c4', '#4a5a3a'];
const CONTAINER_COLORS = ['#7a3220', '#2c4a6e', '#3a5a3a', '#6a6a62'];

export function ridged(base: string, axis: 'x' | 'y', period = 3): Material {
  const r = rampFrom(base);
  return { ramp: r, pattern: (c) => (Math.floor(((axis === 'x' ? c.lx : c.ly) + 200) * (2 / period)) % 2 ? -1 : 0.3) };
}

export function rampFrom(base: string): RGBA[] {
  const b = hex(base);
  return [0.42, 0.62, 0.82, 1.0, 1.18].map((f) => [Math.min(255, b[0] * f), Math.min(255, b[1] * f), Math.min(255, b[2] * f), 255] as RGBA);
}

/** Returns primitives for a prop at rotation 0, centred on the origin. */
export function propPrims(type: string, w: number, h: number, variant = 0): Prim[] {
  const p: Prim[] = [];
  const hw = w / 2;
  const hh = h / 2;
  switch (type) {
    case 'crate_wood': {
      p.push(box([0, 0, 9], [w - 1, h - 1, 9], { ...M.wood, pattern: (c) => (Math.abs(Math.abs(c.lx) - (w - 1) / 2) < 1 || Math.abs(Math.abs(c.ly) - (h - 1) / 2) < 1 ? 1 : M.wood.pattern!(c)) }, 'c'));
      p.push(box([0, 0, 9.4], [w - 4, 1.4, 0.5], M.woodPale, 'b', 0.3, Math.PI / 4));
      break;
    }
    case 'crate_stack': {
      const q = w / 4;
      for (const [x, y, z] of [
        [-q, -q, 14],
        [q, -q, 14],
        [-q, q, 14],
        [q, q, 7],
      ] as const)
        p.push(box([x, y, z], [w / 2 - 1, h / 2 - 1, z], { ...M.wood, pattern: (c) => (Math.abs(Math.abs(c.lx) - (w / 2 - 1) / 2) < 1 || Math.abs(Math.abs(c.ly) - (h / 2 - 1) / 2) < 1 ? 1 : M.wood.pattern!(c)) }, `c${x}${y}`));
      break;
    }
    case 'crate_green':
      p.push(box([0, 0, 8], [w - 1, h - 1, 8], { ...M.olive, pattern: (c) => (Math.abs(c.lx) < 0.7 ? -1 : Math.abs(Math.abs(c.ly) - 4) < 0.5 ? hex('#c8b468') : null) }, 'c'));
      p.push(box([-hw + 3, 0, 8.6], [2, h - 3, 0.6], M.steelDark, 'h'));
      p.push(box([hw - 3, 0, 8.6], [2, h - 3, 0.6], M.steelDark, 'h2'));
      break;
    case 'barrel_red':
    case 'barrel_blue':
    case 'barrel_rust': {
      const mat = type === 'barrel_red' ? M.red : type === 'barrel_blue' ? M.blue : M.rust;
      const r = w / 2 - 0.5;
      p.push(cyl(0, 0, r, 13, { ...mat, pattern: (c) => (c.t > 0.86 ? 0.9 : c.t > 0.74 && c.t < 0.8 ? -1 : null) }, 'b', 1.2));
      p.push(cyl(-r * 0.4, -r * 0.35, 1.1, 13.4, M.steelDark, 'cap1', 0.3));
      p.push(cyl(r * 0.45, r * 0.3, 0.8, 13.4, M.steelDark, 'cap2', 0.3));
      break;
    }
    case 'pallet':
      for (let i = 0; i < 5; i++) p.push(box([-hw + 3 + i * ((w - 6) / 4), 0, 2], [3.2, h - 1, 2], M.woodPale, 'p' + i, 0.3));
      p.push(box([0, -hh + 2.5, 1.2], [w - 1, 3, 1.2], M.wood, 'r1', 0.3));
      p.push(box([0, hh - 2.5, 1.2], [w - 1, 3, 1.2], M.wood, 'r2', 0.3));
      break;
    case 'sandbags':
      for (let i = 0; i < 5; i++) {
        p.push(ell([-hw + 4 + i * ((w - 8) / 4), -2, 4.5], [4.6, 3.6, 4], { ...M.sand, ramp: H('#3e3826', '#5a5236', '#786e4a', '#948860') }, 'a' + i));
        p.push(ell([-hw + 6 + i * ((w - 8) / 4), 2.5, 5], [4.4, 3.4, 4.2], { ...M.sand, ramp: H('#3e3826', '#5a5236', '#786e4a', '#948860') }, 'b' + i));
      }
      break;
    case 'forklift': {
      p.push(box([0, 4, 10], [w - 2, h * 0.62, 10], { ...M.yellow, pattern: (c) => (c.ly > h * 0.25 ? hex('#141414') : null) }, 'body'));
      p.push(box([0, h * 0.18, 22], [w - 4, h * 0.36, 1.2], { ramp: H('#0e0e10', '#1e1e22', '#2e2e34') }, 'roof', 0.4));
      for (const s of [-1, 1]) p.push(box([s * (w / 2 - 2), h * 0.18, 21], [1.6, h * 0.36, 1], M.steelDark, 'post' + s));
      p.push(box([0, -h * 0.28, 15], [w - 3, 2.4, 15], M.steelDark, 'mast'));
      for (const s of [-1, 1]) p.push(box([s * 5, -h * 0.4, 2], [2.4, h * 0.3, 1.4], M.steel, 'fork' + s, 0.3));
      p.push(box([0, h * 0.42, 9], [w - 1, 3, 9], { ramp: H('#2a2a2a', '#3c3c3c', '#505050') }, 'cw'));
      break;
    }
    case 'truck': {
      // cab (front = -y) + tarp cargo
      const cabL = h * 0.27;
      p.push(box([0, -hh + cabL / 2 + 1, 18], [w - 2, cabL, 18], { ramp: rampFrom('#3e6a52'), pattern: (c) => (c.ly < -cabL / 2 + 4 ? hex('#16232a') : null) }, 'cab'));
      p.push(box([0, -hh + 2.5, 10], [w - 8, 3, 9], { ramp: H('#1a1a1a', '#2c2c2c', '#3e3e3e') }, 'bumper', 0.4));
      p.push(box([0, cabL / 2 + 1, 22], [w - 1, h - cabL - 2, 22], { ...M.canvas, pattern: (c) => (Math.abs(((c.ly + 200) % 18) - 9) < 0.9 ? -1.2 : null) }, 'tarp', 2.2));
      for (const s of [-1, 1]) p.push(box([s * (w / 2 - 0.5), -hh + cabL + 6, 4], [1.6, 9, 4], M.rubber, 'wheel' + s));
      break;
    }
    case 'machine_lathe':
      p.push(box([0, 0, 12], [w - 1, h - 2, 12], { ramp: rampFrom('#4a5a56'), pattern: (c) => (Math.abs(c.ly) > (h - 2) / 2 - 1.4 ? M.hazard.pattern!(c) : null) }, 'body'));
      p.push(cap([-hw + 4, 0, 14], [hw - 6, 0, 14], 2.6, M.steel, 'spindle'));
      p.push(box([-hw + 6, -3, 16], [8, 6, 4], { ramp: rampFrom('#3a4644') }, 'head'));
      p.push(ell([hw - 4, h / 2 - 4, 13.4], [1.2, 1.2, 0.8], { ramp: H('#ff3030'), flat: true }, 'btn'));
      break;
    case 'machine_press':
      p.push(box([0, 0, 16], [w - 1, h - 1, 16], { ramp: rampFrom('#5a6a42'), pattern: (c) => (Math.abs(c.lx) > (w - 1) / 2 - 1.5 || Math.abs(c.ly) > (h - 1) / 2 - 1.5 ? M.hazard.pattern!(c) : null) }, 'base'));
      p.push(box([0, 0, 28], [w - 8, h - 8, 12], { ramp: rampFrom('#4a5838') }, 'ram'));
      p.push(cyl(0, 0, 4.5, 30, M.steel, 'piston'));
      break;
    case 'tank_vertical': {
      const r = w / 2 - 0.5;
      p.push(cyl(0, 0, r, 30, { ramp: rampFrom('#6a6e70'), pattern: (c) => (Math.abs(c.t - 0.6) < 0.04 || c.t > 0.93 ? -1 : (noise2(c.u, c.v, 5) > 0.93 ? -0.8 : null)) }, 't', 2));
      p.push(cyl(r * 0.3, -r * 0.2, 3, 31.5, M.steelDark, 'hatch'));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        p.push(ell([Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, 30.2], [0.6, 0.6, 0.4], M.steel, 'bolt' + i));
      }
      break;
    }
    case 'tank_horizontal':
      p.push(cap([0, -hh + hw, 13], [0, hh - hw, 13], hw - 0.5, { ramp: rampFrom('#5e6466'), pattern: (c) => (Math.abs(((c.t * h + 100) % 16) - 8) < 0.6 ? -1 : null) }, 't'));
      for (const y of [-hh + 10, hh - 10]) p.push(box([0, y, 4], [w + 1, 3, 4], M.steelDark, 'leg' + y));
      break;
    case 'turbine': {
      const r = w / 2 - 1;
      p.push(cyl(0, 0, r, 22, { ramp: rampFrom('#5c5a50'), pattern: (c) => (c.t > 0.9 ? -1 : c.t > 0.84 ? 1 : noise2(c.u >> 1, c.v >> 1, 2) > 0.9 ? -0.8 : null) }, 'ring', 3));
      p.push(cyl(0, 0, r * 0.78, 23, { ramp: H('#0c0c0e', '#16171a', '#22242a'), pattern: (c) => (Math.floor(((c.s + Math.PI) / (Math.PI * 2)) * 16) % 2 ? 1.6 : null) }, 'fan', 1));
      p.push(cyl(0, 0, r * 0.22, 26, { ramp: rampFrom('#8a7a3a') }, 'hub', 1.4));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        p.push(ell([Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, 22.4], [0.8, 0.8, 0.5], M.steel, 'bolt' + i));
      }
      break;
    }
    case 'locker_row':
      p.push(box([0, 0, 20], [w - 0.5, h - 1, 20], { ramp: rampFrom('#4c5c66'), pattern: (c) => (Math.abs(((c.lx + 200) % 8.6) - 4.3) < 0.35 ? -1.4 : Math.abs(c.ly - (h - 1) / 2 + 1.2) < 0.4 ? -1 : null) }, 'l'));
      break;
    case 'desk':
      p.push(box([0, 0, 9], [w - 1, h - 1, 9], M.wood, 'top', 0.4));
      p.push(box([-4, -1, 9.3], [7, 5, 0.3], M.paper, 'paper', 0.1, 0.2));
      p.push(box([6, 2, 9.3], [5, 4, 0.3], M.paper, 'paper2', 0.1, -0.3));
      p.push(box([hw - 5, -hh + 4, 10.5], [4, 3, 1.5], M.black, 'phone', 0.5));
      p.push(cyl(-hw + 4, -hh + 4, 1.8, 13, { ramp: rampFrom('#3a5a3a') }, 'lamp', 0.6));
      break;
    case 'chair':
      p.push(box([0, 0, 6], [w - 1, h - 1, 1.2], M.wood, 's', 0.4));
      p.push(box([-hw + 1, 0, 10], [1.4, h - 1, 4], M.wood, 'back', 0.3));
      break;
    case 'file_cabinet':
      p.push(box([0, 0, 16], [w - 1, h - 1, 16], { ramp: rampFrom('#5a6458'), pattern: (c) => (Math.abs(c.ly + (h - 1) / 2 - 0.8) < 0.5 ? -1 : null) }, 'f'));
      break;
    case 'plant_pot':
      p.push(cyl(0, 0, 4, 6, { ramp: rampFrom('#7a4a2a') }, 'pot'));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.3;
        p.push(ell([Math.cos(a) * 3.6, Math.sin(a) * 3.6, 10], [3.4, 1.8, 1.4], M.leaf, 'leaf' + i, a));
      }
      p.push(ell([0, 0, 11], [2.6, 2.6, 2], M.leaf, 'top'));
      break;
    case 'turnstile':
      p.push(cyl(0, -hh + 4, 3.2, 10, M.steel, 'post'));
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
        p.push(cap([0, -hh + 4, 9], [Math.cos(a) * 9, -hh + 4 + Math.sin(a) * 9, 9], 0.8, M.steel, 'arm' + i));
      }
      p.push(box([0, 4, 9], [w - 1, h - 9, 9], { ramp: rampFrom('#6a6c6e') }, 'cab'));
      break;
    case 'boom_barrier':
      p.push(box([-hw + 4, 0, 9], [7, 6, 9], { ramp: rampFrom('#5a5a58') }, 'base'));
      p.push(cap([-hw + 6, 0, 11], [hw - 1, 0, 11], 1.4, { ramp: H('#7a1010', '#b01818', '#d82a22'), pattern: (c) => (Math.floor(c.t * 9) % 2 ? hex('#e4e0d8') : null) }, 'bar'));
      break;
    case 'conveyor':
      p.push(box([0, 0, 8], [w, h - 1, 8], { ramp: H('#16171a', '#24262b', '#33363d', '#454950'), pattern: (c) => (Math.abs(c.ly) < (h - 1) / 2 - 2.2 ? (Math.floor((c.lx + 200) * 0.7) % 2 ? -1 : 0.6) : null) }, 'belt'));
      for (const s of [-1, 1]) p.push(box([0, s * (h / 2 - 1), 9.2], [w, 1.6, 1.2], M.yellow, 'rail' + s, 0.3));
      break;
    case 'electric_box':
      p.push(box([0, 0, 18], [w - 1, h - 1, 18], { ramp: rampFrom('#5c6268') }, 'b'));
      p.push({ k: 'poly', pts: [[-2, 1.5], [2, 1.5], [0, -2]], z: 18.2, mat: { ramp: H('#e0b020'), flat: true }, group: 'sign' });
      break;
    case 'cable_reel': {
      const r = w / 2 - 0.5;
      p.push(cyl(0, 0, r, 12, { ...M.woodPale, pattern: (c) => (c.t > 0.55 && c.t < 0.85 ? hex('#1a1a1c') : null) }, 'r'));
      p.push(cyl(0, 0, 1.8, 12.6, M.steelDark, 'hub'));
      break;
    }
    case 'tire_stack': {
      const r = w / 2 - 0.5;
      p.push(cyl(0, 0, r, 10, { ...M.rubber, pattern: (c) => (c.t < 0.45 ? hex('#050506') : Math.floor((c.s + 4) * 6) % 2 ? 0.8 : null) }, 't', 2));
      break;
    }
    case 'workbench':
      p.push(box([0, 0, 10], [w - 1, h - 1, 10], M.wood, 'top', 0.4));
      p.push(box([hw - 5, 0, 12], [5, 4, 2], M.steel, 'vise'));
      p.push(cap([-6, -2, 10.6], [0, 1, 10.6], 0.7, MAT.redPaint, 'tool'));
      p.push(cap([-hw + 3, 2, 10.6], [-hw + 9, 2, 10.6], 0.6, M.steel, 'tool2'));
      break;
    case 'scrap_pile':
      for (let i = 0; i < 9; i++) {
        const x = (noise2(i, 1, 4) - 0.5) * (w - 8);
        const y = (noise2(i, 2, 4) - 0.5) * (h - 8);
        const mat = i % 3 === 0 ? M.rust : i % 3 === 1 ? M.steel : M.steelDark;
        if (i % 2) p.push(box([x, y, 4 + (i % 4) * 2], [5 + (i % 3) * 3, 3 + (i % 2) * 2, 4], mat, 's' + i, 0.4, noise2(i, 3, 4) * 3));
        else p.push(cap([x - 3, y, 3], [x + 4, y + 2, 5], 1.4 + (i % 3) * 0.5, mat, 's' + i));
      }
      break;
    case 'container': {
      const col = CONTAINER_COLORS[variant % CONTAINER_COLORS.length]!;
      p.push(box([0, 0, 26], [w, h, 26], ridged(col, 'y', 3.2), 'c', 1.4));
      for (const [x, y] of [
        [-hw + 1.5, -hh + 1.5],
        [hw - 1.5, -hh + 1.5],
        [-hw + 1.5, hh - 1.5],
        [hw - 1.5, hh - 1.5],
      ] as const)
        p.push(box([x, y, 26.6], [3, 3, 1], M.steelDark, `k${x}${y}`, 0.3));
      break;
    }
    case 'car_zhiguli':
    case 'car_volga':
    case 'car_wreck': {
      const wreck = type === 'car_wreck';
      const col = wreck ? '#5a3a24' : type === 'car_volga' ? ['#1c1c20', '#d8d4c8', '#3a4a5a', '#2a3a2a'][variant % 4]! : CAR_COLORS[variant % CAR_COLORS.length]!;
      const bodyMat: Material = wreck ? { ...M.rust, ramp: rampFrom(col) } : { ramp: rampFrom(col), spec: { color: hex('#f0f0f0'), power: 20, threshold: 0.9 } };
      // body (front = -y)
      p.push(box([0, 0, 9], [w - 1, h - 1, 9], { ...bodyMat, pattern: (c) => (Math.abs(c.lx) < 0.4 && c.ly < -h * 0.2 ? -1 : null) }, 'body', 3));
      // cabin with glass
      const cabin: Material = wreck ? { ramp: H('#0a0806', '#14100c', '#1e1812') } : M.glass;
      p.push(box([0, h * 0.04, 13], [w - 6, h * 0.46, 4], cabin, 'glass', 2));
      p.push(box([0, h * 0.06, 14.4], [w - 9, h * 0.28, 1.2], { ...bodyMat }, 'roof', 1.6));
      if (!wreck) {
        for (const s of [-1, 1]) {
          p.push(box([s * (hw - 4), -hh + 1.2, 8], [4, 1.4, 1.4], { ramp: H('#e8e0b0'), flat: true }, 'hl' + s, 0.2));
          p.push(box([s * (hw - 4), hh - 1.2, 8], [4, 1.4, 1.4], { ramp: H('#a01818'), flat: true }, 'tl' + s, 0.2));
        }
      }
      for (const s of [-1, 1]) for (const yy of [-h * 0.3, h * 0.3]) p.push(box([s * (hw - 0.2), yy, 3], [1.4, 8, 3], M.rubber, `w${s}${yy}`, 0.4));
      break;
    }
    case 'bus_paz':
      p.push(box([0, 0, 24], [w - 1, h - 1, 24], { ramp: rampFrom('#b8a46a'), pattern: (c) => (Math.abs(Math.abs(c.lx) - (w - 1) / 2 + 3) < 1.2 ? hex('#e4e0d4') : c.ly < -h / 2 + 8 ? hex('#16232a') : null) }, 'b', 3));
      for (const y of [-20, 20]) p.push(box([0, y, 25], [12, 10, 1], { ramp: rampFrom('#8a7a50') }, 'hatch' + y, 0.5));
      break;
    case 'garage': {
      const door = DOOR_COLORS[variant % DOOR_COLORS.length]!;
      // roof slopes toward the back; door strip at the front (+y side = door, rot 0 faces south)
      p.push(box([0, 0, 28], [w - 1, h - 1, 28], {
        ramp: H('#1a1918', '#262523', '#34322f', '#44413c', '#55514a'),
        dither: true,
        pattern: (c) => {
          if (c.ly > (h - 1) / 2 - 4) return hex(door);
          if (Math.abs(c.lx) > (w - 1) / 2 - 1.2) return -1.4;
          return Math.abs(((c.ly + 200) % 14) - 7) < 0.5 ? -1 : noise2(c.u >> 2, c.v >> 2, 21) > 0.92 ? -0.8 : null;
        },
      }, 'roof', 1));
      p.push(box([0, hh - 1.5, 28.4], [w - 6, 1.2, 0.8], { ramp: rampFrom(door) }, 'lintel', 0.3));
      break;
    }
    case 'garage_shell': {
      const col = ['#3e5a3a', '#34506e', '#5a5a52'][variant % 3]!;
      p.push({ k: 'ell', c: [0, 0, 6], r: [hw - 0.5, hh - 0.5, 16], mat: { ramp: rampFrom(col), pattern: (c) => (Math.abs(((c.ly + 200) % 10) - 5) < 0.5 ? -1 : null) }, group: 's' });
      break;
    }
    case 'trash_container':
      p.push(box([0, 0, 13], [w - 1, h - 1, 13], { ramp: rampFrom('#3a5236'), pattern: (c) => (Math.abs(c.lx) < (w - 1) / 2 - 2 && Math.abs(c.ly) < (h - 1) / 2 - 2 ? hex('#0d0e0c') : null) }, 'bin', 0.6));
      for (let i = 0; i < 4; i++) p.push(ell([-8 + i * 5, (i % 2) * 3 - 1, 12], [3, 2.6, 2.4], { ramp: H('#0a0a0c', '#16161a', '#24242a') }, 'bag' + i));
      break;
    case 'bench':
      for (let i = 0; i < 3; i++) p.push(box([0, -hh + 1.8 + i * 3, 7], [w - 1, 2.2, 0.8], M.wood, 'slat' + i, 0.3));
      for (const s of [-1, 1]) p.push(box([s * (hw - 4), 0, 6], [3, h - 1, 6], M.concrete, 'leg' + s, 0.4));
      break;
    case 'domino_table':
      p.push(box([0, 0, 10], [w - 1, h - 1, 10], M.wood, 't', 0.6));
      for (let i = 0; i < 6; i++) p.push(box([-6 + (i % 3) * 5, -3 + Math.floor(i / 3) * 6, 10.4], [2.2, 4, 0.4], { ramp: H('#e8e4d8'), flat: true, pattern: (c) => (Math.abs(c.ly) < 0.3 ? hex('#202020') : null) }, 'd' + i, 0.1, i * 0.4));
      break;
    case 'swing':
      p.push(cap([-hw + 2, 0, 24], [hw - 2, 0, 24], 1.2, M.steel, 'top'));
      for (const s of [-1, 1]) p.push(cap([s * (hw - 2), -hh + 1, 1], [s * (hw - 2), hh - 1, 1], 1.2, M.steel, 'leg' + s));
      p.push(box([0, 0, 8], [10, 4, 0.8], M.wood, 'seat'));
      break;
    case 'slide':
      p.push(box([0, -hh + 6, 18], [w - 2, 10, 2], M.steel, 'deck'));
      p.push(box([0, 6, 10], [w - 4, h - 12, 1], { ramp: rampFrom('#a8a8a4'), spec: { color: hex('#ffffff'), power: 10, threshold: 0.8 } }, 'chute'));
      for (let i = 0; i < 4; i++) p.push(box([0, -hh + 1 + i * 1.5, 4 + i * 4], [w - 3, 0.8, 0.6], M.steel, 'rung' + i, 0.2));
      break;
    case 'carousel': {
      const r = w / 2 - 0.5;
      p.push(cyl(0, 0, r, 6, { ramp: rampFrom('#6a3a2a'), pattern: (c) => (Math.floor(((c.s + Math.PI) / (Math.PI * 2)) * 8) % 2 ? 0.8 : null) }, 'deck', 1.2));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        p.push(cap([Math.cos(a) * 3, Math.sin(a) * 3, 11], [Math.cos(a) * (r - 3), Math.sin(a) * (r - 3), 11], 0.8, M.steel, 'h' + i));
      }
      p.push(cyl(0, 0, 2.2, 12, M.steel, 'hub'));
      break;
    }
    case 'sandbox':
      p.push(box([0, 0, 3], [w, h, 3], { ...M.sand, pattern: (c) => (Math.abs(c.lx) > w / 2 - 2.4 || Math.abs(c.ly) > h / 2 - 2.4 ? hex('#5a3c22') : null) }, 's', 0.5));
      break;
    case 'monkey_bars':
      for (const s of [-1, 1]) p.push(cap([-hw + 1, s * (hh - 1), 18], [hw - 1, s * (hh - 1), 18], 0.9, M.steel, 'rail' + s));
      for (let i = 0; i < 8; i++) p.push(cap([-hw + 3 + i * ((w - 6) / 7), -hh + 1, 18.5], [-hw + 3 + i * ((w - 6) / 7), hh - 1, 18.5], 0.6, { ramp: rampFrom('#7a3a2a') }, 'bar' + i));
      break;
    case 'kiosk':
      p.push(box([0, 0, 22], [w - 1, h - 1, 22], { ramp: rampFrom('#3a5a7a'), pattern: (c) => (c.ly > (h - 1) / 2 - 5 ? hex('#c8b468') : null) }, 'k', 1.5));
      break;
    case 'lamp_post':
      p.push(cyl(0, 0, 2.2, 30, M.steelDark, 'post'));
      p.push(box([3, 0, 31], [7, 2.6, 1.4], { ramp: rampFrom('#3a3c40') }, 'head', 0.4));
      p.push(box([5, 0, 30.2], [3, 1.6, 0.6], { ramp: H('#ffe6a0'), flat: true }, 'bulb', 0.2));
      break;
    case 'tree_trunk':
      p.push(cyl(0, 0, w / 2 - 0.5, 20, { ramp: H('#1c140c', '#2c2014', '#3c2c1c') }, 't'));
      break;
    case 'phone_booth':
      p.push(box([0, 0, 24], [w - 1, h - 1, 24], { ramp: rampFrom('#8a2420') }, 'b', 1));
      p.push(box([0, 0, 24.6], [w - 6, h - 6, 0.6], { ramp: rampFrom('#aa3a2c') }, 'roof', 0.5));
      break;
    case 'water_pump':
      p.push(cyl(0, 0, w / 2 - 1, 14, { ramp: rampFrom('#3a4a3a') }, 'p'));
      p.push(cap([0, 0, 12], [5, 0, 10], 1, M.steelDark, 'spout'));
      break;
    default: {
      const more = propPrims2(type, w, h, variant);
      if (more) return more;
      p.push(box([0, 0, 8], [w - 1, h - 1, 8], { ramp: H('#ff00ff') }, 'missing'));
    }
  }
  return p;
}

export const PROP_VARIANTS: Record<string, number> = {
  garage: 5,
  container: 4,
  car_zhiguli: 5,
  car_volga: 4,
  garage_shell: 3,
  ...PROP_VARIANTS2,
};
