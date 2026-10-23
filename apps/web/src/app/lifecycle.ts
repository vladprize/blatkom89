/**
 * The game goes to the background and comes back (V2.0 part E): the phone locks, the Telegram Mini App is
 * minimised (Bot API 8.0 `deactivated` / `activated`, which may come without the page ever being hidden),
 * the tab is hidden, the page is restored from the back-forward cache, the network drops and returns.
 * One place turns those signals into `pause` and `resume`, so the music stops, held touch controls are
 * let go, and the game and friends connections are checked the moment the player is back — a socket
 * that went quiet in the background is replaced at once instead of after a long timeout.
 */
export type LifecycleEvent = { type: 'pause' } | { type: 'resume'; awayMs: number; reason: 'visible' | 'telegram' | 'pageshow' | 'online' | 'focus' };

/** Events tg.ts sends for Telegram's `activated` / `deactivated` (kept as strings so tests can send them too). */
export const TG_ACTIVATED = 'blatkom:tg-activated';
export const TG_DEACTIVATED = 'blatkom:tg-deactivated';

const listeners = new Set<(e: LifecycleEvent) => void>();
let paused = typeof document !== 'undefined' && document.hidden;
let pausedAt = paused ? Date.now() : 0;
let started = false;

export function onLifecycle(cb: (e: LifecycleEvent) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** In the background now (hidden, or minimised in Telegram). */
export function isPaused(): boolean {
  return paused;
}

function emit(e: LifecycleEvent) {
  for (const cb of [...listeners]) {
    try {
      cb(e);
    } catch (err) {
      console.error(err);
    }
  }
}

function pause() {
  if (paused) return;
  paused = true;
  pausedAt = Date.now();
  emit({ type: 'pause' });
}

/** Back in front — or a reason to check the connections even without having left (`force`). */
function resume(reason: Extract<LifecycleEvent, { type: 'resume' }>['reason'], force = false) {
  if (!paused && !force) return;
  if (typeof document !== 'undefined' && document.hidden && reason !== 'telegram') return;
  const awayMs = paused ? Date.now() - pausedAt : 0;
  paused = false;
  emit({ type: 'resume', awayMs, reason });
}

/** Starts listening (once). */
export function initLifecycle(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume('visible')));
  window.addEventListener('pagehide', () => pause());
  window.addEventListener('pageshow', (e) => resume('pageshow', (e as PageTransitionEvent).persisted));
  window.addEventListener('online', () => resume('online', true));
  window.addEventListener('focus', () => resume('focus'));
  window.addEventListener(TG_DEACTIVATED, () => pause());
  window.addEventListener(TG_ACTIVATED, () => resume('telegram', true));
}
