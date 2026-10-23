/**
 * The big pictures of places (the owner's art, 1600×900 in `assets/scenes/`): behind the story's comic
 * pages and on a map's loading screen. A place without its picture keeps the comic's card layout.
 */
import type { MapId } from '@blatkom/shared';
import { asset } from '../ui/dom.js';
import type { Beat } from './script.js';

export const SCENE_IDS = ['cemetery', 'univermag', 'square', 'dk', 'stroyka', 'hospital'] as const;
export type SceneId = (typeof SCENE_IDS)[number];

/** Where the eye goes (percent of the width and height): the crop on narrow screens and the camera's slow push. */
export const SCENE_FOCUS: Record<SceneId, readonly [number, number]> = {
  cemetery: [50, 62],
  univermag: [52, 62],
  square: [40, 58],
  dk: [34, 60],
  stroyka: [48, 60],
  hospital: [52, 62],
};

/** A map's picture (the Gastronom gets the department store: the nearest shop in the set). */
export const MAP_SCENE: Partial<Record<MapId, SceneId>> = {
  cemetery: 'cemetery',
  gastronom: 'univermag',
  square: 'square',
  dk: 'dk',
  stroyka: 'stroyka',
  hospital: 'hospital',
};

export function sceneForMap(map: MapId | undefined): SceneId | null {
  return (map && MAP_SCENE[map]) || null;
}

export function sceneUrl(id: SceneId): string {
  return asset(`assets/scenes/${id}.jpg`);
}

/** The same picture small (640×360): a mission's row in the hub. */
export function sceneThumbUrl(id: SceneId): string {
  return asset(`assets/scenes/thumbs/${id}.jpg`);
}

/** The picture behind a comic page: its own, else — outside 2089 — the comic's. */
export function beatScene(b: Beat, fallback: SceneId | null | undefined): SceneId | null {
  if (b.scene !== undefined) return b.scene;
  return b.fx === 'neon' ? null : (fallback ?? null);
}
