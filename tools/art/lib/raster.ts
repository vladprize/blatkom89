/** Minimal RGBA raster + PNG codec used by the procedural asset pipeline (no native deps). */
import { deflateSync, inflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type RGBA = [number, number, number, number];

export function hex(h: string, a = 255): RGBA {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
}

export function shade(c: RGBA, f: number): RGBA {
  return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f), c[3]];
}

export class Img {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  get(x: number, y: number): RGBA {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!, this.data[i + 3]!];
  }

  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3]!;
  }

  set(x: number, y: number, c: RGBA): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3];
  }

  /** Source-over blend. */
  blend(x: number, y: number, c: RGBA): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || c[3] <= 0) return;
    const i = (y * this.w + x) * 4;
    const sa = c[3] / 255;
    const da = this.data[i + 3]! / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    for (let k = 0; k < 3; k++) this.data[i + k] = (c[k]! * sa + this.data[i + k]! * da * (1 - sa)) / oa;
    this.data[i + 3] = oa * 255;
  }

  fillRect(x0: number, y0: number, w: number, h: number, c: RGBA, blend = false): void {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.h, Math.ceil(y0 + h)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.w, Math.ceil(x0 + w)); x++) (blend ? this.blend : this.set).call(this, x, y, c);
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGBA, blend = false): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) (blend ? this.blend : this.set).call(this, x, y, c);
      }
  }

  fillPoly(pts: Array<[number, number]>, c: RGBA, blend = false): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i]!;
        const [x2, y2] = pts[(i + 1) % pts.length]!;
        if (y1 <= yc !== y2 <= yc) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.ceil(xs[k]! - 0.5); x <= Math.floor(xs[k + 1]! - 0.5); x++) (blend ? this.blend : this.set).call(this, x, y, c);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGBA, blend = false): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      (blend ? this.blend : this.set).call(this, x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Draws `src` at (dx, dy). */
  draw(src: Img, dx: number, dy: number, opts: { alpha?: number; blend?: boolean } = {}): void {
    const a = opts.alpha ?? 1;
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = src.get(x, y);
        if (c[3] === 0) continue;
        if (opts.blend === false && a === 1) this.set(dx + x, dy + y, c);
        else this.blend(dx + x, dy + y, [c[0], c[1], c[2], c[3] * a]);
      }
  }

  /** 1-texel outline around opaque pixels. */
  outline(c: RGBA, diagonal = false): void {
    const src = new Uint8Array(this.w * this.h);
    for (let i = 0; i < this.w * this.h; i++) src[i] = this.data[i * 4 + 3]! > 40 ? 1 : 0;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x]) continue;
        let near = false;
        for (const [ox, oy] of diagonal ? NB8 : NB4) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx >= 0 && ny >= 0 && nx < this.w && ny < this.h && src[ny * this.w + nx]) {
            near = true;
            break;
          }
        }
        if (near) this.set(x, y, c);
      }
  }

  clone(): Img {
    const o = new Img(this.w, this.h);
    o.data.set(this.data);
    return o;
  }

  /** Bounding box of non-transparent pixels or null. */
  bounds(): { x: number; y: number; w: number; h: number } | null {
    let x0 = this.w;
    let y0 = this.h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.data[(y * this.w + x) * 4 + 3]! > 0) {
          if (x < x0) x0 = x;
          if (y < y0) y0 = y;
          if (x > x1) x1 = x;
          if (y > y1) y1 = y;
        }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  crop(x: number, y: number, w: number, h: number): Img {
    const o = new Img(w, h);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) o.set(xx, yy, this.get(x + xx, y + yy));
    return o;
  }

  /** Nearest-neighbour rotation by multiples of 90° (clockwise). */
  rotate90(times: number): Img {
    const t = ((times % 4) + 4) % 4;
    if (t === 0) return this.clone();
    const o = t % 2 === 1 ? new Img(this.h, this.w) : new Img(this.w, this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (t === 1) o.set(this.h - 1 - y, x, c);
        else if (t === 2) o.set(this.w - 1 - x, this.h - 1 - y, c);
        else o.set(y, this.w - 1 - x, c);
      }
    return o;
  }

  savePng(path: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, encodePng(this));
  }
}

const NB4: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const NB8: Array<[number, number]> = [...NB4, [1, 1], [-1, -1], [1, -1], [-1, 1]];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePng(img: Img): Buffer {
  const raw = Buffer.alloc((img.w * 4 + 1) * img.h);
  for (let y = 0; y < img.h; y++) {
    raw[y * (img.w * 4 + 1)] = 0;
    Buffer.from(img.data.buffer, y * img.w * 4, img.w * 4).copy(raw, y * (img.w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** Decodes 8-bit RGB/RGBA non-interlaced PNGs (enough for the reference images). */
export function decodePng(path: string): Img {
  const buf = readFileSync(path);
  let o = 8;
  let w = 0;
  let h = 0;
  let ct = 0;
  const idat: Buffer[] = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      ct = data[9]!;
      if (data[8] !== 8 || data[12] !== 0 || (ct !== 2 && ct !== 6)) throw new Error('unsupported png');
    } else if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const img = new Img(w, h);
  const stride = w * bpp;
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp]! : 0;
      const b = prev[i]!;
      const c = i >= bpp ? prev[i - bpp]! : 0;
      let v = line[i]!;
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) img.set(x, y, [cur[x * bpp]!, cur[x * bpp + 1]!, cur[x * bpp + 2]!, bpp === 4 ? cur[x * bpp + 3]! : 255]);
    prev.set(cur);
  }
  return img;
}

/** Deterministic hash noise in [0,1). */
export function noise2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1). */
export function vnoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = noise2(xi, yi, seed);
  const b = noise2(xi + 1, yi, seed);
  const c = noise2(xi, yi + 1, seed);
  const d = noise2(xi + 1, yi + 1, seed);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}

export function fbm(x: number, y: number, seed = 0, oct = 4): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += vnoise(x * f, y * f, seed + i * 17) * amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / (1 - Math.pow(0.5, oct));
}

export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16));
