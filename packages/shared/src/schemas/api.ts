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
import { KON_FORMATS } from '../game-rules/kon.js';
import { isKonStake } from '../game-rules/konStakes.js';
import type { KonFormat } from '../game-rules/kon.js';
import type { FinishId, SkinRarity } from '../game-rules/skins.js';
import type { Currency, DiamondPack, Inventory, Rarity } from '../game-rules/economy.js';
import { MAP_IDS } from '../maps/types.js';
import { GAME_MODES } from '../game-rules/match.js';
import type { GameMode } from '../game-rules/match.js';
import type { MapId } from '../maps/types.js';
import type { AchievementId } from '../game-rules/progression.js';
import type { StoryDone } from './story.js';
import type { BlatPool } from '../game-rules/blat.js';
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
/**
 * V2.0 part F: the first touch — what a browser's first visit came with (a partner's link `?p=`, a campaign
 * `utm_*`, a room invitation, the referring domain). Analytics only: nothing is paid for it.
 */
export const partnerCodeSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, 'A partner code: 3–24 Latin letters, digits or _');
const utmValueSchema = z.string().trim().toLowerCase().min(1).max(64).regex(/^[a-z0-9 ._+-]+$/);
export const FirstTouchSchema = z
  .object({
    partner: partnerCodeSchema.optional(),
    utmSource: utmValueSchema.optional(),
    utmMedium: utmValueSchema.optional(),
    utmCampaign: utmValueSchema.optional(),
    invite: z.boolean().optional(),
    referrer: z.string().max(80).regex(/^[a-z0-9.-]+$/).optional(),
  })
  .strict();
export type FirstTouch = z.infer<typeof FirstTouchSchema>;
/** How a new account came (kept with the account; `unknown`: made before V2.0 part F). */
export const SOURCE_CHANNELS = ['partner', 'referral', 'invite', 'utm', 'referrer', 'telegram', 'direct'] as const;
export type SourceChannel = (typeof SOURCE_CHANNELS)[number];
/** V2.0 part E: a one-time code that attaches Telegram to an existing account. */
export const telegramLinkCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{16,32}$/);
/** How attaching Telegram went: linked now; was already linked; the Telegram account has its own progress; the code ran out; no such code. */
export type TelegramLinkOutcome = 'linked' | 'already' | 'conflict' | 'expired' | 'invalid';
export const TelegramAuthRequest = z
  .object({
    initData: z.string().min(10).max(8192),
    platform: PlatformSchema.optional(),
    clientVersion: z.string().max(32).optional(),
    /** Optional anonymous browser id (see VisitRequest) that links a new player to the visitor funnel. */
    visitorId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
    ref: refSchema.optional(),
    /** V2.0 part E: the one-time code from the bot's link (`?tglink=`): Telegram is attached to the code's account. */
    link: telegramLinkCodeSchema.optional(),
    /** V2.0 part F: the first touch, kept with a new account. */
    source: FirstTouchSchema.optional(),
  })
  .strict();
export const DevAuthRequest = z
  .object({
    name: signupNameSchema,
    deviceId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
    platform: PlatformSchema.optional(),
    clientVersion: z.string().max(32).optional(),
    ref: refSchema.optional(),
    source: FirstTouchSchema.optional(),
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
    source: FirstTouchSchema.optional(),
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
    /** V2.0 part E: inside Telegram, the signed launch data — this Telegram account gets attached to the email's account. */
    initData: z.string().min(10).max(8192).optional(),
  })
  .strict();
/** Attach an email + password to the current account so it can be restored on another device. */
export const EmailLinkRequest = z.object({ email: emailSchema, password: passwordSchema }).strict();
export const PasswordChangeRequest = z.object({ current: z.string().min(1).max(128), password: passwordSchema }).strict();
export const PasswordResetRequest = z.object({ email: emailSchema }).strict();
export const PasswordResetConfirm = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/), password: passwordSchema }).strict();
/** Anonymous visit (before any sign-up): a random per-browser id, nothing else identifying. */
export const VisitRequest = z
  .object({ visitorId: visitorIdSchema, platform: PlatformSchema.optional(), referrer: z.string().max(120).optional(), source: FirstTouchSchema.optional() })
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

