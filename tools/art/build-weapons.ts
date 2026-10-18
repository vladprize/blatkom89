/**
 * Weapons atlas + shop images + the generated client rig module:
 *   sprites/weapons.png/.json   w_<id> (in hand, origin = grip), pickup_<id>, ico_<id> (HUD silhouette),
 *                               pickup_medkit, proj_rocket, proj_grenade
 *   ui/weapons/<id>.png         side view for the shop (4 texels per world px)
 *   apps/web/src/game/render/rig.gen.ts   grip transform of every torso frame, muzzle points
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { render } from './lib/model.js';
import type { Prim } from './lib/model.js';
import { Img, hex } from './lib/raster.js';
import type { RGBA } from './lib/raster.js';
import { packAtlas } from './lib/pack.js';
import type { PackInput } from './lib/pack.js';
import { topPrims, sidePrims, transformPrims, topBounds, muzzleAtRest, medkitPrims, rocketPrims } from './weapons.js';
import { gripFor } from './characters.js';
import { TORSO_ANIMS, POSES } from './build-characters.js';
import { WEAPON_IDS, WEAPONS } from '../../packages/shared/src/game-rules/weapons.js';

/** Axis-aligned bounds of prims in the renderer's xy plane. */
export function primBounds(prims: Prim[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number, rx: number, ry = rx) => {
    x0 = Math.min(x0, x - rx);
    y0 = Math.min(y0, y - ry);
    x1 = Math.max(x1, x + rx);
    y1 = Math.max(y1, y + ry);
  };
  for (const p of prims) {
    if (p.k === 'cap') {
      const r = Math.max(p.r, p.r2 ?? p.r);
      add(p.a[0], p.a[1], r);
      add(p.b[0], p.b[1], r);
    } else if (p.k === 'ell') add(p.c[0], p.c[1], Math.max(p.r[0], p.r[1]));
    else if (p.k === 'box') {
      const m = Math.hypot(p.h[0], p.h[1]);
      add(p.c[0], p.c[1], p.yaw ? m : p.h[0], p.yaw ? m : p.h[1]);
    } else if (p.k === 'cyl') add(p.c[0], p.c[1], p.r);
  }
  return [x0, y0, x1, y1];
}

/** Renders prims framed by their bounds (plus margin), then trims to the drawn pixels. */
export function renderFit(prims: Prim[], scale: number, margin = 3): Img {
  const [x0, y0, x1, y1] = primBounds(prims);
  const w = Math.ceil((x1 - x0) * scale) + margin * 2 + 2;
  const h = Math.ceil((y1 - y0) * scale) + margin * 2 + 2;
  const img = render(prims, w, h, { scale, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
  const b = img.bounds();
  return b ? img.crop(Math.max(0, b.x - 1), Math.max(0, b.y - 1), Math.min(img.w - Math.max(0, b.x - 1), b.w + 2), Math.min(img.h - Math.max(0, b.y - 1), b.h + 2)) : img;
}

/** White silhouette with dark inner lines and outline (HUD icon style). */
function silhouette(src: Img): Img {
  const pad = 2;
  const out = new Img(src.w + pad * 2, src.h + pad * 2);
  const white: RGBA = hex('#f2ece0');
  const dark: RGBA = [12, 10, 9, 255];
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const c = src.get(x, y);
      if (c[3] < 128) continue;
      const luma = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
      // keep the renderer's outline only where it separates parts (interior), not the outer edge
      let interior = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (src.alpha(x + dx, y + dy) < 128) interior = false;
      out.set(x + pad, y + pad, luma < 34 && interior ? dark : white);
    }
  out.outline(dark);
  out.outline(dark, true);
  return out;
}

export function buildWeapons(spritesDir: string, uiDir: string, genFile: string): { atlas: { w: number; h: number; count: number } } {
  const frames: PackInput[] = [];
  mkdirSync(join(uiDir, 'weapons'), { recursive: true });
  for (const id of WEAPON_IDS) {
    const top = topPrims(id);
    // in hand: grip at the canvas centre (the client sets origin 0.5/0.5 = grip)
    frames.push({ name: `w_${id}`, img: render(top, 176, 96) });
    // lying on the floor: centred on the model, slightly turned
    const [x0, y0, x1, y1] = topBounds(id);
    const lying = transformPrims(top, -0.32, 0, 0);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const ca = Math.cos(-0.32);
    const sa = Math.sin(-0.32);
    frames.push({ name: `pickup_${id}`, img: render(transformPrims(lying, 0, -(cx * ca - cy * sa), -(cx * sa + cy * ca)), 128, 96) });
    const side = renderFit(sidePrims(id), 2);
    frames.push({ name: `ico_${id}`, img: silhouette(side) });
    renderFit(sidePrims(id), 4, 2).savePng(join(uiDir, 'weapons', `${id}.png`));
  }
  frames.push({ name: 'pickup_medkit', img: render(medkitPrims(), 40, 32) });
  frames.push({ name: 'proj_rocket', img: render(rocketPrims('rocket'), 32, 16) });
  frames.push({ name: 'proj_grenade', img: render(rocketPrims('grenade'), 16, 12) });
  const atlas = packAtlas(frames, join(spritesDir, 'weapons.png'));

  // generated client module: grip transform per torso frame + muzzle points at rest
  const grips: string[] = [];
  for (const pose of POSES)
    for (const [anim, n] of TORSO_ANIMS[pose])
      for (let i = 0; i < n; i++) {
        const g = gripFor({ pose, anim, frame: i, frames: n });
        grips.push(`  ${pose}_${anim}_${i}: [${g.x.toFixed(2)}, ${g.y.toFixed(2)}, ${g.rot.toFixed(4)}],`);
      }
  const muzzles: string[] = [];
  for (const id of WEAPON_IDS) {
    const pose = WEAPONS[id].pose;
    const g = gripFor({ pose, anim: 'idle', frame: 0, frames: 2 });
    const m = muzzleAtRest(id, g);
    muzzles.push(`  ${id}: { forward: ${m.forward}, side: ${m.side} },`);
  }
  const src = `// Generated by tools/art/build-weapons.ts (npm run assets) — do not edit.
// Paper-doll rig: torso frames are drawn per pose class without a weapon; the weapon sprite
// (atlas "weapons", frame w_<id>, origin = grip) is attached at GRIPS[frame] = [x, y, rotation]
// in body space (world px, character facing +x), and MUZZLES give the muzzle point at rest.
import type { WeaponId, WeaponPose } from '@blatkom/shared';

export const POSE_ANIMS: Record<WeaponPose, ReadonlyArray<readonly [string, number]>> = ${JSON.stringify(TORSO_ANIMS)};

export const GRIPS: Record<string, readonly [number, number, number]> = {
${grips.join('\n')}
};

export const MUZZLES: Record<WeaponId, { forward: number; side: number }> = {
${muzzles.join('\n')}
};
`;
  writeFileSync(genFile, src);
  return { atlas };
}
