/**
 * «Блатной кон» results against PostgreSQL (V2.0 part D): a 2×2 match moves the Kon rating by Elo (the
 * first matches by K = 40), the leaver loses, records and streaks, the general rating stays put while
 * XP is earned, a side that is one gang moves the gang's Kon rating, re-processing changes nothing, a
 * draw; the player's numbers, history (team-mates and opponents) and the tables of players and gangs.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { KON_RATING } from '@blatkom/shared';
import type { KonResponse, KonTopResponse } from '@blatkom/shared';
import { startTestApp, api, devLogin } from '../admin/testkit.js';
import type { TestApp } from '../admin/testkit.js';
import { PgMatchRecorder } from '../progression/recorder.js';
import { silentLogger } from '../logging/logger.js';
import type { MatchCompletion, MatchParticipantResult } from '../services/contracts.js';

let app: TestApp;
let rec: PgMatchRecorder;
before(async () => {
  app = await startTestApp({});
  rec = new PgMatchRecorder(app.db.sql, silentLogger);
});
after(async () => {
  await app.close();
});

type Who = { userId: string; token: string };
const prof = async (u: Who) =>
  (await app.db.sql<Array<{ kon_rating: number; kon_matches: number; kon_wins: number; kon_losses: number; kon_draws: number; kon_streak: number; kon_best_streak: number; rating: number; matches_played: number; xp: number }>>`
    SELECT kon_rating, kon_matches, kon_wins, kon_losses, kon_draws, kon_streak, kon_best_streak, rating, matches_played, xp FROM profiles WHERE user_id = ${u.userId}`)[0]!;

function konMatch(format: MatchCompletion['kon'], winner: 0 | 1 | null, sides: Array<{ u: Who; team: 0 | 1; completed?: boolean; kills?: number }>): MatchCompletion {
  const now = Date.now();
  const participants: MatchParticipantResult[] = sides.map((s) => ({
    userId: s.u.userId,
    character: 'petya',
    place: winner === null || s.team === winner ? 1 : 2,
    team: s.team,
    teamOutcome: winner === null ? 'draw' : s.team === winner && s.completed !== false ? 'win' : 'loss',
    kills: s.kills ?? 2,
    assists: 0,
    deaths: 1,
    score: (s.kills ?? 2) * 2,
    damageDealt: 200,
    objectives: 0,
    completed: s.completed !== false,
    viaInvite: false,
    playtimeMs: 200_000,
  }));
  return { matchId: randomUUID(), roomId: 'konroom01', mapId: 'factory', mode: 'teams', winnerTeam: winner, isPrivate: true, startedAt: new Date(now - 240_000), endedAt: new Date(now), durationMs: 240_000, endReason: 'time', playersAtEnd: sides.length, peopleAtEnd: sides.length, fillAtEnd: 0, participants, kon: format };
}

let a: Who, b: Who, c: Who, d: Who, gangId: string;

test('Kon 2×2: Elo by side averages, the leaver loses, records and streaks; the general rating stays, XP comes; a one-gang side moves the gang; once only', async () => {
  const [x0, x1, x2, x3] = await Promise.all(['Kon Ataman', 'Kon Bratok', 'Kon Cyrus', 'Kon Dimon'].map((n) => devLogin(app.base, n)));
  [a, b, c, d] = [x0!, x1!, x2!, x3!];
  // a and b play for one gang
  const made = await api(app.base, '/api/clubs', { method: 'POST', token: a!.token, body: { name: 'Kon Brigade', tag: 'KONB', flag: { pattern: 'h3', colors: [0, 8, 5] }, emblem: { icon: 'gear', color: 9 } } });
  assert.equal(made.status, 200, made.text);
  gangId = made.body.club?.id ?? made.body.id;
  await app.db.sql`INSERT INTO club_members (club_id, user_id, role) VALUES (${gangId}, ${b!.userId}, 'member')`;
  const m = konMatch('2x2', 0, [{ u: a!, team: 0, kills: 6 }, { u: b!, team: 0 }, { u: c!, team: 1 }, { u: d!, team: 1, completed: false }]);
  const res = await rec.matchCompleted(m);
  const half = KON_RATING.kNew / 2;
  assert.deepEqual(res.get(a!.userId)!.kon, { outcome: 'win', delta: half, rating: 1000 + half });
  assert.deepEqual(res.get(d!.userId)!.kon, { outcome: 'loss', delta: -half, rating: 1000 - half }, 'the leaver loses');
  assert.equal(res.get(a!.userId)!.ratingDelta, 0, 'the general rating stays put');
  assert.ok(res.get(a!.userId)!.xpGained > 0, 'XP is earned as in any match');
  const pa = await prof(a!);
  assert.deepEqual([pa.kon_rating, pa.kon_matches, pa.kon_wins, pa.kon_streak, pa.kon_best_streak, pa.rating, pa.matches_played], [1020, 1, 1, 1, 1, 1000, 1]);
  const pc = await prof(c!);
  assert.deepEqual([pc.kon_rating, pc.kon_losses, pc.kon_streak], [980, 1, 0]);
  const [g] = await app.db.sql<Array<{ kon_rating: number; kon_wins: number; kon_matches: number }>>`SELECT kon_rating, kon_wins, kon_matches FROM clubs WHERE id = ${gangId}`;
  assert.deepEqual([g!.kon_rating, g!.kon_wins, g!.kon_matches], [1020, 1, 1], 'the gang played as a side');
  const [row] = await app.db.sql<Array<{ kon_format: string; winner_team: number }>>`SELECT kon_format, winner_team FROM matches WHERE id = ${m.matchId}`;
  assert.deepEqual([row!.kon_format, row!.winner_team], ['2x2', 0]);
  // re-processed (also twice at once): nothing more
  const again = await Promise.all([rec.matchCompleted(m), rec.matchCompleted(m)]);
  assert.deepEqual(again[0].get(a!.userId)!.kon, { outcome: 'win', delta: half, rating: 1000 + half });
  assert.equal((await prof(a!)).kon_rating, 1020);
  assert.equal((await app.db.sql<Array<{ kon_matches: number }>>`SELECT kon_matches FROM clubs WHERE id = ${gangId}`)[0]!.kon_matches, 1);
  // a second win: the streak grows, the gain shrinks against weaker opponents
  const m2 = await rec.matchCompleted(konMatch('2x2', 1, [{ u: c!, team: 0 }, { u: d!, team: 0 }, { u: a!, team: 1 }, { u: b!, team: 1 }]));
  const k2 = m2.get(a!.userId)!.kon!;
  assert.ok(k2.outcome === 'win' && k2.delta > 0 && k2.delta < half, `${k2.delta}`);
  assert.deepEqual([(await prof(a!)).kon_streak, (await prof(a!)).kon_best_streak], [2, 2]);
});

test('Kon 1×1 draw: nobody moves, a draw is counted, a single player is never a gang', async () => {
  const before0 = await app.db.sql<Array<{ kon_matches: number }>>`SELECT kon_matches FROM clubs WHERE id = ${gangId}`;
  const res = await rec.matchCompleted(konMatch('1x1', null, [{ u: a!, team: 0 }, { u: c!, team: 1 }]));
  const ka = res.get(a!.userId)!.kon!;
  assert.equal(ka.outcome, 'draw');
  assert.ok(ka.delta < 0, 'a draw against a weaker player costs a little');
  assert.ok(res.get(c!.userId)!.kon!.delta > 0);
  assert.equal((await prof(a!)).kon_draws, 1);
  assert.equal((await prof(a!)).kon_streak, 0, 'a draw ends the streak');
  assert.deepEqual(await app.db.sql`SELECT kon_matches FROM clubs WHERE id = ${gangId}`, before0);
});

test('Kon API: the player’s numbers and history with team-mates and opponents; the tables of players and gangs', async () => {
  assert.equal((await api(app.base, '/api/kon')).status, 401);
  const me = await api<KonResponse>(app.base, '/api/kon', { token: a!.token });
  assert.equal(me.status, 200, me.text);
  assert.equal(me.body.me.matches, 3);
  assert.equal(me.body.me.wins, 2);
  assert.equal(me.body.me.bestStreak, 2);
  assert.deepEqual(me.body.waiting, { '1x1': 0, '2x2': 0, '3x3': 0, '5x5': 0 });
  const [last, second, first] = me.body.history;
  assert.deepEqual([last!.format, last!.outcome, last!.rivals], ['1x1', 'draw', ['Kon Cyrus']]);
  assert.deepEqual([first!.format, first!.outcome, first!.delta, first!.mates, first!.rivals, first!.kills], ['2x2', 'win', 20, ['Kon Bratok'], ['Kon Cyrus', 'Kon Dimon'], 6]);
  assert.equal(second!.outcome, 'win');
  const dHist = (await api<KonResponse>(app.base, '/api/kon', { token: d!.token })).body.history;
  assert.deepEqual([dHist.at(-1)!.outcome, dHist.at(-1)!.left], ['loss', true], 'the leaver sees the match as left — a loss');
  const top = await api<KonTopResponse>(app.base, '/api/kon/top?by=players', { token: c!.token });
  assert.equal(top.status, 200);
  assert.ok(top.body.rows.length >= 4);
  // b won both 2×2 matches; a won them too but then drew with a weaker player
  assert.deepEqual([top.body.rows[0]!.id, top.body.rows[1]!.id], [b!.userId, a!.userId], 'the best first');
  assert.deepEqual(top.body.rows.map((r) => r.place), top.body.rows.map((_, i) => i + 1));
  assert.equal(top.body.me!.id, c!.userId);
  const gangs = await api<KonTopResponse>(app.base, '/api/kon/top?by=gangs', { token: b!.token });
  assert.deepEqual([gangs.body.rows[0]!.id, gangs.body.rows[0]!.tag, gangs.body.me!.id], [gangId, 'KONB', gangId]);
  const outsider = await devLogin(app.base, 'Kon Nobody');
  const none = await api<KonTopResponse>(app.base, '/api/kon/top?by=players', { token: outsider.token });
  assert.equal(none.body.me, null, 'no Kon matches — no place');
});
