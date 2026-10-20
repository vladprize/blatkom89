/**
 * A player's loadout: what they spawn with. Validated on the server against what the player owns
 * (see economy.ts); the same shape drives offline practice and bots.
 */
import { WEAPONS, isWeaponId, sanitizeMods } from './weapons.js';
import type { ModId, WeaponId } from './weapons.js';
import { isGadgetId } from './gadgets.js';
import type { GadgetId } from './gadgets.js';
import { sanitizeSkins } from './skins.js';
import type { FinishId } from './skins.js';

export interface Loadout {
  /** Slot 1: infinite reserve. */
  sidearm: WeaponId;
  /** Slot 2. */
  melee: WeaponId;
  /** Slot 3: spawns with a full magazine and one spare; map pickups can replace it. Null = none. */
  primary: WeaponId | null;
  /** Slot 4: grenade or gadget type (charges refill every life). Null = none. */
  gadget: GadgetId | null;
  /** Equipped modifications per weapon (one per mount, see weapons.ts → MODS). */
  mods: Partial<Record<WeaponId, ModId[]>>;
  /** Equipped skins: the finish each weapon wears (looks only, see skins.ts). */
  skins?: Partial<Record<WeaponId, FinishId>>;
}

export const DEFAULT_LOADOUT: Readonly<Loadout> = Object.freeze({ sidearm: 'pistol', melee: 'montirovka', primary: 'avtomat', gadget: 'f1', mods: {}, skins: {} });

export interface LoadoutOwnership {
  weapon?(w: WeaponId): boolean;
  gadget?(g: GadgetId): boolean;
  mod?(w: WeaponId, m: ModId): boolean;
  /** Owns the skin (a weapon need not be owned to wear its skin when picked up). */
  skin?(w: WeaponId, f: FinishId): boolean;
}

/**
 * Coerces untrusted input into a valid loadout: every weapon must exist, fit its slot and be owned;
 * the gadget must be owned; modifications must be owned, fit the weapon and use one mount each.
 * Anything else falls back to the free default for that slot.
 */
export function sanitizeLoadout(raw: unknown, own: LoadoutOwnership = {}): Loadout {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const ownsW = own.weapon ?? (() => true);
  const ownsG = own.gadget ?? (() => true);
  const ownsM = own.mod ?? (() => true);
  const pick = (v: unknown, slot: 1 | 2 | 3, fallback: WeaponId | null): WeaponId | null => (isWeaponId(v) && WEAPONS[v].slot === slot && ownsW(v) ? v : fallback);
  const mods: Loadout['mods'] = {};
  if (r.mods && typeof r.mods === 'object' && !Array.isArray(r.mods)) {
    for (const [k, v] of Object.entries(r.mods as Record<string, unknown>)) {
      if (!isWeaponId(k) || !ownsW(k)) continue;
      const m = sanitizeMods(v, k).filter((x) => ownsM(k, x));
      if (m.length) mods[k] = m;
    }
  }
  const gadget = r.gadget === null ? null : isGadgetId(r.gadget) && ownsG(r.gadget) ? r.gadget : DEFAULT_LOADOUT.gadget;
  return {
    sidearm: pick(r.sidearm, 1, DEFAULT_LOADOUT.sidearm)!,
    melee: pick(r.melee, 2, DEFAULT_LOADOUT.melee)!,
    primary: r.primary === null ? null : pick(r.primary, 3, DEFAULT_LOADOUT.primary),
    gadget,
    mods,
    skins: sanitizeSkins(r.skins, own.skin ?? (() => true)),
  };
}
