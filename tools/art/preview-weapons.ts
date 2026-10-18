/** Contact sheet for checking weapon art and grips: `tsx tools/art/preview-weapons.ts <out.png> [character]`. */
import { render } from './lib/model.js';
import { Img } from './lib/raster.js';
import { topPrims, sidePrims } from './weapons.js';
import { torsoPrims, legsPrims, gripFor } from './characters.js';
import type { CharId, TorsoAnim } from './characters.js';
import { renderFit } from './build-weapons.js';
import { WEAPON_IDS, WEAPONS } from '../../packages/shared/src/game-rules/weapons.js';

const out = process.argv[2] ?? 'weapons-preview.png';
const who = (process.argv[3] ?? 'petya') as CharId;
const anim = (process.argv[4] ?? 'idle') as TorsoAnim;

function blitRotated(dst: Img, src: Img, cx: number, cy: number, sx: number, sy: number, a: number) {
  // place src so that its pixel (sx, sy) lands at (cx, cy), rotated by a (nearest neighbour)
  const c = Math.cos(a);
  const s = Math.sin(a);
  const R = Math.ceil(Math.hypot(src.w, src.h));
  for (let y = -R; y <= R; y++)
    for (let x = -R; x <= R; x++) {
      const u = Math.round(c * x + s * y + sx);
      const v = Math.round(-s * x + c * y + sy);
      if (u < 0 || v < 0 || u >= src.w || v >= src.h) continue;
      const px = src.get(u, v);
      if (px[3] > 0) dst.blend(Math.round(cx + x), Math.round(cy + y), px);
    }
}

const COLS = 6;
const CELL_W = 260;
const CELL_H = 170;
const rows = Math.ceil(WEAPON_IDS.length / COLS);
const sheet = new Img(COLS * CELL_W, rows * CELL_H);
sheet.fillRect(0, 0, sheet.w, sheet.h, [58, 54, 48, 255]);
WEAPON_IDS.forEach((id, i) => {
  const ox = (i % COLS) * CELL_W;
  const oy = Math.floor(i / COLS) * CELL_H;
  sheet.fillRect(ox + 2, oy + 2, CELL_W - 4, CELL_H - 4, [74, 70, 62, 255]);
  const pose = WEAPONS[id].pose;
  const a = pose === 'melee' && anim !== 'idle' && anim !== 'hit' ? 'swing' : pose !== 'melee' && anim === 'swing' ? 'shoot' : anim;
  const frames = a === 'idle' || a === 'hit' ? 2 : a === 'swing' ? 5 : a === 'shoot' ? 3 : 6;
  const f = { pose, anim: a, frame: a === 'swing' ? 2 : a === 'reload' ? 2 : 0, frames };
  const legs = render(legsPrims(who, 'idle', 0, 1), 128, 128);
  const torso = render(torsoPrims(who, f), 128, 128);
  const weapon = render(topPrims(id), 176, 96);
  const g = gripFor(f);
  const scene = new Img(128, 128);
  scene.draw(legs, 0, 0, { blend: true });
  blitRotated(scene, weapon, 64 + g.x * 2, 64 + g.y * 2, 88, 48, g.rot);
  scene.draw(torso, 0, 0, { blend: true });
  sheet.draw(scene, ox + 4, oy + 20, { blend: true });
  const side = renderFit(sidePrims(id), 3, 2);
  sheet.draw(side, ox + 136, oy + 24, { blend: true });
  // name bar
  sheet.fillRect(ox + 4, oy + 4, Math.min(CELL_W - 8, id.length * 7 + 6), 12, [20, 18, 16, 255]);
});
sheet.savePng(out);
console.log('wrote', out);
