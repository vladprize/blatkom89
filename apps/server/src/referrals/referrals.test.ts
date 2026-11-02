/**
 * v0.2.18 against PostgreSQL: BLATS for levels (10 for every new level, each level once — retries,
 * concurrent requests and re-processed matches never pay twice) and invitations paid in talons (codes
 * attached only to new accounts, counted after a whole match — not a short one, not an idle one — the daily
 * cap and flags holding them for an administrator, concurrent confirmations, the admin's review and numbers).
 * No $BLAT anywhere.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BLATS_PER_LEVEL, REFERRAL_RULES, REFERRAL_TALONS } from '@blatkom/shared';
import type { PublicProfile, ReferralResponse } from '@blatkom/shared';
import { startTestApp, api, devLogin, cookieFrom } from '../admin/testkit.js';
import type { TestApp } from '../admin/testkit.js';
import { ADMIN_COOKIE } from '../admin/auth.js';
import { PgMatchRecorder } from '../progression/recorder.js';
import { silentLogger } from '../logging/logger.js';
import { ReferralRepo } from './repo.js';
import { UserRepo } from '../auth/users.js';
import type { ConfirmResult } from './repo.js';
import type { MatchCompletion, MatchParticipantResult } from '../services/contracts.js';

let app: TestApp;
let rec: PgMatchRecorder;
let repo: ReferralRepo;
before(async () => {
  app = await startTestApp({ ADMIN_BOOTSTRAP_USERNAME: 'root', ADMIN_BOOTSTRAP_PASSWORD: 'correct-horse-battery-staple', PUBLIC_URL: 'https://game.test', TELEGRAM_BOT_USERNAME: 'blatkom_bot' });
  rec = new PgMatchRecorder(app.db.sql, silentLogger);
  repo = new ReferralRepo(app.db.sql, { publicUrl: 'https://game.test' });
});
after(async () => {
  await app.close();
});

const refs = (token: string) => api<ReferralResponse>(app.base, '/api/referrals', { token });
const blatsOf = async (userId: string) => (await app.db.sql<Array<{ diamonds: number }>>`SELECT diamonds FROM profiles WHERE user_id = ${userId}`)[0]!.diamonds;
const talonsOf = async (userId: string) => (await app.db.sql<Array<{ tokens: number }>>`SELECT tokens FROM profiles WHERE user_id = ${userId}`)[0]!.tokens;
const levelRefs = async (userId: string) => (await app.db.sql<Array<{ ref: string }>>`SELECT ref FROM currency_ledger WHERE user_id = ${userId} AND currency = 'diamonds' AND reason = 'level' ORDER BY id`).map((r) => r.ref);
const noBlat = async (userId: string) => (await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM currency_ledger WHERE user_id = ${userId} AND currency = 'blat'`)[0]!.n === 0;

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

test('BLATS for levels: nothing at level 1, 10 for every new level — once; the levels reached before are paid at the next profile read; concurrent reads pay once', async () => {
  const u = await signUp('Blats Leveller');
  assert.deepEqual([u.profile.diamonds, u.profile.blatsCredited], [0, undefined], 'level 1 pays nothing');
  assert.equal((u.profile as unknown as Record<string, unknown>).blat, undefined, 'no $BLAT in the profile');
  // levels reached before v0.2.18 are paid at the next profile read, and the profile says so once
  await app.db.sql`UPDATE profiles SET level = 5 WHERE user_id = ${u.userId}`;
  const back = await api<PublicProfile>(app.base, '/api/me', { token: u.token });
  assert.deepEqual([back.body.blatsCredited, back.body.diamonds], [4 * BLATS_PER_LEVEL, 40]);
  assert.equal((await api<PublicProfile>(app.base, '/api/me', { token: u.token })).body.blatsCredited, undefined, 'nothing twice');
  // six reads at once for three new levels: paid once
  await app.db.sql`UPDATE profiles SET level = 8 WHERE user_id = ${u.userId}`;
  const many = await Promise.all(Array.from({ length: 6 }, () => api<PublicProfile>(app.base, '/api/me', { token: u.token }).then((r) => r.body.blatsCredited ?? 0)));
  assert.equal(many.reduce((a, n) => a + n, 0), 3 * BLATS_PER_LEVEL);
  assert.deepEqual(await levelRefs(u.userId), ['level:2', 'level:3', 'level:4', 'level:5', 'level:6', 'level:7', 'level:8']);
  assert.equal(await blatsOf(u.userId), 70);
  assert.ok(await noBlat(u.userId));
});

test('BLATS in a match: the levels reached are paid with the results; a re-processed match pays nothing more', async () => {
  const u = await devLogin(app.base, 'Blats Matcher');
  assert.equal(await blatsOf(u.userId), 0);
  const m = match(u.userId);
  const res = (await rec.matchCompleted(m)).get(u.userId)!;
  assert.ok(res.level >= 2, `levelled up (${res.level})`);
  const expected = (res.level - 1) * BLATS_PER_LEVEL;
  assert.deepEqual([res.blatsGained, res.totalBlats], [expected, expected]);
  await rec.matchCompleted(m);
  await Promise.all([rec.matchCompleted(m), rec.matchCompleted(m)]);
  assert.equal(await blatsOf(u.userId), expected);
  assert.equal((await levelRefs(u.userId)).length, res.level - 1);
  assert.ok(await noBlat(u.userId));
});

test('referrals: a code per player, links; attached only to a new account opened with it; unknown codes ignored', async () => {
  const a = await signUp('Inviter One');
  const o = (await refs(a.token)).body;
  assert.match(o.code, /^[A-Za-z0-9]{8}$/);
  assert.equal(o.link, `https://game.test/?ref=${o.code}`);
  assert.equal(o.telegramLink, `https://t.me/blatkom_bot?start=ref_${o.code}`);
  assert.equal((await refs(a.token)).body.code, o.code, 'the same code every time');
  const b = await signUp('Invited Bee', o.code.toLowerCase());
  const [row] = await app.db.sql<Array<{ referrer_id: string; status: string }>>`SELECT referrer_id, status FROM referrals WHERE referee_id = ${b.userId}`;
  assert.deepEqual([row?.referrer_id, row?.status], [a.userId, 'pending'], 'codes match in any letter case');
  // the same account signing in again with another code: nothing changes
  const again = await api(app.base, '/api/auth/dev', { method: 'POST', body: { name: 'Invited Bee', deviceId: b.deviceId, ref: 'Zzzzzzzz' } });
  assert.equal(again.status, 200);
  assert.equal((await app.db.sql`SELECT 1 FROM referrals WHERE referee_id = ${b.userId}`).length, 1);
  const c = await signUp('Nobody Sent', 'NoSuchCode');
  assert.equal((await app.db.sql`SELECT 1 FROM referrals WHERE referee_id = ${c.userId}`).length, 0);
  const view = (await refs(a.token)).body;
  assert.deepEqual([view.invited, view.pending, view.confirmed, view.reward, view.earned], [1, 1, 0, REFERRAL_TALONS, 0]);
  assert.equal(view.recent[0]?.name, 'Invited Bee');
  assert.equal((await api(app.base, '/api/blat', { token: a.token })).status, 404, 'the $BLAT screen is gone');
});

test('referrals: counted after a whole match — not a short one, not an idle one; the inviter hears it and gets the talons', async () => {
  const a = await signUp('Inviter Two');
  const code = (await refs(a.token)).body.code;
  const before0 = await talonsOf(a.userId);
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
  if (heard[0]?.status === 'confirmed') assert.deepEqual([heard[0].paid.referrerId, heard[0].paid.reward, heard[0].paid.ordinal, heard[0].paid.refereeName, heard[0].paid.balance], [a.userId, REFERRAL_TALONS, 1, 'Short Match', before0 + REFERRAL_TALONS]);
  assert.equal(await talonsOf(a.userId), before0 + REFERRAL_TALONS);
  // the referee opening the screen later changes nothing
  await refs(b.token);
  assert.equal(await talonsOf(a.userId), before0 + REFERRAL_TALONS);
  // every friend pays the same: the fifth too
  for (let i = 0; i < 3; i++) await invitedRaw(`Old Friend ${i}`, a.userId, code, 'confirmed', '3 days', i + 2);
  const fifth = await signUp('Fifth Friend', code);
  await rec.matchCompleted(match(fifth.userId));
  for (let i = 0; i < 50 && heard.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
  const r5 = heard[1];
  assert.ok(r5?.status === 'confirmed' && r5.paid.ordinal === 5 && r5.paid.reward === REFERRAL_TALONS, JSON.stringify(r5));
  const view = (await refs(a.token)).body;
  assert.deepEqual([view.confirmed, view.earned, view.reward], [5, 2 * REFERRAL_TALONS, REFERRAL_TALONS]);
  assert.ok(view.recent.some((x) => x.name === 'Fifth Friend' && x.reward === REFERRAL_TALONS && x.status === 'confirmed'));
  const ledger = await app.db.sql<Array<{ currency: string; delta: number }>>`SELECT currency, delta FROM currency_ledger WHERE user_id = ${a.userId} AND reason = 'referral'`;
  assert.deepEqual(ledger.map((l) => [l.currency, l.delta]), [['tokens', REFERRAL_TALONS], ['tokens', REFERRAL_TALONS]]);
  assert.ok(await noBlat(a.userId));
  rec.onReferral = null;
});

test('referrals: concurrent confirmations — one payment per invited player, numbers never repeat', async () => {
  const a = await signUp('Inviter Three');
  const code = (await refs(a.token)).body.code;
  const kids = await Promise.all(['Kid A', 'Kid B', 'Kid C'].map((n) => signUp(n, code)));
  // their matches are recorded without the automatic confirmation racing us
  const quiet = new PgMatchRecorder(app.db.sql, silentLogger);
  for (const k of kids) await quiet.matchCompleted(match(k.userId));
  await new Promise((r) => setTimeout(r, 300));
  await app.db.sql`UPDATE referrals SET status = 'pending', decided_at = NULL, ordinal = NULL, reward = 0 WHERE referrer_id = ${a.userId}`;
  await app.db.sql`DELETE FROM currency_ledger WHERE user_id = ${a.userId} AND reason = 'referral'`;
  await app.db.sql`UPDATE profiles SET tokens = 0 WHERE user_id = ${a.userId}`;
  const results = await Promise.all([...kids, ...kids].map((k) => repo.tryConfirm(k.userId)));
  const paid = results.filter((r): r is Extract<ConfirmResult, { status: 'confirmed' }> => r?.status === 'confirmed');
  assert.equal(paid.length, 3, 'each invited player once');
  assert.deepEqual(paid.map((p) => p.paid.ordinal).sort(), [1, 2, 3]);
  assert.equal(await talonsOf(a.userId), 3 * REFERRAL_TALONS);
  assert.equal((await app.db.sql`SELECT 1 FROM currency_ledger WHERE user_id = ${a.userId} AND reason = 'referral'`).length, 3);
});

test('referrals: over the daily cap or a flagged account waits for an administrator, who counts it (audited) or turns it down', async () => {
  const a = await signUp('Busy Inviter');
  const code = (await refs(a.token)).body.code;
  for (let i = 0; i < REFERRAL_RULES.dailyCap; i++) await invitedRaw(`Today ${i}`, a.userId, code, 'confirmed', '1 hour', i + 1);
  const over = await signUp('One Too Many', code);
  await new PgMatchRecorder(app.db.sql, silentLogger).matchCompleted(match(over.userId));
  const held = await repo.tryConfirm(over.userId);
  const [st] = await app.db.sql<Array<{ status: string; note: string }>>`SELECT status, note FROM referrals WHERE referee_id = ${over.userId}`;
  assert.ok(held === null || held.status === 'held');
  assert.deepEqual([st!.status, st!.note], ['held', `over ${REFERRAL_RULES.dailyCap} a day`]);
  // a flagged inviter: held too
  const f = await signUp('Flagged Inviter');
  const fcode = (await refs(f.token)).body.code;
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
  const before0 = await talonsOf(a.userId);
  assert.equal((await api(app.base, `/api/admin/referrals/${over.userId}`, { method: 'POST', cookie, body: { action: 'confirm' } })).status, 403, 'CSRF');
  const ok = await api(app.base, `/api/admin/referrals/${over.userId}`, { method: 'POST', cookie, csrf, body: { action: 'confirm', note: 'checked by hand' } });
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual([ok.body.ordinal, ok.body.reward], [REFERRAL_RULES.dailyCap + 1, REFERRAL_TALONS]);
  assert.equal(await talonsOf(a.userId), before0 + REFERRAL_TALONS);
  assert.equal((await api(app.base, `/api/admin/referrals/${over.userId}`, { method: 'POST', cookie, csrf, body: { action: 'confirm' } })).status, 409, 'decided once');
  const no = await api(app.base, `/api/admin/referrals/${fk.userId}`, { method: 'POST', cookie, csrf, body: { action: 'reject', note: 'same device' } });
  assert.equal(no.body.status, 'rejected');
  const audits = await app.db.sql<Array<{ action: string }>>`SELECT action FROM admin_audit_log WHERE action IN ('referral_confirm', 'referral_reject')`;
  assert.equal(audits.length, 2);
  // flagging from the admin, the player card and the numbers
  const fl = await api(app.base, `/api/admin/players/${a.userId}/flag`, { method: 'POST', cookie, csrf, body: { flag: 'review: 21 a day' } });
  assert.equal(fl.status, 200, fl.text);
  const card = await api(app.base, `/api/admin/players/${a.userId}`, { cookie });
  assert.equal(card.body.referral.flag, 'review: 21 a day');
  assert.equal(card.body.referral.referrals.confirmed, REFERRAL_RULES.dailyCap + 1);
  assert.equal(card.body.referral.refCode, code);
  assert.equal(card.body.referral.earned, REFERRAL_TALONS);
  assert.equal(card.body.blat, undefined, 'no $BLAT on the card');
  const kidCard = await api(app.base, `/api/admin/players/${over.userId}`, { cookie });
  assert.deepEqual([kidCard.body.referral.referredBy.id, kidCard.body.referral.referredBy.status], [a.userId, 'confirmed']);
  const sum = await api(app.base, '/api/admin/referrals/summary?range=30d', { cookie });
  assert.equal(sum.status, 200, sum.text);
  assert.ok(sum.body.referrals.confirmed > 0 && sum.body.referrals.rejected >= 1 && sum.body.talons >= REFERRAL_TALONS && sum.body.talonsInRange >= REFERRAL_TALONS && sum.body.flagged >= 2 && sum.body.attachedInRange > 0, sum.text);
  await api(app.base, `/api/admin/players/${a.userId}/flag`, { method: 'POST', cookie, csrf, body: { flag: null } });
  assert.equal((await api(app.base, `/api/admin/players/${a.userId}`, { cookie })).body.referral.flag, null);
});

test('referrals: deleting an account keeps the inviter’s paid talons; the referral row goes with the invited player', async () => {
  const a = await signUp('Keeper');
  const code = (await refs(a.token)).body.code;
  const b = await signUp('Leaver', code);
  await new PgMatchRecorder(app.db.sql, silentLogger).matchCompleted(match(b.userId));
  await repo.tryConfirm(b.userId);
  const paid = await talonsOf(a.userId);
  assert.ok(paid >= REFERRAL_TALONS);
  assert.equal((await api(app.base, '/api/me', { method: 'DELETE', token: b.token })).status, 200);
  assert.equal((await app.db.sql`SELECT 1 FROM referrals WHERE referee_id = ${b.userId}`).length, 0);
  assert.equal(await talonsOf(a.userId), paid);
});
