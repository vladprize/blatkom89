/**
 * Social persistence (PostgreSQL): friendships (a pending request is one row; an accepted friendship
 * two, one per side), direct messages between friends, the Top-100 leaderboard. Every query is
 * parameterised; aliases are matched by their key (letter case, spacing and look-alike letters ignored; unique,
 * migration 010).
 */
import { LEADERBOARD_SIZE, MAX_FRIENDS, MAX_PENDING_REQUESTS, isAvatarId, isCharacterId, nameKey } from '@blatkom/shared';
import type { DirectMessage, FriendEntry, FriendRequestEntry, LeaderboardBy, LeaderboardEntry, PlayerCard } from '@blatkom/shared';
import type { Sql } from '../database/db.js';

interface CardRow {
  id: string;
  display_name: string;
  avatar: string | null;
  preferred_character: string | null;
  level: number | null;
}

export function toCard(r: CardRow): PlayerCard {
  return {
    id: r.id,
    name: r.display_name,
    avatar: isAvatarId(r.avatar) ? r.avatar : null,
    character: r.preferred_character && isCharacterId(r.preferred_character) ? r.preferred_character : null,
    level: r.level ?? 1,
  };
}

interface DmRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: Date;
  read_at: Date | null;
}

function toMessage(r: DmRow): DirectMessage {
  return { id: Number(r.id), from: r.sender_id, to: r.recipient_id, text: r.body, at: r.created_at.toISOString(), read: r.read_at !== null };
}

export type RequestOutcome = 'sent' | 'accepted' | 'not_found' | 'self' | 'already_friends' | 'already_sent' | 'too_many';

export class SocialRepo {
  constructor(private readonly sql: Sql) {}

  async card(userId: string): Promise<PlayerCard | null> {
    const rows = await this.sql<CardRow[]>`
      SELECT u.id, u.display_name, p.avatar, p.preferred_character, p.level
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ${userId} AND u.deleted_at IS NULL`;
    return rows[0] ? toCard(rows[0]) : null;
  }

  async friendIds(userId: string): Promise<string[]> {
    const rows = await this.sql<Array<{ friend_id: string }>>`SELECT friend_id FROM friendships WHERE user_id = ${userId} AND status = 'accepted'`;
    return rows.map((r) => r.friend_id);
  }

  async areFriends(a: string, b: string): Promise<boolean> {
    const rows = await this.sql`SELECT 1 FROM friendships WHERE user_id = ${a} AND friend_id = ${b} AND status = 'accepted'`;
    return rows.length > 0;
  }

  /** Friends (without presence — the hub adds it), incoming and outgoing requests. */
  async lists(userId: string): Promise<{ friends: Array<Omit<FriendEntry, 'status'>>; incoming: FriendRequestEntry[]; outgoing: FriendRequestEntry[] }> {
    const friends = await this.sql<Array<CardRow & { last_seen_at: Date; unread: number }>>`
      SELECT u.id, u.display_name, p.avatar, p.preferred_character, p.level, u.last_seen_at,
             (SELECT count(*)::int FROM direct_messages d WHERE d.recipient_id = ${userId} AND d.sender_id = u.id AND d.read_at IS NULL) AS unread
      FROM friendships f JOIN users u ON u.id = f.friend_id LEFT JOIN profiles p ON p.user_id = u.id
      WHERE f.user_id = ${userId} AND f.status = 'accepted' AND u.deleted_at IS NULL
      ORDER BY u.name_key`;
    const incoming = await this.sql<Array<CardRow & { created_at: Date }>>`
      SELECT u.id, u.display_name, p.avatar, p.preferred_character, p.level, f.created_at
      FROM friendships f JOIN users u ON u.id = f.user_id LEFT JOIN profiles p ON p.user_id = u.id
      WHERE f.friend_id = ${userId} AND f.status = 'pending' AND u.deleted_at IS NULL
      ORDER BY f.created_at DESC`;
    const outgoing = await this.sql<Array<CardRow & { created_at: Date }>>`
      SELECT u.id, u.display_name, p.avatar, p.preferred_character, p.level, f.created_at
      FROM friendships f JOIN users u ON u.id = f.friend_id LEFT JOIN profiles p ON p.user_id = u.id
      WHERE f.user_id = ${userId} AND f.status = 'pending' AND u.deleted_at IS NULL
      ORDER BY f.created_at DESC`;
    return {
      friends: friends.map((r) => ({ ...toCard(r), lastSeenAt: r.last_seen_at.toISOString(), unread: r.unread })),
      incoming: incoming.map((r) => ({ ...toCard(r), createdAt: r.created_at.toISOString() })),
      outgoing: outgoing.map((r) => ({ ...toCard(r), createdAt: r.created_at.toISOString() })),
    };
  }

