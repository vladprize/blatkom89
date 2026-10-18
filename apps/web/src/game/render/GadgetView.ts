/**
 * Equipment in the world: grenades in flight, burning molotovs, smoke clouds, mines, C4 and
 * turrets. Everything here is drawn from session state (server-authoritative positions and phases);
 * one-off feedback (explosions, flashes, sounds) comes from session events in GameScene.
 */
import * as Phaser from 'phaser';
import { GADGETS, TURRET } from '@blatkom/shared';
import type { RenderGadget } from '../session/types.js';
import type { Effects } from './Effects.js';
import type { Lighting } from './Lighting.js';
import { D } from './depth.js';

interface View {
  kind: RenderGadget['kind'];
  phase: RenderGadget['phase'];
  body: Phaser.GameObjects.Image | null;
  head: Phaser.GameObjects.Image | null;
  led: Phaser.GameObjects.Image | null;
  ring: Phaser.GameObjects.Image | null;
  bar: Phaser.GameObjects.Graphics | null;
  puffs: Array<{ img: Phaser.GameObjects.Image; dx: number; dy: number; s: number; drift: number }>;
  glow: Phaser.GameObjects.Image | null;
  spin: number;
  litAt: number;
  scorched: boolean;
}

/** Turret head sprite pivot (see tools/art/build-weapons.ts: 48×32 canvas centred 4 px ahead of the pivot). */
const HEAD_ORIGIN_X = (24 - 4 * 2) / 48;

