import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startTestApp, api, cookieFrom, devLogin, testDb, TEST_BOT_TOKEN } from './testkit.js';
import type { TestApp, TestDb } from './testkit.js';
import { ADMIN_COOKIE } from './auth.js';
import { resolveRange } from '../analytics/metrics.js';
import { economy, funnel, maskEmail } from '../analytics/economy.js';
import { signInitData } from '../auth/telegram.js';

test('maskEmail keeps only the edges of the local part', () => {
  assert.equal(maskEmail('donater@example.com'), 'd•••r@example.com');
  assert.equal(maskEmail('ab@x.io'), 'a•••@x.io');
  assert.equal(maskEmail(null), null);
});

describe('funnel and economy metrics (deterministic data)', () => {
  let db: TestDb;
  const NOW = new Date('2026-04-20T12:00:00.000Z');
  const R = () => resolveRange('custom', '2026-04-01', '2026-04-10', NOW);
  const uid: Record<string, string> = {};
  before(async () => {
    db = await testDb();
    const user = async (key: string, created: string, email: string | null = null) => {
      const [r] = await db.sql<Array<{ id: string }>>`
        INSERT INTO users (dev_device_id, display_name, created_at, last_seen_at, email) VALUES (${'dev-' + key}, ${key}, ${new Date(created)}, ${new Date(created)}, ${email}) RETURNING id`;
      uid[key] = r!.id;
      await db.sql`INSERT INTO profiles (user_id) VALUES (${r!.id})`;
      await db.sql`INSERT INTO user_daily_activity (user_id, day) VALUES (${r!.id}, ${created.slice(0, 10)}::date)`;
    };
    // a, b, c came through the website; d registered in the period without a visitor id (Telegram);
    // e registered before the period
    await user('a', '2026-04-02T10:00:00Z', 'a@example.com');
    await user('b', '2026-04-03T10:00:00Z');
    await user('c', '2026-04-04T10:00:00Z');
    await user('d', '2026-04-05T10:00:00Z');
    await user('e', '2026-03-01T10:00:00Z');
    const visitor = async (id: string, first: string, user: string | null, referrer: string | null) => {
      await db.sql`INSERT INTO visitors (visitor_id, first_seen_at, last_seen_at, user_id, referrer) VALUES (${id}, ${new Date(first)}, ${new Date(first)}, ${user ? uid[user]! : null}, ${referrer})`;
      await db.sql`INSERT INTO visitor_days (visitor_id, day) VALUES (${id}, ${first.slice(0, 10)}::date)`;
    };
    await visitor('visitor-a-0000000000', '2026-04-02T09:00:00Z', 'a', 't.me');
    await visitor('visitor-b-0000000000', '2026-04-03T09:00:00Z', 'b', 't.me');
    await visitor('visitor-c-0000000000', '2026-04-04T09:00:00Z', 'c', null);
    await visitor('visitor-x-0000000000', '2026-04-04T09:30:00Z', null, null);
    await visitor('visitor-y-0000000000', '2026-04-06T09:30:00Z', null, 'vk.com');
    await visitor('visitor-z-0000000000', '2026-03-15T09:30:00Z', null, null); // before the period
    await db.sql`INSERT INTO visitor_days (visitor_id, day) VALUES ('visitor-z-0000000000', '2026-04-06'::date)`;
    // a and b played; a came back the next day, c came back without playing
    const m = randomUUID();
    await db.sql`INSERT INTO matches (id, room_id, map_id, status, started_at, ended_at, duration_ms, player_count, results_processed_at)
                 VALUES (${m}, 'r1', 'factory', 'completed', ${new Date('2026-04-03T11:00:00Z')}, ${new Date('2026-04-03T11:04:00Z')}, 240000, 2, now())`;
    await db.sql`INSERT INTO match_participants (match_id, user_id, character, completed, place) VALUES (${m}, ${uid.a!}, 'petya', true, 1), (${m}, ${uid.b!}, 'valuta', true, 2)`;
    await db.sql`INSERT INTO user_daily_activity (user_id, day) VALUES (${uid.a!}, '2026-04-03'::date), (${uid.c!}, '2026-04-07'::date)`;
    // economy: a earned talons in a match and bought a knife and a silencer; b topped up diamonds and opened a case
    const ledger = (u: string, currency: string, delta: number, after: number, reason: string, at: string) =>
      db.sql`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, created_at) VALUES (${uid[u]!}, ${currency}, ${delta}, ${after}, ${reason}, ${new Date(at)})`;
    await ledger('a', 'tokens', 300, 300, 'match', '2026-04-03T11:05:00Z');
    await ledger('a', 'tokens', -120, 180, 'purchase', '2026-04-03T11:10:00Z');
    await ledger('a', 'tokens', -150, 30, 'mod', '2026-04-03T11:12:00Z');
    await ledger('b', 'diamonds', 499, 499, 'topup', '2026-04-04T08:00:00Z');
    await ledger('b', 'diamonds', -299, 200, 'case', '2026-04-04T08:01:00Z');
    await ledger('b', 'tokens', 50, 50, 'grant', '2026-04-04T08:02:00Z');
    await ledger('b', 'tokens', 7, 57, 'match', '2026-03-20T08:02:00Z'); // outside the period
    await db.sql`UPDATE profiles SET tokens = 30 WHERE user_id = ${uid.a!}`;
    await db.sql`UPDATE profiles SET tokens = 57, diamonds = 200 WHERE user_id = ${uid.b!}`;
    await db.sql`INSERT INTO user_items (user_id, item_id, kind, source, acquired_at) VALUES
      (${uid.a!}, 'nozh', 'weapon', 'tokens', ${new Date('2026-04-03T11:10:00Z')}),
      (${uid.b!}, 'mauser', 'weapon', 'case', ${new Date('2026-04-04T08:01:00Z')})`;
    await db.sql`INSERT INTO weapon_mods (user_id, weapon_id, mod_id, acquired_at) VALUES (${uid.a!}, 'avtomat', 'silencer', ${new Date('2026-04-03T11:12:00Z')})`;
    await db.sql`INSERT INTO case_openings (user_id, weapon_id, rarity, price, created_at) VALUES (${uid.b!}, 'mauser', 'rare', 299, ${new Date('2026-04-04T08:01:00Z')})`;
    const pay = (u: string, status: string, cents: number, created: string, paid: string | null, provider = 'stripe') =>
      db.sql`INSERT INTO payments (user_id, provider, provider_ref, pack_id, diamonds, amount_cents, status, created_at, paid_at)
             VALUES (${uid[u]!}, ${provider}, ${randomUUID()}, 'd499', 499, ${cents}, ${status}, ${new Date(created)}, ${paid ? new Date(paid) : null})`;
    await pay('b', 'paid', 499, '2026-04-04T07:59:00Z', '2026-04-04T08:00:00Z');
    await pay('b', 'refunded', 499, '2026-04-05T07:59:00Z', '2026-04-05T08:00:00Z', 'nowpayments');
    await pay('c', 'created', 199, '2026-04-06T07:00:00Z', null);
    await pay('c', 'expired', 199, '2026-04-06T07:10:00Z', null);
  });
  after(async () => {
    await db.drop();
  });

  test('funnel: visitor cohort and new-player cohort are nested and never estimated', async () => {
    const f = await funnel(db.sql, R());
    assert.deepEqual(f.visitors, { entered: 5, registered: 3, played: 2, returned: 1, paid: 1, emailLinked: 1 });
    assert.deepEqual(f.players, { entered: 4, registered: 4, played: 2, returned: 1, paid: 1, emailLinked: 1 });
    assert.deepEqual(f.referrers[0], { key: 't.me', visitors: 2, registered: 2 });
    assert.ok(f.referrers.some((r) => r.key === '' && r.visitors === 2), 'direct visits are grouped under an empty key');
    const d6 = f.daily.find((d) => d.day === '2026-04-06')!;
    assert.deepEqual(d6, { day: '2026-04-06', uniqueVisitors: 2, newVisitors: 1, registrations: 0 });
    assert.equal(f.daily.length, 10);
    const empty = await funnel(db.sql, resolveRange('custom', '2020-01-01', '2020-01-02', NOW));
    assert.deepEqual(empty.visitors, { entered: 0, registered: 0, played: 0, returned: 0, paid: 0, emailLinked: 0 });
    assert.deepEqual(empty.referrers, []);
  });

  test('economy: currency flows by reason, revenue, purchases, mods and cases', async () => {
    const e = await economy(db.sql, R(), NOW);
    assert.deepEqual(e.tokens.issued, { match: 300, grant: 50 });
    assert.deepEqual(e.tokens.spent, { purchase: 120, mod: 150 });
    assert.equal(e.tokens.issuedTotal, 350);
    assert.equal(e.tokens.spentTotal, 270);
    assert.equal(e.tokens.circulating, 87);
    assert.equal(e.tokens.holders, 2);
    assert.deepEqual(e.diamonds.issued, { topup: 499 });
    assert.deepEqual(e.diamonds.spent, { case: 299 });
    assert.equal(e.diamonds.circulating, 200);
    assert.equal(e.revenue.payments, 2);
    assert.equal(e.revenue.payers, 1);
    assert.deepEqual(e.revenue.byCurrency, [{ currency: 'usd', grossCents: 998, refundedCents: 499 }]);
    assert.deepEqual(e.revenue.byProvider.map((p) => p.provider).sort(), ['nowpayments', 'stripe']);
    assert.deepEqual(e.revenue.byPack, [{ packId: 'd499', payments: 2 }]);
    assert.equal(e.revenue.pending, 1);
    assert.equal(e.revenue.failed, 1);
    assert.equal(e.purchases.total, 1, 'the case drop is not a purchase');
    assert.equal(e.purchases.byKind.length, 2);
    assert.deepEqual(e.purchases.top, [{ kind: 'weapon', id: 'nozh', count: 1 }], 'case drops are not counted as purchases in the top list');
    assert.deepEqual(e.mods, { total: 1, top: [{ id: 'silencer', count: 1 }] });
    assert.deepEqual(e.cases, { total: 1, diamondsSpent: 299, byRarity: [{ rarity: 'rare', count: 1 }], byKind: [{ kind: 'weapon', count: 1, diamondsSpent: 299 }] });
    const d3 = e.daily.find((d) => d.day === '2026-04-03')!;
    assert.deepEqual(d3, { day: '2026-04-03', tokensIssued: 300, tokensSpent: 270, diamondsIssued: 0, diamondsSpent: 0, revenueCents: 0 });
    assert.equal(e.daily.find((d) => d.day === '2026-04-04')!.revenueCents, 499);
    const empty = await economy(db.sql, resolveRange('custom', '2020-01-01', '2020-01-02', NOW), NOW);
    assert.equal(empty.tokens.issuedTotal, 0);
    assert.deepEqual(empty.revenue.byCurrency, []);
    assert.equal(empty.tokens.circulating, 87, 'circulating balances are «now», independent of the period');
  });
});

