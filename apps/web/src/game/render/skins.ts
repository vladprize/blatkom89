/**
 * Weapon skins on screen: an atlas frame of «weapons» (the weapon in hand `w_*`, the HUD icon
 * `ico_*`) painted with a finish becomes its own canvas texture with the frame's full size, so it
 * keeps the frame's origin (the grip); the Arsenal's DOM icons get a painted data URL. Both are made
 * once and cached; a missing frame or a canvas that cannot be read falls back to the plain weapon.
 */
import type * as Phaser from 'phaser';
import type { FinishId, WeaponId } from '@blatkom/shared';
import { paintFinish } from './finish.js';
import { asset } from '../../ui/dom.js';

/** Texture key of `frame` («w_avtomat», «ico_avtomat») painted with `finish`; '' when it cannot be made. */
export function skinTextureKey(textures: Phaser.Textures.TextureManager, frame: string, finish: FinishId): string {
  const key = `skin~${frame}~${finish}`;
  if (textures.exists(key)) return key;
  if (!textures.exists('weapons')) return '';
  const atlas = textures.get('weapons');
  if (!atlas.has(frame)) return '';
  const f = atlas.get(frame);
  try {
    const tex = textures.createCanvas(key, f.realWidth, f.realHeight);
    if (!tex) return '';
    const ctx = tex.getContext();
    ctx.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, f.x, f.y, f.cutWidth, f.cutHeight);
    const img = ctx.getImageData(f.x, f.y, f.cutWidth, f.cutHeight);
    paintFinish(img.data, f.cutWidth, f.cutHeight, finish);
    ctx.putImageData(img, f.x, f.y);
    tex.refresh();
    return key;
  } catch {
    if (textures.exists(key)) textures.remove(key);
    return '';
  }
}

/** Sets an image to the weapon frame, painted when a finish is given. */
export function setWeaponTexture(img: Phaser.GameObjects.Image, frame: string, finish: FinishId | null): void {
  const key = finish ? skinTextureKey(img.scene.textures, frame, finish) : '';
  if (key) {
    if (img.texture.key !== key) img.setTexture(key);
  } else if (img.texture.key !== 'weapons' || img.frame.name !== frame) img.setTexture('weapons', frame);
}

const icons = new Map<string, Promise<string>>();

/** The Arsenal icon (assets/ui/weapons) of `weapon` painted with `finish`, as a data URL. */
export function skinIconUrl(weapon: WeaponId, finish: FinishId, small = false): Promise<string> {
  const key = `${weapon}.${finish}${small ? '_s' : ''}`;
  let p = icons.get(key);
  if (!p) {
    p = new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          if (!ctx) return reject(new Error('no 2d context'));
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, c.width, c.height);
          paintFinish(d.data, c.width, c.height, finish);
          ctx.putImageData(d, 0, 0);
          resolve(c.toDataURL());
        } catch (e) {
          reject(e as Error);
        }
      };
      img.onerror = () => reject(new Error('icon not loaded'));
      img.src = asset(`assets/ui/weapons/${weapon}${small ? '_s' : ''}.png`);
    });
    p.catch(() => icons.delete(key));
    icons.set(key, p);
  }
  return p;
}
