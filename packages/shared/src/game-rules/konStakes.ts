/**
 * Stakes in the $BLAT Tournament (v0.2.17; docs/KON.md §6). The owner: «players play staking their
 * tokens equally — the winners take the pool».
 *
 * Everyone in a staked tournament room stakes the same amount. The server reserves every stake in one
 * transaction before the match starts (all or nothing) and settles once, from its own result:
 *   • a win — the winners who stayed to the end share the whole pool equally;
 *   • a draw — everyone who stayed gets their stake back, and the stakes of those who left are shared
 *     among them;
 *   • a match that never finished (the server stopped, the room broke) — every stake goes back;
 *   • a player who leaves forfeits their stake to the pool.
 * Stakes move $BLAT between players and create none: what is paid out is exactly what was staked.
 *
 * Who may stake: the server's TOURNAMENT_STAKES switch is on, the account is at least a day old, it
 * isn't held for a check, the balance covers the stake, and the day's stakes stay within the limit.
 */

/** The stakes a room can have (0: no stake — the tournament rating only). */
export const KON_STAKE_AMOUNTS = [100, 500, 1000, 5000] as const;
export type KonStake = 0 | (typeof KON_STAKE_AMOUNTS)[number];

export const KON_STAKES = Object.freeze({
  amounts: KON_STAKE_AMOUNTS,
  /** At most this much staked in 24 hours (stakes that came back don't count). */
  dailyLimit: 20_000,
  /** An account stakes from its second day on. */
  minAccountAgeMs: 24 * 3600_000,
});

export function isKonStake(v: unknown): v is KonStake {
  return v === 0 || (KON_STAKE_AMOUNTS as readonly unknown[]).includes(v);
}

/** Why a player may not stake (the API's error codes). */
export type StakeRefusal = 'stakes_off' | 'account_new' | 'blat_flagged' | 'blat_low' | 'daily_limit';
export const STAKE_REFUSALS: readonly StakeRefusal[] = ['stakes_off', 'account_new', 'blat_flagged', 'blat_low', 'daily_limit'];

/** The rule for one player (the server reads the facts from the database; the client shows them). */
export function stakeRefusal(o: { enabled: boolean; stake: number; balance: number; accountAgeMs: number; flagged: boolean; stakedToday: number }): StakeRefusal | null {
  if (o.stake <= 0) return null;
  if (!o.enabled) return 'stakes_off';
  if (o.accountAgeMs < KON_STAKES.minAccountAgeMs) return 'account_new';
  if (o.flagged) return 'blat_flagged';
  if (o.balance < o.stake) return 'blat_low';
  if (o.stakedToday + o.stake > KON_STAKES.dailyLimit) return 'daily_limit';
  return null;
}

export interface StakeSettlement {
  /** `pool`: the winners shared it; `draw`: the stakes went back (the leavers' shared); `refund`: every stake went back. */
  kind: 'pool' | 'draw' | 'refund';
  /** What each participant receives (their stake was reserved before). */
  payouts: Map<string, number>;
  pool: number;
}

/** Shares `amount` equally among `ids` (sorted): what doesn't divide goes one by one in that order. */
function share(amount: number, ids: readonly string[], into: Map<string, number>) {
  if (ids.length === 0 || amount <= 0) return;
  const each = Math.floor(amount / ids.length);
  let rest = amount - each * ids.length;
  for (const id of ids) {
    into.set(id, (into.get(id) ?? 0) + each + (rest > 0 ? 1 : 0));
    if (rest > 0) rest--;
  }
}

/**
 * Settles a pool where everyone staked `stake`. `left`: the player wasn't there at the end (their stake
 * stays in the pool). Nothing is created or lost: the payouts always add up to the pool.
 */
export function settleStakes(o: { stake: number; players: ReadonlyArray<{ id: string; team: 0 | 1 | null; left?: boolean }>; winner: 0 | 1 | null; failed: boolean }): StakeSettlement {
  const stake = Math.max(0, Math.floor(o.stake));
  const pool = stake * o.players.length;
  const payouts = new Map<string, number>();
  for (const p of o.players) payouts.set(p.id, 0);
  const stayed = o.players.filter((p) => !p.left);
  if (o.failed || stayed.length === 0) {
    for (const p of o.players) payouts.set(p.id, stake);
    return { kind: 'refund', payouts, pool };
  }
  const winners = o.winner === null ? [] : stayed.filter((p) => p.team === o.winner).map((p) => p.id).sort();
  if (winners.length > 0) {
    share(pool, winners, payouts);
    return { kind: 'pool', payouts, pool };
  }
  // a draw: those who stayed get their stake back and share the leavers' stakes
  const ids = stayed.map((p) => p.id).sort();
  for (const id of ids) payouts.set(id, stake);
  share(stake * (o.players.length - stayed.length), ids, payouts);
  return { kind: stayed.length === o.players.length ? 'refund' : 'draw', payouts, pool };
}
