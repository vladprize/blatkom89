declare module '*.css';

declare const __MODE__: 'online' | 'demo';
declare const __VERSION__: string;
declare const __DEV__: boolean;
/** Content hash of public/assets (cache busting for sprites, tiles, fonts, portraits). */
declare const __ASSET_VERSION__: string;

interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}

interface TelegramSafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramWebAppUser; start_param?: string };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  isExpanded: boolean;
  isFullscreen?: boolean;
  /** Bot API 8.0: the orientation is locked. */
  isOrientationLocked?: boolean;
  /** Bot API 8.0: the Mini App is active (not minimised). */
  isActive?: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  safeAreaInset?: TelegramSafeArea;
  contentSafeAreaInset?: TelegramSafeArea;
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(v: string): boolean;
  setHeaderColor(c: string): void;
  setBackgroundColor(c: string): void;
  setBottomBarColor?(c: string): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  disableVerticalSwipes?(): void;
  enableVerticalSwipes?(): void;
  requestFullscreen?(): void;
  exitFullscreen?(): void;
  lockOrientation?(): void;
  unlockOrientation?(): void;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  openTelegramLink(url: string): void;
  openLink(url: string): void;
  onEvent(event: string, cb: (...args: unknown[]) => void): void;
  offEvent(event: string, cb: (...args: unknown[]) => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void; isVisible: boolean };
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void; notificationOccurred(t: 'error' | 'success' | 'warning'): void; selectionChanged(): void };
}

interface Window {
  Telegram?: { WebApp?: TelegramWebApp };
  __blatkom?: Record<string, unknown>;
}
