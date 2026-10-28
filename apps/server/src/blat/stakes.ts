/**
 * The $BLAT Tournament's stakes (v0.2.17; docs/KON.md §6, the rules in game-rules/konStakes.ts) — moved
 * on the server only, inside transactions:
 *
 *  • `check` — may this player stake this much now (the TOURNAMENT_STAKES switch, the account's age, a
 *    hold, the balance, the day's limit);
 *  • `reserve` — before a staked match starts: the match row and every player's stake in ONE transaction,
 *    all or nothing. A stake is a ledger row `stake:<match>` (negative) — the unique operation id makes a
 *    second reservation of it impossible;
 *  • `settleMatchStakes` — inside the match-results transaction (progression/recorder.ts), once: the pool
 *    to the winners who stayed, or the stakes back on a draw;
 *  • `refundStakes` — every reserved stake back (the match never started or was abandoned);
 *    `refundStaleStakes` — the same for reservations a stopped server left behind.
 *
 * The match row says where its pool stands (`stakes_state`: reserved → settled | refunded) and is locked
 * while it changes, so a pool is settled or refunded exactly once.
 */
import { KON_STAKES, settleStakes, stakeRefusal } from '@blatkom/shared';
import type { GameMode, KonFormat, KonStakeStatus, MapId, StakeOutcome, StakeRefusal, Team } from '@blatkom/shared';
import type postgres from 'postgres';
import type { Sql } from '../database/db.js';
import type { Logger } from '../logging/logger.js';

type Tx = postgres.TransactionSql<Record<string, unknown>>;
type Q = Sql | Tx;

export interface StakeReservation {
  matchId: string;
  roomId: string;
  mapId: MapId;
  mode: GameMode;
  isPrivate: boolean;
  kon: KonFormat;
  stake: number;
  userIds: string[];
}

export type ReserveResult = { ok: true } | { ok: false; userId: string; reason: StakeRefusal };

/** What the rooms use (services/contracts.ts `Stakes`). */
export interface StakeService {
  check(userId: string, stake: number): Promise<StakeRefusal | null>;
  reserve(r: StakeReservation): Promise<ReserveResult>;
  refund(matchId: string): Promise<number>;
}

class Refused extends Error {
  constructor(
    readonly userId: string,
    readonly reason: StakeRefusal,
  ) {
    super(reason);
  }
}

/** What the player staked in the last 24 hours (stakes that came back don't count). */
async function stakedToday(q: Q, userId: string): Promise<number> {
  const [r] = await q<Array<{ s: number }>>`
    SELECT COALESCE(sum(-l.delta), 0)::int AS s
    FROM currency_ledger l LEFT JOIN matches m ON m.id = (CASE WHEN l.ref ~ '^stake:[0-9a-f-]{36}$' THEN split_part(l.ref, ':', 2)::uuid END)
    WHERE l.user_id = ${userId} AND l.reason = 'stake' AND l.currency = 'blat' AND l.created_at > now() - interval '24 hours'
      AND m.stakes_state IS DISTINCT FROM 'refunded'`;
  return r?.s ?? 0;
}

/** Pays `payouts` (user → amount) for a match, once per player and reason (`<reason>:<match>`). */
async function pay(tx: Tx, matchId: string, reason: 'stake_win' | 'stake_refund', payouts: ReadonlyMap<string, number>): Promise<void> {
  for (const userId of [...payouts.keys()].sort()) {
    const amount = payouts.get(userId) ?? 0;
    if (amount <= 0) continue;
    const [p] = await tx<Array<{ blat: number }>>`SELECT blat FROM profiles WHERE user_id = ${userId} FOR UPDATE`;
    if (!p) continue;
    const ins = await tx`
      INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref)
      VALUES (${userId}, 'blat', ${amount}, ${p.blat + amount}, ${reason}, ${`${reason}:${matchId}`})
      ON CONFLICT DO NOTHING RETURNING id`;
    if (ins.length) await tx`UPDATE profiles SET blat = blat + ${amount}, updated_at = now() WHERE user_id = ${userId}`;
  }
}

