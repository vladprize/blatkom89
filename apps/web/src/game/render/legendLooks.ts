/**
 * v0.2.24 (the owner: «скины легендарных персонажей сделай с анимацией, как и легендарное оружие»): the
 * legendary characters' own light — on every fighter card (a foil sheen sweeping over the picture, their motes
 * drifting over it, the frame's running light) and in a match (a halo at their feet, the motes round them).
 * Each look follows the character's lore:
 * - Аркадич (lev), the shadow tycoon in gold — gold dust rising;
 * - Касатик (kasatka), who came from the north on a trawler — snow drifting down;
 * - Пятак (zvezda), the five-armed one out of the chemical plant's tank — five-pointed glints in his red.
 * Only the look: a legendary character plays exactly like any other (docs/ECONOMY.md).
 */
import { CHARACTERS } from '@blatkom/shared';
import type { CharacterId } from '@blatkom/shared';
import type { RGB } from './skinColors.js';

export type LegendMote = 'gold' | 'frost' | 'stars';

export interface LegendLook {
  /** The character's own colour (the frame's light, the sheen's tint). */
  main: RGB;
  /** A bright version for additive light (the halo, the motes). */
  glow: RGB;
  mote: LegendMote;
}

export const LEGEND_LOOKS: Readonly<Partial<Record<CharacterId, LegendLook>>> = Object.freeze({
  lev: { main: [212, 162, 55], glow: [255, 216, 120], mote: 'gold' },
  kasatka: { main: [120, 178, 220], glow: [214, 240, 255], mote: 'frost' },
  zvezda: { main: [216, 88, 74], glow: [255, 156, 112], mote: 'stars' },
});

/** The look of a legendary character (null for everyone else, or a legendary one this build has no look for). */
export function legendLook(c: CharacterId | null | undefined): LegendLook | null {
  if (!c || CHARACTERS[c]?.grade !== 'legendary') return null;
  return LEGEND_LOOKS[c] ?? null;
}

export const hexOf = (c: RGB): number => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
