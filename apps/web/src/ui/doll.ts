/**
 * «In the game» view for the Arsenal dressing room: the character exactly as it looks in a match —
 * legs, the torso frame and the weapon attached at that frame's grip (the same paper doll as
 * CharacterView) — drawn on a 2D canvas from the textures Phaser has already loaded, with crisp
 * pixels. The character idles and looks around; fire() plays the shot (or swing) with a flash.
 */
import type * as Phaser from 'phaser';
import { WEAPONS } from '@blatkom/shared';
import type { CharacterId, WeaponId } from '@blatkom/shared';
import { GRIPS, MUZZLES, POSE_ANIMS } from '../game/render/rig.gen.js';
import { sfx } from '../game/audio/Sfx.js';

/** World pixels shown across the canvas, and where the body sits (the weapon points right). */
const VIEW = 76;
const BODY_X = -10;
/** Character and weapon atlases hold 2 texels per world px (CharacterView draws them at 0.5). */
const SPRITE_SCALE = 0.5;

type Tm = Phaser.Textures.TextureManager;

export class Doll {
  readonly el: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private character: CharacterId;
  private weapon: WeaponId;
  private laser = false;
  private shotAt = -1e9;
  private raf = 0;
  private detachedSince = 0;
  private pattern: CanvasPattern | null = null;
  private patternKey = '';

