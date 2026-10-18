/** localStorage persistence for the demo's browser-only profile (best effort, never leaves the device). */
import { storageGet, storageSet } from '../app/settings.js';
import { sanitizeLocalProfile } from './localProfile.js';
import type { LocalProfile } from './localProfile.js';

const KEY = 'blatkom89.local-profile.v1';

export function loadLocalProfile(): LocalProfile | null {
  const raw = storageGet(KEY);
  if (!raw) return null;
  try {
    return sanitizeLocalProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveLocalProfile(p: LocalProfile): void {
  storageSet(KEY, JSON.stringify(p));
}

export function clearLocalProfile(): void {
  storageSet(KEY, null);
}
