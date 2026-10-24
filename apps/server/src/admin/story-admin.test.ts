/**
 * v0.2.16: an administrator opens the story up to a mission for a player (to check the later chapters
 * without playing it all through). Admin only, CSRF-protected, audited; the missions before count as done
 * with a best time of 0 and pay nothing; the chosen mission opens; a real run of an opened mission keeps
 * its real time and pays nothing; the chapter's reward still comes with the chapter's last mission.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { STORY_MIN_MS, STORY_OPENED_BEST_MS } from '@blatkom/shared';
import type { StoryDone, StoryReward } from '@blatkom/shared';
import { startTestApp, api, cookieFrom, devLogin } from './testkit.js';
import type { TestApp } from './testkit.js';
import { ADMIN_COOKIE } from './auth.js';
import { signToken } from '../security/signed.js';

describe('admin: open the story up to a mission (v0.2.16)', () => {
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

  /** A mission reported done as the game does it, with a ticket dated back past the shortest time. */
  const finish = (token: string, userId: string, mission: string, ms = 61_000) =>
    api<StoryReward>(app.base, '/api/story/complete', { method: 'POST', token, body: { ticket: signToken(app.env.SESSION_SECRET, 'story', { u: userId, m: mission, t: Date.now() - STORY_MIN_MS - 120_000, r: 'test' }), ms, kills: 2, deaths: 0 } });
  const wallet = async (userId: string) => (await app.db.sql<Array<{ tokens: number; xp: number }>>`SELECT tokens, xp FROM profiles WHERE user_id = ${userId}`)[0]!;

  test('admin only, CSRF-protected, a real written mission, a real player', async () => {
    const p = await devLogin(app.base, 'Story Checker');
    const url = `/api/admin/players/${p.userId}/story-open`;
    const body = { mission: 'a12' };
    assert.equal((await api(app.base, url, { method: 'POST', body })).status, 401, 'no session');
    assert.equal((await api(app.base, url, { method: 'POST', cookie, body })).status, 403, 'no CSRF token');
    assert.equal((await api(app.base, url, { method: 'POST', cookie: viewerCookie, csrf: viewerCsrf, body })).status, 403, 'a viewer');
    assert.equal((await api(app.base, url, { method: 'POST', cookie, csrf, body: { mission: 'zz9' } })).status, 400, 'no such mission');
    assert.equal((await api(app.base, url, { method: 'POST', cookie, csrf, body: { mission: 'a12', extra: true } })).status, 400, 'nothing else in the body');
    assert.equal((await api(app.base, `/api/admin/players/${randomUUID()}/story-open`, { method: 'POST', cookie, csrf, body })).status, 404);
    assert.equal((await api(app.base, '/api/admin/players/not-a-uuid/story-open', { method: 'POST', cookie, csrf, body })).status, 400);
    assert.deepEqual((await api(app.base, '/api/story', { token: p.token })).body, { done: [] }, 'nothing changed');
  });

  test('the missions before count as done, nothing is paid; the chosen one opens; the other campaign is untouched', async () => {
    const p = await devLogin(app.base, 'Story Reviewer');
    const w0 = await wallet(p.userId);
    const url = `/api/admin/players/${p.userId}/story-open`;
    const r = await api<{ opened: string[]; done: StoryDone[] }>(app.base, url, { method: 'POST', cookie, csrf, body: { mission: 'a12' } });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.body.opened, ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11']);
    assert.ok(r.body.done.every((d) => d.bestMs === STORY_OPENED_BEST_MS && d.completions === 1));
    // again: nothing new
    const again = await api<{ opened: string[] }>(app.base, url, { method: 'POST', cookie, csrf, body: { mission: 'a12' } });
    assert.deepEqual(again.body.opened, []);
    // nothing paid: no story talons, no experience, no chapter achievements, no story items
    assert.deepEqual(await wallet(p.userId), w0);
    const [led] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM currency_ledger WHERE user_id = ${p.userId} AND reason = 'story'`;
    const [ach] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM player_achievements WHERE user_id = ${p.userId} AND achievement_id LIKE 'story_%'`;
    const [items] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM user_items WHERE user_id = ${p.userId} AND source = 'story'`;
    assert.deepEqual([led!.n, ach!.n, items!.n], [0, 0, 0]);
    // the player sees them done; a12 starts; «The Report» still starts at b1
    const done = (await api<{ done: StoryDone[] }>(app.base, '/api/story', { token: p.token })).body.done;
    assert.equal(done.length, 11);
    assert.equal((await api(app.base, '/api/story/start', { method: 'POST', token: p.token, body: { mission: 'a12' } })).status, 200);
    assert.equal((await api(app.base, '/api/story/start', { method: 'POST', token: p.token, body: { mission: 'b2' } })).status, 403);
    // audited, both calls
    const audits = await app.db.sql<Array<{ details: { mission: string; opened: string[] } }>>`SELECT details FROM admin_audit_log WHERE action = 'story_opened' AND target = ${p.userId} ORDER BY id`;
    assert.deepEqual(audits.map((a) => [a.details.mission, a.details.opened.length]), [['a12', 11], ['a12', 0]]);
    // the dashboard's player card shows the story
    const det = await api(app.base, `/api/admin/players/${p.userId}`, { cookie: viewerCookie });
    assert.equal(det.status, 200, det.text);
    assert.equal(det.body.story.length, 11);
  });

  test('a real run of an opened mission keeps its real time and pays nothing; the chapter’s last mission pays the chapter', async () => {
    const p = await devLogin(app.base, 'Story Finisher');
    await api(app.base, `/api/admin/players/${p.userId}/story-open`, { method: 'POST', cookie, csrf, body: { mission: 'a12' } });
    const w0 = await wallet(p.userId);
    const replay = await finish(p.token, p.userId, 'a11', 64_000);
    assert.equal(replay.status, 200, replay.text);
    assert.deepEqual([replay.body.first, replay.body.talons, replay.body.xp], [false, 0, 0]);
    const a11 = replay.body.done.find((d) => d.id === 'a11')!;
    assert.deepEqual([a11.bestMs, a11.completions], [64_000, 2], 'the real time replaces the opened mark');
    assert.deepEqual(await wallet(p.userId), w0);
    // the chapter's last mission, played for real: its own reward and chapter 3's
    const last = await finish(p.token, p.userId, 'a12', 70_000);
    assert.equal(last.status, 200, last.text);
    assert.equal(last.body.first, true);
    assert.equal(last.body.achievement, 'story_petya_3');
    assert.deepEqual(last.body.characters, ['golub']);
    assert.equal(last.body.talons, 190 + 700);
    // the earlier chapters' rewards were not paid (their missions were opened, not played)
    const ach = await app.db.sql<Array<{ achievement_id: string }>>`SELECT achievement_id FROM player_achievements WHERE user_id = ${p.userId} AND achievement_id LIKE 'story_%' ORDER BY achievement_id`;
    assert.deepEqual(ach.map((a) => a.achievement_id), ['story_petya_3']);
  });
});
