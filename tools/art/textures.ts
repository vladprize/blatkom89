/** Tileable floor and wall-top textures plus overhead foliage and roof details. */
import { Img, hex, mix, noise2, BAYER4 } from './lib/raster.js';
import type { RGBA } from './lib/raster.js';
import { render } from './lib/model.js';
import type { Material, Prim } from './lib/model.js';

const T = 256; // floor texture size in texels (= 128 world px)

/** Periodic value noise (tileable with the given period in cells). */
function pnoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const w = (v: number) => ((v % period) + period) % period;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = noise2(w(xi), w(yi), seed);
  const b = noise2(w(xi + 1), w(yi), seed);
  const c = noise2(w(xi), w(yi + 1), seed);
  const d = noise2(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}

function pfbm(x: number, y: number, size: number, cell: number, seed: number, oct = 4): number {
  let v = 0;
  let amp = 0.5;
  let c = cell;
  let tot = 0;
  for (let i = 0; i < oct; i++) {
    const period = Math.max(1, Math.round(size / c));
    v += pnoise(x / c, y / c, period, seed + i * 31) * amp;
    tot += amp;
    amp *= 0.5;
    c /= 2;
    if (c < 1) break;
  }
  return v / tot;
}

const q = (c: RGBA, f: number): RGBA => [Math.max(0, Math.min(255, c[0] * f)), Math.max(0, Math.min(255, c[1] * f)), Math.max(0, Math.min(255, c[2] * f)), 255];

/** Posterizes a brightness factor into a few steps (pixel-art banding) with ordered dithering. */
function step(f: number, u: number, v: number, levels = 5, lo = 0.72, hi = 1.18): number {
  const t = (f - lo) / (hi - lo);
  const d = BAYER4[v & 3]![u & 3]! - 0.5;
  const k = Math.max(0, Math.min(levels - 1, Math.round(t * (levels - 1) + d * 0.9)));
  return lo + (k / (levels - 1)) * (hi - lo);
}

function crackLines(img: Img, seed: number, count: number, color: RGBA, len = 60): void {
  for (let i = 0; i < count; i++) {
    let x = noise2(i, 1, seed) * T;
    let y = noise2(i, 2, seed) * T;
    let a = noise2(i, 3, seed) * Math.PI * 2;
    const L = len * (0.5 + noise2(i, 4, seed));
    for (let s = 0; s < L; s++) {
      a += (noise2(i, s, seed + 7) - 0.5) * 0.9;
      x += Math.cos(a);
      y += Math.sin(a);
      const px = ((Math.round(x) % T) + T) % T;
      const py = ((Math.round(y) % T) + T) % T;
      img.set(px, py, color);
      if (noise2(i, s, seed + 9) > 0.92) img.set((px + 1) % T, py, color);
    }
  }
}

function stains(img: Img, seed: number, count: number, color: RGBA, rmin: number, rmax: number, alpha: number): void {
  for (let i = 0; i < count; i++) {
    const cx = noise2(i, 11, seed) * T;
    const cy = noise2(i, 12, seed) * T;
    const r = rmin + noise2(i, 13, seed) * (rmax - rmin);
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const d = Math.sqrt(x * x + y * y) / r + (pnoise((cx + x) / 6, (cy + y) / 6, Math.round(T / 6), seed + i) - 0.5) * 0.6;
        if (d > 1) continue;
        const px = ((Math.round(cx + x) % T) + T) % T;
        const py = ((Math.round(cy + y) % T) + T) % T;
        const a = alpha * (1 - d) * (BAYER4[py & 3]![px & 3]! < 0.85 ? 1 : 0.5);
        const base = img.get(px, py);
        img.set(px, py, mix(base, color, Math.min(1, a)));
      }
  }
}

export type FloorKey =
  | 'concrete_slab'
  | 'concrete_dirty'
  | 'concrete_painted'
  | 'linoleum_checker'
  | 'tile_white'
  | 'wood'
  | 'metal_plate'
  | 'asphalt'
  | 'asphalt_cracked'
  | 'dirt'
  | 'grass'
  | 'sand'
  | 'gravel';

