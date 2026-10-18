/**
 * Visual for one player: shadow, legs (rotated to movement), torso+weapon (rotated to aim), name tag
 * and health bar. Animation states are driven by session state and events, not random frames.
 */
import * as Phaser from 'phaser';
import { angleDiff } from '@blatkom/shared';
import type { CharacterId, WeaponId } from '@blatkom/shared';
import type { RenderPlayer } from '../session/types.js';
import { D } from './depth.js';

const SCALE = 0.5;
const LOCAL_TAG = '#f2e6c8';
const ENEMY_TAG = '#ffffff';

export class CharacterView {
  readonly slot: number;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly legs: Phaser.GameObjects.Sprite;
  private readonly torso: Phaser.GameObjects.Sprite;
  private readonly label: Phaser.GameObjects.Text;
  private readonly bar: Phaser.GameObjects.Graphics;
  private character: CharacterId;
  private weapon: WeaponId;
  private legAngle = 0;
  private torsoState: 'idle' | 'shoot' | 'reload' | 'hit' | 'swing' = 'idle';
  private reloading = false;
  private flashUntil = 0;
  private redUntil = 0;
  private alive = true;
  private lastStepFrame = -1;
  private smokeAt = 0;
  onFootstep: ((x: number, y: number) => void) | null = null;
  onSmoke: ((x: number, y: number) => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    p: RenderPlayer,
  ) {
    this.slot = p.slot;
    this.character = p.character;
    this.weapon = p.weapon;
    this.shadow = scene.add.image(p.x, p.y, 'fx', 'shadow').setScale(0.6, 0.48).setAlpha(0.55).setDepth(D.CHAR_SHADOW);
    this.legs = scene.add.sprite(p.x, p.y, `char_${p.character}`, `${p.character}_legs_idle_0`).setScale(SCALE).setDepth(D.LEGS);
    this.torso = scene.add.sprite(p.x, p.y, `char_${p.character}`, `${p.character}_${p.weapon}_idle_0`).setScale(SCALE).setDepth(D.TORSO + p.slot * 0.01);
    this.label = scene.add
      .text(p.x, p.y - 25, p.name, { fontFamily: 'Oswald, sans-serif', fontSize: '8px', fontStyle: '500', color: p.isLocal ? LOCAL_TAG : ENEMY_TAG, stroke: '#0b0908', strokeThickness: 2.5, resolution: 4 })
      .setOrigin(0.5, 1)
      .setDepth(D.LABEL);
    this.bar = scene.add.graphics().setDepth(D.LABEL);
    this.torso.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      if (this.torsoState !== 'reload' || !this.reloading) this.playIdle();
    });
    this.legAngle = p.aim;
    this.playIdle();
  }

  private key(anim: string) {
    return `${this.character}_${this.weapon}_${anim}`;
  }

  private playIdle() {
    this.torsoState = 'idle';
    this.torso.play({ key: this.key('idle'), startFrame: Math.floor(Math.random() * 2) }, true);
  }

  onShot(weapon: WeaponId): void {
    if (weapon !== this.weapon) this.setWeapon(weapon);
    if (this.reloading) return;
    if (weapon === 'montirovka') {
      this.torsoState = 'swing';
      this.torso.play(this.key('swing'), false);
    } else {
      this.torsoState = 'shoot';
      this.torso.play(this.key('shoot'), false);
    }
  }

  onHit(now: number): void {
    this.flashUntil = now + 55;
    this.redUntil = now + 180;
    if (this.torsoState === 'idle') {
      this.torsoState = 'hit';
      this.torso.play(this.key('hit'), false);
    }
  }

  private setWeapon(w: WeaponId) {
    this.weapon = w;
    this.reloading = false;
    this.playIdle();
  }

  setCharacter(c: CharacterId): void {
    if (c === this.character) return;
    this.character = c;
    this.legs.setTexture(`char_${c}`, `${c}_legs_idle_0`);
    this.torso.setTexture(`char_${c}`, `${c}_${this.weapon}_idle_0`);
    this.playIdle();
  }

  update(p: RenderPlayer, now: number, dtMs: number): void {
    if (p.character !== this.character) this.setCharacter(p.character);
    const visible = p.alive;
    if (visible !== this.alive) {
      this.alive = visible;
      for (const o of [this.shadow, this.legs, this.torso, this.label, this.bar]) o.setVisible(visible);
      if (visible) this.playIdle();
    }
    if (!visible) return;
    if (p.weapon !== this.weapon) this.setWeapon(p.weapon);
    // reload state
    if (p.reloading && !this.reloading && p.weapon !== 'montirovka') {
      this.reloading = true;
      this.torsoState = 'reload';
      this.torso.play(this.key('reload'), false);
    } else if (!p.reloading && this.reloading) {
      this.reloading = false;
      if (this.torsoState === 'reload') this.playIdle();
    }

    // legs: rotate toward movement, pick walk/run by speed
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    const k = Math.min(1, dtMs / 70);
    if (speed > 6) {
      const target = Math.atan2(p.vy, p.vx);
      // legs never twist more than 100° from the torso: walk backwards instead
      let goal = target;
      if (Math.abs(angleDiff(p.aim, target)) > Math.PI * 0.62) goal = target + Math.PI;
      this.legAngle += angleDiff(this.legAngle, goal) * k * 1.6;
      const walk = p.walking || speed < 100;
      const anim = `${this.character}_legs_${walk ? 'walk' : 'run'}`;
      if (this.legs.anims.currentAnim?.key !== anim) this.legs.play(anim, true);
      this.legs.anims.timeScale = Math.max(0.55, Math.min(1.4, speed / (walk ? 72 : 140)));
      const fi = this.legs.anims.currentFrame?.index ?? 0;
      if ((fi === 3 || fi === 7) && fi !== this.lastStepFrame && !walk) this.onFootstep?.(p.x, p.y);
      this.lastStepFrame = fi;
    } else {
      this.legAngle += angleDiff(this.legAngle, p.aim) * k * 0.5;
      const idle = `${this.character}_legs_idle`;
      if (this.legs.anims.currentAnim?.key !== idle) this.legs.play(idle, true);
    }

    // torso bob synced to steps
    const phase = speed > 6 ? ((this.legs.anims.currentFrame?.index ?? 1) - 1) / 8 : 0;
    const bob = speed > 6 ? Math.sin(phase * Math.PI * 4) * Math.min(1, speed / 140) : 0;
    const px = -Math.sin(p.aim) * bob * 0.7;
    const py = Math.cos(p.aim) * bob * 0.7;

    this.legs.setPosition(p.x, p.y).setRotation(this.legAngle);
    this.torso.setPosition(p.x + px, p.y + py).setRotation(p.aim + bob * 0.035);
    this.shadow.setPosition(p.x + 2.5, p.y + 3.5).setRotation(p.aim);

    // hit flash / spawn-protection blink
    if (now < this.flashUntil) {
      this.torso.setTintFill(0xffffff);
      this.legs.setTintFill(0xffffff);
    } else if (now < this.redUntil) {
      this.torso.setTint(0xff8a80);
      this.legs.setTint(0xff8a80);
    } else {
      this.torso.clearTint();
      this.legs.clearTint();
    }
    const blink = p.invulnerable ? (Math.floor(now / 90) % 2 ? 0.45 : 0.9) : 1;
    this.torso.setAlpha(blink);
    this.legs.setAlpha(blink);

    // name + hp
    this.label.setPosition(Math.round(p.x * 2) / 2, Math.round((p.y - 22) * 2) / 2);
    this.bar.clear();
    const w = 20;
    const bx = Math.round(p.x - w / 2);
    const by = Math.round(p.y - 21);
    this.bar.fillStyle(0x0b0908, 0.85).fillRect(bx - 1, by - 1, w + 2, 3.5);
    this.bar.fillStyle(p.isLocal ? 0xd8322a : 0x3d8fd8, 1).fillRect(bx, by, (w * Math.max(0, p.hp)) / 100, 1.5);

    // cigarette smoke for the smokers
    if ((this.character === 'valuta' || this.character === 'mihalych') && now > this.smokeAt) {
      this.smokeAt = now + 380 + Math.random() * 300;
      const off = this.character === 'valuta' ? { f: 9.5, s: 4.5 } : { f: 10.5, s: -4.6 };
      const c = Math.cos(p.aim);
      const s = Math.sin(p.aim);
      this.onSmoke?.(p.x + c * off.f - s * off.s, p.y + s * off.f + c * off.s);
    }
  }

  destroy(): void {
    for (const o of [this.shadow, this.legs, this.torso, this.label, this.bar]) o.destroy();
  }
}

/** Corpse left behind after a kill (plays the fall animation, then fades). */
export function spawnCorpse(scene: Phaser.Scene, c: CharacterId, x: number, y: number, aim: number): Phaser.GameObjects.Sprite {
  const s = scene.add.sprite(x, y, `char_${c}`, `${c}_death_0`).setScale(SCALE).setRotation(aim).setDepth(D.CORPSE);
  s.play(`${c}_death`);
  scene.tweens.add({ targets: s, alpha: 0, delay: 14000, duration: 2500, onComplete: () => s.destroy() });
  return s;
}
