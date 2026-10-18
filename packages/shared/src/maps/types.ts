import type { WeaponId } from '../game-rules/weapons.js';
import type { PropType } from './props.js';

export const MAP_IDS = ['factory', 'garages', 'yard'] as const;
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
  | 'gravel';

export type WallStyle =
  | 'brick'
  | 'concrete'
  | 'panel'
  | 'corrugated'
  | 'fence_chain'
  | 'fence_concrete'
  | 'roof_flat'
  | 'roof_garage'
  | 'roof_booth';

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
  | { kind: 'star'; x: number; y: number; r: number; color: string; alpha?: number }
  | { kind: 'line'; x: number; y: number; w: number; h: number; color: string; alpha?: number }
  | { kind: 'hopscotch'; x: number; y: number; angle?: number }
  | { kind: 'manhole'; x: number; y: number };

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
  kind: 'tree' | 'pipe' | 'canopy' | 'wires' | 'bush';
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: Rotation;
  seed?: number;
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
  /** Ambient light colour multiplier for the night lightmap (0xRRGGBB) and strength 0..1. */
  ambient: { color: number; level: number };
  /** Minimap palette hint. */
  minimapFloor: string;
}