/** v0.2.17: GET /api/site — the menu's X and Telegram links (null: «coming soon»), stakes in the $BLAT Tournament. */
export interface SiteConfig {
  x: string | null;
  telegram: string | null;
  stakes: boolean;
}

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
  reason: 'match' | 'purchase' | 'mod' | 'case' | 'topup' | 'grant' | 'refund' | 'level' | 'referral' | 'story';
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
/** V2.0 part D: `kon` makes it a «Блатной кон» room (team deathmatch, fixed sides, people only). */
/** v0.2.17: the $BLAT Tournament's stake (0 or one of KON_STAKE_AMOUNTS; tournament rooms only). */
const KonStakeField = z.number().int().refine((v) => isKonStake(v), { message: 'not one of the stakes' });
export const CreateRoomRequest = z.object({ mapId: z.enum(MAP_IDS), isPrivate: z.boolean().default(true), mode: z.enum(GAME_MODES).default('ffa'), kon: z.enum(KON_FORMATS).optional(), stake: KonStakeField.optional() }).strict();
export const QuickMatchRequest = z.object({ mapId: z.enum(MAP_IDS).optional(), mode: z.enum(GAME_MODES).default('ffa'), kon: z.enum(KON_FORMATS).optional(), stake: KonStakeField.optional() }).strict();

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
  /** v0.2.17: the founder's account — a gold «Founder» badge by the alias and the hidden way into /admin. */
  founder?: boolean;
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
  profile: PublicProfile;
  isNew: boolean;
  /** V2.0 part E: the sign-in also tried to attach Telegram to the account (a code from the bot, or an email sign-in inside Telegram). */
  telegramLink?: TelegramLinkOutcome;
}

/** V2.0 part E: the bot's link that attaches Telegram to the current account (valid for 10 minutes, once). */
export interface TelegramLinkCodeResponse {
  url: string;
  expiresAt: string;
}

export interface CreateRoomResponse {
  roomId: string;
  inviteCode: string | null;
  inviteUrl: string | null;
  webUrl: string;
  mapId: MapId;
  mode: GameMode;
  /** V2.0 part D: a «Блатной кон» room. */
  kon?: KonFormat | null;
  /** v0.2.17: the $BLAT Tournament's stake (0: none). */
  stake?: number;
}

/** POST /api/rooms/quick */
export interface QuickMatchResponse {
  roomId: string;
  mapId: MapId;
  mode: GameMode;
  kon: KonFormat | null;
  /** v0.2.17: the $BLAT Tournament's stake (0: none). */
  stake?: number;
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
  /** V2.0 part D: a «Блатной кон» room. */
  kon?: KonFormat | null;
  /** v0.2.17: the $BLAT Tournament's stake everyone in the room puts in (0: none). */
  stake?: number;
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
  /** V2.0 part F: distinct people who played an online match in the period. */
  uniquePlayers?: number;
  /** V2.0 part F: people whose first online match was in the period. */
  firstMatchPlayers?: number;
  /** V2.0 part F: $BLAT credited in the period. */
  blatIssued?: number;
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
  items: Array<{ kind: 'weapon' | 'character' | 'gadget'; id: string; source: 'tokens' | 'diamonds' | 'case' | 'grant' | 'story'; acquiredAt: string }>;
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
  /** V2.0 parts E–F: how the account came (null: before part F) and Telegram merges. */
  origin?: { channel: SourceChannel | null; detail: string | null; partner: string | null; mergedInto: string | null; mergedAt: string | null; mergedFrom: number };
  /** v0.2.16: the story missions done (a best time of 0: opened by an administrator, never played). */
  story?: StoryDone[];
  /** v0.2.17: the founder's account. */
  founder?: boolean;
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
  /** v0.2.17: the supply's pools (the cap and what each has given). */
  pools?: Array<{ pool: BlatPool; cap: number; issued: number }>;
}

/** v0.2.17: POST /api/admin/players/:id/blat-allocation — a share out of a pool (not the players'). */
export const AdminBlatAllocationRequest = z
  .object({
    pool: z.enum(['influencers', 'friends', 'reserve']),
    amount: z.number().int().min(1).max(100_000_000),
    note: z.string().trim().min(3).max(120),
  })
  .strict();
export type AdminBlatAllocationRequest = z.infer<typeof AdminBlatAllocationRequest>;