export function floorTexture(kind: FloorKey): Img {
  const img = new Img(T, T);
  const fill = (fn: (u: number, v: number) => RGBA) => {
    for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) img.set(u, v, fn(u, v));
  };
  switch (kind) {
    case 'concrete_slab': {
      const base = hex('#4f4b44');
      fill((u, v) => {
        const slab = Math.floor(u / 128) + Math.floor(v / 128) * 2;
        const tone = 0.92 + noise2(slab, 0, 41) * 0.16;
        let f = tone * (0.86 + pfbm(u, v, T, 64, 5) * 0.28) * (0.94 + noise2(u, v, 1) * 0.12);
        const su = u % 128;
        const sv = v % 128;
        if (su < 2 || sv < 2) f *= 0.55;
        else if (su < 3 || sv < 3) f *= 1.12;
        return q(base, step(f, u, v, 6, 0.55, 1.2));
      });
      crackLines(img, 3, 7, hex('#24221e'), 70);
      stains(img, 8, 6, hex('#2a2620'), 10, 26, 0.5);
      break;
    }
    case 'concrete_dirty': {
      const base = hex('#47433c');
      fill((u, v) => q(base, step((0.82 + pfbm(u, v, T, 96, 9) * 0.4) * (0.94 + noise2(u, v, 2) * 0.1), u, v, 6, 0.6, 1.2)));
      stains(img, 14, 9, hex('#1c1a16'), 8, 34, 0.55);
      stains(img, 15, 4, hex('#2b2a24'), 20, 40, 0.4);
      crackLines(img, 5, 5, hex('#211f1b'), 60);
      break;
    }
    case 'concrete_painted': {
      const paint = hex('#3d4c45');
      const bare = hex('#55524b');
      fill((u, v) => {
        const wear = pfbm(u, v, T, 48, 17);
        const c = wear > 0.66 ? bare : paint;
        return q(c, step(0.9 + noise2(u, v, 3) * 0.12 + (pfbm(u, v, T, 128, 3) - 0.5) * 0.2, u, v, 5, 0.7, 1.15));
      });
      stains(img, 18, 5, hex('#1e221e'), 8, 22, 0.45);
      break;
    }
    case 'linoleum_checker': {
      const a = hex('#34503e');
      const b = hex('#8e8a6c');
      fill((u, v) => {
        const c = (Math.floor(u / 32) + Math.floor(v / 32)) % 2 ? a : b;
        const edge = u % 32 === 0 || v % 32 === 0 ? 0.82 : 1;
        return q(c, step((0.86 + pfbm(u, v, T, 64, 23) * 0.22) * edge * (0.96 + noise2(u, v, 4) * 0.08), u, v, 5, 0.65, 1.12));
      });
      stains(img, 25, 7, hex('#2a2a1e'), 6, 22, 0.4);
      crackLines(img, 26, 3, hex('#2a3a2e'), 30);
      break;
    }
    case 'tile_white': {
      const c0 = hex('#8f8f88');
      fill((u, v) => {
        if (u % 16 === 0 || v % 16 === 0) return q(hex('#4a4a44'), 1);
        const tile = Math.floor(u / 16) * 31 + Math.floor(v / 16);
        return q(c0, step(0.88 + noise2(tile, 0, 61) * 0.14 + pfbm(u, v, T, 64, 29) * 0.12, u, v, 4, 0.75, 1.15));
      });
      stains(img, 31, 6, hex('#5a5240'), 6, 18, 0.4);
      break;
    }
    case 'wood': {
      const c0 = hex('#5a3c24');
      fill((u, v) => {
        const plank = Math.floor(v / 16);
        const off = (plank * 53) % 128;
        const seam = (u + off) % 128 === 0 || v % 16 === 0;
        const grain = pnoise(u / 24, v / 2, Math.round(T / 24), 33 + plank) * 0.3;
        const f = (0.84 + noise2(plank, 0, 71) * 0.2 + grain) * (seam ? 0.55 : 1);
        return q(c0, step(f, u, v, 5, 0.5, 1.2));
      });
      break;
    }
    case 'metal_plate': {
      const c0 = hex('#3f434a');
      fill((u, v) => {
        const pu = u % 128;
        const pv = v % 128;
        if (pu < 2 || pv < 2) return q(c0, 0.45);
        // diamond tread
        const du = ((u + v) % 12) - 6;
        const dv = ((u - v + 1200) % 12) - 6;
        const tread = Math.abs(du) < 1.2 && Math.abs(dv) < 3.2 ? 1.18 : 1;
        const rivet = (pu === 7 || pu === 120) && (pv === 7 || pv === 120) ? 1.5 : 1;
        return q(c0, step((0.84 + pfbm(u, v, T, 64, 37) * 0.26) * tread * rivet, u, v, 5, 0.6, 1.3));
      });
      stains(img, 38, 5, hex('#1a1a1c'), 8, 24, 0.45);
      stains(img, 39, 3, hex('#4a3420'), 6, 14, 0.35);
      break;
    }
    case 'asphalt':
    case 'asphalt_cracked': {
      const c0 = hex('#2f2f31');
      fill((u, v) => {
        const g = noise2(u, v, 43);
        const f = (0.86 + pfbm(u, v, T, 64, 41) * 0.22) * (g > 0.94 ? 1.35 : g < 0.05 ? 0.7 : 1);
        return q(c0, step(f, u, v, 5, 0.65, 1.35));
      });
      if (kind === 'asphalt_cracked') {
        // patch repairs
        for (let i = 0; i < 3; i++) {
          const x0 = Math.floor(noise2(i, 1, 51) * T);
          const y0 = Math.floor(noise2(i, 2, 51) * T);
          const w = 30 + Math.floor(noise2(i, 3, 51) * 50);
          const h = 20 + Math.floor(noise2(i, 4, 51) * 40);
          for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
              const px = (x0 + x) % T;
              const py = (y0 + y) % T;
              img.set(px, py, q(hex('#262628'), step(0.9 + noise2(px, py, 52) * 0.15, px, py, 4, 0.8, 1.15)));
            }
        }
        crackLines(img, 53, 10, hex('#151516'), 90);
      } else crackLines(img, 54, 3, hex('#18181a'), 50);
      stains(img, 55, 4, hex('#121214'), 10, 26, 0.5);
      break;
    }
    case 'dirt': {
      const c0 = hex('#4a3a28');
      fill((u, v) => {
        const p = noise2(u, v, 61);
        return q(p > 0.97 ? hex('#6e6250') : c0, step(0.82 + pfbm(u, v, T, 48, 63) * 0.36, u, v, 5, 0.6, 1.25));
      });
      stains(img, 64, 6, hex('#2e2418'), 10, 30, 0.45);
      break;
    }
    case 'grass': {
      const c0 = hex('#2c3c1e');
      fill((u, v) => {
        const blade = noise2(u, v >> 1, 71) > 0.7 ? 1.18 : 1;
        const bare = pfbm(u, v, T, 64, 73) > 0.68;
        return q(bare ? hex('#3e3424') : c0, step((0.8 + pfbm(u, v, T, 32, 75) * 0.35) * blade, u, v, 5, 0.6, 1.3));
      });
      break;
    }
    case 'sand': {
      const c0 = hex('#7c6c4c');
      fill((u, v) => q(c0, step(0.86 + pfbm(u, v, T, 32, 81) * 0.24 + (noise2(u, v, 82) - 0.5) * 0.12, u, v, 5, 0.7, 1.2)));
      break;
    }
    case 'gravel': {
      const c0 = hex('#4a4640');
      fill((u, v) => {
        const cell = noise2(u >> 2, v >> 2, 91);
        const f = 0.75 + cell * 0.5 + (u % 4 === 0 || v % 4 === 0 ? -0.15 : 0);
        return q(c0, step(f, u, v, 5, 0.55, 1.3));
      });
      break;
    }
  }
  return img;
}

