/** Asset keys and animation registration (frame names follow tools/art/build-characters.ts). */
import * as Phaser from 'phaser';
import { CHARACTER_IDS, isCharacterId } from '@blatkom/shared';
import type { CharacterId, WeaponPose } from '@blatkom/shared';
import { inlineAsset } from '../app/inline.js';
import { POSE_ANIMS } from './render/rig.gen.js';

export const FLOOR_KEYS = [
  'concrete_slab',
  'concrete_dirty',
  'concrete_painted',
  'linoleum_checker',
  'tile_white',
  'wood',
  'metal_plate',
  'asphalt',
  'asphalt_cracked',
  'dirt',
  'grass',
  'sand',
  'gravel',
  'carpet_red',
  'parquet',
  'tile_green',
  'tile_beige',
  'marble',
  'paving',
  'cobble',
  'snow',
  'snow_trodden',
] as const;
export const WALL_KEYS = ['brick', 'concrete', 'panel', 'corrugated', 'fence_concrete', 'roof_flat', 'fence_chain', 'plaster', 'fence_iron', 'water', 'kremlin', 'granite', 'roof_church', 'roof_snow', 'heat_pipe'] as const;

/** Torso animations per pose class (paper doll: the weapon is a separate sprite, see CharacterView). */
export const TORSO_ANIMS: Record<WeaponPose, ReadonlyArray<readonly [string, number]>> = POSE_ANIMS;

// URL with a content-hash query, or the embedded data URI in single-file builds
const v = (p: string): string => {
  const inl = inlineAsset(p);
  return typeof inl === 'string' ? inl : `${p}?v=${__ASSET_VERSION__}`;
};
// atlas JSON: an embedded object is handed to Phaser directly
const j = (p: string): string | object => {
  const inl = inlineAsset(p);
  return inl && typeof inl === 'object' ? inl : `${p}?v=${__ASSET_VERSION__}`;
};

/**
 * v0.2.21 (the usability audit: the first visit downloaded 3.6 MB — every character's sprites and portraits —
 * before the menu showed): the menu waits only for the backdrop's crew and the player's own character; the
 * others come in the background (queueRest) and a match waits for their sprites (lazyAssets.ts).
 */
export function bootCharacters(saved?: string | null): CharacterId[] {
  const set = new Set<CharacterId>(CHARACTER_IDS.slice(0, 4));
  if (saved && isCharacterId(saved)) set.add(saved);
  return [...set];
}

export function preloadAssets(scene: Phaser.Scene, base = 'assets/', chars: readonly CharacterId[] = CHARACTER_IDS, portraits = true): void {
  const l = scene.load;
  l.setPath(base);
  for (const c of chars) l.atlas(`char_${c}`, v(`sprites/char_${c}.png`), j(`sprites/char_${c}.json`));
  l.atlas('props', v('sprites/props.png'), j('sprites/props.json'));
  l.atlas('fx', v('sprites/fx.png'), j('sprites/fx.json'));
  l.atlas('weapons', v('sprites/weapons.png'), j('sprites/weapons.json'));
  for (const f of FLOOR_KEYS) l.image(`floor_${f}`, v(`tiles/floor_${f}.png`));
  for (const w of WALL_KEYS) l.image(`wall_${w}`, v(`tiles/wall_${w}.png`));
  l.image('pipe', v('tiles/pipe.png'));
  if (portraits) {
    for (const c of chars) {
      l.image(`portrait_${c}`, v(`portraits/${c}.png`));
      l.image(`portrait_small_${c}`, v(`portraits/${c}_small.png`));
    }
  }
}

/**
 * Queues what the boot left out: the other characters' sprites first (a match waits for them), then every
 * portrait (the HUD takes its portrait when it arrives). Returns how many files were queued.
 */
export function queueRest(scene: Phaser.Scene, base = 'assets/'): { sprites: number; files: number } {
  const l = scene.load;
  l.setPath(base);
  const tx = scene.textures;
  let sprites = 0;
  let files = 0;
  for (const c of CHARACTER_IDS) {
    if (tx.exists(`char_${c}`)) continue;
    l.atlas(`char_${c}`, v(`sprites/char_${c}.png`), j(`sprites/char_${c}.json`));
    sprites++;
    files++;
  }
  for (const c of CHARACTER_IDS) {
    if (!tx.exists(`portrait_${c}`)) {
      l.image(`portrait_${c}`, v(`portraits/${c}.png`));
      files++;
    }
    if (!tx.exists(`portrait_small_${c}`)) {
      l.image(`portrait_small_${c}`, v(`portraits/${c}_small.png`));
      files++;
    }
  }
  return { sprites, files };
}

export function animKey(c: CharacterId, part: string): string {
  return `${c}_${part}`;
}

export function registerAnimations(scene: Phaser.Scene): void {
  const anims = scene.anims;
  const frames = (c: CharacterId, prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ key: `char_${c}`, frame: `${c}_${prefix}_${i}` }));
  for (const c of CHARACTER_IDS) {
    // v0.2.21: a character whose sprites are still on their way gets its animations when they arrive
    if (anims.exists(`${c}_legs_walk`) || !scene.textures.exists(`char_${c}`)) continue;
    anims.create({ key: `${c}_legs_idle`, frames: frames(c, 'legs_idle', 1), frameRate: 1, repeat: -1 });
    anims.create({ key: `${c}_legs_walk`, frames: frames(c, 'legs_walk', 8), frameRate: 12, repeat: -1 });
    anims.create({ key: `${c}_legs_run`, frames: frames(c, 'legs_run', 8), frameRate: 18, repeat: -1 });
    for (const [pose, list] of Object.entries(TORSO_ANIMS) as Array<[WeaponPose, ReadonlyArray<readonly [string, number]>]>) {
      for (const [a, n] of list) {
        // reload speed is set per weapon when played (CharacterView)
        const rate = a === 'idle' ? 2 : a === 'shoot' ? 30 : a === 'hit' ? 14 : a === 'swing' ? 22 : n / 1.6;
        anims.create({ key: `${c}_${pose}_${a}`, frames: frames(c, `${pose}_${a}`, n), frameRate: rate, repeat: a === 'idle' ? -1 : 0 });
      }
    }
    anims.create({ key: `${c}_death`, frames: frames(c, 'death', 6), frameRate: 12, repeat: 0 });
  }
}
