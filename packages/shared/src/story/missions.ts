/**
 * Story mode (v0.3 part 4): «2089 → 1989». Two campaigns in the simulation of 1989 — Petya «The
 * Commandant» (the streets) and Uchastkovy (the police): chapters 1 and 2 of five missions each, chapter 3
 * of two that ends the story so far on an open end for both heroes (v0.2.15) — chapter 4 and the finale
 * come in updates. Shared by the server (which missions are open, the rewards, the shortest time a
 * mission can take) and the client (running a mission). The words — comic panels, lines in battle — live
 * in the client (apps/web/src/story/script.ts); here are ids and numbers only.
 *
 * Chapters arrive one by one: a chapter that is not written yet is `ready: false` and has no missions.
 */
import { CHARACTER_IDS } from '../game-rules/characters.js';
import type { CharacterId } from '../game-rules/characters.js';
import type { WeaponId } from '../game-rules/weapons.js';
import type { GadgetId } from '../game-rules/gadgets.js';
import type { SkinId } from '../game-rules/skins.js';
import type { AchievementId } from '../game-rules/progression.js';
import type { GameMode } from '../game-rules/match.js';
import type { MapId } from '../maps/types.js';
import type { BotDifficulty } from '../sim/bots.js';

export const STORY_CAMPAIGNS = ['petya', 'uchastkovy'] as const;
export type StoryCampaign = (typeof STORY_CAMPAIGNS)[number];

/** What a mission asks for. */
export type StoryObjective =
  /** Every enemy down — they don't come back; the hero has one life. Enemies may come in waves. */
  | { kind: 'clear' }
  /** The hero's side first to `limit` eliminations (everyone comes back). One enemy: a duel. */
  | { kind: 'team'; limit: number }
  /** Bring the enemy's flag (the tape, the goods…) to your own stand `limit` times. */
  | { kind: 'flag'; limit: number }
  /** Hold the points until your side has `limit` points. */
  | { kind: 'bases'; limit: number }
  /** Stay alive until the time runs out (one life) while they keep coming. */
  | { kind: 'survive' };

/** People without a name of their own (their words are in the client's script). */
export const STORY_ROLES = ['loafer', 'queue', 'speculator', 'reseller', 'pilferer', 'dancer', 'garage', 'scrapper', 'patrol', 'courier', 'suitor', 'workshop', 'fence', 'guard', 'smuggler'] as const;
export type StoryRole = (typeof STORY_ROLES)[number];

export interface StoryKit {
  sidearm: WeaponId;
  melee: WeaponId;
  primary: WeaponId | null;
  gadget: GadgetId | null;
}

export interface StoryNpc {
  character: CharacterId;
  /** A named character is themselves; anyone else plays a role («a loafer», «a speculator»…). */
  role: StoryRole | 'self';
  side: 'ally' | 'enemy';
  kit: StoryKit;
  difficulty: BotDifficulty;
  /** Clear: the wave they arrive with (0 = at the start). */
  wave?: number;
  /** The one the mission is about. */
  boss?: boolean;
}

export interface StoryMission {
  id: string;
  campaign: StoryCampaign;
  chapter: number;
  /** 1-based within the campaign: a mission opens when the one before it is done. */
  n: number;
  map: MapId;
  hero: CharacterId;
  kit: StoryKit;
  objective: StoryObjective;
  npcs: StoryNpc[];
  /** The mission fails when the time runs out (survive: that is the win). */
  timeLimitMs: number;
  /** Clear: the pause before the next wave. */
  waveGapMs?: number;
  /** Characters the hero meets here (the card index). */
  meets: CharacterId[];
  /** Talons and experience for the first completion. */
  talons: number;
  xp: number;
}

export interface StoryChapter {
  campaign: StoryCampaign;
  chapter: number;
  /** False while the chapter is still being written: shown as «coming soon», no missions yet. */
  ready: boolean;
  /** The chapter's achievement; its talons and things come with it, once. */
  achievement: AchievementId | null;
  talons: number;
  characters: CharacterId[];
  skins: SkinId[];
}

