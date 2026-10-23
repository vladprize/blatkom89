/**
 * V2.0 part F against PostgreSQL: the first touch and partner links (measured only).
 * Sign-ups keep how they came — a partner's link (in the browser and as Telegram's signed start
 * parameter), a player's referral link (beats a campaign), a room invitation, a campaign, another site,
 * Telegram, direct; a switched-off partner counts for nothing; an existing account is never re-labelled.
 * The first visit keeps its partner and campaign. Partners: admins only (CSRF, audited, codes unique),
 * the numbers per link. /api/admin/growth: registrations, unique players, first matches, sources, first
 * visits, invitations and their conversion, levels, the Kon, $BLAT issued; the overview's new numbers;
 * the CSV exports (admins only, formula-safe).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AdminGrowth, AdminOverview, AdminPartnerRow, AuthResponse } from '@blatkom/shared';
import { startTestApp, api, devLogin, cookieFrom, TEST_BOT_TOKEN } from '../admin/testkit.js';
import type { TestApp } from '../admin/testkit.js';
import { ADMIN_COOKIE } from '../admin/auth.js';
import { signInitData } from '../auth/telegram.js';

let app: TestApp;
let cookie: string;
let csrf: string;
before(async () => {
  app = await startTestApp({ ADMIN_BOOTSTRAP_USERNAME: 'root', ADMIN_BOOTSTRAP_PASSWORD: 'correct-horse-battery-staple', GUEST_AUTH_ENABLED: true, GUEST_SIGNUPS_PER_IP_HOUR: 100 });
  const login = await api(app.base, '/api/admin/login', { method: 'POST', body: { username: 'root', password: 'correct-horse-battery-staple' } });
  cookie = cookieFrom(login.headers, ADMIN_COOKIE)!;
  csrf = login.body.csrfToken as string;
});
after(async () => {
  await app.close();
});

const guest = (name: string, extra: Record<string, unknown> = {}) =>
  api<AuthResponse>(app.base, '/api/auth/guest', { method: 'POST', body: { name, deviceId: randomBytes(16).toString('hex'), ...extra } });
const telegram = (id: number, startParam?: string, extra: Record<string, unknown> = {}) =>
  api<AuthResponse>(app.base, '/api/auth/telegram', {
    method: 'POST',
    body: { initData: signInitData({ user: JSON.stringify({ id, first_name: 'Src' }), auth_date: String(Math.floor(Date.now() / 1000)), ...(startParam ? { start_param: startParam } : {}) }, TEST_BOT_TOKEN), ...extra },
  });
const source = async (userId: string) =>
  (await app.db.sql<Array<{ source_channel: string | null; source_detail: string | null; partner: string | null }>>`
    SELECT u.source_channel, u.source_detail, p.code AS partner FROM users u LEFT JOIN partners p ON p.id = u.partner_id WHERE u.id = ${userId}`)[0]!;

let ids: Record<string, string> = {};

test('partners: admins create them (CSRF, audited, unique codes, a code from the name), viewers and players can’t; switching off', async () => {
  assert.equal((await api(app.base, '/api/admin/partners', { method: 'POST', cookie, body: { name: 'Streamer One', code: 'streamer_one' } })).status, 403, 'CSRF');
  const made = await api<{ id: string; code: string }>(app.base, '/api/admin/partners', { method: 'POST', cookie, csrf, body: { name: 'Streamer One', code: 'streamer_one', note: 'TikTok, October' } });
  assert.equal(made.status, 201, made.text);
  assert.equal(made.body.code, 'streamer_one');
  assert.equal((await api(app.base, '/api/admin/partners', { method: 'POST', cookie, csrf, body: { name: 'Again', code: 'streamer_one' } })).status, 409, 'codes are unique');
  assert.equal((await api(app.base, '/api/admin/partners', { method: 'POST', cookie, csrf, body: { name: 'Bad', code: 'Not Valid!' } })).status, 400);
  const auto = await api<{ id: string; code: string }>(app.base, '/api/admin/partners', { method: 'POST', cookie, csrf, body: { name: '=Formula Fan' } });
  assert.equal(auto.status, 201);
  assert.equal(auto.body.code, 'formula_fan', 'a code from the name');
  const off = await api<{ id: string; code: string }>(app.base, '/api/admin/partners', { method: 'POST', cookie, csrf, body: { name: 'Gone Channel', code: 'gone_channel' } });
  assert.equal((await api(app.base, `/api/admin/partners/${off.body.id}`, { method: 'POST', cookie, csrf, body: { active: false } })).status, 200);
  ids = { streamer: made.body.id, formula: auto.body.id, gone: off.body.id };
  const player = await devLogin(app.base, 'Partner Peeker');
  assert.equal((await api(app.base, '/api/admin/partners', { token: player.token })).status, 401, 'players never');
  const viewer = await api(app.base, '/api/admin/users', { method: 'POST', cookie, csrf, body: { username: 'growthviewer', password: 'viewer-password-123456', role: 'viewer' } });
  assert.equal(viewer.status, 201);
  const vl = await api(app.base, '/api/admin/login', { method: 'POST', body: { username: 'growthviewer', password: 'viewer-password-123456' } });
  const vcookie = cookieFrom(vl.headers, ADMIN_COOKIE)!;
  assert.equal((await api(app.base, '/api/admin/partners', { cookie: vcookie })).status, 200, 'viewers read');
  assert.equal((await api(app.base, '/api/admin/partners', { method: 'POST', cookie: vcookie, csrf: vl.body.csrfToken, body: { name: 'Nope' } })).status, 403, 'viewers don’t create');
  assert.equal((await api(app.base, '/api/admin/export/partners.csv', { cookie: vcookie })).status, 403, 'exports are for admins');
  const audits = await app.db.sql<Array<{ action: string }>>`SELECT action FROM admin_audit_log WHERE action LIKE 'partner_%' ORDER BY id`;
  assert.deepEqual(audits.map((a) => a.action), ['partner_created', 'partner_created', 'partner_created', 'partner_updated']);
});

test('the first touch: sign-ups keep how they came (precedence, Telegram’s start parameter, a switched-off partner), the first visit keeps its partner and campaign', async () => {
  const visitor = randomBytes(10).toString('hex');
  assert.equal((await api(app.base, '/api/visit', { method: 'POST', body: { visitorId: visitor, platform: 'browser_mobile', source: { partner: 'streamer_one', utmSource: 'tiktok', utmMedium: 'video' } } })).status, 204);
  const p1 = await guest('Partner Kid', { visitorId: visitor, source: { partner: 'STREAMER_ONE', utmSource: 'tiktok' } });
  assert.equal(p1.status, 200, p1.text);
  assert.deepEqual(await source(p1.body.profile.id), { source_channel: 'partner', source_detail: 'streamer_one', partner: 'streamer_one' });
  const [v] = await app.db.sql<Array<{ utm_source: string; utm_medium: string; code: string; user_id: string }>>`
    SELECT v.utm_source, v.utm_medium, p.code, v.user_id FROM visitors v LEFT JOIN partners p ON p.id = v.partner_id WHERE v.visitor_id = ${visitor}`;
  assert.deepEqual([v!.utm_source, v!.utm_medium, v!.code, v!.user_id], ['tiktok', 'video', 'streamer_one', p1.body.profile.id]);
  // a later visit with another campaign changes nothing
  await api(app.base, '/api/visit', { method: 'POST', body: { visitorId: visitor, source: { utmSource: 'youtube' } } });
  assert.equal((await app.db.sql<Array<{ utm_source: string }>>`SELECT utm_source FROM visitors WHERE visitor_id = ${visitor}`)[0]!.utm_source, 'tiktok');

  const u1 = await guest('Campaign Kid', { source: { utmSource: 'reddit', utmMedium: 'post', utmCampaign: 'launch' } });
  assert.deepEqual(await source(u1.body.profile.id), { source_channel: 'utm', source_detail: 'reddit / post / launch', partner: null });
  const r1 = await guest('Forum Kid', { source: { referrer: 'pikabu.ru' } });
  assert.deepEqual(await source(r1.body.profile.id), { source_channel: 'referrer', source_detail: 'pikabu.ru', partner: null });
  const d1 = await guest('Direct Kid');
  assert.deepEqual(await source(d1.body.profile.id), { source_channel: 'direct', source_detail: null, partner: null });
  const i1 = await guest('Invited Kid', { source: { invite: true, referrer: 'vk.com' } });
  assert.equal((await source(i1.body.profile.id)).source_channel, 'invite', 'a room invitation beats another site');
  // a player's referral link beats a campaign
  const inviter = await devLogin(app.base, 'Source Inviter');
  const [code] = await app.db.sql<Array<{ ref_code: string }>>`SELECT ref_code FROM users WHERE id = ${inviter.userId}`;
  let ref = code?.ref_code;
  if (!ref) {
    ref = 'SRCINV22';
    await app.db.sql`UPDATE users SET ref_code = ${ref} WHERE id = ${inviter.userId}`;
  }
  const f1 = await guest('Friend Kid', { ref, source: { utmSource: 'tiktok' } });
  assert.equal((await source(f1.body.profile.id)).source_channel, 'referral');
  // a switched-off partner counts for nothing
  const g1 = await guest('Late Kid', { source: { partner: 'gone_channel', referrer: 'youtube.com' } });
  assert.deepEqual(await source(g1.body.profile.id), { source_channel: 'referrer', source_detail: 'youtube.com', partner: null });
  // Telegram: the partner and the room come from the signed start parameter
  const t1 = await telegram(7710001, 'p_streamer_one');
  assert.deepEqual(await source(t1.body.profile.id), { source_channel: 'partner', source_detail: 'streamer_one', partner: 'streamer_one' });
  const t2 = await telegram(7710002, 'AbCdEfGh');
  assert.equal((await source(t2.body.profile.id)).source_channel, 'invite');
  const t3 = await telegram(7710003);
  assert.equal((await source(t3.body.profile.id)).source_channel, 'telegram');
  // an existing account is never re-labelled
  const again = await telegram(7710003, 'p_streamer_one');
  assert.equal(again.body.isNew, false);
  assert.equal((await source(t3.body.profile.id)).source_channel, 'telegram');
  ids = { ...ids, p1: p1.body.profile.id, u1: u1.body.profile.id, d1: d1.body.profile.id, i1: i1.body.profile.id, t1: t1.body.profile.id, inviter: inviter.userId, f1: f1.body.profile.id };
  // malformed first touches are refused
  assert.equal((await guest('Bad Touch', { source: { partner: 'x' } })).status, 400);
  assert.equal((await guest('Bad Touch', { source: { referrer: 'http://evil/' } })).status, 400);
});

test('/api/admin/growth: unique players, first matches, sources, first visits, invitations, levels, the Kon, $BLAT; partners’ numbers; the overview; CSV', async () => {
  const now = Date.now();
  // matches: p1 (the partner's) played a whole match; t1 played by invitation; a Kon 2×2 between u1, d1, i1 and f1
  const match = async (people: Array<{ id: string; viaInvite?: boolean; completed?: boolean }>, kon: string | null = null) => {
    const id = randomUUID();
    await app.db.sql`INSERT INTO matches (id, room_id, map_id, mode, is_private, status, started_at, ended_at, duration_ms, end_reason, player_count, results_processed_at, kon_format)
                     VALUES (${id}, 'growthroom', 'factory', ${kon ? 'teams' : 'ffa'}, true, 'completed', ${new Date(now - 300_000)}, ${new Date(now - 60_000)}, 240000, 'time', ${people.length}, now(), ${kon})`;
    for (const p of people)
      await app.db.sql`INSERT INTO match_participants (match_id, user_id, character, place, kills, deaths, score, damage_dealt, completed, won, via_invite, joined_at)
                       VALUES (${id}, ${p.id}, 'petya', 1, 1, 1, 2, 100, ${p.completed !== false}, false, ${!!p.viaInvite}, ${new Date(now - 300_000)})`;
  };
  await match([{ id: ids.p1! }]);
  await match([{ id: ids.t1!, viaInvite: true }, { id: ids.inviter! }]);
  await match([{ id: ids.u1! }, { id: ids.d1! }, { id: ids.i1! }, { id: ids.f1!, completed: false }], '2x2');
  // invitations: two created, one opened, one lobby join by invitation
  const ev = async (name: string, userId: string | null, props: Record<string, unknown>) =>
    app.db.sql`INSERT INTO analytics_events (id, name, source, user_id, occurred_at, props) VALUES (${randomUUID()}, ${name}, ${name === 'invite_opened' ? 'client' : 'server'}, ${userId}, now(), ${app.db.sql.json(props as never)})`;
  await ev('invite_created', ids.inviter!, { code: 'AAAA1111', roomId: 'growthroom' });
  await ev('invite_created', ids.inviter!, { code: 'BBBB2222', roomId: 'growthroom2' });
  await ev('invite_opened', ids.t1!, { code: 'AAAA1111', result: 'joinable' });
  await ev('lobby_joined', ids.t1!, { roomId: 'growthroom', viaInvite: true });
  await ev('lobby_joined', ids.inviter!, { roomId: 'growthroom', viaInvite: false });
  // the friend's referral is counted
  await app.db.sql`UPDATE referrals SET status = 'confirmed', decided_at = now() WHERE referee_id = ${ids.f1!}`;
  // a level reached in the period
  await app.db.sql`UPDATE profiles SET level = 12, xp = 9000 WHERE user_id = ${ids.p1!}`;
  await app.db.sql`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref) VALUES (${ids.p1!}, 'blat', 750, 1050, 'level', 'level:12')`;

  const g = await api<AdminGrowth>(app.base, '/api/admin/growth?range=7d', { cookie });
  assert.equal(g.status, 200, g.text);
  const [acc] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM users WHERE created_at > now() - interval '1 hour'`;
  assert.equal(g.body.players.registered, acc!.n);
  assert.equal(g.body.players.unique, 7, 'everyone who played (p1, t1, the inviter, u1, d1, i1, f1)');
  assert.equal(g.body.players.firstMatch, 7);
  assert.equal(g.body.players.completedMatches, 3);
  const row = (channel: string, detail: string | null = null) => g.body.sources.find((x) => x.channel === channel && x.detail === detail);
  assert.deepEqual(row('partner', 'streamer_one'), { channel: 'partner', detail: 'streamer_one', accounts: 2, firstMatch: 2, completed: 2, returned: 0 }, 'the browser’s and the Telegram one');
  assert.deepEqual([row('utm', 'reddit / post / launch')?.accounts, row('utm', 'reddit / post / launch')?.completed], [1, 1]);
  assert.equal(row('referral')?.completed, 0, 'the friend left the Kon match');
  assert.ok(g.body.visits.some((x) => x.kind === 'partner' && x.key === 'streamer_one' && x.visitors === 1 && x.registered === 1));
  assert.deepEqual(
    [g.body.invites.roomInvites, g.body.invites.opened, g.body.invites.joinedLobby, g.body.invites.played, g.body.invites.newPlayers, g.body.invites.conversion],
    [2, 1, 1, 1, 1, 0.5],
  );
  assert.deepEqual([g.body.invites.referralAttached, g.body.invites.referralConfirmed, g.body.invites.referralConversion], [1, 1, 1]);
  const levelTotal = g.body.levels.buckets.reduce((a, b) => a + b.players, 0);
  const [all] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM profiles p JOIN users u ON u.id = p.user_id WHERE u.merged_at IS NULL AND u.deleted_at IS NULL`;
  assert.equal(levelTotal, all!.n, 'every account is in a level bucket');
  assert.equal(g.body.levels.buckets.find((b) => b.bucket === '10–19')?.players, 1);
  assert.equal(g.body.levels.max, 12);
  assert.ok(g.body.levels.reached.some((x) => x.level === 12 && x.players === 1));
  assert.deepEqual([g.body.kon.matches, g.body.kon.players, g.body.kon.byFormat.find((x) => x.format === '2x2')?.matches], [1, 4, 1]);
  const [issued] = await app.db.sql<Array<{ n: number }>>`SELECT COALESCE(sum(delta), 0)::int AS n FROM currency_ledger WHERE currency = 'blat' AND delta > 0`;
  assert.equal(g.body.blat.issued, issued!.n);
  assert.ok(g.body.blat.fromLevels >= 750 && g.body.blat.fromLevels + g.body.blat.fromReferrals === g.body.blat.issued);

  const partners = await api<AdminPartnerRow[]>(app.base, '/api/admin/partners?range=7d', { cookie });
  const one = partners.body.find((x) => x.code === 'streamer_one')!;
  assert.deepEqual([one.visitors, one.accounts, one.firstMatch, one.completed, one.matches, one.active], [1, 2, 2, 2, 2, true]);
  assert.equal(one.webUrl, 'http://127.0.0.1:8080/?p=streamer_one');
  assert.equal(one.telegramUrl, 'https://t.me/blatkom_test_bot?start=p_streamer_one');
  assert.equal(partners.body.find((x) => x.code === 'gone_channel')?.active, false);

  const o = await api<AdminOverview>(app.base, '/api/admin/overview?range=7d', { cookie });
  assert.deepEqual([o.body.uniquePlayers, o.body.firstMatchPlayers, o.body.blatIssued], [7, 7, issued!.n]);

  const csv = await api(app.base, '/api/admin/export/partners.csv?range=7d', { cookie });
  assert.equal(csv.status, 200);
  assert.ok(csv.text.includes('streamer_one,Streamer One,true,'), 'the partner’s line');
  assert.ok(csv.text.includes(`'=Formula Fan`), 'a formula-looking name is neutralised');
  const src = await api(app.base, '/api/admin/export/sources.csv?range=7d', { cookie });
  assert.equal(src.status, 200);
  assert.ok(src.text.includes('accounts,partner,streamer_one,,2,2,2,0'), src.text);
  assert.ok(src.text.includes('first_visits,partner,streamer_one,1,1'));
  const audits = await app.db.sql<Array<{ action: string }>>`SELECT action FROM admin_audit_log WHERE action IN ('export_partners', 'export_sources') ORDER BY id`;
  assert.deepEqual(audits.map((a) => a.action), ['export_partners', 'export_sources']);
  // the account page tells where the player came from
  const detail = await api(app.base, `/api/admin/players/${ids.p1}`, { cookie });
  assert.deepEqual(detail.body.origin, { channel: 'partner', detail: 'streamer_one', partner: 'streamer_one', mergedInto: null, mergedAt: null, mergedFrom: 0 });
});
