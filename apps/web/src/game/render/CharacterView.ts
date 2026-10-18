/**
 * Visual for one player: shadow, legs (rotated to movement), torso (rotated to aim) with the weapon
 * sprite attached at the torso frame's grip (paper doll, see rig.gen.ts), name tag and health bar.
 * Animation states are driven by session state and events, not random frames.
 */
import * as Phaser from 'phaser';
import { angleDiff, WEAPONS } from '@blatkom/shared';
import type { CharacterId, WeaponId } from '@blatkom/shared';
import type { RenderPlayer } from '../session/types.js';
import { D } from './depth.js';
import { GRIPS } from './rig.gen.js';

const SCALE = 0.5;
/** Tip of the cigarette / cigar / pipe in body space (forward, side; world px), from the rigs. */
const SMOKERS: Partial<Record<CharacterId, { f: number; s: number }>> = {
  valuta: { f: 9.5, s: 4.5 },
  mihalych: { f: 10.5, s: -4.6 },
  akula: { f: 10.4, s: 4.9 },
  varan: { f: 10.3, s: 4.6 },
  leopard: { f: 8.2, s: -3.8 },
  slon: { f: 9.5, s: -4.7 },
  lobster: { f: 9.1, s: 4.0 },
  popugay: { f: 8.9, s: 4.5 },
};
const LOCAL_TAG = '#f2e6c8';
const ENEMY_TAG = '#ffffff';