/**
 * The hero's edge in a mission: a share of the incoming damage (the fights are two, three, five against
 * one) and, where one fall would end it («clear», «survive»), a few lives; in «survive» the attackers
 * who fall come back after a while, not at once.
 */
export const STORY_RULES = Object.freeze({ heroDamage: 0.5, lives: 3, surviveRespawnMs: 7000 });

/** The shortest time from starting a mission to reporting it done (a scripted «instant win» is refused). */
export const STORY_MIN_MS = 15_000;
/** A mission ticket is good for this long (a long mission plus its comic and some retries). */
export const STORY_TICKET_TTL_MS = 3 * 3600_000;
/** Compensation for a story reward that is already owned: a skin is worth a skin case. */
export const STORY_OWNED_SKIN_TALONS = 150;

const kit = (sidearm: WeaponId, melee: WeaponId, primary: WeaponId | null = null, gadget: GadgetId | null = null): StoryKit => ({ sidearm, melee, primary, gadget });
const enemy = (character: CharacterId, role: StoryRole | 'self', k: StoryKit, difficulty: BotDifficulty = 'normal', extra: Partial<StoryNpc> = {}): StoryNpc => ({ character, role, side: 'enemy', kit: k, difficulty, ...extra });
const ally = (character: CharacterId, k: StoryKit, difficulty: BotDifficulty = 'normal', role: StoryRole | 'self' = 'self'): StoryNpc => ({ character, role, side: 'ally', kit: k, difficulty });

