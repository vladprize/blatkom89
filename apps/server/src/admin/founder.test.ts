/**
 * v0.2.17: the founder's account and the $BLAT supply. «Make founder» (admin only, CSRF, audited): the
 * badge everywhere the alias is, level 87, every item, $BLAT up to the founder's share out of the
 * founder's pool — and repeating it changes nothing. Allocations out of the influencers', the friends'
 * and the reserve pool never give more than the pool holds; the players' pool pays the levels; the admin's
 * $BLAT page shows every pool.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BLAT_FOUNDER_HOLDING, BLAT_POOLS, CHARACTER_IDS, FOUNDER_LEVEL, blatForLevelsUpTo } from '@blatkom/shared';
import type { PublicProfile } from '@blatkom/shared';
import { startTestApp, api, cookieFrom, devLogin } from './testkit.js';
import type { TestApp } from './testkit.js';
import { ADMIN_COOKIE } from './auth.js';

describe('admin: the founder and the $BLAT pools (v0.2.17)', () => {
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

  const pools = async () => Object.fromEntries((await app.db.sql<Array<{ pool: string; issued: string }>>`SELECT pool, issued FROM blat_pools`).map((r) => [r.pool, Number(r.issued)]));

  test('«Make founder»: the badge, level 87, every item, the founder’s share once; admins only, audited', async () => {
    const owner = await devLogin(app.base, 'Owner');
    const other = await devLogin(app.base, 'Somebody');
    const url = `/api/admin/players/${owner.userId}/founder`;
    assert.equal((await api(app.base, url, { method: 'POST', token: owner.token })).status, 401, 'a player can’t');
    assert.equal((await api(app.base, url, { method: 'POST', cookie })).status, 403, 'CSRF');
    assert.equal((await api(app.base, url, { method: 'POST', cookie: viewerCookie, csrf: viewerCsrf })).status, 403, 'a viewer can’t');
    const before0 = await pools();
    const r = await api(app.base, url, { method: 'POST', cookie, csrf });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.level, FOUNDER_LEVEL);
    assert.equal(r.body.blat, BLAT_FOUNDER_HOLDING);
    assert.ok(r.body.items > CHARACTER_IDS.length, `every item (${r.body.items})`);
    const after1 = await pools();
    assert.equal(after1.founder! - before0.founder!, r.body.allocated, 'the founder’s pool gave the share');
    assert.equal(r.body.allocated + blatForLevelsUpTo(FOUNDER_LEVEL), BLAT_FOUNDER_HOLDING, 'the levels paid their part, the pool the rest');
    // the badge: the profile, the Top-100, the admin's card
    const me = await api<PublicProfile>(app.base, '/api/me', { token: owner.token });
    assert.equal(me.body.founder, true);
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
    assert.deepEqual([again.body.allocated, again.body.items, again.body.blat], [0, 0, BLAT_FOUNDER_HOLDING]);
    assert.equal((await pools()).founder, after1.founder);
    const audits = await app.db.sql<Array<{ action: string }>>`SELECT action FROM admin_audit_log WHERE action = 'founder_made' AND target = ${owner.userId}`;
    assert.equal(audits.length, 2);
  });

  test('allocations come out of their pool and never past it; the players’ pool pays the levels', async () => {
    const p = await devLogin(app.base, 'Blogger');
    const url = `/api/admin/players/${p.userId}/blat-allocation`;
    const before0 = await pools();
    const ok = await api(app.base, url, { method: 'POST', cookie, csrf, body: { pool: 'influencers', amount: 1_000_000, note: 'stream deal' } });
    assert.equal(ok.status, 200, ok.text);
    assert.equal((await pools()).influencers! - before0.influencers!, 1_000_000);
    assert.equal((await api(app.base, url, { method: 'POST', cookie, csrf, body: { pool: 'players', amount: 10, note: 'not this one' } })).status, 400, 'the players’ pool pays only rewards');
    assert.equal((await api(app.base, url, { method: 'POST', cookie, csrf, body: { pool: 'friends', amount: 0, note: 'nothing' } })).status, 400);
    // the reserve has 20 000 000: a bigger share is refused and nothing moves
    await app.db.sql`UPDATE blat_pools SET issued = cap - 5 WHERE pool = 'reserve'`;
    const over = await api(app.base, url, { method: 'POST', cookie, csrf, body: { pool: 'reserve', amount: 6, note: 'one too many' } });
    assert.equal(over.status, 409);
    assert.equal(over.body.error.code, 'pool_exhausted');
    assert.equal((await pools()).reserve, BLAT_POOLS.reserve - 5);
    const audits = await app.db.sql<Array<{ details: { pool: string; amount: number } }>>`SELECT details FROM admin_audit_log WHERE action = 'blat_allocation' AND target = ${p.userId}`;
    assert.deepEqual(audits.map((a) => [a.details.pool, a.details.amount]), [['influencers', 1_000_000]]);
    // a new player's welcome (level 1) came out of the players' pool
    const players0 = (await pools()).players!;
    await devLogin(app.base, 'Newcomer');
    assert.ok((await pools()).players! > players0, 'the welcome came out of the players’ pool');
    // the admin's $BLAT page: every pool with its cap
    const page = await api(app.base, '/api/admin/blat', { cookie });
    assert.equal(page.status, 200, page.text);
    assert.deepEqual(
      page.body.pools.map((x: { pool: string; cap: number }) => [x.pool, x.cap]).sort(),
      Object.entries(BLAT_POOLS).map(([k, v]) => [k, v]).sort(),
    );
  });
});
