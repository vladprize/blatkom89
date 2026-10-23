/**
 * Thin wrapper over the official Telegram Mini Apps SDK (telegram-web-app.js). Every call is
 * guarded so the same build runs in a regular browser.
 *
 * V2.0 part E: in a match on a phone the Mini App asks for fullscreen and, once the phone is held
 * sideways, locks the landscape orientation (Bot API 8.0; older clients and computers keep the expanded
 * window — the game works in both orientations, so nothing depends on it); the safe areas (the notch,
 * Telegram's own buttons over a fullscreen app) reach the page's CSS and the game's HUD; minimising and
 * coming back (`deactivated` / `activated`) reach app/lifecycle.ts.
 */
import type { Platform } from '@blatkom/shared';
import { TG_ACTIVATED, TG_DEACTIVATED } from '../app/lifecycle.js';

/** Sent after the safe areas changed (the HUD moves its edges). */
export const INSETS_EVENT = 'blatkom:insets';

export function tg(): TelegramWebApp | null {
  const w = window.Telegram?.WebApp;
  return w && typeof w.initData === 'string' && w.initData.length > 0 ? w : null;
}

export function inTelegram(): boolean {
  return tg() !== null;
}

export function telegramStartParam(): string | null {
  const t = tg();
  const p = t?.initDataUnsafe?.start_param;
  // V2.0: `ref_<code>` is a referral, `p_<code>` a partner's link, `link_<code>` attaches Telegram (the
  // server reads them from the signed launch data) — not rooms
  if (p && /^[A-Za-z0-9_-]{1,64}$/.test(p) && !/^(ref|p|link)_/.test(p)) return p;
  return null;
}

export function platform(): Platform {
  const t = tg();
  if (t) {
    const p = (t.platform || '').toLowerCase();
    if (p === 'ios') return 'telegram_ios';
    if (p === 'android' || p === 'android_x') return 'telegram_android';
    if (p === 'tdesktop' || p === 'macos' || p === 'unigram') return 'telegram_desktop';
    if (p === 'weba' || p === 'webk' || p === 'web') return 'telegram_web';
    return 'telegram_other';
  }
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ? 'browser_mobile' : 'browser_desktop';
}

/** Native Telegram confirm dialog when available (browser `confirm()` is unreliable inside Mini Apps). */
export function confirmAsync(message: string): Promise<boolean> {
  const t = tg();
  if (t?.showConfirm && t.isVersionAtLeast('6.2')) {
    return new Promise((resolve) => {
      try {
        t.showConfirm!(message, (ok) => resolve(!!ok));
      } catch {
        resolve(window.confirm(message));
      }
    });
  }
  return Promise.resolve(window.confirm(message));
}

/** Applies safe-area insets (Bot API 8.0 fullscreen + content insets) to CSS variables. */
function applyInsets() {
  const t = tg();
  const root = document.documentElement.style;
  const s = t?.safeAreaInset;
  const c = t?.contentSafeAreaInset;
  root.setProperty('--tg-top', `${(s?.top ?? 0) + (c?.top ?? 0)}px`);
  root.setProperty('--tg-bottom', `${(s?.bottom ?? 0) + (c?.bottom ?? 0)}px`);
  root.setProperty('--tg-left', `${(s?.left ?? 0) + (c?.left ?? 0)}px`);
  root.setProperty('--tg-right', `${(s?.right ?? 0) + (c?.right ?? 0)}px`);
  window.dispatchEvent(new Event(INSETS_EVENT));
}

/** Telegram on a phone: fullscreen and the orientation lock are for these (a computer's window stays as the player set it). */
function onPhone(t: TelegramWebApp): boolean {
  const p = (t.platform || '').toLowerCase();
  return p === 'ios' || p === 'android' || p === 'android_x';
}

/** In a match (between enterGameMode and leaveGameMode). */
let gameMode = false;

