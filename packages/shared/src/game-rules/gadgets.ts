/**
 * Equipment (inventory slot 4): grenades and gadgets from the product owner's arsenal sheet.
 * One gadget type is equipped in the loadout; every life starts with its charges. Everything is
 * simulated by the authoritative World (see sim/world.ts → gadgets); the client only draws it.
 */
import { WEAPON_IDS } from './weapons.js';
import type { WeaponId } from './weapons.js';

export const GADGET_IDS = ['f1', 'smoke', 'flash', 'molotov', 'mine', 'c4', 'turret'] as const;
export type GadgetId = (typeof GADGET_IDS)[number];

export type GadgetUse = 'throw' | 'place' | 'deploy';

export interface GadgetDef {
  id: GadgetId;
  index: number;
  name: string;
  blurb: string;
  use: GadgetUse;
  /** Charges per life. */
  charges: number;
  /** Throwables: launch speed (px/s); they slide with friction and bounce off walls. */
  throwSpeed: number;
  /** Time from throw/placement to effect (grenade fuse, mine arming). */
  fuseMs: number;
  /** Explosion / effect radius (px). */
  radius: number;
  /** Explosion damage at the centre (falls to 30 % at the edge); burn damage per tick for fire. */
  damage: number;
  /** Lingering effects (fire, smoke, turret) and placed charges: how long they last. */
  durationMs: number;
  /** Share of damage the owner takes from their own gadget. */
  selfFactor: number;
  /** Seconds between uses (anti-spam; per player). */
  cooldownMs: number;
}

const D = (d: Omit<GadgetDef, 'id' | 'index'>) => d;
const DEFS: Record<GadgetId, Omit<GadgetDef, 'id' | 'index'>> = {
  f1: D({ name: 'F-1 Grenade', blurb: 'The classic “limonka”: goes off after 1.8 s. Bounces off walls.', use: 'throw', charges: 2, throwSpeed: 520, fuseMs: 1800, radius: 100, damage: 110, durationMs: 0, selfFactor: 0.6, cooldownMs: 700 }),
  smoke: D({ name: 'Smoke Grenade', blurb: 'A cloud of smoke for 9 s: nobody sees you inside, bots lose their target.', use: 'throw', charges: 2, throwSpeed: 480, fuseMs: 1000, radius: 96, damage: 0, durationMs: 9000, selfFactor: 0, cooldownMs: 700 }),
  flash: D({ name: 'Flashbang', blurb: 'Blinds everyone looking its way for a couple of seconds.', use: 'throw', charges: 2, throwSpeed: 540, fuseMs: 1400, radius: 260, damage: 0, durationMs: 2600, selfFactor: 1, cooldownMs: 700 }),
  molotov: D({ name: 'Molotov Cocktail', blurb: 'Shatters on a wall or the floor — 5 s of fire that burns everyone inside.', use: 'throw', charges: 1, throwSpeed: 500, fuseMs: 900, radius: 72, damage: 7, durationMs: 5000, selfFactor: 0.5, cooldownMs: 700 }),
  mine: D({ name: 'Mine', blurb: 'Placed at your feet, armed in a second. Goes off when an enemy comes near.', use: 'place', charges: 2, throwSpeed: 0, fuseMs: 1200, radius: 78, damage: 120, durationMs: 60_000, selfFactor: 0.6, cooldownMs: 600 }),
  c4: D({ name: 'C4', blurb: 'A remote charge: one press to place it, the same button to blow it.', use: 'place', charges: 1, throwSpeed: 0, fuseMs: 500, radius: 120, damage: 150, durationMs: 45_000, selfFactor: 0.6, cooldownMs: 400 }),
  turret: D({ name: 'Turret', blurb: 'A home-made turret: fires at enemies in sight for 20 s. It can be destroyed.', use: 'deploy', charges: 1, throwSpeed: 0, fuseMs: 600, radius: 320, damage: 7, durationMs: 20_000, selfFactor: 0, cooldownMs: 600 }),
};

export const GADGETS: Record<GadgetId, GadgetDef> = Object.fromEntries(GADGET_IDS.map((id, index) => [id, { ...DEFS[id], id, index }])) as Record<GadgetId, GadgetDef>;

export function isGadgetId(v: unknown): v is GadgetId {
  return typeof v === 'string' && (GADGET_IDS as readonly string[]).includes(v);
}

/** Turret: health, fire interval, spread and ammunition. */
export const TURRET = Object.freeze({ hp: 100, radius: 9, fireIntervalMs: 160, spread: 0.06, ammo: 90, turnRate: 6.0 });
/** Thrown items slide on the floor with this deceleration (px/s²) and lose this share of speed on bounce. */
export const THROW_FRICTION = 700;
export const THROW_BOUNCE = 0.45;
/** Burning: one damage tick every this many ms. */
export const FIRE_TICK_MS = 250;
/** Mines trigger when an opponent comes this close (plus the player radius). Opponents see placed charges dimmed. */
export const MINE_TRIGGER = 26;

// ── «Arms»: weapons and gadgets share one id space on the wire (kill feed, damage, explosions) ──

export type ArmsId = WeaponId | GadgetId;

/** Wire index: weapons first, then gadgets. */
export function armsIndex(id: ArmsId): number {
  const w = (WEAPON_IDS as readonly string[]).indexOf(id);
  return w >= 0 ? w : WEAPON_IDS.length + GADGETS[id as GadgetId].index;
}

export function armsAt(i: number): ArmsId | undefined {
  if (i < WEAPON_IDS.length) return WEAPON_IDS[i];
  return GADGET_IDS[i - WEAPON_IDS.length];
}

export function isArmsId(v: unknown): v is ArmsId {
  return typeof v === 'string' && ((WEAPON_IDS as readonly string[]).includes(v) || (GADGET_IDS as readonly string[]).includes(v));
}
