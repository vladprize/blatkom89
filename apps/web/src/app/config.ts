/** Runtime configuration derived from the build mode and the page location. */
export const MODE: 'online' | 'demo' = typeof __MODE__ !== 'undefined' ? __MODE__ : 'online';
export const VERSION: string = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0';
export const IS_DEV: boolean = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

export const ONLINE_AVAILABLE = MODE === 'online';

export function apiBase(): string {
  return '';
}

export function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

/** Internal render resolution: the short side of the screen shows VIEW_SHORT world px. */
export const VIEW_SHORT_WORLD = 250;
export const TEXELS_PER_WORLD_PX = 2;
