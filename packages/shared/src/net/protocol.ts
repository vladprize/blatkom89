/** JSON control messages exchanged over the game WebSocket (low frequency). */
import { z } from 'zod';
import { CHARACTER_IDS } from '../game-rules/characters.js';
import type { CharacterId } from '../game-rules/characters.js';
import type { MatchConfig, MatchPhase } from '../game-rules/match.js';
import { MAP_IDS } from '../maps/types.js';
import type { MapId } from '../maps/types.js';
import type { HeavyWeaponId, WeaponId } from '../game-rules/weapons.js';
import type { Standing } from '../sim/world.js';
import type { AchievementId } from '../game-rules/progression.js';

/** v2: match points with assists, «дефицит» supply drops. */
export const PROTOCOL_VERSION = 2;

const roomId = z.string().regex(/^[A-Za-z0-9_-]{4,32}$/);

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    protocol: z.literal(PROTOCOL_VERSION),
    token: z.string().min(16).max(256),
    roomId,
    character: z.enum(CHARACTER_IDS),
    reconnectToken: z.string().min(16).max(128).optional(),
    clientVersion: z.string().max(32).optional(),
  }),
  z.object({ type: z.literal('ready'), ready: z.boolean() }),
  z.object({ type: z.literal('character'), character: z.enum(CHARACTER_IDS) }),
  z.object({ type: z.literal('map'), mapId: z.enum(MAP_IDS) }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('rematch') }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('ping'), t: z.number().finite() }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export interface RosterEntry {
  id: string;
  slot: number;
  name: string;
  character: CharacterId;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
  level: number;
}

export type GameEvent =
  | { t: 'damage'; victim: number; attacker: number; amount: number; hp: number; weapon: WeaponId }
  | { t: 'kill'; killer: number; victim: number; weapon: WeaponId; assists: number[] }
  | { t: 'respawn'; slot: number; x: number; y: number }
  | { t: 'pickup'; slot: number; weapon: HeavyWeaponId; ammoOnly: boolean }
  | { t: 'drop'; slot: number; weapon: HeavyWeaponId }
  | { t: 'supply'; x: number; y: number; weapon: HeavyWeaponId }
  | { t: 'reload'; slot: number; weapon: WeaponId }
  | { t: 'dry'; slot: number }
  | { t: 'phase'; phase: MatchPhase }
  | { t: 'matchEnd'; reason: 'time' | 'score' | 'aborted' };

export interface PersonalResult {
  xpGained: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  newAchievements: AchievementId[];
}

export type ServerMessage =
  | {
      type: 'welcome';
      playerId: string;
      slot: number;
      roomId: string;
      reconnectToken: string;
      serverTime: number;
      tick: number;
      mapId: MapId;
      config: MatchConfig;
      resumed: boolean;
    }
  | {
      type: 'roster';
      players: RosterEntry[];
      hostId: string | null;
      mapId: MapId;
      phase: MatchPhase;
      inviteCode: string | null;
      isPrivate: boolean;
      maxPlayers: number;
    }
  | { type: 'ev'; tick: number; events: GameEvent[] }
  | { type: 'results'; matchId: string; reason: 'time' | 'score' | 'aborted'; durationMs: number; standings: Standing[]; mapId: MapId }
  | { type: 'progress'; matchId: string; result: PersonalResult }
  | { type: 'error'; code: ErrorCode; message: string }
  | { type: 'pong'; t: number; serverTime: number }
  | { type: 'kicked'; reason: string };

export type ErrorCode =
  | 'bad_message'
  | 'unauthorized'
  | 'room_not_found'
  | 'room_full'
  | 'room_closed'
  | 'not_host'
  | 'invalid_state'
  | 'rate_limited'
  | 'version_mismatch'
  | 'internal';

export const WS_CLOSE = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  POLICY: 1008,
  TOO_BIG: 1009,
  INTERNAL: 1011,
  UNAUTHORIZED: 4001,
  ROOM_NOT_FOUND: 4004,
  ROOM_FULL: 4005,
  REPLACED: 4009,
  ROOM_CLOSED: 4010,
  KICKED: 4011,
} as const;
