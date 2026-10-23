/**
 * The screen's safe areas in CSS pixels (V2.0 part E): the notch and rounded corners
 * (`env(safe-area-inset-*)`) or, in a fullscreen Telegram Mini App, the device's safe area plus
 * Telegram's own buttons over the app (--tg-* from telegram/tg.ts) — the larger of the two, as the
 * --safe-* variables in styles.css. The canvas HUD reads them here to keep its edges clear.
 */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Readonly<Insets> = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

let probe: HTMLElement | null = null;

export function safeInsets(): Insets {
  if (typeof document === 'undefined' || !document.body) return { ...NO_INSETS };
  if (!probe || !probe.isConnected) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left)';
    document.body.append(probe);
  }
  const cs = getComputedStyle(probe);
  // a broken value never pushes the HUD off the screen
  const px = (v: string) => Math.max(0, Math.min(160, parseFloat(v) || 0));
  return { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
}
