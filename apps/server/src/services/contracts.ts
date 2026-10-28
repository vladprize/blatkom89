/**
 * Service contracts between the realtime game layer (rooms) and persistence/analytics.
 * Implementations: services/persistence.ts (PostgreSQL) and services/memory.ts (tests/offline).
 */
import type { AvatarId, CharacterId, GameMode, KonFormat, Loadout, MapId, PersonalResult, Team } from '@blatkom/shared';
import type { Platform, StakeRefusal } from '@blatkom/shared';

export interface AuthedUser {
  userId: string;
  sessionId: string;
  displayName: string;
  level: number;
  /** Profile avatar shown to the other players in the lobby (null: the character's portrait). */
  avatar?: AvatarId | null;
  platform: Platform | null;
  /** How the session was opened (verified server-side, unlike `platform`). */
  method?: 'telegram' | 'dev' | 'guest' | 'email';
  /** V2.0 part D: the «Блатной кон» rating (the search deals sides by it; shown in Kon rooms). */
  konRating?: number;
  /** v0.2.17: the founder's account (its badge in rooms). */
  founder?: boolean;
}

/** Validates bearer session tokens (HTTP and WebSocket hello). */
export interface SessionVerifier {
  verify(token: string): Promise<AuthedUser | null>;
}

export interface MatchStart {
  matchId: string;
  roomId: string;
  mapId: MapId;
  mode: GameMode;
  isPrivate: boolean;
  startedAt: Date;
  /** People in the match (players the server filled in are never recorded individually). */
  players: Array<{ userId: string; character: CharacterId; viaInvite: boolean; team: Team | null }>;
  /** Players the server added to complete the lineup. */
  fill?: number;
}

export interface MatchParticipantResult {
  userId: string;
  character: CharacterId;
  place: number;
  kills: number;
  assists: number;
  deaths: number;
  score: number;
  damageDealt: number;
  /** Present when the match ended (not disconnected/abandoned). */
  completed: boolean;
  viaInvite: boolean;
  /** Team matches: the player's team and how it did. */
  team: Team | null;
  teamOutcome?: 'win' | 'loss' | 'draw';
  /** Capture the flag / base capture: flags or bases captured (XP). */
  objectives?: number;
  /** Time actually spent in the match. */
  playtimeMs: number;
}

export interface MatchCompletion {
  matchId: string;
  roomId: string;
  mapId: MapId;
  mode: GameMode;
  /** Team matches: the winning team (null = draw, or a free-for-all match). */
  winnerTeam: Team | null;
  isPrivate: boolean;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  endReason: 'time' | 'score' | 'aborted';
  /** Everyone present at the end, filled players included (places and wins count them as opponents). */
  playersAtEnd: number;
  /** People present at the end (default: playersAtEnd) — «played with friends» and the stored player count. */
  peopleAtEnd?: number;
  /** Players the server added to complete the lineup, present at the end (default 0). */
  fillAtEnd?: number;
  participants: MatchParticipantResult[];
  /** V2.0 part D: a «Блатной кон» match — the Kon rating moves, the general rating doesn't. */
  kon?: KonFormat | null;
  /** v0.2.17: the stake everyone put in (settled in the results transaction); 0 or absent: none. */
  stake?: number;
}

export interface MatchRecorder {
  matchStarted(m: MatchStart): Promise<void>;
  /**
   * Persists results and awards XP/achievements exactly once per (match, user), even when called
   * repeatedly or concurrently. Returns personal results for every recorded participant.
   */
  matchCompleted(m: MatchCompletion): Promise<Map<string, PersonalResult>>;
  matchAbandoned(matchId: string, reason: string): Promise<void>;
}

export interface InviteRegistry {
  create(roomId: string, createdBy: string | null): Promise<{ code: string; expiresAt: Date }>;
  resolve(code: string): Promise<{ roomId: string } | null>;
}

export type ServerEventName =
  | 'story_started'
  | 'story_completed'
  | 'session_started'
  | 'profile_created'
  | 'lobby_created'
  | 'lobby_joined'
  | 'lobby_left'
  | 'match_started'
  | 'match_completed'
  | 'match_abandoned'
  | 'map_played'
  | 'invite_created'
  | 'shop_purchase'
  | 'mod_bought'
  | 'case_opened'
  | 'payment_completed'
  | 'email_linked'
  | 'identity_linked';

export interface EventContext {
  userId?: string | null;
  sessionId?: string | null;
  platform?: string | null;
}

export interface Analytics {
  /** Fire-and-forget server-side event (never throws). */
  server(name: ServerEventName, props: Record<string, unknown>, ctx?: EventContext): void;
  /** Records a sanitized technical error (never throws). */
  error(e: { source: 'client' | 'server'; component: string; category: string; message: string; clientVersion?: string | null; sessionId?: string | null; userId?: string | null }): void;
}

/** What a player brings into a room: validated spawn loadout (with modifications and equipment) and owned characters. */
export interface PlayerGear {
  loadout: Loadout;
  characters: ReadonlySet<CharacterId>;
}

export interface Economy {
  /** Loadout and owned characters of a player (rooms call it on join and after a 'loadout' message). */
  gear(userId: string): Promise<PlayerGear>;
}

/**
 * v0.2.17: the $BLAT Tournament's stakes (blat/stakes.ts). Absent: no stakes on this server (rooms with a
 * stake can't be made).
 */
export interface Stakes {
  /** null: the player may stake this much now. */
  check(userId: string, stake: number): Promise<StakeRefusal | null>;
  /** The match row and every player's stake in one transaction — all or nothing. */
  reserve(r: { matchId: string; roomId: string; mapId: MapId; mode: GameMode; isPrivate: boolean; kon: KonFormat; stake: number; userIds: string[] }): Promise<{ ok: true } | { ok: false; userId: string; reason: StakeRefusal }>;
  /** Every reserved stake of the match back (the match didn't start after all). */
  refund(matchId: string): Promise<number>;
}

/** v0.2.17: gang battles — which gang a person is in (rooms of a battle take only its two gangs' people). */
export interface Gangs {
  gangOf(userId: string): Promise<string | null>;
}

export interface Services {
  sessions: SessionVerifier;
  recorder: MatchRecorder;
  invites: InviteRegistry;
  analytics: Analytics;
  economy: Economy;
  stakes?: Stakes;
  gangs?: Gangs;
}
