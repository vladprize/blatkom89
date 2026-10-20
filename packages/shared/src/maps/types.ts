import type { WeaponId } from '../game-rules/weapons.js';
import type { PropType } from './props.js';

export const MAP_IDS = ['factory', 'garages', 'yard', 'stroyka', 'dk', 'gastronom', 'hospital', 'cemetery', 'square', 'camp'] as const;
export type MapId = (typeof MAP_IDS)[number];

export type FloorType =
  | 'concrete_slab'
  | 'concrete_dirty'
  | 'concrete_painted'
  | 'linoleum_checker'
  | 'tile_white'
  | 'wood'
  | 'metal_plate'
  | 'asphalt'
  | 'asphalt_cracked'
  | 'dirt'
  | 'grass'
  | 'sand'
  | 'gravel'
  | 'carpet_red'
  | 'parquet'
  | 'tile_green'
  | 'tile_beige'
  | 'marble'
  | 'paving'
  | 'cobble';

export type WallStyle =
  | 'brick'
  | 'concrete'
  | 'panel'
  | 'corrugated'
  | 'fence_chain'
  | 'fence_concrete'
  | 'roof_flat'
  | 'roof_garage'
  | 'roof_booth'
  | 'plaster'
  /** Cemetery railings: stop you, not bullets (like the chain-link fence). */
  | 'fence_iron'
  /** Open water (the camp's lake): stops you, not bullets; drawn as water, no wall. */
  | 'water'
  /** The fortress wall of the square: red brick with merlons. */
  | 'kremlin'
  /** Polished dark-red granite (the tribune). */
  | 'granite'
  /** A tiled church roof (no roof clutter on it). */
  | 'roof_church';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FloorRect extends Rect {
  type: FloorType;
}

export interface WallRect extends Rect {
  style: WallStyle;
  /** Free-form tag for the renderer (e.g. building name, roof details seed). */
  tag?: string;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface PropPlacement {
  type: PropType;
  /** Centre of the prop in world px. */
  x: number;
  y: number;
  rot: Rotation;
  variant?: number;
}

export type DecalPlacement =
  | {
      kind: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      color: string;
      angle?: number;
      alpha?: number;
      font?: 'stencil' | 'hand';
      /** 'roof' decals are drawn on top of high props (e.g. paint on garage roofs). */
      layer?: 'floor' | 'roof';
    }
  | { kind: 'arrow'; x: number; y: number; w: number; h: number; angle: number; color: string; text?: string; alpha?: number }
  | { kind: 'hazard'; x: number; y: number; w: number; h: number; alpha?: number }
  | { kind: 'stain'; x: number; y: number; r: number; color: string; alpha?: number; seed?: number }
  | { kind: 'star'; x: number; y: number; r: number; color: string; alpha?: number; layer?: 'floor' | 'roof' }
  | { kind: 'line'; x: number; y: number; w: number; h: number; color: string; alpha?: number; layer?: 'floor' | 'roof' }
  | { kind: 'hopscotch'; x: number; y: number; angle?: number }
  | { kind: 'manhole'; x: number; y: number }
  /** A flight of stairs (steps across the short side), seen from above. */
  | { kind: 'stairs'; x: number; y: number; w: number; h: number; alpha?: number }
  /** Dashed outline of a zone (danger zone under the crane, parking bays). */
  | { kind: 'dashrect'; x: number; y: number; w: number; h: number; color: string; alpha?: number }
  /** A painted cross (red cross of the hospital, first-aid posts). */
  | { kind: 'cross'; x: number; y: number; r: number; color: string; alpha?: number };

export interface LightDef {
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
  flicker?: 'none' | 'soft' | 'broken';
  /** Visible lamp fixture drawn at the light position. */
  fixture?: 'lamp' | 'street' | 'window' | 'neon' | 'none';
}

export interface OverheadDef {
  /** 'crane': a tower crane jib from (x, y) at `angle` degrees, `w` long, with a hook and a load at `h` along it. */
  kind: 'tree' | 'pipe' | 'canopy' | 'wires' | 'bush' | 'crane';
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: Rotation;
  seed?: number;
  angle?: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
  angle: number;
}

export interface PickupSpawn {
  x: number;
  y: number;
  /** A primary (slot 3) weapon. */
  weapon: WeaponId;
  respawnMs: number;
}

export interface MedkitSpawn {
  x: number;
  y: number;
  respawnMs: number;
}

export interface MapDef {
  id: MapId;
  name: string;
  subtitle: string;
  description: string;
  width: number;
  height: number;
  baseFloor: FloorType;
  floors: FloorRect[];
  walls: WallRect[];
  props: PropPlacement[];
  decals: DecalPlacement[];
  lights: LightDef[];
  overhead: OverheadDef[];
  spawns: SpawnPoint[];
  pickups: PickupSpawn[];
  /** Open spots where «дефицит» supply crates may be dropped during a match. */
  supplyPoints: Array<{ x: number; y: number }>;
  /** First-aid kits (restore health, respawn after a while). */
  medkits: MedkitSpawn[];
  /** Capture the flag: the stands of the red (0) and blue (1) flags, deep in each team's half. */
  flagStands: Array<{ x: number; y: number }>;
  /** Base capture: the bases A, B, C (centres; see BASES.radius). */
  bases: Array<{ x: number; y: number }>;
  /** Ambient light colour multiplier for the night lightmap (0xRRGGBB) and strength 0..1. */
  ambient: { color: number; level: number };
  /** Minimap palette hint. */
  minimapFloor: string;
}