/** v0.2.17: POST /api/admin/players/:id/founder — what «Make founder» did. */
export interface AdminFounderResult {
  level: number;
  blat: number;
  allocated: number;
  items: number;
}

export const AdminReferralDecision = z.object({ action: z.enum(['confirm', 'reject']), note: z.string().trim().max(200).optional() }).strict();

/** V2.0 part C: the BLAT DROP announcement date as the admin sees it (`source`: who set it; v0.2.17:
 * `default` — the owner's date built into this release, BLAT_DROP_DEFAULT_ANNOUNCE_AT). */
export interface AdminBlatDrop {
  announceAt: string | null;
  source: 'admin' | 'env' | 'default' | null;
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

/**
 * POST /api/admin/players/:id/story-open — for checking the story (v0.2.16): the campaign's missions
 * before `mission` count as done for the player (a best time of 0, nothing paid), so `mission` is open.
 */
export const AdminStoryOpenRequest = z.object({ mission: z.string().regex(/^[a-z0-9_]{1,16}$/) }).strict();
export type AdminStoryOpenRequest = z.infer<typeof AdminStoryOpenRequest>;
export interface AdminStoryOpenResponse {
  /** The missions this call marked done (the ones done before stay as they were). */
  opened: string[];
  done: StoryDone[];
}

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

/** V2.0 part F: GET /api/admin/growth — where players come from, invitations, levels, the Kon, $BLAT issued. */
export interface AdminSourceRow {
  channel: SourceChannel | 'unknown';
  /** The partner's code, «source / medium / campaign», the referring domain; null for the others. */
  detail: string | null;
  accounts: number;
  /** Took part in at least one online match. */
  firstMatch: number;
  /** Played a whole match. */
  completed: number;
  /** Active on a later day than the sign-up. */
  returned: number;
}
export interface AdminVisitSourceRow {
  kind: 'partner' | 'utm' | 'referrer' | 'direct';
  key: string;
  visitors: number;
  registered: number;
}
export interface AdminGrowth {
  range: AdminRange;
  generatedAt: string;
  players: {
    /** Accounts made in the period (merged empty profiles left out). */
    registered: number;
    /** Distinct people who played an online match in the period. */
    unique: number;
    /** People whose very first online match was in the period. */
    firstMatch: number;
    completedMatches: number;
  };
  sources: AdminSourceRow[];
  visits: AdminVisitSourceRow[];
  invites: {
    /** Room invitations created (`invite_created`). */
    roomInvites: number;
    /** Invitation links opened (`invite_opened`). */
    opened: number;
    /** Distinct players who entered a lobby through an invitation. */
    joinedLobby: number;
    /** Distinct players who played a whole match they joined by invitation. */
    played: number;
    /** Of them: accounts made in the period. */
    newPlayers: number;
    /** played ÷ roomInvites. */
    conversion: number | null;
    /** Players' referral links: new accounts attached in the period, and of them counted (a whole match). */
    referralAttached: number;
    referralConfirmed: number;
    referralConversion: number | null;
  };
  levels: {
    /** Every account by its level now. */
    buckets: Array<{ bucket: string; players: number }>;
    /** Levels reached in the period (from the $BLAT level credits: one per player and level). */
    reached: Array<{ level: number; players: number }>;
    average: number | null;
    max: number;
  };
  kon: { matches: number; players: number; byFormat: Array<{ format: KonFormat; matches: number }> };
  blat: { issued: number; fromLevels: number; fromReferrals: number };
}

/** V2.0 part F: a partner's link (an author, a streamer) and what it brought in the period. Measuring only — no payouts. */
export interface AdminPartnerRow {
  id: string;
  code: string;
  name: string;
  note: string | null;
  active: boolean;
  createdAt: string;
  webUrl: string;
  telegramUrl: string | null;
  visitors: number;
  accounts: number;
  firstMatch: number;
  completed: number;
  returned: number;
  /** Whole matches played in the period by the accounts it brought. */
  matches: number;
}
export const AdminPartnerCreate = z.object({ name: z.string().trim().min(1).max(60), code: partnerCodeSchema.optional(), note: z.string().trim().max(300).optional() }).strict();
export const AdminPartnerUpdate = z.object({ name: z.string().trim().min(1).max(60).optional(), note: z.string().trim().max(300).nullable().optional(), active: z.boolean().optional() }).strict();

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
