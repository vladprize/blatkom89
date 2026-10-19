import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startTestApp, api, cookieFrom, testDb } from './testkit.js';
import type { TestApp, TestDb } from './testkit.js';
import { csvCell, toCsv } from './csv.js';
import { ADMIN_COOKIE } from './auth.js';
import { overview, charts, resolveRange, listPlayers, errorGroups } from '../analytics/metrics.js';
import { bootstrapAdmin } from './bootstrap.js';
import { pgContext } from '../services/persistence.js';
import { silentLogger } from '../logging/logger.js';
import { testEnv } from './testkit.js';

test('csv: formula injection is neutralized and cells are quoted', () => {
  assert.equal(csvCell('=SUM(A1:A3)'), "'=SUM(A1:A3)");
  assert.equal(csvCell('+79991234567'), "'+79991234567");
  assert.equal(csvCell('-2+3'), "'-2+3");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell('\tx'), `"'\tx"`);
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvCell(-5), '-5');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(new Date('2026-01-02T03:04:05.000Z')), '2026-01-02T03:04:05.000Z');
  const out = toCsv(['a', 'b'], [['=1', 2]]);
  assert.ok(out.startsWith('\uFEFFa,b\r\n'));
  assert.ok(out.includes("'=1,2\r\n"));
});

