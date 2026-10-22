/**
 * $BLAT (V2.0): the balance, the level rewards and the referral programme — all credited here, by the
 * server, inside transactions. Every credit is a ledger row with its own operation id (`level:7`,
 * `referral:<invited player's id>`); a unique index makes a second write of the same operation impossible,
 * also under retries and concurrent requests (docs/BLAT.md).
 *
 *  • Levels: every level from 1 to the player's level is paid once (level 1 is the welcome). Called in the
 *    match-results transaction and whenever the player's own profile is read (sign-in, /api/me) and has
 *    levels not paid yet — the welcome and the levels reached before $BLAT existed.
 *  • Referrals: a new account opened through a code is attached to its inviter; it counts once that
 *    account plays a whole online match (completed, long enough, with damage dealt). The n-th confirmed
 *    invitation pays REFERRAL_TIERS(n). More than REFERRAL_RULES.dailyCap in 24 hours, or a flagged
 *    account on either side, waits for an administrator ('held').
 */
import { randomBytes } from 'node:crypto';
import { BLAT_LIMITS, REFERRAL_RULES, blatForLevel, isRefCode, referralReward } from '@blatkom/shared';
import type { BlatEntry, BlatReferralRow, BlatResponse, BlatSource } from '@blatkom/shared';
import type postgres from 'postgres';
import type { Sql } from '../database/db.js';

type Tx = postgres.TransactionSql<Record<string, unknown>>;
type Q = Sql | Tx;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export interface ReferralPaid {
  referrerId: string;
  refereeId: string;
  refereeName: string;
  reward: number;
  ordinal: number;
  balance: number;
}

export type ConfirmResult = { status: 'confirmed'; paid: ReferralPaid } | { status: 'held'; referrerId: string; reason: string };

/** Credits the levels 1…`level` not paid yet. Call inside a transaction that holds the profile row. */
export async function creditLevels(tx: Tx, userId: string, level: number): Promise<{ gained: number; balance: number }> {
  const [p] = await tx<Array<{ blat: number; blat_earned: number; blat_level: number }>>`SELECT blat, blat_earned, blat_level FROM profiles WHERE user_id = ${userId} FOR UPDATE`;
  if (!p) return { gained: 0, balance: 0 };
  if (p.blat_level >= level) return { gained: 0, balance: p.blat };
  const paid = new Set((await tx<Array<{ ref: string }>>`SELECT ref FROM currency_ledger WHERE user_id = ${userId} AND currency = 'blat' AND reason = 'level'`).map((r) => r.ref));
  let balance = p.blat;
  let earned = p.blat_earned;
  let gained = 0;
  for (let l = 1; l <= level; l++) {
    const ref = `level:${l}`;
    if (paid.has(ref)) continue;
    const amount = blatForLevel(l);
    if (amount <= 0 || amount > BLAT_LIMITS.maxCredit || balance + amount > BLAT_LIMITS.maxBalance) continue;
    const ins = await tx`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref) VALUES (${userId}, 'blat', ${amount}, ${balance + amount}, 'level', ${ref}) ON CONFLICT DO NOTHING RETURNING id`;
    if (ins.length === 0) continue;
    balance += amount;
    earned += amount;
    gained += amount;
  }
  await tx`UPDATE profiles SET blat = ${balance}, blat_earned = ${earned}, blat_level = GREATEST(blat_level, ${level}), updated_at = now() WHERE user_id = ${userId}`;
  return { gained, balance };
}

export class BlatRepo {
  constructor(
    private readonly sql: Sql,
    private readonly links: { publicUrl: string; botUsername?: string | null },
  ) {}

  /** Pays the levels reached so far (a player who levelled up before $BLAT existed gets them now). */
  async backfillLevels(userId: string): Promise<number> {
    return this.sql.begin(async (tx) => {
      const [p] = await tx<Array<{ level: number }>>`SELECT level FROM profiles WHERE user_id = ${userId} FOR UPDATE`;
      if (!p) return 0;
      return (await creditLevels(tx, userId, p.level)).gained;
    });
  }

  /** The player's referral code (made the first time it is asked for). */
  async ensureCode(userId: string): Promise<string> {
    const [u] = await this.sql<Array<{ ref_code: string | null }>>`SELECT ref_code FROM users WHERE id = ${userId}`;
    if (u?.ref_code) return u.ref_code;
    for (let attempt = 0; attempt < 8; attempt++) {
      const bytes = randomBytes(8);
      const code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
      try {
        const rows = await this.sql<Array<{ ref_code: string }>>`
          UPDATE users SET ref_code = COALESCE(ref_code, ${code}) WHERE id = ${userId} RETURNING ref_code`;
        if (rows[0]) return rows[0].ref_code;
        throw new Error('no such user');
      } catch (e) {
        if ((e as { code?: string }).code !== '23505') throw e;
      }
    }
    throw new Error('could not make a referral code');
  }

