/** HTTP API request/response contracts shared by server and client. */
import { z } from 'zod';
import { CHARACTER_IDS } from '../game-rules/characters.js';
import type { CharacterId } from '../game-rules/characters.js';
import { WEAPON_IDS, MOD_IDS } from '../game-rules/weapons.js';
import { GADGET_IDS } from '../game-rules/gadgets.js';
import type { WeaponId } from '../game-rules/weapons.js';
import type { Currency, DiamondPack, Inventory, Rarity } from '../game-rules/economy.js';
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
/**
 * Guest login for the public website (no Telegram). `deviceId` is a random secret generated and kept
 * by the browser (≥ 20 chars); the server stores only an HMAC of it. `name` is used for new players only.
 */
export const GuestAuthRequest = z
  .object({
    name: displayNameSchema,
    deviceId: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
    platform: PlatformSchema.optional(),
    clientVersion: z.string().max(32).optional(),
    visitorId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
  })
  .strict();
/** Optional anonymous browser id (see VisitRequest) that links a sign-up to the visitor funnel. */
const visitorIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);
export const emailSchema = z.string().trim().toLowerCase().max(254).email('Неверный адрес почты');
export const passwordSchema = z.string().min(8, 'Пароль — минимум 8 символов').max(128);

/** Email sign-in for an existing account (any device). `deviceId` binds this browser's guest key to the account. */
export const EmailLoginRequest = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
    deviceId: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/).optional(),
    platform: PlatformSchema.optional(),
    clientVersion: z.string().max(32).optional(),
  })
  .strict();
/** Attach an email + password to the current account so it can be restored on another device. */
export const EmailLinkRequest = z.object({ email: emailSchema, password: passwordSchema }).strict();
export const PasswordChangeRequest = z.object({ current: z.string().min(1).max(128), password: passwordSchema }).strict();
export const PasswordResetRequest = z.object({ email: emailSchema }).strict();
export const PasswordResetConfirm = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/), password: passwordSchema }).strict();
/** Anonymous visit (before any sign-up): a random per-browser id, nothing else identifying. */
export const VisitRequest = z
  .object({ visitorId: visitorIdSchema, platform: PlatformSchema.optional(), referrer: z.string().max(120).optional() })
  .strict();

// ── Economy ────────────────────────────────────────────────────────────────
export const BuyRequest = z.object({ kind: z.enum(['weapon', 'character', 'gadget']), id: z.string().regex(/^[a-z0-9_]{2,24}$/) }).strict();
/** Buy a modification for one weapon (tokens). */
export const ModBuyRequest = z.object({ weapon: z.enum(WEAPON_IDS), mod: z.enum(MOD_IDS) }).strict();
export const LoadoutRequest = z
  .object({
    sidearm: z.enum(WEAPON_IDS),
    melee: z.enum(WEAPON_IDS),
    primary: z.enum(WEAPON_IDS).nullable(),
    gadget: z.enum(GADGET_IDS).nullable().optional(),
    /** Equipped modifications per weapon (validated against ownership and mounts). */
    mods: z.record(z.enum(WEAPON_IDS), z.array(z.enum(MOD_IDS)).max(4)).optional(),
  })
  .strict();
/** Opening a paid case requires an explicit adult confirmation (see docs/ECONOMY.md). */
export const CaseOpenRequest = z.object({ confirmAge: z.literal(true) }).strict();
export const CheckoutRequest = z.object({ packId: z.string().regex(/^[a-z0-9]{2,16}$/), method: z.enum(['card', 'crypto']) }).strict();

/** GET /api/shop/config — which payment methods are configured on this server. */
export interface ShopConfig {
  card: boolean;
  crypto: boolean;
  casesEnabled: boolean;
  packs: DiamondPack[];
}
export interface CaseResult {
  weapon: WeaponId;
  rarity: Rarity;
  inventory: Inventory;
}
export interface CheckoutResponse {
  paymentId: string;
  url: string;
}
export type PaymentStatus = 'created' | 'paid' | 'failed' | 'expired' | 'refunded';
export interface PaymentStatusResponse {
  status: PaymentStatus;
  diamonds: number;
}
export interface LedgerEntry {
  at: string;
  currency: Currency;
  delta: number;
  balanceAfter: number;
  reason: 'match' | 'purchase' | 'mod' | 'case' | 'topup' | 'grant' | 'refund';
  ref: string | null;
}

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
  tokens: number;
  diamonds: number;
  /** Email sign-in is set up (the account can be restored on another device). */
  email: string | null;
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
