/** HTTP API request/response contracts shared by server and client. */
import { z } from 'zod';
import { CHARACTER_IDS } from '../game-rules/characters.js';
import type { CharacterId } from '../game-rules/characters.js';
import { MAP_IDS } from '../maps/types.js';
import type { MapId } from '../maps/types.js';
import type { AchievementId } from '../game-rules/progression.js';
import { MAX_NAME_LENGTH } from '../constants/game.js';

export const displayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(MAX_NAME_LENGTH)
  .regex(/^[\p{L}\p{N} _.\-’']+$/u, 'Имя может содержать буквы, цифры, пробел, _ . -');

export const TelegramAuthRequest = z.object({ initData: z.string().min(10).max(8192) }).strict();
export const DevAuthRequest = z.object({ name: displayNameSchema, deviceId: z.string().min(8).max(64).optional() }).strict();
export const UpdateProfileRequest = z
  .object({ displayName: displayNameSchema.optional(), preferredCharacter: z.enum(CHARACTER_IDS).optional() })
  .strict();
export const CreateRoomRequest = z.object({ mapId: z.enum(MAP_IDS), isPrivate: z.boolean().default(true) }).strict();
export const QuickMatchRequest = z.object({ mapId: z.enum(MAP_IDS).optional() }).strict();

export interface PublicProfile {
  id: string;
  displayName: string;
  telegramLinked: boolean;
  createdAt: string;
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  matchesPlayed: number;
  matchesCompleted: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  playtimeSec: number;
  currentWinStreak: number;
  bestWinStreak: number;
  preferredCharacter: CharacterId | null;
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
  profile: PublicProfile;
  isNew: boolean;
}

export interface CreateRoomResponse {
  roomId: string;
  inviteCode: string | null;
  inviteUrl: string | null;
  webUrl: string;
  mapId: MapId;
}

export type InviteStatus = 'joinable' | 'full' | 'in_progress' | 'finished' | 'expired' | 'not_found';

export interface InviteInfo {
  code: string;
  status: InviteStatus;
  roomId: string | null;
  mapId: MapId | null;
  players: number;
  maxPlayers: number;
  hostName: string | null;
}

export interface MatchHistoryEntry {
  matchId: string;
  mapId: MapId;
  character: CharacterId;
  endedAt: string;
  durationMs: number;
  place: number;
  players: number;
  kills: number;
  deaths: number;
  xpGained: number;
  won: boolean;
}

export interface AchievementStatus {
  id: AchievementId;
  title: string;
  description: string;
  unlockedAt: string | null;
}

export interface ApiError {
  error: { code: string; message: string };
}