  /**
   * A new account opened with a code: attached to its inviter (once and for good). Unknown codes, one's
   * own code and accounts that already have an inviter are ignored.
   */
  async attach(refereeId: string, code: string): Promise<'attached' | 'unknown' | 'self' | 'exists'> {
    if (!isRefCode(code)) return 'unknown';
    const [r] = await this.sql<Array<{ id: string }>>`SELECT id FROM users WHERE lower(ref_code) = lower(${code}) AND deleted_at IS NULL`;
    if (!r) return 'unknown';
    if (r.id === refereeId) return 'self';
    const ins = await this.sql`INSERT INTO referrals (referee_id, referrer_id, code) VALUES (${refereeId}, ${r.id}, ${code}) ON CONFLICT DO NOTHING RETURNING referee_id`;
    return ins.length ? 'attached' : 'exists';
  }

  /** Has this player an invitation waiting for their first whole match? */
  async hasPending(refereeId: string): Promise<boolean> {
    return (await this.sql`SELECT 1 FROM referrals WHERE referee_id = ${refereeId} AND status = 'pending'`).length > 0;
  }

  /**
   * Counts the invitation of `refereeId` when they have played a whole match: pays the inviter (or holds
   * it for a check). Safe to call any number of times, from anywhere.
   */
  async tryConfirm(refereeId: string): Promise<ConfirmResult | null> {
    return this.sql.begin(async (tx) => {
      const [r] = await tx<Array<{ referrer_id: string | null; status: string }>>`SELECT referrer_id, status FROM referrals WHERE referee_id = ${refereeId} FOR UPDATE`;
      if (!r || r.status !== 'pending' || !r.referrer_id) return null;
      const played = await tx`
        SELECT 1 FROM match_participants mp JOIN matches m ON m.id = mp.match_id
        WHERE mp.user_id = ${refereeId} AND mp.completed AND mp.damage_dealt > 0 AND m.status = 'completed'
          AND m.duration_ms >= ${REFERRAL_RULES.minMatchSec * 1000}
        LIMIT 1`;
      if (played.length === 0) return null;
      const [f] = await tx<Array<{ a: string | null; b: string | null; gone: boolean }>>`
        SELECT (SELECT blat_flag FROM users WHERE id = ${r.referrer_id}) AS a, (SELECT blat_flag FROM users WHERE id = ${refereeId}) AS b,
               (SELECT deleted_at IS NOT NULL FROM users WHERE id = ${r.referrer_id}) AS gone`;
      if (f?.gone) return null;
      const [day] = await tx<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM referrals WHERE referrer_id = ${r.referrer_id} AND status = 'confirmed' AND decided_at > now() - interval '24 hours'`;
      const n = day?.n ?? 0;
      const why = f?.a ? 'inviter flagged' : f?.b ? 'invited player flagged' : n >= REFERRAL_RULES.dailyCap ? `over ${REFERRAL_RULES.dailyCap} a day` : null;
      if (why) {
        await tx`UPDATE referrals SET status = 'held', decided_at = now(), note = ${why} WHERE referee_id = ${refereeId}`;
        return { status: 'held', referrerId: r.referrer_id, reason: why };
      }
      return { status: 'confirmed', paid: await this.pay(tx, refereeId, r.referrer_id) };
    });
  }

  /** An administrator's decision on a held invitation (or one still pending). */
  async decide(refereeId: string, action: 'confirm' | 'reject', note: string | null): Promise<{ status: 'confirmed'; paid: ReferralPaid } | { status: 'rejected' } | null> {
    return this.sql.begin(async (tx) => {
      const [r] = await tx<Array<{ referrer_id: string | null; status: string }>>`SELECT referrer_id, status FROM referrals WHERE referee_id = ${refereeId} FOR UPDATE`;
      if (!r || !r.referrer_id || (r.status !== 'held' && r.status !== 'pending')) return null;
      if (action === 'reject') {
        await tx`UPDATE referrals SET status = 'rejected', decided_at = now(), note = ${note} WHERE referee_id = ${refereeId}`;
        return { status: 'rejected' as const };
      }
      const paid = await this.pay(tx, refereeId, r.referrer_id);
      if (note) await tx`UPDATE referrals SET note = ${note} WHERE referee_id = ${refereeId}`;
      return { status: 'confirmed' as const, paid };
    });
  }

  /** Pays the inviter for the next confirmed invitation (the referral row is locked by the caller). */
  private async pay(tx: Tx, refereeId: string, referrerId: string): Promise<ReferralPaid> {
    const [p] = await tx<Array<{ blat: number; blat_earned: number }>>`SELECT blat, blat_earned FROM profiles WHERE user_id = ${referrerId} FOR UPDATE`;
    const [cnt] = await tx<Array<{ c: number }>>`SELECT count(*)::int AS c FROM referrals WHERE referrer_id = ${referrerId} AND status = 'confirmed'`;
    const ordinal = (cnt?.c ?? 0) + 1;
    let reward = referralReward(ordinal);
    let balance = p?.blat ?? 0;
    if (!p || reward > BLAT_LIMITS.maxCredit || balance + reward > BLAT_LIMITS.maxBalance) reward = 0;
    if (reward > 0) {
      const ins = await tx`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref) VALUES (${referrerId}, 'blat', ${reward}, ${balance + reward}, 'referral', ${`referral:${refereeId}`}) ON CONFLICT DO NOTHING RETURNING id`;
      if (ins.length) {
        balance += reward;
        await tx`UPDATE profiles SET blat = ${balance}, blat_earned = ${(p?.blat_earned ?? 0) + reward}, updated_at = now() WHERE user_id = ${referrerId}`;
      } else reward = 0;
    }
    await tx`UPDATE referrals SET status = 'confirmed', decided_at = now(), ordinal = ${ordinal}, reward = ${reward} WHERE referee_id = ${refereeId}`;
    const [u] = await tx<Array<{ display_name: string }>>`SELECT display_name FROM users WHERE id = ${refereeId}`;
    return { referrerId, refereeId, refereeName: u?.display_name ?? '', reward, ordinal, balance };
  }

  /** Everything the $BLAT screen shows (and the levels reached earlier, paid now). */
  async overview(userId: string): Promise<BlatResponse> {
    const justCredited = await this.backfillLevels(userId);
    const code = await this.ensureCode(userId);
    const [p] = await this.sql<Array<{ blat: number; blat_earned: number; level: number }>>`SELECT blat, blat_earned, level FROM profiles WHERE user_id = ${userId}`;
    const sums = await this.sql<Array<{ reason: BlatSource; s: number }>>`
      SELECT reason, sum(delta)::int AS s FROM currency_ledger WHERE user_id = ${userId} AND currency = 'blat' GROUP BY reason`;
    const bySource: Record<BlatSource, number> = { level: 0, referral: 0, grant: 0 };
    for (const r of sums) if (r.reason in bySource) bySource[r.reason] = r.s;
    const counts = await this.sql<Array<{ status: BlatReferralRow['status']; n: number; reward: number }>>`
      SELECT status, count(*)::int AS n, coalesce(sum(reward), 0)::int AS reward FROM referrals WHERE referrer_id = ${userId} GROUP BY status`;
    const by = (s: BlatReferralRow['status']) => counts.find((c) => c.status === s);
    const confirmed = by('confirmed')?.n ?? 0;
    const recent = await this.sql<Array<{ display_name: string; attached_at: Date; status: BlatReferralRow['status']; reward: number }>>`
      SELECT u.display_name, r.attached_at, r.status, r.reward FROM referrals r JOIN users u ON u.id = r.referee_id
      WHERE r.referrer_id = ${userId} ORDER BY r.attached_at DESC LIMIT 20`;
    const hist = await this.sql<Array<{ created_at: Date; delta: number; balance_after: number; reason: BlatSource; ref: string | null; who: string | null }>>`
      SELECT l.created_at, l.delta, l.balance_after, l.reason, l.ref, u.display_name AS who
      FROM currency_ledger l
      LEFT JOIN users u ON l.reason = 'referral' AND u.id::text = substring(l.ref from 10)
      WHERE l.user_id = ${userId} AND l.currency = 'blat'
      ORDER BY l.id DESC LIMIT 50`;
    const level = p?.level ?? 1;
    const base = this.links.publicUrl.replace(/\/$/, '');
    const history: BlatEntry[] = hist.map((h) => ({ at: h.created_at.toISOString(), delta: h.delta, balanceAfter: h.balance_after, source: h.reason, ref: h.ref, ...(h.reason === 'referral' ? { who: h.who } : {}) }));
    return {
      balance: p?.blat ?? 0,
      earned: p?.blat_earned ?? 0,
      bySource,
      level,
      nextLevel: blatForLevel(level + 1) > 0 ? { level: level + 1, reward: blatForLevel(level + 1) } : null,
      referral: {
        code,
        link: `${base}/?ref=${encodeURIComponent(code)}`,
        telegramLink: this.links.botUsername ? `https://t.me/${this.links.botUsername}?start=ref_${code}` : null,
        invited: counts.reduce((a, c) => a + c.n, 0),
        confirmed,
        pending: by('pending')?.n ?? 0,
        held: by('held')?.n ?? 0,
        earned: by('confirmed')?.reward ?? 0,
        nextReward: referralReward(confirmed + 1),
        recent: recent.map((r) => ({ name: r.display_name, at: r.attached_at.toISOString(), status: r.status, reward: r.reward })),
      },
      history,
      justCredited,
    };
  }

  /** For tests and the admin: the inviter's confirmed count. */
  async confirmedCount(referrerId: string, q: Q = this.sql): Promise<number> {
    const [r] = await q<Array<{ n: number }>>`SELECT count(*)::int AS n FROM referrals WHERE referrer_id = ${referrerId} AND status = 'confirmed'`;
    return r?.n ?? 0;
  }
}
