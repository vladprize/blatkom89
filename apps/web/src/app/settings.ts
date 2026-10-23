/** Player settings persisted per device (best-effort localStorage). */
export interface Settings {
  vhs: 0 | 1 | 2;
  shake: boolean;
  sfxVolume: number;
  musicVolume: number;
  autoFire: boolean;
  stickScale: number;
  leftHanded: boolean;
  showFps: boolean;
  botDifficulty: 'easy' | 'normal' | 'hard';
  bots: number;
  /** The room chat (lobby, match, results): shown or hidden. */
  chat: boolean;
}

const KEY = 'blatkom89.settings.v1';

/** Weak devices start without the VHS post-processing pass (it can be enabled in settings). */
function lowEndDevice(): boolean {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 3;
  } catch {
    return false;
  }
}

export const DEFAULT_SETTINGS: Settings = {
  vhs: lowEndDevice() ? 0 : 1,
  shake: true,
  sfxVolume: 0.8,
  musicVolume: 0.4,
  autoFire: true,
  stickScale: 1,
  leftHanded: false,
  showFps: false,
  botDifficulty: 'normal',
  bots: 3,
  chat: true,
};

let current: Settings = load();
const listeners = new Set<(s: Settings) => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SETTINGS };
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(current);
  return current;
}

export function onSettings(l: (s: Settings) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Keys whose last write the browser refused: Safari refuses storage to a page opened from disk (the
 * single-file build), a full quota refuses too. They live here until the tab closes, so the story still
 * moves on, the prologue doesn't come back and the profile keeps its experience for the session.
 */
const memory = new Map<string, string>();
let persistent: boolean | null = null;

/** Whether this browser keeps what the game stores after the tab closes (checked once). */
export function storagePersistent(): boolean {
  if (persistent === null) {
    try {
      const k = 'blatkom89.probe';
      localStorage.setItem(k, '1');
      persistent = localStorage.getItem(k) === '1';
      localStorage.removeItem(k);
    } catch {
      persistent = false;
    }
  }
  return persistent;
}

export function storageGet(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    memory.delete(key);
    return;
  } catch {
    /* refused: keep it for this session */
  }
  if (value === null) memory.delete(key);
  else memory.set(key, value);
}
