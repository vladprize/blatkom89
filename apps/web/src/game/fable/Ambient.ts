/**
 * Fable cut: the life of a map that has nothing to do with the fight — dust hanging in the lamps' light,
 * moths at the street lamps, rain. Decoration only: nothing in the simulation knows about it, and all of it
 * is thinned on the lower quality tiers.
 */
import type * as Phaser from 'phaser';
import type { MapDef } from '@blatkom/shared';
import { D } from '../render/depth.js';
import type { Effects } from '../render/Effects.js';
import type { MapLook } from './looks.js';

interface Moth {
  img: Phaser.GameObjects.Image;
  lamp: number;
  a: number;
  speed: number;
  phase: number;
  r: number;
}

interface Drop {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  v: number;
}

/** Rain falls at this slant (radians from straight down, to the left). */
const RAIN_SLANT = 0.2;

export class Ambient {
  private readonly moths: Moth[] = [];
  private readonly drops: Drop[] = [];
  private dustAt = 0;
  private splashAt = 0;
  private lastW = 0;
  private lastH = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly map: MapDef,
    private readonly look: MapLook,
    private readonly fx: Effects,
    /** 0–1: how much of everything (the quality tier). */
    private readonly amount: number,
    /** Where each lamp's light comes from. */
    private readonly origin: (i: number) => { x: number; y: number },
  ) {
    if (look.motes === 'moths') {
      map.lights.forEach((l, i) => {
        const kind = l.fixture ?? 'lamp';
        if (kind !== 'street' && kind !== 'lamp') return;
        if (l.radius < 110) return;
        const n = Math.max(1, Math.round(3 * amount));
        for (let k = 0; k < n && this.moths.length < 60; k++) {
          const img = scene.add
            .image(l.x, l.y, 'fx', 'px')
            .setDepth(D.LIGHT + 0.6)
            .setTint(0xfff2d0)
            .setScale(0.5)
            .setAlpha(0.85);
          this.moths.push({ img, lamp: i, a: Math.random() * 6.28, speed: (Math.random() < 0.5 ? -1 : 1) * (2.4 + Math.random() * 2.6), phase: Math.random() * 6.28, r: 5 + Math.random() * 7 });
        }
      });
    }
    if (look.weather === 'rain') {
      const n = Math.round((window.innerWidth < 700 ? 110 : 210) * (0.4 + 0.6 * amount));
      for (let i = 0; i < n; i++) {
        const near = Math.random() < 0.3;
        const img = scene.add
          .image(0, 0, 'fx', 'px')
          .setDepth(D.LIGHT + 0.5)
          .setTint(0xa9bfd8)
          .setScale(near ? 0.5 : 0.35, near ? 7 : 4.5)
          .setRotation(RAIN_SLANT)
          .setAlpha(near ? 0.3 : 0.16 + Math.random() * 0.1);
        this.drops.push({ img, x: Math.random() * 2000, y: Math.random() * 2000, v: (near ? 520 : 380) + Math.random() * 120 });
      }
    }
  }

  update(view: Phaser.Geom.Rectangle, dtMs: number, timeMs: number, flick: number[]): void {
    const dt = Math.min(0.1, dtMs / 1000);
    const lights = this.map.lights;
    for (const m of this.moths) {
      const l = lights[m.lamp]!;
      const on = (flick[m.lamp] ?? 1) > 0.25 && l.x > view.x - 20 && l.x < view.right + 20 && l.y > view.y - 20 && l.y < view.bottom + 20;
      m.img.setVisible(on);
      if (!on) continue;
      // a moth circles the lamp, lurching: its radius breathes and it darts now and then
      m.a += m.speed * dt * (1 + 0.6 * Math.sin(timeMs / 370 + m.phase));
      const r = m.r + 4 * Math.sin(timeMs / 530 + m.phase * 2) + 2 * Math.sin(timeMs / 97 + m.phase);
      m.img.setPosition(l.x + Math.cos(m.a) * r, l.y + Math.sin(m.a) * r * 0.85);
    }

    if (this.look.motes === 'dust' && timeMs >= this.dustAt) {
      this.dustAt = timeMs + 130 / Math.max(0.2, this.amount);
      // a speck in the light of one of the lamps in view
      for (let tries = 0; tries < 4; tries++) {
        const i = Math.floor(Math.random() * lights.length);
        const l = lights[i]!;
        if ((flick[i] ?? 1) < 0.3) continue;
        if (l.x < view.x - 40 || l.x > view.right + 40 || l.y < view.y - 40 || l.y > view.bottom + 40) continue;
        const o = this.origin(i);
        const a = Math.random() * 6.28;
        const d = Math.sqrt(Math.random()) * l.radius * 0.42;
        this.fx.particle('px', o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, {
          vx: (Math.random() - 0.5) * 5,
          vy: -1.5 - Math.random() * 4,
          life: 2400 + Math.random() * 1800,
          scale: 0.25 + Math.random() * 0.2,
          tint: l.color,
          alpha: 0.3 + Math.random() * 0.25,
          add: true,
          depth: D.LIGHT + 0.3,
        });
        break;
      }
    }

    if (this.drops.length) {
      const mgn = 24;
      const x0 = view.x - mgn;
      const y0 = view.y - mgn;
      const w = view.width + mgn * 2;
      const h = view.height + mgn * 2;
      if (Math.abs(w - this.lastW) > this.lastW * 0.1 || Math.abs(h - this.lastH) > this.lastH * 0.1) {
        for (const d of this.drops) {
          d.x = x0 + Math.random() * w;
          d.y = y0 + Math.random() * h;
        }
      }
      this.lastW = w;
      this.lastH = h;
      const sx = -Math.sin(RAIN_SLANT);
      const sy = Math.cos(RAIN_SLANT);
      for (const d of this.drops) {
        d.x += sx * d.v * dt;
        d.y += sy * d.v * dt;
        d.x = x0 + ((((d.x - x0) % w) + w) % w);
        d.y = y0 + ((((d.y - y0) % h) + h) % h);
        d.img.setPosition(d.x, d.y);
      }
      // where the drops land: rings on the ground, under the light map — they glint under the lamps
      if (timeMs >= this.splashAt) {
        this.splashAt = timeMs + 28 / Math.max(0.3, this.amount);
        this.fx.particle('ring', view.x + Math.random() * view.width, view.y + Math.random() * view.height, { life: 240, scale: 0.03, grow: 0.42, tint: 0xb9cde4, alpha: 0.5, add: true, depth: D.FX_LOW });
      }
    }
  }

  destroy(): void {
    for (const m of this.moths) m.img.destroy();
    this.moths.length = 0;
    for (const d of this.drops) d.img.destroy();
    this.drops.length = 0;
  }
}