  constructor(
    private readonly textures: Tm | null,
    character: CharacterId,
    weapon: WeaponId,
    cssSize = 228,
  ) {
    this.character = character;
    this.weapon = weapon;
    this.el = document.createElement('canvas');
    this.el.className = 'doll';
    this.el.setAttribute('role', 'img');
    const dpr = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
    this.el.width = cssSize * dpr;
    this.el.height = cssSize * dpr;
    this.el.style.width = `${cssSize}px`;
    this.el.style.height = `${cssSize}px`;
    this.ctx = this.el.getContext('2d')!;
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  set(character: CharacterId, weapon: WeaponId, laser = false): void {
    if (character !== this.character || weapon !== this.weapon) this.shotAt = -1e9;
    this.character = character;
    this.weapon = weapon;
    this.laser = laser;
    this.el.setAttribute('aria-label', `${character} · ${weapon}`);
  }

  fire(): void {
    this.shotAt = performance.now();
    const def = WEAPONS[this.weapon];
    sfx.unlock();
    sfx.play(def.sound, { volume: 0.55 });
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private loop(now: number) {
    // the dressing room may be re-rendered: stop once the canvas has left the page
    if (!this.el.isConnected && now > 2000 && this.raf) {
      if (this.detachedSince === 0) this.detachedSince = now;
      if (now - this.detachedSince > 1500) return this.destroy();
    } else this.detachedSince = 0;
    this.draw(now);
    this.raf = requestAnimationFrame(this.loop);
  }

  private frame(texture: string, name: string): Phaser.Textures.Frame | null {
    const tm = this.textures;
    if (!tm || !tm.exists(texture)) return null;
    const tex = tm.get(texture);
    return tex.has(name) ? tex.get(name) : null;
  }

  /** Draws an atlas frame centred (origin 0.5) at x, y (canvas px), rotated, `k` canvas px per texel. */
  private blit(texture: string, name: string, x: number, y: number, rot: number, k: number, alpha = 1) {
    const f = this.frame(texture, name);
    if (!f) return;
    const c = this.ctx;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    c.rotate(rot);
    c.scale(k, k);
    c.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, -f.realWidth / 2 + f.x, -f.realHeight / 2 + f.y, f.cutWidth, f.cutHeight);
    c.restore();
  }

  private floor(): CanvasPattern | null {
    const key = 'floor_concrete_slab';
    if (this.patternKey === key) return this.pattern;
    this.patternKey = key;
    const tm = this.textures;
    if (!tm || !tm.exists(key)) return (this.pattern = null);
    const img = tm.get(key).getSourceImage() as CanvasImageSource;
    this.pattern = this.ctx.createPattern(img, 'repeat');
    return this.pattern;
  }

  private draw(now: number) {
    const c = this.ctx;
    const W = this.el.width;
    const u = W / VIEW; // canvas px per world px
    c.imageSmoothingEnabled = false;
    c.setTransform(1, 0, 0, 1, 0, 0);
    // floor: concrete slabs, a lamp pool, a dark vignette
    const pat = this.floor();
    c.fillStyle = '#1a1714';
    c.fillRect(0, 0, W, W);
    if (pat) {
      c.save();
      c.scale(u * SPRITE_SCALE, u * SPRITE_SCALE);
      c.globalAlpha = 0.85;
      c.fillStyle = pat;
      c.fillRect(0, 0, W / (u * SPRITE_SCALE), W / (u * SPRITE_SCALE));
      c.restore();
    }
    const glow = c.createRadialGradient(W * 0.45, W * 0.45, W * 0.05, W * 0.5, W * 0.5, W * 0.72);
    glow.addColorStop(0, 'rgba(255,190,110,0.16)');
    glow.addColorStop(0.55, 'rgba(0,0,0,0.12)');
    glow.addColorStop(1, 'rgba(0,0,0,0.78)');
    c.fillStyle = glow;
    c.fillRect(0, 0, W, W);

    const def = WEAPONS[this.weapon];
    const pose = def.pose;
    const melee = def.kind === 'melee';
    // looking around a little while idle
    const aim = -0.32 + Math.sin(now / 1900) * 0.16;
    const since = now - this.shotAt;
    const anims = POSE_ANIMS[pose];
    let anim = 'idle';
    let fi = Math.floor(now / 500) % 2;
    if (melee && since < 240) {
      anim = 'swing';
      const n = anims.find(([a]) => a === 'swing')?.[1] ?? 5;
      fi = Math.min(n - 1, Math.floor(since / (240 / n)));
    } else if (!melee && since < 110) {
      anim = 'shoot';
      const n = anims.find(([a]) => a === 'shoot')?.[1] ?? 3;
      fi = Math.min(n - 1, Math.floor(since / 33));
    }
    const ch = this.character;
    const cx = W / 2 + BODY_X * u * Math.cos(aim);
    const cy = W / 2 + 6 * u + BODY_X * u * Math.sin(aim);
    const k = u * SPRITE_SCALE;
    // legs, weapon (under the arms), torso — no drop shadow (it read as a dark square behind the character)
    this.blit(`char_${ch}`, `${ch}_legs_idle_0`, cx, cy, aim, k);
    const grip = GRIPS[`${pose}_${anim}_${fi}`] ?? GRIPS[`${pose}_idle_0`]!;
    const kick = anim === 'shoot' && fi === 0 ? Math.max(0, def.shake - 0.22) * 5 : 0;
    const cr = Math.cos(aim);
    const sr = Math.sin(aim);
    const gx = grip[0] - kick;
    this.blit('weapons', `w_${this.weapon}`, cx + (cr * gx - sr * grip[1]) * u, cy + (sr * gx + cr * grip[1]) * u, aim + grip[2], k);
    this.blit(`char_${ch}`, `${ch}_${pose}_${anim}_${fi}`, cx, cy, aim, k);
    // laser sight and the muzzle flash
    const m = MUZZLES[this.weapon];
    const mx = cx + (cr * m.forward - sr * m.side) * u;
    const my = cy + (sr * m.forward + cr * m.side) * u;
    if (this.laser && !melee) {
      c.save();
      c.strokeStyle = 'rgba(255,42,26,0.6)';
      c.lineWidth = Math.max(1, u * 0.6);
      c.beginPath();
      c.moveTo(mx, my);
      c.lineTo(mx + cr * W, my + sr * W);
      c.stroke();
      c.restore();
    }
    if (anim === 'shoot' && fi < 2 && def.flash !== 'none' && !def.silenced) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      this.blit('fx', `flash_${def.flash}_${fi % 2}`, mx, my, aim, u * 0.5);
      this.blit('fx', 'glow', mx, my, 0, u * (def.flash === 'obrez' ? 0.9 : 0.6), 0.45);
      c.restore();
    }
  }
}
