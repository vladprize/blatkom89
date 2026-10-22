/**
 * Friends, presence, private messages and room invitations: the social WebSocket (`/ws/social`) plus
 * a small store the menu, the Friends screen and the lobby read. The server is the source of truth
 * (REST); the socket only tells us that something changed. Reconnects with a growing pause.
 */
import type { FriendEntry, FriendRequestEntry, FriendStatus, RoomInviteEvent, SocialEvent } from '@blatkom/shared';
import type { Api } from './api.js';
import { socialWsUrl } from '../app/config.js';

/** An invitation stays answerable this long. */
export const INVITE_TTL_MS = 2 * 60_000;
const PING_MS = 30_000;
const SILENCE_MS = 75_000;

export type SocialSignal = SocialEvent | { type: 'changed' } | { type: 'link'; up: boolean };

export class SocialClient {
  friends: FriendEntry[] = [];
  incoming: FriendRequestEntry[] = [];
  outgoing: FriendRequestEntry[] = [];
  /** Invitations not answered yet, newest first. */
  invites: RoomInviteEvent[] = [];
  /** The friend whose conversation is on screen (their messages are read as they arrive). */
  openChat: string | null = null;
  connected = false;
  /** Loaded at least once (the lists are meaningful). */
  loaded = false;
  /** Join requests waiting for this player's answer as the head of a club (v0.3). */
  clubRequests = 0;
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private stopped = true;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0;
  private readonly listeners = new Set<(e: SocialSignal) => void>();

  constructor(
    private readonly api: Api,
    private readonly myId: () => string | null,
  ) {}

  on(fn: (e: SocialSignal) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: SocialSignal) {
    for (const fn of [...this.listeners]) {
      try {
        fn(e);
      } catch (err) {
        console.error(err);
      }
    }
  }

  /** Unread messages from friends plus requests waiting for an answer (the menu badge). */
  badge(): number {
    return this.friends.reduce((n, f) => n + f.unread, 0) + this.incoming.length;
  }

  /** The club table's count (the most recent word on the requests waiting for the head). */
  setClubRequests(n: number): void {
    if (n === this.clubRequests) return;
    this.clubRequests = n;
    this.emit({ type: 'changed' });
  }

  onlineCount(): number {
    return this.friends.filter((f) => f.status !== 'offline').length;
  }

  friend(id: string): FriendEntry | undefined {
    return this.friends.find((f) => f.id === id);
  }

  /** Opens (or re-opens with a new session) the social socket. */
  start(token: string): void {
    if (!this.stopped && this.token === token && (this.ws || this.retryTimer)) return;
    // another account signed in on this browser: drop the old line and the old lists
    if (this.token && this.token !== token) {
      this.stop();
      this.friends = [];
      this.incoming = [];
      this.outgoing = [];
      this.invites = [];
      this.loaded = false;
    }
    this.token = token;
    this.stopped = false;
    this.retry = 0;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.stopPing();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.close(1000, 'bye');
    }
    this.setLink(false);
  }

  /** Reloads the lists from the server. */
  async refresh(): Promise<void> {
    const r = await this.api.friends();
    this.friends = r.friends;
    this.incoming = r.incoming;
    this.outgoing = r.outgoing;
    this.loaded = true;
    this.emit({ type: 'changed' });
  }

  dropInvite(roomId: string): void {
    const before = this.invites.length;
    this.invites = this.invites.filter((i) => i.roomId !== roomId);
    if (this.invites.length !== before) this.emit({ type: 'changed' });
  }

  /** Invitations still worth answering. */
  liveInvites(): RoomInviteEvent[] {
    const now = Date.now();
    this.invites = this.invites.filter((i) => now - Date.parse(i.at) < INVITE_TTL_MS);
    return this.invites;
  }

  /** The open conversation was read up to now. */
  markRead(friendId: string): void {
    const f = this.friend(friendId);
    if (f && f.unread > 0) {
      f.unread = 0;
      this.emit({ type: 'changed' });
    }
  }

  private setLink(up: boolean) {
    if (this.connected === up) return;
    this.connected = up;
    this.emit({ type: 'link', up });
  }

  private connect() {
    if (this.stopped || !this.token) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(socialWsUrl());
    } catch {
      return this.scheduleRetry();
    }
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', token: this.token }));
      this.lastHeard = Date.now();
      this.startPing();
    };
    ws.onmessage = (m) => {
      this.lastHeard = Date.now();
      let e: SocialEvent;
      try {
        e = JSON.parse(String(m.data)) as SocialEvent;
      } catch {
        return;
      }
      this.handle(e);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopPing();
      this.setLink(false);
      // signed out elsewhere or replaced by newer windows: don't fight
      if (ev.code === 4401 || ev.code === 4409) return;
      this.scheduleRetry();
    };
    ws.onerror = () => {};
  }

  private scheduleRetry() {
    if (this.stopped || this.retryTimer) return;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.retry, 5)) * (0.75 + Math.random() * 0.5);
    this.retry++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== 1) return;
      if (Date.now() - this.lastHeard > SILENCE_MS) {
        ws.close(4000, 'silent');
        return;
      }
      ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
    }, PING_MS);
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private setStatus(id: string, status: FriendStatus) {
    const f = this.friend(id);
    if (!f || f.status === status) return false;
    f.status = status;
    if (status === 'offline') f.lastSeenAt = new Date().toISOString();
    return true;
  }

  private handle(e: SocialEvent) {
    const me = this.myId();
    switch (e.type) {
      case 'ready':
        this.clubRequests = e.clubs ?? 0;
        this.retry = 0;
        this.setLink(true);
        void this.refresh().catch(() => {});
        break;
      case 'presence':
        if (!this.setStatus(e.userId, e.status)) return;
        break;
      case 'friend_request':
        this.incoming = [e.from, ...this.incoming.filter((r) => r.id !== e.from.id)];
        break;
      case 'friend_accepted':
        this.outgoing = this.outgoing.filter((r) => r.id !== e.friend.id);
        this.incoming = this.incoming.filter((r) => r.id !== e.friend.id);
        this.friends = [...this.friends.filter((f) => f.id !== e.friend.id), e.friend].sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'friend_removed':
        this.friends = this.friends.filter((f) => f.id !== e.userId);
        this.incoming = this.incoming.filter((r) => r.id !== e.userId);
        this.outgoing = this.outgoing.filter((r) => r.id !== e.userId);
        break;
      case 'dm': {
        // my own message from another window, or theirs to me
        const other = e.message.from === me ? e.message.to : e.message.from;
        if (e.message.from !== me && this.openChat !== other) {
          const f = this.friend(other);
          if (f) f.unread++;
        }
        break;
      }
      case 'invite':
        this.invites = [e.invite, ...this.invites.filter((i) => i.roomId !== e.invite.roomId)].slice(0, 5);
        break;
      case 'club_request':
        this.clubRequests++;
        break;
      case 'club_joined':
      case 'club_declined':
      case 'club_left':
      case 'club_head':
      case 'referral':
        break;
      case 'dm_read':
      case 'pong':
        break;
    }
    this.emit(e);
    if (e.type !== 'pong' && e.type !== 'dm_read') this.emit({ type: 'changed' });
  }
}
