/**
 * v0.2.23: «Комплект» — a character and a legendary skin made for them, sold together for less than apart.
 *
 * The owner's brief for the skins (worth $1–10 each): the most a player pays at once is a character with
 * the skin that goes with them, about $10. Every epic and legendary character (sold for BLATS) has one
 * set: the character and their legendary finish on the «Дружба» automatic (everyone's primary weapon, so
 * the skin is worn at once). Each legendary finish of the shop is in exactly one set.
 *
 * Price: 899 BLATS with an epic character (799 + 499 apart), 999 with a legendary one (1099 + 499 apart).
 * A set is sold only while the player owns neither its character nor its skin (a half-owned set is bought
 * item by item).
 */
import { CHARACTERS, CHARACTER_IDS } from './characters.js';
import type { CharacterId } from './characters.js';
import type { WeaponId } from './weapons.js';
import { FINISHES, SHOP_FINISHES, SKIN_PRICES, ownsSkin } from './skins.js';
import type { FinishId } from './skins.js';
import { CHARACTER_PRICES } from './economy.js';
import type { BuyRefusal, Inventory } from './economy.js';

/** The weapon every set's skin goes on (free, everyone's primary). */
export const BUNDLE_WEAPON: WeaponId = 'avtomat';

/** The character → their legendary finish. */
export const BUNDLE_FINISHES: Readonly<Partial<Record<CharacterId, FinishId>>> = Object.freeze({
  lev: 'carsky', // Arkadich, the lion — the Tsar's finish
  kasatka: 'bratok', // Kasatik, the Soviet gangster — the Golden Mobster
  zvezda: 'unitaz', // Pyatak, the starfish from the drains — the Golden Toilet
  akula: 'almaz', // Zhora, the shark — the Red Diamond
  gorilla: 'obsidian', // Samson — the Obsidian Emperor
  tigr: 'shashlyk', // Zver — the Shashlik Master
  pauk: 'kontora', // Arakh, the spider — the Office
  bogomol: 'krovavy', // Zhnets, «the Reaper» — the Blood Reaper
  ezh: 'yadernaya', // Igla, the mutant hedgehog — Nuclear Winter
} satisfies Partial<Record<CharacterId, FinishId>>);

/** A set's price in BLATS by its character's grade. */
export const BUNDLE_PRICES = Object.freeze({ epic: 899, legendary: 999 } as const);

export interface Bundle {
  /** The set's id: its character's id. */
  id: CharacterId;
  character: CharacterId;
  weapon: WeaponId;
  finish: FinishId;
  /** BLATS for the set. */
  price: number;
  /** BLATS for the two apart (what the set saves from). */
  separate: number;
}

/** The set of a character (null: none). */
export function bundleOf(c: CharacterId): Bundle | null {
  const finish = BUNDLE_FINISHES[c];
  const grade = CHARACTERS[c]?.grade;
  const charPrice = CHARACTER_PRICES[c];
  if (!finish || (grade !== 'epic' && grade !== 'legendary') || !charPrice || charPrice.currency !== 'diamonds' || !SHOP_FINISHES.includes(finish)) return null;
  return { id: c, character: c, weapon: BUNDLE_WEAPON, finish, price: BUNDLE_PRICES[grade], separate: charPrice.amount + SKIN_PRICES[FINISHES[finish].rarity] };
}

/** Every set, in the characters' order. */
export const BUNDLES: readonly Bundle[] = Object.freeze(CHARACTER_IDS.map(bundleOf).filter((b): b is Bundle => b !== null));

/** Why a set can't be bought (null: it can). */
export function bundleRefusal(inv: Pick<Inventory, 'characters' | 'skins' | 'diamonds'>, c: CharacterId): BuyRefusal | null {
  const b = bundleOf(c);
  if (!b) return 'not_for_sale';
  if (inv.characters.includes(b.character) || ownsSkin(inv.skins, b.weapon, b.finish)) return 'owned';
  if (inv.diamonds < b.price) return 'funds';
  return null;
}
