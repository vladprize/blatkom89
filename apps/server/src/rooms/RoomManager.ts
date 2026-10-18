/** Owns all rooms, the shared 60 Hz tick loop and room discovery (quick match, invites). */
import { randomBytes } from 'node:crypto';
import { MAP_ORDER, TICK_MS } from '@blatkom/shared';
import type { MapId, MatchConfig } from '@blatkom/shared';
import { MatchRoom } from './MatchRoom.js';
import type { Services } from '../services/contracts.js';
import type { Logger } from '../logging/logger.js';

export interface RoomManagerOptions {
  maxRooms: number;
  config?: Partial<MatchConfig>;
}

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

  create(mapId: MapId, isPrivate: boolean, hostUserId: string | null, inviteCode: string | null = null): MatchRoom {
    if (this.rooms.size >= this.opts.maxRooms) throw new Error('room limit reached');
    let id = newRoomId();
    while (this.rooms.has(id)) id = newRoomId();
    const room = new MatchRoom({ id, mapId, isPrivate, hostUserId, inviteCode, config: this.opts.config }, this.services, this.log);
    this.rooms.set(id, room);
    this.services.analytics.server('lobby_created', { roomId: id, mapId, isPrivate }, { userId: hostUserId });
    return room;
  }

  /** Finds a public joinable room (preferring the requested map and fuller rooms) or creates one. */
  quickMatch(userId: string, mapId?: MapId): MatchRoom {
    const candidates = this.list()
      .filter((r) => !r.isPrivate && r.isJoinable(userId) && (!mapId || r.mapId === mapId))
      .sort((a, b) => b.occupancy - a.occupancy);
    if (candidates[0]) return candidates[0];
    const map = mapId ?? MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)]!;
    return this.create(map, false, null);
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
