/** Renders every character animation frame and packs one atlas per character. */
import { render } from './lib/model.js';
import { packAtlas } from './lib/pack.js';
import type { PackInput } from './lib/pack.js';
import { torsoPrims, legsPrims, deathPrims, MUZZLE_OFFSETS } from './characters.js';
import type { CharId, WeaponKey, TorsoAnim, LegAnim } from './characters.js';
import { writeFileSync } from 'node:fs';

export const FRAME = 128;
export const CHAR_IDS: CharId[] = ['petya', 'valuta', 'uchastkovy', 'mihalych'];
export const WEAPON_KEYS: WeaponKey[] = ['pistol', 'montirovka', 'obrez', 'avtomat'];

export const TORSO_ANIMS: Record<WeaponKey, Array<[TorsoAnim, number]>> = {
  pistol: [['idle', 2], ['shoot', 3], ['reload', 6], ['hit', 2]],
  obrez: [['idle', 2], ['shoot', 3], ['reload', 6], ['hit', 2]],
  avtomat: [['idle', 2], ['shoot', 3], ['reload', 6], ['hit', 2]],
  montirovka: [['idle', 2], ['swing', 5], ['hit', 2]],
};
export const LEG_ANIMS: Array<[LegAnim, number]> = [['idle', 1], ['walk', 8], ['run', 8]];
export const DEATH_FRAMES = 6;

export function buildCharacters(outDir: string): Record<string, unknown> {
  const manifest: Record<string, unknown> = {};
  for (const c of CHAR_IDS) {
    const frames: PackInput[] = [];
    for (const [anim, n] of LEG_ANIMS)
      for (let i = 0; i < n; i++) frames.push({ name: `${c}_legs_${anim}_${i}`, img: render(legsPrims(c, anim, i, n), FRAME, FRAME) });
    for (const w of WEAPON_KEYS)
      for (const [anim, n] of TORSO_ANIMS[w])
        for (let i = 0; i < n; i++) frames.push({ name: `${c}_${w}_${anim}_${i}`, img: render(torsoPrims(c, { weapon: w, anim, frame: i, frames: n }), FRAME, FRAME) });
    for (let i = 0; i < DEATH_FRAMES; i++) frames.push({ name: `${c}_death_${i}`, img: render(deathPrims(c, i / (DEATH_FRAMES - 1), 'pistol'), FRAME, FRAME) });
    const r = packAtlas(frames, `${outDir}/char_${c}.png`);
    manifest[c] = { atlas: `char_${c}`, frames: r.count, size: [r.w, r.h] };
    console.log(`char_${c}: ${r.count} frames → ${r.w}x${r.h}`);
  }
  writeFileSync(
    `${outDir}/characters.meta.json`,
    JSON.stringify({ frameSize: FRAME, texelsPerWorldPx: 2, torsoAnims: TORSO_ANIMS, legAnims: LEG_ANIMS, deathFrames: DEATH_FRAMES, muzzle: MUZZLE_OFFSETS }, null, 1),
  );
  return manifest;
}
