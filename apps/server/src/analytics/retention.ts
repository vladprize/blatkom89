/**
 * Data retention (docs/PRIVACY.md §4): periodically deletes records whose retention period has
 * passed. Deletes run in bounded batches (ctid + LIMIT) so a large backlog never holds long locks,
 * and are idempotent, so running the job on several server instances at once is harmless.
 */
import type { Sql } from '../database/db.js';
import type { Logger } from '../logging/logger.js';

/** Retention periods in days. Changing them only requires a deploy; document changes in PRIVACY.md. */
export const RETENTION_DAYS = {
  /** analytics_events, by occurred_at (≈13 months: year-over-year comparisons). */
  analyticsEvents: 400,
  /** user_daily_activity (DAU/WAU/MAU/retention index), by day. */
  dailyActivity: 400,
  /** app_errors, by occurred_at. */
  appErrors: 90,
  /** Player sessions, counted from expiry or revocation (keeps every session created in the last 90 days). */
  sessions: 90,
  /** Admin sessions (store IP and user agent), counted from expiry or revocation. */
  adminSessions: 90,
  /** Invitations, counted from expiry. */
  invitations: 7,
  /** Admin audit log, by created_at. */
  adminAudit: 365,
  /** Password-reset links (valid for an hour), counted from expiry. */
  passwordResets: 7,
  /** Anonymous visitor funnel: visitor_days by day, visitors by their last visit. */
  visitors: 400,
  /** Direct messages between friends, by created_at. */
  directMessages: 180,
} as const;

export type RetentionDays = { [K in keyof typeof RETENTION_DAYS]: number };
export type PurgeResult = { [K in keyof typeof RETENTION_DAYS]: number };

const BATCH = 5000;
const DAY_MS = 86_400_000;

async function batched(run: () => Promise<number>): Promise<number> {
  let total = 0;
  for (let i = 0; i < 10_000; i++) {
    const n = await run();
    total += n;
    if (n < BATCH) break;
  }
  return total;
}

/** Deletes everything older than its retention period relative to `now`. Returns deleted row counts. */
export async function purgeExpired(sql: Sql, now = new Date(), days: RetentionDays = RETENTION_DAYS): Promise<PurgeResult> {
  const cutoff = (d: number) => new Date(now.getTime() - d * DAY_MS);
  const events = cutoff(days.analyticsEvents);
  const activityDay = cutoff(days.dailyActivity).toISOString().slice(0, 10);
  const errors = cutoff(days.appErrors);
  const sessions = cutoff(days.sessions);
  const adminSessions = cutoff(days.adminSessions);
  const invitations = cutoff(days.invitations);
  const audit = cutoff(days.adminAudit);
  const resets = cutoff(days.passwordResets);
  const visitorDay = cutoff(days.visitors).toISOString().slice(0, 10);
  const visitors = cutoff(days.visitors);
  const messages = cutoff(days.directMessages);
  return {
    analyticsEvents: await batched(
      async () => (await sql`DELETE FROM analytics_events WHERE ctid IN (SELECT ctid FROM analytics_events WHERE occurred_at < ${events} LIMIT ${BATCH})`).count,
    ),
    dailyActivity: await batched(
      async () => (await sql`DELETE FROM user_daily_activity WHERE ctid IN (SELECT ctid FROM user_daily_activity WHERE day < ${activityDay}::date LIMIT ${BATCH})`).count,
    ),
    appErrors: await batched(async () => (await sql`DELETE FROM app_errors WHERE ctid IN (SELECT ctid FROM app_errors WHERE occurred_at < ${errors} LIMIT ${BATCH})`).count),
    sessions: await batched(
      async () =>
        (await sql`DELETE FROM sessions WHERE ctid IN (
          SELECT ctid FROM sessions WHERE expires_at < ${sessions} OR revoked_at < ${sessions} LIMIT ${BATCH})`).count,
    ),
    adminSessions: await batched(
      async () =>
        (await sql`DELETE FROM admin_sessions WHERE ctid IN (
          SELECT ctid FROM admin_sessions WHERE expires_at < ${adminSessions} OR revoked_at < ${adminSessions} LIMIT ${BATCH})`).count,
    ),
    invitations: await batched(async () => (await sql`DELETE FROM invitations WHERE ctid IN (SELECT ctid FROM invitations WHERE expires_at < ${invitations} LIMIT ${BATCH})`).count),
    adminAudit: await batched(async () => (await sql`DELETE FROM admin_audit_log WHERE ctid IN (SELECT ctid FROM admin_audit_log WHERE created_at < ${audit} LIMIT ${BATCH})`).count),
    passwordResets: await batched(async () => (await sql`DELETE FROM password_resets WHERE ctid IN (SELECT ctid FROM password_resets WHERE expires_at < ${resets} LIMIT ${BATCH})`).count),
    visitors: await batched(
      async () =>
        (await sql`DELETE FROM visitor_days WHERE ctid IN (SELECT ctid FROM visitor_days WHERE day < ${visitorDay}::date LIMIT ${BATCH})`).count +
        (await sql`DELETE FROM visitors WHERE ctid IN (SELECT ctid FROM visitors WHERE last_seen_at < ${visitors} LIMIT ${BATCH})`).count,
    ),
    directMessages: await batched(
      async () => (await sql`DELETE FROM direct_messages WHERE ctid IN (SELECT ctid FROM direct_messages WHERE created_at < ${messages} LIMIT ${BATCH})`).count,
    ),
  };
}

/**
 * Runs the purge shortly after start-up and then once a day. Timers are unref'd so they never keep
 * the process alive; failures are logged and retried on the next tick. Returns a stop function.
 */
export function scheduleRetention(sql: Sql, log: Logger, opts: { firstRunMs?: number; everyMs?: number } = {}): () => void {
  let stopped = false;
  let running = false;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const r = await purgeExpired(sql);
      const total = Object.values(r).reduce((a, b) => a + b, 0);
      if (total > 0) log.info('retention purge', r);
    } catch (e) {
      log.warn('retention purge failed', { err: (e as Error).message });
    } finally {
      running = false;
    }
  };
  const first = setTimeout(() => void run(), opts.firstRunMs ?? 5 * 60_000);
  const every = setInterval(() => void run(), opts.everyMs ?? DAY_MS);
  first.unref();
  every.unref();
  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(every);
  };
}
