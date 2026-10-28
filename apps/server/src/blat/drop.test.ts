/**
 * BLAT DROP (V2.0 part C) against PostgreSQL: the announcement date — the server variable as the
 * default, an administrator's date (CSRF, audited, bounds), «not set» on purpose, everyone gets the
 * same date and the server's clock without signing in; balance snapshots — one moment, the eligibility
 * checks (an administrator's flag, a ledger that does not add up), totals, CSV (formula-safe) and JSON,
 * viewers and players refused, deletion; a deleted account leaves the snapshots with its data.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BLAT_DROP_DEFAULT_ANNOUNCE_AT } from '@blatkom/shared';
import type { AdminBlatDrop, AdminBlatSnapshot, BlatDropInfo } from '@blatkom/shared';
import { startTestApp, api, devLogin, cookieFrom } from '../admin/testkit.js';
import type { TestApp } from '../admin/testkit.js';
import { ADMIN_COOKIE } from '../admin/auth.js';
import { BlatDropRepo } from './drop.js';

let app: TestApp;
let cookie: string;
let csrf: string;
const ENV_DATE = '2027-04-23T12:00:00.000Z';
before(async () => {
  app = await startTestApp({ ADMIN_BOOTSTRAP_USERNAME: 'root', ADMIN_BOOTSTRAP_PASSWORD: 'correct-horse-battery-staple', BLAT_DROP_ANNOUNCE_AT: ENV_DATE });
  const login = await api(app.base, '/api/admin/login', { method: 'POST', body: { username: 'root', password: 'correct-horse-battery-staple' } });
  cookie = cookieFrom(login.headers, ADMIN_COOKIE)!;
  csrf = login.body.csrfToken as string;
});
after(async () => {
  await app.close();
});

const drop = () => api<BlatDropInfo>(app.base, '/api/blat/drop');

test('BLAT DROP date: the built-in date, the server variable, an administrator’s date (CSRF, audited, bounds), «not set» on purpose; the same for everyone with the server clock', async () => {
  // v0.2.17: the release sets the owner's date (migration 022) — an administrator's setting nobody signed
  const first = await new BlatDropRepo(app.db.sql, undefined).date();
  assert.deepEqual([first.announceAt, first.source, first.updatedBy], [BLAT_DROP_DEFAULT_ANNOUNCE_AT, 'admin', null], 'the release: the owner’s date');
  // with nothing set anywhere, the owner's date built into the release
  await new BlatDropRepo(app.db.sql, undefined).resetDate();
  assert.deepEqual(await new BlatDropRepo(app.db.sql, undefined).date(), { announceAt: BLAT_DROP_DEFAULT_ANNOUNCE_AT, source: 'default', updatedAt: null, updatedBy: null }, 'nothing set: the built-in date');
  const before0 = Date.now();
  const d0 = await drop();
  assert.equal(d0.status, 200, d0.text);
  assert.equal(d0.body.announceAt, ENV_DATE, 'the server variable, without signing in');
  const now = Date.parse(d0.body.serverNow);
  assert.ok(now >= before0 - 1000 && now <= Date.now() + 1000, 'the server clock');
  const p = await devLogin(app.base, 'Drop Watcher');
  assert.equal((await api(app.base, '/api/admin/blat/drop', { token: p.token })).status, 401, 'players can’t read the admin side');
  const cur = await api<AdminBlatDrop>(app.base, '/api/admin/blat/drop', { cookie });
  assert.deepEqual([cur.body.announceAt, cur.body.source], [ENV_DATE, 'env']);
  const at = '2027-05-01T09:30:00.000Z';
  assert.equal((await api(app.base, '/api/admin/blat/drop', { method: 'POST', cookie, body: { announceAt: at } })).status, 403, 'CSRF');
  for (const bad of ['tomorrow', '2019-12-31T23:59:00Z', '2099-01-01T00:00:00Z']) {
    assert.equal((await api(app.base, '/api/admin/blat/drop', { method: 'POST', cookie, csrf, body: { announceAt: bad } })).status, 400, bad);
  }
  const set = await api<AdminBlatDrop>(app.base, '/api/admin/blat/drop', { method: 'POST', cookie, csrf, body: { announceAt: '2027-05-01T12:30:00+03:00' } });
  assert.equal(set.status, 200, set.text);
  assert.deepEqual([set.body.announceAt, set.body.source, set.body.updatedBy], [at, 'admin', 'root']);
  assert.equal((await drop()).body.announceAt, at, 'everyone gets the new date');
  const off = await api<AdminBlatDrop>(app.base, '/api/admin/blat/drop', { method: 'POST', cookie, csrf, body: { announceAt: null } });
  assert.deepEqual([off.body.announceAt, off.body.source], [null, 'admin']);
  assert.equal((await drop()).body.announceAt, null, '«not set yet» even with the server variable');
  const audits = await app.db.sql<Array<{ details: { from: string | null; to: string | null } }>>`SELECT details FROM admin_audit_log WHERE action = 'blat_drop_date' ORDER BY id`;
  assert.deepEqual(audits.map((a) => [a.details.from, a.details.to]), [[ENV_DATE, at], [at, null]]);
  // back to the variable
  await new BlatDropRepo(app.db.sql, ENV_DATE).resetDate();
  assert.equal((await drop()).body.announceAt, ENV_DATE);
});

test('snapshots: one moment, the eligibility checks, totals, CSV and JSON for admins only, deletion; a deleted account leaves them', async () => {
  const a = await devLogin(app.base, 'Snap Rich');
  const b = await devLogin(app.base, 'Snap Flagged');
  const c = await devLogin(app.base, 'Snap Odd');
  // a name from before the Latin-only rule that a spreadsheet would read as a formula
  await app.db.sql`UPDATE users SET display_name = '=HYPERLINK("x") Snap' WHERE id = ${b.userId}`;
  await app.db.sql`UPDATE profiles SET blat = 5000, blat_earned = 5000 WHERE user_id = ${a.userId}`;
  await app.db.sql`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref) VALUES (${a.userId}, 'blat', 4700, 5000, 'referral', ${`referral:${randomUUID()}`})`;
  await app.db.sql`UPDATE users SET blat_flag = 'one device, many accounts' WHERE id = ${b.userId}`;
  // a balance the ledger doesn't explain (changed by hand)
  await app.db.sql`UPDATE profiles SET blat = 999 WHERE user_id = ${c.userId}`;
  // V2.0 part E: an empty first-launch profile merged into another account keeps its welcome but isn't eligible
  const d = await devLogin(app.base, 'Snap Merged');
  await api(app.base, '/api/me', { token: d.token }); // its own profile read pays the 300 welcome
  await app.db.sql`UPDATE users SET merged_into = ${a.userId}, merged_at = now() WHERE id = ${d.userId}`;
  const viewer = await api(app.base, '/api/admin/users', { method: 'POST', cookie, csrf, body: { username: 'snapviewer', password: 'viewer-password-123456', role: 'viewer' } });
  assert.equal(viewer.status, 201, viewer.text);
  const vlogin = await api(app.base, '/api/admin/login', { method: 'POST', body: { username: 'snapviewer', password: 'viewer-password-123456' } });
  const vcookie = cookieFrom(vlogin.headers, ADMIN_COOKIE)!;
  assert.equal((await api(app.base, '/api/admin/blat/snapshots', { method: 'POST', cookie: vcookie, csrf: vlogin.body.csrfToken, body: {} })).status, 403, 'a viewer can’t take one');
  assert.equal((await api(app.base, '/api/admin/blat/snapshots', { method: 'POST', cookie, body: {} })).status, 403, 'CSRF');
  const s = await api<AdminBlatSnapshot>(app.base, '/api/admin/blat/snapshots', { method: 'POST', cookie, csrf, body: { note: 'test snapshot' } });
  assert.equal(s.status, 200, s.text);
  const [want] = await app.db.sql<Array<{ n: number; total: string }>>`SELECT count(*)::int AS n, sum(blat)::text AS total FROM profiles WHERE blat > 0`;
  assert.deepEqual([s.body.accounts, s.body.total], [want!.n, Number(want!.total)]);
  assert.ok(s.body.eligible <= s.body.accounts - 3 && s.body.eligibleTotal <= s.body.total - 300 - 999 - 300);
  const list = await api<AdminBlatSnapshot[]>(app.base, '/api/admin/blat/snapshots', { cookie: vcookie });
  assert.equal(list.body[0]!.id, s.body.id, 'a viewer sees the list');
  // a credit after the snapshot doesn't change it
  await app.db.sql`UPDATE profiles SET blat = blat + 1 WHERE user_id = ${a.userId}`;
  assert.equal((await api(app.base, `/api/admin/blat/snapshots/${s.body.id}/export?format=json`, { cookie: vcookie })).status, 403, 'exports are for admins');
  const json = await api(app.base, `/api/admin/blat/snapshots/${s.body.id}/export?format=json`, { cookie });
  assert.equal(json.status, 200, json.text);
  const rows = json.body.rows as Array<{ userId: string; balance: number; eligible: boolean; reasons: string[]; fromReferrals: number; ledgerSum: number }>;
  const row = (id: string) => rows.find((r) => r.userId === id)!;
  assert.deepEqual([row(a.userId).balance, row(a.userId).eligible, row(a.userId).fromReferrals, row(a.userId).ledgerSum], [5000, true, 4700, 5000]);
  assert.deepEqual([row(b.userId).eligible, row(b.userId).reasons], [false, ['flagged']]);
  assert.deepEqual([row(c.userId).eligible, row(c.userId).reasons, row(c.userId).ledgerSum], [false, ['ledger_mismatch'], 300]);
  assert.deepEqual([row(d.userId).balance, row(d.userId).eligible, row(d.userId).reasons], [300, false, ['merged']]);
  assert.equal(json.body.rules.version, 2);
  const csv = await api(app.base, `/api/admin/blat/snapshots/${s.body.id}/export?format=csv`, { cookie });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type') ?? '', /text\/csv/);
  assert.ok(csv.text.includes(`${a.userId},Snap Rich,5000,`), 'A’s line');
  assert.ok(csv.text.includes(`'=HYPERLINK`), 'a formula-looking name is neutralised');
  const audits = await app.db.sql<Array<{ action: string }>>`SELECT action FROM admin_audit_log WHERE action IN ('blat_snapshot', 'export_blat_snapshot') ORDER BY id`;
  assert.deepEqual(audits.map((x) => x.action), ['blat_snapshot', 'export_blat_snapshot', 'export_blat_snapshot']);
  // a deleted account leaves the snapshot with its data
  assert.equal((await api(app.base, '/api/me', { method: 'DELETE', token: c.token })).status, 200);
  const after1 = await api<AdminBlatSnapshot[]>(app.base, '/api/admin/blat/snapshots', { cookie });
  assert.equal(after1.body[0]!.rowsNow, s.body.accounts - 1);
  // deletion
  assert.equal((await api(app.base, `/api/admin/blat/snapshots/${s.body.id}`, { method: 'DELETE', cookie, csrf })).status, 200);
  assert.equal((await app.db.sql`SELECT 1 FROM blat_snapshot_rows WHERE snapshot_id = ${s.body.id}`).length, 0);
  assert.equal((await api(app.base, `/api/admin/blat/snapshots/${s.body.id}/export?format=csv`, { cookie })).status, 404);
});
