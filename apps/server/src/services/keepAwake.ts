/**
 * Keeping a free host awake (v0.3). Render's free plan stops a service after 15 minutes without
 * incoming requests and needs about a minute to start it again. The server can ask for its own public
 * address (which counts as an incoming request there):
 *
 * - for a while after the Telegram bot has handed out a link (`BOT_WARM_MINUTES`, default 20), so the
 *   link still opens a running server when the player taps it a few minutes later;
 * - all the time with `KEEP_AWAKE=true` — the bot then answers at once instead of after the start-up
 *   minute (a free Render service has 750 hours a month: enough for one service running non-stop).
 */
import type { Logger } from '../logging/logger.js';

type Fetch = typeof fetch;

export class KeepAwake {
  private until = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly publicUrl: string,
    private readonly opts: { always: boolean; everyMs?: number; log: Logger; fetchImpl?: Fetch; now?: () => number },
  ) {}

  /** Only an https address on the internet is worth asking (a local or http address never sleeps). */
  get usable(): boolean {
    return /^https:\/\//.test(this.publicUrl) && !/^https:\/\/(localhost|127\.|\[::1\])/.test(this.publicUrl);
  }

  start(): void {
    if (this.opts.always && this.usable) this.run();
  }

  /** Stays awake at least `ms` from now. */
  extend(ms: number): void {
    if (ms <= 0 || !this.usable) return;
    this.until = Math.max(this.until, this.now() + ms);
    this.run();
  }

  get active(): boolean {
    return this.timer !== null;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One round: asks for the health check unless the time is up; exposed for the tests. */
  async tick(): Promise<boolean> {
    if (!this.opts.always && this.now() > this.until) {
      this.stop();
      return false;
    }
    const f = this.opts.fetchImpl ?? fetch;
    try {
      await f(`${this.publicUrl.replace(/\/$/, '')}/api/health`, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'blatkom89-keep-awake' } });
    } catch (e) {
      this.opts.log.debug('keep-awake request failed', { err: e as Error });
    }
    return true;
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private run(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.opts.everyMs ?? 5 * 60_000);
    this.timer.unref?.();
  }
}
