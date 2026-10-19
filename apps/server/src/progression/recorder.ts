/**
 * PostgreSQL MatchRecorder. Match completion runs in ONE transaction:
 *   1. ensure the match row exists and lock it (SELECT … FOR UPDATE)
 *   2. if results_processed_at is set → return the stored results (idempotent, no new XP)
 *   3. lock participant profiles in a deterministic order, update counters/streaks/XP/level,
 *      unlock achievements, upsert participant rows
 *   4. mark the match completed + results_processed_at
 * Concurrent duplicate calls serialize on the match row lock, so XP is awarded exactly once.
 */
import { ACHIEVEMENTS, ACHIEVEMENT_IDS, applyMatchProgress, tokensForMatch } from '@blatkom/shared';
import type { AchievementId, PersonalResult } from '@blatkom/shared';
import type postgres from 'postgres';
import type { Sql } from '../database/db.js';
import type { Logger } from '../logging/logger.js';
import type { MatchCompletion, MatchRecorder, MatchStart } from '../services/contracts.js';
import { awardMatchTokens } from '../economy/repo.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Tx = postgres.TransactionSql<Record<string, unknown>>;

export async function seedAchievements(sql: Sql): Promise<void> {
  for (const id of ACHIEVEMENT_IDS) {
    const a = ACHIEVEMENTS[id];
    await sql`
      INSERT INTO achievements (id, title, description, xp_reward) VALUES (${a.id}, ${a.title}, ${a.description}, ${a.xpReward})
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, xp_reward = EXCLUDED.xp_reward`;
  }
}

async function existingUsers(tx: Tx, ids: string[]): Promise<Set<string>> {
  const valid = [...new Set(ids.filter((id) => UUID_RE.test(id)))];
  if (valid.length === 0) return new Set();
  const rows = await tx<Array<{ id: string }>>`SELECT id FROM users WHERE id IN ${tx(valid)} AND deleted_at IS NULL`;
  return new Set(rows.map((r) => r.id));
}

export class PgMatchRecorder implements MatchRecorder {
  constructor(
    private readonly sql: Sql,
    private readonly log: Logger,
  ) {}

