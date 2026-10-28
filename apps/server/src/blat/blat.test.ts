/**
 * $BLAT (V2.0) against PostgreSQL: level rewards (every level once — retries, concurrent requests and
 * re-processed matches never pay twice), referral codes attached only to new accounts, an invitation
 * counted after a whole match (not a short one, not an idle one), the owner's tiers by the invitation's
 * number, the daily cap and flags holding it for an administrator, concurrent confirmations, the admin's
 * review and numbers.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { REFERRAL_RULES, blatForLevel, referralReward } from '@blatkom/shared';
import type { BlatResponse, PublicProfile } from '@blatkom/shared';
import { startTestApp, api, devLogin, cookieFrom } from '../admin/testkit.js';
import type { TestApp } from '../admin/testkit.js';
import { ADMIN_COOKIE } from '../admin/auth.js';
import { PgMatchRecorder } from '../progression/recorder.js';
import { silentLogger } from '../logging/logger.js';
import { BlatRepo } from './repo.js';
import { UserRepo } from '../auth/users.js';
import type { ConfirmResult } from './repo.js';
import type { MatchCompletion, MatchParticipantResult } from '../services/contracts.js';

let app: TestApp;
let rec: PgMatchRecorder;
let repo: BlatRepo;
before(async () => {
  app = await startTestApp({ ADMIN_BOOTSTRAP_USERNAME: 'root', ADMIN_BOOTSTRAP_PASSWORD: 'correct-horse-battery-staple', PUBLIC_URL: 'https://game.test', TELEGRAM_BOT_USERNAME: 'blatkom_bot' });
  rec = new PgMatchRecorder(app.db.sql, silentLogger);
  repo = new BlatRepo(app.db.sql, { publicUrl: 'https://game.test' });
});
after(async () => {
  await app.close();
});

const blat = (token: string) => api<BlatResponse>(app.base, '/api/blat', { token });
const balanceOf = async (userId: string) => (await app.db.sql<Array<{ blat: number }>>`SELECT blat FROM profiles WHERE user_id = ${userId}`)[0]!.blat;
const ledgerRefs = async (userId: string) => (await app.db.sql<Array<{ ref: string }>>`SELECT ref FROM currency_ledger WHERE user_id = ${userId} AND currency = 'blat' ORDER BY id`).map((r) => r.ref);

async function signUp(name: string, ref?: string) {
  const body = { name, deviceId: `dev-${randomUUID().slice(0, 12)}`, ...(ref ? { ref } : {}) };
  let r = await api(app.base, '/api/auth/dev', { method: 'POST', body });
  // the sign-in limiter (20 a minute from one address) — the test makes a lot of players
  for (let i = 0; i < 20 && r.status === 429; i++) {
    await new Promise((res) => setTimeout(res, 1500));
    r = await api(app.base, '/api/auth/dev', { method: 'POST', body });
  }
  assert.equal(r.status, 200, r.text);
  return { token: r.body.token as string, userId: r.body.profile.id as string, deviceId: r.body.deviceId as string, profile: r.body.profile as PublicProfile };
}

/** A player straight in the database (no sign-in), already invited by `referrerId`. */
async function invitedRaw(name: string, referrerId: string, code: string, status: 'confirmed' | 'pending', decidedAgo: string, ordinal: number | null): Promise<string> {
  const { userId } = await new UserRepo(app.db.sql).upsertDev(`dev-${randomUUID().slice(0, 12)}`, name, null);
  await app.db.sql`INSERT INTO referrals (referee_id, referrer_id, code, status, decided_at, ordinal, reward)
    VALUES (${userId}, ${referrerId}, ${code}, ${status}, ${status === 'confirmed' ? app.db.sql`now() - ${decidedAgo}::interval` : null}, ${ordinal}, 0)`;
  return userId;
}

