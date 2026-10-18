export const MATCH_PHASES = ['waiting', 'ready', 'countdown', 'active', 'finished', 'closed'] as const;
export type MatchPhase = (typeof MATCH_PHASES)[number];

export interface MatchConfig {
  minPlayers: number;
  maxPlayers: number;
  durationMs: number;
  scoreLimit: number;
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
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  minPlayers: 2,
  maxPlayers: 6,
  durationMs: 4 * 60_000,
  scoreLimit: 25,
  readyMs: 1200,
  countdownMs: 3000,
  finishedMs: 15_000,
  respawnDelayMs: 2500,
  spawnProtectionMs: 1500,
  allowJoinInProgress: true,
  reconnectGraceMs: 30_000,
  emptyRoomTtlMs: 60_000,
};

export function phaseIndex(p: MatchPhase): number {
  return MATCH_PHASES.indexOf(p);
}
