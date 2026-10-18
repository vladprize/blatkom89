/**
 * In-game economy (configuration + pure rules; the server is the only authority that persists it).
 *
 *  - Tokens (shown in the game as «talons») are earned by playing online matches and are never sold.
 *  - Diamonds are bought for real money (100 💎 = $1) or granted by an administrator.
 *  - The four starting characters, the base weapons and the F-1 grenade are free for everyone.
 *  - Shop weapons are sidegrades (see weapons.ts): 3 for tokens, 5 for tokens from a level, 10 for
 *    diamonds ($1.99–4.99). Rare weapons come only from cases ($2.99), never as duplicates.
 *  - Modifications (silencer, sights, laser, grip, magazine) and equipment (grenades, mines, C4,
 *    turret) cost tokens only: nothing that changes a fight is sold for money.
 */
import { WEAPONS, WEAPON_IDS, modsFor } from './weapons.js';
import type { ModId, WeaponId } from './weapons.js';
import { CHARACTER_IDS, FREE_CHARACTERS } from './characters.js';
import type { CharacterId } from './characters.js';
import { GADGET_IDS } from './gadgets.js';
import type { GadgetId } from './gadgets.js';
import type { Loadout } from './loadout.js';
import type { MatchPerformance } from './progression.js';

export type Currency = 'tokens' | 'diamonds';

export interface ShopPrice {
  currency: Currency;
  amount: number;
  /** Minimum player level (token items); 1 = no requirement. */
  level: number;
}

/** 100 diamonds = 1 US dollar. */
export const DIAMONDS_PER_USD = 100;

export const FREE_WEAPONS: readonly WeaponId[] = WEAPON_IDS.filter((w) => WEAPONS[w].tier === 'base');

export const WEAPON_PRICES: Readonly<Partial<Record<WeaponId, ShopPrice>>> = {
  // three for tokens (the first one after about four matches)
  nozh: { currency: 'tokens', amount: 120, level: 1 },
  tt: { currency: 'tokens', amount: 150, level: 1 },
  uzi: { currency: 'tokens', amount: 200, level: 1 },
  // five for tokens from a level
  p92: { currency: 'tokens', amount: 250, level: 3 },
  bita: { currency: 'tokens', amount: 300, level: 5 },
  ksyuha: { currency: 'tokens', amount: 400, level: 7 },
  ppsh: { currency: 'tokens', amount: 500, level: 10 },
  m24: { currency: 'tokens', amount: 650, level: 13 },
  // ten for diamonds: $1.99 – $4.99
  deagle: { currency: 'diamonds', amount: 199, level: 1 },
  topor: { currency: 'diamonds', amount: 199, level: 1 },
  mp5: { currency: 'diamonds', amount: 299, level: 1 },
  s12: { currency: 'diamonds', amount: 299, level: 1 },
  m4: { currency: 'diamonds', amount: 399, level: 1 },
  g36: { currency: 'diamonds', amount: 399, level: 1 },
  m249: { currency: 'diamonds', amount: 399, level: 1 },
  svd: { currency: 'diamonds', amount: 499, level: 1 },
  awm: { currency: 'diamonds', amount: 499, level: 1 },
  rpg: { currency: 'diamonds', amount: 499, level: 1 },
};

export const CHARACTER_PRICES: Readonly<Partial<Record<CharacterId, ShopPrice>>> = {
  // five for experience (level) + tokens
  vorona: { currency: 'tokens', amount: 200, level: 2 },
  zmeya: { currency: 'tokens', amount: 350, level: 4 },
  varan: { currency: 'tokens', amount: 500, level: 6 },
  popugay: { currency: 'tokens', amount: 650, level: 8 },
  piranya: { currency: 'tokens', amount: 800, level: 11 },
  // five for diamonds
  leopard: { currency: 'diamonds', amount: 299, level: 1 },
  lobster: { currency: 'diamonds', amount: 299, level: 1 },
  akula: { currency: 'diamonds', amount: 399, level: 1 },
  oryol: { currency: 'diamonds', amount: 399, level: 1 },
  slon: { currency: 'diamonds', amount: 499, level: 1 },
};

