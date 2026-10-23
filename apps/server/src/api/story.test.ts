/**
 * Story mode API (v0.3 part 4) against PostgreSQL: open missions only, signed tickets, the shortest
 * time, one payment per mission, the chapter's achievement with its talons, skin and character (paid in
 * talons when already owned), retries and concurrent reports paying once, account deletion.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { STORY_MIN_MS, storyChapter } from '@blatkom/shared';
import type { StoryReward } from '@blatkom/shared';
import { startTestApp, api, devLogin } from '../admin/testkit.js';
import type { TestApp } from '../admin/testkit.js';
import { signToken } from '../security/signed.js';

let app: TestApp;
before(async () => {
  app = await startTestApp();
});
after(async () => {
  await app.close();
});

/** A ticket as /start makes it, dated back so the shortest time has passed. */
const ticket = (userId: string, mission: string, agoMs = STORY_MIN_MS + 120_000) => signToken(app.env.SESSION_SECRET, 'story', { u: userId, m: mission, t: Date.now() - agoMs, r: 'test' });

async function finish(token: string, userId: string, mission: string, ms = 61_000) {
  return api<StoryReward>(app.base, '/api/story/complete', { method: 'POST', token, body: { ticket: ticket(userId, mission), ms, kills: 3, deaths: 0 } });
}

async function tokensOf(userId: string) {
  const [r] = await app.db.sql<Array<{ tokens: number; xp: number }>>`SELECT tokens, xp FROM profiles WHERE user_id = ${userId}`;
  return r!;
}

test('story: only open missions start; a ticket is needed, from this account, and no sooner than the shortest time', async () => {
  const u = await devLogin(app.base, 'Story Starter');
  assert.deepEqual((await api(app.base, '/api/story', { token: u.token })).body, { done: [] });
  assert.equal((await api(app.base, '/api/story/start', { method: 'POST', token: u.token, body: { mission: 'a2' } })).status, 403, 'a2 before a1');
  assert.equal((await api(app.base, '/api/story/start', { method: 'POST', token: u.token, body: { mission: 'zz9' } })).status, 404);
  assert.equal((await api(app.base, '/api/story/start', { method: 'POST', body: { mission: 'a1' } })).status, 401);
  const s = await api<{ ticket: string }>(app.base, '/api/story/start', { method: 'POST', token: u.token, body: { mission: 'a1' } });
  assert.equal(s.status, 200, s.text);
  const quick = await api(app.base, '/api/story/complete', { method: 'POST', token: u.token, body: { ticket: s.body.ticket, ms: 1000, kills: 3, deaths: 0 } });
  assert.deepEqual([quick.status, quick.body.error?.code], [409, 'too_fast']);
  const other = await devLogin(app.base, 'Story Other');
  assert.equal((await api(app.base, '/api/story/complete', { method: 'POST', token: other.token, body: { ticket: ticket(u.userId, 'a1'), ms: 9000, kills: 0, deaths: 0 } })).status, 403, 'someone else’s ticket');
  const forged = ticket(u.userId, 'a1').replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
  assert.equal((await api(app.base, '/api/story/complete', { method: 'POST', token: u.token, body: { ticket: forged, ms: 9000, kills: 0, deaths: 0 } })).status, 403, 'a forged ticket');
  const stale = signToken(app.env.SESSION_SECRET, 'story', { u: u.userId, m: 'a1', t: Date.now() - 4 * 3600_000 });
  assert.equal((await api(app.base, '/api/story/complete', { method: 'POST', token: u.token, body: { ticket: stale, ms: 9000, kills: 0, deaths: 0 } })).status, 403, 'an old ticket');
  const wrongKind = signToken(app.env.SESSION_SECRET, 'intent', { u: u.userId, m: 'a1', t: Date.now() - 30_000 });
  assert.equal((await api(app.base, '/api/story/complete', { method: 'POST', token: u.token, body: { ticket: wrongKind, ms: 9000, kills: 0, deaths: 0 } })).status, 403, 'a token made for something else');
});

test('story: the first completion pays once; later runs keep the best time', async () => {
  const u = await devLogin(app.base, 'Story Payee');
  const before = await tokensOf(u.userId);
  const r = await finish(u.token, u.userId, 'a1', 70_000);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.body.first, r.body.talons, r.body.xp, r.body.achievement], [true, 60, 40, null]);
  const after = await tokensOf(u.userId);
  assert.deepEqual([after.tokens - before.tokens, after.xp - before.xp], [60, 40]);
  assert.equal(r.body.tokens, after.tokens);
  const again = await finish(u.token, u.userId, 'a1', 50_000);
  assert.deepEqual([again.body.first, again.body.talons, again.body.xp], [false, 0, 0]);
  assert.equal((await tokensOf(u.userId)).tokens, after.tokens, 'nothing more');
  const done = (await api(app.base, '/api/story', { token: u.token })).body.done;
  assert.deepEqual(done.map((d: { id: string; bestMs: number; completions: number }) => [d.id, d.bestMs, d.completions]), [['a1', 50_000, 2]]);
  const ledger = await app.db.sql<Array<{ delta: number; ref: string }>>`SELECT delta, ref FROM currency_ledger WHERE user_id = ${u.userId} AND reason = 'story'`;
  assert.deepEqual(ledger.map((l) => [l.delta, l.ref]), [[60, 'story:a1']]);
  // the next one opens
  assert.equal((await api(app.base, '/api/story/start', { method: 'POST', token: u.token, body: { mission: 'a2' } })).status, 200);
});

