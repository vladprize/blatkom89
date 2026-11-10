import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { CASE_CHARACTERS, CASE_FINISHES, PASS_FALLBACK_BLATS, PASS_PRICE, WEEK_MS, skinId } from '@blatkom/shared';
import type { PassSeason } from '@blatkom/shared';
import { startTestApp, api, devLogin } from '../admin/testkit.js';
import type { TestApp } from '../admin/testkit.js';
import { pgContext } from '../services/persistence.js';
import { silentLogger } from '../logging/logger.js';

// v0.2.24 — the Season Pass on a server whose season started eight days ago (its second week of four)
const START = new Date(Date.now() - 8 * 86_400_000);
let app: TestApp;
before(async () => {
  app = await startTestApp({ PASS_SEASON_ID: 's1', PASS_SEASON_START: START, PASS_SEASON_WEEKS: 4 });
});
after(async () => {
  await app.close();
});

const eco = () => pgContext(app.db.sql, app.env, silentLogger).economy;
const season: PassSeason = { id: 's1', start: START.toISOString(), weeks: 4 };
const blats = async (userId: string, n: number) => eco().grant(userId, 'diamonds', n, null, 'test');
const ledger = (userId: string) => app.db.sql<Array<{ delta: number; reason: string; ref: string | null }>>`SELECT delta, reason, ref FROM currency_ledger WHERE user_id = ${userId} ORDER BY id`;

test('pass: the season is in the shop config; the pass is sold for 299 BLATS with the adult confirmation, once', async () => {
  const cfg = await api(app.base, '/api/shop/config');
  assert.equal(cfg.body.pass.id, 's1');
  assert.equal(cfg.body.pass.weeks, 4);
  assert.equal(Date.parse(cfg.body.pass.end) - Date.parse(cfg.body.pass.start), 4 * WEEK_MS);
  const a = await devLogin(app.base, 'pass_buyer');
  let s = await api(app.base, '/api/pass', { token: a.token });
  assert.equal(s.status, 200, s.text);
  assert.equal(s.body.onSale, true);
  assert.equal(s.body.owned, false);
  assert.equal(s.body.week, 2);
  assert.equal(s.body.weeks.length, 4);
  assert.equal(s.body.ready, 0);
  assert.deepEqual(s.body.price, PASS_PRICE);
  // no confirmation, then no money
  assert.equal((await api(app.base, '/api/pass/buy', { method: 'POST', token: a.token, body: {} })).status, 400);
  const poor = await api(app.base, '/api/pass/buy', { method: 'POST', token: a.token, body: { confirmAge: true } });
  assert.equal(poor.status, 409);
  assert.equal(poor.body.error.code, 'funds');
  await blats(a.userId, 400);
  const bought = await api(app.base, '/api/pass/buy', { method: 'POST', token: a.token, body: { confirmAge: true } });
  assert.equal(bought.status, 200, bought.text);
  assert.equal(bought.body.inventory.diamonds, 101);
  assert.equal(bought.body.state.owned, true);
  assert.equal(bought.body.state.onSale, false);
  assert.equal(bought.body.state.ready, 2, 'a buyer in week 2 gets weeks 1 and 2 at once');
  assert.deepEqual(
    bought.body.state.weeks.map((w: { due: boolean }) => w.due),
    [true, true, false, false],
  );
  const again = await api(app.base, '/api/pass/buy', { method: 'POST', token: a.token, body: { confirmAge: true } });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'owned');
  const rows = await ledger(a.userId);
  assert.equal(rows.filter((r) => r.delta === -PASS_PRICE.amount && r.reason === 'purchase' && r.ref === 'pass:s1').length, 1, 'one purchase row');
  s = await api(app.base, '/api/pass', { token: a.token });
  assert.equal(s.body.ready, 2);
});

test('pass: the ready weeks open once — a skin and a character the player had not, each a key in pass_drops', async () => {
  const a = await devLogin(app.base, 'pass_opener');
  await blats(a.userId, 299);
  assert.equal((await api(app.base, '/api/pass/buy', { method: 'POST', token: a.token, body: { confirmAge: true } })).status, 200);
  const before = (await api(app.base, '/api/me/inventory', { token: a.token })).body;
  const r = await api(app.base, '/api/pass/claim', { method: 'POST', token: a.token, body: {} });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.drops.length, 2);
  assert.deepEqual(
    r.body.drops.map((d: { week: number; season: string }) => `${d.season}#${d.week}`),
    ['s1#1', 's1#2'],
  );
  const chars = new Set<string>();
  for (const d of r.body.drops) {
    assert.ok(d.skin && d.character, 'both halves while there are some left');
    assert.ok(CASE_FINISHES.includes(d.skin.finish));
    assert.ok(CASE_CHARACTERS.includes(d.character.character));
    assert.ok(!before.characters.includes(d.character.character), 'not one they had');
    assert.ok(!before.skins.includes(skinId(d.skin.weapon, d.skin.finish)));
    assert.ok(r.body.inventory.characters.includes(d.character.character), 'now theirs');
    assert.ok(r.body.inventory.skins.includes(skinId(d.skin.weapon, d.skin.finish)));
    assert.equal(d.blats, 0);
    chars.add(d.character.character);
  }
  assert.equal(chars.size, 2, 'two different characters');
  // the first skin on a weapon that wore none goes on at once
  const first = r.body.drops[0].skin;
  assert.equal(r.body.inventory.loadout.skins?.[first.weapon] !== undefined, true);
  assert.equal(r.body.state.ready, 0);
  assert.ok(r.body.state.weeks[0].drop && r.body.state.weeks[1].drop && !r.body.state.weeks[2].drop);
  // asked again: nothing more
  const again = await api(app.base, '/api/pass/claim', { method: 'POST', token: a.token, body: {} });
  assert.equal(again.body.drops.length, 0);
  const items = await app.db.sql`SELECT kind, item_id FROM user_items WHERE user_id = ${a.userId} AND source = 'pass'`;
  assert.equal(items.length, 4, 'two skins and two characters marked as from the pass');
  // a week later, asked twice at once: week 3 opens exactly once
  const later = new Date(Date.now() + 7 * 86_400_000);
  const [x, y] = await Promise.all([eco().claimPass(a.userId, later), eco().claimPass(a.userId, later)]);
  assert.equal(x.drops.length + y.drops.length, 1);
  assert.equal([...x.drops, ...y.drops][0]!.week, 3);
  const n = await app.db.sql`SELECT count(*)::int AS n FROM pass_drops WHERE user_id = ${a.userId}`;
  assert.equal(n[0]!.n, 3);
});

