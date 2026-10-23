/** «Блатной кон» (V2.0 part D): the API's shapes. */
import type { KonFormat, KonOutcome } from '../game-rules/kon.js';
import type { CharacterId } from '../game-rules/characters.js';
import type { MapId } from '../maps/types.js';

/** A player's Kon numbers. */
export interface KonStats {
  rating: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  bestStreak: number;
}

/** One Kon match in the player's history. */
export interface KonHistoryEntry {
  matchId: string;
  endedAt: string;
  format: KonFormat;
  mapId: MapId;
  team: 0 | 1 | null;
  outcome: KonOutcome;
  /** The player left before the end (counted as a loss). */
  left: boolean;
  kills: number;
  deaths: number;
  delta: number;
  character: CharacterId;
  mates: string[];
  rivals: string[];
}

/** GET /api/kon */
export interface KonResponse {
  me: KonStats;
  history: KonHistoryEntry[];
  /** People waiting in public Kon rooms of each format right now. */
  waiting: Record<KonFormat, number>;
}

/** A row of the Kon tables (a player or a gang). */
export interface KonTopRow {
  place: number;
  id: string;
  name: string;
  /** A gang's tag; a player's level. */
  tag?: string;
  level?: number;
  rating: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  /** Players: the best win streak. */
  bestStreak?: number;
}

/** GET /api/kon/top?by=players|gangs */
export interface KonTopResponse {
  by: 'players' | 'gangs';
  rows: KonTopRow[];
  /** The player's own row (their gang's for «gangs»), also when outside the first 100; null: no Kon matches yet. */
  me: KonTopRow | null;
}