function match(userId: string, o: { durationMs?: number; damage?: number; completed?: boolean } = {}): MatchCompletion {
  const now = Date.now();
  const d = o.durationMs ?? 180_000;
  const p: MatchParticipantResult = { userId, character: 'petya', place: 1, kills: 3, assists: 0, deaths: 1, score: 6, damageDealt: o.damage ?? 300, completed: o.completed ?? true, viaInvite: false, team: null, playtimeMs: d };
  return { matchId: randomUUID(), roomId: 'room123456', mapId: 'factory', mode: 'ffa', winnerTeam: null, isPrivate: false, startedAt: new Date(now - d), endedAt: new Date(now), durationMs: d, endReason: 'time', playersAtEnd: 2, participants: [p] };
}

test('$BLAT for levels: level 1 welcomes with 300 at sign-up, every level is paid once — repeats and concurrent requests never pay twice', async () => {
  const u = await signUp('Blat Leveller');
  // the sign-up's own profile read pays the welcome (and says so, once)
  assert.deepEqual([u.profile.blat, u.profile.blatCredited], [300, 300]);
  const me = await api<PublicProfile>(app.base, '/api/me', { token: u.token });
  assert.deepEqual([me.body.blat, me.body.blatCredited], [300, undefined]);
  const first = await blat(u.token);
  assert.equal(first.status, 200, first.text);
  assert.deepEqual([first.body.justCredited, first.body.balance, first.body.earned, first.body.level], [0, 300, 300, 1]);
  assert.deepEqual(first.body.nextLevel, { level: 2, reward: 350 });
  assert.deepEqual(first.body.history.map((h) => [h.delta, h.source, h.ref]), [[300, 'level', 'level:1']]);
  // levels reached before $BLAT existed (a player from before the update) are paid at the next profile read
  await app.db.sql`UPDATE profiles SET level = 5 WHERE user_id = ${u.userId}`;
  const back = await api<PublicProfile>(app.base, '/api/me', { token: u.token });
  assert.deepEqual([back.body.blatCredited, back.body.blat], [350 + 400 + 450 + 500, 2000]);
  assert.equal((await blat(u.token)).body.justCredited, 0, 'nothing twice');
  // the $BLAT screen pays them too; six requests of both kinds at once for three new levels: paid once
  await app.db.sql`UPDATE profiles SET level = 8 WHERE user_id = ${u.userId}`;
  const many = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? blat(u.token).then((r) => r.body.justCredited) : api<PublicProfile>(app.base, '/api/me', { token: u.token }).then((r) => r.body.blatCredited ?? 0))));
  assert.equal(many.reduce((a, n) => a + n, 0), blatForLevel(6) + blatForLevel(7) + blatForLevel(8));
  assert.deepEqual(await ledgerRefs(u.userId), ['level:1', 'level:2', 'level:3', 'level:4', 'level:5', 'level:6', 'level:7', 'level:8']);
  assert.equal(await balanceOf(u.userId), 2000 + 550 + 600 + 650);
  const bySource = (await blat(u.token)).body.bySource;
  assert.deepEqual(bySource, { level: 3800, referral: 0, grant: 0, allocation: 0, stake: 0, stake_win: 0, stake_refund: 0 });
  // an account made without any profile read (straight in the database) is paid by its first one
  const raw = await new UserRepo(app.db.sql).upsertDev(`dev-${randomUUID().slice(0, 12)}`, 'Raw Leveller', null);
  assert.equal(await balanceOf(raw.userId), 0);
  await new BlatRepo(app.db.sql, { publicUrl: '' }).backfillLevels(raw.userId);
  assert.equal(await balanceOf(raw.userId), 300);
});

test('$BLAT in a match: the levels reached are paid with the results; a re-processed match pays nothing more', async () => {
  const u = await devLogin(app.base, 'Blat Matcher');
  assert.equal(await balanceOf(u.userId), 300, 'the welcome, paid at sign-up');
  const m = match(u.userId);
  const res = (await rec.matchCompleted(m)).get(u.userId)!;
  assert.ok(res.level >= 2, `levelled up (${res.level})`);
  let expected = 0;
  for (let l = 2; l <= res.level; l++) expected += blatForLevel(l);
  assert.deepEqual([res.blatGained, res.totalBlat], [expected, 300 + expected]);
  expected += 300;
  await rec.matchCompleted(m);
  await Promise.all([rec.matchCompleted(m), rec.matchCompleted(m)]);
  assert.equal(await balanceOf(u.userId), expected);
  assert.equal((await ledgerRefs(u.userId)).length, res.level);
});

