/**
 * Weapon skins (v0.23): a finish — a paint job from the late-Soviet everyday — on one particular weapon.
 * Skins change only how a weapon looks: never its numbers. A skin is equipped on its weapon in the
 * Arsenal and everybody in the match sees it.
 *
 * v0.2.18 (the owner's pre-release edits): every finish has a grade (grades.ts); finishes are bought for
 * BLATS — the premium currency — one weapon at a time, at the grade's price, or come from the skin case
 * (BLATS, never a duplicate, the odds shown).
 *
 * v0.2.18 part 2 — the owner's skin line (references/64-skins-lineup.png): twenty finishes on sale, and
 * two («Акула», «Блатком ’89») that are a welcome gift for early players on every weapon — not sold; the
 * server gives them while its WELCOME_GIFT_UNTIL lasts (economy/repo.ts). Designs that would carry
 * someone else's marks are drawn without them: no Olympic rings («Спартакиада ’80»), no sportswear
 * stripes or logo («Спортивный»), no religious image («Царский», the owner's «Святой калаш»), no state
 * emblem («Контора», the owner's «КГБ»), no prison tattoos («Тату»), no maker's logo («Электроника»).
 * The finishes of the first line are retired, not deleted: whoever owns one keeps it and can wear it;
 * they are no longer sold or dropped.
 */
import { WEAPON_IDS, isWeaponId } from './weapons.js';
import type { WeaponId } from './weapons.js';
import type { ShopPrice } from './economy.js';
import { GRADES } from './grades.js';
import type { Grade } from './grades.js';

export const FINISH_IDS = [
  // the owner's line, in its order
  'haki',
  'iznos',
  'akulka',
  'blatkom',
  'sparta',
  'sport',
  'devyanostye',
  'malina',
  'video',
  'cherkizon',
  'radiaciya',
  'afgan',
  'tatu',
  'plenka',
  'kosmos',
  'zakat',
  'hohloma',
  'elektronika',
  'led',
  'carsky',
  'kontora',
  'yadernaya',
  // the first line (v0.23), retired: kept by those who own them, no longer sold or dropped
  'berezka',
  'rzhavchina',
  'zima',
  'flora',
  'gzhel',
  'pioner',
  'malahit',
  'zoloto',
  'yantar',
] as const;
export type FinishId = (typeof FINISH_IDS)[number];

/** A skin's grade (v0.23 called it its rarity; the ids are the same). */
export type SkinRarity = Grade;
export const SKIN_RARITIES: readonly SkinRarity[] = GRADES;

export interface Finish {
  id: FinishId;
  /** English name (Russian in the client's ru-content). */
  name: string;
  rarity: SkinRarity;
  /** The welcome gift for early players: given by the server, not sold, never dropped. */
  gift?: true;
  /** The first line's finish, retired: whoever owns it keeps it; not sold, not dropped. */
  retired?: true;
}

export const FINISHES: Readonly<Record<FinishId, Finish>> = Object.freeze({
  haki: { id: 'haki', name: 'Khaki', rarity: 'common' },
  iznos: { id: 'iznos', name: 'Worn', rarity: 'common' },
  akulka: { id: 'akulka', name: 'Shark', rarity: 'common', gift: true },
  blatkom: { id: 'blatkom', name: 'Blatkom ’89', rarity: 'common', gift: true },
  sparta: { id: 'sparta', name: 'Spartakiad ’80', rarity: 'rare' },
  sport: { id: 'sport', name: 'Tracksuit', rarity: 'rare' },
  devyanostye: { id: 'devyanostye', name: 'Wild Nineties', rarity: 'rare' },
  malina: { id: 'malina', name: 'Raspberry Jacket', rarity: 'rare' },
  video: { id: 'video', name: 'Video Parlour', rarity: 'rare' },
  cherkizon: { id: 'cherkizon', name: 'Cherkizon', rarity: 'rare' },
  radiaciya: { id: 'radiaciya', name: 'Radioactive', rarity: 'rare' },
  afgan: { id: 'afgan', name: 'Afghan', rarity: 'rare' },
  tatu: { id: 'tatu', name: 'Tattoo', rarity: 'rare' },
  plenka: { id: 'plenka', name: 'Film', rarity: 'rare' },
  kosmos: { id: 'kosmos', name: 'Cosmos ’88', rarity: 'epic' },
  zakat: { id: 'zakat', name: 'Golden Sunset', rarity: 'epic' },
  hohloma: { id: 'hohloma', name: 'Khokhloma', rarity: 'epic' },
  elektronika: { id: 'elektronika', name: 'Elektronika', rarity: 'epic' },
  led: { id: 'led', name: 'Ice Camo', rarity: 'epic' },
  carsky: { id: 'carsky', name: 'Tsar’s', rarity: 'legendary' },
  kontora: { id: 'kontora', name: 'The Office', rarity: 'legendary' },
  yadernaya: { id: 'yadernaya', name: 'Nuclear Winter', rarity: 'legendary' },
  berezka: { id: 'berezka', name: 'Birch Camo', rarity: 'common', retired: true },
  rzhavchina: { id: 'rzhavchina', name: 'Rust', rarity: 'common', retired: true },
  zima: { id: 'zima', name: 'Winter', rarity: 'common', retired: true },
  flora: { id: 'flora', name: 'Flora', rarity: 'rare', retired: true },
  gzhel: { id: 'gzhel', name: 'Gzhel', rarity: 'rare', retired: true },
  pioner: { id: 'pioner', name: 'Pioneer', rarity: 'rare', retired: true },
  malahit: { id: 'malahit', name: 'Malachite', rarity: 'epic', retired: true },
  zoloto: { id: 'zoloto', name: 'Party Gold', rarity: 'legendary', retired: true },
  yantar: { id: 'yantar', name: 'Amber', rarity: 'legendary', retired: true },
});