export const STORY_MISSIONS: readonly StoryMission[] = [
  // ── Petya «My Yard», chapter 1 «The Yard» ─────────────────────────────────
  {
    id: 'a1', campaign: 'petya', chapter: 1, n: 1, map: 'yard', hero: 'petya', kit: kit('pistol', 'montirovka'),
    objective: { kind: 'clear' }, timeLimitMs: 240_000, meets: ['vorona'], talons: 60, xp: 40,
    npcs: [enemy('golub', 'loafer', kit('pistol', 'bita'), 'easy'), enemy('krysa', 'loafer', kit('pistol', 'bita'), 'easy'), enemy('tarakan', 'loafer', kit('pistol', 'nozh'), 'easy')],
  },
  {
    id: 'a2', campaign: 'petya', chapter: 1, n: 2, map: 'gastronom', hero: 'petya', kit: kit('pistol', 'montirovka', 'obrez'),
    objective: { kind: 'team', limit: 10 }, timeLimitMs: 300_000, meets: ['mihalych'], talons: 80, xp: 50,
    npcs: [ally('mihalych', kit('pistol', 'montirovka', 'avtomat', 'f1')), enemy('svinya', 'queue', kit('pistol', 'bita', 'ksyuha')), enemy('buyvol', 'queue', kit('pistol', 'montirovka', 'obrez')), enemy('krysa', 'queue', kit('tt', 'nozh', 'uzi'))],
  },
  {
    id: 'a3', campaign: 'petya', chapter: 1, n: 3, map: 'garages', hero: 'petya', kit: kit('pistol', 'montirovka', 'ksyuha', 'f1'),
    objective: { kind: 'clear' }, timeLimitMs: 300_000, waveGapMs: 1500, meets: ['valuta'], talons: 90, xp: 60,
    npcs: [
      enemy('popugay', 'speculator', kit('pistol', 'bita'), 'easy'), enemy('lobster', 'speculator', kit('pistol', 'nozh'), 'easy'),
      enemy('zmeya', 'speculator', kit('tt', 'nozh', 'ksyuha'), 'easy', { wave: 1 }), enemy('tarakan', 'speculator', kit('pistol', 'montirovka', 'obrez'), 'easy', { wave: 1 }),
      enemy('krysa', 'speculator', kit('tt', 'bita', 'avtomat'), 'normal', { wave: 2 }),
    ],
  },
  {
    id: 'a4', campaign: 'petya', chapter: 1, n: 4, map: 'yard', hero: 'petya', kit: kit('pistol', 'montirovka', 'avtomat', 'f1'),
    objective: { kind: 'flag', limit: 2 }, timeLimitMs: 360_000, meets: [], talons: 100, xp: 70,
    npcs: [
      ally('mihalych', kit('pistol', 'montirovka', 'avtomat', 'f1')), ally('vorona', kit('pistol', 'nozh', 'ksyuha', 'smoke')),
      enemy('svinya', 'reseller', kit('pistol', 'bita', 'obrez')), enemy('popugay', 'reseller', kit('tt', 'nozh', 'mp5')), enemy('krysa', 'reseller', kit('pistol', 'montirovka', 'avtomat')),
    ],
  },
  {
    id: 'a5', campaign: 'petya', chapter: 1, n: 5, map: 'yard', hero: 'petya', kit: kit('pistol', 'montirovka', 'avtomat', 'f1'),
    objective: { kind: 'team', limit: 5 }, timeLimitMs: 300_000, meets: ['uchastkovy'], talons: 120, xp: 80,
    npcs: [enemy('uchastkovy', 'self', kit('pistol', 'bita', 'avtomat', 'flash'), 'hard', { boss: true })],
  },
  // ── Uchastkovy «The Report», chapter 1 «The Beat» ─────────────────────────
  {
    id: 'b1', campaign: 'uchastkovy', chapter: 1, n: 1, map: 'gastronom', hero: 'uchastkovy', kit: kit('pistol', 'bita'),
    objective: { kind: 'clear' }, timeLimitMs: 240_000, meets: ['koshka'], talons: 60, xp: 40,
    npcs: [enemy('krysa', 'pilferer', kit('pistol', 'montirovka'), 'easy'), enemy('tarakan', 'pilferer', kit('pistol', 'nozh'), 'easy'), enemy('svinya', 'pilferer', kit('pistol', 'bita'), 'easy'), enemy('popugay', 'pilferer', kit('tt', 'nozh'), 'easy')],
  },
  {
    id: 'b2', campaign: 'uchastkovy', chapter: 1, n: 2, map: 'dk', hero: 'uchastkovy', kit: kit('pistol', 'bita', 'ksyuha', 'flash'),
    objective: { kind: 'team', limit: 4 }, timeLimitMs: 240_000, meets: ['lisa'], talons: 80, xp: 50,
    npcs: [enemy('lisa', 'self', kit('p92', 'nozh', 'uzi', 'smoke'), 'normal', { boss: true })],
  },
  {
    id: 'b3', campaign: 'uchastkovy', chapter: 1, n: 3, map: 'dk', hero: 'uchastkovy', kit: kit('pistol', 'bita', 'ksyuha', 'f1'),
    objective: { kind: 'clear' }, timeLimitMs: 300_000, waveGapMs: 1500, meets: ['piranya'], talons: 90, xp: 60,
    npcs: [
      enemy('krysa', 'dancer', kit('pistol', 'bita'), 'easy'), enemy('svinya', 'dancer', kit('pistol', 'topor'), 'easy'),
      enemy('tarakan', 'dancer', kit('tt', 'nozh'), 'easy', { wave: 1 }), enemy('golub', 'dancer', kit('pistol', 'bita'), 'easy', { wave: 1 }),
      enemy('piranya', 'self', kit('pistol', 'topor', 'obrez', 'molotov'), 'normal', { wave: 2, boss: true }),
    ],
  },
  {
    id: 'b4', campaign: 'uchastkovy', chapter: 1, n: 4, map: 'garages', hero: 'uchastkovy', kit: kit('pistol', 'bita', 'avtomat', 'f1'),
    objective: { kind: 'bases', limit: 100 }, timeLimitMs: 360_000, meets: [], talons: 100, xp: 70,
    npcs: [ally('koshka', kit('p92', 'nozh', 'mp5', 'smoke')), enemy('varan', 'garage', kit('pistol', 'montirovka', 'obrez'), 'easy'), enemy('buyvol', 'garage', kit('tt', 'bita', 'avtomat'), 'easy'), enemy('gorilla', 'garage', kit('pistol', 'montirovka', 'uzi'), 'easy')],
  },
  {
    id: 'b5', campaign: 'uchastkovy', chapter: 1, n: 5, map: 'yard', hero: 'uchastkovy', kit: kit('pistol', 'bita', 'avtomat', 'flash'),
    objective: { kind: 'team', limit: 5 }, timeLimitMs: 300_000, meets: ['petya'], talons: 120, xp: 80,
    npcs: [enemy('petya', 'self', kit('pistol', 'montirovka', 'avtomat', 'f1'), 'hard', { boss: true })],
  },
  // ── Petya «My Yard», chapter 2 «The Garages» ──────────────────────────────
  {
    id: 'a6', campaign: 'petya', chapter: 2, n: 6, map: 'garages', hero: 'petya', kit: kit('pistol', 'montirovka', 'avtomat', 'f1'),
    objective: { kind: 'team', limit: 10 }, timeLimitMs: 300_000, meets: ['varan'], talons: 110, xp: 70,
    npcs: [
      ally('varan', kit('pistol', 'montirovka', 'obrez')),
      enemy('buyvol', 'scrapper', kit('pistol', 'montirovka', 'obrez')), enemy('svinya', 'scrapper', kit('pistol', 'bita'), 'easy'), enemy('gorilla', 'scrapper', kit('tt', 'kuvalda', 'uzi'), 'easy'),
    ],
  },
  {
    id: 'a7', campaign: 'petya', chapter: 2, n: 7, map: 'factory', hero: 'petya', kit: kit('pistol', 'montirovka', 'avtomat', 'molotov'),
    objective: { kind: 'survive' }, timeLimitMs: 75_000, meets: ['tarakan'], talons: 120, xp: 75,
    npcs: [
      ally('tarakan', kit('pistol', 'nozh', 'ppsh')),
      enemy('krysa', 'patrol', kit('pistol', 'bita'), 'easy'), enemy('golub', 'patrol', kit('pistol', 'bita'), 'easy'), enemy('slon', 'patrol', kit('tt', 'montirovka', 'obrez'), 'easy'), enemy('nosorog', 'patrol', kit('pistol', 'bita')),
    ],
  },
  {
    id: 'a8', campaign: 'petya', chapter: 2, n: 8, map: 'camp', hero: 'petya', kit: kit('pistol', 'montirovka', 'ksyuha', 'smoke'),
    objective: { kind: 'flag', limit: 2 }, timeLimitMs: 360_000, meets: ['popugay'], talons: 130, xp: 80,
    npcs: [
      ally('popugay', kit('pistol', 'nozh', 'mp5')),
      enemy('leopard', 'courier', kit('pistol', 'nozh', 'uzi')), enemy('krysa', 'courier', kit('tt', 'bita', 'ksyuha'), 'easy'), enemy('svinya', 'courier', kit('pistol', 'montirovka', 'obrez'), 'easy'),
    ],
  },
  {
    id: 'a9', campaign: 'petya', chapter: 2, n: 9, map: 'gastronom', hero: 'petya', kit: kit('pistol', 'montirovka', 'avtomat', 'f1'),
    objective: { kind: 'clear' }, timeLimitMs: 300_000, waveGapMs: 1500, meets: ['zmeya'], talons: 140, xp: 90,
    npcs: [
      enemy('golub', 'suitor', kit('pistol', 'bita'), 'easy'), enemy('buyvol', 'suitor', kit('pistol', 'nozh'), 'easy'),
      enemy('krysa', 'suitor', kit('tt', 'bita', 'ksyuha'), 'easy', { wave: 1 }), enemy('gorilla', 'suitor', kit('pistol', 'montirovka', 'obrez'), 'easy', { wave: 1 }),
      enemy('zmeya', 'self', kit('p92', 'nozh', 'uzi', 'smoke'), 'normal', { wave: 2, boss: true }),
    ],
  },
  {
    id: 'a10', campaign: 'petya', chapter: 2, n: 10, map: 'garages', hero: 'petya', kit: kit('pistol', 'montirovka', 'avtomat', 'mine'),
    objective: { kind: 'bases', limit: 100 }, timeLimitMs: 360_000, meets: [], talons: 160, xp: 100,
    npcs: [
      ally('mihalych', kit('pistol', 'montirovka', 'avtomat', 'f1')), ally('varan', kit('pistol', 'montirovka', 'obrez')),
      enemy('slon', 'workshop', kit('tt', 'bita', 'avtomat')), enemy('nosorog', 'workshop', kit('pistol', 'montirovka', 'obrez')), enemy('leopard', 'workshop', kit('pistol', 'nozh', 'mp5'), 'easy'), enemy('gorilla', 'workshop', kit('pistol', 'bita', 'ksyuha'), 'easy'),
    ],
  },
  // ── Uchastkovy «The Report», chapter 2 «The Black Market» ─────────────────
  {
    id: 'b6', campaign: 'uchastkovy', chapter: 2, n: 6, map: 'square', hero: 'uchastkovy', kit: kit('pistol', 'bita', 'ksyuha', 'flash'),
    objective: { kind: 'clear' }, timeLimitMs: 300_000, waveGapMs: 1500, meets: ['lobster'], talons: 110, xp: 70,
    npcs: [
      enemy('svinya', 'fence', kit('pistol', 'bita'), 'easy'), enemy('golub', 'fence', kit('tt', 'nozh'), 'easy'),
      enemy('krysa', 'fence', kit('pistol', 'montirovka', 'uzi'), 'easy', { wave: 1 }), enemy('buyvol', 'fence', kit('pistol', 'bita', 'obrez'), 'easy', { wave: 1 }),
      enemy('lobster', 'self', kit('tt', 'nozh', 'tulka', 'molotov'), 'normal', { wave: 2, boss: true }),
    ],
  },
  {
    id: 'b7', campaign: 'uchastkovy', chapter: 2, n: 7, map: 'hospital', hero: 'uchastkovy', kit: kit('pistol', 'bita', 'avtomat', 'f1'),
    objective: { kind: 'team', limit: 10 }, timeLimitMs: 300_000, meets: ['akula'], talons: 120, xp: 75,
    npcs: [
      ally('koshka', kit('p92', 'nozh', 'mp5', 'smoke')),
      enemy('gorilla', 'guard', kit('pistol', 'montirovka', 'avtomat')), enemy('slon', 'guard', kit('tt', 'bita', 'uzi'), 'easy'), enemy('akula', 'self', kit('p92', 'nozh', 'mp5'), 'normal', { boss: true }),
    ],
  },
  {
    id: 'b8', campaign: 'uchastkovy', chapter: 2, n: 8, map: 'factory', hero: 'uchastkovy', kit: kit('pistol', 'bita', 'ksyuha', 'smoke'),
    objective: { kind: 'flag', limit: 2 }, timeLimitMs: 360_000, meets: ['oryol'], talons: 130, xp: 80,
    npcs: [
      ally('koshka', kit('p92', 'nozh', 'mp5', 'smoke')),
      enemy('krysa', 'smuggler', kit('pistol', 'montirovka', 'ksyuha'), 'easy'), enemy('buyvol', 'smuggler', kit('tt', 'bita', 'obrez'), 'easy'), enemy('oryol', 'self', kit('p92', 'nozh', 'm4'), 'normal', { boss: true }),
    ],
  },
  {
    id: 'b9', campaign: 'uchastkovy', chapter: 2, n: 9, map: 'cemetery', hero: 'uchastkovy', kit: kit('pistol', 'bita', 'avtomat', 'flash'),
    objective: { kind: 'survive' }, timeLimitMs: 75_000, meets: [], talons: 140, xp: 90,
    npcs: [
      ally('koshka', kit('p92', 'nozh', 'mp5', 'smoke')),
      enemy('golub', 'smuggler', kit('pistol', 'bita'), 'easy'), enemy('svinya', 'smuggler', kit('pistol', 'montirovka', 'obrez'), 'easy'), enemy('leopard', 'smuggler', kit('pistol', 'nozh')), enemy('krysa', 'smuggler', kit('tt', 'bita'), 'easy'),
    ],
  },
  {
    id: 'b10', campaign: 'uchastkovy', chapter: 2, n: 10, map: 'camp', hero: 'uchastkovy', kit: kit('pistol', 'bita', 'avtomat', 'f1'),
    objective: { kind: 'bases', limit: 100 }, timeLimitMs: 360_000, meets: [], talons: 160, xp: 100,
    npcs: [
      ally('koshka', kit('p92', 'nozh', 'mp5', 'smoke')), ally('golub', kit('pistol', 'bita', 'ksyuha'), 'normal', 'patrol'),
      enemy('slon', 'smuggler', kit('tt', 'bita', 'avtomat'), 'easy'), enemy('nosorog', 'smuggler', kit('pistol', 'montirovka', 'obrez'), 'easy'), enemy('gorilla', 'smuggler', kit('pistol', 'bita', 'uzi'), 'easy'), enemy('oryol', 'self', kit('p92', 'nozh', 'm4'), 'normal', { boss: true }),
    ],
  },
  // ── Petya «My Yard», chapter 3 «The Industrial Zone» (v0.2.15: two missions; the story goes on in updates) ──
  {
    id: 'a11', campaign: 'petya', chapter: 3, n: 11, map: 'factory', hero: 'petya', kit: kit('pistol', 'montirovka', 'avtomat', 'f1'),
    objective: { kind: 'clear' }, timeLimitMs: 300_000, waveGapMs: 1500, meets: ['krysa', 'buyvol'], talons: 170, xp: 105,
    npcs: [
      ally('krysa', kit('pistol', 'bita', 'ksyuha')),
      enemy('nosorog', 'workshop', kit('pistol', 'montirovka', 'obrez')), enemy('slon', 'workshop', kit('pistol', 'bita', 'uzi'), 'easy'), enemy('leopard', 'workshop', kit('pistol', 'nozh', 'mp5')),
      enemy('gorilla', 'workshop', kit('tt', 'kuvalda', 'avtomat'), 'normal', { wave: 1 }), enemy('lobster', 'workshop', kit('pistol', 'bita', 'obrez'), 'easy', { wave: 1 }), enemy('oryol', 'workshop', kit('pistol', 'nozh', 'uzi'), 'easy', { wave: 1 }),
      enemy('buyvol', 'self', kit('tt', 'kuvalda', 'obrez'), 'normal', { wave: 2, boss: true }), enemy('akula', 'workshop', kit('pistol', 'montirovka', 'ksyuha'), 'easy', { wave: 2 }),
    ],
  },
  {
    id: 'a12', campaign: 'petya', chapter: 3, n: 12, map: 'stroyka', hero: 'petya', kit: kit('pistol', 'montirovka', 'avtomat', 'mine'),
    objective: { kind: 'bases', limit: 100 }, timeLimitMs: 360_000, meets: ['svinya', 'golub'], talons: 190, xp: 115,
    npcs: [
      ally('mihalych', kit('pistol', 'montirovka', 'avtomat', 'f1')), ally('golub', kit('pistol', 'bita', 'ksyuha', 'molotov')), ally('svinya', kit('pistol', 'montirovka', 'obrez'), 'easy'),
      enemy('gorilla', 'workshop', kit('tt', 'kuvalda', 'avtomat')), enemy('slon', 'workshop', kit('pistol', 'bita', 'obrez')), enemy('leopard', 'workshop', kit('pistol', 'nozh', 'mp5')),
      enemy('nosorog', 'workshop', kit('pistol', 'montirovka', 'uzi'), 'easy'), enemy('lobster', 'workshop', kit('pistol', 'bita', 'obrez'), 'easy'),
    ],
  },
  // ── Uchastkovy «The Report», chapter 3 «Downtown» (v0.2.15: two missions; the story goes on in updates) ──
  {
    id: 'b11', campaign: 'uchastkovy', chapter: 3, n: 11, map: 'gastronom', hero: 'uchastkovy', kit: kit('pistol', 'bita', 'avtomat', 'flash'),
    objective: { kind: 'team', limit: 10 }, timeLimitMs: 300_000, meets: ['leopard', 'slon'], talons: 170, xp: 105,
    npcs: [
      ally('koshka', kit('p92', 'nozh', 'mp5', 'smoke')),
      enemy('slon', 'self', kit('tt', 'bita', 'uzi')), enemy('gorilla', 'guard', kit('pistol', 'montirovka', 'obrez')), enemy('buyvol', 'guard', kit('pistol', 'bita', 'obrez'), 'easy'),
      enemy('leopard', 'self', kit('p92', 'nozh', 'avtomat'), 'normal', { boss: true }),
    ],
  },
  {
    id: 'b12', campaign: 'uchastkovy', chapter: 3, n: 12, map: 'hospital', hero: 'uchastkovy', kit: kit('pistol', 'bita', 'avtomat', 'f1'),
    objective: { kind: 'survive' }, timeLimitMs: 75_000, meets: ['nosorog', 'gorilla'], talons: 190, xp: 115,
    npcs: [
      ally('koshka', kit('p92', 'nozh', 'mp5', 'smoke')), ally('nosorog', kit('pistol', 'bita', 'obrez')),
      enemy('gorilla', 'self', kit('tt', 'kuvalda', 'avtomat'), 'normal', { boss: true }), enemy('buyvol', 'workshop', kit('pistol', 'montirovka', 'obrez'), 'easy'), enemy('svinya', 'workshop', kit('pistol', 'bita'), 'easy'), enemy('krysa', 'workshop', kit('tt', 'bita', 'ksyuha'), 'easy'),
    ],
  },
];

