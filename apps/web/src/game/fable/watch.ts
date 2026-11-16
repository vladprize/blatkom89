/**
 * The picture's quality as one ladder, and the watch that takes a device down it when it cannot keep up.
 * No Phaser, no DOM — plain numbers, so it is tested without a browser.
 *
 * v0.2.26 (the owner: «сделай тогда просто FableCut главный… убери предыдущую»): the picture with shadows is the
 * game's only one, so a device that is too slow for all of it has to be found and remembered — the step it ends
 * up on is saved, and the next match starts there instead of stuttering through the same four seconds again.
 */

/**
 * 2 — «Кино» (everything), 1 — «Баланс», 0 — «Быстро»; −1 — «Быстро» without the picture's finish pass: the
 * step only the game itself goes down to (the settings show it as «Быстро»).
 */
export type QualityLevel = -1 | 0 | 1 | 2;

export const LOWEST: QualityLevel = -1;

/** A stored value made safe: anything that is not a step of the ladder is `fallback`. */
export function qualityOf(v: unknown, fallback: QualityLevel): QualityLevel {
  return v === 2 || v === 1 || v === 0 || v === -1 ? v : fallback;
}

/** One step down; null at the bottom. */
export function stepDown(level: QualityLevel): QualityLevel | null {
  return level > LOWEST ? ((level - 1) as QualityLevel) : null;
}

export interface PerfWatchOptions {
  /** Frames a second below which a second counts as slow. */
  floor: number;
  /** Slow seconds in a row before the quality steps down. */
  seconds: number;
  /** The match's first moments are not judged: the map is being built, the lamps baked, textures made. */
  graceMs: number;
  /** A gap this long between two frames is a stall or a hidden tab, not a slow device: the count starts over. */
  stallMs: number;
}

export const PERF_WATCH: PerfWatchOptions = { floor: 38, seconds: 4, graceMs: 3000, stallMs: 3000 };

export class PerfWatch {
  private frames = 0;
  private start = -1;
  private born = -1;
  private last = -1;
  private slow = 0;

  constructor(private readonly o: PerfWatchOptions = PERF_WATCH) {}

  /**
   * Called every frame with the clock (ms). True — once — when the frame rate has stayed under the floor for
   * the given number of seconds in a row: the quality should step down, and the count starts over.
   */
  frame(now: number, paused: boolean): boolean {
    if (this.start < 0) {
      this.start = this.born = this.last = now;
      return false;
    }
    const gap = now - this.last;
    this.last = now;
    if (gap >= this.o.stallMs) {
      // the tab was hidden, the phone locked, the debugger stopped: nothing is known about the speed
      this.frames = 0;
      this.start = now;
      this.slow = 0;
      return false;
    }
    this.frames++;
    const span = now - this.start;
    if (span < 1000) return false;
    const fps = (this.frames * 1000) / span;
    this.frames = 0;
    this.start = now;
    if (now - this.born < this.o.graceMs) {
      this.slow = 0;
      return false;
    }
    this.slow = fps < this.o.floor && !paused ? this.slow + 1 : 0;
    if (this.slow < this.o.seconds) return false;
    this.slow = 0;
    return true;
  }
}
