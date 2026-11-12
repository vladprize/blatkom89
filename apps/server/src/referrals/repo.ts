/**
 * Invitations (V2.0; v0.2.18: paid in talons) — all credited here, by the server, inside transactions.
 * A new account opened through a code is attached to its inviter; it counts once that account plays a
 * whole online match (completed, long enough, with damage dealt), and the inviter gets REFERRAL_TALONS.
 * More than REFERRAL_RULES.dailyCap in 24 hours, or a flagged account on either side, waits for an
 * administrator ('held'). Every credit is a ledger row with its own operation id
 * (`referral:<invited player's id>`); a unique index makes a second write of it impossible, also under
 * retries and concurrent requests (docs/ECONOMY.md).
 */
import { randomBytes } from 'node:crypto';
import { REFERRAL_BLATS, REFERRAL_RULES, REFERRAL_TALONS, isRefCode } from '@blatkom/shared';
import type { ReferralBlatsRules, ReferralResponse, ReferralRow } from '@blatkom/shared';
import type postgres from 'postgres';
import type { Sql } from '../database/db.js';

type Tx = postgres.TransactionSql<Record<string, unknown>>;
type Q = Sql | Tx;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export interface ReferralPaid {
  referrerId: string;
  refereeId: string;
  refereeName: string;
  /** Talons paid (0 when the inviter's account is gone). */
  reward: number;
  ordinal: number;
  /** The inviter's talons after it. */
  balance: number;
}

export type ConfirmResult = { status: 'confirmed'; paid: ReferralPaid } | { status: 'held'; referrerId: string; reason: string };

/** v0.2.25: the BLATS for an invited friend's matches — paid, or why not. */
export type BlatsResult =
  | { status: 'paid'; referrerId: string; refereeId: string; refereeName: string; amount: number; balance: number }
  | { status: 'capped' | 'held'; referrerId: string; refereeId: string; reason: string };

/** A whole online match (the rule both the talons and the BLATS count by): at least this long. */
const WHOLE_MS = REFERRAL_RULES.minMatchSec * 1000;

export class ReferralRepo {
  constructor(
    private readonly sql: Sql,
    private readonly links: { publicUrl: string; botUsername?: string | null },
    /** v0.2.25: the BLATS part (the server's settings; 0 BLATS: off). */
    private readonly blatsRules: ReferralBlatsRules = REFERRAL_BLATS,
  ) {}

  /** v0.2.25: has this invited player BLATS still to bring their inviter? */
  async hasPendingBlats(refereeId: string): Promise<boolean> {
    if (this.blatsRules.amount <= 0) return false;
    return (await this.sql`SELECT 1 FROM referrals WHERE referee_id = ${refereeId} AND status = 'confirmed' AND blats_status = 'pending' AND referrer_id IS NOT NULL`).length > 0;
  }

