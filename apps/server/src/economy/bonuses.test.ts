import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePromoCode } from '@blatkom/shared';
import { startTestApp, api, devLogin, TEST_BOT_TOKEN } from '../admin/testkit.js';
import type { TestApp } from '../admin/testkit.js';
import { signInitData } from '../auth/telegram.js';
import { creditWelcomeBonus, redeemPromo } from './bonuses.js';

let app: TestApp;
before(async () => {
  app = await startTestApp();
});
after(async () => {
  await app.close();
});

const blats = async (userId: string) => (await app.db.sql<Array<{ diamonds: number }>>`SELECT diamonds FROM profiles WHERE user_id = ${userId}`)[0]?.diamonds ?? 0;
const ledger = (userId: string, reason: string) => app.db.sql<Array<{ delta: number; balance_after: number; ref: string }>>`SELECT delta, balance_after, ref FROM currency_ledger WHERE user_id = ${userId} AND reason = ${reason}`;

test('v0.2.20 welcome bonus: a guest is offered 199 BLATS, gets them once for registering an email', async () => {
  const g = await devLogin(app.base, 'newcomer');
  const me = await api(app.base, '/api/me', { token: g.token });
  assert.equal(me.body.welcomeBonus, 199, 'a guest is offered the bonus');
  const before = await blats(g.userId);
  const r = await api(app.base, '/api/auth/email/link', { method: 'POST', token: g.token, body: { email: 'newcomer@example.com', password: 'long-enough-1' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.welcomeCredited, 199);
  assert.equal(r.body.diamonds, before + 199);
  assert.equal(r.body.welcomeBonus, undefined, 'not offered once registered');
  assert.equal(await blats(g.userId), before + 199);
  const rows = await ledger(g.userId, 'welcome');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.balance_after, before + 199);
  // another try, a retry and a concurrent pair: still once
  const again = await creditWelcomeBonus(app.db.sql, g.userId, 199, 'email');
  assert.equal(again.gained, 0);
  assert.equal((await ledger(g.userId, 'welcome')).length, 1);
  const me2 = await api(app.base, '/api/me', { token: g.token });
  assert.equal(me2.body.welcomeBonus, undefined);
  assert.equal(me2.body.welcomeCredited, undefined, 'said once, by the request that paid it');
});

test('v0.2.20 welcome bonus: concurrent registrations pay once; a registered account (Telegram) gets nothing', async () => {
  const g = await devLogin(app.base, 'racer');
  const both = await Promise.all([creditWelcomeBonus(app.db.sql, g.userId, 199, 'email'), creditWelcomeBonus(app.db.sql, g.userId, 199, 'email')]);
  assert.deepEqual(both.map((b) => b.gained).sort(), [0, 199]);
  assert.equal(await blats(g.userId), 199);

  const init = signInitData({ user: JSON.stringify({ id: 777_020, first_name: 'Tg' }), auth_date: String(Math.floor(Date.now() / 1000)) }, TEST_BOT_TOKEN);
  const tg = await api(app.base, '/api/auth/telegram', { method: 'POST', body: { initData: init } });
  assert.equal(tg.status, 200, tg.text);
  assert.equal(tg.body.profile.welcomeBonus, undefined, 'a Telegram account is registered already');
  const r = await api(app.base, '/api/auth/email/link', { method: 'POST', token: tg.body.token, body: { email: 'tg-player@example.com', password: 'long-enough-2' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.welcomeCredited, undefined);
  assert.equal((await ledger(tg.body.profile.id, 'welcome')).length, 0);
});

test('v0.2.20 welcome bonus: switched off with WELCOME_BONUS_BLATS=0', async () => {
  const off = await startTestApp({ WELCOME_BONUS_BLATS: 0 });
  try {
    const g = await devLogin(off.base, 'nobonus');
    assert.equal((await api(off.base, '/api/me', { token: g.token })).body.welcomeBonus, undefined);
    const r = await api(off.base, '/api/auth/email/link', { method: 'POST', token: g.token, body: { email: 'nobonus@example.com', password: 'long-enough-3' } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.welcomeCredited, undefined);
  } finally {
    await off.close();
  }
});

test('v0.2.20 promo codes: «BLATNOY» in any spelling gives 500 BLATS once per account', async () => {
  assert.equal(normalizePromoCode(' blat noy '), 'BLATNOY');
  assert.equal(normalizePromoCode('БЛАТНОЙ'), 'BLATNOY');
  const a = await devLogin(app.base, 'friend_one');
  const b = await devLogin(app.base, 'friend_two');
  const r = await api(app.base, '/api/promo', { method: 'POST', token: a.token, body: { code: 'blatnoy' } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body, { code: 'BLATNOY', diamonds: 500, balance: 500 });
  assert.equal(await blats(a.userId), 500);
  const twice = await api(app.base, '/api/promo', { method: 'POST', token: a.token, body: { code: 'БЛАТНОЙ' } });
  assert.equal(twice.status, 409);
  assert.equal(twice.body.error.code, 'promo_used');
  assert.equal(await blats(a.userId), 500);
  // another friend, concurrently twice: once
  const pair = await Promise.all([redeemPromo(app.db.sql, b.userId, 'BLATNOY'), redeemPromo(app.db.sql, b.userId, 'BLATNOY')]);
  assert.equal(pair.filter((p) => p.ok).length, 1);
  assert.equal(await blats(b.userId), 500);
  const rows = await ledger(b.userId, 'promo');
  assert.deepEqual(rows.map((x) => [x.delta, x.ref]), [[500, 'promo:BLATNOY']]);
});

test('v0.2.20 promo codes: unknown, switched off, past its end date, used up; guests only signed in', async () => {
  const p = await devLogin(app.base, 'tester');
  const unknown = await api(app.base, '/api/promo', { method: 'POST', token: p.token, body: { code: 'NOPE42' } });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, 'promo_unknown');
  assert.equal((await api(app.base, '/api/promo', { method: 'POST', token: p.token, body: { code: '!!' } })).status, 404);
  assert.equal((await api(app.base, '/api/promo', { method: 'POST', body: { code: 'BLATNOY' } })).status, 401);
  await app.db.sql`INSERT INTO promo_codes (code, diamonds, active) VALUES ('OLDCODE', 50, false)`;
  await app.db.sql`INSERT INTO promo_codes (code, diamonds, expires_at) VALUES ('GONE2026', 50, ${new Date(Date.now() - 1000)})`;
  await app.db.sql`INSERT INTO promo_codes (code, diamonds, max_uses) VALUES ('ONLYONE', 70, 1)`;
  for (const code of ['OLDCODE', 'GONE2026']) {
    const r = await api(app.base, '/api/promo', { method: 'POST', token: p.token, body: { code } });
    assert.equal(r.status, 410, code);
    assert.equal(r.body.error.code, 'promo_expired');
  }
  const first = await api(app.base, '/api/promo', { method: 'POST', token: p.token, body: { code: 'onlyone' } });
  assert.equal(first.status, 200, first.text);
  const q = await devLogin(app.base, 'latecomer');
  const late = await api(app.base, '/api/promo', { method: 'POST', token: q.token, body: { code: 'ONLYONE' } });
  assert.equal(late.status, 410, 'used up');
  assert.equal(await blats(q.userId), 0);
});
