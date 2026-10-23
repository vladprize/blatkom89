/**
 * Stakes in «Блатной кон» — DESIGNED, SWITCHED OFF (V2.0 part D; docs/KON.md §6).
 *
 * Nothing in the game reserves, moves or pays $BLAT for a Kon match. `KON_STAKES.enabled` is a constant,
 * not a setting: switching it on is a code change that needs the owner's approval and a legal review
 * first ($BLAT may gain an economic value later). Kon ratings never touch $BLAT either way.
 *
 * What a future implementation must do (the pure rules below are tested so the design is concrete):
 *   1. reserve every participant's stake on the server (a ledger row per reservation, its own operation
 *      id — `kon-stake:<match>:<player>`), only after each of them confirmed;
 *   2. start the match only when every stake is reserved; never let a reservation be spent twice;
 *   3. settle on the server from the server's own result: winners share the pool equally, a draw or a
 *      technical failure returns every stake, a leaver's stake stays in the pool;
 *   4. every movement is a ledger row; settlement is idempotent (a second call changes nothing).
 */

export const KON_STAKES = Object.freeze({ enabled: false as const, minStake: 100, maxStake: 10_000 });

export interface StakeSettlement {
  /** `pool`: the winners shared it; `refund`: every stake went back. */
  kind: 'pool' | 'refund';
  /** What each participant receives (their stake was reserved before). */
  payouts: Map<string, number>;
  pool: number;
}

/**
 * Settles a pool where everyone staked `stake`: the winners share the whole pool equally (what does not
 * divide evenly goes one by one to the winners in id order — nothing is created or lost); a draw, a
 * failed match or a side with nobody left returns every stake.
 */
export function settleStakes(o: { stake: number; players: ReadonlyArray<{ id: string; team: 0 | 1 }>; winner: 0 | 1 | null; failed: boolean }): StakeSettlement {
  const stake = Math.max(0, Math.floor(o.stake));
  const pool = stake * o.players.length;
  const winners = o.winner === null ? [] : o.players.filter((p) => p.team === o.winner).map((p) => p.id).sort();
  const payouts = new Map<string, number>();
  if (o.failed || winners.length === 0) {
    for (const p of o.players) payouts.set(p.id, stake);
    return { kind: 'refund', payouts, pool };
  }
  for (const p of o.players) payouts.set(p.id, 0);
  const share = Math.floor(pool / winners.length);
  let rest = pool - share * winners.length;
  for (const id of winners) {
    payouts.set(id, share + (rest > 0 ? 1 : 0));
    if (rest > 0) rest--;
  }
  return { kind: 'pool', payouts, pool };
}

/** The switch every stake entry point must pass (there is none while it is off). */
export function stakesAllowed(): boolean {
  return KON_STAKES.enabled;
}
