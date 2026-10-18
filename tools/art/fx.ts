/** Effect sprites (muzzle flashes, blood, smoke, glow) and HUD/UI icons. */
import { Img, hex, mix, noise2, vnoise } from './lib/raster.js';
import type { RGBA } from './lib/raster.js';

export function glow(size = 64, falloff = 2): Img {
  const img = new Img(size, size);
  const c = size / 2;
  for (let v = 0; v < size; v++)
    for (let u = 0; u < size; u++) {
      const d = Math.sqrt((u + 0.5 - c) ** 2 + (v + 0.5 - c) ** 2) / c;
      if (d >= 1) continue;
      img.set(u, v, [255, 255, 255, Math.round(255 * Math.pow(1 - d, falloff))]);
    }
  return img;
}

export function softCircle(size: number, color: RGBA, falloff = 1.6, noiseSeed = 0): Img {
  const img = new Img(size, size);
  const c = size / 2;
  for (let v = 0; v < size; v++)
    for (let u = 0; u < size; u++) {
      let d = Math.sqrt((u + 0.5 - c) ** 2 + (v + 0.5 - c) ** 2) / c;
      if (noiseSeed) d += (noise2(u >> 1, v >> 1, noiseSeed) - 0.5) * 0.35;
      if (d >= 1) continue;
      img.set(u, v, [color[0], color[1], color[2], Math.round(color[3] * Math.pow(1 - d, falloff))]);
    }
  return img;
}

/** Muzzle flash pointing to +x. */
export function muzzleFlash(w: number, h: number, spikes: number, spread: number, seed: number): Img {
  const img = new Img(w, h);
  const cy = h / 2;
  const core: RGBA = hex('#fffbe8');
  const mid: RGBA = hex('#ffd860');
  const edge: RGBA = hex('#ff8a20');
  for (let v = 0; v < h; v++)
    for (let u = 0; u < w; u++) {
      const x = u / w;
      const y = (v + 0.5 - cy) / (h / 2);
      // base cone
      let s = 1 - Math.abs(y) / (spread * (0.25 + x * 0.9) + 0.05);
      s = Math.min(s, 1 - x * 1.05);
      // spikes
      for (let k = 0; k < spikes; k++) {
        const a = (k / (spikes - 1 || 1) - 0.5) * spread * 1.6;
        const len = 0.55 + noise2(k, 1, seed) * 0.45;
        const dy = y - a * x * 2;
        const sp = (1 - Math.abs(dy) * 6) * (1 - x / len);
        s = Math.max(s, sp);
      }
      if (s <= 0) continue;
      const c = s > 0.62 ? core : s > 0.32 ? mid : edge;
      img.set(u, v, [c[0], c[1], c[2], Math.round(255 * Math.min(1, s * 1.6))]);
    }
  return img;
}

/** Blood splat elongated toward +x (direction of travel). */
export function bloodSplat(size: number, seed: number, pool = false): Img {
  const img = new Img(size, size);
  const c = size / 2;
  const cols: RGBA[] = [hex('#3a0606'), hex('#5e0c0a'), hex('#80140f'), hex('#9c1c14')];
  const blobs: Array<[number, number, number]> = [];
  const n = pool ? 7 : 10;
  for (let i = 0; i < n; i++) {
    const t = noise2(i, 1, seed);
    const along = pool ? (t - 0.5) * size * 0.35 : t * size * 0.42;
    const lat = (noise2(i, 2, seed) - 0.5) * size * (pool ? 0.35 : 0.22) * (pool ? 1 : 1 - t * 0.6);
    const r = pool ? size * (0.16 + noise2(i, 3, seed) * 0.12) : size * (0.03 + noise2(i, 3, seed) * (i < 3 ? 0.14 : 0.05));
    blobs.push([c + along - (pool ? 0 : size * 0.12), c + lat, r]);
  }
  // A few satellite droplets flung along the travel direction (splats only).
  if (!pool)
    for (let i = 0; i < 6; i++) {
      const t = 0.55 + noise2(i, 7, seed) * 0.4;
      blobs.push([c + t * size * 0.42 - size * 0.12, c + (noise2(i, 8, seed) - 0.5) * size * 0.5, size * (0.012 + noise2(i, 9, seed) * 0.02)]);
    }
  for (let v = 0; v < size; v++)
    for (let u = 0; u < size; u++) {
      // Signed field: >0 inside the nearest blob. Starts at -Infinity so empty space stays empty
      // (noise only roughens the edges instead of speckling the whole square).
      let f = -Infinity;
      for (const [bx, by, r] of blobs) f = Math.max(f, 1 - Math.sqrt((u + 0.5 - bx) ** 2 + (v + 0.5 - by) ** 2) / Math.max(r, 0.6));
      if (f < -0.3) continue;
      f += (noise2(u, v, seed + 5) - 0.5) * 0.3;
      if (f <= 0) continue;
      const k = Math.min(3, Math.floor(f * 4));
      const col = cols[3 - k]!;
      img.set(u, v, [col[0], col[1], col[2], pool ? 235 : 245]);
    }
  return img;
}

