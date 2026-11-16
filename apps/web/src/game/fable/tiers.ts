/**
 * Fable cut: what each quality tier pays for. «Кино» is everything; «Баланс» keeps the picture and halves
 * the cost of what moves; «Быстро» keeps what is free once baked (the lamps' shadows, the colour grade).
 */
export type FableTier = 0 | 1 | 2;

export interface TierConfig {
  /** Light-map texels per world pixel. */
  lightRes: number;
  /** Lamp positions sampled when a lamp is baked (soft shadows). */
  samples: number;
  /** The local player's own light throws shadows. */
  playerShadows: boolean;
  /** Flashes that throw shadows in one frame (the rest are plain pools). */
  shadowFlashes: number;
  /** Bloom passes over the half-size picture (0: no bloom). */
  bloomPasses: number;
  /** Dust, moths, rain: how much of it, 0–1. */
  life: number;
  /** The room's echo on the sounds. */
  reverb: boolean;
}

export const TIERS: Record<FableTier, TierConfig> = {
  0: { lightRes: 0.5, samples: 1, playerShadows: false, shadowFlashes: 0, bloomPasses: 0, life: 0.35, reverb: false },
  1: { lightRes: 0.5, samples: 4, playerShadows: true, shadowFlashes: 1, bloomPasses: 2, life: 0.65, reverb: true },
  2: { lightRes: 1, samples: 7, playerShadows: true, shadowFlashes: 3, bloomPasses: 3, life: 1, reverb: true },
};

export const TIER_NAMES: Record<FableTier, string> = { 0: 'fast', 1: 'balanced', 2: 'cine' };
