/**
 * Centralized weapon configuration. Every combat number lives here and is used verbatim by the
 * authoritative server, the offline simulation and client-side prediction.
 */
export const WEAPON_IDS = ['pistol', 'montirovka', 'obrez', 'avtomat'] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];
export type HeavyWeaponId = 'obrez' | 'avtomat';
export const HEAVY_WEAPONS: readonly HeavyWeaponId[] = ['obrez', 'avtomat'];

export interface WeaponDef {
  id: WeaponId;
  index: number;
  name: string;
  /** Inventory slot shown in the HUD (1 = pistol, 2 = melee, 3 = heavy). */
  slot: 1 | 2 | 3;
  kind: 'hitscan' | 'melee';
  /** Damage per pellet (hitscan) or per swing (melee). */
  damage: number;
  pellets: number;
  fireIntervalMs: number;
  /** Fire continues while the trigger is held. */
  automatic: boolean;
  range: number;
  falloffStart: number;
  minDamageFactor: number;
  /** Half-angle of the random cone in radians. */
  spread: number;
  spreadPerShot: number;
  spreadMax: number;
  /** Radians per second recovered while not firing. */
  spreadRecovery: number;
  magazine: number;
  /** -1 = infinite reserve. */
  reserveMax: number;
  reserveOnPickup: number;
  reloadMs: number;
  /** Melee only. */
  meleeArc: number;
  meleeRange: number;
  /** Visual muzzle offset in world px (forward, side) relative to the body centre. */
  muzzle: { forward: number; side: number };
  /** Camera shake strength for the shooter (0..1). */
  shake: number;
  sound: 'pistol' | 'obrez' | 'avtomat' | 'swing';
}

const base = {
  pellets: 1,
  falloffStart: 9999,
  minDamageFactor: 1,
  spreadPerShot: 0,
  spreadMax: 0,
  spreadRecovery: 0,
  meleeArc: 0,
  meleeRange: 0,
  reserveOnPickup: 0,
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    ...base,
    id: 'pistol',
    index: 0,
    name: 'Пистолет',
    slot: 1,
    kind: 'hitscan',
    damage: 34,
    fireIntervalMs: 290,
    automatic: true,
    range: 520,
    falloffStart: 320,
    minDamageFactor: 0.75,
    spread: 0.028,
    magazine: 8,
    reserveMax: -1,
    reloadMs: 1100,
    muzzle: { forward: 19, side: 2 },
    shake: 0.15,
    sound: 'pistol',
  },
  montirovka: {
    ...base,
    id: 'montirovka',
    index: 1,
    name: 'Монтировка',
    slot: 2,
    kind: 'melee',
    damage: 55,
    fireIntervalMs: 460,
    automatic: true,
    range: 36,
    spread: 0,
    magazine: 0,
    reserveMax: 0,
    reloadMs: 0,
    meleeArc: (115 * Math.PI) / 180,
    meleeRange: 36,
    muzzle: { forward: 22, side: 6 },
    shake: 0.2,
    sound: 'swing',
  },
  obrez: {
    ...base,
    id: 'obrez',
    index: 2,
    name: 'Обрез',
    slot: 3,
    kind: 'hitscan',
    damage: 15,
    pellets: 7,
    fireIntervalMs: 620,
    automatic: true,
    range: 270,
    falloffStart: 70,
    minDamageFactor: 0.3,
    spread: 0.19,
    magazine: 2,
    reserveMax: 16,
    reserveOnPickup: 10,
    reloadMs: 1500,
    muzzle: { forward: 23, side: 2 },
    shake: 0.55,
    sound: 'obrez',
  },
  avtomat: {
    ...base,
    id: 'avtomat',
    index: 3,
    name: 'Автомат',
    slot: 3,
    kind: 'hitscan',
    damage: 17,
    fireIntervalMs: 100,
    automatic: true,
    range: 620,
    falloffStart: 380,
    minDamageFactor: 0.7,
    spread: 0.03,
    spreadPerShot: 0.012,
    spreadMax: 0.12,
    spreadRecovery: 0.3,
    magazine: 30,
    reserveMax: 90,
    reserveOnPickup: 60,
    reloadMs: 1700,
    muzzle: { forward: 27, side: 2 },
    shake: 0.22,
    sound: 'avtomat',
  },
};

export const WEAPON_BY_INDEX: readonly WeaponId[] = WEAPON_IDS.slice().sort(
  (a, b) => WEAPONS[a].index - WEAPONS[b].index,
);

export function isWeaponId(v: unknown): v is WeaponId {
  return typeof v === 'string' && (WEAPON_IDS as readonly string[]).includes(v);
}

export function isHeavy(id: WeaponId): id is HeavyWeaponId {
  return id === 'obrez' || id === 'avtomat';
}

/** Damage multiplier for a hit at distance `d`. */
export function damageFalloff(w: WeaponDef, d: number): number {
  if (d <= w.falloffStart) return 1;
  if (d >= w.range) return w.minDamageFactor;
  const t = (d - w.falloffStart) / (w.range - w.falloffStart);
  return 1 + (w.minDamageFactor - 1) * t;
}
