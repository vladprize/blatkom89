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
  | 'gravel'
  | 'carpet_red'
  | 'parquet'
  | 'tile_green'
  | 'tile_beige'
  | 'marble'
  | 'paving'
  | 'cobble';

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
    case 'carpet_red': {
      // worn theatre carpet: deep red pile with a small diamond ornament every 32 texels
      const c0 = hex('#6a1814');
      const gold = hex('#8a5a26');
      fill((u, v) => {
        const du = Math.abs((u % 32) - 16);
        const dv = Math.abs((v % 32) - 16);
        const d = du + dv;
        if (d === 9 || (d < 3 && (u + v) % 2 === 0)) return q(gold, step(0.85 + noise2(u, v, 201) * 0.2, u, v, 4, 0.7, 1.1));
        const pile = noise2(u, v, 202) * 0.12 + (pfbm(u, v, T, 64, 203) - 0.5) * 0.3;
        return q(c0, step(0.92 + pile, u, v, 5, 0.6, 1.2));
      });
      stains(img, 204, 4, hex('#3a0c0a'), 8, 24, 0.45);
      break;
    }
    case 'parquet': {
      // basket-weave parquet: 32-texel squares of four planks, alternating direction
      const c0 = hex('#6a4426');
      fill((u, v) => {
        const sq = (Math.floor(u / 32) + Math.floor(v / 32)) % 2;
        const along = sq ? u : v;
        const across = sq ? v : u;
        const plank = Math.floor((across % 32) / 8);
        const seam = across % 8 === 0 || (along % 32 === 0) ? 0.62 : 1;
        const id = Math.floor(u / 32) * 17 + Math.floor(v / 32) * 31 + plank * 7;
        const grain = pnoise(along / 10, (across % 8) / 2, Math.round(T / 10), 205 + plank) * 0.22;
        return q(c0, step((0.84 + noise2(id, 0, 206) * 0.2 + grain) * seam, u, v, 5, 0.5, 1.22));
      });
      stains(img, 207, 3, hex('#3a2414'), 10, 26, 0.35);
      break;
    }
    case 'tile_green': {
      // hospital tiles: pale green-grey 16-texel squares, grey grout, scuffs
      const c0 = hex('#6c8476');
      fill((u, v) => {
        if (u % 16 === 0 || v % 16 === 0) return q(hex('#3c4640'), 1);
        const tile = Math.floor(u / 16) * 29 + Math.floor(v / 16) * 13;
        return q(c0, step(0.88 + noise2(tile, 0, 211) * 0.12 + pfbm(u, v, T, 64, 212) * 0.14 + (noise2(u, v, 213) - 0.5) * 0.06, u, v, 4, 0.72, 1.18));
      });
      stains(img, 214, 6, hex('#3e4a40'), 6, 20, 0.35);
      crackLines(img, 215, 2, hex('#3a443e'), 24);
      break;
    }
    case 'tile_beige': {
      // shop floor: cream 32-texel tiles in two shades
      const a = hex('#8e7e5e');
      const b = hex('#7a6a4e');
      fill((u, v) => {
        if (u % 32 === 0 || v % 32 === 0) return q(hex('#463c2c'), 1);
        const c = (Math.floor(u / 32) + Math.floor(v / 32)) % 2 ? a : b;
        return q(c, step(0.9 + pfbm(u, v, T, 64, 221) * 0.16 + (noise2(u, v, 222) - 0.5) * 0.06, u, v, 4, 0.74, 1.16));
      });
      stains(img, 223, 6, hex('#4a3e2a'), 6, 22, 0.4);
      break;
    }
    case 'marble': {
      // foyer: big cream and grey slabs with veins
      const a = hex('#8a8070');
      const b = hex('#6a645a');
      fill((u, v) => {
        if (u % 64 === 0 || v % 64 === 0) return q(hex('#3e3a34'), 1);
        const c = (Math.floor(u / 64) + Math.floor(v / 64)) % 2 ? a : b;
        const vein = Math.abs(pnoise(u / 18 + v / 40, v / 18, Math.round(T / 18), 231) - 0.5) < 0.015 ? 0.9 : 1;
        return q(c, step((0.9 + pfbm(u, v, T, 64, 232) * 0.16) * vein, u, v, 5, 0.7, 1.15));
      });
      break;
    }
    case 'paving': {
      // pavement slabs with dark joints and moss in the cracks
      const c0 = hex('#55534c');
      fill((u, v) => {
        const su = u % 32;
        const sv = v % 32;
        const slab = Math.floor(u / 32) * 13 + Math.floor(v / 32) * 7;
        if (su === 0 || sv === 0) return noise2(u, v, 241) > 0.7 ? q(hex('#2e3a22'), 1) : q(hex('#2a2824'), 1);
        return q(c0, step(0.86 + noise2(slab, 0, 242) * 0.16 + pfbm(u, v, T, 64, 243) * 0.18 + (noise2(u, v, 244) - 0.5) * 0.08, u, v, 5, 0.66, 1.2));
      });
      crackLines(img, 245, 4, hex('#24221e'), 40);
      stains(img, 246, 5, hex('#2a2822'), 8, 24, 0.4);
      break;
    }
    case 'cobble': {
      // basalt setts: 8×8-texel stones in staggered rows, rounded corners, a worn lit edge, each its own tone
      fill((u, v) => {
        const row = v >> 3;
        const off = row % 2 ? 4 : 0;
        const su = (u + off) % 8;
        const sv = v % 8;
        const stone = (((u + off) >> 3) % 32) * 37 + (row % 32) * 11;
        if (su === 0 || sv === 0 || ((su === 1 || su === 7) && (sv === 1 || sv === 7))) return q(hex('#191817'), 1);
        const hue = noise2(stone, 1, 251);
        const base = hue < 0.33 ? hex('#4a4744') : hue < 0.66 ? hex('#43454a') : hex('#4d4740');
        let f = 0.82 + noise2(stone, 0, 252) * 0.26 + (pfbm(u, v, T, 64, 253) - 0.5) * 0.2 + (noise2(u, v, 254) - 0.5) * 0.08;
        if (su === 1 || sv === 1) f *= 1.12;
        if (su === 7 || sv === 7) f *= 0.8;
        return q(base, step(f, u, v, 5, 0.62, 1.2));
      });
      stains(img, 255, 6, hex('#242220'), 10, 26, 0.35);
      break;
    }
  }
  return img;
}

