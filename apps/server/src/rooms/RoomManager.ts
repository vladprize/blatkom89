/** Owns all rooms, the shared 60 Hz tick loop and room discovery (quick match, invites). */
import { randomBytes } from 'node:crypto';
import { MAP_ORDER, TICK_MS } from '@blatkom/shared';
import type { FillTiming, GameMode, KonFormat, MapId, MatchConfig } from '@blatkom/shared';
import { MatchRoom } from './MatchRoom.js';
import type { Services } from '../services/contracts.js';
import type { Logger } from '../logging/logger.js';

export interface RoomManagerOptions {
  maxRooms: number;
  config?: Partial<MatchConfig>;
  /** Fill small lineups with players the rooms run themselves (MATCH_FILL_BOTS; off by default). */
  fillBots?: boolean;
  fillTiming?: Partial<FillTiming>;
}

/** Someone's place in the rooms changed (joined, left, a match started or ended): friends are told. */
export type PresenceListener = (userId: string) => void;

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function newRoomId(len = 10): string {
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  return s;
}

export class RoomManager {
  private readonly rooms = new Map<string, MatchRoom>();
  private timer: NodeJS.Timeout | null = null;
  private nextTickAt = 0;
  private presence: PresenceListener | null = null;

  constructor(
    private readonly services: Services,
    private readonly log: Logger,
    private readonly opts: RoomManagerOptions,
  ) {}

  count(): number {
    return this.rooms.size;
  }

  get(id: string): MatchRoom | undefined {
    const r = this.rooms.get(id);
    return r && !r.closed ? r : undefined;
  }

  list(): MatchRoom[] {
    return [...this.rooms.values()].filter((r) => !r.closed);
  }

  /** The room a person is connected to (if any). */
  roomOf(userId: string): MatchRoom | undefined {
    for (const r of this.rooms.values()) if (!r.closed && r.hasPerson(userId)) return r;
    return undefined;
  }

  onPresence(listener: PresenceListener | null): void {
    this.presence = listener;
  }

  /** A room; with `kon` a «Блатной кон» room of that format (team deathmatch, fixed sides, people only). */
  create(mapId: MapId, isPrivate: boolean, hostUserId: string | null, inviteCode: string | null = null, mode: GameMode = 'ffa', kon: KonFormat | null = null, stake = 0): MatchRoom {
    if (this.rooms.size >= this.opts.maxRooms) throw new Error('room limit reached');
    let id = newRoomId();
    while (this.rooms.has(id)) id = newRoomId();
    const room = new MatchRoom(
      {
        id,
        mapId,
        isPrivate,
        hostUserId,
        inviteCode,
        mode: kon ? 'teams' : mode,
        kon,
        stake: kon ? stake : 0,
        config: this.opts.config,
        fillBots: this.opts.fillBots ?? false,
        ...(this.opts.fillTiming ? { fillTiming: this.opts.fillTiming } : {}),
        onPresence: (userId) => this.presence?.(userId),
      },
      this.services,
      this.log,
    );
    this.rooms.set(id, room);
    this.services.analytics.server('lobby_created', { roomId: id, mapId, isPrivate, mode: room.mode }, { userId: hostUserId });
    return room;
  }

  /** Finds a public joinable room of the mode (preferring the requested map and fuller rooms) or creates one. */
  quickMatch(userId: string, mapId?: MapId, mode: GameMode = 'ffa'): MatchRoom {
    const candidates = this.list()
      .filter((r) => !r.isPrivate && r.kon === null && r.mode === mode && r.isJoinable(userId) && (!mapId || r.mapId === mapId))
      .sort((a, b) => b.occupancy - a.occupancy);
    if (candidates[0]) return candidates[0];
    const map = mapId ?? MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)]!;
    return this.create(map, false, null, null, mode);
  }

  /**
   * V2.0 part D, «Блатной кон» search: a public Kon room of the format still gathering people (the
   * fullest first, on the chosen map if one was chosen) or a new one. It starts by itself once full.
   */
  konQuick(userId: string, format: KonFormat, mapId?: MapId, stake = 0): MatchRoom {
    const candidates = this.list()
      .filter((r) => !r.isPrivate && r.kon === format && r.stake === stake && r.phase === 'waiting' && r.isJoinable(userId) && (!mapId || r.mapId === mapId))
      .sort((a, b) => b.occupancy - a.occupancy);
    if (candidates[0]) return candidates[0];
    const map = mapId ?? MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)]!;
    return this.create(map, false, null, null, 'teams', format, stake);
  }

  /** People waiting in public Kon rooms of each format (the Kon screen shows it). */
  konWaiting(): Record<KonFormat, number> {
    const out: Record<KonFormat, number> = { '1x1': 0, '2x2': 0, '3x3': 0, '5x5': 0 };
    for (const r of this.list()) if (r.kon && !r.isPrivate && r.phase === 'waiting') out[r.kon] += r.connectedCount;
    return out;
  }

  /** v0.2.17: the same by stake («0», «100», …): a search only finds rooms of its own stake. */
  konWaitingByStake(): Record<string, Record<KonFormat, number>> {
    const out: Record<string, Record<KonFormat, number>> = {};
    for (const r of this.list()) {
      if (!r.kon || r.isPrivate || r.phase !== 'waiting') continue;
      const row = (out[String(r.stake)] ??= { '1x1': 0, '2x2': 0, '3x3': 0, '5x5': 0 });
      row[r.kon] += r.connectedCount;
    }
    return out;
  }

  start(): void {
    if (this.timer) return;
    this.nextTickAt = performance.now();
    const loop = () => {
      const now = performance.now();
      let steps = 0;
      while (now >= this.nextTickAt && steps < 5) {
        this.tickAll();
        this.nextTickAt += TICK_MS;
        steps++;
      }
      if (now - this.nextTickAt > 250) this.nextTickAt = now; // fell far behind: resync
      this.timer = setTimeout(loop, Math.max(0, this.nextTickAt - performance.now()));
    };
    loop();
  }

  tickAll(now = Date.now()): void {
    for (const [id, room] of this.rooms) {
      try {
        room.tick(now);
      } catch (e) {
        this.log.error('room tick failed', { room: id, err: e as Error });
        this.services.analytics.error({ source: 'server', component: 'room', category: 'tick', message: (e as Error).message });
        room.close('error');
      }
      if (room.closed) this.rooms.delete(id);
    }
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const r of this.rooms.values()) r.close('shutdown');
    this.rooms.clear();
  }
}