export type WallKey = 'brick' | 'concrete' | 'panel' | 'corrugated' | 'fence_concrete' | 'roof_flat' | 'fence_chain';

/** 128x128 tileable wall-top textures. */
export function wallTexture(kind: WallKey): Img {
  const S = 128;
  const img = new Img(S, S);
  for (let v = 0; v < S; v++)
    for (let u = 0; u < S; u++) {
      let c: RGBA;
      switch (kind) {
        case 'brick': {
          const row = Math.floor(v / 8);
          const off = row % 2 ? 8 : 0;
          const mortar = v % 8 === 0 || (u + off) % 16 === 0;
          const b = Math.floor((u + off) / 16) * 13 + row * 7;
          c = mortar ? hex('#3a2e26') : q(hex('#6e2c1e'), step(0.84 + noise2(b, 0, 101) * 0.3 + (noise2(u, v, 102) - 0.5) * 0.12, u, v, 5, 0.7, 1.2));
          break;
        }
        case 'concrete':
        case 'panel': {
          const seam = kind === 'panel' ? u % 64 === 0 || v % 64 === 0 : v % 32 === 0;
          c = seam ? hex('#2e2d2a') : q(hex('#66625a'), step(0.86 + noise2(u, v, 111) * 0.14 + (pnoise(u / 16, v / 16, 8, 112) - 0.5) * 0.2, u, v, 5, 0.7, 1.2));
          break;
        }
        case 'corrugated': {
          const ridge = Math.floor(u / 3) % 2;
          c = q(hex('#58606a'), step((ridge ? 1.08 : 0.86) * (0.9 + pnoise(u / 20, v / 20, 6, 121) * 0.2), u, v, 5, 0.65, 1.25));
          if (pnoise(u / 10, v / 10, 13, 122) > 0.72) c = mix(c, hex('#6a3c20'), 0.55);
          break;
        }
        case 'fence_concrete': {
          const post = u % 64 < 6;
          c = q(hex(post ? '#7a766c' : '#6a665e'), step(0.86 + noise2(u, v, 131) * 0.14 + ((u + v) % 10 < 1 ? -0.12 : 0), u, v, 5, 0.7, 1.2));
          break;
        }
        case 'roof_flat': {
          const seam = v % 48 === 0;
          c = seam ? hex('#18171a') : q(hex('#2c2a2c'), step(0.84 + pnoise(u / 24, v / 24, 5, 141) * 0.3 + (noise2(u, v, 142) - 0.5) * 0.1, u, v, 5, 0.65, 1.25));
          break;
        }
        case 'fence_chain': {
          c = (u + v) % 6 === 0 || (u - v + 600) % 6 === 0 ? hex('#8a8e94') : [0, 0, 0, 0];
          break;
        }
      }
      img.set(u, v, c);
    }
  return img;
}

