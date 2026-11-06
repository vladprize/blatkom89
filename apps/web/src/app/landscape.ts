/**
 * v0.2.20 (the owner: «не должно быть вертикального режима внутри матча, должен сразу открываться
 * горизонтально»): a match is always played sideways. A phone held upright during a match shows the page —
 * the game's canvas and the overlays over it — turned a quarter clockwise, so the match is sideways from its
 * first frame and the phone is simply turned to play; once the system turns the page itself (the phone's
 * rotation lock is off) the quarter turn comes off and nothing moves. Telegram also locks the orientation once
 * the phone is sideways (telegram/tg.ts); a browser that can lock it (Android in full screen) locks it too.
 *
 * Phaser reads the canvas through getBoundingClientRect, which a CSS rotation turns sideways too: the parent's
 * size and the pointer's position are read here instead while the page is turned (patchPhaser).
 */
import type * as Phaser from 'phaser';

let wanted = false;
let on = false;
const subs = new Set<() => void>();

/** A touch screen: a computer's window is never turned, however narrow. */
function phoneLike(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches === true || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
}

/** iOS opened from the home screen: 100vh is the whole screen there (WebKit bug 237961). */
function iosStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Marks an iPhone home-screen app (styles.css gives it the whole screen: WebKit bug 237961). */
export function markIosStandalone(): void {
  if (typeof document !== 'undefined' && iosStandalone()) document.documentElement.classList.add('ios-sa');
}

/** The page is turned a quarter right now. */
export function isRotated(): boolean {
  return on;
}

/** Calls `cb` whenever the quarter turn goes on or off. Returns the unsubscribe. */
export function onRotation(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

function apply(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const upright = window.innerHeight > window.innerWidth;
  const next = wanted && upright && phoneLike();
  // the turned box: as wide as the screen is tall, as tall as it is wide
  root.style.setProperty('--rot-w', `${window.innerWidth}px`);
  root.style.setProperty('--rot-h', iosStandalone() ? '100vh' : `${window.innerHeight}px`);
  if (next === on) return;
  on = next;
  root.classList.toggle('rot', on);
  for (const cb of [...subs]) cb();
  // Phaser and the HUD lay out again for the new shape
  window.dispatchEvent(new Event('resize'));
}

let listening = false;

/** A match on (true) or off (false): keeps the game sideways while it lasts. */
export function forceLandscape(want: boolean): void {
  wanted = want;
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('resize', () => setTimeout(apply, 0));
    window.addEventListener('orientationchange', () => setTimeout(apply, 250));
  }
  apply();
  // where a browser can lock the orientation itself (Android in full screen), lock it for the match
  try {
    const o = (screen as Screen & { orientation?: ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void } }).orientation;
    if (want) void o?.lock?.('landscape').catch(() => {});
    else o?.unlock?.();
  } catch {
    /* not allowed here: the quarter turn does the job */
  }
}

/** The element's box in the coordinates its (possibly turned) overlay uses: the page's, or the turned page's. */
export function boxOf(el: HTMLElement): { left: number; top: number; width: number; height: number; right: number; bottom: number } {
  if (!on) {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  }
  // offsets inside the turned #game box, which sits exactly where the turned overlay layer does
  let left = 0;
  let top = 0;
  let n: HTMLElement | null = el;
  while (n && n.id !== 'game' && n.id !== 'ui') {
    left += n.offsetLeft;
    top += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  const width = el.clientWidth;
  const height = el.clientHeight;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

/** The height of the overlay layer (the turned box's, while turned). */
export function layerHeight(): number {
  if (!on) return window.innerHeight;
  return document.getElementById('ui')?.clientHeight ?? window.innerWidth;
}

/**
 * Teaches Phaser the quarter turn: the parent's size from its layout box (not the turned bounding box) and a
 * pointer's page position turned back into the canvas's own coordinates.
 */
export function patchPhaser(game: Phaser.Game): void {
  type ScaleLike = { parent: HTMLElement | null; canvas: HTMLCanvasElement | null; autoCenter: number; parentSize: { width: number; height: number; setSize(w: number, h: number): void }; getParentBounds(): boolean; updateCenter(): void };
  const sm = game.scale as unknown as ScaleLike;
  const parentBounds = sm.getParentBounds.bind(sm);
  sm.getParentBounds = function getParentBounds(): boolean {
    if (!on || !sm.parent) return parentBounds();
    const w = sm.parent.clientWidth;
    const h = sm.parent.clientHeight;
    if (sm.parentSize.width === w && sm.parentSize.height === h) return false;
    sm.parentSize.setSize(w, h);
    return true;
  };
  // the centring margins: from the canvas's layout size (its bounding box is turned sideways while turned)
  const updateCenter = sm.updateCenter.bind(sm);
  sm.updateCenter = function updateCenterTurned(): void {
    const c = sm.canvas;
    if (!on || !c || sm.autoCenter === 0) return updateCenter();
    const w = c.clientWidth || parseFloat(c.style.width) || c.width;
    const h = c.clientHeight || parseFloat(c.style.height) || c.height;
    c.style.marginLeft = `${Math.floor((sm.parentSize.width - w) / 2)}px`;
    c.style.marginTop = `${Math.floor((sm.parentSize.height - h) / 2)}px`;
  };
  type PointerLike = { position: { x: number; y: number }; prevPosition: { x: number; y: number }; smoothFactor: number };
  type InputLike = { transformPointer(pointer: PointerLike, pageX: number, pageY: number, wasMove: boolean): void };
  const im = game.input as unknown as InputLike;
  const transform = im.transformPointer.bind(im);
  im.transformPointer = function transformPointer(pointer: PointerLike, pageX: number, pageY: number, wasMove: boolean): void {
    const canvas = game.canvas;
    if (!on || !canvas || !canvas.clientWidth || !canvas.clientHeight) return transform(pointer, pageX, pageY, wasMove);
    // turned a quarter clockwise about the top-left corner and moved right by the screen's width: a page point
    // (px, py) sits at (py, screenWidth − px) inside the turned box
    const lx = pageY - window.scrollY;
    const ly = window.innerWidth - (pageX - window.scrollX);
    const x = (lx - canvas.offsetLeft) * (game.scale.width / canvas.clientWidth);
    const y = (ly - canvas.offsetTop) * (game.scale.height / canvas.clientHeight);
    const p0 = pointer.position;
    const p1 = pointer.prevPosition;
    p1.x = p0.x;
    p1.y = p0.y;
    const a = pointer.smoothFactor;
    if (!wasMove || a === 0) {
      p0.x = x;
      p0.y = y;
    } else {
      p0.x = x * a + p1.x * (1 - a);
      p0.y = y * a + p1.y * (1 - a);
    }
  };
}
