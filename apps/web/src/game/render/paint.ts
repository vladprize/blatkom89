/**
 * Runtime-generated "painted" decals (floor stencils, arrows, hazard stripes, chalk) drawn on a
 * canvas at 2 texels per world px, then worn down with deterministic noise.
 */
import type * as Phaser from 'phaser';

const S = 2; // texels per world px

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w));
  c.height = Math.max(2, Math.ceil(h));
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

/** Erodes painted pixels: random specks + scratches, keeping a hard pixel look. */
function wear(g: CanvasRenderingContext2D, w: number, h: number, seed: number, amount: number) {
  const r = rng(seed);
  g.save();
  g.globalCompositeOperation = 'destination-out';
  const n = Math.floor(((w * h) / 60) * amount);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * w);
    const y = Math.floor(r() * h);
    const s = r() < 0.8 ? 1 : 2 + Math.floor(r() * 3);
    g.fillRect(x, y, s, s);
  }
  for (let i = 0; i < Math.floor(w / 40); i++) {
    let x = r() * w;
    let y = r() * h;
    g.fillStyle = 'rgba(0,0,0,0.9)';
    for (let k = 0; k < 30; k++) {
      x += (r() - 0.3) * 4;
      y += (r() - 0.5) * 2;
      g.fillRect(Math.floor(x), Math.floor(y), 2, 1);
    }
  }
  g.restore();
}

function addTexture(scene: Phaser.Scene, key: string, c: HTMLCanvasElement): string {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, c);
  return key;
}

export function paintedText(scene: Phaser.Scene, key: string, text: string, sizeWorld: number, color: string, font: 'stencil' | 'hand', seed: number): string {
  const family = font === 'hand' ? '700 SIZEpx Caveat, "PT Sans Narrow", sans-serif' : '700 SIZEpx Oswald, "PT Sans Narrow", sans-serif';
  const px = Math.round(sizeWorld * S);
  const [m, mg] = canvas(4, 4);
  void m;
  mg.font = family.replace('SIZE', String(px));
  const tw = mg.measureText(text).width;
  const [c, g] = canvas(tw + px, px * 1.6);
  g.font = family.replace('SIZE', String(px));
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.fillText(text, px / 2, c.height / 2);
  if (font === 'stencil') {
    // stencil bridges
    g.save();
    g.globalCompositeOperation = 'destination-out';
    for (let x = px / 2; x < c.width; x += px * 0.55) g.fillRect(Math.floor(x + px * 0.22), 0, Math.max(1, Math.floor(px / 14)), c.height);
    g.restore();
  }
  wear(g, c.width, c.height, seed, font === 'hand' ? 0.25 : 0.55);
  return addTexture(scene, key, c);
}

export function paintedArrow(scene: Phaser.Scene, key: string, w: number, h: number, color: string, text: string | undefined, seed: number): string {
  const W = w * S;
  const H = h * S;
  const [c, g] = canvas(W, H);
  g.fillStyle = color;
  // arrow body pointing to +x: plate with the label and a circled arrow (like the factory floor marking)
  g.fillRect(0, H * 0.12, W * 0.94, H * 0.76);
  g.beginPath();
  g.moveTo(W * 0.78, 0);
  g.lineTo(W, H / 2);
  g.lineTo(W * 0.78, H);
  g.closePath();
  g.fill();
  g.save();
  g.globalCompositeOperation = 'destination-out';
  const cx = W * 0.66;
  const cy = H / 2;
  const r = H * 0.27;
  g.lineWidth = Math.max(2, H * 0.06);
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.fillRect(cx - r * 0.55, cy - H * 0.03, r * 1.0, H * 0.06);
  g.beginPath();
  g.moveTo(cx + r * 0.6, cy);
  g.lineTo(cx + r * 0.15, cy - r * 0.42);
  g.lineTo(cx + r * 0.15, cy + r * 0.42);
  g.closePath();
  g.fill();
  if (text) {
    g.font = `700 ${Math.round(H * 0.3)}px Oswald, sans-serif`;
    g.textBaseline = 'middle';
    g.fillText(text, W * 0.08, cy + 1);
  }
  g.restore();
  wear(g, W, H, seed, 0.6);
  return addTexture(scene, key, c);
}