test('pass: with every character already theirs, that half of a week is BLATS (a ledger row each)', async () => {
  const a = await devLogin(app.base, 'pass_collector');
  for (const c of CASE_CHARACTERS) await app.db.sql`INSERT INTO user_items (user_id, item_id, kind, source) VALUES (${a.userId}, ${c}, 'character', 'grant') ON CONFLICT DO NOTHING`;
  await blats(a.userId, 299);
  assert.equal((await api(app.base, '/api/pass/buy', { method: 'POST', token: a.token, body: { confirmAge: true } })).status, 200);
  const r = await api(app.base, '/api/pass/claim', { method: 'POST', token: a.token, body: {} });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.drops.length, 2);
  for (const d of r.body.drops) {
    assert.equal(d.character, null);
    assert.ok(d.skin);
    assert.equal(d.blats, PASS_FALLBACK_BLATS);
  }
  assert.equal(r.body.inventory.diamonds, 2 * PASS_FALLBACK_BLATS);
  const rows = (await ledger(a.userId)).filter((x) => x.reason === 'pass');
  assert.deepEqual(
    rows.map((x) => [x.delta, x.ref]),
    [
      [PASS_FALLBACK_BLATS, 'pass:s1:w1'],
      [PASS_FALLBACK_BLATS, 'pass:s1:w2'],
    ],
  );
});

test('pass: not sold before or after its season; an old pass still opens every week after it', async () => {
  const a = await devLogin(app.base, 'pass_late');
  await blats(a.userId, 600);
  const early: PassSeason = { id: 's2', start: new Date(Date.now() + 3 * 86_400_000).toISOString(), weeks: 4 };
  await assert.rejects(() => eco().buyPass(a.userId, early), /not on sale/);
  const over: PassSeason = { id: 's0', start: new Date(Date.now() - 40 * 86_400_000).toISOString(), weeks: 4 };
  await assert.rejects(() => eco().buyPass(a.userId, over), /not on sale/);
  await assert.rejects(() => eco().buyPass(a.userId, null), /not on sale/);
  // bought back when it was on: all four weeks open now
  await eco().buyPass(a.userId, over, new Date(Date.parse(over.start) + 86_400_000));
  const r = await eco().claimPass(a.userId);
  assert.deepEqual(
    r.drops.filter((d) => d.season === 's0').map((d) => d.week),
    [1, 2, 3, 4],
  );
  const st = await eco().passState(a.userId, season, true);
  assert.equal(st.owned, false, 'the old pass is not this season\'s');
  assert.equal(st.onSale, true);
  assert.equal(st.ready, 0);
  // no season configured: nothing is on sale and the shop says so
  const none = await eco().passState(a.userId, null, true);
  assert.equal(none.season, null);
  assert.equal(none.onSale, false);
  assert.deepEqual(none.weeks, []);
});

test('pass: CASES_ENABLED=false stops the sale, not the weeks already paid for', async () => {
  const off = await startTestApp({ PASS_SEASON_ID: 's1', PASS_SEASON_START: START, PASS_SEASON_WEEKS: 4, CASES_ENABLED: false });
  try {
    const a = await devLogin(off.base, 'pass_nocases');
    const e = pgContext(off.db.sql, off.env, silentLogger).economy;
    await e.grant(a.userId, 'diamonds', 299, null, 'test');
    const st = await api(off.base, '/api/pass', { token: a.token });
    assert.equal(st.body.onSale, false);
    assert.equal(st.body.casesEnabled, false);
    const r = await api(off.base, '/api/pass/buy', { method: 'POST', token: a.token, body: { confirmAge: true } });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'cases_disabled');
    // bought while cases were on (straight in the repo): the weeks still open
    await e.buyPass(a.userId, season);
    const c = await api(off.base, '/api/pass/claim', { method: 'POST', token: a.token, body: {} });
    assert.equal(c.status, 200, c.text);
    assert.equal(c.body.drops.length, 2);
  } finally {
    await off.close();
  }
});

test('pass: without a session nothing is shown or sold', async () => {
  assert.equal((await api(app.base, '/api/pass')).status, 401);
  assert.equal((await api(app.base, '/api/pass/buy', { method: 'POST', body: { confirmAge: true } })).status, 401);
  assert.equal((await api(app.base, '/api/pass/claim', { method: 'POST', body: {} })).status, 401);
});
