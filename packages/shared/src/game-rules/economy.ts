/**
 * In-game economy (configuration + pure rules; the server is the only authority that persists it).
 *
 * v0.2.18 (the owner's pre-release edits): two currencies.
 *  - Talons («tokens» in the code) are earned by playing online matches, the story and invitations, and
 *    are never sold. Weapons, modifications, equipment, the rare-weapon case and three characters
 *    (Uchastkovy, Mikhalych, Karlych) are unlocked with talons and experience (a level requirement).
 *  - BLATS («diamonds» in the code and the database; the red coin, 1 BLATS = 1 US cent) — the premium
 *    currency: bought in packs (DIAMOND_PACKS), and 10 for every new level. Characters other than the
 *    free and the talon ones are sold for BLATS by grade (199 / 399 / 799 / 1 099), weapon skins by grade
 *    (99 / 199 / 299 / 499, skins.ts) and the skin case (299). Nothing sold for BLATS changes a number in
 *    combat: characters are equal by design, skins only change looks.
 *  - Free for everyone: two characters (the rooster and the panther), a full kit of three weapons
 *    (Makarov, crowbar, AK-47), the F-1 grenade and two skin finishes on every weapon.
 *  - Shop weapons are sidegrades (see weapons.ts). Rare weapons come from the weapon case (talons, never
 *    a duplicate, the odds shown).
 *  - Until v0.23 the wolf, the bear and the sawn-off were free: accounts made before then keep them
 *    (migration 009). Characters bought with talons before v0.2.18 stay owned.
 *  - The old $BLAT points (V2.0 – v0.2.17) are retired: nothing pays or shows them; the database keeps
 *    what was credited (docs/ECONOMY.md).
 */
import { WEAPONS, WEAPON_IDS, modsFor } from './weapons.js';
import type { ModId, WeaponId } from './weapons.js';
import { CHARACTERS, CHARACTER_IDS, FREE_CHARACTERS } from './characters.js';
import type { CharacterId } from './characters.js';
import { GADGET_IDS } from './gadgets.js';
import type { GadgetId } from './gadgets.js';
import type { Loadout } from './loadout.js';
import type { MatchPerformance } from './progression.js';
import type { Grade } from './grades.js';
import { ownsSkin, skinPrice } from './skins.js';
import type { FinishId } from './skins.js';

export type Currency = 'tokens' | 'diamonds';

export interface ShopPrice {
  currency: Currency;
  amount: number;
  /** Minimum player level (token items); 1 = no requirement. */
  level: number;
}

/** Real-money sales (BLATS packs and BLATS prices): on since v0.2.18 (off from v0.24 to v0.2.17). */
export const REAL_MONEY: boolean = true;

/** 100 BLATS = 1 US dollar (1 BLATS = 1 cent). */
export const DIAMONDS_PER_USD = 100;

/** v0.2.18: BLATS for every new level (levels 2 and up; the start, level 1, pays nothing). */
export const BLATS_PER_LEVEL = 10;

/** BLATS a level pays when it is reached. */
export function blatsForLevel(level: number): number {
  return Number.isInteger(level) && level >= 2 ? BLATS_PER_LEVEL : 0;
}

/** v0.2.18: a character's price in BLATS by grade (the owner's prices: $1.99 … $10.99). */
export const CHARACTER_GRADE_PRICES: Readonly<Record<Grade, number>> = Object.freeze({ common: 199, rare: 399, epic: 799, legendary: 1099 });

export const FREE_WEAPONS: readonly WeaponId[] = WEAPON_IDS.filter((w) => WEAPONS[w].tier === 'base');

export const WEAPON_PRICES: Readonly<Partial<Record<WeaponId, ShopPrice>>> = {
  // four for talons from the start (the first one after about three matches)
  obrez: { currency: 'tokens', amount: 100, level: 1 },
  nozh: { currency: 'tokens', amount: 120, level: 1 },
  tt: { currency: 'tokens', amount: 150, level: 1 },
  uzi: { currency: 'tokens', amount: 200, level: 1 },
  // fifteen up the ladder (v0.24: the ten that were sold for diamonds are in it now)
  p92: { currency: 'tokens', amount: 250, level: 3 },
  deagle: { currency: 'tokens', amount: 300, level: 4 },
  bita: { currency: 'tokens', amount: 300, level: 5 },
  topor: { currency: 'tokens', amount: 350, level: 6 },
  ksyuha: { currency: 'tokens', amount: 400, level: 7 },
  mp5: { currency: 'tokens', amount: 450, level: 8 },
  s12: { currency: 'tokens', amount: 500, level: 9 },
  ppsh: { currency: 'tokens', amount: 500, level: 10 },
  m4: { currency: 'tokens', amount: 550, level: 11 },
  g36: { currency: 'tokens', amount: 600, level: 12 },
  m24: { currency: 'tokens', amount: 650, level: 13 },
  m249: { currency: 'tokens', amount: 700, level: 14 },
  svd: { currency: 'tokens', amount: 800, level: 15 },
  awm: { currency: 'tokens', amount: 900, level: 17 },
  rpg: { currency: 'tokens', amount: 1000, level: 19 },
};

