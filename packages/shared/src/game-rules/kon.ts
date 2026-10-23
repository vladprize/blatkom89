/**
 * «Блатной кон» (V2.0 part D): ranked matches with fixed sides — 1×1, 2×2, 3×3, 5×5 — between people
 * only (a Kon room never fills anybody in). Team deathmatch on any map; its own rating for players and
 * for gangs (ОПГ) — apart from the general rating, and never connected to $BLAT. Stakes are designed
 * (game-rules/konStakes.ts, docs/KON.md) and switched off.
 */
import type { MatchConfig } from './match.js';

export const KON_FORMATS = ['1x1', '2x2', '3x3', '5x5'] as const;
export type KonFormat = (typeof KON_FORMATS)[number];

export function isKonFormat(v: unknown): v is KonFormat {
  return typeof v === 'string' && (KON_FORMATS as readonly string[]).includes(v);
}

/**
 * Per format: people per side, the team score that ends the match, and the match length as a share
 * of the server's match length (MATCH_DURATION_SEC, 4 minutes by default: 3 / 4 / 4 / 5 minutes).
 */
export const KON_RULES: Readonly<Record<KonFormat, { size: number; teamScoreLimit: number; durationScale: number }>> = Object.freeze({
  '1x1': { size: 1, teamScoreLimit: 10, durationScale: 0.75 },
  '2x2': { size: 2, teamScoreLimit: 15, durationScale: 1 },
  '3x3': { size: 3, teamScoreLimit: 20, durationScale: 1 },
  '5x5': { size: 5, teamScoreLimit: 30, durationScale: 1.25 },
});

/** The match rules of a Kon room built on the server's rules. */
export function konConfig(base: MatchConfig, format: KonFormat): MatchConfig {
  const r = KON_RULES[format];
  return {
    ...base,
    mode: 'teams',
    minPlayers: r.size * 2,
    maxPlayers: r.size * 2,
    teamScoreLimit: r.teamScoreLimit,
    durationMs: Math.round(base.durationMs * r.durationScale),
    // the sides are set before the match: nobody comes in once it is on
    allowJoinInProgress: false,
  };
}

/**
 * The Kon rating (Elo): everyone starts at 1000; a side's average against the other side's decides
 * how much a win or a loss moves it; the first matches move it more. A player who leaves loses.
 */
export const KON_RATING = Object.freeze({ start: 1000, floor: 100, k: 24, kNew: 40, newMatches: 10 });

export type KonOutcome = 'win' | 'loss' | 'draw';

/** The chance the first side wins, by the ratings. */
export function konExpected(mine: number, theirs: number): number {
  return 1 / (1 + 10 ** ((theirs - mine) / 400));
}

/** How much one player's (or one gang's) Kon rating moves. */
export function konDelta(o: { mine: number; theirs: number; outcome: KonOutcome; matches: number }): number {
  const k = o.matches < KON_RATING.newMatches ? KON_RATING.kNew : KON_RATING.k;
  const score = o.outcome === 'win' ? 1 : o.outcome === 'draw' ? 0.5 : 0;
  return Math.round(k * (score - konExpected(o.mine, o.theirs)));
}

/**
 * Even sides for a Kon room filled by the search: the strongest first, dealt «red, blue, blue, red,
 * red, blue…» so neither side gets all the best players. Returns the team of each id.
 */
export function konDeal(players: ReadonlyArray<{ id: string; rating: number }>): Map<string, 0 | 1> {
  const out = new Map<string, 0 | 1>();
  const sorted = [...players].sort((a, b) => b.rating - a.rating || (a.id < b.id ? -1 : 1));
  sorted.forEach((p, i) => out.set(p.id, (i % 4 === 0 || i % 4 === 3 ? 0 : 1) as 0 | 1));
  return out;
}
