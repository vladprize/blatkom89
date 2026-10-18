/** HTTP API request/response contracts shared by server and client. */
import { z } from 'zod';
import { CHARACTER_IDS } from '../game-rules/characters.js';
import type { CharacterId } from '../game-rules/characters.js';
import { MAP_IDS } from '../maps/types.js';
import type { MapId } from '../maps/types.js';
import type { AchievementId } from '../game-rules/progression.js';
import { MAX_NAME_LENGTH } from '../constants/game.js';
import { PlatformSchema } from '../events/analytics.js';

export const displayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(MAX_NAME_LENGTH)
  .regex(/^[\p{L}\p{N} _.\-’']+$/u, 'Имя может содержать буквы, цифры, пробел, _ . -');

export const TelegramAuthRequest = z
  .object({ initData: z.string().min(10).max(8192), platform: PlatformSchema.optional(), clientVersion: z.string().max(32).optional() })
  .strict();
export const DevAuthRequest = z
  .object({
    name: displayNameSchema,
    deviceId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
    platform: PlatformSchema.optional(),
    clientVersion: z.string().max(32).optional(),
  })
  .strict();
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
  assists: number;
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
  assists: number;
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

/** GET /api/me/history */
export interface MatchHistoryResponse {
  matches: MatchHistoryEntry[];
}

/** GET /api/me/achievements */
export interface AchievementsResponse {
  achievements: AchievementStatus[];
}

export interface ApiError {
  error: { code: string; message: string };
}

// ── Admin dashboard API (see docs/ADMIN.md, docs/ANALYTICS.md) ───────────────

export type AdminRole = 'admin' | 'viewer';

export const AdminLoginRequest = z
  .object({ username: z.string().min(3).max(32), password: z.string().min(1).max(256) })
  .strict();
export const AdminCreateUserRequest = z
  .object({
    username: z.string().regex(/^[a-z0-9_.-]{3,32}$/),
    password: z.string().min(12).max(256),
    role: z.enum(['admin', 'viewer']),
  })
  .strict();

export interface AdminMe {
  id: string;
  username: string;
  role: AdminRole;
  csrfToken: string;
}

export type AdminRangeKey = '24h' | '7d' | '30d' | '90d' | 'custom';

export interface AdminRange {
  key: AdminRangeKey;
  /** Inclusive ISO timestamps. */
  from: string;
  to: string;
  /** UTC calendar days covered (YYYY-MM-DD). */
  firstDay: string;
  lastDay: string;
}

export interface AdminOverview {
  range: AdminRange;
  generatedAt: string;
  totalPlayers: number;
  newPlayers: number;
  dau: number;
  wau: number;
  mau: number;
  matchesStarted: number;
  matchesCompleted: number;
  activeRooms: number;
  avgMatchDurationMs: number | null;
  avgSessionDurationMs: number | null;
  firstMatchConversion: number | null;
  d1Retention: number | null;
  d7Retention: number | null;
  /** Number of users in matured cohorts behind each retention value. */
  d1CohortSize: number;
  d7CohortSize: number;
  errorCount: number;
}

export interface AdminCharts {
  range: AdminRange;
  registrations: Array<{ day: string; count: number }>;
  dau: Array<{ day: string; count: number }>;
  matches: Array<{ day: string; started: number; completed: number }>;
  retention: Array<{ day: string; cohort: number; d1: number | null; d7: number | null }>;
  sessionDuration: Array<{ bucket: string; count: number }>;
  matchDuration: Array<{ bucket: string; count: number }>;
  maps: Array<{ key: string; count: number }>;
  characters: Array<{ key: string; count: number }>;
  platforms: Array<{ key: string; count: number }>;
}

export interface AdminPlayerRow {
  id: string;
  displayName: string;
  telegramId: string | null;
  createdAt: string;
  lastSeenAt: string;
  level: number;
  xp: number;
  matches: number;
  wins: number;
  losses: number;
  kills: number;
  assists: number;
  deaths: number;
  playtimeSec: number;
}

export interface AdminPlayersPage {
  rows: AdminPlayerRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  dir: 'asc' | 'desc';
}

export interface AdminErrorRow {
  id: number;
  occurredAt: string;
  source: 'client' | 'server';
  component: string;
  category: string;
  message: string;
  clientVersion: string | null;
  serverVersion: string | null;
  sessionId: string | null;
}

export interface AdminErrorGroup {
  fingerprint: string;
  source: 'client' | 'server';
  component: string;
  category: string;
  message: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  clientVersions: string[];
  serverVersions: string[];
  sessionIds: string[];
}

export interface AdminPlayerDetail {
  player: AdminPlayerRow & {
    matchesCompleted: number;
    currentWinStreak: number;
    bestWinStreak: number;
    preferredCharacter: CharacterId | null;
    xpIntoLevel: number;
    xpForNextLevel: number;
    languageCode: string | null;
    platform: string | null;
  };
  sessions: { total: number; active: number; lastPlatform: string | null; lastClientVersion: string | null };
  achievements: AchievementStatus[];
  matches: MatchHistoryEntry[];
  errors: AdminErrorRow[];
}
