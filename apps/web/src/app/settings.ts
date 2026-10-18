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
}

const KEY = 'blatkom89.settings.v1';
export const DEFAULT_SETTINGS: Settings = {
  vhs: 1,
  shake: true,
  sfxVolume: 0.8,
  musicVolume: 0.4,
  autoFire: true,
  stickScale: 1,
  leftHanded: false,
  showFps: false,
  botDifficulty: 'normal',
  bots: 3,
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

export function storageGet(key: string): string | null {
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
  } catch {
    /* ignore */
  }
}
