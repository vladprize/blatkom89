/** HTTP API request/response contracts shared by server and client. */
import type { ClubBadge } from '../game-rules/clubs.js';
import { z } from 'zod';
import { CHARACTER_IDS } from '../game-rules/characters.js';
import type { CharacterId } from '../game-rules/characters.js';
import { AVATAR_IDS } from '../game-rules/avatars.js';
import type { AvatarId } from '../game-rules/avatars.js';
import { WEAPON_IDS, MOD_IDS } from '../game-rules/weapons.js';
import { GADGET_IDS } from '../game-rules/gadgets.js';
import type { WeaponId } from '../game-rules/weapons.js';
import { FINISH_IDS } from '../game-rules/skins.js';
import type { FinishId, SkinRarity } from '../game-rules/skins.js';
import type { Currency, DiamondPack, Inventory, Rarity } from '../game-rules/economy.js';
import { MAP_IDS } from '../maps/types.js';
import { GAME_MODES } from '../game-rules/match.js';
import type { GameMode } from '../game-rules/match.js';
import type { MapId } from '../maps/types.js';
import type { AchievementId } from '../game-rules/progression.js';
import { MAX_NAME_LENGTH } from '../constants/game.js';
import { LATIN_NAME_RE } from '../game-rules/aliases.js';
import { PlatformSchema } from '../events/analytics.js';

/** Aliases (v0.3): Latin letters only — see game-rules/aliases.ts (`LATIN_NAME_RE`, `toLatin`). */
export const displayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(MAX_NAME_LENGTH)
  .regex(LATIN_NAME_RE, 'A name may contain Latin letters (A–Z), digits, spaces and _ . -');

/**
 * The first name a new account brings (guest and development sign-up): anything readable — the server
 * keeps it in Latin letters (`latinName`; an older client may still send a Cyrillic suggestion).
 */
export const signupNameSchema = z.string().trim().min(1).max(64);

/** V2.0: the referral code the browser was opened with (a new account is attached to its inviter). */
const refSchema = z.string().regex(/^[A-Za-z0-9_-]{4,32}$/);
export const TelegramAuthRequest = z
  .object({
    initData: z.string().min(10).max(8192),
    platform: PlatformSchema.optional(),
    clientVersion: z.string().max(32).optional(),
    /** Optional anonymous browser id (see VisitRequest) that links a new player to the visitor funnel. */
    visitorId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
    ref: refSchema.optional(),
  })
  .strict();
export const DevAuthRequest = z
  .object({
    name: signupNameSchema,
    deviceId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
    platform: PlatformSchema.optional(),
    clientVersion: z.string().max(32).optional(),
    ref: refSchema.optional(),
  })
  .strict();
/**
 * Guest login for the public website (no Telegram). `deviceId` is a random secret generated and kept
 * by the browser (≥ 20 chars); the server stores only an HMAC of it. `name` is used for new players only.
 */
export const GuestAuthRequest = z
  .object({
    name: signupNameSchema,
    deviceId: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
    platform: PlatformSchema.optional(),
    clientVersion: z.string().max(32).optional(),
    visitorId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
    ref: refSchema.optional(),
  })
  .strict();
/** Optional anonymous browser id (see VisitRequest) that links a sign-up to the visitor funnel. */
const visitorIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);
export const emailSchema = z.string().trim().toLowerCase().max(254).email('That is not a valid email address');
export const passwordSchema = z.string().min(8, 'The password needs at least 8 characters').max(128);

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
    /** Equipped skins per weapon (validated against ownership). */
    skins: z.record(z.enum(WEAPON_IDS), z.enum(FINISH_IDS)).optional(),
  })
  .strict();
/** Opening a paid case requires an explicit adult confirmation (see docs/ECONOMY.md). */
/** `confirmAge` is required only while a case costs real money (diamonds); talon cases need none. */
export const CaseOpenRequest = z.object({ confirmAge: z.literal(true).optional() }).strict();
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
/** POST /api/shop/skin-case — a skin the player did not own; equipped at once when its weapon wore none. */
export interface SkinCaseResult {
  weapon: WeaponId;
  finish: FinishId;
  rarity: SkinRarity;
  equipped: boolean;
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
  reason: 'match' | 'purchase' | 'mod' | 'case' | 'topup' | 'grant' | 'refund' | 'level' | 'referral';
  ref: string | null;
}

export const UpdateProfileRequest = z
  .object({
    displayName: displayNameSchema.optional(),
    preferredCharacter: z.enum(CHARACTER_IDS).optional(),
    /** A profile avatar (game-rules/avatars.ts); null removes it. */
    avatar: z.enum(AVATAR_IDS).nullable().optional(),
  })
  .strict();
