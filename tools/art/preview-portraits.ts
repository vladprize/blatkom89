import { Img } from './lib/raster.js';
import { renderPortrait } from './portraits.js';
import { RIGS } from './characters.js';
import type { CharId } from './characters.js';
const out = process.argv[2]!;
const ids = Object.keys(RIGS) as CharId[];
const sheet = new Img(ids.length * 124, 124 + 52);
ids.forEach((id, i) => {
  sheet.draw(renderPortrait(id, 120, 5.6, 1), i * 124 + 2, 2);
  sheet.draw(renderPortrait(id, 48, 2.2, 1), i * 124 + 2, 126);
});
sheet.savePng(out);
console.log('ok');
