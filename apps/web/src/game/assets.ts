/** Asset keys and animation registration (frame names follow tools/art/build-characters.ts). */
import * as Phaser from 'phaser';
import { CHARACTER_IDS, WEAPONS } from '@blatkom/shared';
import type { CharacterId, WeaponId } from '@blatkom/shared';
import { inlineAsset } from '../app/inline.js';

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
] as const;
export const WALL_KEYS = ['brick', 'concrete', 'panel', 'corrugated', 'fence_concrete', 'roof_flat', 'fence_chain'] as const;

export const TORSO_ANIMS: Record<WeaponId, Array<[string, number]>> = {
  pistol: [['idle', 2], ['shoot', 3], ['reload', 6], ['hit', 2]],
  obrez: [['idle', 2], ['shoot', 3], ['reload', 6], ['hit', 2]],
  avtomat: [['idle', 2], ['shoot', 3], ['reload', 6], ['hit', 2]],
  montirovka: [['idle', 2], ['swing', 5], ['hit', 2]],
};

export function preloadAssets(scene: Phaser.Scene, base = 'assets/'): void {
  const l = scene.load;
  l.setPath(base);
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
  for (const c of CHARACTER_IDS) l.atlas(`char_${c}`, v(`sprites/char_${c}.png`), j(`sprites/char_${c}.json`));
  l.atlas('props', v('sprites/props.png'), j('sprites/props.json'));
  l.atlas('fx', v('sprites/fx.png'), j('sprites/fx.json'));
  for (const f of FLOOR_KEYS) l.image(`floor_${f}`, v(`tiles/floor_${f}.png`));
  for (const w of WALL_KEYS) l.image(`wall_${w}`, v(`tiles/wall_${w}.png`));
  l.image('pipe', v('tiles/pipe.png'));
  for (const c of CHARACTER_IDS) {
    l.image(`portrait_${c}`, v(`portraits/${c}.png`));
    l.image(`portrait_small_${c}`, v(`portraits/${c}_small.png`));
  }
  l.image('logo', v('ui/logo.png'));
}

export function animKey(c: CharacterId, part: string): string {
  return `${c}_${part}`;
}

export function registerAnimations(scene: Phaser.Scene): void {
  const anims = scene.anims;
  const frames = (c: CharacterId, prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ key: `char_${c}`, frame: `${c}_${prefix}_${i}` }));
  for (const c of CHARACTER_IDS) {
    if (anims.exists(`${c}_legs_walk`)) continue;
    anims.create({ key: `${c}_legs_idle`, frames: frames(c, 'legs_idle', 1), frameRate: 1, repeat: -1 });
    anims.create({ key: `${c}_legs_walk`, frames: frames(c, 'legs_walk', 8), frameRate: 12, repeat: -1 });
    anims.create({ key: `${c}_legs_run`, frames: frames(c, 'legs_run', 8), frameRate: 18, repeat: -1 });
    for (const [w, list] of Object.entries(TORSO_ANIMS) as Array<[WeaponId, Array<[string, number]>]>) {
      for (const [a, n] of list) {
        const rate = a === 'idle' ? 2 : a === 'shoot' ? 30 : a === 'hit' ? 14 : a === 'swing' ? 22 : n / (WEAPONS[w].reloadMs / 1000);
        anims.create({ key: `${c}_${w}_${a}`, frames: frames(c, `${w}_${a}`, n), frameRate: rate, repeat: a === 'idle' ? -1 : 0 });
      }
    }
    anims.create({ key: `${c}_death`, frames: frames(c, 'death', 6), frameRate: 12, repeat: 0 });
  }
}
