import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, api, devLogin, TEST_BOT_TOKEN } from '../admin/testkit.js';
import type { TestApp } from '../admin/testkit.js';
import { signInitData } from './telegram.js';

let app: TestApp;
before(async () => {
  app = await startTestApp();
});
after(async () => {
  await app.close();
});

const tgUser = (id: number, first = 'Михалыч') => JSON.stringify({ id, first_name: first, language_code: 'ru', username: 'secret_username' });
const nowSec = () => Math.floor(Date.now() / 1000);

test('auth: valid Telegram initData creates a user and a session; repeat login reuses the profile', async () => {
  const init = signInitData({ user: tgUser(424242), auth_date: String(nowSec()), query_id: 'Q1' }, TEST_BOT_TOKEN);
  const r1 = await api(app.base, '/api/auth/telegram', { method: 'POST', body: { initData: init, platform: 'telegram_android', clientVersion: '0.1.0' } });
  assert.equal(r1.status, 200, r1.text);
  assert.equal(r1.body.isNew, true);
  assert.equal(r1.body.profile.displayName, 'Михалыч');
  assert.equal(r1.body.profile.telegramLinked, true);
  const me = await api(app.base, '/api/me', { token: r1.body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.id, r1.body.profile.id);
  const r2 = await api(app.base, '/api/auth/telegram', { method: 'POST', body: { initData: init } });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.isNew, false);
  assert.equal(r2.body.profile.id, r1.body.profile.id);
  // username is never stored
  const cols = await app.db.sql<Array<{ column_name: string }>>`SELECT column_name FROM information_schema.columns WHERE table_schema = ${app.db.schema} AND table_name = 'users'`;
  assert.equal(cols.some((c) => c.column_name.includes('username')), false);
  const [u] = await app.db.sql<Array<{ telegram_id: string; platform: string }>>`SELECT telegram_id::text, platform FROM users WHERE id = ${r1.body.profile.id}`;
  assert.equal(u!.telegram_id, '424242');
  assert.equal(u!.platform, 'telegram_android');
});

test('auth: invalid signature, stale and future initData are rejected with 401', async () => {
  const bad = signInitData({ user: tgUser(1), auth_date: String(nowSec()) }, '1:wrong-token');
  assert.equal((await api(app.base, '/api/auth/telegram', { method: 'POST', body: { initData: bad } })).status, 401);
  const stale = signInitData({ user: tgUser(1), auth_date: String(nowSec() - 2 * 86400) }, TEST_BOT_TOKEN);
  const rs = await api(app.base, '/api/auth/telegram', { method: 'POST', body: { initData: stale } });
  assert.equal(rs.status, 401);
  assert.equal(rs.body.error.code, 'invalid_init_data');
  const future = signInitData({ user: tgUser(1), auth_date: String(nowSec() + 7200) }, TEST_BOT_TOKEN);
  assert.equal((await api(app.base, '/api/auth/telegram', { method: 'POST', body: { initData: future } })).status, 401);
  assert.equal((await api(app.base, '/api/auth/telegram', { method: 'POST', body: { initData: 'x' } })).status, 400);
});

test('auth: missing bot token → 503; dev auth refused in production config', async () => {
  const noBot = await startTestApp({ TELEGRAM_BOT_TOKEN: undefined });
  try {
    const init = signInitData({ user: tgUser(5), auth_date: String(nowSec()) }, TEST_BOT_TOKEN);
    const r = await api(noBot.base, '/api/auth/telegram', { method: 'POST', body: { initData: init } });
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'telegram_not_configured');
  } finally {
    await noBot.close();
  }
  const prod = await startTestApp({ NODE_ENV: 'production', DEV_AUTH_ENABLED: true });
  try {
    const r = await api(prod.base, '/api/auth/dev', { method: 'POST', body: { name: 'Хакер' } });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'dev_auth_disabled');
  } finally {
    await prod.close();
  }
  const off = await startTestApp({ DEV_AUTH_ENABLED: false });
  try {
    assert.equal((await api(off.base, '/api/auth/dev', { method: 'POST', body: { name: 'Хакер' } })).status, 403);
  } finally {
    await off.close();
  }
});

test('auth: dev login keyed by deviceId; profile update validation', async () => {
  const a = await devLogin(app.base, 'Валюта', 'device-abc-123');
  const b = await devLogin(app.base, 'Валюта Новый', 'device-abc-123');
  assert.equal(a.userId, b.userId);
  const bad = await api(app.base, '/api/me', { method: 'PATCH', token: b.token, body: { displayName: '<script>' } });
  assert.equal(bad.status, 400);
  const ok = await api(app.base, '/api/me', { method: 'PATCH', token: b.token, body: { displayName: 'Валюта', preferredCharacter: 'valuta' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.displayName, 'Валюта');
  assert.equal(ok.body.preferredCharacter, 'valuta');
  const ach = await api(app.base, '/api/me/achievements', { token: b.token });
  assert.equal(ach.status, 200);
  // Response shapes match the web client (apps/web/src/net/api.ts): { achievements } and { matches }.
  assert.equal(ach.body.achievements.length, 6);
  assert.ok(ach.body.achievements.every((x: { unlockedAt: string | null }) => x.unlockedAt === null));
  assert.deepEqual((await api(app.base, '/api/me/history', { token: b.token })).body, { matches: [] });
});

test('auth: expired and revoked sessions are refused', async () => {
  const s = await devLogin(app.base, 'Участковый');
  assert.equal((await api(app.base, '/api/me', { token: s.token })).status, 200);
  await app.db.sql`UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = ${s.userId}`;
  assert.equal((await api(app.base, '/api/me', { token: s.token })).status, 401);
  const s2 = await devLogin(app.base, 'Участковый', s.deviceId);
  assert.equal((await api(app.base, '/api/me', { token: s2.token })).status, 200);
  assert.equal((await api(app.base, '/api/auth/logout', { method: 'POST', token: s2.token })).status, 200);
  assert.equal((await api(app.base, '/api/me', { token: s2.token })).status, 401);
  assert.equal((await api(app.base, '/api/me')).status, 401);
  assert.equal((await api(app.base, '/api/me', { token: 'not-a-valid-token-at-all-xxxxxxxx' })).status, 401);
  const [row] = await app.db.sql<Array<{ token_hash: Buffer }>>`SELECT token_hash FROM sessions WHERE user_id = ${s.userId} LIMIT 1`;
  assert.notEqual(row!.token_hash.toString('base64url'), s.token, 'token is not stored in plain text');
});

test('auth: account deletion removes the user and personal data', async () => {
  const s = await devLogin(app.base, 'Удаляемый');
  await app.db.sql`INSERT INTO analytics_events (id, name, source, user_id, occurred_at) VALUES (gen_random_uuid(), 'app_opened', 'client', ${s.userId}, now())`;
  const del = await api(app.base, '/api/me', { method: 'DELETE', token: s.token });
  assert.equal(del.status, 200);
  assert.equal((await api(app.base, '/api/me', { token: s.token })).status, 401);
  const [u] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM users WHERE id = ${s.userId}`;
  assert.equal(u!.n, 0);
  const [e] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM analytics_events WHERE user_id = ${s.userId}`;
  assert.equal(e!.n, 0);
});
