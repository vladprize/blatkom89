/** Shared state written by on-screen touch controls (HUD scene) and read by the input sampler. */
export interface TouchState {
  enabled: boolean;
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  aimActive: boolean;
  fireHeld: boolean;
  reloadTap: boolean;
  swapTap: boolean;
  interactTap: boolean;
}

export const touchState: TouchState = {
  enabled: false,
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
  aimActive: false,
  fireHeld: false,
  reloadTap: false,
  swapTap: false,
  interactTap: false,
};

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && (('ontouchstart' in window && navigator.maxTouchPoints > 0) || window.matchMedia?.('(pointer: coarse)').matches === true);
}
