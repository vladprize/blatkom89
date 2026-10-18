import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDb } from '../admin/testkit.js';
import type { TestDb } from '../admin/testkit.js';
import { PgMatchRecorder, seedAchievements } from './recorder.js';
import { UserRepo } from '../auth/users.js';
import { silentLogger } from '../logging/logger.js';
import { XP_RULES, ACHIEVEMENTS, levelForXp } from '@blatkom/shared';
import type { MatchCompletion, MatchParticipantResult } from '../services/contracts.js';

let db: TestDb;
let rec: PgMatchRecorder;
let users: UserRepo;
before(async () => {
  db = await testDb();
  await seedAchievements(db.sql);
  rec = new PgMatchRecorder(db.sql, silentLogger);
  users = new UserRepo(db.sql);
});
after(async () => {
  await db.drop();
});

async function newUser(name: string) {
  return (await users.upsertDev(`dev-${randomUUID().slice(0, 12)}`, name, null)).userId;
}

function part(userId: string, place: number, kills: number, deaths: number, extra: Partial<MatchParticipantResult> = {}): MatchParticipantResult {
  return { userId, character: 'petya', place, kills, deaths, score: kills, damageDealt: kills * 100, completed: true, viaInvite: false, playtimeMs: 180_000, ...extra };
}

function completion(participants: MatchParticipantResult[], extra: Partial<MatchCompletion> = {}): MatchCompletion {
  const now = Date.now();
  return {
    matchId: randomUUID(),
    roomId: 'room123456',
    mapId: 'factory',
    isPrivate: false,
    startedAt: new Date(now - 200_000),
    endedAt: new Date(now),
    durationMs: 200_000,
    endReason: 'time',
    playersAtEnd: participants.filter((p) => p.completed).length,
    participants,
    ...extra,
  };
}

async function profile(userId: string) {
  const [p] = await db.sql<Array<{ xp: number; level: number; matches_played: number; matches_completed: number; wins: number; losses: number; kills: number; deaths: number; playtime_sec: number; current_win_streak: number; best_win_streak: number }>>`
    SELECT xp, level, matches_played, matches_completed, wins, losses, kills, deaths, playtime_sec, current_win_streak, best_win_streak FROM profiles WHERE user_id = ${userId}`;
  return p!;
}

test('recorder: completion updates counters, XP, level and first achievements', async () => {
  const a = await newUser('Петя');
  const b = await newUser('Валюта');
  const m = completion([part(a, 1, 6, 2), part(b, 2, 2, 6)]);
  await rec.matchStarted({ matchId: m.matchId, roomId: m.roomId, mapId: m.mapId, isPrivate: false, startedAt: m.startedAt, players: [{ userId: a, character: 'petya', viaInvite: false }, { userId: b, character: 'valuta', viaInvite: false }] });
  const res = await rec.matchCompleted(m);
  const ra = res.get(a)!;
  const expectedA = XP_RULES.completion + 6 * XP_RULES.perKill + 100 + ACHIEVEMENTS.first_match.xpReward + ACHIEVEMENTS.first_win.xpReward + ACHIEVEMENTS.multi_kill.xpReward;
  assert.equal(ra.xpGained, expectedA);
  assert.deepEqual([...ra.newAchievements].sort(), ['first_match', 'first_win', 'multi_kill']);
  assert.equal(ra.level, levelForXp(expectedA).level);
  const pa = await profile(a);
  assert.deepEqual(
    { xp: pa.xp, mp: pa.matches_played, mc: pa.matches_completed, w: pa.wins, l: pa.losses, k: pa.kills, d: pa.deaths, t: pa.playtime_sec, s: pa.current_win_streak },
    { xp: expectedA, mp: 1, mc: 1, w: 1, l: 0, k: 6, d: 2, t: 180, s: 1 },
  );
  const pb = await profile(b);
  assert.equal(pb.losses, 1);
  assert.equal(pb.wins, 0);
  assert.equal(pb.current_win_streak, 0);
  const [mrow] = await db.sql<Array<{ status: string; duration_ms: number; results_processed_at: Date | null }>>`SELECT status, duration_ms, results_processed_at FROM matches WHERE id = ${m.matchId}`;
  assert.equal(mrow!.status, 'completed');
  assert.equal(mrow!.duration_ms, 200_000);
  assert.ok(mrow!.results_processed_at);
});

