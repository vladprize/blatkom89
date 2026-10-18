/**
 * Pooled visual effects: muzzle flashes, tracers, sparks, blood, smoke, shells, persistent decals,
 * hit markers. Everything is capped so long matches stay cheap on mobile GPUs.
 */
import * as Phaser from 'phaser';
import { WEAPONS } from '@blatkom/shared';
import type { WeaponId } from '@blatkom/shared';
import { D } from './depth.js';

interface Particle {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
  max: number;
  drag: number;
  fade: boolean;
  grow: number;
  spin: number;
  active: boolean;
  onEnd?: (p: Particle) => void;
}

const MAX_PARTICLES = 260;
const MAX_DECALS = 220;

export const MUZZLE: Record<WeaponId, { forward: number; side: number }> = {
  pistol: { forward: 21, side: 0.8 },
  obrez: { forward: 23, side: 2.3 },
  avtomat: { forward: 28.5, side: 1.9 },
  montirovka: { forward: 24, side: 9 },
};

export function muzzlePoint(x: number, y: number, aim: number, w: WeaponId): { x: number; y: number } {
  const m = MUZZLE[w];
  const c = Math.cos(aim);
  const s = Math.sin(aim);
  return { x: x + c * m.forward - s * m.side, y: y + s * m.forward + c * m.side };
}

export class Effects {
  private readonly pool: Particle[] = [];
  private readonly decals: Phaser.GameObjects.Image[] = [];
  private readonly growing: Array<{ img: Phaser.GameObjects.Image; target: number; speed: number }> = [];
  shakeScale = 1;

