/** Player profile queries for /api/me (profile, history, achievements, deletion). */
import { ACHIEVEMENTS, ACHIEVEMENT_IDS, ClubEmblemSchema, ClubFlagSchema, isAvatarId, levelForXp, nameKey } from '@blatkom/shared';
import type { AchievementId, AchievementStatus, AvatarId, CharacterId, MapId, MatchHistoryEntry, PublicProfile } from '@blatkom/shared';
import type { Sql } from '../database/db.js';
import { creditLevels } from '../blat/repo.js';

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
  avatar: string | null;
  tokens: number;
  diamonds: number;
  blat: number;
  /** V2.0: the highest level paid in $BLAT, and whether the profile row exists (only in `get`). */
  blat_level?: number;
  has_profile?: boolean;
  email: string | null;
  rating: number;
  club_id?: string | null;
  club_tag?: string | null;
  club_name?: string | null;
  club_flag?: unknown;
  club_emblem?: unknown;
  identities?: string[] | null;
}

export function toPublicProfile(r: ProfileRow): PublicProfile {
  const lv = levelForXp(r.xp);
  const flag = ClubFlagSchema.safeParse(r.club_flag);
  const emblem = ClubEmblemSchema.safeParse(r.club_emblem);
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
    avatar: isAvatarId(r.avatar) ? r.avatar : null,
    tokens: r.tokens,
    blat: r.blat ?? 0,
    diamonds: r.diamonds,
    email: r.email,
    rating: r.rating,
    club: r.club_id && r.club_tag && r.club_name && flag.success && emblem.success ? { id: r.club_id, tag: r.club_tag, name: r.club_name, flag: flag.data, emblem: emblem.data } : null,
    identities: r.identities ?? [],
  };
}

export class ProfileRepo {
  constructor(private readonly sql: Sql) {}

  /**
   * The player's own profile. V2.0: levels not paid in $BLAT yet — the level-1 welcome and the levels
   * reached before $BLAT existed — are paid here, once (`blatCredited` tells the client to say so).
   */
  async get(userId: string): Promise<PublicProfile | null> {
    const row = await this.row(userId);
    if (!row) return null;
    let credited = 0;
    if (row.has_profile && row.level > (row.blat_level ?? 0)) {
      const r = await this.sql.begin((tx) => creditLevels(tx, userId, row.level));
      credited = r.gained;
      row.blat = r.balance;
    }
    const profile = toPublicProfile(row);
    return credited > 0 ? { ...profile, blatCredited: credited } : profile;
  }

  private async row(userId: string): Promise<ProfileRow | null> {
    const rows = await this.sql<ProfileRow[]>`
      SELECT u.id, u.display_name, u.telegram_id::text AS telegram_id, u.created_at,
             COALESCE(p.level, 1) AS level, COALESCE(p.xp, 0) AS xp,
             COALESCE(p.matches_played, 0) AS matches_played, COALESCE(p.matches_completed, 0) AS matches_completed,
             COALESCE(p.wins, 0) AS wins, COALESCE(p.losses, 0) AS losses, COALESCE(p.kills, 0) AS kills,
             COALESCE(p.assists, 0) AS assists,
             COALESCE(p.deaths, 0) AS deaths, COALESCE(p.playtime_sec, 0) AS playtime_sec,
             COALESCE(p.current_win_streak, 0) AS current_win_streak, COALESCE(p.best_win_streak, 0) AS best_win_streak,
             p.preferred_character, p.avatar, COALESCE(p.tokens, 0) AS tokens, COALESCE(p.diamonds, 0) AS diamonds, COALESCE(p.blat, 0) AS blat, u.email,
             COALESCE(p.blat_level, 0) AS blat_level, p.user_id IS NOT NULL AS has_profile,
             COALESCE(p.rating, 1000) AS rating,
             c.id AS club_id, c.tag AS club_tag, c.name AS club_name, c.flag AS club_flag, c.emblem AS club_emblem,
             (SELECT array_agg(i.provider ORDER BY i.provider) FROM user_identities i WHERE i.user_id = u.id) AS identities
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id
        LEFT JOIN club_members cm ON cm.user_id = u.id LEFT JOIN clubs c ON c.id = cm.club_id
      WHERE u.id = ${userId} AND u.deleted_at IS NULL`;
    return rows[0] ?? null;
  }

  async update(userId: string, patch: { displayName?: string | undefined; preferredCharacter?: CharacterId | undefined; avatar?: AvatarId | null | undefined }): Promise<void> {
    await this.sql.begin(async (tx) => {
      if (patch.displayName !== undefined) await tx`UPDATE users SET display_name = ${patch.displayName}, name_key = ${nameKey(patch.displayName)} WHERE id = ${userId}`;
      if (patch.preferredCharacter !== undefined) {
        await tx`INSERT INTO profiles (user_id, preferred_character) VALUES (${userId}, ${patch.preferredCharacter})
                 ON CONFLICT (user_id) DO UPDATE SET preferred_character = EXCLUDED.preferred_character, updated_at = now()`;
      }
      if (patch.avatar !== undefined) {
        await tx`INSERT INTO profiles (user_id, avatar) VALUES (${userId}, ${patch.avatar})
                 ON CONFLICT (user_id) DO UPDATE SET avatar = EXCLUDED.avatar, updated_at = now()`;
      }
    });
  }

  async history(userId: string, limit: number): Promise<MatchHistoryEntry[]> {
    const rows = await this.sql<
      Array<{ match_id: string; map_id: MapId; character: CharacterId; ended_at: Date | null; started_at: Date; duration_ms: number | null; place: number | null; players: number; kills: number; assists: number; deaths: number; xp_awarded: number; won: boolean; rating_delta: number }>
    >`
      SELECT mp.match_id, m.map_id, mp.character, m.ended_at, m.started_at, m.duration_ms, mp.place, m.player_count + m.bot_count AS players,
             mp.kills, mp.assists, mp.deaths, mp.xp_awarded, mp.won, mp.rating_delta
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
      // the whole lineup the player saw (people and filled players alike)
      players: r.players,
      kills: r.kills,
      assists: r.assists,
      deaths: r.deaths,
      xpGained: r.xp_awarded,
      won: r.won,
      ratingDelta: r.rating_delta,
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
