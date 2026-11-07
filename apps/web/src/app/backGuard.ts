/**
 * v0.2.21 (the usability audit: Android's «back» and the iPhone's edge swipe left the page from the middle of a
 * match): the page keeps one extra entry in the browser's history. «Back» uses it up and the app takes its own
 * step back instead — a sheet closes, a screen goes back, a match pauses — and puts the entry back. On the bare
 * main menu the first «back» only says that a second one leaves the game. Telegram has its own back button
 * (telegram/tg.ts), so nothing is added there.
 *
 * Chrome skips history entries a page adds before the person has touched it, so the entry is first added on
 * the first tap or key press (and again whenever the app leaves the main menu).
 */
let armed = false;
let enabled = false;

function push(): void {
  if (armed || !enabled) return;
  try {
    history.pushState({ blatkomBack: true }, '');
    armed = true;
  } catch {
    /* a sandboxed frame: the browser's back stays the browser's */
  }
}

/**
 * Starts the guard. `onBack` gets every «back»: it returns true when the app stepped back itself (the entry is
 * put back), false on the bare main menu (the next «back» leaves; `onRoot` may say so).
 */
export function initBackGuard(o: { onBack: () => boolean; onRoot?: () => void }): void {
  if (typeof window === 'undefined' || enabled) return;
  enabled = true;
  const first = () => {
    window.removeEventListener('pointerdown', first, true);
    window.removeEventListener('keydown', first, true);
    push();
  };
  window.addEventListener('pointerdown', first, true);
  window.addEventListener('keydown', first, true);
  window.addEventListener('popstate', () => {
    if (!armed) return;
    armed = false;
    if (o.onBack()) push();
    else o.onRoot?.();
  });
}

/** The app moved somewhere «back» can return from: make sure the entry is there. */
export function armBackGuard(): void {
  push();
}

/** Tests and tools: whether the extra entry is in place. */
export function backGuardArmed(): boolean {
  return armed;
}
