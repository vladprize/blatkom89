/**
 * $BLAT Tournament stakes (v0.2.17) against PostgreSQL: who may stake (the switch, a new account, a held
 * account, the balance, the day's limit), the reservation — all or nothing, the match settled once from
 * the server's result (a win, a draw with a leaver, a retried result), the stakes back when a match is
 * abandoned or left behind by a stopped server, and the API's refusals.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { KON_STAKES, PROTOCOL_VERSION } from '@blatkom/shared';
import type { KonResponse } from '@blatkom/shared';
import { startTestApp, api, devLogin } from '../admin/testkit.js';
import type { TestApp } from '../admin/testkit.js';
import { PgMatchRecorder } from '../progression/recorder.js';
import { silentLogger } from '../logging/logger.js';
import { UserRepo } from '../auth/users.js';
import { PgStakes, refundStaleStakes } from './stakes.js';
import { KonRepo } from '../kon/repo.js';
import type { MatchCompletion } from '../services/contracts.js';

let app: TestApp;
let rec: PgMatchRecorder;
let stakes: PgStakes;
before(async () => {
  app = await startTestApp({ TOURNAMENT_STAKES: true });
  rec = new PgMatchRecorder(app.db.sql, silentLogger);
  stakes = new PgStakes(app.db.sql, true);
});
after(async () => {
  await app.close();
});

const sql = () => app.db.sql;
const balanceOf = async (userId: string) => (await sql()<Array<{ blat: number }>>`SELECT blat FROM profiles WHERE user_id = ${userId}`)[0]!.blat;
const stateOf = async (matchId: string) => (await sql()<Array<{ stakes_state: string | null; status: string }>>`SELECT stakes_state, status FROM matches WHERE id = ${matchId}`)[0];

/** A player straight in the database: a day-old account (unless `fresh`) with `blat` $BLAT. */
async function player(name: string, blat: number, o: { fresh?: boolean; flag?: string } = {}): Promise<string> {
  const { userId } = await new UserRepo(sql()).upsertDev(`dev-${randomUUID().slice(0, 12)}`, name, null);
  await sql()`INSERT INTO profiles (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;
  await sql()`UPDATE profiles SET blat = ${blat} WHERE user_id = ${userId}`;
  if (!o.fresh) await sql()`UPDATE users SET created_at = now() - interval '2 days' WHERE id = ${userId}`;
  if (o.flag) await sql()`UPDATE users SET blat_flag = ${o.flag} WHERE id = ${userId}`;
  return userId;
}

const reservation = (matchId: string, stake: number, userIds: string[]) => ({ matchId, roomId: 'room1', mapId: 'factory' as const, mode: 'teams' as const, isPrivate: true, kon: '2x2' as const, stake, userIds });

function completion(matchId: string, stake: number, players: Array<{ userId: string; team: 0 | 1; completed?: boolean }>, winnerTeam: 0 | 1 | null): MatchCompletion {
  const now = Date.now();
  return {
    matchId,
    roomId: 'room1',
    mapId: 'factory',
    mode: 'teams',
    winnerTeam,
    isPrivate: true,
    startedAt: new Date(now - 200_000),
    endedAt: new Date(now),
    durationMs: 200_000,
    endReason: 'time',
    playersAtEnd: players.filter((p) => p.completed !== false).length,
    kon: '2x2',
    stake,
    participants: players.map((p) => ({
      userId: p.userId,
      character: 'petya',
      place: winnerTeam === null || p.team === winnerTeam ? 1 : 2,
      team: p.team,
      teamOutcome: winnerTeam === null ? 'draw' : p.team === winnerTeam ? 'win' : 'loss',
      kills: 3,
      assists: 0,
      deaths: 2,
      score: 3,
      damageDealt: 300,
      completed: p.completed !== false,
      viaInvite: true,
      playtimeMs: 200_000,
    })),
  };
}

test('who may stake: the switch, a new account, a held account, the balance, the day’s limit', async () => {
  const ok = await player('Stavka', 30_000);
  const fresh = await player('Novichok', 5000, { fresh: true });
  const held = await player('Pod-proverkoy', 5000, { flag: 'checked by hand' });
  const poor = await player('Bedny', 99);
  assert.equal(await stakes.check(ok, 5000), null);
  assert.equal(await stakes.check(ok, 0), null);
  assert.equal(await new PgStakes(sql(), false).check(ok, 100), 'stakes_off');
  assert.equal(await stakes.check(fresh, 100), 'account_new');
  assert.equal(await stakes.check(held, 100), 'blat_flagged');
  assert.equal(await stakes.check(poor, 100), 'blat_low');
  const st = await stakes.status(fresh);
  assert.equal(st.refusal, 'account_new');
  assert.ok(st.from && Date.parse(st.from) > Date.now());
  // the day's limit: 20 000 staked in 24 hours (a refunded stake doesn't count)
  const others = [await player('Drug1', 30_000), await player('Drug2', 30_000), await player('Drug3', 30_000)];
  for (let i = 0; i < KON_STAKES.dailyLimit / 5000; i++) {
    const r = await stakes.reserve(reservation(randomUUID(), 5000, [ok, ...others]));
    assert.ok(r.ok);
  }
  assert.equal(await stakes.check(ok, 100), 'daily_limit');
  assert.equal((await stakes.status(ok)).dailyLeft, 0);
  const last = (await sql()<Array<{ id: string }>>`SELECT id FROM matches WHERE stakes_state = 'reserved' ORDER BY started_at DESC LIMIT 1`)[0]!.id;
  assert.equal(await stakes.refund(last), 4);
  assert.equal(await stakes.check(ok, 5000), null, 'the refunded stake doesn’t count');
  assert.equal(await stakes.check(ok, 5100), 'daily_limit');
});

test('the reservation is all or nothing; the winners share the pool once; a retried result pays nothing more', async () => {
  const [a, b, c, d] = [await player('Ataman', 1000), await player('Bratok', 600), await player('Cyrus', 500), await player('Dimon', 499)];
  const failed = randomUUID();
  const r = await stakes.reserve(reservation(failed, 500, [a, b, c, d]));
  assert.deepEqual(r, { ok: false, userId: d, reason: 'blat_low' });
  assert.deepEqual([await balanceOf(a), await balanceOf(b), await balanceOf(c), await balanceOf(d)], [1000, 600, 500, 499], 'nothing taken');
  assert.equal(await stateOf(failed), undefined, 'no match row either');

  await sql()`UPDATE profiles SET blat = 500 WHERE user_id = ${d}`;
  const id = randomUUID();
  assert.deepEqual(await stakes.reserve(reservation(id, 500, [a, b, c, d])), { ok: true });
  assert.deepEqual([await balanceOf(a), await balanceOf(b), await balanceOf(c), await balanceOf(d)], [500, 100, 0, 0]);
  assert.equal((await stateOf(id))!.stakes_state, 'reserved');
  // a second reservation of the same match can't take the stakes again
  await assert.rejects(stakes.reserve(reservation(id, 500, [a, b, c, d])));

  const m = completion(id, 500, [{ userId: a, team: 0 }, { userId: b, team: 0 }, { userId: c, team: 1 }, { userId: d, team: 1 }], 0);
  const personal = await rec.matchCompleted(m);
  assert.deepEqual(personal.get(a)?.stake, { stake: 500, payout: 1000, outcome: 'win' });
  assert.deepEqual(personal.get(c)?.stake, { stake: 500, payout: 0, outcome: 'loss' });
  const levels = async (u: string) => (await sql()<Array<{ s: number }>>`SELECT COALESCE(sum(delta), 0)::int AS s FROM currency_ledger WHERE user_id = ${u} AND currency = 'blat' AND reason = 'level'`)[0]!.s;
  // the levels the match reached pay $BLAT as always; the stakes come on top of that
  assert.equal(await balanceOf(a), 1500 + (await levels(a)));
  assert.equal(await balanceOf(b), 1100 + (await levels(b)));
  assert.equal(await balanceOf(c), 0 + (await levels(c)));
  assert.equal(personal.get(a)?.totalBlat, await balanceOf(a));
  assert.equal((await stateOf(id))!.stakes_state, 'settled');
  const before = await balanceOf(a);
  await rec.matchCompleted(m);
  assert.equal(await balanceOf(a), before, 'a retried result pays nothing more');
  const rows = await sql()<Array<{ reason: string; n: number; s: number }>>`
    SELECT reason, count(*)::int AS n, sum(delta)::int AS s FROM currency_ledger WHERE currency = 'blat' AND ref LIKE ${'%' + id} GROUP BY reason ORDER BY reason`;
  assert.deepEqual([...rows].map((r) => ({ ...r })), [{ reason: 'stake', n: 4, s: -2000 }, { reason: 'stake_win', n: 2, s: 2000 }], 'nothing created or lost');
});

test('a draw returns the stakes and shares a leaver’s among those who stayed; history shows it', async () => {
  const [a, b, c, d] = [await player('Ataman2', 500), await player('Bratok2', 500), await player('Cyrus2', 500), await player('Dimon2', 500)];
  const id = randomUUID();
  assert.ok((await stakes.reserve(reservation(id, 500, [a, b, c, d]))).ok);
  const personal = await rec.matchCompleted(completion(id, 500, [{ userId: a, team: 0 }, { userId: b, team: 0, completed: false }, { userId: c, team: 1 }, { userId: d, team: 1 }], null));
  assert.deepEqual([personal.get(a)?.stake?.payout, personal.get(b)?.stake?.payout, personal.get(c)?.stake?.payout, personal.get(d)?.stake?.payout].reduce((x, y) => x! + y!, 0), 2000);
  assert.equal(personal.get(b)?.stake?.outcome, 'loss');
  assert.equal(personal.get(a)?.stake?.outcome, 'draw');
  assert.equal((await stateOf(id))!.stakes_state, 'settled');
  // the tournament's history: the stake and what came back
  const mine = (await new KonRepo(sql()).history(a)).find((e) => e.matchId === id);
  assert.deepEqual([mine?.stake, mine?.payout, mine?.outcome], [500, personal.get(a)?.stake?.payout, 'draw']);
  const left = (await new KonRepo(sql()).history(b)).find((e) => e.matchId === id);
  assert.deepEqual([left?.stake, left?.payout, left?.left], [500, 0, true]);
});

test('stakes come back when a match is abandoned, and when a stopped server left them reserved', async () => {
  const [a, b] = [await player('Brosil', 700), await player('Ostalsya', 700)];
  const id = randomUUID();
  assert.ok((await stakes.reserve({ ...reservation(id, 100, [a, b]), kon: '1x1' })).ok);
  await rec.matchAbandoned(id, 'shutdown');
  assert.deepEqual([await balanceOf(a), await balanceOf(b)], [700, 700]);
  assert.deepEqual(await stateOf(id), { stakes_state: 'refunded', status: 'abandoned' });
  await rec.matchAbandoned(id, 'shutdown');
  assert.deepEqual([await balanceOf(a), await balanceOf(b)], [700, 700], 'once only');

  const old = randomUUID();
  assert.ok((await stakes.reserve({ ...reservation(old, 100, [a, b]), kon: '1x1' })).ok);
  assert.equal(await refundStaleStakes(sql(), 60_000), 0, 'not old enough yet');
  await sql()`UPDATE matches SET started_at = now() - interval '2 hours' WHERE id = ${old}`;
  assert.equal(await refundStaleStakes(sql(), 60_000), 1);
  assert.deepEqual([await balanceOf(a), await balanceOf(b)], [700, 700]);
  assert.deepEqual(await stateOf(old), { stakes_state: 'refunded', status: 'abandoned' });
});

test('API: a stake needs a tournament room and a player who can stake; the tournament screen shows the stakes', async () => {
  const { token, userId } = await devLogin(app.base, 'Novy-igrok');
  const r = await api(app.base, '/api/rooms', { method: 'POST', token, body: { mapId: 'factory', isPrivate: true, mode: 'teams', kon: '2x2', stake: 500 } });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'account_new');
  const odd = await api(app.base, '/api/rooms/quick', { method: 'POST', token, body: { mode: 'teams', kon: '2x2', stake: 250 } });
  assert.equal(odd.status, 400);
  const noKon = await api(app.base, '/api/rooms', { method: 'POST', token, body: { mapId: 'factory', isPrivate: true, mode: 'teams', stake: 500 } });
  assert.equal(noKon.status, 400);
  await sql()`UPDATE users SET created_at = now() - interval '2 days' WHERE id = ${userId}`;
  await sql()`UPDATE profiles SET blat = 600 WHERE user_id = ${userId}`;
  const ok = await api(app.base, '/api/rooms', { method: 'POST', token, body: { mapId: 'factory', isPrivate: true, mode: 'teams', kon: '2x2', stake: 500 } });
  assert.equal(ok.status, 201, ok.text);
  assert.equal(ok.body.stake, 500);
  const quick = await api(app.base, '/api/rooms/quick', { method: 'POST', token, body: { mode: 'teams', kon: '1x1', stake: 1000 } });
  assert.equal(quick.status, 409);
  assert.equal(quick.body.error.code, 'blat_low');
  const inv = await api(app.base, `/api/invites/${ok.body.inviteCode}`, {});
  assert.equal(inv.body.stake, 500);
  const kon = await api<KonResponse>(app.base, '/api/kon', { token });
  assert.equal(kon.status, 200);
  assert.deepEqual(kon.body.stakes, { enabled: true, balance: 600, refusal: null, dailyLeft: KON_STAKES.dailyLimit, from: null });
});

test('WebSocket: a staked room lets in only a player who agreed to its stake and can stake it', async () => {
  const host = await devLogin(app.base, 'Hozyain');
  const guest = await devLogin(app.base, 'Gost');
  for (const u of [host, guest]) {
    await sql()`UPDATE users SET created_at = now() - interval '2 days' WHERE id = ${u.userId}`;
    await sql()`UPDATE profiles SET blat = 1000 WHERE user_id = ${u.userId}`;
  }
  const room = await api(app.base, '/api/rooms', { method: 'POST', token: host.token, body: { mapId: 'factory', isPrivate: true, mode: 'teams', kon: '1x1', stake: 500 } });
  assert.equal(room.status, 201, room.text);
  const hello = async (token: string, stake?: number) => {
    const ws = new WebSocket(`${app.wsBase}/ws`);
    await new Promise<void>((r) => ws.on('open', () => r()));
    ws.send(JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION, token, roomId: room.body.roomId, character: 'petya', clientVersion: 'test', ...(stake !== undefined ? { stake } : {}) }));
    const first = await new Promise<{ type: string; code?: string }>((r) => ws.once('message', (d) => r(JSON.parse(String(d)))));
    return { ws, first };
  };
  // an old client (no stake in its hello) or a different stake: not in
  assert.deepEqual((await hello(guest.token)).first, { type: 'error', code: 'stake_confirm', message: 'This room’s stake is 500 $BLAT — confirm it to come in' });
  assert.equal((await hello(guest.token, 100)).first.code, 'stake_confirm');
  // can't stake it: not in either
  await sql()`UPDATE profiles SET blat = 499 WHERE user_id = ${guest.userId}`;
  assert.equal((await hello(guest.token, 500)).first.code, 'blat_low');
  await sql()`UPDATE profiles SET blat = 1000 WHERE user_id = ${guest.userId}`;
  const a = await hello(host.token, 500);
  const b = await hello(guest.token, 500);
  assert.equal(a.first.type, 'welcome');
  assert.equal(b.first.type, 'welcome');
  a.ws.close();
  b.ws.close();
});
