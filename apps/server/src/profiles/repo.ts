/** Player profile queries for /api/me (profile, history, achievements, deletion). */
import { ACHIEVEMENTS, ACHIEVEMENT_IDS, levelForXp } from '@blatkom/shared';
import type { AchievementId, AchievementStatus, CharacterId, MapId, MatchHistoryEntry, PublicProfile } from '@blatkom/shared';
import type { Sql } from '../database/db.js';

interface ProfileRow {
  id: string;
  display_name: string;
  telegram_id: string | null;
  created_at: Date;
  level: number;
  xp: number;
  matches_played: number;
  matches_completed: number;
  wins: number;
  losses: number;
  kills: number;
  assists: number;
  deaths: number;
  playtime_sec: number;
  current_win_streak: number;
  best_win_streak: number;
  preferred_character: CharacterId | null;
}

export function toPublicProfile(r: ProfileRow): PublicProfile {
  const lv = levelForXp(r.xp);
  return {
    id: r.id,
    displayName: r.display_name,
    telegramLinked: r.telegram_id !== null,
    createdAt: r.created_at.toISOString(),
    level: lv.level,
    xp: r.xp,
    xpIntoLevel: lv.intoLevel,
    xpForNextLevel: lv.nextLevelCost,
    matchesPlayed: r.matches_played,
    matchesCompleted: r.matches_completed,
    wins: r.wins,
    losses: r.losses,
    kills: r.kills,
    assists: r.assists,
    deaths: r.deaths,
    playtimeSec: r.playtime_sec,
    currentWinStreak: r.current_win_streak,
    bestWinStreak: r.best_win_streak,
    preferredCharacter: r.preferred_character,
  };
}

export class ProfileRepo {
  constructor(private readonly sql: Sql) {}

  async get(userId: string): Promise<PublicProfile | null> {
    const rows = await this.sql<ProfileRow[]>`
      SELECT u.id, u.display_name, u.telegram_id::text AS telegram_id, u.created_at,
             COALESCE(p.level, 1) AS level, COALESCE(p.xp, 0) AS xp,
             COALESCE(p.matches_played, 0) AS matches_played, COALESCE(p.matches_completed, 0) AS matches_completed,
             COALESCE(p.wins, 0) AS wins, COALESCE(p.losses, 0) AS losses, COALESCE(p.kills, 0) AS kills,
             COALESCE(p.assists, 0) AS assists,
             COALESCE(p.deaths, 0) AS deaths, COALESCE(p.playtime_sec, 0) AS playtime_sec,
             COALESCE(p.current_win_streak, 0) AS current_win_streak, COALESCE(p.best_win_streak, 0) AS best_win_streak,
             p.preferred_character
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = ${userId} AND u.deleted_at IS NULL`;
    return rows[0] ? toPublicProfile(rows[0]) : null;
  }

  async update(userId: string, patch: { displayName?: string | undefined; preferredCharacter?: CharacterId | undefined }): Promise<void> {
    await this.sql.begin(async (tx) => {
      if (patch.displayName !== undefined) await tx`UPDATE users SET display_name = ${patch.displayName} WHERE id = ${userId}`;
      if (patch.preferredCharacter !== undefined) {
        await tx`INSERT INTO profiles (user_id, preferred_character) VALUES (${userId}, ${patch.preferredCharacter})
                 ON CONFLICT (user_id) DO UPDATE SET preferred_character = EXCLUDED.preferred_character, updated_at = now()`;
      }
    });
  }

  async history(userId: string, limit: number): Promise<MatchHistoryEntry[]> {
    const rows = await this.sql<
      Array<{ match_id: string; map_id: MapId; character: CharacterId; ended_at: Date | null; started_at: Date; duration_ms: number | null; place: number | null; player_count: number; kills: number; assists: number; deaths: number; xp_awarded: number; won: boolean }>
    >`
      SELECT mp.match_id, m.map_id, mp.character, m.ended_at, m.started_at, m.duration_ms, mp.place, m.player_count,
             mp.kills, mp.assists, mp.deaths, mp.xp_awarded, mp.won
      FROM match_participants mp JOIN matches m ON m.id = mp.match_id
      WHERE mp.user_id = ${userId} AND m.status = 'completed'
      ORDER BY m.ended_at DESC NULLS LAST
      LIMIT ${limit}`;
    return rows.map((r) => ({
      matchId: r.match_id,
      mapId: r.map_id,
      character: r.character,
      endedAt: (r.ended_at ?? r.started_at).toISOString(),
      durationMs: r.duration_ms ?? 0,
      place: r.place ?? 0,
      players: r.player_count,
      kills: r.kills,
      assists: r.assists,
      deaths: r.deaths,
      xpGained: r.xp_awarded,
      won: r.won,
    }));
  }

  async achievements(userId: string): Promise<AchievementStatus[]> {
    const rows = await this.sql<Array<{ achievement_id: AchievementId; unlocked_at: Date }>>`
      SELECT achievement_id, unlocked_at FROM player_achievements WHERE user_id = ${userId}`;
    const got = new Map(rows.map((r) => [r.achievement_id, r.unlocked_at]));
    return ACHIEVEMENT_IDS.map((id) => ({
      id,
      title: ACHIEVEMENTS[id].title,
      description: ACHIEVEMENTS[id].description,
      unlockedAt: got.get(id)?.toISOString() ?? null,
    }));
  }

  /**
   * Permanently deletes the account. Cascades remove profile, sessions, activity, match participation
   * and achievements; analytics events and error records keep no user reference (SET NULL).
   */
  async deleteUser(userId: string): Promise<boolean> {
    const rows = await this.sql`DELETE FROM users WHERE id = ${userId} RETURNING id`;
    return rows.length > 0;
  }
}