export class GadgetView {
  private readonly views = new Map<number, View>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fx: Effects,
    private readonly lighting: Lighting,
  ) {}

  /** Active smoke clouds (for concealing players inside). */
  clouds: Array<{ x: number; y: number; r: number }> = [];

  update(list: RenderGadget[], localSlot: number, now: number, dtMs: number): void {
    const seen = new Set<number>();
    this.clouds = [];
    for (const g of list) {
      seen.add(g.id);
      let v = this.views.get(g.id);
      if (v && (v.kind !== g.kind || v.phase !== g.phase)) {
        // phase change (grenade → fire / smoke cloud, turret deploying → active): rebuild
        if (!(v.kind === 'turret' && g.kind === 'turret')) {
          this.destroyView(v);
          v = undefined;
        } else v.phase = g.phase;
      }
      if (!v) {
        v = this.create(g, localSlot);
        this.views.set(g.id, v);
      }
      this.draw(v, g, localSlot, now, dtMs);
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.destroyView(v);
        this.views.delete(id);
      }
    }
  }

  private create(g: RenderGadget, localSlot: number): View {
    const s = this.scene;
    const v: View = { kind: g.kind, phase: g.phase, body: null, head: null, led: null, ring: null, bar: null, puffs: [], glow: null, spin: Math.random() * 6, litAt: 0, scorched: false };
    const mine = g.owner === localSlot;
    if (g.phase === 'moving') {
      v.body = s.add.image(g.x, g.y, 'weapons', `g_${g.kind}`).setScale(0.5).setDepth(D.FX_LOW + 0.2);
      if (g.kind === 'molotov') v.glow = s.add.image(g.x, g.y, 'fx', 'glow').setScale(0.35).setTint(0xff8a24).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.FX_ADD);
      return v;
    }
    switch (g.kind) {
      case 'smoke': {
        const r = GADGETS.smoke.radius;
        for (let i = 0; i < 11; i++) {
          const a = (i / 11) * Math.PI * 2 + Math.random() * 0.4;
          const d = i === 0 ? 0 : r * (0.25 + Math.random() * 0.45);
          const sc = (r / 16) * (0.55 + Math.random() * 0.3);
          const img = s.add.image(g.x, g.y, 'fx', 'smoke').setScale(0.2).setAlpha(0.95).setTint(i % 3 ? 0xb6b2aa : 0x9c988f).setDepth(D.SMOKE + i * 0.001).setRotation(Math.random() * 6);
          v.puffs.push({ img, dx: Math.cos(a) * d, dy: Math.sin(a) * d, s: sc, drift: (Math.random() - 0.5) * 0.6 });
        }
        break;
      }
      case 'molotov':
        v.glow = s.add.image(g.x, g.y, 'fx', 'glow').setScale(GADGETS.molotov.radius / 24).setTint(0xff6a1a).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.FX_LOW + 0.4);
        break;
      case 'mine':
      case 'c4':
        v.body = s.add.image(g.x, g.y, 'weapons', `g_${g.kind}`).setScale(0.5).setDepth(D.GADGET).setRotation(g.aim);
        v.led = s.add.image(g.x, g.y, 'fx', 'glow').setScale(0.12).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.FX_ADD).setTint(mine ? 0x6aff7a : 0xff3a2a);
        break;
      case 'turret':
        v.ring = s.add.image(g.x, g.y, 'fx', 'ring').setScale(0.42).setTint(mine ? 0x6aff7a : 0xff5a3a).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.DECAL);
        v.body = s.add.image(g.x, g.y, 'weapons', 'g_turret').setScale(0.5).setDepth(D.GADGET);
        v.head = s.add.image(g.x, g.y, 'weapons', 'g_turret_head').setScale(0.5).setOrigin(HEAD_ORIGIN_X, 0.5).setDepth(D.TORSO - 0.05).setRotation(g.aim);
        v.led = s.add.image(g.x, g.y, 'fx', 'glow').setScale(0.1).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.FX_ADD).setTint(mine ? 0x6aff7a : 0xff3a2a);
        v.bar = s.add.graphics().setDepth(D.LABEL);
        break;
      default:
        break;
    }
    return v;
  }

  private draw(v: View, g: RenderGadget, localSlot: number, now: number, dtMs: number) {
    const mine = g.owner === localSlot;
    if (g.phase === 'moving') {
      v.spin += dtMs * 0.012;
      v.body?.setPosition(g.x, g.y).setRotation(v.spin);
      if (v.glow) v.glow.setPosition(g.x + Math.cos(v.spin) * 2.5, g.y + Math.sin(v.spin) * 2.5).setAlpha(0.6 + Math.random() * 0.3);
      // a lit fuse sputters
      if (g.kind !== 'molotov' && Math.random() < 0.25) this.fx.particle('px', g.x, g.y, { vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 160, scale: 0.35, tint: 0xffd070, add: true });
      return;
    }
    switch (g.kind) {
      case 'smoke': {
        // puffs swell in, drift, and thin out over the last two seconds
        const r = GADGETS.smoke.radius;
        const fade = Math.min(1, g.leftMs / 2000);
        this.clouds.push({ x: g.x, y: g.y, r: r * 0.85 * Math.max(0.3, fade) });
        for (const p of v.puffs) {
          const cur = p.img.scaleX;
          const target = p.s * (0.6 + 0.4 * fade);
          p.img.setScale(cur + (target - cur) * Math.min(1, dtMs / 350));
          p.img.rotation += p.drift * (dtMs / 1000);
          p.img.setPosition(g.x + p.dx + Math.sin(now / 1700 + p.drift * 9) * 3, g.y + p.dy + Math.cos(now / 2100 + p.drift * 7) * 3);
          p.img.setAlpha(0.92 * fade);
        }
        break;
      }
      case 'molotov': {
        const r = GADGETS.molotov.radius;
        if (!v.scorched) {
          v.scorched = true;
          this.fx.scorch(g.x, g.y, r);
        }
        this.fx.fireTick(g.x, g.y, r * Math.min(1, g.leftMs / 700 + 0.3));
        v.glow?.setPosition(g.x, g.y).setAlpha(0.35 + Math.random() * 0.15);
        if (now - v.litAt > 120) {
          v.litAt = now;
          this.lighting.flash(g.x, g.y, r * 2.6, 0xff7a24, 0.9, 200, now);
        }
        break;
      }
      case 'mine':
      case 'c4': {
        // opponents' charges are hard to spot: dim, with a slow blink
        v.body?.setPosition(g.x, g.y).setAlpha(mine ? 1 : 0.55);
        const period = g.triggered ? 90 : g.kind === 'c4' ? 600 : 1100;
        const on = Math.floor(now / period) % 2 === 0;
        v.led?.setPosition(g.x + (g.kind === 'c4' ? 0.6 : 1.6), g.y).setAlpha(on ? (mine ? 0.9 : 0.6) : 0.1).setScale(g.triggered ? 0.22 : 0.12);
        break;
      }
      case 'turret': {
        const deploying = g.phase === 'armed';
        v.ring?.setPosition(g.x, g.y);
        v.body?.setPosition(g.x, g.y);
        v.head?.setPosition(g.x, g.y - 1).setRotation(g.aim).setAlpha(deploying ? 0.6 : 1);
        v.led?.setPosition(g.x - Math.cos(g.aim) * 2, g.y - Math.sin(g.aim) * 2).setAlpha(Math.floor(now / 400) % 2 ? 0.9 : 0.3);
        const bar = v.bar!;
        bar.clear();
        const w = 14;
        const bx = Math.round(g.x - w / 2);
        const by = Math.round(g.y - 14);
        bar.fillStyle(0x0b0908, 0.85).fillRect(bx - 1, by - 1, w + 2, 3);
        bar.fillStyle(mine ? 0x6ad86a : 0xd8322a, 1).fillRect(bx, by, (w * Math.max(0, g.hp)) / TURRET.hp, 1);
        break;
      }
      default:
        break;
    }
  }

  private destroyView(v: View) {
    v.body?.destroy();
    v.head?.destroy();
    v.led?.destroy();
    v.ring?.destroy();
    v.bar?.destroy();
    v.glow?.destroy();
    for (const p of v.puffs) p.img.destroy();
  }

  /** Is (x, y) hidden by smoke? */
  concealed(x: number, y: number): boolean {
    return this.clouds.some((c) => (c.x - x) ** 2 + (c.y - y) ** 2 < c.r * c.r);
  }

  destroy(): void {
    for (const v of this.views.values()) this.destroyView(v);
    this.views.clear();
  }
}