test('recorder: repeated and concurrent completion awards XP exactly once', async () => {
  const a = await newUser('Михалыч');
  const b = await newUser('Участковый');
  const m = completion([part(a, 1, 3, 1), part(b, 2, 1, 3)]);
  const results = await Promise.all(Array.from({ length: 6 }, () => rec.matchCompleted(m)));
  const pa = await profile(a);
  const firstXp = Math.max(...results.map((r) => r.get(a)!.xpGained));
  assert.equal(pa.xp, firstXp, 'profile XP equals one award');
  assert.equal(pa.matches_played, 1);
  assert.equal(pa.wins, 1);
  const again = await rec.matchCompleted(m);
  assert.equal(again.get(a)!.xpGained, firstXp, 'repeat returns stored award');
  assert.equal((await profile(a)).xp, firstXp, 'no additional XP');
  const [cnt] = await db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM match_participants WHERE match_id = ${m.matchId}`;
  assert.equal(cnt!.n, 2);
});

test('recorder: win streak, friends and leaver handling', async () => {
  const a = await newUser('Стрик');
  const b = await newUser('Друг');
  for (let i = 0; i < 3; i++) await rec.matchCompleted(completion([part(a, 1, 1, 0), part(b, 2, 0, 1)]));
  const pa = await profile(a);
  assert.equal(pa.current_win_streak, 3);
  assert.equal(pa.best_win_streak, 3);
  const [ws] = await db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM player_achievements WHERE user_id = ${a} AND achievement_id = 'win_streak'`;
  assert.equal(ws!.n, 1);
  // friends: private room joined via invite with 2+ players present
  const friends = await rec.matchCompleted(completion([part(a, 2, 0, 1, { viaInvite: true }), part(b, 1, 1, 0, { viaInvite: true })], { isPrivate: true }));
  assert.ok(friends.get(a)!.newAchievements.includes('played_with_friends'));
  assert.equal((await profile(a)).current_win_streak, 0, 'loss resets the streak');
  // leaver: not present at the end → no XP, no completion, streak reset
  const leaverMatch = completion([part(a, 1, 4, 0), part(b, 2, 0, 0, { completed: false })]);
  const before = await profile(b);
  const r = await rec.matchCompleted(leaverMatch);
  const after = await profile(b);
  assert.equal(r.get(b)!.xpGained, 0);
  assert.equal(after.matches_played, before.matches_played + 1);
  assert.equal(after.matches_completed, before.matches_completed);
  assert.equal(after.current_win_streak, 0);
});

test('recorder: unknown/invalid user ids are ignored; abandoned matches are marked', async () => {
  const a = await newUser('Реальный');
  const m = completion([part(a, 1, 1, 0), part(randomUUID(), 2, 0, 1), part('bot-1', 3, 0, 1)]);
  const res = await rec.matchCompleted(m);
  assert.deepEqual([...res.keys()], [a]);
  const id = randomUUID();
  await rec.matchStarted({ matchId: id, roomId: 'r2', mapId: 'yard', isPrivate: true, startedAt: new Date(), players: [{ userId: a, character: 'mihalych', viaInvite: true }, { userId: 'not-a-uuid', character: 'petya', viaInvite: false }] });
  await rec.matchAbandoned(id, 'empty');
  const [row] = await db.sql<Array<{ status: string; end_reason: string }>>`SELECT status, end_reason FROM matches WHERE id = ${id}`;
  assert.deepEqual({ ...row }, { status: 'abandoned', end_reason: 'empty' });
});
