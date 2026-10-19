/**
 * Text that always fits its box: the font shrinks (never grows past `max`) until the text fits.
 * Used for aliases in the Dossier tile and the profile header (one line, two for very long ones) and
 * for the map captions, which all share one size so the tiles look alike.
 */
export interface FitOptions {
  /** Largest font size, px (a function for sizes that follow the screen). */
  max: number | (() => number);
  /** Smallest font size, px. */
  min: number;
  /**
   * Text that may wrap: at most this many lines, measured on the element's first child (a block
   * holding the text) and never taller than the element's content box. Default 1: only the width is
   * checked (the element should not wrap: white-space: nowrap).
   */
  lines?: number;
}

const px = (v: number | (() => number)) => Math.round((typeof v === 'function' ? v() : v) * 2) / 2;

// Heights are compared on the text block, not with scrollHeight: tall fonts (Oswald) report glyph
// overflow beyond a tight line-height as scrollable even when every line is inside the box.
function fits(el: HTMLElement, lines: number): boolean {
  if (el.scrollWidth > el.clientWidth + 1) return false;
  if (lines <= 1) return true;
  const inner = el.firstElementChild as HTMLElement | null;
  if (!inner) return true;
  const cs = getComputedStyle(el);
  const room = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const lh = parseFloat(getComputedStyle(inner).lineHeight);
  const height = inner.getBoundingClientRect().height;
  return height <= room + 1 && (!Number.isFinite(lh) || height <= lines * lh + 1);
}

/** Sets the largest font size (0.5 px steps) at which every element fits; returns it. */
export function fitTextGroup(els: readonly HTMLElement[], o: FitOptions): number {
  const max = px(o.max);
  const live = els.filter((e) => e.isConnected && e.clientWidth > 0);
  if (!live.length) return max;
  const lines = o.lines ?? 1;
  const ok = (e: HTMLElement) => fits(e, lines);
  const apply = (size: number) => {
    for (const e of live) e.style.fontSize = `${size}px`;
  };
  apply(max);
  if (live.every(ok)) return max;
  let lo = Math.min(o.min, max);
  let hi = max;
  while (hi - lo > 0.5) {
    const mid = Math.round(lo + hi) / 2;
    apply(mid);
    if (live.every(ok)) lo = mid;
    else hi = mid;
  }
  apply(lo);
  return lo;
}

/**
 * An alias (the element holds one block child with the text): one line, shrunk down to `min`; an
 * alias that is still too long goes onto two lines (class `fit-wrap`) at the largest size that fits.
 */
export function fitAlias(el: HTMLElement, o: { max: number | (() => number); min: number; minTwoLines: number }): void {
  if (!el.isConnected || el.clientWidth === 0) return;
  el.classList.remove('fit-wrap');
  fitTextGroup([el], { max: o.max, min: o.min });
  if (fits(el, 1)) return;
  el.classList.add('fit-wrap');
  fitTextGroup([el], { max: o.max, min: o.minTwoLines, lines: 2 });
}

/**
 * Runs `fit` once `box` is laid out, whenever it changes size (window resize, rotation) and once the
 * web fonts have loaded. The observer stops by itself when `box` leaves the page.
 */
export function whenSized(box: HTMLElement, fit: () => void): void {
  let frame = 0;
  const run = () => {
    frame = 0;
    if (box.isConnected) fit();
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(run);
  };
  if (typeof ResizeObserver !== 'undefined') {
    let seen = false;
    const ro = new ResizeObserver(() => {
      if (!box.isConnected) {
        if (seen) ro.disconnect();
        return;
      }
      seen = true;
      schedule();
    });
    ro.observe(box);
  } else {
    requestAnimationFrame(schedule);
    window.addEventListener('resize', schedule);
  }
  document.fonts?.ready.then(schedule).catch(() => {});
}

/** Keeps a group of texts fitted to their boxes (see fitTextGroup) while `box` changes size. */
export function autoFit(box: HTMLElement, els: () => readonly HTMLElement[], o: FitOptions): void {
  whenSized(box, () => fitTextGroup(els(), o));
}
