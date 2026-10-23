import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDb } from '../admin/testkit.js';
import type { TestDb } from '../admin/testkit.js';
import { purgeExpired, RETENTION_DAYS } from './retention.js';

let db: TestDb;
before(async () => {
  db = await testDb();
});
after(async () => {
  await db.drop();
});

const NOW = new Date('2026-10-18T12:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const day = (d: number) => daysAgo(d).toISOString().slice(0, 10);

test('retention: purges only rows past their retention period and is idempotent', async () => {
  const { sql } = db;
  const [u] = await sql<Array<{ id: string }>>`INSERT INTO users (dev_device_id, display_name) VALUES ('retention-dev-1', 'Keeper') RETURNING id`;
  const userId = u!.id;

  // Player sessions: expired 200d ago (purge), revoked 120d ago (purge), expired 10d ago (keep), active (keep).
  const sess = async (expires: Date, revoked: Date | null) => {
    const [r] = await sql<Array<{ id: string }>>`
      INSERT INTO sessions (user_id, token_hash, method, platform, created_at, expires_at, revoked_at)
      VALUES (${userId}, ${Buffer.from(randomUUID())}, 'dev', 'browser_desktop', ${daysAgo(300)}, ${expires}, ${revoked})
      RETURNING id`;
    return r!.id;
  };
  const oldSession = await sess(daysAgo(200), null);
  await sess(daysAgo(-30), daysAgo(120));
  const recentExpired = await sess(daysAgo(10), null);
  await sess(daysAgo(-14), null);

  // Analytics events: one beyond retention (references the session that will be purged), one recent.
  const oldEvent = randomUUID();
  const newEvent = randomUUID();
  await sql`INSERT INTO analytics_events (id, name, source, user_id, session_id, occurred_at, props)
            VALUES (${oldEvent}, 'app_opened', 'client', ${userId}, ${oldSession}, ${daysAgo(RETENTION_DAYS.analyticsEvents + 1)}, '{}'::jsonb),
                   (${newEvent}, 'app_opened', 'client', ${userId}, ${recentExpired}, ${daysAgo(5)}, '{}'::jsonb)`;
  await sql`INSERT INTO user_daily_activity (user_id, day) VALUES (${userId}, ${day(RETENTION_DAYS.dailyActivity + 3)}::date), (${userId}, ${day(1)}::date)`;
  await sql`INSERT INTO app_errors (occurred_at, source, component, category, message, fingerprint)
            VALUES (${daysAgo(RETENTION_DAYS.appErrors + 1)}, 'server', 'http', 'x', 'old', 'f1'), (${daysAgo(2)}, 'server', 'http', 'x', 'new', 'f2')`;
  await sql`INSERT INTO invitations (code, room_id, created_by, created_at, expires_at)
            VALUES ('OLDCODE1', 'r1', ${userId}, ${daysAgo(30)}, ${daysAgo(29)}), ('NEWCODE1', 'r2', ${userId}, ${daysAgo(2)}, ${daysAgo(1)})`;
  const [a] = await sql<Array<{ id: string }>>`INSERT INTO admin_users (username, password_hash, role) VALUES ('ret.admin', 'x', 'admin') RETURNING id`;
  await sql`INSERT INTO admin_sessions (admin_id, token_hash, csrf_hash, expires_at, revoked_at, ip)
            VALUES (${a!.id}, ${Buffer.from('a1')}, ${Buffer.from('c1')}, ${daysAgo(100)}, NULL, '203.0.113.1'),
                   (${a!.id}, ${Buffer.from('a2')}, ${Buffer.from('c2')}, ${daysAgo(-1)}, NULL, '203.0.113.2')`;
  await sql`INSERT INTO admin_audit_log (admin_id, action, created_at) VALUES (${a!.id}, 'old', ${daysAgo(400)}), (${a!.id}, 'new', ${daysAgo(3)})`;
  // Password-reset links: expired 10 days ago (purge), expired yesterday (keep for the grace period).
  await sql`INSERT INTO password_resets (token_hash, user_id, created_at, expires_at, created_by)
            VALUES (${Buffer.from('r1')}, ${userId}, ${daysAgo(10)}, ${daysAgo(10)}, 'email'), (${Buffer.from('r2')}, ${userId}, ${daysAgo(1)}, ${daysAgo(1)}, 'admin')`;
  // Visitor funnel: a visitor last seen beyond retention (purged with its days), and a recent one with one old day.
  await sql`INSERT INTO visitors (visitor_id, first_seen_at, last_seen_at) VALUES ('old-visitor-000000', ${daysAgo(500)}, ${daysAgo(RETENTION_DAYS.visitors + 1)}), ('new-visitor-000000', ${daysAgo(500)}, ${daysAgo(2)})`;
  await sql`INSERT INTO visitor_days (visitor_id, day) VALUES ('old-visitor-000000', ${day(RETENTION_DAYS.visitors + 1)}::date), ('new-visitor-000000', ${day(RETENTION_DAYS.visitors + 5)}::date), ('new-visitor-000000', ${day(2)}::date)`;

  // Direct messages: one beyond retention, one recent.
  const [friend] = await sql<Array<{ id: string }>>`INSERT INTO users (dev_device_id, display_name) VALUES ('retention-dev-2', 'Pen Pal') RETURNING id`;
  await sql`INSERT INTO direct_messages (sender_id, recipient_id, body, created_at)
            VALUES (${userId}, ${friend!.id}, 'old', ${daysAgo(RETENTION_DAYS.directMessages + 1)}), (${friend!.id}, ${userId}, 'new', ${daysAgo(3)})`;

  // One-time provider sign-in codes: one left over from two days ago (purge), one from a minute ago (keep).
  await sql`INSERT INTO auth_handoffs (code_hash, user_id, provider, created_at)
            VALUES ('old-handoff', ${userId}, 'google', ${daysAgo(2)}), ('new-handoff', ${userId}, 'discord', ${new Date(NOW.getTime() - 60_000)})`;

  // Telegram link codes (V2.0 part E): one that ran out two days ago (purge), one still running (keep).
  await sql`INSERT INTO telegram_link_codes (code_hash, user_id, created_at, expires_at)
            VALUES ('old-telegram-link-code', ${userId}, ${daysAgo(2)}, ${daysAgo(2)}), ('new-telegram-link-code', ${userId}, ${NOW}, ${new Date(NOW.getTime() + 600_000)})`;

  const r = await purgeExpired(sql, NOW);
  assert.deepEqual(r, { analyticsEvents: 1, dailyActivity: 1, appErrors: 1, sessions: 2, adminSessions: 1, invitations: 1, adminAudit: 1, passwordResets: 1, visitors: 3, directMessages: 1, authHandoffs: 1, telegramLinkCodes: 1 });
  assert.deepEqual((await sql<Array<{ code_hash: string }>>`SELECT code_hash FROM telegram_link_codes`).map((x) => x.code_hash), ['new-telegram-link-code']);
  assert.deepEqual((await sql<Array<{ code_hash: string }>>`SELECT code_hash FROM auth_handoffs`).map((x) => x.code_hash), ['new-handoff']);
  const dms = await sql<Array<{ body: string }>>`SELECT body FROM direct_messages`;
  assert.deepEqual(dms.map((m) => m.body), ['new']);

  const ids = await sql<Array<{ id: string }>>`SELECT id FROM analytics_events`;
  assert.deepEqual(ids.map((x) => x.id), [newEvent]);
  const [left] = await sql<Array<{ s: number; d: number; e: string; i: string; as: number; au: string }>>`
    SELECT (SELECT count(*) FROM sessions)::int AS s,
           (SELECT count(*) FROM user_daily_activity)::int AS d,
           (SELECT string_agg(message, ',') FROM app_errors) AS e,
           (SELECT string_agg(code, ',') FROM invitations) AS i,
           (SELECT count(*) FROM admin_sessions)::int AS as,
           (SELECT string_agg(action, ',') FROM admin_audit_log) AS au`;
  assert.deepEqual(left, { s: 2, d: 1, e: 'new', i: 'NEWCODE1', as: 1, au: 'new' });
  const [fun] = await sql<Array<{ v: string; vd: number; pr: number }>>`
    SELECT (SELECT string_agg(visitor_id, ',') FROM visitors) AS v, (SELECT count(*) FROM visitor_days)::int AS vd, (SELECT count(*) FROM password_resets)::int AS pr`;
  assert.deepEqual(fun, { v: 'new-visitor-000000', vd: 1, pr: 1 });
  // The user, profile-level data and recent events are untouched.
  const [usr] = await sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM users WHERE id = ${userId}`;
  assert.equal(usr!.n, 1);

  const again = await purgeExpired(sql, NOW);
  assert.deepEqual(again, { analyticsEvents: 0, dailyActivity: 0, appErrors: 0, sessions: 0, adminSessions: 0, invitations: 0, adminAudit: 0, passwordResets: 0, visitors: 0, directMessages: 0, authHandoffs: 0, telegramLinkCodes: 0 });
});

test('retention: large backlogs are deleted in batches', async () => {
  const { sql } = db;
  await sql`INSERT INTO app_errors (occurred_at, source, component, category, message, fingerprint)
            SELECT ${daysAgo(200)}, 'client', 'game', 'x', 'bulk', 'bulk' FROM generate_series(1, 12001)`;
  const r = await purgeExpired(sql, NOW);
  assert.equal(r.appErrors, 12001);
  const [c] = await sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM app_errors WHERE fingerprint = 'bulk'`;
  assert.equal(c!.n, 0);
});
