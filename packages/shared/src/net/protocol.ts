/** JSON control messages exchanged over the game WebSocket (low frequency). */
import { z } from 'zod';
import { CHARACTER_IDS } from '../game-rules/characters.js';
import type { CharacterId } from '../game-rules/characters.js';
import type { AvatarId } from '../game-rules/avatars.js';
import type { FinishId } from '../game-rules/skins.js';
import type { GameMode, MatchConfig, MatchPhase, Team, TeamResultSummary } from '../game-rules/match.js';
import { GAME_MODES } from '../game-rules/match.js';
import { MAP_IDS } from '../maps/types.js';
import type { MapId } from '../maps/types.js';
import type { ModId, WeaponId } from '../game-rules/weapons.js';
import type { ArmsId, GadgetId } from '../game-rules/gadgets.js';
import type { FlagAction, Standing } from '../sim/world.js';
import type { AchievementId } from '../game-rules/progression.js';

/**
 * v2: match points with assists, «дефицит» supply drops. v3: loadouts, rockets, medkits.
 * v4: the owner's arsenal (32 weapons), modifications, equipment (grenades, mines, C4, turret).
 * v5: up to 10 players, team matches (red vs blue): team in roster and snapshots, team scores.
 * v6: capture the flag and base capture: flags and bases in snapshots, objective events.
 */
export const PROTOCOL_VERSION = 6;

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
  /** Host: the game mode (lobby only). */
  z.object({ type: z.literal('mode'), mode: z.enum(GAME_MODES) }),
  /** Team matches: move to the other team (lobby only, while the teams stay even). */
  z.object({ type: z.literal('team'), team: z.union([z.literal(0), z.literal(1)]) }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('rematch') }),
  /** The player changed their loadout over the API: the server re-reads it (applies from the next spawn). */
  z.object({ type: z.literal('loadout') }),
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
  /** Profile avatar (game-rules/avatars.ts); absent or null: the character's portrait is shown. */
  avatar?: AvatarId | null;
  /** Team matches: 0 red, 1 blue. */
  team: Team | null;
  /** Equipped modifications of the player's weapons (client-side prediction of their own weapons). */
  mods?: Partial<Record<WeaponId, ModId[]>>;
  /** Equipped weapon skins: everybody sees the finish on the weapon in the player's hands. */
  skins?: Partial<Record<WeaponId, FinishId>>;
}

export type GameEvent =
  | { t: 'damage'; victim: number; attacker: number; amount: number; hp: number; weapon: ArmsId }
  | { t: 'kill'; killer: number; victim: number; weapon: ArmsId; assists: number[] }
  | { t: 'respawn'; slot: number; x: number; y: number }
  | { t: 'pickup'; slot: number; weapon: WeaponId; ammoOnly: boolean }
  | { t: 'drop'; slot: number; weapon: WeaponId }
  | { t: 'supply'; x: number; y: number; weapon: WeaponId }
  | { t: 'heal'; slot: number; amount: number; x: number; y: number }
  | { t: 'rocket'; id: number; shooter: number; weapon: WeaponId; x: number; y: number; angle: number; speed: number; range: number }
  | { t: 'boom'; id: number; shooter: number; weapon: ArmsId; x: number; y: number; radius: number }
  | { t: 'gadget'; id: number; kind: GadgetId; slot: number; x: number; y: number }
  | { t: 'flashbang'; x: number; y: number }
  | { t: 'ignite'; id: number; x: number; y: number; radius: number }
  | { t: 'smoke'; id: number; x: number; y: number; radius: number }
  | { t: 'beep'; id: number; x: number; y: number }
  | { t: 'turretDown'; id: number; x: number; y: number }
  | { t: 'reload'; slot: number; weapon: WeaponId }
  | { t: 'dry'; slot: number }
  | { t: 'phase'; phase: MatchPhase }
  | { t: 'matchEnd'; reason: 'time' | 'score' | 'aborted' }
  | { t: 'flag'; action: FlagAction; team: Team; slot: number }
  | { t: 'base'; base: number; team: Team; from: Team | null; slots: number[] };

export interface PersonalResult {
  xpGained: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  newAchievements: AchievementId[];
  /** Tokens earned in this match (spent in the shop on weapons, characters, modifications and equipment). */
  tokensGained?: number;
  totalTokens?: number;
  /** Rating change in this match and the rating after it (the Top-100 table). */
  ratingDelta?: number;
  rating?: number;
}

export type ServerMessage =
  | {
      type: 'welcome';
      playerId: string;
      slot: number;
      roomId: string;
      reconnectToken: string;
      mode: GameMode;
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
      mode: GameMode;
      /** People the host needs to start the match (1 when the server fills the lineup up). */
      minToStart?: number;
    }
  | { type: 'ev'; tick: number; events: GameEvent[] }
  | { type: 'results'; matchId: string; reason: 'time' | 'score' | 'aborted'; durationMs: number; standings: Standing[]; mapId: MapId; mode: GameMode; teams?: TeamResultSummary }
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
  | 'character_locked'
  | 'match_running'
  | 'not_enough_players'
  | 'team_full'
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