test('referrals: a code per player, links; attached only to a new account opened with it; unknown codes ignored', async () => {
  const a = await signUp('Inviter One');
  const o = (await blat(a.token)).body.referral;
  assert.match(o.code, /^[A-Za-z0-9]{8}$/);
  assert.equal(o.link, `https://game.test/?ref=${o.code}`);
  assert.equal(o.telegramLink, `https://t.me/blatkom_bot?start=ref_${o.code}`);
  assert.equal((await blat(a.token)).body.referral.code, o.code, 'the same code every time');
  const b = await signUp('Invited Bee', o.code.toLowerCase());
  const [row] = await app.db.sql<Array<{ referrer_id: string; status: string }>>`SELECT referrer_id, status FROM referrals WHERE referee_id = ${b.userId}`;
  assert.deepEqual([row?.referrer_id, row?.status], [a.userId, 'pending'], 'codes match in any letter case');
  // the same account signing in again with another code: nothing changes
  const again = await api(app.base, '/api/auth/dev', { method: 'POST', body: { name: 'Invited Bee', deviceId: b.deviceId, ref: 'Zzzzzzzz' } });
  assert.equal(again.status, 200);
  assert.equal((await app.db.sql`SELECT 1 FROM referrals WHERE referee_id = ${b.userId}`).length, 1);
  const c = await signUp('Nobody Sent', 'NoSuchCode');
  assert.equal((await app.db.sql`SELECT 1 FROM referrals WHERE referee_id = ${c.userId}`).length, 0);
  const view = (await blat(a.token)).body.referral;
  assert.deepEqual([view.invited, view.pending, view.confirmed, view.nextReward], [1, 1, 0, 1500]);
  assert.equal(view.recent[0]?.name, 'Invited Bee');
});