  /** A friend request by alias; a request the other player already sent me is accepted instead. */
  async request(userId: string, name: string): Promise<{ outcome: RequestOutcome; other: PlayerCard | null }> {
    return this.sql.begin(async (tx) => {
      const target = await tx<CardRow[]>`
        SELECT u.id, u.display_name, p.avatar, p.preferred_character, p.level
        FROM users u LEFT JOIN profiles p ON p.user_id = u.id
        WHERE u.name_key = ${nameKey(name)} AND u.deleted_at IS NULL`;
      const t = target[0];
      if (!t) return { outcome: 'not_found' as const, other: null };
      const other = toCard(t);
      if (t.id === userId) return { outcome: 'self' as const, other };
      // lock my side, then theirs (sorted, so two players adding each other at once cannot deadlock)
      const [first, second] = [userId, t.id].sort();
      await tx`SELECT pg_advisory_xact_lock(hashtext(${first + ':' + second}))`;
      const rows = await tx<Array<{ user_id: string; friend_id: string; status: string }>>`
        SELECT user_id, friend_id, status FROM friendships
        WHERE (user_id = ${userId} AND friend_id = ${t.id}) OR (user_id = ${t.id} AND friend_id = ${userId})`;
      if (rows.some((r) => r.status === 'accepted')) return { outcome: 'already_friends' as const, other };
      if (rows.some((r) => r.user_id === userId)) return { outcome: 'already_sent' as const, other };
      const [counts] = await tx<Array<{ friends: number; pending: number }>>`
        SELECT count(*) FILTER (WHERE status = 'accepted')::int AS friends, count(*) FILTER (WHERE status = 'pending')::int AS pending
        FROM friendships WHERE user_id = ${userId}`;
      if (counts!.friends >= MAX_FRIENDS) return { outcome: 'too_many' as const, other };
      if (rows.some((r) => r.user_id === t.id)) {
        // they asked first: this is a yes
        await tx`UPDATE friendships SET status = 'accepted', accepted_at = now() WHERE user_id = ${t.id} AND friend_id = ${userId}`;
        await tx`INSERT INTO friendships (user_id, friend_id, status, accepted_at) VALUES (${userId}, ${t.id}, 'accepted', now())`;
        return { outcome: 'accepted' as const, other };
      }
      if (counts!.pending >= MAX_PENDING_REQUESTS) return { outcome: 'too_many' as const, other };
      await tx`INSERT INTO friendships (user_id, friend_id, status) VALUES (${userId}, ${t.id}, 'pending')`;
      return { outcome: 'sent' as const, other };
    });
  }

