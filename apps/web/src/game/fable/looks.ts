/**
 * Fable cut: each map's own look — how dark its night is, what the picture is graded towards, what hangs in
 * the lamps' light, the weather it gets and how it sounds. All of it is the client's: the maps themselves,
 * their collision and the rules are the shared package's and are not touched.
 */
import type { MapId } from '@blatkom/shared';

export interface MapLook {
  /** Multiplies the night's own light: lower is darker away from the lamps. */
  night: number;
  /** Split toning: the darks lean to the first colour, the lights to the second (1, 1, 1: untouched). */
  shadows: readonly [number, number, number];
  highlights: readonly [number, number, number];
  saturation: number;
  contrast: number;
  /** How much of the blurred highlights is laid back over the picture. */
  bloom: number;
  vignette: number;
  /** What hangs in the lamps' light. */
  motes: 'dust' | 'moths' | 'none';
  /** Weather the classic picture does not have (the snow is the map's own). */
  weather: 'rain' | 'none';
  /** The echo: a hall, a courtyard between the blocks, an open field, small rooms. */
  reverb: 'hall' | 'yard' | 'open' | 'rooms';
  /** The bed under the fight: machines behind a wall, a night street, the wind. */
  bed: 'works' | 'street' | 'wind' | 'rooms';
}

const COOL: readonly [number, number, number] = [0.9, 0.97, 1.08];
const WARM: readonly [number, number, number] = [1.08, 1.0, 0.88];

const BASE: MapLook = { night: 0.74, shadows: COOL, highlights: WARM, saturation: 1.08, contrast: 1.08, bloom: 0.85, vignette: 0.55, motes: 'dust', weather: 'none', reverb: 'yard', bed: 'street' };

export const LOOKS: Record<MapId, MapLook> = {
  // the works at night: sodium lamps, steel-blue dark, dust in every beam
  factory: { ...BASE, night: 0.68, shadows: [0.88, 0.97, 1.1], highlights: [1.1, 1.0, 0.86], bloom: 0.95, motes: 'dust', reverb: 'hall', bed: 'works' },
  // the garages in the rain: wet asphalt, lamps with halos
  garages: { ...BASE, night: 0.66, shadows: [0.84, 0.98, 1.12], highlights: [1.08, 1.0, 0.9], bloom: 1.05, motes: 'none', weather: 'rain', reverb: 'yard', bed: 'street' },
  // the courtyard: a warm evening, moths at the lamps
  yard: { ...BASE, night: 0.78, shadows: [0.9, 0.96, 1.1], highlights: [1.1, 1.02, 0.88], saturation: 1.1, bloom: 0.85, motes: 'moths', reverb: 'yard', bed: 'street' },
  // the building site: floodlights, hard and pale
  stroyka: { ...BASE, night: 0.66, shadows: [0.86, 0.96, 1.1], highlights: [1.04, 1.02, 0.96], contrast: 1.12, bloom: 0.9, motes: 'dust', reverb: 'open', bed: 'wind' },
  // the house of culture: velvet and brass
  dk: { ...BASE, night: 0.72, shadows: [0.94, 0.9, 1.06], highlights: [1.12, 1.0, 0.86], saturation: 1.12, bloom: 0.9, motes: 'dust', reverb: 'hall', bed: 'rooms' },
  // the food shop: green-white tubes
  gastronom: { ...BASE, night: 0.74, shadows: [0.88, 1.0, 1.06], highlights: [1.0, 1.04, 0.96], bloom: 0.8, motes: 'none', reverb: 'rooms', bed: 'rooms' },
  // the hospital: cold corridors
  hospital: { ...BASE, night: 0.68, shadows: [0.84, 1.0, 1.1], highlights: [0.98, 1.04, 1.0], saturation: 0.98, bloom: 0.85, motes: 'none', reverb: 'rooms', bed: 'rooms' },
  // the cemetery: violet dark, candle light
  cemetery: { ...BASE, night: 0.62, shadows: [0.9, 0.9, 1.16], highlights: [1.12, 0.98, 0.84], bloom: 1.0, vignette: 0.7, motes: 'moths', reverb: 'open', bed: 'wind' },
  // the square: banners and floodlights
  square: { ...BASE, night: 0.74, shadows: [0.94, 0.9, 1.06], highlights: [1.1, 0.98, 0.9], saturation: 1.12, bloom: 0.9, motes: 'none', weather: 'rain', reverb: 'open', bed: 'street' },
  // the pioneer camp: a summer night by the water
  camp: { ...BASE, night: 0.68, shadows: [0.84, 1.0, 1.1], highlights: [1.1, 1.02, 0.86], bloom: 0.9, motes: 'moths', reverb: 'open', bed: 'wind' },
  // the market: a hundred bulbs
  cherkizon: { ...BASE, night: 0.74, shadows: [0.94, 0.92, 1.06], highlights: [1.1, 1.0, 0.88], saturation: 1.14, bloom: 0.95, motes: 'moths', reverb: 'yard', bed: 'street' },
  // the north: blue frost, the snow is the map's own
  vorkuta: { ...BASE, night: 0.78, shadows: [0.84, 0.98, 1.16], highlights: [1.04, 1.0, 0.94], saturation: 1.0, bloom: 1.0, motes: 'none', reverb: 'open', bed: 'wind' },
};

export function lookOf(mapId: MapId): MapLook {
  return LOOKS[mapId] ?? BASE;
}