/** Equipment: the F-1 is free; the rest is bought once with tokens (some from a level). */
export const FREE_GADGETS: readonly GadgetId[] = ['f1'];
export const GADGET_PRICES: Readonly<Partial<Record<GadgetId, ShopPrice>>> = {
  smoke: { currency: 'tokens', amount: 100, level: 1 },
  flash: { currency: 'tokens', amount: 150, level: 2 },
  molotov: { currency: 'tokens', amount: 250, level: 4 },
  mine: { currency: 'tokens', amount: 300, level: 6 },
  c4: { currency: 'tokens', amount: 350, level: 8 },
  turret: { currency: 'tokens', amount: 450, level: 12 },
};

/** Token price of a modification for one weapon. */
export const MOD_PRICES: Readonly<Record<ModId, number>> = { silencer: 150, reddot: 100, scope: 200, laser: 100, grip: 120, extmag: 150 };

export type Rarity = 'rare' | 'epic' | 'legendary';
export interface CaseEntry {
  weapon: WeaponId;
  rarity: Rarity;
  /** Chance in percent when nothing from the case is owned yet (all ten sum to 100). */
  chance: number;
}

/** Price of one case in diamonds ($2.99). */
export const CASE_PRICE = 299;
export const CASE_TABLE: readonly CaseEntry[] = [
  { weapon: 'mauser', rarity: 'rare', chance: 12 },
  { weapon: 'kuvalda', rarity: 'rare', chance: 12 },
  { weapon: 'tulka', rarity: 'rare', chance: 12 },
  { weapon: 'arbalet', rarity: 'rare', chance: 12 },
  { weapon: 'gvozdomet', rarity: 'rare', chance: 12 },
  { weapon: 'tommy', rarity: 'epic', chance: 10 },
  { weapon: 'ognemet', rarity: 'epic', chance: 10 },
  { weapon: 'muha', rarity: 'epic', chance: 10 },
  { weapon: 'zolotoy', rarity: 'legendary', chance: 5 },
  { weapon: 'granatomet', rarity: 'legendary', chance: 5 },
];

/** Odds of every case weapon for a player who owns `owned` (owned ones never drop; the rest are renormalised). */
export function caseOdds(owned: ReadonlySet<WeaponId>): Array<CaseEntry & { odds: number }> {
  const left = CASE_TABLE.filter((e) => !owned.has(e.weapon));
  const total = left.reduce((s, e) => s + e.chance, 0);
  return CASE_TABLE.map((e) => ({ ...e, odds: owned.has(e.weapon) || total === 0 ? 0 : (e.chance / total) * 100 }));
}

/** Draws a case weapon the player does not own yet; `r` is uniform in [0, 1). Null when the collection is complete. */
export function drawCase(owned: ReadonlySet<WeaponId>, r: number): CaseEntry | null {
  const left = CASE_TABLE.filter((e) => !owned.has(e.weapon));
  if (left.length === 0) return null;
  const total = left.reduce((s, e) => s + e.chance, 0);
  let x = Math.min(Math.max(r, 0), 0.999999999) * total;
  for (const e of left) {
    x -= e.chance;
    if (x < 0) return e;
  }
  return left[left.length - 1]!;
}

export interface DiamondPack {
  id: string;
  diamonds: number;
  /** Price in US cents (100 💎 = $1, no bulk bonus: the price is the price). */
  usdCents: number;
}
export const DIAMOND_PACKS: readonly DiamondPack[] = [
  { id: 'd199', diamonds: 199, usdCents: 199 },
  { id: 'd299', diamonds: 299, usdCents: 299 },
  { id: 'd499', diamonds: 499, usdCents: 499 },
  { id: 'd999', diamonds: 999, usdCents: 999 },
  { id: 'd1999', diamonds: 1999, usdCents: 1999 },
];
export function diamondPack(id: string): DiamondPack | undefined {
  return DIAMOND_PACKS.find((p) => p.id === id);
}

/** Tokens per online match (same eligibility as experience: the match must be finished). */
export const TOKEN_REWARD = Object.freeze({ completion: 10, perKill: 3, perAssist: 1, placement: [10, 6, 3] as readonly number[], maxPerMatch: 60 });

export function tokensForMatch(p: MatchPerformance): number {
  if (!p.completed) return 0;
  let t = TOKEN_REWARD.completion + TOKEN_REWARD.perKill * p.kills + TOKEN_REWARD.perAssist * (p.assists ?? 0);
  if (p.playersAtEnd >= 2) {
    const bonus = TOKEN_REWARD.placement[p.place - 1];
    if (bonus && (p.place === 1 || p.playersAtEnd >= p.place + 1)) t += bonus;
  }
  return Math.min(t, TOKEN_REWARD.maxPerMatch);
}

