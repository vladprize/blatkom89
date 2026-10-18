/**
 * Procedural portraits for characters without painted art: the in-game 3D rig (head, torso,
 * clothing) rendered in a 3/4 view with the same cel shading, over a dark backdrop lit with the
 * character's accent colour. Output: 120×120 (`<id>.png`) and 48×48 (`<id>_small.png`).
 */
import { render, viewPrims, viewPoint } from './lib/model.js';
import type { Prim, V3 } from './lib/model.js';
import { Img, hex, mix } from './lib/raster.js';
import type { RGBA } from './lib/raster.js';
import { RIGS, arm } from './characters.js';
import type { CharId, PoseOffsets } from './characters.js';
import { CHARACTERS } from '../../packages/shared/src/game-rules/characters.js';

export function portraitPrims(id: CharId): Prim[] {
  const rig = RIGS[id];
  const o: PoseOffsets = { dx: 0, dy: 0, dz: 0, yaw: 0, breathe: 0.2, sway: 0.4 };
  const p: Prim[] = [];
  const tr = rig.torsoR;
  p.push({ k: 'ell', c: [rig.torsoC[0], rig.torsoC[1], rig.torsoC[2]], r: [tr[0], tr[1], tr[2]], mat: rig.pal.torso, group: 'torso' });
  rig.torsoExtras(p, o);
  rig.tail?.(p, o);
  rig.head(p, o);
  // arms resting at the sides
  for (const side of [-1, 1] as const) arm(p, rig, side, [2.5, side * (rig.shoulderY + 1.2), 5.2], o, rig.pal.sleeve);
  return p;
}

function upscale(src: Img, k: number): Img {
  const out = new Img(src.w * k, src.h * k);
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const c = src.get(x, y);
      if (c[3] > 0) out.fillRect(x * k, y * k, k, k, c);
    }
  return out;
}

function backdrop(size: number, accent: RGBA): Img {
  const img = new Img(size, size);
  const base: RGBA = hex('#0d0b0a');
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.42;
      const dy = (y + 0.5) / size - 0.38;
      const d = Math.sqrt(dx * dx + dy * dy);
      let c = mix(hex('#2a221c'), base, Math.min(1, d * 1.6));
      c = mix(c, accent, Math.max(0, 0.32 - d * 0.55));
      // faint scanlines
      if (y % 3 === 0) c = mix(c, [0, 0, 0, 255], 0.18);
      img.set(x, y, [c[0], c[1], c[2], 255]);
    }
  return img;
}

/** Renders a portrait of `size`×`size` px, drawing the model at `scale` texels per world px, upscaled ×`k`. */
export function renderPortrait(id: CharId, size: number, scale: number, k: number): Img {
  const rig = RIGS[id];
  const az = 0.9;
  const el = 0.3;
  const prims = viewPrims(portraitPrims(id), az, el);
  const target = viewPoint([rig.headC[0] + 1.2, 0, rig.headC[2] - 1.4] as V3, az, el);
  const w = Math.round(size / k);
  const fig = render(prims, w, w, { scale, cx: target[0], cy: target[1] });
  const img = backdrop(size, hex(CHARACTERS[id].accent));
  img.draw(upscale(fig, k), 0, 0, { blend: true });
  // frame
  for (let i = 0; i < size; i++) {
    for (const [x, y] of [
      [i, 0],
      [i, size - 1],
      [0, i],
      [size - 1, i],
    ] as const)
      img.set(x, y, hex('#3a3128'));
  }
  return img;
}