/** v0.2.18: three characters are unlocked with talons and experience (the owner: «3 за талоны»). */
const TALON_CHARACTERS: Readonly<Partial<Record<CharacterId, ShopPrice>>> = {
  uchastkovy: { currency: 'tokens', amount: 150, level: 1 },
  mihalych: { currency: 'tokens', amount: 200, level: 2 },
  vorona: { currency: 'tokens', amount: 300, level: 3 },
};

/**
 * Every character that is not free: the three for talons, the rest for BLATS at their grade's price
 * (no level needed).
 */
export const CHARACTER_PRICES: Readonly<Partial<Record<CharacterId, ShopPrice>>> = Object.freeze(
  Object.fromEntries(
    CHARACTER_IDS.filter((c) => !FREE_CHARACTERS.includes(c)).map((c) => [c, TALON_CHARACTERS[c] ?? { currency: 'diamonds' as const, amount: CHARACTER_GRADE_PRICES[CHARACTERS[c].grade], level: 1 }]),
  ) as Partial<Record<CharacterId, ShopPrice>>,
);

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

/** Price of one rare-weapon case (v0.24: talons — there is no money in it). */
export const CASE_PRICE: ShopPrice = { currency: 'tokens', amount: 600, level: 1 };
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
  /** BLATS in the pack. */
  diamonds: number;
  /** Price in US cents (1 BLATS = 1 cent, no bulk bonus: the price is the price). */
  usdCents: number;
}
/** v0.2.18: BLATS packs, from 99 (the owner: «пакеты от 99 BLATS»). */
export const DIAMOND_PACKS: readonly DiamondPack[] = [
  { id: 'b99', diamonds: 99, usdCents: 99 },
  { id: 'b199', diamonds: 199, usdCents: 199 },
  { id: 'b499', diamonds: 499, usdCents: 499 },
  { id: 'b999', diamonds: 999, usdCents: 999 },
  { id: 'b1999', diamonds: 1999, usdCents: 1999 },
  { id: 'b4999', diamonds: 4999, usdCents: 4999 },
];

/** «$1.99» — what an amount of BLATS is worth (1 BLATS = 1 cent). */
export function blatsToUsd(blats: number): string {
  return `$${(Math.max(0, Math.round(blats)) / DIAMONDS_PER_USD).toFixed(2)}`;
}
export function diamondPack(id: string): DiamondPack | undefined {
  return DIAMOND_PACKS.find((p) => p.id === id);
}

/**
 * Talons per online match, earned mostly with eliminations: 5 per elimination, 2 per assist and
 * 5 for playing the match to the end, at most 100 per match. Same eligibility as experience (the
 * match must be finished; practice earns nothing).
 */
export const TOKEN_REWARD = Object.freeze({ perKill: 5, perAssist: 2, completion: 5, maxPerMatch: 100 });

export interface TokenBreakdown {
  kills: number;
  assists: number;
  completion: number;
  /** Before the per-match cap. */
  sum: number;
  total: number;
  capped: boolean;
}

export function tokenBreakdown(p: Pick<MatchPerformance, 'kills' | 'assists' | 'completed'>): TokenBreakdown {
  if (!p.completed) return { kills: 0, assists: 0, completion: 0, sum: 0, total: 0, capped: false };
  const kills = TOKEN_REWARD.perKill * Math.max(0, p.kills);
  const assists = TOKEN_REWARD.perAssist * Math.max(0, p.assists ?? 0);
  const completion = TOKEN_REWARD.completion;
  const sum = kills + assists + completion;
  const total = Math.min(sum, TOKEN_REWARD.maxPerMatch);
  return { kills, assists, completion, sum, total, capped: total < sum };
}

export function tokensForMatch(p: MatchPerformance): number {
  return tokenBreakdown(p).total;
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
  /** Owned weapon skins, «weapon.finish» (equipped ones are in loadout.skins). */
  skins: string[];
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

/** v0.2.18: why `inv` cannot buy this weapon's skin right now (null = allowed). The free finishes are owned. */
export function skinBuyRefusal(inv: Pick<Inventory, 'skins' | 'diamonds'>, weapon: WeaponId, finish: FinishId): BuyRefusal | null {
  if (ownsSkin(inv.skins, weapon, finish)) return 'owned';
  const price = skinPrice(finish);
  if (!price) return 'not_for_sale';
  if (inv.diamonds < price.amount) return 'funds';
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
