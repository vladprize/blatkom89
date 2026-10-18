/** In-memory token-bucket rate limiter (per process). Suitable for a single game-server instance. */
import { HttpError } from '../http/router.js';
import type { Ctx, Handler } from '../http/router.js';

interface Bucket {
  tokens: number;
  updated: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  constructor(
    readonly capacity: number,
    readonly refillPerSec: number,
  ) {}

  /** Consumes `cost` tokens; returns false when the key is over the limit. */
  take(key: string, cost = 1, now = Date.now()): boolean {
    if (now - this.lastSweep > 60_000) this.sweep(now);
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, updated: now };
      this.buckets.set(key, b);
    }
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.updated) / 1000) * this.refillPerSec);
    b.updated = now;
    if (b.tokens < cost) return false;
    b.tokens -= cost;
    return true;
  }

  private sweep(now: number) {
    this.lastSweep = now;
    for (const [k, b] of this.buckets) if (now - b.updated > 10 * 60_000) this.buckets.delete(k);
  }
}

export function rateLimit(limiter: RateLimiter, key: (ctx: Ctx) => string = (ctx) => ctx.ip): Handler {
  return (ctx) => {
    if (!limiter.take(key(ctx))) throw new HttpError(429, 'rate_limited', 'Too many requests', { 'retry-after': '5' });
  };
}