describe('admin http', () => {
  let app: TestApp;
  let cookie: string;
  let csrf: string;
  before(async () => {
    app = await startTestApp({ ADMIN_BOOTSTRAP_USERNAME: 'root', ADMIN_BOOTSTRAP_PASSWORD: 'correct-horse-battery-staple' });
  });
  after(async () => {
    await app.close();
  });

  test('unauthenticated requests are refused', async () => {
    assert.equal((await api(app.base, '/api/admin/overview')).status, 401);
    assert.equal((await api(app.base, '/api/admin/players')).status, 401);
    assert.equal((await api(app.base, '/api/admin/export/players.csv')).status, 401);
    assert.equal((await api(app.base, '/api/admin/overview', { cookie: `${ADMIN_COOKIE}=forged-token-value-0000000000` })).status, 401);
  });

  test('bootstrap admin can log in; wrong passwords are audited; foreign origins are refused', async () => {
    const bad = await api(app.base, '/api/admin/login', { method: 'POST', body: { username: 'root', password: 'nope-nope-nope' } });
    assert.equal(bad.status, 401);
    const [f] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM admin_audit_log WHERE action = 'login_failed'`;
    assert.equal(f!.n, 1);
    const evil = await api(app.base, '/api/admin/login', { method: 'POST', body: { username: 'root', password: 'correct-horse-battery-staple' }, headers: { origin: 'https://evil.example' } });
    assert.equal(evil.status, 403);
    const ok = await api(app.base, '/api/admin/login', { method: 'POST', body: { username: 'root', password: 'correct-horse-battery-staple' } });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.body.role, 'admin');
    const setCookie = ok.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.match(setCookie, /Path=\/api\/admin/);
    cookie = cookieFrom(ok.headers, ADMIN_COOKIE)!;
    csrf = ok.body.csrfToken;
    const me = await api(app.base, '/api/admin/me', { cookie });
    assert.equal(me.status, 200);
    assert.equal(me.body.csrfToken, csrf);
  });

  test('state-changing requests need the CSRF token; roles are enforced server-side', async () => {
    const noCsrf = await api(app.base, '/api/admin/users', { method: 'POST', cookie, body: { username: 'olga', password: 'viewer-password-123', role: 'viewer' } });
    assert.equal(noCsrf.status, 403);
    assert.equal(noCsrf.body.error.code, 'csrf');
    const wrongCsrf = await api(app.base, '/api/admin/users', { method: 'POST', cookie, csrf: 'x'.repeat(43), body: { username: 'olga', password: 'viewer-password-123', role: 'viewer' } });
    assert.equal(wrongCsrf.status, 403);
    const weak = await api(app.base, '/api/admin/users', { method: 'POST', cookie, csrf, body: { username: 'weak', password: 'short', role: 'viewer' } });
    assert.equal(weak.status, 400);
    const created = await api(app.base, '/api/admin/users', { method: 'POST', cookie, csrf, body: { username: 'olga', password: 'viewer-password-123', role: 'viewer' } });
    assert.equal(created.status, 201, created.text);
    const vlogin = await api(app.base, '/api/admin/login', { method: 'POST', body: { username: 'olga', password: 'viewer-password-123' } });
    assert.equal(vlogin.status, 200);
    const vcookie = cookieFrom(vlogin.headers, ADMIN_COOKIE)!;
    assert.equal((await api(app.base, '/api/admin/overview?range=7d', { cookie: vcookie })).status, 200);
    assert.equal((await api(app.base, '/api/admin/charts?range=30d', { cookie: vcookie })).status, 200);
    assert.equal((await api(app.base, '/api/admin/export/players.csv', { cookie: vcookie })).status, 403);
    assert.equal((await api(app.base, '/api/admin/audit', { cookie: vcookie })).status, 403);
    const vpost = await api(app.base, '/api/admin/users', { method: 'POST', cookie: vcookie, csrf: vlogin.body.csrfToken, body: { username: 'evil', password: 'viewer-password-123', role: 'admin' } });
    assert.equal(vpost.status, 403);
    // logout invalidates the viewer session
    assert.equal((await api(app.base, '/api/admin/logout', { method: 'POST', cookie: vcookie, csrf: vlogin.body.csrfToken })).status, 200);
    assert.equal((await api(app.base, '/api/admin/me', { cookie: vcookie })).status, 401);
  });

  test('exports are escaped, audited and admin-only; bad ranges are rejected', async () => {
    await app.db.sql`INSERT INTO users (dev_device_id, display_name) VALUES ('dev-csv-1', '=HYPERLINK("http://x","y")')`;
    const r = await api(app.base, '/api/admin/export/players.csv', { cookie });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /text\/csv/);
    assert.ok(r.text.startsWith('id,display_name'), 'header row (fetch strips the BOM when decoding)');
    const raw = new Uint8Array(await (await fetch(app.base + '/api/admin/export/players.csv', { headers: { cookie } })).arrayBuffer());
    assert.deepEqual([...raw.slice(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM for spreadsheet apps');
    assert.ok(r.text.includes(`"'=HYPERLINK(""http://x"",""y"")"`));
    const m = await api(app.base, '/api/admin/export/matches.csv?range=30d', { cookie });
    assert.equal(m.status, 200);
    const d = await api(app.base, '/api/admin/export/daily.csv?range=custom&from=2026-01-01&to=2026-01-03', { cookie });
    assert.equal(d.status, 200);
    assert.equal(d.text.trim().split('\r\n').length, 4);
    const [a] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM admin_audit_log WHERE action LIKE 'export_%'`;
    assert.equal(a!.n, 4, 'every export (2× players, matches, daily) is audited');
    assert.equal((await api(app.base, '/api/admin/overview?range=custom&from=2026-02-10&to=2026-01-01', { cookie })).status, 400);
    assert.equal((await api(app.base, '/api/admin/overview?range=1y', { cookie })).status, 400);
  });

  test('players: search, sort, pagination and detail', async () => {
    const ids: string[] = [];
    for (const [i, name] of ['Петя Тестовый', 'Валюта', 'Участковый', 'Михалыч', 'Петя Второй', 'Гость_312'].entries()) {
      const [row] = await app.db.sql<Array<{ id: string }>>`INSERT INTO users (telegram_id, display_name, created_at) VALUES (${String(900000 + i)}::bigint, ${name}, now() - ${`${i} hours`}::interval) RETURNING id`;
      await app.db.sql`INSERT INTO profiles (user_id, xp, matches_played, wins, kills) VALUES (${row!.id}, ${i * 100}, ${i}, ${i}, ${i * 3})`;
      ids.push(row!.id);
    }
    const q = await api(app.base, `/api/admin/players?q=${encodeURIComponent('петя')}`, { cookie });
    assert.equal(q.status, 200);
    assert.equal(q.body.total, 2);
    const tg = await api(app.base, '/api/admin/players?q=900003', { cookie });
    assert.equal(tg.body.rows.length, 1);
    assert.equal(tg.body.rows[0].displayName, 'Михалыч');
    const byId = await api(app.base, `/api/admin/players?q=${ids[2]}`, { cookie });
    assert.equal(byId.body.rows[0].id, ids[2]);
    const sorted = await api(app.base, '/api/admin/players?sort=kills&dir=desc&pageSize=5&page=1', { cookie });
    assert.equal(sorted.body.rows.length, 5);
    assert.equal(sorted.body.rows[0].displayName, 'Гость_312');
    const page2 = await api(app.base, '/api/admin/players?sort=kills&dir=desc&pageSize=5&page=2', { cookie });
    assert.ok(page2.body.rows.length >= 1);
    assert.equal(page2.body.total, sorted.body.total);
    const inj = await api(app.base, `/api/admin/players?sort=${encodeURIComponent('kills; DROP TABLE users')}`, { cookie });
    assert.equal(inj.status, 200);
    assert.equal(inj.body.sort, 'created');
    const det = await api(app.base, `/api/admin/players/${ids[3]}`, { cookie });
    assert.equal(det.status, 200);
    assert.equal(det.body.player.displayName, 'Михалыч');
    assert.equal(det.body.achievements.length, 6);
    const [viewed] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM admin_audit_log WHERE action = 'player_viewed' AND target = ${ids[3]!}`;
    assert.equal(viewed!.n, 1, 'opening a player record is audited');
    assert.equal((await api(app.base, '/api/admin/players/not-a-uuid', { cookie })).status, 400);
    assert.equal((await api(app.base, `/api/admin/players/${randomUUID()}`, { cookie })).status, 404);
  });

  test('bootstrap is skipped once an admin exists', async () => {
    const ctx = pgContext(app.db.sql, app.env, silentLogger);
    assert.equal(await bootstrapAdmin(app.db.sql, ctx.adminAuth, silentLogger, 'second', 'another-long-password'), 'skipped');
  });
});

describe('metrics (deterministic clock)', () => {
  let db: TestDb;
  const NOW = new Date('2026-03-20T12:00:00.000Z');
  const users: Record<string, string> = {};
  before(async () => {
    db = await testDb();
    const mk = async (key: string, created: string) => {
      const [r] = await db.sql<Array<{ id: string }>>`INSERT INTO users (dev_device_id, display_name, created_at, last_seen_at) VALUES (${'dev-' + key}, ${key}, ${new Date(created)}, ${new Date(created)}) RETURNING id`;
      users[key] = r!.id;
      await db.sql`INSERT INTO profiles (user_id) VALUES (${r!.id})`;
      await db.sql`INSERT INTO user_daily_activity (user_id, day) VALUES (${r!.id}, ${created.slice(0, 10)}::date)`;
    };
    for (const u of ['u1', 'u2', 'u3', 'u4']) await mk(u, '2026-03-01T10:00:00Z');
    for (const u of ['u5', 'u6']) await mk(u, '2026-03-18T09:00:00Z');
    const act = async (u: string, day: string) => db.sql`INSERT INTO user_daily_activity (user_id, day) VALUES (${users[u]!}, ${day}::date)`;
    await act('u1', '2026-03-02');
    await act('u2', '2026-03-02');
    await act('u2', '2026-03-08');
    await act('u3', '2026-03-08');
    await act('u5', '2026-03-19');
    const m1 = randomUUID();
    await db.sql`INSERT INTO matches (id, room_id, map_id, status, started_at, ended_at, duration_ms, player_count, results_processed_at) VALUES (${m1}, 'r1', 'factory', 'completed', ${new Date('2026-03-01T11:00:00Z')}, ${new Date('2026-03-01T11:04:00Z')}, 240000, 2, now())`;
    await db.sql`INSERT INTO match_participants (match_id, user_id, character, completed, place) VALUES (${m1}, ${users.u1!}, 'petya', true, 1), (${m1}, ${users.u2!}, 'valuta', true, 2)`;
    const m2 = randomUUID();
    await db.sql`INSERT INTO matches (id, room_id, map_id, status, started_at, player_count) VALUES (${m2}, 'r2', 'yard', 'abandoned', ${new Date('2026-03-18T10:00:00Z')}, 2)`;
    await db.sql`INSERT INTO match_participants (match_id, user_id, character, completed) VALUES (${m2}, ${users.u5!}, 'mihalych', true)`;
    for (const n of [1001, 2002, 3003]) {
      await db.sql`INSERT INTO app_errors (occurred_at, source, component, category, message, fingerprint) VALUES (${new Date('2026-03-05T08:00:00Z')}, 'client', 'net', 'ws', ${'timeout after ' + n + ' ms'}, 'fp-timeout')`;
    }
    for (const ms of [60000, 180000]) {
      await db.sql`INSERT INTO analytics_events (id, name, source, user_id, occurred_at, props) VALUES (${randomUUID()}, 'session_ended', 'client', ${users.u1!}, ${new Date('2026-03-01T12:00:00Z')}, ${db.sql.json({ durationMs: ms })})`;
    }
    await db.sql`INSERT INTO sessions (user_id, token_hash, method, platform, expires_at, created_at) VALUES (${users.u1!}, ${Buffer.from('a'.repeat(32))}, 'dev', 'telegram_ios', now() + interval '1 day', ${new Date('2026-03-01T10:00:00Z')})`;
  });
  after(async () => {
    await db.drop();
  });

  test('D1/D7 are cohort-based, pooled and null until matured', async () => {
    const all = await overview(db.sql, resolveRange('custom', '2026-03-01', '2026-03-18', NOW), 3, NOW);
    assert.equal(all.newPlayers, 6);
    assert.equal(all.d1CohortSize, 6);
    assert.equal(all.d1Retention, 3 / 6);
    assert.equal(all.d7CohortSize, 4);
    assert.equal(all.d7Retention, 2 / 4);
    assert.ok(Math.abs((all.firstMatchConversion ?? 0) - 3 / 6) < 1e-9, 'u1, u2 completed a match; u5 completed (abandoned match participation counts as completed flag)');
    const late = await overview(db.sql, resolveRange('custom', '2026-03-18', '2026-03-18', NOW), 0, NOW);
    assert.equal(late.d1Retention, 1 / 2);
    assert.equal(late.d7Retention, null);
    assert.equal(late.d7CohortSize, 0);
  });

  test('DAU/WAU/MAU, matches, durations, errors and active rooms', async () => {
    const o = await overview(db.sql, resolveRange('custom', '2026-03-01', '2026-03-18', NOW), 3, NOW);
    assert.equal(o.dau, 2); // u5, u6 on 2026-03-18
    assert.equal(o.wau, 2); // 03-12..03-18
    assert.equal(o.mau, 6); // 02-17..03-18
    assert.equal(o.matchesStarted, 2);
    assert.equal(o.matchesCompleted, 1);
    assert.equal(o.avgMatchDurationMs, 240000);
    assert.equal(o.avgSessionDurationMs, 120000);
    assert.equal(o.errorCount, 3);
    assert.equal(o.activeRooms, 3);
    assert.equal(o.totalPlayers, 6);
  });

  test('date filtering and empty datasets never fabricate values', async () => {
    const empty = await overview(db.sql, resolveRange('custom', '2020-01-01', '2020-01-07', NOW), 0, NOW);
    assert.equal(empty.newPlayers, 0);
    assert.equal(empty.totalPlayers, 0);
    assert.equal(empty.matchesStarted, 0);
    assert.equal(empty.d1Retention, null);
    assert.equal(empty.d7Retention, null);
    assert.equal(empty.firstMatchConversion, null);
    assert.equal(empty.avgMatchDurationMs, null);
    assert.equal(empty.avgSessionDurationMs, null);
    const c = await charts(db.sql, resolveRange('custom', '2026-03-01', '2026-03-03', NOW), NOW);
    assert.deepEqual(c.registrations.map((x) => x.count), [4, 0, 0]);
    assert.deepEqual(c.dau.map((x) => x.count), [4, 2, 0]);
    assert.deepEqual(c.matches[0], { day: '2026-03-01', started: 1, completed: 1 });
    assert.deepEqual(c.retention[0], { day: '2026-03-01', cohort: 4, d1: 0.5, d7: 0.5 });
    assert.equal(c.retention[1]!.d1, null, 'empty cohort day → null');
    assert.deepEqual(c.maps, [{ key: 'factory', count: 1 }]);
    assert.deepEqual(c.modes, [{ key: 'ffa', count: 1 }]);
    assert.deepEqual(c.characters.map((x) => x.key).sort(), ['petya', 'valuta']);
    assert.equal(c.sessionDuration.find((b) => b.bucket === '1–3 мин')!.count, 1);
    assert.equal(c.sessionDuration.find((b) => b.bucket === '3–5 мин')!.count, 1);
    assert.equal(c.matchDuration.find((b) => b.bucket === '4–5 мин')!.count, 1);
    assert.deepEqual(c.platforms, [{ key: 'telegram_ios', count: 1 }]);
    const emptyCharts = await charts(db.sql, resolveRange('custom', '2020-01-01', '2020-01-02', NOW), NOW);
    assert.deepEqual(emptyCharts.registrations.map((x) => x.count), [0, 0]);
    assert.ok(emptyCharts.retention.every((r) => r.d1 === null && r.d7 === null));
    assert.deepEqual(emptyCharts.maps, []);
    assert.deepEqual(emptyCharts.modes, []);
  });

  test('errors are grouped by fingerprint; player list works without filters', async () => {
    const g = await errorGroups(db.sql, resolveRange('custom', '2026-03-01', '2026-03-18', NOW));
    assert.equal(g.length, 1);
    assert.equal(g[0]!.count, 3);
    assert.equal(g[0]!.component, 'net');
    const page = await listPlayers(db.sql, {});
    assert.equal(page.total, 6);
    assert.equal(testEnv().NODE_ENV, 'test');
  });
});