// ── Overhead foliage & roof details (rendered with the 3D renderer) ─────────

const leaf = (seed: number): Material => ({
  ramp: [hex('#0b150b'), hex('#132313'), hex('#1c321a'), hex('#284624'), hex('#365a2e')],
  dither: true,
  pattern: (c) => (noise2(c.u >> 1, c.v >> 1, seed) > 0.8 ? -0.8 : null),
});

export function treeCanopy(size: number, seed: number): Img {
  const prims: Prim[] = [];
  const r = size / 2;
  const n = 14 + Math.floor(size / 10);
  for (let i = 0; i < n; i++) {
    const a = noise2(i, 1, seed) * Math.PI * 2;
    const d = Math.sqrt(noise2(i, 2, seed)) * r * 0.62;
    const rr = r * (0.26 + noise2(i, 3, seed) * 0.16);
    prims.push({ k: 'ell', c: [Math.cos(a) * d, Math.sin(a) * d, 30 + noise2(i, 4, seed) * 6], r: [rr, rr * (0.85 + noise2(i, 5, seed) * 0.3), rr * 0.8], mat: leaf(seed + i), group: 'l' + i });
  }
  prims.push({ k: 'ell', c: [0, 0, 32], r: [r * 0.5, r * 0.5, r * 0.4], mat: leaf(seed + 99), group: 'core' });
  return render(prims, Math.ceil(size * 2 + 6), Math.ceil(size * 2 + 6), { edge: 2.2, innerEdgeFactor: 0.6 });
}

export function bush(w: number, h: number, seed: number): Img {
  const prims: Prim[] = [];
  const n = 8 + Math.floor((w + h) / 12);
  for (let i = 0; i < n; i++) {
    const x = (noise2(i, 1, seed) - 0.5) * (w - 10);
    const y = (noise2(i, 2, seed) - 0.5) * (h - 10);
    const rr = 5 + noise2(i, 3, seed) * 5;
    prims.push({ k: 'ell', c: [x, y, 8 + noise2(i, 4, seed) * 4], r: [rr, rr, rr * 0.8], mat: leaf(seed * 3 + i), group: 'b' + i });
  }
  return render(prims, Math.ceil(w * 2 + 8), Math.ceil(h * 2 + 8), { edge: 2.4, innerEdgeFactor: 0.6 });
}

