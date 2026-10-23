/**
 * WebSocket transport: hello/join, JSON control, binary inputs & snapshots, ping, auto-reconnect.
 *
 * V2.0 part E: a socket can die quietly in the background (a minimised Mini App, a locked phone, a
 * switched network) and still look open. The server sends snapshots many times a second, so a socket
 * that has heard nothing for 6 s — confirmed over two ping rounds, never right after the page was held
 * up — is replaced; coming back to the app (`resume`) checks at once; and while the app is in the
 * background, failed reconnects don't use up the attempts.
 */
import { decodeSnapshot, encodeInputs, PROTOCOL_VERSION, WS_CLOSE } from '@blatkom/shared';
import type { CharacterId, ClientMessage, InputFrame, ServerMessage, Snapshot } from '@blatkom/shared';
import { wsUrl, VERSION } from '../app/config.js';
import { analytics } from '../analytics/client.js';
import { isPaused } from '../app/lifecycle.js';

/** Silence after which an open socket counts as dead (snapshots come ~20 times a second, pongs every 2 s). */
const SILENT_MS = 6000;
/** Coming back to the app: a socket quiet for this long is replaced right away. */
const STALE_ON_RESUME_MS = 2500;

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface ConnHandlers {
  onMessage(msg: ServerMessage): void;
  onSnapshot(s: Snapshot, arrivedAt: number): void;
  onStatus(s: ConnStatus, reason?: string): void;
}

const FATAL_CODES = new Set<number>([WS_CLOSE.NORMAL, WS_CLOSE.UNAUTHORIZED, WS_CLOSE.ROOM_NOT_FOUND, WS_CLOSE.ROOM_FULL, WS_CLOSE.ROOM_CLOSED, WS_CLOSE.KICKED, WS_CLOSE.REPLACED, WS_CLOSE.POLICY]);

export class GameConnection {
  private ws: WebSocket | null = null;
  private status: ConnStatus = 'closed';
  private attempts = 0;
  private downSince = 0;
  private pingTimer: number | null = null;
  private outbox: InputFrame[] = [];
  private closedByUser = false;
  private retryTimer: number | null = null;
  /** When the socket last heard anything from the server (performance.now()). */
  private lastHeard = 0;
  /** The room accepted this connection at least once (a later refusal means the player was away too long). */
  everJoined = false;
  reconnectToken: string | null = null;
  rtt: number | null = null;

  constructor(
    private readonly handlers: ConnHandlers,
    private readonly hello: { token: string; roomId: string; character: CharacterId },
  ) {}

  get state(): ConnStatus {
    return this.status;
  }