  /** Accept a request from `fromId` (false: there is none). */
  async accept(userId: string, fromId: string): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      const [first, second] = [userId, fromId].sort();
      await tx`SELECT pg_advisory_xact_lock(hashtext(${first + ':' + second}))`;
      const updated = await tx`UPDATE friendships SET status = 'accepted', accepted_at = now() WHERE user_id = ${fromId} AND friend_id = ${userId} AND status = 'pending' RETURNING user_id`;
      if (updated.length === 0) return false;
      await tx`INSERT INTO friendships (user_id, friend_id, status, accepted_at) VALUES (${userId}, ${fromId}, 'accepted', now())
               ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted', accepted_at = now()`;
      return true;
    });
  }

  /** Declines, cancels or ends a friendship — whatever there is between the two (false: nothing). */
  async remove(userId: string, otherId: string): Promise<boolean> {
    const rows = await this.sql`
      DELETE FROM friendships WHERE (user_id = ${userId} AND friend_id = ${otherId}) OR (user_id = ${otherId} AND friend_id = ${userId})
      RETURNING user_id`;
    return rows.length > 0;
  }

  // ── direct messages ───────────────────────────────────────────────────
  async send(from: string, to: string, text: string): Promise<DirectMessage> {
    const rows = await this.sql<DmRow[]>`
      INSERT INTO direct_messages (sender_id, recipient_id, body) VALUES (${from}, ${to}, ${text})
      RETURNING id, sender_id, recipient_id, body, created_at, read_at`;
    return toMessage(rows[0]!);
  }

  /** The conversation with a friend, newest last; `before`: older than this message id. */
  async conversation(userId: string, friendId: string, before: number | null, limit = 50): Promise<{ messages: DirectMessage[]; more: boolean }> {
    const lo = userId < friendId ? userId : friendId;
    const hi = userId < friendId ? friendId : userId;
    const rows = await this.sql<DmRow[]>`
      SELECT id, sender_id, recipient_id, body, created_at, read_at FROM direct_messages
      WHERE LEAST(sender_id, recipient_id) = ${lo} AND GREATEST(sender_id, recipient_id) = ${hi}
        ${before ? this.sql`AND id < ${before}` : this.sql``}
      ORDER BY id DESC LIMIT ${limit + 1}`;
    const more = rows.length > limit;
    return { messages: rows.slice(0, limit).reverse().map(toMessage), more };
  }

  /** Marks a friend's messages to me as read; the newest id marked (0: nothing new). */
  async markRead(userId: string, friendId: string): Promise<number> {
    const rows = await this.sql<Array<{ id: string }>>`
      UPDATE direct_messages SET read_at = now() WHERE recipient_id = ${userId} AND sender_id = ${friendId} AND read_at IS NULL RETURNING id`;
    return rows.reduce((m, r) => Math.max(m, Number(r.id)), 0);
  }

  async counts(userId: string): Promise<{ unread: number; incoming: number; clubs: number }> {
    const [r] = await this.sql<Array<{ unread: number; incoming: number; clubs: number }>>`
      SELECT (SELECT count(*)::int FROM direct_messages WHERE recipient_id = ${userId} AND read_at IS NULL) AS unread,
             (SELECT count(*)::int FROM friendships WHERE friend_id = ${userId} AND status = 'pending') AS incoming,
             (SELECT count(*)::int FROM club_requests q JOIN club_members m ON m.club_id = q.club_id AND m.user_id = ${userId} AND m.role = 'head') AS clubs`;
    return r!;
  }

  // ── leaderboard ──────────────────────────────────────────────────────
  /**
   * The table's order: by rating, level (experience) or eliminations; ties go to the other measure,
   * then to the older account — so every place is distinct and stable.
   */
  private order(by: LeaderboardBy) {
    return by === 'rating'
      ? this.sql`p.rating DESC, p.xp DESC, u.created_at, u.id`
      : by === 'level'
        ? this.sql`p.xp DESC, p.rating DESC, u.created_at, u.id`
        : this.sql`p.kills DESC, p.rating DESC, u.created_at, u.id`;
  }

  /** The top players (with at least one finished match). */
  async leaderboard(by: LeaderboardBy, limit = LEADERBOARD_SIZE): Promise<LeaderboardEntry[]> {
    const order = this.order(by);
    const rows = await this.sql<Array<CardRow & { rank: string; rating: number; kills: number; wins: number; matches: number }>>`
      SELECT u.id, u.display_name, p.avatar, p.preferred_character, p.level, row_number() OVER (ORDER BY ${order}) AS rank,
             p.rating, p.kills, p.wins, p.matches_completed AS matches
      FROM profiles p JOIN users u ON u.id = p.user_id
      WHERE p.matches_completed > 0 AND u.deleted_at IS NULL
      ORDER BY ${order}
      LIMIT ${limit}`;
    return rows.map((r) => ({ ...toCard(r), rank: Number(r.rank), rating: r.rating, kills: r.kills, wins: r.wins, matches: r.matches }));
  }

  /** One player's line with their place (null without a finished match). */
  async standing(by: LeaderboardBy, userId: string): Promise<LeaderboardEntry | null> {
    const rows = await this.sql<Array<CardRow & { rating: number; kills: number; wins: number; matches: number; xp: number; created_at: Date }>>`
      SELECT u.id, u.display_name, p.avatar, p.preferred_character, p.level, p.rating, p.kills, p.wins, p.matches_completed AS matches, p.xp, u.created_at
      FROM profiles p JOIN users u ON u.id = p.user_id
      WHERE p.user_id = ${userId} AND p.matches_completed > 0 AND u.deleted_at IS NULL`;
    const me = rows[0];
    if (!me) return null;
    // players before me in the table's order (the same order as leaderboard())
    const [a, b] = by === 'rating' ? [me.rating, me.xp] : by === 'level' ? [me.xp, me.rating] : [me.kills, me.rating];
    const key = by === 'rating' ? this.sql`(-p.rating, -p.xp, u.created_at, u.id)` : by === 'level' ? this.sql`(-p.xp, -p.rating, u.created_at, u.id)` : this.sql`(-p.kills, -p.rating, u.created_at, u.id)`;
    const [c] = await this.sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM profiles p JOIN users u ON u.id = p.user_id
      WHERE p.matches_completed > 0 AND u.deleted_at IS NULL
        AND ${key} < (${-a}::int, ${-b}::int, ${me.created_at}::timestamptz, ${me.id}::uuid)`;
    return { ...toCard(me), rank: c!.n + 1, rating: me.rating, kills: me.kills, wins: me.wins, matches: me.matches };
  }
}