export class CharacterView {
  readonly slot: number;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly legs: Phaser.GameObjects.Sprite;
  private readonly torso: Phaser.GameObjects.Sprite;
  /** Weapon in hand (atlas «weapons», origin = grip). */
  private readonly gun: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  /** Level badge left of the health bar (gold plate with the number). */
  private readonly levelTag: Phaser.GameObjects.Text;
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
  private kickUntil = 0;
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
    this.torso = scene.add.sprite(p.x, p.y, `char_${p.character}`, `${p.character}_${WEAPONS[p.weapon].pose}_idle_0`).setScale(SCALE).setDepth(D.TORSO + p.slot * 0.01);
    this.gun = scene.add.image(p.x, p.y, 'weapons', `w_${p.weapon}`).setScale(SCALE).setDepth(D.TORSO + p.slot * 0.01 - 0.004);
    this.label = scene.add
      .text(p.x, p.y - 25, p.name, { fontFamily: 'Oswald, sans-serif', fontSize: '8px', fontStyle: '500', color: p.isLocal ? LOCAL_TAG : ENEMY_TAG, stroke: '#0b0908', strokeThickness: 2.5, resolution: 4 })
      .setOrigin(0.5, 1)
      .setDepth(D.LABEL);
    this.levelTag = scene.add
      .text(p.x, p.y, '', { fontFamily: 'Oswald, sans-serif', fontSize: '7px', fontStyle: '700', color: '#1a1410', resolution: 4 })
      .setOrigin(0.5, 0.5)
      .setDepth(D.LABEL + 0.01);
    this.bar = scene.add.graphics().setDepth(D.LABEL);
    this.torso.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      if (this.torsoState !== 'reload' || !this.reloading) this.playIdle();
    });
    this.legAngle = p.aim;
    this.playIdle();
  }

  private key(anim: string) {
    return `${this.character}_${WEAPONS[this.weapon].pose}_${anim}`;
  }

  private playIdle() {
    this.torsoState = 'idle';
    this.torso.play({ key: this.key('idle'), startFrame: Math.floor(Math.random() * 2) }, true);
  }

  onShot(weapon: WeaponId, now = 0): void {
    if (weapon !== this.weapon) this.setWeapon(weapon);
    if (this.reloading) return;
    if (WEAPONS[weapon].kind === 'melee') {
      this.torsoState = 'swing';
      this.torso.play(this.key('swing'), false);
    } else {
      this.torsoState = 'shoot';
      this.torso.play(this.key('shoot'), false);
      // heavy hitters (shotguns, launchers, rifles) kick the weapon back a little further
      this.kickUntil = now + 70;
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
    this.gun.setFrame(`w_${w}`);
    this.playIdle();
  }

  setCharacter(c: CharacterId): void {
    if (c === this.character) return;
    this.character = c;
    this.legs.setTexture(`char_${c}`, `${c}_legs_idle_0`);
    this.torso.setTexture(`char_${c}`, `${c}_${WEAPONS[this.weapon].pose}_idle_0`);
    this.playIdle();
  }

  /** `concealed`: an opponent inside a smoke cloud — no name tag or health bar gives them away. */
  update(p: RenderPlayer, now: number, dtMs: number, concealed = false): void {
    if (p.character !== this.character) this.setCharacter(p.character);
    const visible = p.alive;
    if (visible !== this.alive) {
      this.alive = visible;
      for (const o of [this.shadow, this.legs, this.torso, this.gun, this.label, this.levelTag, this.bar]) o.setVisible(visible);
      if (visible) this.playIdle();
    }
    if (!visible) return;
    if (p.weapon !== this.weapon) this.setWeapon(p.weapon);
    // reload state
    if (p.reloading && !this.reloading && WEAPONS[p.weapon].kind !== 'melee') {
      this.reloading = true;
      this.torsoState = 'reload';
      // the six reload frames span the weapon's reload time
      this.torso.play({ key: this.key('reload'), frameRate: 6 / (WEAPONS[p.weapon].reloadMs / 1000) }, false);
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
    const rot = p.aim + bob * 0.035;
    this.torso.setPosition(p.x + px, p.y + py).setRotation(rot);
    this.shadow.setPosition(p.x + 2.5, p.y + 3.5).setRotation(p.aim);
    // weapon at the grip of the current torso frame
    const frameName = String(this.torso.frame.name);
    const grip = GRIPS[frameName.slice(this.character.length + 1)] ?? GRIPS[`${WEAPONS[this.weapon].pose}_idle_0`]!;
    const kick = now < this.kickUntil ? Math.max(0, WEAPONS[this.weapon].shake - 0.22) * 5 : 0;
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const gx = grip[0] - kick;
    this.gun.setPosition(p.x + px + cr * gx - sr * grip[1], p.y + py + sr * gx + cr * grip[1]).setRotation(rot + grip[2]);

    // hit flash / spawn-protection blink
    if (now < this.flashUntil) {
      this.torso.setTintFill(0xffffff);
      this.legs.setTintFill(0xffffff);
      this.gun.setTintFill(0xffffff);
    } else if (now < this.redUntil) {
      this.torso.setTint(0xff8a80);
      this.legs.setTint(0xff8a80);
      this.gun.setTint(0xff8a80);
    } else {
      this.torso.clearTint();
      this.legs.clearTint();
      this.gun.clearTint();
    }
    const blink = p.invulnerable ? (Math.floor(now / 90) % 2 ? 0.45 : 0.9) : 1;
    this.torso.setAlpha(blink);
    this.legs.setAlpha(blink);
    this.gun.setAlpha(blink);

    // name + level badge + hp (the roster/nickname can change after the view was created)
    if (this.label.text !== p.name) this.label.setText(p.name);
    this.label.setPosition(Math.round(p.x * 2) / 2, Math.round((p.y - 22) * 2) / 2);
    this.bar.clear();
    const w = 20;
    const bx = Math.round(p.x - w / 2);
    const by = Math.round(p.y - 21);
    this.bar.fillStyle(0x0b0908, 0.85).fillRect(bx - 1, by - 1, w + 2, 3.5);
    this.bar.fillStyle(p.isLocal ? 0xd8322a : 0x3d8fd8, 1).fillRect(bx, by, (w * Math.max(0, p.hp)) / 100, 1.5);
    const lvl = p.level === null ? '' : String(p.level);
    if (this.levelTag.text !== lvl) this.levelTag.setText(lvl);
    if (lvl) {
      const lw = Math.max(7, Math.ceil(this.levelTag.width) + 2);
      this.bar.fillStyle(0x0b0908, 0.9).fillRect(bx - lw - 3, by - 3.5, lw + 2, 9);
      this.bar.fillStyle(0xd9b45a, 1).fillRect(bx - lw - 2, by - 2.5, lw, 7);
      this.levelTag.setPosition(bx - 2 - lw / 2, by + 1).setVisible(true);
    } else this.levelTag.setVisible(false);

    this.label.setVisible(!concealed);
    this.bar.setVisible(!concealed);
    if (concealed) this.levelTag.setVisible(false);

    // cigarette, cigar and pipe smoke for the smokers
    const off = SMOKERS[this.character];
    if (off && now > this.smokeAt && !concealed) {
      this.smokeAt = now + 380 + Math.random() * 300;
      const c = Math.cos(p.aim);
      const s = Math.sin(p.aim);
      this.onSmoke?.(p.x + c * off.f - s * off.s, p.y + s * off.f + c * off.s);
    }
  }

  destroy(): void {
    for (const o of [this.shadow, this.legs, this.torso, this.gun, this.label, this.levelTag, this.bar]) o.destroy();
  }
}

/** Corpse left behind after a kill (plays the fall animation, then fades). */
export function spawnCorpse(scene: Phaser.Scene, c: CharacterId, x: number, y: number, aim: number): Phaser.GameObjects.Sprite {
  const s = scene.add.sprite(x, y, `char_${c}`, `${c}_death_0`).setScale(SCALE).setRotation(aim).setDepth(D.CORPSE);
  s.play(`${c}_death`);
  scene.tweens.add({ targets: s, alpha: 0, delay: 14000, duration: 2500, onComplete: () => s.destroy() });
  return s;
}
