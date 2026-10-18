/**
 * Client analytics queue → POST /api/events (batched, de-duplicated server-side by UUID).
 * Only the documented client events are sent; nothing is collected in demo/offline builds without
 * a session token.
 */
import type { ClientEventName } from '@blatkom/shared';
import { platform } from '../telegram/tg.js';
import { VERSION, ONLINE_AVAILABLE } from '../app/config.js';

interface Pending {
  id: string;
  name: ClientEventName;
  ts: number;
  props: Record<string, unknown>;
}

function uuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hx = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hx.slice(0, 8)}-${hx.slice(8, 12)}-${hx.slice(12, 16)}-${hx.slice(16, 20)}-${hx.slice(20)}`;
}

class AnalyticsClient {
  private queue: Pending[] = [];
  private token: string | null = null;
  private timer: number | null = null;
  private openedAt = Date.now();
  private started = false;

  init(): void {
    if (this.started) return;
    this.started = true;
    this.track('app_opened', { platform: platform() });
    window.addEventListener('error', (e) => this.error('window', 'uncaught', String(e.message ?? 'error')));
    window.addEventListener('unhandledrejection', (e) => this.error('window', 'rejection', String((e.reason as Error)?.message ?? e.reason)));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.track('session_ended', { durationMs: Math.min(86_400_000, Date.now() - this.openedAt) });
        void this.flush(true);
      } else this.openedAt = Date.now();
    });
  }

  setToken(token: string | null): void {
    this.token = token;
    if (token) void this.flush();
  }

  track(name: ClientEventName, props: Record<string, unknown> = {}): void {
    if (!ONLINE_AVAILABLE) return;
    this.queue.push({ id: uuid(), name, ts: Date.now(), props });
    if (this.queue.length > 200) this.queue.splice(0, this.queue.length - 200);
    if (this.timer === null) this.timer = window.setTimeout(() => void this.flush(), 8000);
  }

  error(component: string, category: string, message: string): void {
    this.track('client_error', { component: component.slice(0, 40), category: category.slice(0, 40), message: message.slice(0, 300), clientVersion: VERSION });
  }

  async flush(keepalive = false): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.token || this.queue.length === 0) return;
    const batch = this.queue.splice(0, 50);
    try {
      const res = await fetch('api/events', {
        method: 'POST',
        keepalive,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ events: batch }),
      });
      if (!res.ok && res.status >= 500) this.queue.unshift(...batch);
    } catch {
      this.queue.unshift(...batch);
    }
    if (this.queue.length) this.timer = window.setTimeout(() => void this.flush(), 10000);
  }
}

export const analytics = new AnalyticsClient();
