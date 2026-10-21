/**
 * Weapon skins (v0.23): a finish — a paint job from the late-Soviet everyday (birch camo, Gzhel,
 * Khokhloma, «party gold»…) — on one particular weapon. Skins change only how a weapon looks: never
 * its numbers. They come from the skin case (talons since v0.24, never a duplicate); a skin is
 * equipped on its weapon in the Arsenal and everybody in the match sees it.
 */
import { WEAPON_IDS, isWeaponId } from './weapons.js';
import type { WeaponId } from './weapons.js';
import type { ShopPrice } from './economy.js';

export const FINISH_IDS = ['berezka', 'rzhavchina', 'zima', 'flora', 'gzhel', 'pioner', 'malahit', 'hohloma', 'zoloto', 'yantar'] as const;
export type FinishId = (typeof FINISH_IDS)[number];

export type SkinRarity = 'common' | 'rare' | 'epic' | 'legendary';
export const SKIN_RARITIES: readonly SkinRarity[] = ['common', 'rare', 'epic', 'legendary'];

export interface Finish {
  id: FinishId;
  /** English name (Russian in the client's ru-content). */
  name: string;
  rarity: SkinRarity;
}

export const FINISHES: Readonly<Record<FinishId, Finish>> = Object.freeze({
  berezka: { id: 'berezka', name: 'Birch Camo', rarity: 'common' },
  rzhavchina: { id: 'rzhavchina', name: 'Rust', rarity: 'common' },
  zima: { id: 'zima', name: 'Winter', rarity: 'common' },
  flora: { id: 'flora', name: 'Flora', rarity: 'rare' },
  gzhel: { id: 'gzhel', name: 'Gzhel', rarity: 'rare' },
  pioner: { id: 'pioner', name: 'Pioneer', rarity: 'rare' },
  malahit: { id: 'malahit', name: 'Malachite', rarity: 'epic' },
  hohloma: { id: 'hohloma', name: 'Khokhloma', rarity: 'epic' },
  zoloto: { id: 'zoloto', name: 'Party Gold', rarity: 'legendary' },
  yantar: { id: 'yantar', name: 'Amber', rarity: 'legendary' },
});

export function isFinishId(v: unknown): v is FinishId {
  return typeof v === 'string' && (FINISH_IDS as readonly string[]).includes(v);
}

/** Price of the skin case (v0.24: talons — there is no money in it). */
export const SKIN_CASE_PRICE: ShopPrice = { currency: 'tokens', amount: 150, level: 1 };

/** Chance of each rarity in percent (sums to 100) while every rarity still has skins to give. */
export const SKIN_RARITY_CHANCE: Readonly<Record<SkinRarity, number>> = Object.freeze({ common: 55, rare: 28, epic: 13, legendary: 4 });

/** Every weapon can wear every finish. */
export const SKINNABLE_WEAPONS: readonly WeaponId[] = WEAPON_IDS;

/** A skin's id: `weapon.finish` (e.g. `avtomat.hohloma`). */
export type SkinId = string;

export function skinId(weapon: WeaponId, finish: FinishId): SkinId {
  return `${weapon}.${finish}`;
}

export function parseSkin(id: unknown): { weapon: WeaponId; finish: FinishId } | null {
  if (typeof id !== 'string') return null;
  const dot = id.indexOf('.');
  if (dot <= 0) return null;
  const weapon = id.slice(0, dot);
  const finish = id.slice(dot + 1);
  return isWeaponId(weapon) && isFinishId(finish) && SKINNABLE_WEAPONS.includes(weapon) ? { weapon, finish } : null;
}

export function isSkinId(v: unknown): v is SkinId {
  return parseSkin(v) !== null;
}

/** Every skin there is (weapons × finishes). */
export function allSkins(): SkinId[] {
  const out: SkinId[] = [];
  for (const w of SKINNABLE_WEAPONS) for (const f of FINISH_IDS) out.push(skinId(w, f));
  return out;
}

/**
 * Odds of each rarity for a player who owns `owned`: a rarity whose skins are all owned drops out and
 * the others share its chance. All zero when the collection is complete.
 */
export function skinCaseOdds(owned: ReadonlySet<SkinId>): Record<SkinRarity, number> {
  const left = new Map<SkinRarity, number>(SKIN_RARITIES.map((r) => [r, 0]));
  for (const w of SKINNABLE_WEAPONS) for (const f of FINISH_IDS) if (!owned.has(skinId(w, f))) left.set(FINISHES[f].rarity, left.get(FINISHES[f].rarity)! + 1);
  const total = SKIN_RARITIES.reduce((s, r) => s + (left.get(r)! > 0 ? SKIN_RARITY_CHANCE[r] : 0), 0);
  const out = {} as Record<SkinRarity, number>;
  for (const r of SKIN_RARITIES) out[r] = total === 0 || left.get(r) === 0 ? 0 : (SKIN_RARITY_CHANCE[r] / total) * 100;
  return out;
}

export interface SkinDrop {
  weapon: WeaponId;
  finish: FinishId;
  rarity: SkinRarity;
}

/**
 * Draws a skin the player does not own: first the rarity (by its odds), then any unowned skin of that
 * rarity with equal chance. `rand` is uniform in [0, 1). Null when the collection is complete.
 */
export function drawSkin(owned: ReadonlySet<SkinId>, rand: () => number): SkinDrop | null {
  const odds = skinCaseOdds(owned);
  let x = Math.min(Math.max(rand(), 0), 0.999999999) * 100;
  let rarity: SkinRarity | null = null;
  for (const r of SKIN_RARITIES) {
    if (odds[r] <= 0) continue;
    rarity = r;
    x -= odds[r];
    if (x < 0) break;
  }
  if (!rarity) return null;
  const pool: SkinDrop[] = [];
  for (const w of SKINNABLE_WEAPONS) for (const f of FINISH_IDS) if (FINISHES[f].rarity === rarity && !owned.has(skinId(w, f))) pool.push({ weapon: w, finish: f, rarity });
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(Math.min(Math.max(rand(), 0), 0.999999999) * pool.length))]!;
}

/**
 * Coerces an untrusted «equipped skins» map: known weapons only, owned skins only (a finish per weapon).
 */
export function sanitizeSkins(raw: unknown, owns: (weapon: WeaponId, finish: FinishId) => boolean = () => true): Partial<Record<WeaponId, FinishId>> {
  const out: Partial<Record<WeaponId, FinishId>> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [w, f] of Object.entries(raw as Record<string, unknown>)) {
    if (isWeaponId(w) && SKINNABLE_WEAPONS.includes(w) && isFinishId(f) && owns(w, f)) out[w] = f;
  }
  return out;
}
