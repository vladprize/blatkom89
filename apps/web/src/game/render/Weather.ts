/**
 * Falling snow (v0.2.18, «Воркута»): a few hundred flakes kept in world coordinates and wrapped round
 * the camera's view, so they drift with the wind and stay put when the camera pans (no screen-locked
 * curtain). They are drawn over the night light map, faint, so the dark does not swallow them.
 * Decoration only: nothing in the simulation knows about them.
 */
import type * as Phaser from 'phaser';
import { D } from './depth.js';

interface Flake {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  sway: number;
}

export class Snowfall {
  private readonly flakes: Flake[] = [];

  constructor(scene: Phaser.Scene, count: number) {
    for (let i = 0; i < count; i++) {
      const near = this.rnd() < 0.25;
      // above the night light map (or the dark would swallow them), so kept faint
      const img = scene.add
        .image(0, 0, 'fx', 'px')
        .setDepth(D.LIGHT + 0.5)
        .setTint(0xdfe8ff)
        .setScale(near ? 0.5 + this.rnd() * 0.25 : 0.22 + this.rnd() * 0.18)
        .setAlpha(near ? 0.55 : 0.25 + this.rnd() * 0.25);
      this.flakes.push({ img, x: this.rnd() * 2000, y: this.rnd() * 2000, vx: -6 - this.rnd() * 10, vy: (near ? 30 : 16) + this.rnd() * 14, phase: this.rnd() * 6.28, sway: 4 + this.rnd() * 8 });
    }
  }

  /** Decoration only: no need for the simulation's deterministic generator. */
  private rnd(): number {
    return Math.random();
  }

  private lastW = 0;
  private lastH = 0;

  update(view: Phaser.Geom.Rectangle, dtMs: number, timeMs: number): void {
    const dt = Math.min(0.1, dtMs / 1000);
    const m = 24;
    const x0 = view.x - m;
    const y0 = view.y - m;
    const w = view.width + m * 2;
    const h = view.height + m * 2;
    // a new view size (the first frames, a resize, a zoom): scatter the flakes over it again, or the
    // wrap would keep them bunched where the old, smaller view was
    if (Math.abs(w - this.lastW) > this.lastW * 0.1 || Math.abs(h - this.lastH) > this.lastH * 0.1) {
      for (const f of this.flakes) {
        f.x = x0 + this.rnd() * w;
        f.y = y0 + this.rnd() * h;
      }
    }
    this.lastW = w;
    this.lastH = h;
    for (const f of this.flakes) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      // keep every flake inside the view (wrapped), whichever way the camera went
      f.x = x0 + ((((f.x - x0) % w) + w) % w);
      f.y = y0 + ((((f.y - y0) % h) + h) % h);
      f.img.setPosition(f.x + Math.sin(timeMs / 900 + f.phase) * f.sway, f.y);
    }
  }

  setVisible(v: boolean): void {
    for (const f of this.flakes) f.img.setVisible(v);
  }

  destroy(): void {
    for (const f of this.flakes) f.img.destroy();
    this.flakes.length = 0;
  }
}