/** The chapters, the written ones and the ones on the way (with the rewards they will bring). */
export const STORY_CHAPTERS: readonly StoryChapter[] = [
  { campaign: 'petya', chapter: 1, ready: true, achievement: 'story_petya_1', talons: 500, characters: [], skins: ['montirovka.hohloma'] },
  { campaign: 'petya', chapter: 2, ready: true, achievement: 'story_petya_2', talons: 600, characters: [], skins: [] },
  { campaign: 'petya', chapter: 3, ready: true, achievement: 'story_petya_3', talons: 700, characters: ['golub'], skins: [] },
  { campaign: 'petya', chapter: 4, ready: false, achievement: null, talons: 1000, characters: [], skins: ['avtomat.zoloto'] },
  { campaign: 'uchastkovy', chapter: 1, ready: true, achievement: 'story_uchastkovy_1', talons: 500, characters: ['uchastkovy'], skins: [] },
  { campaign: 'uchastkovy', chapter: 2, ready: true, achievement: 'story_uchastkovy_2', talons: 600, characters: ['koshka'], skins: ['pistol.gzhel'] },
  { campaign: 'uchastkovy', chapter: 3, ready: true, achievement: 'story_uchastkovy_3', talons: 700, characters: [], skins: [] },
  { campaign: 'uchastkovy', chapter: 4, ready: false, achievement: null, talons: 1000, characters: [], skins: [] },
];