export function hazardStripes(scene: Phaser.Scene, key: string, w: number, h: number, seed: number): string {
  const W = Math.max(2, w * S);
  const H = Math.max(2, h * S);
  const [c, g] = canvas(W, H);
  for (let x = -H; x < W + H; x += 12) {
    g.fillStyle = '#c9a227';
    g.beginPath();
    g.moveTo(x, H);
    g.lineTo(x + H, 0);
    g.lineTo(x + H + 6, 0);
    g.lineTo(x + 6, H);
    g.closePath();
    g.fill();
    g.fillStyle = '#141210';
    g.beginPath();
    g.moveTo(x + 6, H);
    g.lineTo(x + H + 6, 0);
    g.lineTo(x + H + 12, 0);
    g.lineTo(x + 12, H);
    g.closePath();
    g.fill();
  }
  wear(g, W, H, seed, 0.5);
  return addTexture(scene, key, c);
}

export function paintedStar(scene: Phaser.Scene, key: string, r: number, color: string, seed: number): string {
  const R = r * S;
  const [c, g] = canvas(R * 2 + 2, R * 2 + 2);
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? R : R * 0.42;
    const x = R + 1 + Math.cos(a) * rr;
    const y = R + 1 + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  wear(g, c.width, c.height, seed, 0.5);
  return addTexture(scene, key, c);
}

