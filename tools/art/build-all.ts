/**
 * Asset pipeline entry point: `npm run assets`.
 * Generates every sprite atlas and texture into apps/web/public/assets. Deterministic output.
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './lib/model.js';
import { packAtlas } from './lib/pack.js';
import type { PackInput } from './lib/pack.js';
import { buildCharacters } from './build-characters.js';
import { propPrims, PROP_VARIANTS } from './props.js';
import { buildWeapons } from './build-weapons.js';
import { renderPortrait } from './portraits.js';
import { EXTRA_RIGS } from './characters2.js';
import type { CharId } from './characters.js';
import { floorTexture, wallTexture, treeCanopy, bush, pipeTexture, roofDetail } from './textures.js';
import type { FloorKey, WallKey } from './textures.js';
import { glow, softCircle, muzzleFlash, bloodSplat, tracer, ring, ICONS } from './fx.js';
import { Img, hex } from './lib/raster.js';
import { PROP_DEFS } from '../../packages/shared/src/maps/props.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'apps/web/public/assets');

function buildProps() {
  const frames: PackInput[] = [];
  for (const [type, def] of Object.entries(PROP_DEFS)) {
    const variants = PROP_VARIANTS[type] ?? 1;
    for (let v = 0; v < variants; v++) {
      const W = Math.ceil(def.w * 2 + 10);
      const Hh = Math.ceil(def.h * 2 + 10);
      frames.push({ name: `prop_${type}_${v}`, img: render(propPrims(type, def.w, def.h, v), W, Hh) });
    }
  }
  // overhead foliage & roof details
  [56, 72, 88].forEach((s, i) => frames.push({ name: `tree_${i}`, img: treeCanopy(s, 11 + i * 7) }));
  frames.push({ name: 'bush_0', img: bush(70, 28, 3) });
  frames.push({ name: 'bush_1', img: bush(30, 70, 5) });
  for (const k of ['vent', 'hatch', 'antenna', 'machine'] as const) frames.push({ name: `roof_${k}`, img: roofDetail(k) });
  frames.push({ name: 'roof_puddle', img: roofDetail('puddle', 4) });
  return packAtlas(frames, join(OUT, 'sprites/props.png'));
}

function buildFx() {
  const frames: PackInput[] = [];
  frames.push({ name: 'glow', img: glow(64, 2) });
  frames.push({ name: 'glow_soft', img: glow(64, 1.2) });
  frames.push({ name: 'px', img: (() => { const i = new Img(4, 4); i.fillRect(0, 0, 4, 4, [255, 255, 255, 255]); return i; })(), noTrim: true });
  frames.push({ name: 'smoke', img: softCircle(32, [150, 146, 140, 170], 1.4, 7) });
  frames.push({ name: 'dust', img: softCircle(24, [120, 104, 82, 180], 1.3, 9) });
  frames.push({ name: 'shadow', img: softCircle(48, [0, 0, 0, 150], 0.9) });
  frames.push({ name: 'flash_pistol_0', img: muzzleFlash(36, 26, 3, 0.7, 1) });
  frames.push({ name: 'flash_pistol_1', img: muzzleFlash(30, 22, 4, 0.9, 2) });
  frames.push({ name: 'flash_avtomat_0', img: muzzleFlash(48, 26, 3, 0.55, 3) });
  frames.push({ name: 'flash_avtomat_1', img: muzzleFlash(42, 30, 5, 0.75, 4) });
  frames.push({ name: 'flash_obrez_0', img: muzzleFlash(60, 48, 7, 1.15, 5) });
  frames.push({ name: 'flash_obrez_1', img: muzzleFlash(54, 44, 6, 1.0, 6) });
  for (let i = 0; i < 6; i++) frames.push({ name: `blood_${i}`, img: bloodSplat(48, 100 + i * 13) });
  for (let i = 0; i < 3; i++) frames.push({ name: `pool_${i}`, img: bloodSplat(72, 300 + i * 17, true) });
  frames.push({ name: 'tracer', img: tracer(), noTrim: true });
  frames.push({ name: 'ring', img: ring(56, 3) });
  frames.push({ name: 'shell', img: (() => { const i = new Img(6, 4); i.fillRect(1, 1, 4, 2, hex('#d0a040')); i.set(4, 1, hex('#fff0b0')); return i; })(), noTrim: true });
  frames.push({ name: 'hole', img: softCircle(8, [8, 6, 5, 230], 0.6) });
  for (const [name, fn] of Object.entries(ICONS)) frames.push({ name, img: fn() });
  return packAtlas(frames, join(OUT, 'sprites/fx.png'));
}

function buildTiles() {
  const floors: FloorKey[] = ['concrete_slab', 'concrete_dirty', 'concrete_painted', 'linoleum_checker', 'tile_white', 'wood', 'metal_plate', 'asphalt', 'asphalt_cracked', 'dirt', 'grass', 'sand', 'gravel'];
  for (const f of floors) floorTexture(f).savePng(join(OUT, `tiles/floor_${f}.png`));
  const walls: WallKey[] = ['brick', 'concrete', 'panel', 'corrugated', 'fence_concrete', 'roof_flat', 'fence_chain'];
  for (const w of walls) wallTexture(w).savePng(join(OUT, `tiles/wall_${w}.png`));
  pipeTexture().savePng(join(OUT, 'tiles/pipe.png'));
  return { floors: floors.length, walls: walls.length };
}

/** Procedural 3/4 portraits for the characters without painted art (the original four keep theirs). */
function buildPortraits() {
  const ids = Object.keys(EXTRA_RIGS) as CharId[];
  mkdirSync(join(OUT, 'portraits'), { recursive: true });
  for (const id of ids) {
    renderPortrait(id, 120, 5.6, 1).savePng(join(OUT, `portraits/${id}.png`));
    renderPortrait(id, 48, 2.2, 1).savePng(join(OUT, `portraits/${id}_small.png`));
  }
  return ids.length;
}

function writeManifest() {
  const files: Record<string, string> = {};
  const walk = (dir: string, rel: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (/\.(png|json|woff2?|ttf)$/.test(e.name) && e.name !== 'manifest.json') files[r] = createHash('sha1').update(readFileSync(p)).digest('hex').slice(0, 10);
    }
  };
  walk(OUT, '');
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ generated: 'tools/art/build-all.ts', files }, null, 1));
  return Object.keys(files).length;
}

mkdirSync(join(OUT, 'sprites'), { recursive: true });
mkdirSync(join(OUT, 'tiles'), { recursive: true });
console.time('assets');
buildCharacters(join(OUT, 'sprites'));
console.log('props', buildProps());
console.log('weapons', buildWeapons(join(OUT, 'sprites'), join(OUT, 'ui'), join(ROOT, 'apps/web/src/game/render/rig.gen.ts')).atlas);
console.log('fx', buildFx());
console.log('tiles', buildTiles());
console.log('portraits', buildPortraits());
console.log('manifest entries', writeManifest());
console.timeEnd('assets');
