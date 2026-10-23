/**
 * The big pictures of places (the owner's art, 1600×900 in `assets/scenes/`): behind the story's comic
 * pages, on a map's loading screen, in the hub's mission rows and behind a mission's end. Every map has
 * one, and 2089 its hall; a place added later without a picture keeps the comic's card layout.
 */
import type { MapId } from '@blatkom/shared';
import { asset } from '../ui/dom.js';
import type { Beat } from './script.js';

export const SCENE_IDS = ['yard', 'garages', 'factory', 'camp', 'cemetery', 'univermag', 'square', 'dk', 'stroyka', 'hospital', 'hall2089'] as const;
export type SceneId = (typeof SCENE_IDS)[number];

/** Where the eye goes (percent of the width and height): the crop on narrow screens and the camera's slow push. */
export const SCENE_FOCUS: Record<SceneId, readonly [number, number]> = {
  yard: [42, 62],
  garages: [52, 58],
  factory: [50, 60],
  camp: [48, 58],
  hall2089: [44, 56],
  cemetery: [50, 62],
  univermag: [52, 62],
  square: [40, 58],
  dk: [34, 60],
  stroyka: [48, 60],
  hospital: [52, 62],
};

/** A map's picture (the Gastronom gets the department store: the nearest shop in the set). */
export const MAP_SCENE: Partial<Record<MapId, SceneId>> = {
  yard: 'yard',
  garages: 'garages',
  factory: 'factory',
  camp: 'camp',
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

/** 2089: the BLATKOM hall — the capsules, the wall of screens, the man on the balcony. */
export const SCENE_2089: SceneId = 'hall2089';

/** The picture behind a comic page: its own, else 2089's hall for a page in 2089, else the comic's place. */
export function beatScene(b: Beat, fallback: SceneId | null | undefined): SceneId | null {
  if (b.scene !== undefined) return b.scene;
  return b.fx === 'neon' ? SCENE_2089 : (fallback ?? null);
}
