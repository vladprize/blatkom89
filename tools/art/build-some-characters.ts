/**
 * Rebuilds the atlases of some characters only and refreshes the asset manifest — for adding a character
 * without re-rendering the whole asset set: `tsx tools/art/build-some-characters.ts id,id,…`.
 * (`npm run assets` rebuilds everything; the output is the same, the rendering is deterministic.)
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCharacters, CHAR_IDS } from './build-characters.js';
import type { CharId } from './characters.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'apps/web/public/assets');
const ids = (process.argv[2] ?? '').split(',').filter(Boolean) as CharId[];
for (const id of ids) if (!CHAR_IDS.includes(id)) throw new Error(`unknown character ${id}`);
if (!ids.length) throw new Error('usage: tsx tools/art/build-some-characters.ts id,id,…');
buildCharacters(join(OUT, 'sprites'), ids);

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
console.log('manifest entries', Object.keys(files).length);
