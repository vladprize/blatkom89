/**
 * BLAT DROP (V2.0 part C): the announcement date and the balance snapshots.
 *
 *  • The date: an administrator's value (`app_settings`, key `blat_drop.announce_at`) or, before any
 *    administrator has set one, the BLAT_DROP_ANNOUNCE_AT variable. Every player gets it together with
 *    the server's clock, so the countdown is the same for everyone. It is an announcement date, not a
 *    promise of anything — the screen says so.
 *  • Snapshots: every account holding $BLAT at one moment, read in one REPEATABLE READ transaction (a
 *    credit made while the snapshot is taken is either wholly in it or wholly out), frozen in
 *    `blat_snapshot_rows` with the checks that decide eligibility — an administrator's flag, a $BLAT
 *    ledger that does not add up to the balance. Exported as CSV or JSON. No token, no wallet, no
 *    transfer: a snapshot is a record (docs/BLAT.md §6).
 */
import { randomUUID } from 'node:crypto';
import type { AdminBlatDrop, AdminBlatSnapshot, AdminBlatSnapshotRow } from '@blatkom/shared';
import type { Sql } from '../database/db.js';

export const DROP_KEY = 'blat_drop.announce_at';

/** The rules every snapshot is taken by (stored with it, so an old snapshot keeps its own rules). */
export const SNAPSHOT_RULES = Object.freeze({
  version: 1,
  includes: 'every existing account whose $BLAT balance is above 0 at the moment of the snapshot',
  balance: 'profiles.blat read in one REPEATABLE READ transaction',
  eligible: 'not flagged by an administrator, and the $BLAT ledger adds up to the balance',
  reasons: { flagged: 'an administrator marked the account as suspicious', ledger_mismatch: 'the $BLAT ledger does not add up to the balance' },
  not: 'a snapshot is a record only: it creates no token, wallet, price or transfer',
});

/** Dates an administrator may set (a typo like year 20027 is refused). */
export const DROP_DATE_BOUNDS = Object.freeze({ min: Date.UTC(2020, 0, 1), maxYearsAhead: 10 });

export class BlatDropRepo {
  constructor(
    private readonly sql: Sql,
    private readonly envDate: string | undefined,
  ) {}

  /** The announcement date and where it comes from. */
  async date(): Promise<AdminBlatDrop> {
    const [row] = await this.sql<Array<{ value: { announceAt: string | null }; updated_at: Date; username: string | null }>>`
      SELECT s.value, s.updated_at, a.username FROM app_settings s LEFT JOIN admin_users a ON a.id = s.updated_by WHERE s.key = ${DROP_KEY}`;
    if (row) return { announceAt: row.value?.announceAt ?? null, source: 'admin', updatedAt: row.updated_at.toISOString(), updatedBy: row.username };
    const env = this.envDate ? new Date(this.envDate) : null;
    return env && !Number.isNaN(env.getTime()) ? { announceAt: env.toISOString(), source: 'env', updatedAt: null, updatedBy: null } : { announceAt: null, source: null, updatedAt: null, updatedBy: null };
  }

  /** An administrator sets the date (null: «not set yet», even when the server variable has one). */
  async setDate(at: Date | null, adminId: string): Promise<AdminBlatDrop> {
    const value = { announceAt: at ? at.toISOString() : null };
    await this.sql`
      INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (${DROP_KEY}, ${this.sql.json(value)}, now(), ${adminId})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`;
    return this.date();
  }

  /** Back to the server's variable (or «not set» without one). */
  async resetDate(): Promise<AdminBlatDrop> {
    await this.sql`DELETE FROM app_settings WHERE key = ${DROP_KEY}`;
    return this.date();
  }

