/**
 * Service contracts between the realtime game layer (rooms) and persistence/analytics.
 * Implementations: services/persistence.ts (PostgreSQL) and services/memory.ts (tests/offline).
 */
import type { CharacterId, MapId, PersonalResult } from '@blatkom/shared';
import type { Platform } from '@blatkom/shared';

export interface AuthedUser {
  userId: string;
  sessionId: string;
  displayName: string;
  level: number;
  platform: Platform | null;
}

/** Validates bearer session tokens (HTTP and WebSocket hello). */
export interface SessionVerifier {
  verify(token: string): Promise<AuthedUser | null>;
}

export interface MatchStart {
  matchId: string;
  roomId: string;
  mapId: MapId;
  isPrivate: boolean;
  startedAt: Date;
  players: Array<{ userId: string; character: CharacterId; viaInvite: boolean }>;
}

export interface MatchParticipantResult {
  userId: string;
  character: CharacterId;
  place: number;
  kills: number;
  deaths: number;
  score: number;
  damageDealt: number;
  /** Present when the match ended (not disconnected/abandoned). */
  completed: boolean;
  viaInvite: boolean;
  /** Time actually spent in the match. */
  playtimeMs: number;
}

export interface MatchCompletion {
  matchId: string;
  roomId: string;
  mapId: MapId;
  isPrivate: boolean;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  endReason: 'time' | 'score' | 'aborted';
  /** Number of human players present at the end (bots are never recorded). */
  playersAtEnd: number;
  participants: MatchParticipantResult[];
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
  | 'session_started'
  | 'profile_created'
  | 'lobby_created'
  | 'lobby_joined'
  | 'lobby_left'
  | 'match_started'
  | 'match_completed'
  | 'match_abandoned'
  | 'map_played'
  | 'invite_created';

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

export interface Services {
  sessions: SessionVerifier;
  recorder: MatchRecorder;
  invites: InviteRegistry;
  analytics: Analytics;
}