/** Locks the orientation only while the phone is held sideways: a lock taken upright would keep the game upright. */
function lockIfLandscape() {
  const t = tg();
  if (!t || !gameMode || !onPhone(t) || !t.isVersionAtLeast('8.0')) return;
  try {
    if (window.innerWidth > window.innerHeight && !t.isOrientationLocked) t.lockOrientation?.();
  } catch {
    /* ignore */
  }
}

export function initTelegram(onBack: () => void): void {
  const t = tg();
  if (!t) return;
  try {
    t.ready();
    t.expand();
    t.setHeaderColor('#0d0b0a');
    t.setBackgroundColor('#0d0b0a');
    t.setBottomBarColor?.('#0d0b0a');
    if (t.isVersionAtLeast('7.7')) t.disableVerticalSwipes?.();
    t.BackButton.onClick(onBack);
    applyInsets();
    t.onEvent('safeAreaChanged', applyInsets);
    t.onEvent('contentSafeAreaChanged', applyInsets);
    t.onEvent('fullscreenChanged', applyInsets);
    t.onEvent('viewportChanged', () => {
      window.dispatchEvent(new Event('resize'));
      lockIfLandscape();
    });
    // a client that can't go fullscreen keeps the expanded window — the game fits it in either orientation
    t.onEvent('fullscreenFailed', () => applyInsets());
    // minimised and back (Bot API 8.0): app/lifecycle.ts pauses and resumes the game
    t.onEvent('deactivated', () => window.dispatchEvent(new Event(TG_DEACTIVATED)));
    t.onEvent('activated', () => window.dispatchEvent(new Event(TG_ACTIVATED)));
    window.addEventListener('resize', lockIfLandscape);
  } catch {
    /* older clients */
  }
}

/** A match starts: fullscreen on a phone (Bot API 8.0+), the landscape lock once sideways, the closing confirmation. */
export function enterGameMode(): void {
  const t = tg();
  if (!t) return;
  gameMode = true;
  try {
    if (onPhone(t) && t.isVersionAtLeast('8.0') && !t.isFullscreen) t.requestFullscreen?.();
    lockIfLandscape();
    t.enableClosingConfirmation();
  } catch {
    /* ignore */
  }
}

/** The match is over: the orientation is free again (fullscreen stays — the menus fit it). */
export function leaveGameMode(): void {
  const t = tg();
  if (!t) return;
  gameMode = false;
  try {
    t.disableClosingConfirmation();
    if (t.isVersionAtLeast('8.0') && t.isOrientationLocked !== false) t.unlockOrientation?.();
  } catch {
    /* ignore */
  }
}

export function setBackButton(visible: boolean): void {
  const t = tg();
  if (!t) return;
  if (visible) t.BackButton.show();
  else t.BackButton.hide();
}

export function shareInvite(url: string, text: string): boolean {
  const t = tg();
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (t) {
    t.openTelegramLink(share);
    return true;
  }
  if (navigator.share) {
    void navigator.share({ url, text }).catch(() => {});
    return true;
  }
  return false;
}

export function haptic(kind: 'impact-light' | 'impact-medium' | 'impact-heavy' | 'notify-success' | 'notify-error' | 'select'): void {
  const h = tg()?.HapticFeedback;
  if (!h) return;
  try {
    if (kind === 'impact-light') h.impactOccurred('light');
    else if (kind === 'impact-medium') h.impactOccurred('medium');
    else if (kind === 'impact-heavy') h.impactOccurred('heavy');
    else if (kind === 'notify-success') h.notificationOccurred('success');
    else if (kind === 'notify-error') h.notificationOccurred('error');
    else h.selectionChanged();
  } catch {
    /* ignore */
  }
}

export function telegramUserName(): string | null {
  const u = tg()?.initDataUnsafe?.user;
  if (!u) return null;
  return [u.first_name, u.last_name].filter(Boolean).join(' ').slice(0, 24) || null;
}
