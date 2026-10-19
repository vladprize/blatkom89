export const MATCH_PHASES = ['waiting', 'ready', 'countdown', 'active', 'finished', 'closed'] as const;
export type MatchPhase = (typeof MATCH_PHASES)[number];

/**
 * Every man for himself (ffa), or two teams, red (0) and blue (1): a team deathmatch (teams),
 * capture the flag (ctf) and base capture (bases).
 */
export const GAME_MODES = ['ffa', 'teams', 'ctf', 'bases'] as const;
export type GameMode = (typeof GAME_MODES)[number];
export type Team = 0 | 1;
export const TEAMS: readonly Team[] = [0, 1];

export function isGameMode(v: unknown): v is GameMode {
  return typeof v === 'string' && (GAME_MODES as readonly string[]).includes(v);
}

/** Every mode but free-for-all is played by two teams. */
export function isTeamMode(mode: GameMode): boolean {
  return mode !== 'ffa';
}

/**
 * Capture the flag: steal the enemy flag from its stand and bring it to your own stand while your
 * flag is at home. A carrier who is eliminated drops the flag; a teammate who touches the dropped
 * flag sends it home, and an untouched flag goes home by itself after `returnMs`.
 */
export const CTF_RULES = Object.freeze({
  /** Pick-up / return / capture distance from the flag (the player's radius included). */
  touchRadius: 24,
  returnMs: 15_000,
  /** Match points for the player. */
  capturePoints: 6,
  returnPoints: 2,
  takePoints: 1,
  /** Bonus for eliminating the enemy carrier. */
  carrierKillPoints: 1,
});

/**
 * Base capture: three bases (A, B, C). A team that stands alone inside a base fills its capture
 * bar; with both teams inside the base is contested and nothing moves. A base is taken (from
 * neutral or from the enemy) in `captureMs` by one player, faster by `extraPlayerRate` of that per
 * extra teammate (up to `maxRate`); an abandoned bar fades at `decayRate`. Every base held gives
 * its team a point every `tickMs`.
 */
export const BASE_RULES = Object.freeze({
  radius: 56,
  captureMs: 6000,
  extraPlayerRate: 0.5,
  maxRate: 2.5,
  decayRate: 0.5,
  tickMs: 1000,
  /** Match points for every capturer inside the base. */
  capturePoints: 3,
});

/** Team match outcome sent with the results: team scores of red and blue, winner (null = draw). */
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
  /** Team deathmatch: the match ends when a team reaches this many eliminations. */
  teamScoreLimit: number;
  /** Capture the flag: captures to win. */
  captureLimit: number;
  /** Base capture: points to win (a point per base held per second). */
  baseScoreLimit: number;
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
  captureLimit: 3,
  baseScoreLimit: 250,
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

/** The team score that ends a match in this mode (0 in free-for-all: points decide there). */
export function teamScoreLimitFor(c: Pick<MatchConfig, 'mode' | 'teamScoreLimit' | 'captureLimit' | 'baseScoreLimit'>): number {
  switch (c.mode) {
    case 'teams':
      return c.teamScoreLimit;
    case 'ctf':
      return c.captureLimit;
    case 'bases':
      return c.baseScoreLimit;
    default:
      return 0;
  }
}

export function phaseIndex(p: MatchPhase): number {
  return MATCH_PHASES.indexOf(p);
}