  async matchStarted(m: MatchStart): Promise<void> {
    if (!UUID_RE.test(m.matchId)) return;
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO matches (id, room_id, map_id, mode, is_private, status, started_at, player_count, bot_count)
        VALUES (${m.matchId}, ${m.roomId}, ${m.mapId}, ${m.mode}, ${m.isPrivate}, 'active', ${m.startedAt}, ${m.players.length}, ${m.fill ?? 0})
        ON CONFLICT (id) DO NOTHING`;
      const known = await existingUsers(tx, m.players.map((p) => p.userId));
      for (const p of m.players) {
        if (!known.has(p.userId)) continue;
        await tx`
          INSERT INTO match_participants (match_id, user_id, character, team, via_invite, joined_at)
          VALUES (${m.matchId}, ${p.userId}, ${p.character}, ${p.team}, ${p.viaInvite}, ${m.startedAt})
          ON CONFLICT (match_id, user_id) DO NOTHING`;
      }
    });
  }

  async matchCompleted(m: MatchCompletion): Promise<Map<string, PersonalResult>> {
    if (!UUID_RE.test(m.matchId)) throw new Error('matchId must be a UUID');
    const people = m.peopleAtEnd ?? m.playersAtEnd;
    const fill = m.fillAtEnd ?? 0;
    return this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO matches (id, room_id, map_id, mode, is_private, status, started_at, player_count, bot_count)
        VALUES (${m.matchId}, ${m.roomId}, ${m.mapId}, ${m.mode}, ${m.isPrivate}, 'active', ${m.startedAt}, ${people}, ${fill})
        ON CONFLICT (id) DO NOTHING`;
      const locked = await tx<Array<{ results_processed_at: Date | null }>>`SELECT results_processed_at FROM matches WHERE id = ${m.matchId} FOR UPDATE`;
      const known = await existingUsers(tx, m.participants.map((p) => p.userId));
      const participants = m.participants.filter((p) => known.has(p.userId)).sort((a, b) => (a.userId < b.userId ? -1 : 1));
      if (locked[0]?.results_processed_at) return this.readResults(tx, m.matchId, participants.map((p) => p.userId));

      const out = new Map<string, PersonalResult>();
      for (const p of participants) {
        await tx`INSERT INTO profiles (user_id) VALUES (${p.userId}) ON CONFLICT DO NOTHING`;
        const [prof] = await tx<Array<{ xp: number; level: number; matches_completed: number; wins: number; current_win_streak: number; best_win_streak: number }>>`
          SELECT xp, level, matches_completed, wins, current_win_streak, best_win_streak FROM profiles WHERE user_id = ${p.userId} FOR UPDATE`;
        // friends are people: players the server filled in don't count
        const withFriends = m.isPrivate && p.viaInvite && people >= 2;
        const sharedPlace = p.completed && m.participants.some((o) => o.userId !== p.userId && o.completed && o.place === p.place);
        const perf = { kills: p.kills, assists: p.assists, deaths: p.deaths, place: p.place, playersAtEnd: m.playersAtEnd, completed: p.completed, withFriends, sharedPlace, ...(p.teamOutcome ? { teamOutcome: p.teamOutcome } : {}), objectives: p.objectives ?? 0 };
        const ownedRows = await tx<Array<{ achievement_id: AchievementId }>>`SELECT achievement_id FROM player_achievements WHERE user_id = ${p.userId}`;
        const prev = { xp: prof!.xp, level: prof!.level, matchesCompleted: prof!.matches_completed, wins: prof!.wins, currentWinStreak: prof!.current_win_streak };
        const { won, lost, streak, unlocked, xpGained: xp, totalXp, level } = applyMatchProgress(prev, perf, new Set(ownedRows.map((r) => r.achievement_id)));
        const tokens = tokensForMatch(perf);
        await tx`
          UPDATE profiles SET
            xp = ${totalXp},
            level = ${level},
            matches_played = matches_played + 1,
            matches_completed = matches_completed + ${p.completed ? 1 : 0},
            wins = wins + ${won ? 1 : 0},
            losses = losses + ${lost ? 1 : 0},
            kills = kills + ${p.kills},
            assists = assists + ${p.assists},
            deaths = deaths + ${p.deaths},
            playtime_sec = playtime_sec + ${Math.max(0, Math.round(p.playtimeMs / 1000))},
            current_win_streak = ${streak},
            best_win_streak = GREATEST(best_win_streak, ${streak}),
            preferred_character = COALESCE(preferred_character, ${p.character}),
            updated_at = now()
          WHERE user_id = ${p.userId}`;
        for (const a of unlocked) {
          await tx`INSERT INTO player_achievements (user_id, achievement_id, match_id) VALUES (${p.userId}, ${a}, ${m.matchId}) ON CONFLICT DO NOTHING`;
        }
        const totalTokens = await awardMatchTokens(tx, p.userId, m.matchId, tokens);
        await tx`
          INSERT INTO match_participants (match_id, user_id, character, team, place, kills, assists, deaths, score, damage_dealt, completed, won, via_invite, xp_awarded, tokens_awarded, joined_at, left_at)
          VALUES (${m.matchId}, ${p.userId}, ${p.character}, ${p.team}, ${p.place}, ${p.kills}, ${p.assists}, ${p.deaths}, ${p.score}, ${p.damageDealt}, ${p.completed}, ${won}, ${p.viaInvite}, ${xp}, ${tokens}, ${m.startedAt}, ${p.completed ? null : m.endedAt})
          ON CONFLICT (match_id, user_id) DO UPDATE SET
            character = EXCLUDED.character, team = EXCLUDED.team, place = EXCLUDED.place, kills = EXCLUDED.kills, assists = EXCLUDED.assists, deaths = EXCLUDED.deaths,
            score = EXCLUDED.score, damage_dealt = EXCLUDED.damage_dealt, completed = EXCLUDED.completed, won = EXCLUDED.won,
            via_invite = match_participants.via_invite OR EXCLUDED.via_invite, xp_awarded = EXCLUDED.xp_awarded,
            tokens_awarded = EXCLUDED.tokens_awarded, left_at = EXCLUDED.left_at`;
        out.set(p.userId, { xpGained: xp, totalXp, level, leveledUp: level > prof!.level, newAchievements: unlocked, tokensGained: tokens, totalTokens });
      }
      await tx`
        UPDATE matches SET status = 'completed', ended_at = ${m.endedAt}, duration_ms = ${Math.max(0, Math.round(m.durationMs))},
          end_reason = ${m.endReason}, player_count = ${people}, bot_count = ${fill}, mode = ${m.mode}, winner_team = ${m.winnerTeam}, results_processed_at = now()
        WHERE id = ${m.matchId}`;
      return out;
    });
  }

  private async readResults(tx: Tx, matchId: string, userIds: string[]): Promise<Map<string, PersonalResult>> {
    const out = new Map<string, PersonalResult>();
    if (userIds.length === 0) return out;
    const rows = await tx<Array<{ user_id: string; xp_awarded: number; tokens_awarded: number; xp: number; level: number; tokens: number }>>`
      SELECT mp.user_id, mp.xp_awarded, mp.tokens_awarded, p.xp, p.level, p.tokens
      FROM match_participants mp JOIN profiles p ON p.user_id = mp.user_id
      WHERE mp.match_id = ${matchId} AND mp.user_id IN ${tx(userIds)}`;
    const ach = await tx<Array<{ user_id: string; achievement_id: AchievementId }>>`
      SELECT user_id, achievement_id FROM player_achievements WHERE match_id = ${matchId} AND user_id IN ${tx(userIds)}`;
    for (const r of rows) {
      out.set(r.user_id, {
        xpGained: r.xp_awarded,
        totalXp: r.xp,
        level: r.level,
        leveledUp: false,
        newAchievements: ach.filter((a) => a.user_id === r.user_id).map((a) => a.achievement_id),
        tokensGained: r.tokens_awarded,
        totalTokens: r.tokens,
      });
    }
    return out;
  }

  async matchAbandoned(matchId: string, reason: string): Promise<void> {
    if (!UUID_RE.test(matchId)) return;
    await this.sql`
      UPDATE matches SET status = 'abandoned', ended_at = now(), end_reason = ${reason.slice(0, 40)}
      WHERE id = ${matchId} AND status = 'active'`;
    this.log.info('match abandoned', { matchId, reason });
  }
}
