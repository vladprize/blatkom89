/**
 * v0.2.17: the founder's account. «Make founder» (admin only, CSRF, audited): the badge everywhere the
 * alias is, level 87, every item, the levels' BLATS — and repeating it changes nothing. v0.2.18: no $BLAT
 * (the holding, the pools and their routes are gone).
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BLATS_PER_LEVEL, CHARACTER_IDS, FOUNDER_LEVEL } from '@blatkom/shared';
import type { PublicProfile } from '@blatkom/shared';
import { startTestApp, api, cookieFrom, devLogin } from './testkit.js';
import type { TestApp } from './testkit.js';
import { ADMIN_COOKIE } from './auth.js';

describe('admin: the founder (v0.2.17; v0.2.18 without $BLAT)', () => {
  let app: TestApp;
  let cookie: string;
  let csrf: string;
  let viewerCookie: string;
  let viewerCsrf: string;
  before(async () => {
    app = await startTestApp({ ADMIN_BOOTSTRAP_USERNAME: 'root', ADMIN_BOOTSTRAP_PASSWORD: 'correct-horse-battery-staple' });
    const ok = await api(app.base, '/api/admin/login', { method: 'POST', body: { username: 'root', password: 'correct-horse-battery-staple' } });
    cookie = cookieFrom(ok.headers, ADMIN_COOKIE)!;
    csrf = ok.body.csrfToken;
    await api(app.base, '/api/admin/users', { method: 'POST', cookie, csrf, body: { username: 'reader', password: 'viewer-password-123', role: 'viewer' } });
    const v = await api(app.base, '/api/admin/login', { method: 'POST', body: { username: 'reader', password: 'viewer-password-123' } });
    viewerCookie = cookieFrom(v.headers, ADMIN_COOKIE)!;
    viewerCsrf = v.body.csrfToken;
  });
  after(async () => {
    await app.close();
  });

  test('«Make founder»: the badge, level 87, every item, the levels’ BLATS once; admins only, audited', async () => {
    const owner = await devLogin(app.base, 'Owner');
    const other = await devLogin(app.base, 'Somebody');
    const url = `/api/admin/players/${owner.userId}/founder`;
    assert.equal((await api(app.base, url, { method: 'POST', token: owner.token })).status, 401, 'a player can’t');
    assert.equal((await api(app.base, url, { method: 'POST', cookie })).status, 403, 'CSRF');
    assert.equal((await api(app.base, url, { method: 'POST', cookie: viewerCookie, csrf: viewerCsrf })).status, 403, 'a viewer can’t');
    const r = await api(app.base, url, { method: 'POST', cookie, csrf });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(Object.keys(r.body).sort(), ['items', 'level']);
    assert.equal(r.body.level, FOUNDER_LEVEL);
    assert.ok(r.body.items > CHARACTER_IDS.length, `every item (${r.body.items})`);
    // the badge: the profile, the Top-100, the admin's card; the levels paid their BLATS (10 a level from level 2)
    const me = await api<PublicProfile>(app.base, '/api/me', { token: owner.token });
    assert.equal(me.body.founder, true);
    assert.equal(me.body.diamonds, (FOUNDER_LEVEL - 1) * BLATS_PER_LEVEL);
    assert.equal((me.body as unknown as Record<string, unknown>).blat, undefined, 'no $BLAT in the profile');
    assert.equal((await api<PublicProfile>(app.base, '/api/me', { token: other.token })).body.founder, undefined, 'nobody else');
    // the Top-100 lists players with a finished match
    await app.db.sql`UPDATE profiles SET matches_completed = 1 WHERE user_id = ${owner.userId}`;
    const top = await api(app.base, '/api/leaderboard?by=level', { token: other.token });
    assert.equal(top.status, 200, top.text);
    const row = top.body.entries.find((e: { name: string }) => e.name === 'Owner');
    assert.equal(row?.founder, true, 'the Top-100 shows the badge');
    const card = await api(app.base, `/api/admin/players/${owner.userId}`, { cookie });
    assert.equal(card.body.founder, true);
    // again: nothing more
    const again = await api(app.base, url, { method: 'POST', cookie, csrf });
    assert.deepEqual([again.body.level, again.body.items], [FOUNDER_LEVEL, 0]);
    assert.equal((await api<PublicProfile>(app.base, '/api/me', { token: owner.token })).body.diamonds, (FOUNDER_LEVEL - 1) * BLATS_PER_LEVEL, 'no second payment');
    const audits = await app.db.sql<Array<{ action: string }>>`SELECT action FROM admin_audit_log WHERE action = 'founder_made' AND target = ${owner.userId}`;
    assert.equal(audits.length, 2);
    // one founder: another account is refused and nothing moves
    const second = await api(app.base, `/api/admin/players/${other.userId}/founder`, { method: 'POST', cookie, csrf });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'founder_taken');
    assert.equal((await api<PublicProfile>(app.base, '/api/me', { token: other.token })).body.founder, undefined);
  });

  test('v0.2.18: the retired $BLAT routes are gone (the drop, the snapshots, the pools, the allocations)', async () => {
    const p = await devLogin(app.base, 'Blogger');
    for (const [method, url] of [
      ['GET', '/api/admin/blat'],
      ['GET', '/api/admin/blat/drop'],
      ['GET', '/api/admin/blat/snapshots'],
      ['POST', `/api/admin/players/${p.userId}/blat-allocation`],
    ] as const) {
      const r = await api(app.base, url, { method, cookie, csrf, ...(method === 'POST' ? { body: { pool: 'influencers', amount: 10, note: 'gone' } } : {}) });
      assert.equal(r.status, 404, `${method} ${url}`);
    }
    for (const url of ['/api/blat', '/api/blat/drop']) assert.equal((await api(app.base, url, { token: p.token })).status, 404, url);
  });
});