/** The stakes reserved for a match: who and how much. */
async function reserved(tx: Tx, matchId: string): Promise<Array<{ user_id: string; amount: number }>> {
  return tx<Array<{ user_id: string; amount: number }>>`
    SELECT user_id, -delta AS amount FROM currency_ledger WHERE currency = 'blat' AND reason = 'stake' AND ref = ${`stake:${matchId}`} ORDER BY user_id`;
}

/** Every reserved stake of the match back to its player (nothing if the pool is settled already). */
export async function refundStakes(sql: Sql, matchId: string): Promise<number> {
  return sql.begin(async (tx) => {
    const [m] = await tx<Array<{ stakes_state: string | null }>>`SELECT stakes_state FROM matches WHERE id = ${matchId} FOR UPDATE`;
    if (!m || m.stakes_state !== 'reserved') return 0;
    const rows = await reserved(tx, matchId);
    await pay(tx, matchId, 'stake_refund', new Map(rows.map((r) => [r.user_id, r.amount])));
    await tx`UPDATE matches SET stakes_state = 'refunded' WHERE id = ${matchId}`;
    return rows.length;
  });
}

/**
 * Settles a staked match from the server's own result. Call inside the match-results transaction that
 * already holds the match row (SELECT … FOR UPDATE). `participants`: everyone who started the match —
 * `completed: false` is a player who left (their stake stays in the pool).
 */
export async function settleMatchStakes(tx: Tx, matchId: string, winner: Team | null, participants: ReadonlyArray<{ userId: string; team: Team | null; completed: boolean }>): Promise<Map<string, StakeOutcome>> {
  const out = new Map<string, StakeOutcome>();
  const [m] = await tx<Array<{ stake: number; stakes_state: string | null }>>`SELECT stake, stakes_state FROM matches WHERE id = ${matchId}`;
  if (!m || m.stakes_state !== 'reserved' || m.stake <= 0) return out;
  const rows = await reserved(tx, matchId);
  const byId = new Map(participants.map((p) => [p.userId, p]));
  const players = rows.map((r) => {
    const p = byId.get(r.user_id);
    return { id: r.user_id, team: p?.team ?? null, left: !p || !p.completed };
  });
  const s = settleStakes({ stake: m.stake, players, winner, failed: false });
  await pay(tx, matchId, s.kind === 'pool' ? 'stake_win' : 'stake_refund', s.payouts);
  await tx`UPDATE matches SET stakes_state = ${s.kind === 'refund' ? 'refunded' : 'settled'} WHERE id = ${matchId}`;
  for (const p of players) {
    const payout = s.payouts.get(p.id) ?? 0;
    out.set(p.id, { stake: m.stake, payout, outcome: s.kind === 'refund' ? 'refund' : s.kind === 'draw' ? (payout > 0 ? 'draw' : 'loss') : payout > 0 ? 'win' : 'loss' });
  }
  return out;
}

/** Reservations a stopped server left behind (older than `olderThanMs`): every stake back. */
export async function refundStaleStakes(sql: Sql, olderThanMs: number, log?: Logger): Promise<number> {
  const rows = await sql<Array<{ id: string }>>`
    SELECT id FROM matches WHERE stakes_state = 'reserved' AND started_at < now() - ${Math.round(olderThanMs / 1000)} * interval '1 second'
    ORDER BY started_at LIMIT 200`;
  let n = 0;
  for (const r of rows) {
    const back = await refundStakes(sql, r.id);
    await sql`UPDATE matches SET status = 'abandoned', ended_at = COALESCE(ended_at, now()), end_reason = COALESCE(end_reason, 'stakes_refunded') WHERE id = ${r.id} AND status = 'active'`;
    if (back) log?.info('stale stakes refunded', { matchId: r.id, players: back });
    n++;
  }
  return n;
}

export class PgStakes implements StakeService {
  constructor(
    private readonly sql: Sql,
    private readonly enabled: boolean,
  ) {}

