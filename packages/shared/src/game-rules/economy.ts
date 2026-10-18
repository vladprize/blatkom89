/**
 * In-game economy (configuration + pure rules; the server is the only authority that persists it).
 *
 *  - Tokens («жетоны») are earned by playing online matches and are never sold.
 *  - Diamonds («алмазы») are bought for real money (100 💎 = $1) or granted by an administrator.
 *  - The four starting characters and the base weapons are free for everyone.
 *  - Shop weapons are sidegrades (see weapons.ts): 3 for tokens, 5 for tokens from a level, 7 for
 *    diamonds ($1.99–4.99). Rare weapons come only from cases ($2.99), never as duplicates.
 *  - Upgrades (damage, fire rate, reload, magazine; 3 levels each) cost tokens only.
 */
import { WEAPONS, WEAPON_IDS, UPGRADE_MAX_LEVEL, upgradeStatsFor } from './weapons.js';
import type { UpgradeStat, WeaponId, WeaponMods } from './weapons.js';
import { CHARACTER_IDS, FREE_CHARACTERS } from './characters.js';
import type { CharacterId } from './characters.js';
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
  finka: { currency: 'tokens', amount: 120, level: 1 },
  uzi: { currency: 'tokens', amount: 150, level: 1 },
  pb: { currency: 'tokens', amount: 200, level: 1 },
  // five for tokens from a level
  ksyuha: { currency: 'tokens', amount: 250, level: 3 },
  nagan: { currency: 'tokens', amount: 300, level: 5 },
  toz: { currency: 'tokens', amount: 400, level: 7 },
  bita: { currency: 'tokens', amount: 450, level: 10 },
  mosinka: { currency: 'tokens', amount: 600, level: 13 },
  // seven for diamonds: $1.99 – $4.99
  stechkin: { currency: 'diamonds', amount: 199, level: 1 },
  lopata: { currency: 'diamonds', amount: 199, level: 1 },
  sayga: { currency: 'diamonds', amount: 299, level: 1 },
  val: { currency: 'diamonds', amount: 399, level: 1 },
  pkm: { currency: 'diamonds', amount: 399, level: 1 },
  svd: { currency: 'diamonds', amount: 499, level: 1 },
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

/** Token cost of raising one upgrade stat to level 1, 2, 3 (index = target level). */
export const UPGRADE_COSTS: readonly number[] = [0, 60, 120, 240];

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
  /** Upgrade levels per owned weapon. */
  upgrades: Partial<Record<WeaponId, WeaponMods>>;
  /** Spawn loadout (validated against ownership; mods = upgrades). */
  loadout: Loadout;
}

export type BuyRefusal = 'owned' | 'level' | 'funds' | 'not_for_sale' | 'max_level' | 'not_upgradable' | 'not_owned' | 'collection_complete';

export function priceOf(kind: 'weapon' | 'character', id: string): ShopPrice | undefined {
  return kind === 'weapon' ? WEAPON_PRICES[id as WeaponId] : CHARACTER_PRICES[id as CharacterId];
}

export function ownsWeapon(inv: Pick<Inventory, 'weapons'>, w: WeaponId): boolean {
  return FREE_WEAPONS.includes(w) || inv.weapons.includes(w);
}

export function ownsCharacter(inv: Pick<Inventory, 'characters'>, c: CharacterId): boolean {
  return FREE_CHARACTERS.includes(c) || inv.characters.includes(c);
}

/** Why `inv` cannot buy an item right now (null = allowed). */
export function buyRefusal(inv: Inventory, kind: 'weapon' | 'character', id: WeaponId | CharacterId): BuyRefusal | null {
  const price = priceOf(kind, id);
  if (!price) return 'not_for_sale';
  if (kind === 'weapon' ? ownsWeapon(inv, id as WeaponId) : ownsCharacter(inv, id as CharacterId)) return 'owned';
  if (inv.level < price.level) return 'level';
  if ((price.currency === 'tokens' ? inv.tokens : inv.diamonds) < price.amount) return 'funds';
  return null;
}

/** Cost of the next level of an upgrade stat, or why it cannot be bought. */
export function upgradeQuote(inv: Inventory, w: WeaponId, stat: UpgradeStat): { cost: number; level: number } | BuyRefusal {
  if (!ownsWeapon(inv, w)) return 'not_owned';
  if (!upgradeStatsFor(WEAPONS[w]).includes(stat)) return 'not_upgradable';
  const cur = inv.upgrades[w]?.[stat] ?? 0;
  if (cur >= UPGRADE_MAX_LEVEL) return 'max_level';
  const cost = UPGRADE_COSTS[cur + 1]!;
  if (inv.tokens < cost) return 'funds';
  return { cost, level: cur + 1 };
}

export const REFUSAL_TEXT: Record<BuyRefusal, string> = {
  owned: 'Уже есть',
  level: 'Нужен уровень повыше',
  funds: 'Не хватает средств',
  not_for_sale: 'Не продаётся',
  max_level: 'Улучшено до предела',
  not_upgradable: 'Это не улучшается',
  not_owned: 'Сначала купите оружие',
  collection_complete: 'Коллекция кейса собрана',
};

/** Every purchasable item, for catalog screens and tests. */
export const SHOP_WEAPONS: readonly WeaponId[] = WEAPON_IDS.filter((w) => WEAPON_PRICES[w]);
export const SHOP_CHARACTERS: readonly CharacterId[] = CHARACTER_IDS.filter((c) => CHARACTER_PRICES[c]);
export const CASE_WEAPONS: readonly WeaponId[] = CASE_TABLE.map((e) => e.weapon);
