/** WebSocket transport: hello/join, JSON control, binary inputs & snapshots, ping, auto-reconnect. */
import { decodeSnapshot, encodeInputs, PROTOCOL_VERSION, WS_CLOSE } from '@blatkom/shared';
import type { CharacterId, ClientMessage, InputFrame, ServerMessage, Snapshot } from '@blatkom/shared';
import { wsUrl, VERSION } from '../app/config.js';
import { analytics } from '../analytics/client.js';

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
      if (typeof ev.data === 'string') {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data) as ServerMessage;
        } catch {
          return;
        }
        if (msg.type === 'welcome') {
          this.reconnectToken = msg.reconnectToken;
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
    if (this.closedByUser) return;
    if (this.attempts === 0) this.downSince = Date.now();
    this.attempts++;
    if (this.attempts > 8) {
      analytics.track('connection_error', { stage: 'gameplay', code: 'reconnect_failed' });
      this.setStatus('closed', 'reconnect_failed');
      return;
    }
    analytics.track('reconnect_attempted', { attempt: this.attempts });
    this.setStatus('reconnecting');
    const delay = Math.min(8000, 400 * 2 ** (this.attempts - 1));
    window.setTimeout(() => this.connect(), delay);
  }

  private setStatus(s: ConnStatus, reason?: string) {
    this.status = s;
    this.handlers.onStatus(s, reason);
  }

  private startPing() {
    this.stopPing();
    const ping = () => this.send({ type: 'ping', t: performance.now() });
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
