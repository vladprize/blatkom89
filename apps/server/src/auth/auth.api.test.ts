import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENT_IDS } from '@blatkom/shared';
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
  assert.equal(r1.body.profile.displayName, 'Mikhalych', 'a Telegram name in Latin letters (v0.3)');
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

test('auth: guest login for the public website (production): nickname kept, only an HMAC stored, sign-up flood limited', async () => {
  const prod = await startTestApp({ NODE_ENV: 'production', DEV_AUTH_ENABLED: false, GUEST_AUTH_ENABLED: true, TELEGRAM_BOT_TOKEN: undefined });
  try {
    const deviceId = 'guest-device-0123456789abcdef';
    const r1 = await api(prod.base, '/api/auth/guest', { method: 'POST', body: { name: 'Гость_123', deviceId, platform: 'browser_mobile' } });
    assert.equal(r1.status, 200, r1.text);
    assert.equal(r1.body.isNew, true);
    assert.equal(r1.body.profile.displayName, 'Gost_123', 'a sign-up name is kept in Latin letters (v0.3)');
    // the player picks a nickname, loses the token and signs in again from the same browser
    const cyr = await api(prod.base, '/api/me', { method: 'PATCH', token: r1.body.token, body: { displayName: 'Тихий Завхоз' } });
    assert.equal(cyr.status, 400, 'a chosen alias must be Latin');
    const ren = await api(prod.base, '/api/me', { method: 'PATCH', token: r1.body.token, body: { displayName: 'Quiet Quartermaster' } });
    assert.equal(ren.status, 200, ren.text);
    const r2 = await api(prod.base, '/api/auth/guest', { method: 'POST', body: { name: 'Гость_999', deviceId } });
    assert.equal(r2.status, 200, r2.text);
    assert.equal(r2.body.isNew, false);
    assert.equal(r2.body.profile.id, r1.body.profile.id);
    assert.equal(r2.body.profile.displayName, 'Quiet Quartermaster');
    // the raw device secret is never stored
    const [u] = await prod.db.sql<Array<{ dev_device_id: string }>>`SELECT dev_device_id FROM users WHERE id = ${r1.body.profile.id}`;
    assert.ok(u!.dev_device_id.startsWith('g1:'));
    assert.ok(!u!.dev_device_id.includes(deviceId));
    const [sess] = await prod.db.sql<Array<{ method: string }>>`SELECT method FROM sessions WHERE user_id = ${r1.body.profile.id} LIMIT 1`;
    assert.equal(sess!.method, 'guest');
    // weak device ids are refused; the dev login stays off in production
    assert.equal((await api(prod.base, '/api/auth/guest', { method: 'POST', body: { name: 'Кто-то', deviceId: 'short' } })).status, 400);
    assert.equal((await api(prod.base, '/api/auth/dev', { method: 'POST', body: { name: 'Кто-то' } })).status, 403);
    // a sign-up flood from one address is cut after 10 new players; existing players still get in
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await api(prod.base, '/api/auth/guest', { method: 'POST', body: { name: `Игрок ${i}`, deviceId: `flood-device-${i}-0123456789` } })).status);
    assert.deepEqual(codes.slice(0, 9), Array(9).fill(200));
    assert.deepEqual(codes.slice(9), [429, 429]);
    assert.equal((await api(prod.base, '/api/auth/guest', { method: 'POST', body: { name: 'Гость_123', deviceId } })).status, 200);
  } finally {
    await prod.close();
  }
  // without GUEST_AUTH_ENABLED a production server refuses guests
  const tgOnly = await startTestApp({ NODE_ENV: 'production', DEV_AUTH_ENABLED: false, GUEST_AUTH_ENABLED: false });
  try {
    const r = await api(tgOnly.base, '/api/auth/guest', { method: 'POST', body: { name: 'Гость', deviceId: 'guest-device-0123456789abcdef' } });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'guest_auth_disabled');
  } finally {
    await tgOnly.close();
  }
});

test('auth: dev login keyed by deviceId; profile update validation', async () => {
  const a = await devLogin(app.base, 'Валюта', 'device-abc-123');
  const b = await devLogin(app.base, 'Валюта Новый', 'device-abc-123');
  assert.equal(a.userId, b.userId);
  const bad = await api(app.base, '/api/me', { method: 'PATCH', token: b.token, body: { displayName: '<script>' } });
  assert.equal(bad.status, 400);
  assert.equal((await api(app.base, '/api/me', { method: 'PATCH', token: b.token, body: { displayName: 'Валюта' } })).status, 400, 'Cyrillic: refused (v0.3)');
  const ok = await api(app.base, '/api/me', { method: 'PATCH', token: b.token, body: { displayName: 'Valyuta', preferredCharacter: 'valuta' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.displayName, 'Valyuta');
  assert.equal(ok.body.preferredCharacter, 'valuta');
  const ach = await api(app.base, '/api/me/achievements', { token: b.token });
  assert.equal(ach.status, 200);
  // Response shapes match the web client (apps/web/src/net/api.ts): { achievements } and { matches }.
  assert.equal(ach.body.achievements.length, ACHIEVEMENT_IDS.length);
  assert.ok(ach.body.achievements.every((x: { unlockedAt: string | null }) => x.unlockedAt === null));
  assert.deepEqual((await api(app.base, '/api/me/history', { token: b.token })).body, { matches: [] });
});

test('profile avatar: set, kept, shown to the room through the session, removed; unknown ids refused', async () => {
  const a = await devLogin(app.base, 'Шляпа', 'device-avatar-001');
  assert.equal((await api(app.base, '/api/me', { token: a.token })).body.avatar, null, 'no avatar at first');
  const set = await api(app.base, '/api/me', { method: 'PATCH', token: a.token, body: { avatar: 'militia' } });
  assert.equal(set.status, 200);
  assert.equal(set.body.avatar, 'militia');
  assert.equal((await api(app.base, '/api/me', { token: a.token })).body.avatar, 'militia', 'kept');
  // the room roster reads the avatar from the session (MatchRoom → RosterEntry.avatar)
  assert.equal((await app.persistence.services.sessions.verify(a.token))?.avatar, 'militia');
  for (const bad of ['nobody', 'MILITIA', '', 7]) {
    const r = await api(app.base, '/api/me', { method: 'PATCH', token: a.token, body: { avatar: bad } });
    assert.equal(r.status, 400, `refused: ${JSON.stringify(bad)}`);
  }
  // other fields leave the avatar alone; null removes it
  assert.equal((await api(app.base, '/api/me', { method: 'PATCH', token: a.token, body: { displayName: 'Second Hat' } })).body.avatar, 'militia');
  const off = await api(app.base, '/api/me', { method: 'PATCH', token: a.token, body: { avatar: null } });
  assert.equal(off.status, 200);
  assert.equal(off.body.avatar, null);
  // the database check keeps the column to short lowercase ids even past the API
  await assert.rejects(app.db.sql`UPDATE profiles SET avatar = 'Robert"); DROP' WHERE user_id = ${a.userId}`);
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
