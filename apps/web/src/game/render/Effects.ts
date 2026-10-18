/**
 * Pooled visual effects: muzzle flashes, tracers, sparks, blood, smoke, shells, persistent decals,
 * hit markers. Everything is capped so long matches stay cheap on mobile GPUs.
 */
import * as Phaser from 'phaser';
import { WEAPONS } from '@blatkom/shared';
import type { WeaponId } from '@blatkom/shared';
import { D } from './depth.js';
import { MUZZLES } from './rig.gen.js';

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

export interface ParticleOptions {
  vx?: number;
  vy?: number;
  life: number;
  scale?: number;
  tint?: number;
  alpha?: number;
  add?: boolean;
  depth?: number;
  rot?: number;
  drag?: number;
  grow?: number;
  spin?: number;
  fade?: boolean;
  onEnd?: (p: Particle) => void;
}

const MAX_PARTICLES = 260;
const MAX_DECALS = 220;

/** Muzzle point of `w` for a character at (x, y) aiming at `aim` (from the art pipeline). */
export function muzzlePoint(x: number, y: number, aim: number, w: WeaponId): { x: number; y: number } {
  const m = MUZZLES[w];
  const c = Math.cos(aim);
  const s = Math.sin(aim);
  return { x: x + c * m.forward - s * m.side, y: y + s * m.forward + c * m.side };
}

/** Firearms that throw brass when fired. */
const EJECTS = new Set(['pistol', 'silenced', 'smg', 'avtomat', 'lmg', 'rifle']);

/** A rocket / grenade drawn in flight until the server reports the explosion. */
interface Flight {
  id: number;
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  left: number;
  trailAt: number;
}

export class Effects {
  private readonly pool: Particle[] = [];
  private readonly decals: Phaser.GameObjects.Image[] = [];
  private readonly growing: Array<{ img: Phaser.GameObjects.Image; target: number; speed: number }> = [];
  private readonly flights = new Map<number, Flight>();
  shakeScale = 1;