/** Soot mark left by an explosion or a fire: dark centre, ragged blast rays, a few ash specks. */
export function scorchMark(size: number, seed: number): Img {
  const img = new Img(size, size);
  const c = size / 2;
  const rays = 13;
  for (let v = 0; v < size; v++)
    for (let u = 0; u < size; u++) {
      const dx = u + 0.5 - c;
      const dy = v + 0.5 - c;
      const a = Math.atan2(dy, dx);
      // blast rays: smooth noise around the circle decides how far the soot reaches
      const t = (a / (2 * Math.PI) + 1) * rays;
      const i0 = Math.floor(t);
      const f = t - i0;
      const n0 = noise2(i0 % rays, 3, seed);
      const n1 = noise2((i0 + 1) % rays, 3, seed);
      const ray = n0 + (n1 - n0) * f * f * (3 - 2 * f);
      const reach = 0.5 + ray * 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) / c / reach + (vnoise(u / 3, v / 3, seed + 9) - 0.5) * 0.35;
      if (d >= 1) continue;
      const speck = noise2(u, v, seed + 21);
      const col: RGBA = speck > 0.94 && d > 0.25 ? [74, 66, 58, 255] : d < 0.45 ? [10, 8, 7, 255] : speck > 0.5 ? [30, 24, 19, 255] : [18, 14, 11, 255];
      // stepped alpha keeps the pixel-art look
      const k = Math.min(1, (1 - d) * 1.6);
      img.set(u, v, [col[0], col[1], col[2], Math.round(235 * Math.ceil(k * 4) / 4)]);
    }
  return img;
}

/** A tongue of flame pointing up: white-yellow core, orange body, red rim (pixel art, 4 tones). */
export function flameSprite(w: number, h: number, seed: number): Img {
  const img = new Img(w, h);
  const cx = w / 2;
  const cy = h * 0.66;
  const tones: RGBA[] = [hex('#fff4c4'), hex('#ffd050'), hex('#ff8a24'), hex('#d0401a')];
  for (let v = 0; v < h; v++)
    for (let u = 0; u < w; u++) {
      const ny = (v + 0.5 - cy) / (h * 0.34);
      // the flame sways and narrows to a tip above its centre
      const sway = ny < 0 ? Math.sin(-ny * 2.6 + seed) * 0.22 * -ny : 0;
      const nx = (u + 0.5 - cx) / (w / 2) - sway;
      const taper = ny < 0 ? 1 + -ny * 1.3 : 1;
      const d = Math.sqrt((nx * taper) ** 2 + (ny < 0 ? (ny * 0.6) ** 2 : ny ** 2)) + (noise2(u, v, seed) - 0.5) * 0.12;
      if (d >= 1) continue;
      const tone = d < 0.32 ? 0 : d < 0.58 ? 1 : d < 0.82 ? 2 : 3;
      const c = tones[tone]!;
      img.set(u, v, [c[0], c[1], c[2], tone === 3 ? 200 : 255]);
    }
  return img;
}

export function tracer(): Img {
  const img = new Img(64, 4);
  for (let u = 0; u < 64; u++)
    for (let v = 0; v < 4; v++) {
      const a = Math.pow(u / 63, 1.4);
      const core = v === 1 || v === 2;
      const c = core ? mix(hex('#ffcf60'), hex('#fff8e0'), a) : hex('#ff9a30');
      img.set(u, v, [c[0], c[1], c[2], Math.round(255 * a * (core ? 1 : 0.45))]);
    }
  return img;
}

export function ring(size: number, thickness: number): Img {
  const img = new Img(size, size);
  const c = size / 2;
  for (let v = 0; v < size; v++)
    for (let u = 0; u < size; u++) {
      const d = Math.sqrt((u + 0.5 - c) ** 2 + (v + 0.5 - c) ** 2);
      const e = Math.abs(d - (c - thickness));
      if (e < thickness) img.set(u, v, [255, 255, 255, Math.round(255 * (1 - e / thickness))]);
    }
  return img;
}

// ── UI icons (white silhouettes, dark outline) ─────────────────────────────