test('story: finishing chapter 1 of «My Yard» — the achievement, 500 talons and the Khokhloma crowbar', async () => {
  const u = await devLogin(app.base, 'Story Commandant');
  const ch = storyChapter('petya', 1)!;
  const blatSum = async () => (await app.db.sql<Array<{ s: number | null }>>`SELECT sum(delta)::int AS s FROM currency_ledger WHERE user_id = ${u.userId} AND currency = 'blat' AND reason = 'level'`)[0]!.s ?? 0;
  const blatBefore = await blatSum();
  let last!: StoryReward;
  let blatGained = 0;
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) {
    const r = await finish(u.token, u.userId, id);
    assert.equal(r.status, 200, `${id}: ${r.text}`);
    last = r.body;
    blatGained += last.blatGained;
    if (id !== 'a5') assert.equal(last.achievement, null);
  }
  // V2.0: the levels the story's experience reached (400 XP → level 3) pay their $BLAT, each level once
  assert.equal(last.level, 3);
  const levels = await app.db.sql<Array<{ ref: string }>>`SELECT ref FROM currency_ledger WHERE user_id = ${u.userId} AND currency = 'blat' AND reason = 'level' ORDER BY ref`;
  assert.deepEqual(levels.map((l) => l.ref), ['level:1', 'level:2', 'level:3']);
  assert.equal(blatGained, (await blatSum()) - blatBefore, 'the responses show what the ledger got');
  assert.ok(blatGained >= 350 + 400, `levels 2 and 3 at least (${blatGained})`);
  assert.equal(last.achievement, 'story_petya_1');
  assert.equal(last.talons, 120 + ch.talons);
  assert.deepEqual(last.skins, ['montirovka.hohloma']);
  assert.equal(last.xp, 80 + 100);
  const [item] = await app.db.sql<Array<{ source: string }>>`SELECT source FROM user_items WHERE user_id = ${u.userId} AND kind = 'skin' AND item_id = 'montirovka.hohloma'`;
  assert.equal(item?.source, 'story');
  const ach = await app.db.sql`SELECT 1 FROM player_achievements WHERE user_id = ${u.userId} AND achievement_id = 'story_petya_1'`;
  assert.equal(ach.length, 1);
  const total = await app.db.sql<Array<{ s: number }>>`SELECT sum(delta)::int AS s FROM currency_ledger WHERE user_id = ${u.userId} AND reason = 'story'`;
  assert.equal(total[0]!.s, 60 + 80 + 90 + 100 + 120 + 500);
  // the achievement shows in the profile
  const achievements = (await api(app.base, '/api/me/achievements', { token: u.token })).body.achievements as Array<{ id: string; unlockedAt: string | null }>;
  assert.ok(achievements.find((a) => a.id === 'story_petya_1')?.unlockedAt);
  assert.equal(achievements.find((a) => a.id === 'story_uchastkovy_1')?.unlockedAt, null);
});

test('story: «The Report» chapter 1 gives Uchastkovy — paid in talons when he is already bought', async () => {
  const fresh = await devLogin(app.base, 'Story Rookie');
  for (const id of ['b1', 'b2', 'b3', 'b4']) assert.equal((await finish(fresh.token, fresh.userId, id)).status, 200);
  const r = await finish(fresh.token, fresh.userId, 'b5');
  assert.deepEqual([r.body.achievement, r.body.characters, r.body.compensated], ['story_uchastkovy_1', ['uchastkovy'], []]);
  const inv = (await api(app.base, '/api/me/inventory', { token: fresh.token })).body;
  assert.ok(JSON.stringify(inv).includes('uchastkovy'), 'the character is in the inventory');

  const owner = await devLogin(app.base, 'Story Owner');
  await app.db.sql`INSERT INTO user_items (user_id, item_id, kind, source) VALUES (${owner.userId}, 'uchastkovy', 'character', 'tokens')`;
  for (const id of ['b1', 'b2', 'b3', 'b4']) await finish(owner.token, owner.userId, id);
  const o = await finish(owner.token, owner.userId, 'b5');
  assert.deepEqual(o.body.characters, []);
  assert.deepEqual(o.body.compensated, [{ kind: 'character', id: 'uchastkovy', talons: 150 }]);
  assert.equal(o.body.talons, 120 + 500 + 150);
});

test('story: two reports of the same first completion at once pay once; deleting the account deletes the progress', async () => {
  const u = await devLogin(app.base, 'Story Twice');
  const [x, y] = await Promise.all([finish(u.token, u.userId, 'b1'), finish(u.token, u.userId, 'b1')]);
  assert.equal(x.status, 200, x.text);
  assert.equal(y.status, 200, y.text);
  assert.deepEqual([x.body.first, y.body.first].sort(), [false, true]);
  const rows = await app.db.sql`SELECT 1 FROM currency_ledger WHERE user_id = ${u.userId} AND reason = 'story'`;
  assert.equal(rows.length, 1);
  assert.equal((await api(app.base, '/api/me', { method: 'DELETE', token: u.token })).status, 200);
  assert.equal((await app.db.sql`SELECT 1 FROM story_progress WHERE user_id = ${u.userId}`).length, 0);
});