  constructor(private readonly scene: Phaser.Scene) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const img = scene.add.image(0, 0, 'fx', 'px').setVisible(false).setActive(false);
      this.pool.push({ img, vx: 0, vy: 0, life: 0, max: 1, drag: 0, fade: true, grow: 0, spin: 0, active: false });
    }
  }

  private spawn(frame: string, x: number, y: number, o: ParticleOptions): Particle | null {
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
    for (const f of this.flights.values()) {
      const step = Math.min(f.left, f.speed * dt);
      f.x += f.dx * step;
      f.y += f.dy * step;
      f.left -= step;
      f.img.setPosition(f.x, f.y);
      f.trailAt -= dtMs;
      if (f.trailAt <= 0) {
        f.trailAt = 22;
        this.spawn('smoke', f.x - f.dx * 6, f.y - f.dy * 6, { vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, life: 600 + Math.random() * 300, scale: 0.14, grow: 0.4, alpha: 0.4, drag: 2, depth: D.FX_LOW });
        this.spawn('glow', f.x - f.dx * 5, f.y - f.dy * 5, { life: 60, scale: 0.35, tint: 0xffa040, alpha: 0.8, add: true });
      }
      // the server's explosion normally arrives first; never fly past the weapon's range
      if (f.left <= 0) this.endFlight(f.id);
    }
  }

  /** Starts drawing a rocket/grenade in flight (`age` ms already flown). */
  launch(id: number, weapon: WeaponId, x: number, y: number, angle: number, speed: number, range: number, age = 0): void {
    this.endFlight(id);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const flown = Math.min(range, (speed * age) / 1000);
    const frame = weapon === 'granatomet' ? 'proj_grenade' : 'proj_rocket';
    const img = this.scene.add.image(x + dx * flown, y + dy * flown, 'weapons', frame).setScale(0.5).setRotation(angle).setDepth(D.FX_ADD - 0.01);
    this.flights.set(id, { id, img, x: x + dx * flown, y: y + dy * flown, dx, dy, speed, left: range - flown, trailAt: 0 });
  }

  endFlight(id: number): void {
    const f = this.flights.get(id);
    if (!f) return;
    f.img.destroy();
    this.flights.delete(id);
  }

  /** Explosion: flash, fireball, smoke, sparks, debris and a scorch mark. */
  explosion(x: number, y: number, radius: number): void {
    const k = radius / 70;
    this.spawn('glow', x, y, { life: 160, scale: 2.4 * k, tint: 0xfff0c0, alpha: 1, add: true, depth: D.FX_ADD });
    this.spawn('glow', x, y, { life: 420, scale: 3.4 * k, tint: 0xff7a2a, alpha: 0.8, add: true, depth: D.FX_ADD });
    this.spawn('ring', x, y, { life: 260, scale: 0.4 * k, grow: 4.2 * k, tint: 0xffd890, alpha: 0.9, add: true, depth: D.FX_ADD });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (40 + Math.random() * 70) * k;
      this.spawn('smoke', x + Math.cos(a) * 6, y + Math.sin(a) * 6, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 900 + Math.random() * 900, scale: (0.3 + Math.random() * 0.3) * k, grow: 0.5, alpha: 0.55, drag: 2.5, depth: D.FX_LOW, tint: i < 5 ? 0x6a5a4a : 0x9a948c });
    }
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (120 + Math.random() * 220) * k;
      this.spawn('px', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 200 + Math.random() * 260, scale: 0.45, tint: i % 3 ? 0xffc060 : 0xfff2c0, add: true, drag: 4 });
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (60 + Math.random() * 120) * k;
      this.spawn('px', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 380 + Math.random() * 200, scale: 0.7, tint: 0x2a2420, drag: 5, spin: 12, depth: D.FX_LOW, fade: false });
    }
    // soot mark about the size of the blast core
    this.decal(`scorch_${Math.floor(Math.random() * 2)}`, x, y, Math.random() * Math.PI * 2, (radius * 1.3) / 64, 0.8);
  }

  /** Public particle spawner for other renderers (equipment). */
  particle(frame: string, x: number, y: number, o: ParticleOptions): void {
    this.spawn(frame, x, y, o);
  }

  /** Burning molotov: tongues of flame inside the circle, embers and dark smoke above it. */
  fireTick(x: number, y: number, radius: number): void {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius * 0.9;
      const fx = x + Math.cos(a) * r;
      const fy = y + Math.sin(a) * r;
      // bigger flames in the middle of the puddle
      const s = (0.55 + Math.random() * 0.45) * (1.25 - (r / radius) * 0.6);
      this.spawn(`flame_${Math.floor(Math.random() * 3)}`, fx, fy, { vx: (Math.random() - 0.5) * 8, vy: -10 - Math.random() * 14, life: 360 + Math.random() * 240, scale: s, grow: -s * 1.2, alpha: 0.95, depth: D.FX_LOW + 0.5 });
    }
    if (Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius * 0.8;
      this.spawn('glow', x + Math.cos(a) * r, y + Math.sin(a) * r, { vy: -8, life: 300, scale: 0.35 + Math.random() * 0.25, tint: 0xff7a1a, alpha: 0.5, add: true, depth: D.FX_LOW + 0.4 });
    }
    if (Math.random() < 0.3) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.8;
      this.spawn('px', x + Math.cos(a) * r, y + Math.sin(a) * r, { vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 30, life: 500, scale: 0.35, tint: 0xffc060, add: true, drag: 1 });
    }
    if (Math.random() < 0.35) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.7;
      this.spawn('smoke', x + Math.cos(a) * r, y + Math.sin(a) * r, { vx: (Math.random() - 0.5) * 8, vy: -12, life: 1400, scale: 0.35, grow: 0.5, alpha: 0.35, drag: 0.8, depth: D.FX_LOW + 0.6, tint: 0x2a2420 });
    }
  }

  /** Scorched floor under a fire. */
  scorch(x: number, y: number, radius: number): void {
    this.decal(`scorch_${Math.floor(Math.random() * 2)}`, x, y, Math.random() * Math.PI * 2, (radius * 2.2) / 64, 0.7);
  }

  /** Flashbang: a white burst and sparks. */
  flashBurst(x: number, y: number): void {
    this.spawn('glow', x, y, { life: 260, scale: 5.5, tint: 0xffffff, alpha: 1, add: true, depth: D.FX_ADD });
    this.spawn('ring', x, y, { life: 300, scale: 0.4, grow: 6, tint: 0xffffff, alpha: 0.9, add: true, depth: D.FX_ADD });
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 160 + Math.random() * 200;
      this.spawn('px', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 180 + Math.random() * 160, scale: 0.4, tint: 0xffffff, add: true, drag: 5 });
    }
    this.spawn('smoke', x, y, { life: 1200, scale: 0.4, grow: 0.6, alpha: 0.4, drag: 1, depth: D.FX_LOW, tint: 0xd8d4cc });
  }

  /** Bits of a destroyed turret. */
  debris(x: number, y: number): void {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 140;
      this.spawn('px', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 400 + Math.random() * 300, scale: 0.7, tint: i % 2 ? 0x3a4024 : 0x1a1a1e, drag: 5, spin: 10, depth: D.FX_LOW, fade: false });
    }
    this.spawn('glow', x, y, { life: 200, scale: 1.4, tint: 0xffb050, alpha: 0.8, add: true });
    this.spawn('smoke', x, y, { life: 1500, scale: 0.3, grow: 0.5, alpha: 0.5, drag: 1, depth: D.FX_LOW, tint: 0x3a3430 });
  }

  /** Green first-aid sparkle. */
  heal(x: number, y: number): void {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.spawn('px', x + Math.cos(a) * 4, y + Math.sin(a) * 4, { vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 25, life: 500, scale: 0.5, tint: i % 2 ? 0x7cff8a : 0xffffff, add: true, drag: 2 });
    }
    this.spawn('glow', x, y, { life: 300, scale: 0.9, tint: 0x6aff7a, alpha: 0.6, add: true });
  }

  /** Flamethrower burst: a short tongue of fire along the aim. */
  flame(x: number, y: number, aim: number, range: number): void {
    for (let i = 0; i < 5; i++) {
      const a = aim + (Math.random() - 0.5) * 0.35;
      const sp = range * (2.4 + Math.random() * 1.2);
      const life = 220 + Math.random() * 120;
      this.spawn('glow', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, scale: 0.18, grow: 1.6, tint: i % 2 ? 0xff8a24 : 0xffd060, alpha: 0.95, add: true, drag: 3 });
    }
    if (Math.random() < 0.5) this.spawn('smoke', x + Math.cos(aim) * range * 0.7, y + Math.sin(aim) * range * 0.7, { vx: Math.cos(aim) * 20, vy: Math.sin(aim) * 20 - 10, life: 700, scale: 0.2, grow: 0.6, alpha: 0.35, drag: 1.5, depth: D.FX_LOW, tint: 0x3a3430 });
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
    const def = WEAPONS[weapon];
    if (def.kind === 'melee') return;
    const m = muzzlePoint(x, y, aim, weapon);
    if (def.sound === 'flame') {
      this.flame(m.x, m.y, aim, def.range);
      return;
    }
    if (def.flash !== 'none') {
      this.spawn(`flash_${def.flash}_${Math.random() < 0.5 ? 0 : 1}`, m.x, m.y, { life: 55, scale: 0.5, rot: aim, add: true, fade: false, depth: D.FX_ADD });
      this.spawn('glow', m.x, m.y, { life: 70, scale: def.flash === 'obrez' ? 0.9 : 0.6, tint: 0xffb050, alpha: 0.7, add: true, depth: D.FX_ADD });
    } else if (def.silenced) {
      // suppressed: a faint puff instead of a flash
      this.spawn('glow', m.x, m.y, { life: 50, scale: 0.25, tint: 0xd8c8a8, alpha: 0.35, add: true, depth: D.FX_ADD });
    }
    // gun smoke (launchers throw a back-blast too)
    const heavy = def.flash === 'obrez' || def.kind === 'projectile';
    for (let i = 0; i < (heavy ? 4 : 1); i++) {
      const a = aim + (Math.random() - 0.5) * 0.6;
      const sp = 14 + Math.random() * 20;
      this.spawn('smoke', m.x, m.y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 500 + Math.random() * 400, scale: 0.18, grow: 0.5, alpha: def.silenced ? 0.15 : 0.35, drag: 2, depth: D.FX_LOW });
    }
    if (def.kind === 'projectile') {
      const back = aim + Math.PI;
      for (let i = 0; i < 5; i++) {
        const a = back + (Math.random() - 0.5) * 0.7;
        const sp = 60 + Math.random() * 60;
        this.spawn('smoke', x + Math.cos(back) * 10, y + Math.sin(back) * 10, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 700 + Math.random() * 300, scale: 0.22, grow: 0.7, alpha: 0.45, drag: 2.5, depth: D.FX_LOW });
      }
    }
    // brass
    if (EJECTS.has(def.sound)) {
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
    const def = WEAPONS[weapon];
    if (def.sound === 'flame') return;
    const pellet = def.pellets > 1;
    const heavy = def.sound === 'rifle' || def.sound === 'lmg' || def.sound === 'bow';
    const p = this.spawn('tracer', x1, y1, { life: pellet ? 60 : heavy ? 120 : 85, rot: a, add: true, alpha: pellet ? 0.75 : def.silenced ? 0.55 : 0.95, depth: D.FX_ADD, tint: def.sound === 'nail' ? 0xd8dce4 : undefined });
    if (p) p.img.setOrigin(1, 0.5).setScale(Math.min(len, heavy ? 360 : 260) / 64, heavy ? 0.6 : pellet ? 0.4 : 0.5);
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
