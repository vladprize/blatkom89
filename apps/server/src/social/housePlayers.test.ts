import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { isNick, levelForXp } from '@blatkom/shared';
import { startTestApp, api, devLogin } from '../admin/testkit.js';
import type { TestApp } from '../admin/testkit.js';
import { HOUSE_STEP_MS, advance, driftHousePlayers, history, houseName, persona, seedHousePlayers } from './housePlayers.js';
import { SocialRepo } from './repo.js';
import { listPlayers, overview, resolveRange } from '../analytics/metrics.js';

let app: TestApp;
before(async () => {
  app = await startTestApp();
});
after(async () => {
  await app.close();
});

test('v0.2.20 house players: natural aliases — one word of small letters and digits, the same list every time', () => {
  const names = Array.from({ length: 400 }, (_, i) => houseName(i));
  assert.deepEqual(names, Array.from({ length: 400 }, (_, i) => houseName(i)), 'deterministic');
  for (const n of names) {
    assert.ok(isNick(n), n);
    assert.ok(/^[a-z0-9_]+$/.test(n), n);
    assert.ok(!/(^|\D)(88|14|228|666|69|420|1488|911)$/.test(n), `no ugly numbers: ${n}`);
  }
  assert.ok(new Set(names).size >= 380, `mostly different (${new Set(names).size} of 400)`);
  assert.ok(names.filter((n) => /\d/.test(n)).length > 150, 'many with digits');
  assert.ok(names.filter((n) => !/\d/.test(n)).length > 80, 'and many without');
});

test('v0.2.20 house players: a history that adds up, and hours of play that move it', () => {
  for (let i = 0; i < 60; i++) {
    const p = persona(houseName(i));
    const s = history(p);
    assert.ok(s.matches >= 1);
    assert.equal(s.wins + s.losses, s.matches);
    assert.ok(s.wins <= s.matches && s.bestStreak <= s.wins);
    assert.ok(s.rating >= 300 && s.rating <= 1700, `${p.name}: rating ${s.rating}`);
    assert.ok(levelForXp(s.xp).level >= 1 && levelForXp(s.xp).level <= 60, `${p.name}: level ${levelForXp(s.xp).level}`);
  }
  // a week of hours: most play something, nobody plays a crazy amount
  const now = Math.floor(Date.now() / HOUSE_STEP_MS);
  let played = 0;
  for (let i = 0; i < 60; i++) {
    const p = persona(houseName(i));
    const s0 = history(p);
    const s1 = advance(p, s0, now - 7 * 24, now);
    const n = s1.matches - s0.matches;
    assert.ok(n >= 0 && n <= 7 * 24 * 4);
    assert.ok(n <= p.perDay * 7 * 3 + 12, `${p.name}: ${n} matches in a week at ${p.perDay.toFixed(1)} a day`);
    if (n > 0) played++;
    assert.deepEqual(advance(p, s0, now - 7 * 24, now), s1, 'the same hours, the same matches');
  }
  assert.ok(played > 40, `${played} of 60 played this week`);
});

test('v0.2.20 house players: seeded once, in the Top, out of the admin numbers; they play on by the hour', async () => {
  // a real player already holds the first house alias: it is skipped
  const taken = houseName(0);
  const real = await devLogin(app.base, taken);
  const before = await overview(app.db.sql, resolveRange('30d', null, null), 0);
  const now = new Date();
  assert.equal(await seedHousePlayers(app.db.sql, 30, now), 30);
  assert.equal(await seedHousePlayers(app.db.sql, 30, now), 0, 'once');
  const rows = await app.db.sql<Array<{ display_name: string; telegram_id: string | null; dev_device_id: string | null; email: string | null }>>`SELECT display_name, telegram_id::text, dev_device_id, email FROM users WHERE house_player`;
  assert.equal(rows.length, 30);
  assert.equal(rows.filter((r) => r.display_name === taken).length, 0, 'a name a player holds is skipped');
  assert.ok(rows.every((r) => !r.telegram_id && !r.dev_device_id && !r.email), 'nobody can sign in to one');

  const top = await new SocialRepo(app.db.sql).leaderboard('rating');
  assert.ok(top.filter((e) => rows.some((r) => r.display_name === e.name)).length === 30, 'in the Top');
  assert.equal((await new SocialRepo(app.db.sql, false).leaderboard('rating')).filter((e) => rows.some((r) => r.display_name === e.name)).length, 0, 'HOUSE_PLAYERS=0: out of it');

  const afterSeed = await overview(app.db.sql, resolveRange('30d', null, null), 0);
  assert.equal(afterSeed.totalPlayers, before.totalPlayers, 'the admin counts people only');
  assert.equal(afterSeed.newPlayers, before.newPlayers);
  const page = await listPlayers(app.db.sql, { q: null, pageSize: 200 });
  assert.equal(page.rows.filter((r) => rows.some((x) => x.display_name === r.displayName)).length, 0, 'not in the admin’s player table');
  assert.ok(page.rows.some((r) => r.id === real.userId));

  // a friend request to one: sent, and never answered
  const ask = await api(app.base, '/api/friends/request', { method: 'POST', token: real.token, body: { name: rows[0]!.display_name } });
  assert.equal(ask.status, 200, ask.text);
  assert.equal(ask.body.result, 'sent');

  // two days later: some of them have played
  const snap = async () => new Map((await app.db.sql<Array<{ name: string; m: number; xp: number; level: number }>>`SELECT u.display_name AS name, p.matches_completed AS m, p.xp, p.level FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.house_player`).map((r) => [r.name, r]));
  const s0 = await snap();
  const later = new Date(now.getTime() + 48 * HOUSE_STEP_MS);
  const changed = await driftHousePlayers(app.db.sql, later);
  assert.ok(changed > 5, `${changed} played in two days`);
  assert.equal(await driftHousePlayers(app.db.sql, later), 0, 'the same hours are not played twice');
  const s1 = await snap();
  let grew = 0;
  for (const [name, r] of s1) {
    const a = s0.get(name)!;
    assert.ok(r.m >= a.m && r.xp >= a.xp);
    assert.equal(r.level, levelForXp(r.xp).level, 'the level follows the XP');
    if (r.m > a.m) grew++;
  }
  assert.equal(grew, changed);
});