export type WallKey = 'brick' | 'concrete' | 'panel' | 'corrugated' | 'fence_concrete' | 'roof_flat' | 'fence_chain' | 'plaster' | 'fence_iron' | 'water' | 'kremlin' | 'granite' | 'roof_church';

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
        case 'plaster': {
          // the top of a painted interior partition: cream plaster with a darker cap line
          const cap = v % 64 === 0 ? 0.7 : 1;
          c = q(hex('#8e8676'), step((0.88 + noise2(u, v, 151) * 0.1 + (pnoise(u / 12, v / 12, 11, 152) - 0.5) * 0.16) * cap, u, v, 5, 0.66, 1.18));
          break;
        }
        case 'fence_iron': {
          // a wrought-iron railing seen from above: square bars every 8 texels (transparent between them)
          c = u % 8 < 3 ? q(hex('#2c3036'), step(0.94 + noise2(u >> 3, v >> 5, 161) * 0.22 - (u % 8 === 2 ? 0.18 : u % 8 === 0 ? -0.1 : 0), u, v, 5, 0.7, 1.2)) : [0, 0, 0, 0];
          break;
        }
        case 'water': {
          // dark lake water: two crossing swell bands, a little noise, rare moonlit glints (tileable; the renderer scrolls it)
          const TAU = Math.PI * 2;
          const w1 = Math.sin(TAU * ((3 * u + 2 * v) / S) + pnoise(u / 32, v / 32, 4, 171) * 2.4);
          const w2 = Math.sin(TAU * ((-2 * u + 5 * v) / S) + pnoise(u / 32, v / 32, 4, 172) * 2.4);
          const f = 0.86 + w1 * 0.07 + w2 * 0.05 + (pnoise(u / 16, v / 16, 8, 173) - 0.5) * 0.14;
          c = q(hex('#1c3440'), step(f, u, v, 5, 0.66, 1.3));
          if (w1 > 0.9 && w2 > 0.3 && noise2(u, v, 174) > 0.5) c = mix(c, hex('#8ab4c8'), 0.45);
          break;
        }
        case 'kremlin': {
          // the fortress wall's top: dark-red brick, small bond, pale lime mortar, soot patches
          const row = v >> 2;
          const off = row % 2 ? 4 : 0;
          const mortar = v % 4 === 0 || (u + off) % 8 === 0;
          const bk = (((u + off) >> 3) % 16) * 13 + row * 7;
          c = mortar ? hex('#3c2620') : q(hex('#70261c'), step(0.82 + noise2(bk, 0, 181) * 0.3 + (pnoise(u / 16, v / 16, 8, 182) - 0.5) * 0.24 + (noise2(u, v, 183) - 0.5) * 0.08, u, v, 5, 0.7, 1.2));
          if (pnoise(u / 32, v / 32, 4, 184) > 0.72) c = mix(c, hex('#2a1a16'), 0.35);
          break;
        }
        case 'granite': {
          // polished dark-red and black granite blocks with fine speckle
          const bu = u >> 5;
          const bv = v >> 4;
          const seam = u % 32 === 0 || v % 16 === 0;
          const base = (bu + bv) % 3 === 0 ? '#262228' : '#5a2a26';
          const speck = noise2(u, v, 191) > 0.88 ? 0.28 : noise2(u, v, 192) < 0.1 ? -0.2 : 0;
          c = seam ? hex('#141214') : q(hex(base), step(0.9 + noise2(bu * 7 + bv, 0, 193) * 0.16 + speck, u, v, 5, 0.7, 1.25));
          break;
        }
        case 'roof_church': {
          // a church roof of painted green sheet metal: standing seams, rust streaks, a darker ridge every 64 px
          const seam = u % 8 === 0;
          const ridge = v % 64 < 2;
          const shade = seam ? 1.16 : u % 8 === 1 ? 0.8 : 0.94;
          c = q(hex('#2e5a42'), step(shade * (0.9 + pnoise(u / 32, v / 32, 4, 201) * 0.2) * (ridge ? 0.7 : 1), u, v, 5, 0.66, 1.22));
          if (pnoise(u / 8, v / 8, 16, 202) > 0.8 && noise2(u >> 3, 0, 203) > 0.4) c = mix(c, hex('#6a3c20'), 0.4);
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