function icon(w: number, h: number, draw: (img: Img, c: RGBA) => void, outline = 2): Img {
  const img = new Img(w, h);
  const white: RGBA = hex('#f2ece0');
  draw(img, white);
  const dark: RGBA = [12, 10, 9, 255];
  for (let i = 0; i < outline; i++) img.outline(dark, i > 0);
  return img;
}

export const ICONS: Record<string, () => Img> = {
  ico_skull: () =>
    icon(28, 28, (g, c) => {
      g.fillEllipse(14, 11, 9, 8, c);
      g.fillRect(9, 15, 10, 7, c);
      g.fillEllipse(10.5, 11, 2.4, 2.6, [0, 0, 0, 0]);
      g.fillEllipse(17.5, 11, 2.4, 2.6, [0, 0, 0, 0]);
      g.fillRect(11, 19, 1, 3, [0, 0, 0, 0]);
      g.fillRect(14, 19, 1, 3, [0, 0, 0, 0]);
      g.fillRect(17, 19, 1, 3, [0, 0, 0, 0]);
    }),
  ico_reload: () =>
    icon(44, 44, (g, c) => {
      for (let a = 0.4; a < 5.6; a += 0.02) {
        const r1 = 12;
        for (let r = r1; r < r1 + 4; r += 0.5) g.set(22 + Math.cos(a) * r, 22 + Math.sin(a) * r, c);
      }
      g.fillPoly([[31, 4], [38, 15], [26, 16]], c);
    }),
  ico_swap: () =>
    icon(44, 44, (g, c) => {
      g.fillRect(8, 13, 22, 5, c);
      g.fillPoly([[28, 7], [38, 15.5], [28, 24]], c);
      g.fillRect(14, 26, 22, 5, c);
      g.fillPoly([[16, 20], [6, 28.5], [16, 37]], c);
    }),
  ico_hand: () =>
    icon(44, 44, (g, c) => {
      g.fillRect(12, 20, 20, 16, c);
      for (let i = 0; i < 4; i++) g.fillRect(12 + i * 5, 8 + (i === 0 || i === 3 ? 4 : 0), 4, 14, c);
      g.fillPoly([[6, 22], [12, 22], [13, 30], [9, 30]], c);
    }),
  ico_fire: () =>
    icon(44, 44, (g, c) => {
      g.fillPoly([[16, 34], [16, 16], [22, 6], [28, 16], [28, 34]], c);
      g.fillRect(15, 34, 14, 4, c);
    }),
  ico_pause: () =>
    icon(32, 32, (g, c) => {
      g.fillRect(8, 6, 6, 20, c);
      g.fillRect(18, 6, 6, 20, c);
    }),
  crosshair: () => {
    const img = new Img(44, 44);
    const c: RGBA = hex('#fff4d8');
    const d: RGBA = [10, 8, 6, 255];
    const tick = (x: number, y: number, w: number, h: number) => {
      img.fillRect(x - 1, y - 1, w + 2, h + 2, d);
      img.fillRect(x, y, w, h, c);
    };
    tick(21, 3, 2, 11);
    tick(21, 30, 2, 11);
    tick(3, 21, 11, 2);
    tick(30, 21, 11, 2);
    tick(21, 21, 2, 2);
    return img;
  },
  joy_base: () => {
    const img = new Img(160, 160);
    for (let v = 0; v < 160; v++)
      for (let u = 0; u < 160; u++) {
        const d = Math.sqrt((u + 0.5 - 80) ** 2 + (v + 0.5 - 80) ** 2);
        if (d > 78) continue;
        if (d > 74) img.set(u, v, [232, 220, 192, 200]);
        else img.set(u, v, [16, 14, 12, Math.round(110 - (d / 74) * 40)]);
      }
    return img;
  },
  joy_knob: () => {
    const img = new Img(72, 72);
    for (let v = 0; v < 72; v++)
      for (let u = 0; u < 72; u++) {
        const d = Math.sqrt((u + 0.5 - 36) ** 2 + (v + 0.5 - 36) ** 2);
        if (d > 34) continue;
        const shade = 1 - Math.max(0, (u + v - 72) / 72) * 0.4;
        img.set(u, v, d > 31 ? [20, 16, 14, 230] : [Math.round(200 * shade), Math.round(52 * shade), Math.round(40 * shade), 220]);
      }
    return img;
  },
  btn_ring: () => {
    const img = new Img(112, 112);
    for (let v = 0; v < 112; v++)
      for (let u = 0; u < 112; u++) {
        const d = Math.sqrt((u + 0.5 - 56) ** 2 + (v + 0.5 - 56) ** 2);
        if (d > 54) continue;
        img.set(u, v, d > 50 ? [232, 220, 192, 210] : [14, 12, 10, 150]);
      }
    return img;
  },
};