test('referrals: counted after a whole match — not a short one, not an idle one; the inviter hears it; tiers go by number', async () => {
  const a = await signUp('Inviter Two');
  const code = (await blat(a.token)).body.referral.code;
  const before0 = await balanceOf(a.userId);
  const heard: ConfirmResult[] = [];
  rec.onReferral = (r) => heard.push(r);
  const b = await signUp('Short Match', code);
  await rec.matchCompleted(match(b.userId, { durationMs: (REFERRAL_RULES.minMatchSec - 20) * 1000 }));
  await rec.matchCompleted(match(b.userId, { damage: 0 }));
  await rec.matchCompleted(match(b.userId, { completed: false }));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal((await app.db.sql<Array<{ status: string }>>`SELECT status FROM referrals WHERE referee_id = ${b.userId}`)[0]!.status, 'pending', 'too short, idle or left early: not yet');
  await rec.matchCompleted(match(b.userId));
  for (let i = 0; i < 50 && heard.length === 0; i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(heard[0]?.status, 'confirmed');
  if (heard[0]?.status === 'confirmed') assert.deepEqual([heard[0].paid.referrerId, heard[0].paid.reward, heard[0].paid.ordinal, heard[0].paid.refereeName], [a.userId, 1500, 1, 'Short Match']);
  assert.equal(await balanceOf(a.userId), before0 + 1500);
  // the referee opening $BLAT later changes nothing
  await blat(b.token);
  assert.equal(await balanceOf(a.userId), before0 + 1500);
  // the 5th confirmed invitation pays the second tier: four earlier ones (one real + three more, old)
  for (let i = 0; i < 3; i++) {
    const x = await invitedRaw(`Old Friend ${i}`, a.userId, code, 'confirmed', '3 days', i + 2);
    await app.db.sql`UPDATE referrals SET reward = 1500 WHERE referee_id = ${x}`;
  }
  const fifth = await signUp('Fifth Friend', code);
  await rec.matchCompleted(match(fifth.userId));
  for (let i = 0; i < 50 && heard.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
  const r5 = heard[1];
  assert.ok(r5?.status === 'confirmed' && r5.paid.ordinal === 5 && r5.paid.reward === referralReward(5) && r5.paid.reward === 3000, JSON.stringify(r5));
  const view = (await blat(a.token)).body;
  assert.deepEqual([view.referral.confirmed, view.referral.earned, view.referral.nextReward, view.bySource.referral], [5, 1500 * 4 + 3000, 3000, 1500 + 3000]);
  assert.ok(view.history.some((h) => h.source === 'referral' && h.who === 'Fifth Friend' && h.delta === 3000));
  rec.onReferral = null;
});

test('referrals: concurrent confirmations — one payment per invited player, numbers never repeat', async () => {
  const a = await signUp('Inviter Three');
  const code = (await blat(a.token)).body.referral.code;
  const kids = await Promise.all(['Kid A', 'Kid B', 'Kid C'].map((n) => signUp(n, code)));
  // their matches are recorded without the automatic confirmation racing us
  const quiet = new PgMatchRecorder(app.db.sql, silentLogger);
  for (const k of kids) await quiet.matchCompleted(match(k.userId));
  await new Promise((r) => setTimeout(r, 300));
  await app.db.sql`UPDATE referrals SET status = 'pending', decided_at = NULL, ordinal = NULL, reward = 0 WHERE referrer_id = ${a.userId}`;
  await app.db.sql`DELETE FROM currency_ledger WHERE user_id = ${a.userId} AND reason = 'referral'`;
  await app.db.sql`UPDATE profiles SET blat = 0, blat_earned = 0 WHERE user_id = ${a.userId}`;
  const results = await Promise.all([...kids, ...kids].map((k) => repo.tryConfirm(k.userId)));
  const paid = results.filter((r): r is Extract<ConfirmResult, { status: 'confirmed' }> => r?.status === 'confirmed');
  assert.equal(paid.length, 3, 'each invited player once');
  assert.deepEqual(paid.map((p) => p.paid.ordinal).sort(), [1, 2, 3]);
  assert.equal(await balanceOf(a.userId), 3 * 1500);
  assert.equal((await app.db.sql`SELECT 1 FROM currency_ledger WHERE user_id = ${a.userId} AND reason = 'referral'`).length, 3);
});

test('referrals: over the daily cap or a flagged account waits for an administrator, who counts it (audited) or turns it down', async () => {
  const a = await signUp('Busy Inviter');
  const code = (await blat(a.token)).body.referral.code;
  for (let i = 0; i < REFERRAL_RULES.dailyCap; i++) await invitedRaw(`Today ${i}`, a.userId, code, 'confirmed', '1 hour', i + 1);
  const over = await signUp('One Too Many', code);
  await new PgMatchRecorder(app.db.sql, silentLogger).matchCompleted(match(over.userId));
  const held = await repo.tryConfirm(over.userId);
  const [st] = await app.db.sql<Array<{ status: string; note: string }>>`SELECT status, note FROM referrals WHERE referee_id = ${over.userId}`;
  assert.ok(held === null || held.status === 'held');
  assert.deepEqual([st!.status, st!.note], ['held', `over ${REFERRAL_RULES.dailyCap} a day`]);
  // a flagged inviter: held too
  const f = await signUp('Flagged Inviter');
  const fcode = (await blat(f.token)).body.referral.code;
  await app.db.sql`UPDATE users SET blat_flag = 'many accounts from one device' WHERE id = ${f.userId}`;
  const fk = await signUp('Flagged Kid', fcode);
  await new PgMatchRecorder(app.db.sql, silentLogger).matchCompleted(match(fk.userId));
  await repo.tryConfirm(fk.userId);
  assert.equal((await app.db.sql<Array<{ status: string }>>`SELECT status FROM referrals WHERE referee_id = ${fk.userId}`)[0]!.status, 'held');

  // the administrator
  const login = await api(app.base, '/api/admin/login', { method: 'POST', body: { username: 'root', password: 'correct-horse-battery-staple' } });
  const cookie = cookieFrom(login.headers, ADMIN_COOKIE)!;
  const csrf = login.body.csrfToken as string;
  assert.equal((await api(app.base, '/api/admin/referrals?status=held', { token: a.token })).status, 401, 'players can’t');
  const list = await api(app.base, '/api/admin/referrals?status=held', { cookie });
  assert.ok(list.body.some((r: { refereeName: string }) => r.refereeName === 'One Too Many'));
  const before0 = await balanceOf(a.userId);
  assert.equal((await api(app.base, `/api/admin/referrals/${over.userId}`, { method: 'POST', cookie, body: { action: 'confirm' } })).status, 403, 'CSRF');
  const ok = await api(app.base, `/api/admin/referrals/${over.userId}`, { method: 'POST', cookie, csrf, body: { action: 'confirm', note: 'checked by hand' } });
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual([ok.body.ordinal, ok.body.reward], [REFERRAL_RULES.dailyCap + 1, referralReward(REFERRAL_RULES.dailyCap + 1)]);
  assert.equal(await balanceOf(a.userId), before0 + referralReward(REFERRAL_RULES.dailyCap + 1));
  assert.equal((await api(app.base, `/api/admin/referrals/${over.userId}`, { method: 'POST', cookie, csrf, body: { action: 'confirm' } })).status, 409, 'decided once');
  const no = await api(app.base, `/api/admin/referrals/${fk.userId}`, { method: 'POST', cookie, csrf, body: { action: 'reject', note: 'same device' } });
  assert.equal(no.body.status, 'rejected');
  const audits = await app.db.sql<Array<{ action: string }>>`SELECT action FROM admin_audit_log WHERE action IN ('referral_confirm', 'referral_reject')`;
  assert.equal(audits.length, 2);
  // flagging from the admin, the player card and the numbers
  const fl = await api(app.base, `/api/admin/players/${a.userId}/blat-flag`, { method: 'POST', cookie, csrf, body: { flag: 'review: 21 a day' } });
  assert.equal(fl.status, 200, fl.text);
  const card = await api(app.base, `/api/admin/players/${a.userId}`, { cookie });
  assert.equal(card.body.blat.flag, 'review: 21 a day');
  assert.equal(card.body.blat.referrals.confirmed, REFERRAL_RULES.dailyCap + 1);
  assert.equal(card.body.blat.refCode, code);
  const kidCard = await api(app.base, `/api/admin/players/${over.userId}`, { cookie });
  assert.deepEqual([kidCard.body.blat.referredBy.id, kidCard.body.blat.referredBy.status], [a.userId, 'confirmed']);
  const sum = await api(app.base, '/api/admin/blat?range=30d', { cookie });
  assert.equal(sum.status, 200, sum.text);
  assert.ok(sum.body.issued.level > 0 && sum.body.issued.referral > 0 && sum.body.holders > 0 && sum.body.flagged >= 2);
  assert.ok(sum.body.top.length > 0);
  await api(app.base, `/api/admin/players/${a.userId}/blat-flag`, { method: 'POST', cookie, csrf, body: { flag: null } });
  assert.equal((await api(app.base, `/api/admin/players/${a.userId}`, { cookie })).body.blat.flag, null);
});

test('$BLAT: deleting an account keeps the inviter’s paid reward; the referral row goes with the invited player', async () => {
  const a = await signUp('Keeper');
  const code = (await blat(a.token)).body.referral.code;
  const b = await signUp('Leaver', code);
  await new PgMatchRecorder(app.db.sql, silentLogger).matchCompleted(match(b.userId));
  await repo.tryConfirm(b.userId);
  const paid = await balanceOf(a.userId);
  assert.equal((await api(app.base, '/api/me', { method: 'DELETE', token: b.token })).status, 200);
  assert.equal((await app.db.sql`SELECT 1 FROM referrals WHERE referee_id = ${b.userId}`).length, 0);
  assert.equal(await balanceOf(a.userId), paid);
});