  constructor(private readonly scene: Phaser.Scene) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const img = scene.add.image(0, 0, 'fx', 'px').setVisible(false).setActive(false);
      this.pool.push({ img, vx: 0, vy: 0, life: 0, max: 1, drag: 0, fade: true, grow: 0, spin: 0, active: false });
    }
  }

  private spawn(frame: string, x: number, y: number, o: { vx?: number; vy?: number; life: number; scale?: number; tint?: number; alpha?: number; add?: boolean; depth?: number; rot?: number; drag?: number; grow?: number; spin?: number; fade?: boolean; onEnd?: (p: Particle) => void }): Particle | null {
    const p = this.pool.find((q) => !q.active);
    if (!p) return null;
    p.active = true;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.life = o.life;
    p.max = o.life;
    p.drag = o.drag ?? 0;
    p.grow = o.grow ?? 0;
    p.spin = o.spin ?? 0;
    p.fade = o.fade ?? true;
    p.onEnd = o.onEnd;
    p.img
      .setTexture('fx', frame)
      .setPosition(x, y)
      .setScale(o.scale ?? 0.5)
      .setRotation(o.rot ?? 0)
      .setAlpha(o.alpha ?? 1)
      .setDepth(o.depth ?? D.FX_ADD)
      .setBlendMode(o.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
      .setVisible(true)
      .setActive(true)
      .setOrigin(0.5, 0.5)
      .setData('a0', o.alpha ?? 1);
    if (o.tint !== undefined) p.img.setTint(o.tint);
    else p.img.clearTint();
    return p;
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dtMs;
      if (p.life <= 0) {
        p.active = false;
        p.img.setVisible(false).setActive(false);
        p.onEnd?.(p);
        continue;
      }
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      if (p.spin) p.img.rotation += p.spin * dt;
      if (p.grow) p.img.setScale(p.img.scaleX + p.grow * dt);
      if (p.fade) p.img.setAlpha(Math.max(0, p.life / p.max) * (p.img.getData('a0') ?? 1));
    }
    for (let i = this.growing.length - 1; i >= 0; i--) {
      const g = this.growing[i]!;
      const s = Math.min(g.target, g.img.scaleX + g.speed * dt);
      g.img.setScale(s);
      if (s >= g.target) this.growing.splice(i, 1);
    }
  }

  private decal(frame: string, x: number, y: number, rot: number, scale: number, alpha: number, depth: number = D.BLOOD): Phaser.GameObjects.Image {
    let img: Phaser.GameObjects.Image;
    if (this.decals.length >= MAX_DECALS) {
      img = this.decals.shift()!;
      img.setTexture('fx', frame);
    } else img = this.scene.add.image(x, y, 'fx', frame);
    img.setPosition(x, y).setRotation(rot).setScale(scale).setAlpha(alpha).setDepth(depth).clearTint().setBlendMode(Phaser.BlendModes.NORMAL);
    this.decals.push(img);
    return img;
  }

  muzzleFlash(x: number, y: number, aim: number, weapon: WeaponId): void {
    if (weapon === 'montirovka') return;
    const m = muzzlePoint(x, y, aim, weapon);
    const frame = `flash_${weapon}_${Math.random() < 0.5 ? 0 : 1}`;
    this.spawn(frame, m.x, m.y, { life: 55, scale: 0.5, rot: aim, add: true, fade: false, depth: D.FX_ADD });
    this.spawn('glow', m.x, m.y, { life: 70, scale: weapon === 'obrez' ? 0.9 : 0.6, tint: 0xffb050, alpha: 0.7, add: true, depth: D.FX_ADD });
    // gun smoke
    for (let i = 0; i < (weapon === 'obrez' ? 4 : 1); i++) {
      const a = aim + (Math.random() - 0.5) * 0.6;
      const sp = 14 + Math.random() * 20;
      this.spawn('smoke', m.x, m.y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 500 + Math.random() * 400, scale: 0.18, grow: 0.5, alpha: 0.35, drag: 2, depth: D.FX_LOW });
    }
    // brass
    if (weapon === 'pistol' || weapon === 'avtomat') {
      const side = aim + Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      const sp = 60 + Math.random() * 50;
      this.spawn('shell', x + Math.cos(aim) * 6, y + Math.sin(aim) * 6, {
        vx: Math.cos(side) * sp,
        vy: Math.sin(side) * sp,
        life: 280,
        scale: 0.5,
        drag: 7,
        spin: 18,
        fade: false,
        depth: D.FX_LOW,
        onEnd: (p) => {
          const d = this.decal('shell', p.img.x, p.img.y, p.img.rotation, 0.5, 0.9, D.BLOOD);
          d.setDepth(D.BLOOD);
        },
      });
    }
  }

  tracer(x0: number, y0: number, x1: number, y1: number, weapon: WeaponId): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 4) return;
    const a = Math.atan2(dy, dx);
    const p = this.spawn('tracer', x1, y1, { life: weapon === 'obrez' ? 60 : 85, rot: a, add: true, alpha: weapon === 'obrez' ? 0.75 : 0.95, depth: D.FX_ADD });
    if (p) p.img.setOrigin(1, 0.5).setScale(Math.min(len, 260) / 64, weapon === 'avtomat' ? 0.5 : 0.4);
  }

  wallHit(x: number, y: number, a: number): void {
    const back = a + Math.PI;
    for (let i = 0; i < 5; i++) {
      const ang = back + (Math.random() - 0.5) * 1.6;
      const sp = 60 + Math.random() * 110;
      this.spawn('px', x, y, { vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 120 + Math.random() * 120, scale: 0.35, tint: 0xffd070, add: true, drag: 6 });
    }
    this.spawn('dust', x, y, { vx: Math.cos(back) * 10, vy: Math.sin(back) * 10, life: 380, scale: 0.25, grow: 0.6, alpha: 0.45, drag: 3, depth: D.FX_LOW });
    this.decal('hole', x - Math.cos(a) * 1.5, y - Math.sin(a) * 1.5, 0, 0.5, 0.75, D.BLOOD);
  }

  blood(x: number, y: number, a: number, amount: number): void {
    const n = Math.min(10, 3 + Math.floor(amount / 8));
    for (let i = 0; i < n; i++) {
      const ang = a + (Math.random() - 0.5) * 0.9;
      const sp = 40 + Math.random() * 90;
      this.spawn('px', x, y, {
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 160 + Math.random() * 140,
        scale: 0.4 + Math.random() * 0.4,
        tint: 0x8a1410,
        drag: 5,
        depth: D.FX_LOW,
        fade: false,
      });
    }
    const off = 10 + Math.random() * 10;
    this.decal(`blood_${Math.floor(Math.random() * 6)}`, x + Math.cos(a) * off, y + Math.sin(a) * off, a, 0.4 + Math.random() * 0.2, 0.9);
  }

  bloodPool(x: number, y: number): void {
    const img = this.decal(`pool_${Math.floor(Math.random() * 3)}`, x, y, Math.random() * Math.PI * 2, 0.1, 0.92);
    this.growing.push({ img, target: 0.55 + Math.random() * 0.15, speed: 0.45 });
  }

  meleeSwing(x: number, y: number, aim: number): void {
    for (let i = 0; i < 6; i++) {
      const a = aim - 0.9 + (i / 5) * 1.8;
      this.spawn('px', x + Math.cos(a) * 22, y + Math.sin(a) * 22, { life: 110, scale: 0.5, tint: 0xe8e0d0, alpha: 0.7, add: true });
    }
  }

  dust(x: number, y: number): void {
    this.spawn('dust', x, y, { life: 420, scale: 0.18, grow: 0.35, alpha: 0.28, depth: D.FX_LOW, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8 });
  }

  pickupSparkle(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.spawn('px', x, y, { vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 260, scale: 0.4, tint: 0xffe08a, add: true, drag: 4 });
    }
  }

  cigaretteSmoke(x: number, y: number): void {
    this.spawn('smoke', x, y, { vx: (Math.random() - 0.5) * 6, vy: -6 - Math.random() * 6, life: 900, scale: 0.08, grow: 0.12, alpha: 0.22, depth: D.FX_LOW });
  }

  shake(cam: Phaser.Cameras.Scene2D.Camera, strength: number): void {
    if (this.shakeScale <= 0 || strength <= 0) return;
    cam.shake(70 + strength * 60, 0.0012 + strength * 0.004 * this.shakeScale, false);
  }

  static weaponShake(w: WeaponId): number {
    return WEAPONS[w].shake;
  }
}
