/**
 * v0.2.24 — the Season Pass (the owner: «Season Pass за $3, где каждую неделю ему что-то выпадает. Один скин,
 * один персонаж»).
 *
 * - Bought once a season for PASS_PRICE BLATS ($2.99 — exactly one pack), never for money directly.
 * - Every week of the season gives one weapon skin and one character the player doesn't own yet, drawn with the
 *   cases' own odds (skinCaseOdds, characterCaseOdds — shown before the purchase); no duplicates. When nothing
 *   of a kind is left to give, that half of the week gives PASS_FALLBACK_BLATS instead.
 * - A week's drop is ready from the week's first day: a player who buys mid-season gets the weeks gone by at
 *   once; the player opens a ready week when they like (the server draws it then), the drops stay theirs after
 *   the season ends, and the weeks not opened yet can still be opened then.
 * - The season's name, first day and length come from the server's configuration (PASS_SEASON_ID,
 *   PASS_SEASON_START, PASS_SEASON_WEEKS) — no date is invented here; with no season set the pass is not sold.
 *   A purchase keeps the schedule it was bought under, so a new season never takes an old pass's weeks away.
 * - Randomised paid items: like the paid cases, an 18+ confirmation and the server's CASES_ENABLED apply
 *   (docs/ECONOMY.md). Only the look: skins and characters never change a weapon's or a fighter's numbers.
 */
import type { CharacterId } from './characters.js';
import type { Grade } from './grades.js';
import { characterCaseOdds, drawCharacter } from './economy.js';
import type { Inventory, ShopPrice } from './economy.js';
import { drawSkin, skinCaseOdds } from './skins.js';
import type { SkinDrop, SkinId, SkinRarity } from './skins.js';

export const PASS_PRICE: ShopPrice = { currency: 'diamonds', amount: 299, level: 1 };
export const PASS_DEFAULT_WEEKS = 4;
export const PASS_MAX_WEEKS = 12;
/** What half a week gives when nothing of its kind is left to drop (a complete collection). */
export const PASS_FALLBACK_BLATS = 50;
export const WEEK_MS = 7 * 86_400_000;

/** A season as the server configures it. */
export interface PassSeason {
  /** Its name in the records («s1»): one pass per player and season. */
  id: string;
  /** Its first moment (ISO 8601). */
  start: string;
  /** How many weeks it runs (1…PASS_MAX_WEEKS). */
  weeks: number;
}

/** A season id as stored (a short slug). */
export const PASS_SEASON_ID_RE = /^[a-z0-9-]{1,16}$/;

/** When the season ends (the first moment after its last week). */
export function passEnd(season: Pick<PassSeason, 'start' | 'weeks'>): Date {
  return new Date(Date.parse(season.start) + season.weeks * WEEK_MS);
}

/** When week `week` (1-based) opens. */
export function passWeekStart(season: Pick<PassSeason, 'start'>, week: number): Date {
  return new Date(Date.parse(season.start) + (week - 1) * WEEK_MS);
}

/** The week on at `now`: 0 before the season, 1…weeks during it, weeks + 1 after it. */
export function passWeekAt(season: Pick<PassSeason, 'start' | 'weeks'>, now: Date): number {
  const t = now.getTime() - Date.parse(season.start);
  if (!Number.isFinite(t) || t < 0) return 0;
  return Math.min(season.weeks + 1, Math.floor(t / WEEK_MS) + 1);
}

/** Is the pass on sale at `now`: from the season's first moment until its end. */
export function passOnSale(season: PassSeason | null, now: Date): boolean {
  if (!season) return false;
  const w = passWeekAt(season, now);
  return w >= 1 && w <= season.weeks;
}

/** How many of a pass's weeks are ready at `now` (all of them once the season is over). */
export function passWeeksDue(season: Pick<PassSeason, 'start' | 'weeks'>, now: Date): number {
  return Math.max(0, Math.min(season.weeks, passWeekAt(season, now)));
}

/** What one week gave. */
export interface PassDrop {
  week: number;
  /** The skin (null: none was left — `blats` has its part). */
  skin: SkinDrop | null;
  /** The character (null: none was left — `blats` has its part). */
  character: { character: CharacterId; grade: Grade } | null;
  /** BLATS given instead of what was not left to give (0 usually). */
  blats: number;
}

/**
 * One week's drop for a player who owns `skins` and `characters`: a skin and a character they don't have yet
 * (the cases' odds, no duplicates); PASS_FALLBACK_BLATS for each half with nothing left.
 */
export function drawPassWeek(week: number, skins: ReadonlySet<SkinId>, characters: ReadonlySet<CharacterId>, rand: () => number): PassDrop {
  const skin = drawSkin(skins, rand);
  const character = drawCharacter(characters, rand);
  return { week, skin, character, blats: (skin ? 0 : PASS_FALLBACK_BLATS) + (character ? 0 : PASS_FALLBACK_BLATS) };
}

/** The odds the pass shows before the purchase: the same as the skin case's and the crew case's for this player. */
export function passOdds(inv: Pick<Inventory, 'skins' | 'characters'>): { skins: Record<SkinRarity, number>; characters: Record<Grade, number> } {
  return { skins: skinCaseOdds(new Set(inv.skins)), characters: characterCaseOdds(new Set(inv.characters)) };
}

/** One week of a pass as the player sees it. */
export interface PassWeek {
  week: number;
  opensAt: string;
  /** Ready to open (its day has come). */
  due: boolean;
  /** What it gave once opened (null: not opened yet). */
  drop: PassDrop | null;
}

/** GET /api/pass — the season, whether the player has its pass, and its weeks. */
export interface PassState {
  /** The season on now or next (null: none is configured on this server). */
  season: (PassSeason & { end: string }) | null;
  /** The pass can be bought now (the season is on, cases are allowed, the player hasn't got it). */
  onSale: boolean;
  /** The player has this season's pass. */
  owned: boolean;
  price: ShopPrice;
  /** The week on now (0 before the season, weeks + 1 after it). */
  week: number;
  /** This season's weeks (the player's own, when they have the pass). */
  weeks: PassWeek[];
  /** Weeks ready to open — this season's and any older pass's left unopened. */
  ready: number;
  fallbackBlats: number;
  /** Paid random items are allowed on this server (CASES_ENABLED). */
  casesEnabled: boolean;
}

/** POST /api/pass/buy */
export interface PassBuyResult {
  state: PassState;
  inventory: Inventory;
}

/** POST /api/pass/claim — every ready week opened now. */
export interface PassClaimResult {
  drops: Array<PassDrop & { season: string }>;
  state: PassState;
  inventory: Inventory;
}
