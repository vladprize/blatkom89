/** The game's internal resolution for a window (no Phaser here, so tests can load it). */
import { VIEW_SHORT_WORLD, TEXELS_PER_WORLD_PX } from '../app/config.js';

/** The widest view, long side to short side. */
export const MAX_VIEW_ASPECT = 2.4;

/**
 * The game's internal size for a window of `w` × `h`: the short side is VIEW_SHORT_WORLD world px, the long
 * side follows the window. v0.2.18 (the owner: «на телефоне горизонтально в браузере игра открывается не в
 * полное окно»): a window wider than MAX_VIEW_ASPECT — a phone held sideways under the browser's bars —
 * still fills the screen edge to edge; the view keeps the widest width and shows a little less height (it
 * never shows more of the map than the widest view does).
 */
export function internalSize(w: number, h: number): { width: number; height: number } {
  const short = VIEW_SHORT_WORLD * TEXELS_PER_WORLD_PX;
  const landscape = w >= h;
  const aspect = Math.max(1, landscape ? w / Math.max(1, h) : h / Math.max(1, w));
  if (aspect <= MAX_VIEW_ASPECT) {
    const long = Math.round(short * aspect);
    return landscape ? { width: long, height: short } : { width: short, height: long };
  }
  const long = Math.round(short * MAX_VIEW_ASPECT);
  const across = Math.round(long / aspect);
  return landscape ? { width: long, height: across } : { width: across, height: long };
}
