/**
 * Social contracts: unique aliases, friends (requests, presence), direct messages, invitations to a
 * room and the Top-100 leaderboard. REST for lists and actions; live events arrive over the social
 * WebSocket (`/ws/social`, see apps/server/src/social/hub.ts).
 */
import { z } from 'zod';
import type { AvatarId } from '../game-rules/avatars.js';
import type { CharacterId } from '../game-rules/characters.js';
import type { GameMode } from '../game-rules/match.js';
import type { MapId } from '../maps/types.js';
import { displayNameSchema } from './api.js';

/** Where a friend is right now: not connected, in the menus, in a room's lobby, in a match. */
export type FriendStatus = 'offline' | 'online' | 'lobby' | 'match';

/** A player as shown in social lists (never more than other players already see in a room). */
export interface PlayerCard {
  id: string;
  name: string;
  avatar: AvatarId | null;
  character: CharacterId | null;
  level: number;
}

export interface FriendEntry extends PlayerCard {
  status: FriendStatus;
  /** Last time the friend was seen (offline friends). */
  lastSeenAt: string | null;
  /** Direct messages from this friend not read yet. */
  unread: number;
}

export interface FriendRequestEntry extends PlayerCard {
  createdAt: string;
}

export interface FriendsResponse {
  friends: FriendEntry[];
  /** Requests to me, waiting for my answer. */
  incoming: FriendRequestEntry[];
  /** My requests, waiting for theirs. */
  outgoing: FriendRequestEntry[];
}

/** POST /api/friends/request — by alias (aliases are unique, case does not matter). */
export const FriendRequestBody = z.object({ name: displayNameSchema }).strict();
export type FriendRequestResult = 'sent' | 'accepted';

export const MAX_FRIENDS = 200;
export const MAX_PENDING_REQUESTS = 50;
export const DM_MAX_LENGTH = 500;

export const DirectMessageBody = z
  .object({
    text: z
      .string()
      .transform((s) => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim())
      .pipe(z.string().min(1).max(DM_MAX_LENGTH)),
  })
  .strict();

export interface DirectMessage {
  id: number;
  from: string;
  to: string;
  text: string;
  at: string;
  /** The recipient has opened the conversation. */
  read: boolean;
}

export interface MessagesResponse {
  messages: DirectMessage[];
  /** Older messages exist (pass the first id as `before`). */
  more: boolean;
}

/** POST /api/friends/:id/invite — the room the inviter is in. */
export const InviteFriendBody = z.object({ roomId: z.string().regex(/^[A-Za-z0-9]{6,16}$/) }).strict();

export interface RoomInviteEvent {
  from: PlayerCard;
  roomId: string;
  mode: GameMode;
  mapId: MapId;
  isPrivate: boolean;
  at: string;
}

/** Events pushed over the social WebSocket. */
export type SocialEvent =
  | { type: 'ready'; userId: string; unread: number; incoming: number }
  | { type: 'presence'; userId: string; status: FriendStatus }
  | { type: 'friend_request'; from: FriendRequestEntry }
  | { type: 'friend_accepted'; friend: FriendEntry }
  | { type: 'friend_removed'; userId: string }
  | { type: 'dm'; message: DirectMessage; from: PlayerCard }
  | { type: 'dm_read'; by: string; upTo: number }
  | { type: 'invite'; invite: RoomInviteEvent }
  /** The answer to a client `ping` (keep-alive through proxies that drop idle sockets). */
  | { type: 'pong'; t: number };

/** Client → server over the social socket. */
export const SocialClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string().min(16).max(256) }).strict(),
  z.object({ type: z.literal('ping'), t: z.number().finite() }).strict(),
]);
export type SocialClientMessage = z.infer<typeof SocialClientMessage>;

/** GET /api/names/check?name= — is an alias free (and a few free variants when it is not). */
export interface NameCheckResponse {
  name: string;
  available: boolean;
  suggestions: string[];
}

export type LeaderboardBy = 'rating' | 'level' | 'kills';
export const LEADERBOARD_BY: readonly LeaderboardBy[] = ['rating', 'level', 'kills'];
export const LEADERBOARD_SIZE = 100;

export interface LeaderboardEntry extends PlayerCard {
  rank: number;
  rating: number;
  kills: number;
  wins: number;
  matches: number;
}

export interface LeaderboardResponse {
  by: LeaderboardBy;
  entries: LeaderboardEntry[];
  /** The asking player's own line (also when outside the top 100); null without matches. */
  me: LeaderboardEntry | null;
  updatedAt: string;
}
