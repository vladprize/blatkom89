/** Character sheet: idle (long pose with an AK) + walk + death for every rig: `tsx tools/art/preview-characters.ts <out.png> [ids]`. */
import { render } from './lib/model.js';
import { Img } from './lib/raster.js';
import { topPrims } from './weapons.js';
import { torsoPrims, legsPrims, deathPrims, gripFor, RIGS } from './characters.js';
import type { CharId } from './characters.js';

const out = process.argv[2]!;
const ids = (process.argv[3]?.split(',') ?? Object.keys(RIGS)) as CharId[];
const Z = 3;
function blitRotated(dst: Img, src: Img, cx: number, cy: number, sx: number, sy: number, a: number) {
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
const cols = 4;
const sheet = new Img(cols * 128 * Z, ids.length * 128 * Z);
sheet.fillRect(0, 0, sheet.w, sheet.h, [74, 70, 62, 255]);
ids.forEach((id, row) => {
  const cells: Img[] = [];
  for (const [pose, w] of [['long', 'avtomat'], ['pistol', 'pistol'], ['melee', 'montirovka']] as const) {
    const f = { pose, anim: 'idle' as const, frame: 0, frames: 2 };
    const scene = new Img(128, 128);
    scene.draw(render(legsPrims(id, 'walk', 2, 8), 128, 128), 0, 0, { blend: true });
    const g = gripFor(f);
    blitRotated(scene, render(topPrims(w), 176, 96), 64 + g.x * 2, 64 + g.y * 2, 88, 48, g.rot);
    scene.draw(render(torsoPrims(id, f), 128, 128), 0, 0, { blend: true });
    cells.push(scene);
  }
  cells.push(render(deathPrims(id, 1), 128, 128));
  cells.forEach((scene, col) => {
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const p = scene.get(x, y);
        if (p[3] > 0) sheet.fillRect(col * 128 * Z + x * Z, row * 128 * Z + y * Z, Z, Z, p);
      }
  });
});
sheet.savePng(out);
console.log('wrote', out, sheet.w, sheet.h);