/** Where each character turns up in the story (the card index shows where the unmet ones wait). */
export const STORY_CAST: Readonly<Record<CharacterId, { campaign: StoryCampaign; chapter: number }>> = {
  vorona: { campaign: 'petya', chapter: 1 },
  mihalych: { campaign: 'petya', chapter: 1 },
  valuta: { campaign: 'petya', chapter: 1 },
  uchastkovy: { campaign: 'petya', chapter: 1 },
  varan: { campaign: 'petya', chapter: 2 },
  tarakan: { campaign: 'petya', chapter: 2 },
  popugay: { campaign: 'petya', chapter: 2 },
  zmeya: { campaign: 'petya', chapter: 2 },
  krysa: { campaign: 'petya', chapter: 3 },
  buyvol: { campaign: 'petya', chapter: 3 },
  svinya: { campaign: 'petya', chapter: 3 },
  golub: { campaign: 'petya', chapter: 3 },
  koshka: { campaign: 'uchastkovy', chapter: 1 },
  lisa: { campaign: 'uchastkovy', chapter: 1 },
  piranya: { campaign: 'uchastkovy', chapter: 1 },
  petya: { campaign: 'uchastkovy', chapter: 1 },
  akula: { campaign: 'uchastkovy', chapter: 2 },
  lobster: { campaign: 'uchastkovy', chapter: 2 },
  oryol: { campaign: 'uchastkovy', chapter: 2 },
  leopard: { campaign: 'uchastkovy', chapter: 3 },
  slon: { campaign: 'uchastkovy', chapter: 3 },
  nosorog: { campaign: 'uchastkovy', chapter: 3 },
  gorilla: { campaign: 'uchastkovy', chapter: 3 },
  lev: { campaign: 'uchastkovy', chapter: 4 },
};