/** What a player owns and has equipped (GET /api/me/inventory). */
export interface Inventory {
  tokens: number;
  diamonds: number;
  level: number;
  /** Owned weapons including the free ones. */
  weapons: WeaponId[];
  /** Owned characters including the free ones. */
  characters: CharacterId[];
  /** Owned equipment types including the free ones. */
  gadgets: GadgetId[];
  /** Owned modifications per weapon (equipped ones are in loadout.mods). */
  mods: Partial<Record<WeaponId, ModId[]>>;
  /** Spawn loadout (validated against ownership). */
  loadout: Loadout;
}

export type ShopKind = 'weapon' | 'character' | 'gadget';
export type BuyRefusal = 'owned' | 'level' | 'funds' | 'not_for_sale' | 'not_fit' | 'not_owned' | 'collection_complete';

export function priceOf(kind: ShopKind, id: string): ShopPrice | undefined {
  return kind === 'weapon' ? WEAPON_PRICES[id as WeaponId] : kind === 'character' ? CHARACTER_PRICES[id as CharacterId] : GADGET_PRICES[id as GadgetId];
}

export function ownsWeapon(inv: Pick<Inventory, 'weapons'>, w: WeaponId): boolean {
  return FREE_WEAPONS.includes(w) || inv.weapons.includes(w);
}

export function ownsCharacter(inv: Pick<Inventory, 'characters'>, c: CharacterId): boolean {
  return FREE_CHARACTERS.includes(c) || inv.characters.includes(c);
}

export function ownsGadget(inv: Pick<Inventory, 'gadgets'>, g: GadgetId): boolean {
  return FREE_GADGETS.includes(g) || inv.gadgets.includes(g);
}

export function ownsMod(inv: Pick<Inventory, 'mods'>, w: WeaponId, m: ModId): boolean {
  return inv.mods[w]?.includes(m) ?? false;
}

function owns(inv: Inventory, kind: ShopKind, id: string): boolean {
  return kind === 'weapon' ? ownsWeapon(inv, id as WeaponId) : kind === 'character' ? ownsCharacter(inv, id as CharacterId) : ownsGadget(inv, id as GadgetId);
}

/** Why `inv` cannot buy an item right now (null = allowed). */
export function buyRefusal(inv: Inventory, kind: ShopKind, id: string): BuyRefusal | null {
  const price = priceOf(kind, id);
  if (!price) return 'not_for_sale';
  if (owns(inv, kind, id)) return 'owned';
  if (inv.level < price.level) return 'level';
  if ((price.currency === 'tokens' ? inv.tokens : inv.diamonds) < price.amount) return 'funds';
  return null;
}

/** Cost of a modification for a weapon, or why it cannot be bought. */
export function modQuote(inv: Inventory, w: WeaponId, m: ModId): { cost: number } | BuyRefusal {
  if (!ownsWeapon(inv, w)) return 'not_owned';
  if (!modsFor(WEAPONS[w]).includes(m)) return 'not_fit';
  if (ownsMod(inv, w, m)) return 'owned';
  const cost = MOD_PRICES[m];
  if (inv.tokens < cost) return 'funds';
  return { cost };
}

export const REFUSAL_TEXT: Record<BuyRefusal, string> = {
  owned: 'Already yours',
  level: 'You need a higher level',
  funds: 'Not enough funds',
  not_for_sale: 'Not for sale',
  not_fit: 'Doesn’t fit this weapon',
  not_owned: 'Buy the weapon first',
  collection_complete: 'The case collection is complete',
};

/** Every purchasable item, for catalog screens and tests. */
export const SHOP_WEAPONS: readonly WeaponId[] = WEAPON_IDS.filter((w) => WEAPON_PRICES[w]);
export const SHOP_CHARACTERS: readonly CharacterId[] = CHARACTER_IDS.filter((c) => CHARACTER_PRICES[c]);
export const SHOP_GADGETS: readonly GadgetId[] = GADGET_IDS.filter((g) => GADGET_PRICES[g]);
export const CASE_WEAPONS: readonly WeaponId[] = CASE_TABLE.map((e) => e.weapon);