  connect(): void {
    this.closedByUser = false;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.setStatus(this.attempts > 0 ? 'reconnecting' : 'connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      return this.scheduleReconnect();
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      const msg: ClientMessage = { type: 'hello', protocol: PROTOCOL_VERSION, token: this.hello.token, roomId: this.hello.roomId, character: this.hello.character, clientVersion: VERSION, ...(this.reconnectToken ? { reconnectToken: this.reconnectToken } : {}) };
      ws.send(JSON.stringify(msg));
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      this.lastHeard = performance.now();
      if (typeof ev.data === 'string') {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data) as ServerMessage;
        } catch {
          return;
        }
        if (msg.type === 'welcome') {
          this.reconnectToken = msg.reconnectToken;
          this.everJoined = true;
          if (this.attempts > 0) analytics.track('reconnect_succeeded', { attempt: this.attempts, downtimeMs: Math.min(600_000, Date.now() - this.downSince) });
          this.attempts = 0;
          this.setStatus('open');
          this.startPing();
        } else if (msg.type === 'pong') {
          const rtt = performance.now() - msg.t;
          this.rtt = this.rtt === null ? rtt : this.rtt * 0.8 + rtt * 0.2;
        }
        this.handlers.onMessage(msg);
      } else {
        try {
          this.handlers.onSnapshot(decodeSnapshot(ev.data as ArrayBuffer), performance.now());
        } catch (e) {
          analytics.error('net', 'snapshot_decode', (e as Error).message);
        }
      }
    };
    ws.onclose = (ev) => {
      this.stopPing();
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closedByUser || FATAL_CODES.has(ev.code)) {
        this.setStatus('closed', ev.reason || String(ev.code));
        return;
      }
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private scheduleReconnect() {
    if (this.closedByUser || this.retryTimer !== null) return;
    if (this.attempts === 0) this.downSince = Date.now();
    // in the background the network may simply be asleep: keep trying slowly, give up only in front
    if (isPaused()) this.attempts = Math.min(this.attempts, 2);
    this.attempts++;
    if (this.attempts > 8) {
      analytics.track('connection_error', { stage: 'gameplay', code: 'reconnect_failed' });
      this.setStatus('closed', 'reconnect_failed');
      return;
    }
    analytics.track('reconnect_attempted', { attempt: this.attempts });
    this.setStatus('reconnecting');
    const delay = isPaused() ? 5000 : Math.min(8000, 400 * 2 ** (this.attempts - 1));
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  /** Drops a socket that went quiet (no close handshake to wait for) and connects again now. */
  private replaceSocket(why: string) {
    const ws = this.ws;
    this.ws = null;
    this.stopPing();
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      try {
        ws.close(4000, why);
      } catch {
        /* ignore */
      }
    }
    if (this.attempts === 0) this.downSince = Date.now();
    this.attempts = Math.max(1, Math.min(this.attempts, 2));
    analytics.track('reconnect_attempted', { attempt: this.attempts });
    this.connect();
  }

  /**
   * The player is back in the app (app/lifecycle.ts): a socket that went quiet is replaced, a reconnect
   * that waits for its timer goes now.
   */
  resume(): void {
    if (this.closedByUser) return;
    if (this.status === 'open' && this.ws && performance.now() - this.lastHeard > STALE_ON_RESUME_MS) return this.replaceSocket('stale');
    if (this.status === 'reconnecting' && this.retryTimer !== null) {
      this.attempts = Math.min(this.attempts, 2);
      this.connect();
    }
  }

  private setStatus(s: ConnStatus, reason?: string) {
    this.status = s;
    this.handlers.onStatus(s, reason);
  }

  private startPing() {
    this.stopPing();
    this.lastHeard = performance.now();
    let lastTick = 0;
    let suspect = false;
    const ping = () => {
      const now = performance.now();
      // a page that was held up (a long frame, a throttled timer) may still have messages waiting to be
      // handled: no verdict on that round
      const stalled = lastTick > 0 && now - lastTick > 3500;
      lastTick = now;
      // a socket that heard nothing for a while is dead even if the browser hasn't noticed — confirmed
      // over two rounds, with a ping in between that any answer clears (in the background timers sleep:
      // the check waits for the app to come back — see resume)
      if (this.status === 'open' && !isPaused() && !stalled && now - this.lastHeard > SILENT_MS) {
        if (suspect) return this.replaceSocket('silent');
        suspect = true;
      } else suspect = false;
      this.send({ type: 'ping', t: now });
    };
    ping();
    this.pingTimer = window.setInterval(ping, 2000);
  }

  private stopPing() {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Queues an input; flushed in batches (≈30 msgs/s). */
  queueInput(f: InputFrame): void {
    this.outbox.push(f);
    if (this.outbox.length >= 2) this.flushInputs();
  }

  flushInputs(): void {
    if (this.outbox.length === 0) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.status === 'open') this.ws.send(encodeInputs(this.outbox));
    this.outbox = [];
  }

  close(): void {
    this.closedByUser = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.stopPing();
    try {
      this.ws?.close(WS_CLOSE.NORMAL, 'bye');
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.setStatus('closed', 'user');
  }
}