/** The card index: the district's people — everyone but the two heroes (22). */
export const STORY_CARD_INDEX: readonly CharacterId[] = CHARACTER_IDS.filter((c) => c !== 'petya' && c !== 'uchastkovy');

const BY_ID = new Map(STORY_MISSIONS.map((m) => [m.id, m]));

export function storyMission(id: string): StoryMission | undefined {
  return BY_ID.get(id);
}

export function campaignMissions(c: StoryCampaign): StoryMission[] {
  return STORY_MISSIONS.filter((m) => m.campaign === c).sort((a, b) => a.n - b.n);
}

export function chapterMissions(c: StoryCampaign, chapter: number): StoryMission[] {
  return campaignMissions(c).filter((m) => m.chapter === chapter);
}

export function storyChapter(c: StoryCampaign, chapter: number): StoryChapter | undefined {
  return STORY_CHAPTERS.find((x) => x.campaign === c && x.chapter === chapter);
}

/** The chapter whose achievement this is (for the reward line of an achievement card). */
export function chapterOfAchievement(id: AchievementId): StoryChapter | undefined {
  return STORY_CHAPTERS.find((x) => x.achievement === id);
}

/** A mission can be played when its chapter is written and the mission before it is done. */
export function isMissionOpen(id: string, done: ReadonlySet<string>): boolean {
  const m = BY_ID.get(id);
  if (!m || !storyChapter(m.campaign, m.chapter)?.ready) return false;
  if (m.n === 1) return true;
  const prev = STORY_MISSIONS.find((x) => x.campaign === m.campaign && x.n === m.n - 1);
  return !!prev && done.has(prev.id);
}

/** All missions of a written chapter are done. */
export function isChapterDone(c: StoryCampaign, chapter: number, done: ReadonlySet<string>): boolean {
  const ms = chapterMissions(c, chapter);
  return !!storyChapter(c, chapter)?.ready && ms.length > 0 && ms.every((m) => done.has(m.id));
}

/** The next mission to play in a campaign (null when every written mission is done). */
export function nextMission(c: StoryCampaign, done: ReadonlySet<string>): StoryMission | null {
  return campaignMissions(c).find((m) => !done.has(m.id) && isMissionOpen(m.id, done)) ?? null;
}

/** Characters met in the missions done (the heroes count once the other campaign meets them). */
export function charactersMet(done: ReadonlySet<string>): Set<CharacterId> {
  const out = new Set<CharacterId>();
  for (const m of STORY_MISSIONS) if (done.has(m.id)) for (const c of m.meets) out.add(c);
  return out;
}

/** The match mode a mission's objective runs on (the hero's side is red, the others blue). */
export function storyGameMode(o: StoryObjective): GameMode {
  return o.kind === 'flag' ? 'ctf' : o.kind === 'bases' ? 'bases' : 'teams';
}
