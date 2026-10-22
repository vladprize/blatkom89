/** Story mode API (v0.3 part 4): progress, a mission ticket, a mission reported done and its rewards. */
import { z } from 'zod';
import type { AchievementId } from '../game-rules/progression.js';
import type { CharacterId } from '../game-rules/characters.js';
import type { SkinId } from '../game-rules/skins.js';

export interface StoryDone {
  id: string;
  /** First completion. */
  at: string;
  bestMs: number;
  completions: number;
}

export interface StoryProgressResponse {
  done: StoryDone[];
}

export const StoryStartBody = z.object({ mission: z.string().regex(/^[a-z0-9_]{1,16}$/) }).strict();
export interface StoryStartResponse {
  /** Signed: who, which mission, when — handed back with the result. */
  ticket: string;
}

export const StoryCompleteBody = z
  .object({
    ticket: z.string().min(10).max(600),
    /** Time in the mission (the best time of the mission is kept). */
    ms: z.number().int().min(0).max(3 * 3600_000),
    kills: z.number().int().min(0).max(999),
    deaths: z.number().int().min(0).max(999),
  })
  .strict();

export interface StoryReward {
  mission: string;
  /** The first time: the rewards below were paid now (later runs only improve the best time). */
  first: boolean;
  talons: number;
  xp: number;
  /** The chapter's achievement when this mission finished the chapter. */
  achievement: AchievementId | null;
  characters: CharacterId[];
  skins: SkinId[];
  /** Rewards the player already had — paid in talons instead. */
  compensated: Array<{ kind: 'character' | 'skin'; id: string; talons: number }>;
  /** The talon balance after it all. */
  tokens: number;
  xpTotal: number;
  level: number;
  done: StoryDone[];
}
