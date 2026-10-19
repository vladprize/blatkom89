export const MATCH_PHASES = ['waiting', 'ready', 'countdown', 'active', 'finished', 'closed'] as const;
export type MatchPhase = (typeof MATCH_PHASES)[number];

/** Every man for himself, or two teams: red (0) and blue (1). */
export const GAME_MODES = ['ffa', 'teams'] as const;
export type GameMode = (typeof GAME_MODES)[number];
export type Team = 0 | 1;
export const TEAMS: readonly Team[] = [0, 1];

export function isGameMode(v: unknown): v is GameMode {
  return typeof v === 'string' && (GAME_MODES as readonly string[]).includes(v);
}

/** Team match outcome sent with the results: eliminations of red and blue, winner (null = draw). */
export interface TeamResultSummary {
  scores: [number, number];
  winner: Team | null;
}

/** Players per room (one map, one match). */
export const MAX_PLAYERS = 10;

export interface MatchConfig {
  mode: GameMode;
  minPlayers: number;
  maxPlayers: number;
  durationMs: number;
  scoreLimit: number;
  /** Teams: the match ends when a team reaches this many eliminations. */
  teamScoreLimit: number;
  readyMs: number;
  countdownMs: number;
  finishedMs: number;
  respawnDelayMs: number;
  spawnProtectionMs: number;
  allowJoinInProgress: boolean;
  /** How long a disconnected player keeps their slot. */
  reconnectGraceMs: number;
  /** Close a room with no connected players after this long. */
  emptyRoomTtlMs: number;
  /** «Дефицит» supply drops: first drop after the match starts, then every interval; crates expire. */
  supplyFirstMs: number;
  supplyIntervalMs: number;
  supplyTtlMs: number;
}

/**
 * Match points ("очки"): the scoreboard, placement and the score limit use points.
 * An assist is counted for every player (other than the killer) who dealt at least
 * `assistMinDamage` to the victim within `assistWindowMs` before the elimination.
 */
export const SCORING = Object.freeze({
  killPoints: 2,
  assistPoints: 1,
  assistWindowMs: 6000,
  assistMinDamage: 20,
});

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  mode: 'ffa',
  minPlayers: 2,
  maxPlayers: MAX_PLAYERS,
  durationMs: 4 * 60_000,
  /** Points: an elimination is 2, an assist 1 (≈25 eliminations). */
  scoreLimit: 50,
  teamScoreLimit: 40,
  readyMs: 1200,
  countdownMs: 3000,
  finishedMs: 15_000,
  respawnDelayMs: 2500,
  spawnProtectionMs: 1500,
  allowJoinInProgress: true,
  reconnectGraceMs: 30_000,
  emptyRoomTtlMs: 60_000,
  supplyFirstMs: 25_000,
  supplyIntervalMs: 35_000,
  supplyTtlMs: 30_000,
};

export function phaseIndex(p: MatchPhase): number {
  return MATCH_PHASES.indexOf(p);
}