/**
 * v0.2.18: the first line's two free finishes stay free on every weapon for everyone — so a player who
 * wears one keeps it — but, retired, they are no longer offered (the welcome gift took their place).
 */
export const FREE_FINISHES: readonly FinishId[] = ['berezka', 'rzhavchina'];

/** v0.2.18 part 2: the welcome gift for early players — every weapon in these two (the server gives them). */
export const WELCOME_FINISHES: readonly FinishId[] = FINISH_IDS.filter((f) => FINISHES[f].gift);

/** The finishes on sale — the owner's line without the gifts — in the line's order. */
export const SHOP_FINISHES: readonly FinishId[] = FINISH_IDS.filter((f) => !FINISHES[f].gift && !FINISHES[f].retired);

/** The current line as the Arsenal lists it: what is on sale and the gifts. */
export const LINE_FINISHES: readonly FinishId[] = FINISH_IDS.filter((f) => !FINISHES[f].retired);

export function isFreeFinish(f: FinishId): boolean {
  return FREE_FINISHES.includes(f);
}

/** v0.2.18: the price of one weapon's skin, in BLATS, by grade (the owner's prices: $0.99 … $4.99). */
export const SKIN_PRICES: Readonly<Record<Grade, number>> = Object.freeze({ common: 99, rare: 199, epic: 299, legendary: 499 });

/** What a skin costs (null: not sold — free for everyone, the welcome gift, or a retired finish). */
export function skinPrice(finish: FinishId): ShopPrice | null {
  return SHOP_FINISHES.includes(finish) ? { currency: 'diamonds', amount: SKIN_PRICES[FINISHES[finish].rarity], level: 1 } : null;
}

/** Is this skin the player's — bought, dropped, granted, or one of the free finishes? */
export function ownsSkin(owned: ReadonlySet<string> | readonly string[], weapon: WeaponId, finish: FinishId): boolean {
  if (isFreeFinish(finish)) return true;
  const id = skinId(weapon, finish);
  return Array.isArray(owned) ? owned.includes(id) : (owned as ReadonlySet<string>).has(id);
}

export function isFinishId(v: unknown): v is FinishId {
  return typeof v === 'string' && (FINISH_IDS as readonly string[]).includes(v);
}

/**
 * Price of the skin case (v0.2.18: 299 BLATS — the owner: «эквивалент $2.99»). A case for money asks
 * the player to confirm they are 18 or older, shows the odds and never gives a duplicate; the server's
 * CASES_ENABLED switches every case off where paid cases are not allowed.
 */
export const SKIN_CASE_PRICE: ShopPrice = { currency: 'diamonds', amount: 299, level: 1 };

/** Chance of each grade in percent (sums to 100) while every grade still has skins to give (the owner's odds). */
export const SKIN_RARITY_CHANCE: Readonly<Record<SkinRarity, number>> = Object.freeze({ common: 40, rare: 30, epic: 20, legendary: 10 });

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

/** Every skin there is (weapons × finishes), the free, the gifted and the retired ones included. */
export function allSkins(): SkinId[] {
  const out: SkinId[] = [];
  for (const w of SKINNABLE_WEAPONS) for (const f of FINISH_IDS) out.push(skinId(w, f));
  return out;
}

/** The current line's skins: every weapon in every finish on sale and in the welcome gift. */
export function lineSkins(): SkinId[] {
  const out: SkinId[] = [];
  for (const w of SKINNABLE_WEAPONS) for (const f of LINE_FINISHES) out.push(skinId(w, f));
  return out;
}

/** The welcome gift's skins (every weapon in both gift finishes). */
export function welcomeSkins(): SkinId[] {
  const out: SkinId[] = [];
  for (const w of SKINNABLE_WEAPONS) for (const f of WELCOME_FINISHES) out.push(skinId(w, f));
  return out;
}

/** Finishes the skin case can give: the ones on sale (never a free, gifted or retired one). */
export const CASE_FINISHES: readonly FinishId[] = SHOP_FINISHES;

/**
 * Odds of each grade for a player who owns `owned`: a grade whose skins are all owned drops out and
 * the others share its chance. All zero when the collection is complete.
 */
export function skinCaseOdds(owned: ReadonlySet<SkinId>): Record<SkinRarity, number> {
  const left = new Map<SkinRarity, number>(SKIN_RARITIES.map((r) => [r, 0]));
  for (const w of SKINNABLE_WEAPONS) for (const f of CASE_FINISHES) if (!owned.has(skinId(w, f))) left.set(FINISHES[f].rarity, left.get(FINISHES[f].rarity)! + 1);
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
 * Draws a skin the player does not own (never a free one): first the grade (by its odds), then any
 * unowned skin of that grade with equal chance. `rand` is uniform in [0, 1). Null when the collection is complete.
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
  for (const w of SKINNABLE_WEAPONS) for (const f of CASE_FINISHES) if (FINISHES[f].rarity === rarity && !owned.has(skinId(w, f))) pool.push({ weapon: w, finish: f, rarity });
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