describe('admin http: funnel, economy, grants and reset links', () => {
  let app: TestApp;
  let cookie: string;
  let csrf: string;
  let viewerCookie: string;
  let viewerCsrf: string;
  before(async () => {
    app = await startTestApp({ ADMIN_BOOTSTRAP_USERNAME: 'root', ADMIN_BOOTSTRAP_PASSWORD: 'correct-horse-battery-staple', PUBLIC_URL: 'https://blatkom.example' });
    const ok = await api(app.base, '/api/admin/login', { method: 'POST', body: { username: 'root', password: 'correct-horse-battery-staple' } });
    cookie = cookieFrom(ok.headers, ADMIN_COOKIE)!;
    csrf = ok.body.csrfToken;
    await api(app.base, '/api/admin/users', { method: 'POST', cookie, csrf, body: { username: 'olga', password: 'viewer-password-123', role: 'viewer' } });
    const v = await api(app.base, '/api/admin/login', { method: 'POST', body: { username: 'olga', password: 'viewer-password-123' } });
    viewerCookie = cookieFrom(v.headers, ADMIN_COOKIE)!;
    viewerCsrf = v.body.csrfToken;
  });
  after(async () => {
    await app.close();
  });

  test('funnel and economy need a session; viewers may read them', async () => {
    assert.equal((await api(app.base, '/api/admin/funnel?range=7d')).status, 401);
    assert.equal((await api(app.base, '/api/admin/economy?range=7d')).status, 401);
    const f = await api(app.base, '/api/admin/funnel?range=30d', { cookie: viewerCookie });
    assert.equal(f.status, 200, f.text);
    assert.equal(f.body.daily.length, 30);
    const e = await api(app.base, '/api/admin/economy?range=7d', { cookie: viewerCookie });
    assert.equal(e.status, 200, e.text);
    assert.equal(typeof e.body.tokens.circulating, 'number');
    assert.equal((await api(app.base, '/api/admin/economy?range=1y', { cookie })).status, 400);
  });

  test('grants: admin only, CSRF-protected, audited, written to the ledger and never below zero', async () => {
    const p = await devLogin(app.base, 'Pensioner');
    const body = { currency: 'diamonds', amount: 150, note: 'compensation for a lost match' };
    assert.equal((await api(app.base, `/api/admin/players/${p.userId}/grant`, { method: 'POST', cookie, body })).status, 403, 'no CSRF token');
    assert.equal((await api(app.base, `/api/admin/players/${p.userId}/grant`, { method: 'POST', cookie: viewerCookie, csrf: viewerCsrf, body })).status, 403, 'viewer');
    assert.equal((await api(app.base, `/api/admin/players/${p.userId}/grant`, { method: 'POST', cookie, csrf, body: { ...body, amount: 0 } })).status, 400);
    assert.equal((await api(app.base, `/api/admin/players/${p.userId}/grant`, { method: 'POST', cookie, csrf, body: { ...body, note: '' } })).status, 400, 'a reason is required');
    assert.equal((await api(app.base, `/api/admin/players/${randomUUID()}/grant`, { method: 'POST', cookie, csrf, body })).status, 404);
    const g = await api(app.base, `/api/admin/players/${p.userId}/grant`, { method: 'POST', cookie, csrf, body });
    assert.equal(g.status, 200, g.text);
    assert.equal(g.body.balance, 150);
    const neg = await api(app.base, `/api/admin/players/${p.userId}/grant`, { method: 'POST', cookie, csrf, body: { currency: 'diamonds', amount: -500, note: 'correction' } });
    assert.equal(neg.status, 409);
    const fix = await api(app.base, `/api/admin/players/${p.userId}/grant`, { method: 'POST', cookie, csrf, body: { currency: 'diamonds', amount: -50, note: 'correction' } });
    assert.equal(fix.body.balance, 100);
    const inv = await api(app.base, '/api/me/inventory', { token: p.token });
    assert.equal(inv.body.diamonds, 100, 'the player sees the new balance');
    const det = await api(app.base, `/api/admin/players/${p.userId}`, { cookie });
    assert.deepEqual(det.body.wallet, { tokens: 0, diamonds: 100 });
    assert.equal(det.body.ledger.length, 2);
    assert.equal(det.body.ledger[0].delta, -50);
    assert.equal(det.body.ledger[0].admin, 'root');
    assert.equal(det.body.ledger[1].ref, 'compensation for a lost match');
    const audits = await app.db.sql<Array<{ details: { amount: number } }>>`SELECT details FROM admin_audit_log WHERE action = 'balance_grant' AND target = ${p.userId} ORDER BY id`;
    assert.deepEqual(audits.map((a) => a.details.amount), [150, -50]);
  });

  test('reset links: only for players with an email; the link works once and is audited', async () => {
    const p = await devLogin(app.base, 'Forgetful');
    assert.equal((await api(app.base, `/api/admin/players/${p.userId}/reset-link`, { method: 'POST', cookie, csrf })).status, 404, 'no email yet');
    await api(app.base, '/api/auth/email/link', { method: 'POST', token: p.token, body: { email: 'forgetful@example.com', password: 'first-password' } });
    assert.equal((await api(app.base, `/api/admin/players/${p.userId}/reset-link`, { method: 'POST', cookie: viewerCookie, csrf: viewerCsrf })).status, 403);
    const r = await api(app.base, `/api/admin/players/${p.userId}/reset-link`, { method: 'POST', cookie, csrf });
    assert.equal(r.status, 200, r.text);
    assert.match(r.body.link, /^https:\/\/blatkom\.example\/\?reset=[A-Za-z0-9_-]{20,}$/);
    assert.ok(Date.parse(r.body.expiresAt) > Date.now());
    const token = new URL(r.body.link).searchParams.get('reset')!;
    assert.equal((await api(app.base, '/api/auth/email/reset', { method: 'POST', body: { token, password: 'second-password' } })).status, 200);
    assert.equal((await api(app.base, '/api/auth/email/reset', { method: 'POST', body: { token, password: 'third-password' } })).status, 400);
    assert.equal((await api(app.base, '/api/auth/email/login', { method: 'POST', body: { email: 'forgetful@example.com', password: 'second-password' } })).status, 200);
    const [a] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM admin_audit_log WHERE action = 'password_reset_link' AND target = ${p.userId}`;
    assert.equal(a!.n, 1);
    // the player card shows the address masked, and an exact email search finds the account
    const det = await api(app.base, `/api/admin/players/${p.userId}`, { cookie });
    assert.equal(det.body.account.emailMasked, 'f•••l@example.com');
    assert.ok(!det.text.includes('forgetful@example.com'), 'the full address never leaves the server');
    assert.deepEqual(det.body.account.signInMethods, ['dev', 'email']);
    const found = await api(app.base, `/api/admin/players?q=${encodeURIComponent('Forgetful@Example.com')}`, { cookie });
    assert.equal(found.body.total, 1);
    assert.equal(found.body.rows[0].id, p.userId);
    assert.equal((await api(app.base, `/api/admin/players?q=${encodeURIComponent('nobody@example.com')}`, { cookie })).body.total, 0);
  });

  test('visitor funnel: a sign-up that overtakes its own visit ping is still linked; Telegram sign-ups too', async () => {
    const guestOn = await startTestApp({ GUEST_AUTH_ENABLED: true });
    try {
      const vid = 'race_visitor_0123456789';
      const g = await api(guestOn.base, '/api/auth/guest', { method: 'POST', body: { name: 'Racer', deviceId: 'device_race_0123456789abcdef', visitorId: vid } });
      assert.equal(g.status, 200, g.text);
      await api(guestOn.base, '/api/visit', { method: 'POST', body: { visitorId: vid, platform: 'browser_mobile' } });
      const [row] = await guestOn.db.sql<Array<{ user_id: string }>>`SELECT user_id FROM visitors WHERE visitor_id = ${vid}`;
      assert.equal(row!.user_id, g.body.profile.id);
      const tvid = 'tg_visitor_0123456789ab';
      await api(guestOn.base, '/api/visit', { method: 'POST', body: { visitorId: tvid, platform: 'telegram_ios' } });
      const init = signInitData({ user: JSON.stringify({ id: 777001, first_name: 'Garik' }), auth_date: String(Math.floor(Date.now() / 1000)) }, TEST_BOT_TOKEN);
      const t = await api(guestOn.base, '/api/auth/telegram', { method: 'POST', body: { initData: init, platform: 'telegram_ios', visitorId: tvid } });
      assert.equal(t.status, 200, t.text);
      const [trow] = await guestOn.db.sql<Array<{ user_id: string }>>`SELECT user_id FROM visitors WHERE visitor_id = ${tvid}`;
      assert.equal(trow!.user_id, t.body.profile.id);
      // a returning player never re-links a visitor id
      const again = await api(guestOn.base, '/api/auth/telegram', { method: 'POST', body: { initData: init, visitorId: 'other_visitor_012345' } });
      assert.equal(again.body.isNew, false);
      const [none] = await guestOn.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM visitors WHERE visitor_id = 'other_visitor_012345'`;
      assert.equal(none!.n, 0);
    } finally {
      await guestOn.close();
    }
  });
});