  private async facts(q: Q, userId: string, lock: boolean): Promise<{ created_at: Date; blat_flag: string | null; blat: number } | null> {
    const [u] = lock
      ? await q<Array<{ created_at: Date; blat_flag: string | null; blat: number }>>`
          SELECT u.created_at, u.blat_flag, p.blat FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = ${userId} AND u.deleted_at IS NULL FOR UPDATE OF p`
      : await q<Array<{ created_at: Date; blat_flag: string | null; blat: number }>>`
          SELECT u.created_at, u.blat_flag, COALESCE(p.blat, 0) AS blat FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ${userId} AND u.deleted_at IS NULL`;
    return u ?? null;
  }

  async check(userId: string, stake: number): Promise<StakeRefusal | null> {
    if (stake <= 0) return null;
    if (!this.enabled) return 'stakes_off';
    const u = await this.facts(this.sql, userId, false);
    if (!u) return 'blat_low';
    return stakeRefusal({ enabled: true, stake, balance: u.blat, accountAgeMs: Date.now() - u.created_at.getTime(), flagged: !!u.blat_flag, stakedToday: await stakedToday(this.sql, userId) });
  }

  /** The tournament screen: whether the player can stake now, and how much is left for today. */
  async status(userId: string): Promise<KonStakeStatus> {
    const u = await this.facts(this.sql, userId, false);
    const age = u ? Date.now() - u.created_at.getTime() : 0;
    const today = await stakedToday(this.sql, userId);
    const refusal: KonStakeStatus['refusal'] = !this.enabled ? 'stakes_off' : age < KON_STAKES.minAccountAgeMs ? 'account_new' : u?.blat_flag ? 'blat_flagged' : null;
    return {
      enabled: this.enabled,
      balance: u?.blat ?? 0,
      refusal,
      dailyLeft: Math.max(0, KON_STAKES.dailyLimit - today),
      from: refusal === 'account_new' && u ? new Date(u.created_at.getTime() + KON_STAKES.minAccountAgeMs).toISOString() : null,
    };
  }

  async reserve(r: StakeReservation): Promise<ReserveResult> {
    const ids = [...new Set(r.userIds)].sort();
    try {
      await this.sql.begin(async (tx) => {
        await tx`
          INSERT INTO matches (id, room_id, map_id, mode, is_private, status, started_at, player_count, bot_count, kon_format, stake, stakes_state)
          VALUES (${r.matchId}, ${r.roomId}, ${r.mapId}, ${r.mode}, ${r.isPrivate}, 'active', now(), ${ids.length}, 0, ${r.kon}, ${r.stake}, 'reserved')`;
        for (const userId of ids) {
          const u = await this.facts(tx, userId, true);
          if (!u) throw new Refused(userId, 'blat_low');
          const why = stakeRefusal({ enabled: this.enabled, stake: r.stake, balance: u.blat, accountAgeMs: Date.now() - u.created_at.getTime(), flagged: !!u.blat_flag, stakedToday: await stakedToday(tx, userId) });
          if (why) throw new Refused(userId, why);
          await tx`
            INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref)
            VALUES (${userId}, 'blat', ${-r.stake}, ${u.blat - r.stake}, 'stake', ${`stake:${r.matchId}`})`;
          await tx`UPDATE profiles SET blat = blat - ${r.stake}, updated_at = now() WHERE user_id = ${userId}`;
        }
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof Refused) return { ok: false, userId: e.userId, reason: e.reason };
      throw e;
    }
  }

  async refund(matchId: string): Promise<number> {
    const n = await refundStakes(this.sql, matchId);
    await this.sql`UPDATE matches SET status = 'abandoned', ended_at = COALESCE(ended_at, now()), end_reason = COALESCE(end_reason, 'stakes_refunded') WHERE id = ${matchId} AND status = 'active' AND results_processed_at IS NULL`;
    return n;
  }
}

/**
 * The job that gives back what a stopped server left reserved: on start (after 20 s) and every 5 minutes,
 * for reservations older than `staleMs` (longer than any match). Timers are unref'd.
 */
export function scheduleStakeRefunds(sql: Sql, log: Logger, staleMs: number): () => void {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await refundStaleStakes(sql, staleMs, log);
    } catch (e) {
      log.warn('stale stakes refund failed', { err: (e as Error).message });
    } finally {
      running = false;
    }
  };
  const first = setTimeout(() => void run(), 20_000);
  const every = setInterval(() => void run(), 5 * 60_000);
  first.unref();
  every.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
