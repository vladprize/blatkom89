/** Shelf packer producing a Phaser-compatible (TexturePacker JSON Hash) trimmed atlas. */
import { Img } from './raster.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';

export interface PackInput {
  name: string;
  img: Img;
  /** Keep full frame (no trimming) — e.g. tiles. */
  noTrim?: boolean;
}

interface Placed {
  name: string;
  src: Img;
  trim: { x: number; y: number; w: number; h: number };
  x: number;
  y: number;
  sourceW: number;
  sourceH: number;
}

export function packAtlas(frames: PackInput[], pngPath: string, maxWidth = 2048, pad = 2): { w: number; h: number; count: number } {
  const items: Placed[] = frames.map((f) => {
    const b = f.noTrim ? { x: 0, y: 0, w: f.img.w, h: f.img.h } : (f.img.bounds() ?? { x: 0, y: 0, w: 1, h: 1 });
    return { name: f.name, src: f.img, trim: b, x: 0, y: 0, sourceW: f.img.w, sourceH: f.img.h };
  });
  const order = items.slice().sort((a, b) => b.trim.h - a.trim.h || b.trim.w - a.trim.w);
  // choose width: try powers of two to minimise area
  let best: { w: number; h: number } | null = null;
  for (let w = 256; w <= maxWidth; w *= 2) {
    const h = layout(order, w, pad, false);
    if (h <= maxWidth && (!best || w * h < best.w * best.h)) best = { w, h };
  }
  if (!best) throw new Error(`atlas ${pngPath} does not fit`);
  const H = layout(order, best.w, pad, true);
  const atlas = new Img(best.w, H);
  const json: Record<string, unknown> = {};
  for (const it of items) {
    for (let y = 0; y < it.trim.h; y++)
      for (let x = 0; x < it.trim.w; x++) atlas.set(it.x + x, it.y + y, it.src.get(it.trim.x + x, it.trim.y + y));
    json[it.name] = {
      frame: { x: it.x, y: it.y, w: it.trim.w, h: it.trim.h },
      rotated: false,
      trimmed: it.trim.w !== it.sourceW || it.trim.h !== it.sourceH,
      spriteSourceSize: { x: it.trim.x, y: it.trim.y, w: it.trim.w, h: it.trim.h },
      sourceSize: { w: it.sourceW, h: it.sourceH },
    };
  }
  atlas.savePng(pngPath);
  mkdirSync(dirname(pngPath), { recursive: true });
  writeFileSync(
    pngPath.replace(/\.png$/, '.json'),
    JSON.stringify({ frames: json, meta: { app: 'blatkom89 tools/art', image: basename(pngPath), format: 'RGBA8888', size: { w: best.w, h: H }, scale: '1' } }),
  );
  return { w: best.w, h: H, count: items.length };
}

function layout(order: Placed[], width: number, pad: number, apply: boolean): number {
  let x = pad;
  let y = pad;
  let rowH = 0;
  for (const it of order) {
    if (it.trim.w + pad * 2 > width) return Infinity;
    if (x + it.trim.w + pad > width) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    if (apply) {
      it.x = x;
      it.y = y;
    }
    x += it.trim.w + pad;
    rowH = Math.max(rowH, it.trim.h);
  }
  const h = y + rowH + pad;
  // round up to multiple of 4 for GPU friendliness
  return Math.ceil(h / 4) * 4;
}