  /** Freezes every $BLAT balance at this moment. */
  async takeSnapshot(adminId: string | null, note: string | null): Promise<AdminBlatSnapshot> {
    const id = randomUUID();
    await this.sql.begin('isolation level repeatable read', async (tx) => {
      const [t] = await tx<Array<{ at: Date }>>`SELECT now() AS at`;
      await tx`
        INSERT INTO blat_snapshots (id, taken_at, taken_by, note, accounts, eligible, total, eligible_total, rules)
        VALUES (${id}, ${t!.at}, ${adminId}, ${note}, 0, 0, 0, 0, ${tx.json(SNAPSHOT_RULES)})`;
      await tx`
        INSERT INTO blat_snapshot_rows (snapshot_id, user_id, display_name, balance, earned, from_levels, from_referrals, from_grants, ledger_sum, flag, eligible, reasons)
        SELECT ${id}, u.id, u.display_name, p.blat, p.blat_earned,
               COALESCE(l.lv, 0), COALESCE(l.rf, 0), COALESCE(l.gr, 0), COALESCE(l.total, 0), u.blat_flag,
               (u.blat_flag IS NULL AND COALESCE(l.total, 0) = p.blat),
               array_remove(ARRAY[CASE WHEN u.blat_flag IS NOT NULL THEN 'flagged' END, CASE WHEN COALESCE(l.total, 0) <> p.blat THEN 'ledger_mismatch' END], NULL)
        FROM profiles p
        JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
        LEFT JOIN (
          SELECT user_id, sum(delta) AS total,
                 sum(delta) FILTER (WHERE reason = 'level') AS lv,
                 sum(delta) FILTER (WHERE reason = 'referral') AS rf,
                 sum(delta) FILTER (WHERE reason = 'grant') AS gr
          FROM currency_ledger WHERE currency = 'blat' GROUP BY user_id
        ) l ON l.user_id = u.id
        WHERE p.blat > 0`;
      await tx`
        UPDATE blat_snapshots s SET
          accounts = r.accounts, eligible = r.eligible, total = r.total, eligible_total = r.eligible_total
        FROM (
          SELECT count(*)::int AS accounts, count(*) FILTER (WHERE eligible)::int AS eligible,
                 COALESCE(sum(balance), 0) AS total, COALESCE(sum(balance) FILTER (WHERE eligible), 0) AS eligible_total
          FROM blat_snapshot_rows WHERE snapshot_id = ${id}
        ) r
        WHERE s.id = ${id}`;
    });
    const [s] = await this.list(1, id);
    return s!;
  }

  /** The latest snapshots (or one). */
  async list(limit = 50, only: string | null = null): Promise<AdminBlatSnapshot[]> {
    const rows = await this.sql<Array<{ id: string; taken_at: Date; username: string | null; note: string | null; accounts: number; eligible: number; total: string; eligible_total: string; still: number }>>`
      SELECT s.id, s.taken_at, a.username, s.note, s.accounts, s.eligible, s.total::text AS total, s.eligible_total::text AS eligible_total,
             (SELECT count(*)::int FROM blat_snapshot_rows r WHERE r.snapshot_id = s.id) AS still
      FROM blat_snapshots s LEFT JOIN admin_users a ON a.id = s.taken_by
      WHERE ${only === null ? this.sql`TRUE` : this.sql`s.id = ${only}`}
      ORDER BY s.taken_at DESC LIMIT ${limit}`;
    return rows.map((r) => ({ id: r.id, takenAt: r.taken_at.toISOString(), takenBy: r.username, note: r.note, accounts: r.accounts, eligible: r.eligible, total: Number(r.total), eligibleTotal: Number(r.eligible_total), rowsNow: r.still }));
  }

  /** A snapshot with its rows (largest balances first), or null. */
  async rows(id: string): Promise<{ snapshot: AdminBlatSnapshot; rules: unknown; rows: AdminBlatSnapshotRow[] } | null> {
    const [s] = await this.list(1, id);
    if (!s) return null;
    const [r] = await this.sql<Array<{ rules: unknown }>>`SELECT rules FROM blat_snapshots WHERE id = ${id}`;
    const rows = await this.sql<Array<{ user_id: string; display_name: string; balance: number; earned: number; from_levels: string; from_referrals: string; from_grants: string; ledger_sum: string; flag: string | null; eligible: boolean; reasons: string[] }>>`
      SELECT user_id, display_name, balance, earned, from_levels::text, from_referrals::text, from_grants::text, ledger_sum::text, flag, eligible, reasons
      FROM blat_snapshot_rows WHERE snapshot_id = ${id} ORDER BY balance DESC, user_id`;
    return {
      snapshot: s,
      rules: r?.rules ?? null,
      rows: rows.map((x) => ({ userId: x.user_id, name: x.display_name, balance: x.balance, earned: x.earned, fromLevels: Number(x.from_levels), fromReferrals: Number(x.from_referrals), fromGrants: Number(x.from_grants), ledgerSum: Number(x.ledger_sum), eligible: x.eligible, reasons: x.reasons, flag: x.flag })),
    };
  }

  async remove(id: string): Promise<boolean> {
    return (await this.sql`DELETE FROM blat_snapshots WHERE id = ${id} RETURNING id`).length > 0;
  }
}
