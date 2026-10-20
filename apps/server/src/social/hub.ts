/**
 * The social hub: who is online and the live events of the social WebSocket (`/ws/social`).
 *
 * A player is «online» while one of their app windows keeps a social socket open, «in the lobby» /
 * «in a match» while they are connected to a room. Friends hear about a player coming online and
 * going offline; direct messages, friend requests and room invitations are pushed to every open
 * window of the recipient. One server instance holds the whole map (the game runs on one instance;
 * see docs/DEPLOYMENT.md before scaling out).
 */
import type { WebSocket } from 'ws';
import { SocialClientMessage } from '@blatkom/shared';
import type { FriendStatus, SocialEvent } from '@blatkom/shared';
import type { RoomManager } from '../rooms/RoomManager.js';
import type { SessionVerifier } from '../services/contracts.js';
import type { Logger } from '../logging/logger.js';

/** Social socket close codes. */
export const SOCIAL_CLOSE = { UNAUTHORIZED: 4401, REPLACED: 4409, POLICY: 1008 } as const;

export interface SocialStore {
  friendIds(userId: string): Promise<string[]>;
  counts(userId: string): Promise<{ unread: number; incoming: number }>;
  touch?(userId: string): Promise<void>;
}

/** At most this many social sockets per player (app windows). */
const MAX_SOCKETS_PER_USER = 6;

export class SocialHub {
  private readonly sockets = new Map<string, Set<WebSocket>>();
  private store: SocialStore | null = null;

  constructor(
    private readonly rooms: RoomManager,
    private readonly log: Logger,
  ) {}

  /** The database side (absent in tests without PostgreSQL: presence still works, friends don't). */
  attachStore(store: SocialStore | null): void {
    this.store = store;
  }

  isOnline(userId: string): boolean {
    return (this.sockets.get(userId)?.size ?? 0) > 0;
  }

  status(userId: string): FriendStatus {
    const room = this.rooms.roomOf(userId);
    if (room) return room.phase === 'waiting' || room.phase === 'finished' ? 'lobby' : 'match';
    return this.isOnline(userId) ? 'online' : 'offline';
  }

  /** Pushes an event to every open window of a player; false when none is open. */
  push(userId: string, event: SocialEvent): boolean {
    const set = this.sockets.get(userId);
    if (!set || set.size === 0) return false;
    const data = JSON.stringify(event);
    for (const ws of set) if (ws.readyState === 1) ws.send(data);
    return true;
  }

  /** Tells a player's online friends where they are now. */
  async announce(userId: string): Promise<void> {
    if (!this.store) return;
    const status = this.status(userId);
    try {
      for (const f of await this.store.friendIds(userId)) this.push(f, { type: 'presence', userId, status });
    } catch (e) {
      this.log.warn('presence announce failed', { err: e as Error });
    }
  }

  /** A freshly upgraded `/ws/social` socket: the first message must be `auth` within 8 s. */
  accept(ws: WebSocket, sessions: SessionVerifier): void {
    let userId: string | null = null;
    const timer = setTimeout(() => {
      if (!userId) ws.close(SOCIAL_CLOSE.UNAUTHORIZED, 'auth timeout');
    }, 8000);
    ws.on('error', () => {});
    ws.on('message', (data, isBinary) => {
      if (isBinary) return ws.close(SOCIAL_CLOSE.POLICY, 'binary');
      let msg: SocialClientMessage;
      try {
        const parsed = SocialClientMessage.safeParse(JSON.parse(String(data)));
        if (!parsed.success) return ws.close(SOCIAL_CLOSE.POLICY, 'bad message');
        msg = parsed.data;
      } catch {
        return ws.close(SOCIAL_CLOSE.POLICY, 'bad json');
      }
      if (msg.type === 'ping') {
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'pong', t: msg.t } satisfies SocialEvent));
        return;
      }
      if (userId) return; // already signed in
      const token = msg.token;
      void sessions
        .verify(token)
        .then(async (user) => {
          if (!user) return ws.close(SOCIAL_CLOSE.UNAUTHORIZED, 'unauthorized');
          if (ws.readyState !== 1) return;
          clearTimeout(timer);
          userId = user.userId;
          let set = this.sockets.get(userId);
          if (!set) this.sockets.set(userId, (set = new Set()));
          if (set.size >= MAX_SOCKETS_PER_USER) {
            const oldest = set.values().next().value as WebSocket;
            set.delete(oldest);
            oldest.close(SOCIAL_CLOSE.REPLACED, 'too many windows');
          }
          const first = set.size === 0;
          set.add(ws);
          const counts = this.store ? await this.store.counts(userId).catch(() => ({ unread: 0, incoming: 0 })) : { unread: 0, incoming: 0 };
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ready', userId, ...counts } satisfies SocialEvent));
          if (first) void this.announce(userId);
          void this.store?.touch?.(userId).catch(() => {});
        })
        .catch(() => ws.close(SOCIAL_CLOSE.UNAUTHORIZED, 'unauthorized'));
    });
    ws.on('close', () => {
      clearTimeout(timer);
      if (!userId) return;
      const set = this.sockets.get(userId);
      if (!set) return;
      set.delete(ws);
      if (set.size === 0) {
        this.sockets.delete(userId);
        const id = userId;
        void this.store?.touch?.(id).catch(() => {});
        // a reload reconnects within a second: only announce a real departure
        setTimeout(() => {
          if (!this.isOnline(id)) void this.announce(id);
        }, 2500);
      }
    });
  }

  /** Online players (for tests and the admin). */
  onlineCount(): number {
    return this.sockets.size;
  }

  closeAll(): void {
    for (const set of this.sockets.values()) for (const ws of set) ws.close(1001, 'shutdown');
    this.sockets.clear();
  }
}
