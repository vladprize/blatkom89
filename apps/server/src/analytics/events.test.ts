import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startTestApp, api, devLogin } from '../admin/testkit.js';
import type { TestApp } from '../admin/testkit.js';
import { PgAnalytics } from './writer.js';
import { sanitizeMessage, errorFingerprint } from './sanitize.js';
import { silentLogger } from '../logging/logger.js';

let app: TestApp;
let token: string;
let userId: string;
before(async () => {
  app = await startTestApp();
  const s = await devLogin(app.base, 'Аналитик');
  token = s.token;
  userId = s.userId;
});
after(async () => {
  await app.close();
});

const ev = (name: string, props: Record<string, unknown>, ts = Date.now()) => ({ id: randomUUID(), name, ts, props });

test('events: authentication is required', async () => {
  const r = await api(app.base, '/api/events', { method: 'POST', body: { events: [ev('app_opened', { platform: 'browser_desktop' })] } });
  assert.equal(r.status, 401);
});

test('events: valid events are stored once (dedupe by id across requests and inside a batch)', async () => {
  const a = ev('app_opened', { platform: 'telegram_ios', startParam: 'abc' });
  const b = ev('character_selected', { character: 'mihalych' });
  const r1 = await api(app.base, '/api/events', { method: 'POST', token, body: { events: [a, b, a] } });
  assert.equal(r1.status, 200, r1.text);
  assert.deepEqual(r1.body, { accepted: 2, duplicates: 1, rejected: 0 });
  const r2 = await api(app.base, '/api/events', { method: 'POST', token, body: { events: [a, b] } });
  assert.deepEqual(r2.body, { accepted: 0, duplicates: 2, rejected: 0 });
  const [c] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM analytics_events WHERE id IN ${app.db.sql([a.id, b.id])}`;
  assert.equal(c!.n, 2);
  const [row] = await app.db.sql<Array<{ user_id: string; source: string; props: { character: string } }>>`SELECT user_id, source, props FROM analytics_events WHERE id = ${b.id}`;
  assert.equal(row!.user_id, userId);
  assert.equal(row!.source, 'client');
  assert.equal(row!.props.character, 'mihalych');
});

test('events: invalid props are rejected, unknown or server-only names fail validation', async () => {
  const r = await api(app.base, '/api/events', { method: 'POST', token, body: { events: [ev('character_selected', { character: 'moon' }), ev('tutorial_completed', {})] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { accepted: 1, duplicates: 0, rejected: 1 });
  const serverOnly = await api(app.base, '/api/events', { method: 'POST', token, body: { events: [ev('match_completed', { matchId: 'x' })] } });
  assert.equal(serverOnly.status, 400);
  const extra = await api(app.base, '/api/events', { method: 'POST', token, body: { events: [ev('session_ended', { durationMs: 1000, evil: 1 })] } });
  assert.deepEqual(extra.body, { accepted: 0, duplicates: 0, rejected: 1 });
  const empty = await api(app.base, '/api/events', { method: 'POST', token, body: { events: [] } });
  assert.equal(empty.status, 400);
});

test('events: client timestamps are clamped to ±24h of server time', async () => {
  const far = ev('session_ended', { durationMs: 120_000 }, Date.now() + 30 * 86_400_000);
  await api(app.base, '/api/events', { method: 'POST', token, body: { events: [far] } });
  const [row] = await app.db.sql<Array<{ occurred_at: Date }>>`SELECT occurred_at FROM analytics_events WHERE id = ${far.id}`;
  assert.ok(row!.occurred_at.getTime() <= Date.now() + 24 * 3600_000 + 5000);
});

test('events: client_error is sanitized and recorded as a technical error', async () => {
  const e = ev('client_error', { component: 'GameScene', category: 'webgl', message: 'context lost for petya@example.com token=abcdefghijklmnopqrstuvwxyz123456 id 12345678', clientVersion: '0.1.0' });
  const r = await api(app.base, '/api/events', { method: 'POST', token, body: { events: [e] } });
  assert.equal(r.body.accepted, 1);
  const rows = await app.db.sql<Array<{ message: string; component: string; client_version: string; fingerprint: string; user_id: string }>>`SELECT message, component, client_version, fingerprint, user_id FROM app_errors WHERE source = 'client'`;
  assert.equal(rows.length, 1);
  assert.ok(!rows[0]!.message.includes('example.com'));
  assert.ok(!rows[0]!.message.includes('abcdefghijklmnop'));
  assert.ok(!rows[0]!.message.includes('12345678'));
  assert.equal(rows[0]!.component, 'GameScene');
  assert.equal(rows[0]!.client_version, '0.1.0');
  assert.equal(rows[0]!.user_id, userId);
  // duplicate event → no duplicate error row
  await api(app.base, '/api/events', { method: 'POST', token, body: { events: [e] } });
  const [n] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM app_errors WHERE source = 'client'`;
  assert.equal(n!.n, 1);
});

test('analytics writer: server events and errors are batched, FK-safe and never throw', async () => {
  const w = new PgAnalytics(app.db.sql, silentLogger, '9.9.9', 60_000);
  w.server('match_started', { matchId: 'm1', roomId: 'r1', mapId: 'factory', players: 2, nested: { no: 1 } }, { userId, sessionId: null, platform: 'browser_desktop' });
  w.server('lobby_created', { roomId: 'r9', mapId: 'yard', isPrivate: true }, { userId: randomUUID() });
  w.server('lobby_left', { roomId: 'r9', phase: 'waiting' }, { userId: 'not-a-uuid' });
  w.error({ source: 'server', component: 'room', category: 'tick', message: 'boom at 1234567 Bearer abc.def' });
  await w.close();
  const rows = await app.db.sql<Array<{ name: string; user_id: string | null; props: Record<string, unknown> }>>`SELECT name, user_id, props FROM analytics_events WHERE source = 'server' AND name IN ('match_started', 'lobby_created', 'lobby_left') ORDER BY name`;
  assert.equal(rows.length, 3);
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(byName.match_started!.user_id, userId);
  assert.equal(byName.match_started!.props.nested, undefined, 'non-scalar props dropped');
  assert.equal(byName.lobby_created!.user_id, null, 'unknown user → NULL instead of FK failure');
  assert.equal(byName.lobby_left!.user_id, null);
  const [err] = await app.db.sql<Array<{ message: string; server_version: string }>>`SELECT message, server_version FROM app_errors WHERE source = 'server' AND component = 'room'`;
  assert.equal(err!.server_version, '9.9.9');
  assert.ok(!err!.message.includes('1234567'));
  assert.ok(!/abc\.def/.test(err!.message));
});

test('sanitize: fingerprints group the same error shape', () => {
  assert.equal(errorFingerprint('client', 'net', 'ws', sanitizeMessage('timeout after 1500 ms')), errorFingerprint('client', 'net', 'ws', sanitizeMessage('timeout after 3000 ms')));
  assert.notEqual(errorFingerprint('client', 'net', 'ws', 'a'), errorFingerprint('client', 'net', 'http', 'a'));
});
