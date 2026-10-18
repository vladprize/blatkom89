/**
 * A player's loadout: what they spawn with. Validated on the server against what the player owns
 * (see economy.ts); the same shape drives offline practice and bots.
 */
import { WEAPONS, isWeaponId, sanitizeMods } from './weapons.js';
import type { WeaponId, WeaponMods } from './weapons.js';

export interface Loadout {
  /** Slot 1: infinite reserve. */
  sidearm: WeaponId;
  /** Slot 2. */
  melee: WeaponId;
  /** Slot 3: spawns with a full magazine and one spare; map pickups can replace it. Null = none. */
  primary: WeaponId | null;
  /** Upgrade levels per weapon. */
  mods: Partial<Record<WeaponId, WeaponMods>>;
}

export const DEFAULT_LOADOUT: Readonly<Loadout> = Object.freeze({ sidearm: 'pistol', melee: 'montirovka', primary: 'avtomat', mods: {} });

/**
 * Coerces untrusted input into a valid loadout: every weapon must exist, fit its slot and pass
 * `allowed` (ownership); anything else falls back to the free default for that slot.
 */
export function sanitizeLoadout(raw: unknown, allowed: (w: WeaponId) => boolean = () => true): Loadout {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const pick = (v: unknown, slot: 1 | 2 | 3, fallback: WeaponId | null): WeaponId | null => (isWeaponId(v) && WEAPONS[v].slot === slot && allowed(v) ? v : fallback);
  const mods: Loadout['mods'] = {};
  if (r.mods && typeof r.mods === 'object') {
    for (const [k, v] of Object.entries(r.mods as Record<string, unknown>)) {
      if (!isWeaponId(k) || !allowed(k)) continue;
      const m = sanitizeMods(v);
      if (Object.keys(m).length) mods[k] = m;
    }
  }
  return {
    sidearm: pick(r.sidearm, 1, DEFAULT_LOADOUT.sidearm)!,
    melee: pick(r.melee, 2, DEFAULT_LOADOUT.melee)!,
    primary: r.primary === null ? null : pick(r.primary, 3, DEFAULT_LOADOUT.primary),
    mods,
  };
}