/** Horizontal pipe segment (tileable along x): 64 world px long. */
export function pipeTexture(): Img {
  const prims: Prim[] = [
    { k: 'cap', a: [-40, 0, 20], b: [40, 0, 20], r: 5.4, mat: { ramp: [hex('#16181b'), hex('#24272c'), hex('#363a41'), hex('#4c525b'), hex('#6c737e')], spec: { color: hex('#a8b0bc'), power: 10, threshold: 0.86 } }, group: 'p' },
    { k: 'cap', a: [-1.4, 0, 20], b: [1.4, 0, 20], r: 6.6, mat: { ramp: [hex('#1c1e22'), hex('#2c3036'), hex('#40454e'), hex('#5a616c')] }, group: 'f' },
  ];
  const full = render(prims, 160, 28, { outline: [0, 0, 0, 0] });
  return full.crop(16, 0, 128, 28);
}

export function roofDetail(kind: 'vent' | 'hatch' | 'antenna' | 'machine' | 'puddle', seed = 0): Img {
  const p: Prim[] = [];
  const conc: Material = { ramp: [hex('#2a2926'), hex('#3c3a36'), hex('#504d47'), hex('#66625a')], dither: true };
  switch (kind) {
    case 'vent':
      p.push({ k: 'box', c: [0, 0, 4], h: [6, 6, 4], mat: conc, group: 'v', bevel: 1 });
      p.push({ k: 'box', c: [0, 0, 8.2], h: [4, 4, 0.4], mat: { ramp: [hex('#0a0a0b'), hex('#141416')] }, group: 'g', bevel: 0.3 });
      break;
    case 'hatch':
      p.push({ k: 'box', c: [0, 0, 3], h: [7, 7, 3], mat: conc, group: 'h', bevel: 1 });
      p.push({ k: 'box', c: [0, 0, 6.2], h: [5.5, 5.5, 0.4], mat: { ramp: [hex('#2a1e14'), hex('#3e2c1c'), hex('#523a24')] }, group: 'l' });
      break;
    case 'machine':
      p.push({ k: 'box', c: [0, 0, 8], h: [20, 14, 8], mat: conc, group: 'm', bevel: 1.5 });
      p.push({ k: 'box', c: [-8, 0, 16.4], h: [6, 8, 0.4], mat: { ramp: [hex('#1a1a1c'), hex('#28282c')] }, group: 'r' });
      break;
    case 'antenna':
      p.push({ k: 'cap', a: [0, -10, 12], b: [0, 10, 12], r: 0.5, mat: { ramp: [hex('#3a3c40'), hex('#6a6e74'), hex('#9a9ea6')] }, group: 'a' });
      for (let i = -3; i <= 3; i++) p.push({ k: 'cap', a: [-5 + Math.abs(i) * 0.6, i * 3, 12.4], b: [5 - Math.abs(i) * 0.6, i * 3, 12.4], r: 0.35, mat: { ramp: [hex('#3a3c40'), hex('#6a6e74'), hex('#9a9ea6')] }, group: 'b' + i });
      p.push({ k: 'cyl', c: [0, 0, 0], r: 1, z0: 0, z1: 12, mat: { ramp: [hex('#3a3c40'), hex('#6a6e74')] }, group: 'mast' });
      break;
    case 'puddle': {
      const img = new Img(48, 32);
      for (let v = 0; v < 32; v++)
        for (let u = 0; u < 48; u++) {
          const d = Math.sqrt(((u - 24) / 22) ** 2 + ((v - 16) / 14) ** 2) + (noise2(u >> 2, v >> 2, seed) - 0.5) * 0.5;
          if (d < 1) img.set(u, v, d > 0.8 ? [24, 28, 34, 200] : [16, 20, 28, 220]);
        }
      return img;
    }
  }
  return render(p, 48, 48);
}