export function stain(scene: Phaser.Scene, key: string, r: number, color: string, seed: number): string {
  const R = Math.ceil(r * S);
  const [c, g] = canvas(R * 2, R * 2);
  const rand = rng(seed);
  g.fillStyle = color;
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * R * 0.5;
    const rr = R * (0.25 + rand() * 0.35);
    g.globalAlpha = 0.35 + rand() * 0.4;
    g.beginPath();
    g.arc(R + Math.cos(a) * d, R + Math.sin(a) * d, rr, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  wear(g, c.width, c.height, seed + 1, 0.3);
  return addTexture(scene, key, c);
}

export function hopscotch(scene: Phaser.Scene, key: string, seed: number): string {
  const cell = 14 * S;
  const [c, g] = canvas(cell * 2 + 8, cell * 6 + 8);
  g.strokeStyle = 'rgba(232,226,214,0.85)';
  g.fillStyle = 'rgba(232,226,214,0.85)';
  g.lineWidth = 2;
  const layout: Array<[number, number, number]> = [
    [0.5, 0, 1],
    [0, 1, 2],
    [1, 1, 3],
    [0.5, 2, 4],
    [0, 3, 5],
    [1, 3, 6],
    [0.5, 4, 7],
    [0.5, 5, 8],
  ];
  g.font = `700 ${Math.round(cell * 0.55)}px Caveat, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const [cx, cy, n] of layout) {
    const x = 4 + cx * cell;
    const y = 4 + (5 - cy) * cell;
    g.strokeRect(x, y, cell, cell);
    g.fillText(String(n), x + cell / 2, y + cell / 2 + 1);
  }
  wear(g, c.width, c.height, seed, 0.4);
  return addTexture(scene, key, c);
}

export function manhole(scene: Phaser.Scene, key: string): string {
  const R = 9 * S;
  const [c, g] = canvas(R * 2 + 2, R * 2 + 2);
  g.fillStyle = '#1a1a1c';
  g.beginPath();
  g.arc(R + 1, R + 1, R, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#3a3a3e';
  g.lineWidth = 2;
  for (let r = R * 0.35; r < R; r += R * 0.3) {
    g.beginPath();
    g.arc(R + 1, R + 1, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(1, R + 1);
  g.lineTo(R * 2 + 1, R + 1);
  g.moveTo(R + 1, 1);
  g.lineTo(R + 1, R * 2 + 1);
  g.stroke();
  return addTexture(scene, key, c);
}

export function solidRect(scene: Phaser.Scene, key: string, w: number, h: number, color: string, seed: number, wearAmount = 0.4): string {
  const [c, g] = canvas(w * S, h * S);
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  wear(g, c.width, c.height, seed, wearAmount);
  return addTexture(scene, key, c);
}

/** Laundry line with hanging clothes (top-down). */
export function laundry(scene: Phaser.Scene, key: string, w: number, h: number, seed: number): string {
  const [c, g] = canvas(w * S, h * S);
  const r = rng(seed);
  const lines = 3;
  const colors = ['#c8c0b0', '#8a2a24', '#2c4a6e', '#d8d4c8', '#5a6a3a', '#b89a4a'];
  for (let i = 0; i < lines; i++) {
    const y = ((i + 0.5) / lines) * c.height;
    g.fillStyle = 'rgba(30,28,26,0.9)';
    g.fillRect(0, Math.floor(y), c.width, 1);
    for (let x = 6; x < c.width - 10; x += 10 + r() * 18) {
      if (r() < 0.3) continue;
      const cw = 8 + r() * 12;
      const ch = 6 + r() * 6;
      g.fillStyle = colors[Math.floor(r() * colors.length)]!;
      g.fillRect(Math.floor(x), Math.floor(y - ch / 2), Math.floor(cw), Math.floor(ch));
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(Math.floor(x), Math.floor(y + ch / 2 - 2), Math.floor(cw), 2);
    }
  }
  return addTexture(scene, key, c);
}

/** Small floor-litter sprites (2 texels / world px) packed into one canvas texture with named frames. */
export const CLUTTER_FRAMES = ['paper_0', 'paper_1', 'news_0', 'butt_0', 'butt_1', 'bolt_0', 'bolt_1', 'debris_0', 'debris_1', 'debris_2', 'glass_0', 'leaf_0', 'leaf_1', 'leaf_2', 'oil_0', 'oil_1', 'card_0', 'rag_0', 'can_0', 'bottle_0', 'tape_0', 'weeds_0', 'weeds_1', 'crack_0'] as const;
export type ClutterFrame = (typeof CLUTTER_FRAMES)[number];

export function clutterSheet(scene: Phaser.Scene, key = 'clutter'): string {
  if (scene.textures.exists(key)) return key;
  const CELL = 40;
  const cols = 6;
  const rows = Math.ceil(CLUTTER_FRAMES.length / cols);
  const [c, g] = canvas(CELL * cols, CELL * rows);
  const r = rng(1989);
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  };
  const blob = (cx: number, cy: number, rx: number, ry: number, col: string, alpha = 1) => {
    g.globalAlpha = alpha;
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  };
  const rects: Array<[string, number, number, number, number]> = [];
  CLUTTER_FRAMES.forEach((name, i) => {
    const ox = (i % cols) * CELL;
    const oy = Math.floor(i / cols) * CELL;
    const cx = ox + CELL / 2;
    const cy = oy + CELL / 2;
    const kind = name.split('_')[0];
    switch (kind) {
      case 'paper': {
        const w = 11 + r() * 4;
        const h = 14 + r() * 3;
        px(cx - w / 2 + 1, cy - h / 2 + 1, w, h, 'rgba(0,0,0,0.35)');
        px(cx - w / 2, cy - h / 2, w, h, name === 'paper_0' ? '#d9d1bd' : '#cfc9b3');
        for (let l = 0; l < 5; l++) px(cx - w / 2 + 2, cy - h / 2 + 2.5 + l * 2.4, w - 4 - r() * 3, 1, '#8a8474');
        px(cx + w / 2 - 3, cy - h / 2, 3, 3, '#b2ab96');
        break;
      }
      case 'news': {
        px(cx - 10, cy - 7, 21, 15, 'rgba(0,0,0,0.35)');
        px(cx - 11, cy - 8, 21, 15, '#bdb7a5');
        px(cx - 10, cy - 7, 19, 3, '#5a5650');
        for (let l = 0; l < 4; l++) {
          px(cx - 10, cy - 2 + l * 2.5, 8, 1, '#7a766a');
          px(cx, cy - 2 + l * 2.5, 9, 1, '#7a766a');
        }
        px(cx - 0.5, cy - 8, 1, 15, '#a39d8c');
        break;
      }
      case 'butt':
        px(cx - 3, cy, 4, 2, name === 'butt_0' ? '#e8e0cc' : '#d8d0bc');
        px(cx + 1, cy, 2, 2, '#c8823a');
        px(cx - 4, cy, 1, 2, '#3a3430');
        break;
      case 'bolt':
        blob(cx, cy, 2.5, 2.5, '#6d7174');
        px(cx - 1, cy - 1, 2, 2, name === 'bolt_0' ? '#2a2c2e' : '#8a8f92');
        break;
      case 'debris':
        for (let k = 0; k < 4 + (i % 3); k++) {
          const dx = (r() - 0.5) * 12;
          const dy = (r() - 0.5) * 10;
          const s = 1.5 + r() * 2.5;
          px(cx + dx + 1, cy + dy + 1, s, s, 'rgba(0,0,0,0.4)');
          px(cx + dx, cy + dy, s, s, ['#8d877c', '#77726a', '#a39d90'][k % 3]!);
        }
        break;
      case 'glass':
        for (let k = 0; k < 7; k++) px(cx + (r() - 0.5) * 12, cy + (r() - 0.5) * 9, 1 + (r() < 0.3 ? 1 : 0), 1, k % 2 ? '#a8d8c8' : '#d8f0e8');
        break;
      case 'leaf': {
        const col = ['#7a5a24', '#8a7a2a', '#5f6a2c'][i % 3]!;
        blob(cx, cy, 3.5, 2.2, col);
        px(cx - 3, cy, 6, 1, 'rgba(40,30,10,0.6)');
        break;
      }
      case 'oil':
        blob(cx, cy, 12, 8, '#0c0b0a', 0.5);
        blob(cx + 3, cy - 1, 7, 5, '#0c0b0a', 0.4);
        blob(cx - 4, cy + 2, 3, 2, '#2a3a4a', 0.35);
        break;
      case 'card':
        px(cx - 8, cy - 5, 17, 11, 'rgba(0,0,0,0.35)');
        px(cx - 9, cy - 6, 17, 11, '#9a7a4a');
        px(cx - 9, cy - 1, 17, 1, '#7a5e36');
        px(cx - 4, cy - 6, 1, 11, '#7a5e36');
        break;
      case 'rag':
        blob(cx, cy, 6, 4, '#5a5240');
        blob(cx + 2, cy + 1, 3, 2, '#3e382c');
        break;
      case 'can':
        blob(cx, cy, 3, 3, '#7a6a5a');
        blob(cx, cy, 2, 2, '#b8a890');
        px(cx - 1, cy - 1, 1, 1, '#5a4a3a');
        break;
      case 'bottle':
        px(cx - 6, cy - 1, 12, 3, 'rgba(0,0,0,0.35)');
        px(cx - 7, cy - 2, 10, 4, '#2f5a34');
        px(cx + 3, cy - 1, 4, 2, '#2f5a34');
        px(cx - 6, cy - 2, 7, 1, '#6aa070');
        px(cx - 3, cy - 2, 3, 4, '#d8c890');
        break;
      case 'tape':
        px(cx - 7, cy - 4, 15, 9, 'rgba(0,0,0,0.4)');
        px(cx - 8, cy - 5, 15, 9, '#141312');
        px(cx - 6, cy - 4, 11, 3, '#d9c7a3');
        px(cx - 5, cy - 3, 6, 1, '#c8312a');
        blob(cx - 4, cy + 1.5, 1.6, 1.6, '#3a3634');
        blob(cx + 2, cy + 1.5, 1.6, 1.6, '#3a3634');
        break;
      case 'weeds':
        for (let k = 0; k < 9; k++) {
          const a = r() * Math.PI * 2;
          const d = r() * 4;
          px(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1, 2 + r() * 2, k % 3 ? '#4f6a2a' : '#6f8a3a');
        }
        break;
      case 'crack': {
        let x = cx - 14;
        let y = cy;
        g.fillStyle = 'rgba(10,9,8,0.75)';
        for (let k = 0; k < 28; k++) {
          x += 1;
          y += (r() - 0.5) * 2;
          g.fillRect(Math.round(x), Math.round(y), 1, 1);
          if (k === 12) {
            let bx = x;
            let by = y;
            for (let q = 0; q < 8; q++) {
              bx += 0.6;
              by += 1;
              g.fillRect(Math.round(bx), Math.round(by), 1, 1);
            }
          }
        }
        break;
      }
    }
    rects.push([name, ox, oy, CELL, CELL]);
  });
  const tex = scene.textures.addCanvas(key, c)!;
  for (const [name, x, y, w, h] of rects) tex.add(name, 0, x, y, w, h);
  return key;
}