export const CreateRoomRequest = z.object({ mapId: z.enum(MAP_IDS), isPrivate: z.boolean().default(true), mode: z.enum(GAME_MODES).default('ffa') }).strict();
export const QuickMatchRequest = z.object({ mapId: z.enum(MAP_IDS).optional(), mode: z.enum(GAME_MODES).default('ffa') }).strict();

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
  /** Profile avatar (null: the character's portrait is shown). */
  avatar: AvatarId | null;
  tokens: number;
  diamonds: number;
  /** V2.0: $BLAT — in-game points (game-rules/blat.ts). */
  blat?: number;
  /** V2.0: $BLAT paid by this very request for levels not paid before (the welcome, older levels). */
  blatCredited?: number;
  /** Email sign-in is set up (the account can be restored on another device). */
  email: string | null;
  /** Rating (the Top-100 table; starts at 1000). */
  rating: number;
  /** The player's club (v0.3), if any. */
  club?: ClubBadge | null;
  /** v0.3: the providers the account signs in with besides email and Telegram (google, facebook, discord, reddit). */
  identities?: string[];
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
  mode: GameMode;
}

export type InviteStatus = 'joinable' | 'full' | 'in_progress' | 'finished' | 'expired' | 'not_found';

export interface InviteInfo {
  code: string;
  status: InviteStatus;
  roomId: string | null;
  mapId: MapId | null;
  mode: GameMode | null;
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
  /** Rating change in this match. */
  ratingDelta: number;
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
  /** Matches per game mode (ffa, teams, ctf, bases). */
  modes: Array<{ key: string; count: number }>;
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

/** /api/admin/clubs (v0.3): every club for moderation; `house`: kept by the game itself. */
export interface AdminClubRow {
  id: string;
  name: string;
  tag: string;
  motto: string;
  rating: number;
  rank: number;
  members: number;
  realMembers: number;
  headName: string | null;
  recruiting: boolean;
  house: boolean;
  createdAt: string;
  requests: number;
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
  /** Current balances (talons = `tokens`). */
  wallet: { tokens: number; diamonds: number };
  /** Email sign-in: the address is masked («d•••r@example.com») — admins never see it in full. */
  account: { emailMasked: string | null; emailLinkedAt: string | null; signInMethods: string[] };
  /** Bought / granted / dropped items (free ones are implicit and not listed). */
  items: Array<{ kind: 'weapon' | 'character' | 'gadget'; id: string; source: 'tokens' | 'diamonds' | 'case' | 'grant'; acquiredAt: string }>;
  mods: Array<{ weapon: string; mod: string; acquiredAt: string }>;
  /** Latest balance changes, newest first; `admin` is set for grants. */
  ledger: Array<{ at: string; currency: 'tokens' | 'diamonds' | 'blat'; delta: number; balanceAfter: number; reason: string; ref: string | null; admin: string | null }>;
  payments: AdminPaymentRow[];
  /** V2.0: $BLAT, the referral code, who invited the player and whom they invited; an admin's flag. */
  blat?: {
    balance: number;
    earned: number;
    refCode: string | null;
    referredBy: { id: string | null; name: string | null; status: AdminReferralRow['status'] } | null;
    referrals: Record<AdminReferralRow['status'], number>;
    flag: string | null;
  };
}

/** V2.0: an invitation as the admin sees it. */
export interface AdminReferralRow {
  refereeId: string;
  refereeName: string;
  referrerId: string | null;
  referrerName: string | null;
  code: string;
  attachedAt: string;
  status: 'pending' | 'confirmed' | 'held' | 'rejected';
  decidedAt: string | null;
  ordinal: number | null;
  reward: number;
  note: string | null;
}

/** V2.0: $BLAT in numbers (admin). */
export interface AdminBlatSummary {
  totalBalance: number;
  holders: number;
  /** All time, by source. */
  issued: Record<'level' | 'referral' | 'grant', number>;
  /** In the selected period, by source. */
  issuedInRange: Record<'level' | 'referral' | 'grant', number>;
  referrals: Record<AdminReferralRow['status'], number>;
  top: Array<{ id: string; name: string; balance: number; flagged: boolean }>;
  flagged: number;
}

export const AdminReferralDecision = z.object({ action: z.enum(['confirm', 'reject']), note: z.string().trim().max(200).optional() }).strict();

/** V2.0 part C: the BLAT DROP announcement date as the admin sees it (`source`: who set it). */
export interface AdminBlatDrop {
  announceAt: string | null;
  source: 'admin' | 'env' | null;
  updatedAt: string | null;
  updatedBy: string | null;
}
export const AdminBlatDropRequest = z.object({ announceAt: z.string().datetime({ offset: true }).nullable() }).strict();

/** V2.0 part C: a balance snapshot (`rowsNow`: rows left — deleted accounts leave with their data). */
export interface AdminBlatSnapshot {
  id: string;
  takenAt: string;
  takenBy: string | null;
  note: string | null;
  accounts: number;
  eligible: number;
  total: number;
  eligibleTotal: number;
  rowsNow: number;
}
export interface AdminBlatSnapshotRow {
  userId: string;
  name: string;
  balance: number;
  earned: number;
  fromLevels: number;
  fromReferrals: number;
  fromGrants: number;
  ledgerSum: number;
  eligible: boolean;
  reasons: string[];
  flag: string | null;
}
export const AdminBlatSnapshotRequest = z.object({ note: z.string().trim().max(200).optional() }).strict();
export const AdminBlatFlagRequest = z.object({ flag: z.string().trim().min(1).max(200).nullable() }).strict();

export interface AdminPaymentRow {
  id: string;
  createdAt: string;
  paidAt: string | null;
  provider: string;
  packId: string;
  diamonds: number;
  amountCents: number;
  currency: string;
  status: 'created' | 'paid' | 'failed' | 'expired' | 'refunded';
}

/** POST /api/admin/players/:id/grant — audited balance adjustment (negative = correction). */
export const AdminGrantRequest = z
  .object({
    currency: z.enum(['tokens', 'diamonds']),
    amount: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((v) => v !== 0, 'amount must not be 0'),
    note: z.string().trim().min(3).max(120),
  })
  .strict();
export type AdminGrantRequest = z.infer<typeof AdminGrantRequest>;

/** POST /api/admin/players/:id/reset-link — one-time password-reset link for a player with an email. */
export interface AdminResetLink {
  link: string;
  expiresAt: string;
}

/**
 * GET /api/admin/funnel — two cohorts of the period: anonymous visitors first seen in it (website and
 * mini app) and players registered in it (any sign-in). Steps are nested: played ⊂ registered,
 * returned ⊂ played. `paid` and `emailLinked` are counted among the registered.
 */
export interface AdminFunnelCohort {
  entered: number;
  registered: number;
  played: number;
  returned: number;
  paid: number;
  emailLinked: number;
}
export interface AdminFunnel {
  range: AdminRange;
  visitors: AdminFunnelCohort;
  players: AdminFunnelCohort;
  referrers: Array<{ key: string; visitors: number; registered: number }>;
  daily: Array<{ day: string; uniqueVisitors: number; newVisitors: number; registrations: number }>;
}

/** GET /api/admin/economy — currency flows by ledger reason, revenue, purchases, mods and cases. */
export interface AdminCurrencyFlow {
  /** Credited in the period by ledger reason (match, topup, grant, refund). */
  issued: Record<string, number>;
  /** Debited in the period by ledger reason (purchase, mod, case, grant corrections). */
  spent: Record<string, number>;
  issuedTotal: number;
  spentTotal: number;
  /** Sum of all balances right now and how many players hold any. */
  circulating: number;
  holders: number;
}
export interface AdminEconomy {
  range: AdminRange;
  generatedAt: string;
  tokens: AdminCurrencyFlow;
  diamonds: AdminCurrencyFlow;
  revenue: {
    /** Paid (incl. later refunded) payments by `paid_at` in the period. */
    payments: number;
    payers: number;
    byCurrency: Array<{ currency: string; grossCents: number; refundedCents: number }>;
    byProvider: Array<{ provider: string; payments: number; grossCents: number }>;
    byPack: Array<{ packId: string; payments: number }>;
    /** Checkouts created in the period that are still open / failed or expired. */
    pending: number;
    failed: number;
  };
  purchases: {
    /** Bought with talons or diamonds (case drops and grants are only in `byKind`). */
    total: number;
    byKind: Array<{ kind: string; source: string; count: number }>;
    top: Array<{ kind: string; id: string; count: number }>;
  };
  mods: { total: number; top: Array<{ id: string; count: number }> };
  cases: { total: number; diamondsSpent: number; byRarity: Array<{ rarity: string; count: number }>; byKind: Array<{ kind: string; count: number; diamondsSpent: number }> };
  daily: Array<{ day: string; tokensIssued: number; tokensSpent: number; diamondsIssued: number; diamondsSpent: number; revenueCents: number }>;
}
