/**
 * Thin wrapper over the official Telegram Mini Apps SDK (telegram-web-app.js). Every call is
 * guarded so the same build runs in a regular browser.
 */
import type { Platform } from '@blatkom/shared';

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
  // V2.0: `ref_<code>` is a referral (the server reads it from the signed launch data), not a room
  if (p && /^[A-Za-z0-9_-]{1,64}$/.test(p) && !p.startsWith('ref_')) return p;
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
    t.onEvent('viewportChanged', () => window.dispatchEvent(new Event('resize')));
  } catch {
    /* older clients */
  }
}

/** Requests fullscreen + orientation lock where supported (Bot API 8.0+). */
export function enterGameMode(): void {
  const t = tg();
  if (!t) return;
  try {
    if (t.isVersionAtLeast('8.0')) {
      if (!t.isFullscreen) t.requestFullscreen?.();
      t.lockOrientation?.();
    }
    t.enableClosingConfirmation();
  } catch {
    /* ignore */
  }
}

export function leaveGameMode(): void {
  const t = tg();
  if (!t) return;
  try {
    t.disableClosingConfirmation();
    if (t.isVersionAtLeast('8.0')) t.unlockOrientation?.();
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
