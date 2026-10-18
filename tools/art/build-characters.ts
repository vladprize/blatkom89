/**
 * Renders every character animation frame and packs one atlas per character. Torso frames are
 * rendered per pose class without a weapon (paper doll); weapons are separate sprites attached at
 * the grip exported by build-weapons.ts.
 */
import { render } from './lib/model.js';
import { packAtlas } from './lib/pack.js';
import type { PackInput } from './lib/pack.js';
import { torsoPrims, legsPrims, deathPrims, RIGS } from './characters.js';
import type { CharId, TorsoAnim, LegAnim } from './characters.js';
import type { PoseClass } from './weapons.js';
import { writeFileSync } from 'node:fs';

export const FRAME = 128;
export const CHAR_IDS = Object.keys(RIGS) as CharId[];
export const POSES: PoseClass[] = ['pistol', 'long', 'melee'];

export const TORSO_ANIMS: Record<PoseClass, Array<[TorsoAnim, number]>> = {
  pistol: [['idle', 2], ['shoot', 3], ['reload', 6], ['hit', 2]],
  long: [['idle', 2], ['shoot', 3], ['reload', 6], ['hit', 2]],
  melee: [['idle', 2], ['swing', 5], ['hit', 2]],
};
export const LEG_ANIMS: Array<[LegAnim, number]> = [['idle', 1], ['walk', 8], ['run', 8]];
export const DEATH_FRAMES = 6;

export function buildCharacters(outDir: string, only?: CharId[]): Record<string, unknown> {
  const manifest: Record<string, unknown> = {};
  for (const c of only ?? CHAR_IDS) {
    const frames: PackInput[] = [];
    for (const [anim, n] of LEG_ANIMS)
      for (let i = 0; i < n; i++) frames.push({ name: `${c}_legs_${anim}_${i}`, img: render(legsPrims(c, anim, i, n), FRAME, FRAME) });
    for (const pose of POSES)
      for (const [anim, n] of TORSO_ANIMS[pose])
        for (let i = 0; i < n; i++) frames.push({ name: `${c}_${pose}_${anim}_${i}`, img: render(torsoPrims(c, { pose, anim, frame: i, frames: n }), FRAME, FRAME) });
    for (let i = 0; i < DEATH_FRAMES; i++) frames.push({ name: `${c}_death_${i}`, img: render(deathPrims(c, i / (DEATH_FRAMES - 1)), FRAME, FRAME) });
    const r = packAtlas(frames, `${outDir}/char_${c}.png`);
    manifest[c] = { atlas: `char_${c}`, frames: r.count, size: [r.w, r.h] };
    console.log(`char_${c}: ${r.count} frames → ${r.w}x${r.h}`);
  }
  writeFileSync(`${outDir}/characters.meta.json`, JSON.stringify({ frameSize: FRAME, texelsPerWorldPx: 2, torsoAnims: TORSO_ANIMS, legAnims: LEG_ANIMS, deathFrames: DEATH_FRAMES }, null, 1));
  return manifest;
}