  /**
   * v0.2.25: pays the inviter the BLATS once `refereeId` has played the rules' number of whole matches — after
   * the invitation itself counted (talons paid: not held, not flagged). Over the month's limit it is 'capped'
   * (the talons stay); a flagged account on either side waits ('held'). Safe to call any number of times, from
   * anywhere: the referral row is locked and the ledger takes one credit per friend.
   */
  async tryPayBlats(refereeId: string): Promise<BlatsResult | null> {
    const rules = this.blatsRules;
    if (rules.amount <= 0) return null;
    return this.sql.begin(async (tx) => {
      const [r] = await tx<Array<{ referrer_id: string | null; status: string; blats_status: string }>>`
        SELECT referrer_id, status, blats_status FROM referrals WHERE referee_id = ${refereeId} FOR UPDATE`;
      if (!r || !r.referrer_id || r.status !== 'confirmed' || r.blats_status !== 'pending') return null;
      const referrerId = r.referrer_id;
      const [played] = await tx<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM match_participants mp JOIN matches m ON m.id = mp.match_id
        WHERE mp.user_id = ${refereeId} AND mp.completed AND mp.damage_dealt > 0 AND m.status = 'completed' AND m.duration_ms >= ${WHOLE_MS}`;
      if ((played?.n ?? 0) < rules.matches) return null;
      const [f] = await tx<Array<{ a: string | null; b: string | null; gone: boolean | null }>>`
        SELECT (SELECT blat_flag FROM users WHERE id = ${referrerId}) AS a, (SELECT blat_flag FROM users WHERE id = ${refereeId}) AS b,
               (SELECT deleted_at IS NOT NULL FROM users WHERE id = ${referrerId}) AS gone`;
      if (f?.gone) return null;
      if (f?.a || f?.b) {
        const reason = f.a ? 'inviter flagged' : 'invited player flagged';
        await tx`UPDATE referrals SET blats_status = 'held', blats_at = now() WHERE referee_id = ${refereeId}`;
        return { status: 'held' as const, referrerId, refereeId, reason };
      }
      const [month] = await tx<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM referrals WHERE referrer_id = ${referrerId} AND blats_status = 'paid' AND blats_at > now() - interval '30 days'`;
      if ((month?.n ?? 0) >= rules.monthlyCap) {
        await tx`UPDATE referrals SET blats_status = 'capped', blats_at = now() WHERE referee_id = ${refereeId}`;
        return { status: 'capped' as const, referrerId, refereeId, reason: `over ${rules.monthlyCap} a month` };
      }
      const [p] = await tx<Array<{ diamonds: number }>>`SELECT diamonds FROM profiles WHERE user_id = ${referrerId} FOR UPDATE`;
      if (!p) return null;
      const after = p.diamonds + rules.amount;
      const ins = await tx`
        INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref)
        VALUES (${referrerId}, 'diamonds', ${rules.amount}, ${after}, 'referral', ${`referral-blats:${refereeId}`})
        ON CONFLICT DO NOTHING RETURNING id`;
      if (!ins.length) {
        // paid before (a lost status update): the row says so now
        await tx`UPDATE referrals SET blats_status = 'paid', blats_at = COALESCE(blats_at, now()) WHERE referee_id = ${refereeId}`;
        return null;
      }
      await tx`UPDATE profiles SET diamonds = ${after}, updated_at = now() WHERE user_id = ${referrerId}`;
      await tx`UPDATE referrals SET blats_status = 'paid', blats_reward = ${rules.amount}, blats_at = now() WHERE referee_id = ${refereeId}`;
      const [u] = await tx<Array<{ display_name: string }>>`SELECT display_name FROM users WHERE id = ${refereeId}`;
      return { status: 'paid' as const, referrerId, refereeId, refereeName: u?.display_name ?? '', amount: rules.amount, balance: after };
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

  /** Pays the inviter's talons for a confirmed invitation (the referral row is locked by the caller). */
  private async pay(tx: Tx, refereeId: string, referrerId: string): Promise<ReferralPaid> {
    const [p] = await tx<Array<{ tokens: number }>>`SELECT tokens FROM profiles WHERE user_id = ${referrerId} FOR UPDATE`;
    const [cnt] = await tx<Array<{ c: number }>>`SELECT count(*)::int AS c FROM referrals WHERE referrer_id = ${referrerId} AND status = 'confirmed'`;
    const ordinal = (cnt?.c ?? 0) + 1;
    let reward = p ? REFERRAL_TALONS : 0;
    let balance = p?.tokens ?? 0;
    if (reward > 0) {
      const ins = await tx`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref) VALUES (${referrerId}, 'tokens', ${reward}, ${balance + reward}, 'referral', ${`referral:${refereeId}`}) ON CONFLICT DO NOTHING RETURNING id`;
      if (ins.length) {
        balance += reward;
        await tx`UPDATE profiles SET tokens = ${balance}, updated_at = now() WHERE user_id = ${referrerId}`;
      } else reward = 0;
    }
    await tx`UPDATE referrals SET status = 'confirmed', decided_at = now(), ordinal = ${ordinal}, reward = ${reward} WHERE referee_id = ${refereeId}`;
    const [u] = await tx<Array<{ display_name: string }>>`SELECT display_name FROM users WHERE id = ${refereeId}`;
    return { referrerId, refereeId, refereeName: u?.display_name ?? '', reward, ordinal, balance };
  }

  /** Everything the invitation screen shows. Talons earned count only invitations paid in talons (v0.2.18 on). */
  async overview(userId: string): Promise<ReferralResponse> {
    const code = await this.ensureCode(userId);
    const counts = await this.sql<Array<{ status: ReferralRow['status']; n: number }>>`
      SELECT status, count(*)::int AS n FROM referrals WHERE referrer_id = ${userId} GROUP BY status`;
    const by = (s: ReferralRow['status']) => counts.find((c) => c.status === s)?.n ?? 0;
    const [earned] = await this.sql<Array<{ s: number }>>`
      SELECT COALESCE(sum(delta), 0)::int AS s FROM currency_ledger WHERE user_id = ${userId} AND currency = 'tokens' AND reason = 'referral'`;
    const rules = this.blatsRules;
    const [bl] = await this.sql<Array<{ s: number; m: number }>>`
      SELECT COALESCE((SELECT sum(delta) FROM currency_ledger WHERE user_id = ${userId} AND currency = 'diamonds' AND reason = 'referral'), 0)::int AS s,
             (SELECT count(*) FROM referrals WHERE referrer_id = ${userId} AND blats_status = 'paid' AND blats_at > now() - interval '30 days')::int AS m`;
    const recent = await this.sql<Array<{ display_name: string; attached_at: Date; status: ReferralRow['status']; paid: number; blats_status: string; blats_reward: number; matches: number }>>`
      SELECT u.display_name, r.attached_at, r.status, r.blats_status, r.blats_reward,
             (SELECT count(*) FROM match_participants mp JOIN matches m ON m.id = mp.match_id WHERE mp.user_id = r.referee_id AND mp.completed AND mp.damage_dealt > 0 AND m.status = 'completed' AND m.duration_ms >= ${WHOLE_MS})::int AS matches,
             COALESCE((SELECT l.delta FROM currency_ledger l WHERE l.user_id = r.referrer_id AND l.currency = 'tokens' AND l.reason = 'referral' AND l.ref = 'referral:' || r.referee_id::text), 0)::int AS paid
      FROM referrals r JOIN users u ON u.id = r.referee_id
      WHERE r.referrer_id = ${userId} ORDER BY r.attached_at DESC LIMIT 20`;
    const base = this.links.publicUrl.replace(/\/$/, '');
    return {
      code,
      link: `${base}/?ref=${encodeURIComponent(code)}`,
      telegramLink: this.links.botUsername ? `https://t.me/${this.links.botUsername}?start=ref_${code}` : null,
      invited: counts.reduce((a, c) => a + c.n, 0),
      confirmed: by('confirmed'),
      pending: by('pending'),
      held: by('held'),
      earned: earned?.s ?? 0,
      reward: REFERRAL_TALONS,
      recent: recent.map((r) => ({ name: r.display_name, at: r.attached_at.toISOString(), status: r.status, reward: r.paid, blats: r.blats_reward, matches: r.matches, blatsStatus: r.blats_status })),
      ...(rules.amount > 0 ? { blats: { amount: rules.amount, matches: rules.matches, monthlyCap: rules.monthlyCap, earned: bl?.s ?? 0, thisMonth: bl?.m ?? 0 } } : {}),
    };
  }

  /** For tests and the admin: the inviter's confirmed count. */
  async confirmedCount(referrerId: string, q: Q = this.sql): Promise<number> {
    const [r] = await q<Array<{ n: number }>>`SELECT count(*)::int AS n FROM referrals WHERE referrer_id = ${referrerId} AND status = 'confirmed'`;
    return r?.n ?? 0;
  }
}
