/**
 * Fable cut (the trial build): everything the new picture and sound add to a match, switched as one.
 *
 * On: the light map with shadows, the bloom-and-grade pass, shadows under the characters, the map's ambient
 * life, a camera that kicks with the shot and punches in on a kill, blood on the walls, the place's echo.
 * Off: the match looks and sounds exactly as the main version does.
 *
 * It is all presentation. The session (rules, hits, scores, the protocol) is read, never written: a player
 * on the Fable cut and a player on the classic picture are in the same match with the same information.
 */
import * as Phaser from 'phaser';
import type { CollisionWorld, MapDef } from '@blatkom/shared';
import type { GameSession, RenderPlayer, SessionEvent } from '../session/types.js';
import type { Lighting } from '../render/Lighting.js';
import type { Effects } from '../render/Effects.js';
import type { MapRenderer } from '../render/MapRenderer.js';
import { D } from '../render/depth.js';
import { sfx } from '../audio/Sfx.js';
import { getSettings } from '../../app/settings.js';
import { hudBus } from '../scenes/hudBus.js';
import { toast } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { mapName } from '../../i18n/content.js';
import { modeName } from '../../ui/modes.js';
import { isTouchDevice } from '../input/TouchState.js';
import { FablePipeline } from './FablePipeline.js';
import { Ambient } from './Ambient.js';
import { lookOf } from './looks.js';
import type { MapLook } from './looks.js';
import { TIERS } from './tiers.js';
import type { FableTier } from './tiers.js';

export interface FableWanted {
  on: boolean;
  tier: FableTier;
  /** Pinned by the address bar (screenshots, measurements): the quality never steps down by itself. */
  locked: boolean;
}

/**
 * What the player asked for: the «look» setting, or `?fable=0|fast|balanced|cine` in the address bar (for
 * screenshots and measurements). The Canvas renderer has no shaders: the classic picture only.
 */
export function fableWanted(webgl: boolean): FableWanted {
  if (!webgl) return { on: false, tier: 0, locked: true };
  let q: string | null = null;
  try {
    q = new URLSearchParams(location.search).get('fable');
  } catch {
    /* no address bar */
  }
  if (q === '0' || q === 'off' || q === 'classic') return { on: false, tier: 0, locked: true };
  if (q === 'fast') return { on: true, tier: 0, locked: true };
  if (q === 'balanced') return { on: true, tier: 1, locked: true };
  if (q === 'cine') return { on: true, tier: 2, locked: true };
  const s = getSettings();
  // `?fablelock`: the setting decides (F2 still switches), but the quality is pinned
  return { on: s.look === 'fable', tier: s.fableTier, locked: q !== null || has('fablelock') };
}

function has(param: string): boolean {
  try {
    return new URLSearchParams(location.search).has(param);
  } catch {
    return false;
  }
}

export interface FableDeps {
  map: MapDef;
  session: GameSession;
  lighting: Lighting;
  fx: Effects;
  mapView: MapRenderer;
  collision: CollisionWorld;
  /** The camera's zoom when nothing punches it. */
  zoom: number;
}

const lampTmp = { dx: 0, dy: 0, k: 0 };

export class FableDirector {
  on = false;
  tier: FableTier = 2;
  /** The camera's offset from where it would be: the recoil of the last shots, in world px. */
  readonly cam = { x: 0, y: 0 };
  private kvx = 0;
  private kvy = 0;
  private locked = false;
  private post = true;
  private pipeline: FablePipeline | null = null;
  private readonly look: MapLook;
  private ambient: Ambient | null = null;
  private readonly blobs = new Map<number, Phaser.GameObjects.Image>();
  private punch = 0;
  private glare = 0;
  private damage = 0;
  private fade = 0;
  private ending = false;
  private beatAt = 0;
  private beat = 0;
  private blastUntil = 0;
  private blastMuffle = 0;
  private muffle = 0;
  private streak = 0;
  private streakAt = 0;
  private whizAt = 0;
  private sparks = 0;
  private zoomNow = 1;
  private intro: { t0: number; dur: number; fx: number; fy: number; said: boolean } | null = null;
  private introDone = false;
  private perfFrames = 0;
  private perfStart = 0;
  private slow = 0;
  private told = false;
  private lastTag = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly d: FableDeps,
  ) {
    this.look = lookOf(d.map.id);
  }

  /** Whether the Fable picture's own pass is on the camera (the scene keeps the classic tape pass off then). */
  get posting(): boolean {
    return this.on && this.pipeline !== null;
  }

  /**
   * Brings the match in line with what the player asked for. `userChange`: they just changed it — the
   * quality is theirs now and no longer steps down by itself.
   */
  sync(userChange = false): void {
    const webgl = this.scene.game.renderer.type === Phaser.WEBGL;
    const want = fableWanted(webgl);
    if (userChange || want.locked) this.locked = true;
    const changed = want.on !== this.on || (want.on && want.tier !== this.tier) || (want.on && userChange && !this.post);
    if (changed) {
      this.on = want.on;
      this.tier = want.tier;
      if (userChange) this.post = true;
      this.apply(true);
    }
    if (this.pipeline) this.pipeline.vhs = getSettings().vhs === 0 ? 0 : getSettings().vhs === 1 ? 0.5 : 1;
    this.tag();
  }

  private apply(rebuild: boolean) {
    const { lighting, mapView, fx, map } = this.d;
    const cam = this.scene.cameras.main;
    const cfg = TIERS[this.tier];
    lighting.setFable(this.on ? this.tier : null, this.look, rebuild, this.d.zoom);
    mapView.setDropShadows(this.on ? 0.4 : 1);
    // the picture's pass
    const wantPost = this.on && this.post;
    if (wantPost && !this.pipeline) {
      cam.setPostPipeline(FablePipeline);
      const p = cam.getPostPipeline(FablePipeline);
      this.pipeline = (Array.isArray(p) ? p[0] : p) as FablePipeline;
    } else if (!wantPost && this.pipeline) {
      cam.removePostPipeline(this.pipeline);
      this.pipeline = null;
    }
    if (this.pipeline) {
      this.pipeline.look = this.look;
      this.pipeline.bloomPasses = cfg.bloomPasses;
    }
    // the map's life
    if (rebuild) {
      this.ambient?.destroy();
      this.ambient = null;
    }
    if (this.on && !this.ambient) {
      const shadows = lighting.shadows;
      this.ambient = new Ambient(this.scene, map, this.look, fx, cfg.life, (i) => shadows?.origin(i) ?? map.lights[i]!);
    }
    if (!this.on) {
      for (const b of this.blobs.values()) b.destroy();
      this.blobs.clear();
      this.cam.x = this.cam.y = this.kvx = this.kvy = 0;
      this.setZoom(1);
      sfx.setFable(null);
      sfx.occluded = null;
      fx.onShell = null;
      return;
    }
    // the sound of the place
    sfx.setFable({ reverb: cfg.reverb ? this.look.reverb : null, bed: this.look.bed, rain: this.look.weather === 'rain' });
    sfx.occluded = (x, y) => {
      const me = this.listener;
      return me ? !this.d.collision.lineOfSight(me.x, me.y, x, y) : false;
    };
    fx.onShell = (x, y) => {
      const me = this.listener;
      if (me && Math.hypot(me.x - x, me.y - y) < 170) sfx.play('shell', { x, y, volume: 0.32, rate: 0.9 + Math.random() * 0.3 });
    };
  }

  private listener: { x: number; y: number } | null = null;

  /** The mark at the bottom of the HUD: which picture this is and how to switch it. */
  private tag() {
    const key = isTouchDevice() ? '' : ' · F2';
    const name = this.tier === 2 ? t('CINEMA') : this.tier === 1 ? t('BALANCED') : t('FAST');
    const text = this.on ? `FABLE CUT · ${name}${key}` : `${t('CLASSIC PICTURE')}${key}`;
    if (text === this.lastTag) return;
    this.lastTag = text;
    hudBus.emit('fable-tag', text);
  }

  /** The HUD starts a moment after the match scene: tell it again once it is there. */
  announce(): void {
    this.lastTag = '';
    this.tag();
  }

  private setZoom(k: number) {
    if (Math.abs(k - this.zoomNow) < 0.0005) return;
    this.zoomNow = k;
    this.scene.cameras.main.setZoom(this.d.zoom * k);
  }

  /**
   * The opening: on the countdown the camera glides in to the player from the map's side while the map's
   * name is up. Returns where the camera should be, or null once it is the player's again.
   */
  opening(tx: number, ty: number, time: number, me: RenderPlayer): { x: number; y: number } | null {
    if (!this.on || this.introDone) return null;
    if (!this.intro) {
      const hud = this.d.session.hud();
      if (hud.phase !== 'countdown' || hud.phaseRemainingMs < 1400 || hud.story) {
        this.introDone = true;
        return null;
      }
      const { map } = this.d;
      let dx = map.width / 2 - me.x;
      let dy = map.height / 2 - me.y;
      let dist = Math.hypot(dx, dy);
      if (dist < 80) {
        dx = 0;
        dy = -1;
        dist = 200;
      } else {
        dx /= dist;
        dy /= dist;
      }
      const far = Math.min(dist, 230);
      this.intro = { t0: time, dur: Math.min(2500, hud.phaseRemainingMs - 250), fx: me.x + dx * far, fy: me.y + dy * far, said: false };
    }
    const it = this.intro;
    const p = (time - it.t0) / it.dur;
    if (!it.said && time - it.t0 > 200) {
      it.said = true;
      hudBus.emit('fable-banner', { title: mapName(this.d.map.id).toUpperCase(), sub: modeName(this.d.session.gameMode), good: null, ms: it.dur + 500 });
      this.announce();
    }
    if (p >= 1) {
      this.introDone = true;
      this.intro = null;
      return null;
    }
    // a held breath, then in
    const q = Math.max(0, (p - 0.1) / 0.9);
    const e = q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
    return { x: it.fx + (tx - it.fx) * e, y: it.fy + (ty - it.fy) * e };
  }

  update(time: number, dtMs: number, players: RenderPlayer[], me: RenderPlayer | null, hidden: ReadonlySet<number>, paused: boolean): void {
    if (!this.on) return;
    const dt = Math.min(0.05, dtMs / 1000);
    const { lighting, session } = this.d;
    this.listener = me;
    this.sparks = 0;
    if (!this.introDone && !this.intro && time > 400) this.announce();

    // the recoil: a spring that brings the camera back
    const K = 260;
    const C = 30;
    this.kvx += (-K * this.cam.x - C * this.kvx) * dt;
    this.kvy += (-K * this.cam.y - C * this.kvy) * dt;
    this.cam.x += this.kvx * dt;
    this.cam.y += this.kvy * dt;
    const len = Math.hypot(this.cam.x, this.cam.y);
    if (len > 11) {
      this.cam.x *= 11 / len;
      this.cam.y *= 11 / len;
    }
    if (len < 0.02 && Math.hypot(this.kvx, this.kvy) < 0.5) this.cam.x = this.cam.y = this.kvx = this.kvy = 0;

    // a kill punches the camera in; the match's end draws it in slowly
    this.punch = Math.max(0, this.punch - dt / 0.24);
    this.glare = Math.max(0, this.glare - dt / 0.5);
    this.damage = Math.max(0, this.damage - dt / 0.4);
    if (this.ending) this.fade = Math.min(1, this.fade + dt / 1.1);
    const p = this.punch;
    this.setZoom(1 + 0.03 * p * p * (3 - 2 * p) + 0.055 * this.fade * this.fade * (3 - 2 * this.fade));

    // nearly dead: the heart, the colour draining, the world going dull
    let low = 0;
    if (me && me.alive && me.hp < 35 && session.phase() === 'active') {
      low = 1 - me.hp / 35;
      if (time >= this.beatAt) {
        this.beatAt = time + 520 + (me.hp / 35) * 380;
        this.beat = 1;
        if (!paused) sfx.play('heart', { volume: 0.45 + 0.4 * low });
      }
    }
    this.beat = Math.max(0, this.beat - dt / 0.35);
    const dead = me && !me.alive ? 0.55 : 0;
    const blast = time < this.blastUntil ? this.blastMuffle * Math.min(1, (this.blastUntil - time) / 500) : 0;
    const muffle = Math.max(low * 0.55, dead, blast, this.fade * 0.6);
    if (Math.abs(muffle - this.muffle) > 0.02) {
      // it closes in at once and lets go slowly
      sfx.setMuffle(muffle, muffle > this.muffle ? 0.03 : 0.2);
      this.muffle = muffle;
    }

    const pl = this.pipeline;
    if (pl) {
      pl.damage = this.damage;
      pl.lowHp = low > 0 ? low * (0.55 + 0.45 * this.beat) : 0;
      pl.kick = Math.max(p, Math.min(1, this.glare));
      pl.glare = this.glare * 0.9;
      pl.fade = this.fade;
    }

    // a shadow under everyone, thrown away from the lamps that reach them
    const shadows = lighting.shadows;
    const seen = this.blobSeen;
    seen.clear();
    if (shadows && lighting.enabled) {
      for (const q of players) {
        if (!q.alive || hidden.has(q.slot)) continue;
        seen.add(q.slot);
        let img = this.blobs.get(q.slot);
        if (!img) {
          img = this.scene.add.image(q.x, q.y, 'fx', 'glow').setTintFill(0x000000).setDepth(D.CHAR_SHADOW);
          this.blobs.set(q.slot, img);
        }
        const L = shadows.lampAt(q.x, q.y, lighting.flick, lampTmp);
        const dl = Math.hypot(L.dx, L.dy);
        img
          .setVisible(true)
          .setPosition(q.x + L.dx * 9, q.y + 2 + L.dy * 9)
          .setRotation(dl > 0.02 ? Math.atan2(L.dy, L.dx) : 0)
          .setScale(0.4 * (1 + dl * 0.9), 0.3)
          .setAlpha(0.34 + 0.3 * L.k);
      }
    }
    for (const [slot, img] of this.blobs) if (!seen.has(slot)) img.setVisible(false);

    this.ambient?.update(this.scene.cameras.main.worldView, dtMs, time, lighting.flick);
    this.watch(paused);
  }

  private readonly blobSeen = new Set<number>();

  /** Below ~38 frames a second for four seconds: the quality steps down once, and says so the first time. */
  private watch(paused: boolean) {
    if (this.locked) return;
    const now = performance.now();
    if (!this.perfStart) this.perfStart = now;
    this.perfFrames++;
    const span = now - this.perfStart;
    if (span < 1000) return;
    const fps = (this.perfFrames * 1000) / span;
    this.perfFrames = 0;
    this.perfStart = now;
    this.slow = fps < 38 && !paused ? this.slow + 1 : 0;
    if (this.slow < 4) return;
    this.slow = 0;
    if (this.tier > 0) this.tier = (this.tier - 1) as FableTier;
    else if (this.post) this.post = false;
    else {
      this.locked = true;
      return;
    }
    this.apply(false);
    this.tag();
    if (!this.told) {
      this.told = true;
      toast(t('The picture was made simpler to keep things smooth — change it in the settings'));
    }
  }

  /** The local player was hit (0–1). */
  hurt(amount: number): void {
    if (this.on) this.damage = Math.min(1, this.damage + amount);
  }

  /** A shot by the local player: the camera kicks back along the barrel. */
  recoil(aim: number, strength: number): void {
    if (!this.on || !getSettings().shake) return;
    const j = (1.1 + strength * 5.5) * 40;
    this.kvx -= Math.cos(aim) * j;
    this.kvy -= Math.sin(aim) * j;
  }

  /** Someone else's shot: a bullet that passes close hisses by. */
  whiz(e: Extract<SessionEvent, { t: 'shot' }>, me: RenderPlayer | null, time: number): void {
    if (!this.on || !me || !me.alive || time < this.whizAt) return;
    for (const pl of e.pellets) {
      const dx = Math.cos(pl.angle);
      const dy = Math.sin(pl.angle);
      const along = (me.x - e.ox) * dx + (me.y - e.oy) * dy;
      if (along < 50 || along > pl.dist - 6) continue;
      const side = (me.x - e.ox) * dy - (me.y - e.oy) * dx;
      const miss = Math.abs(side);
      if (miss < 9 || miss > 30) continue;
      this.whizAt = time + 110;
      sfx.play('whiz', { x: me.x - dy * Math.sign(side) * 60, y: me.y + dx * Math.sign(side) * 60, volume: 0.75, rate: 0.9 + Math.random() * 0.3 });
      return;
    }
  }

  /** A bullet met a wall: sparks that carry, and their light. */
  impact(x: number, y: number, angle: number, time: number): void {
    if (!this.on || this.sparks >= 5) return;
    this.sparks++;
    this.d.fx.sparkBurst(x, y, angle, 3);
    this.d.lighting.flash(x, y, 44, 0xffc870, 0.55, 80, time);
  }

  /** Someone was hit: a red haze, and blood on the wall behind them if there is one. */
  blood(x: number, y: number, a: number, amount: number): void {
    if (!this.on) return;
    this.d.fx.bloodMist(x, y, a);
    this.splat(x, y, a, 54, amount > 30);
  }

  private splat(x: number, y: number, a: number, reach: number, big: boolean) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const hit = this.d.collision.raycast(x, y, dx, dy, reach, 'shot');
    if (!hit) return;
    const s = this.d.collision.shapes[hit.shape];
    if (!s || s.source === 'bounds') return;
    // on the wall's top, just past its edge, lying along the wall
    this.d.fx.wallBlood(x + dx * (hit.t + 3.5), y + dy * (hit.t + 3.5), Math.atan2(hit.nx, -hit.ny) + (Math.random() - 0.5) * 0.5, big);
  }

  /**
   * An elimination. The body is knocked along the shot; the wall behind takes more blood; the local player's
   * own kill punches the camera in, and a run of them is called out.
   */
  kill(victim: RenderPlayer, killer: RenderPlayer | undefined, corpse: Phaser.GameObjects.Sprite | null, time: number): void {
    if (!this.on) return;
    const a = killer ? Math.atan2(victim.y - killer.y, victim.x - killer.x) : Math.random() * 6.28;
    for (let i = 0; i < 3; i++) this.splat(victim.x, victim.y, a + (i - 1) * 0.42, 84, true);
    if (corpse) {
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const hit = this.d.collision.raycast(victim.x, victim.y, dx, dy, 22, 'move');
      const slide = Math.max(0, Math.min(11, (hit ? hit.t : 22) - 9));
      if (slide > 1) this.scene.tweens.add({ targets: corpse, x: victim.x + dx * slide, y: victim.y + dy * slide, duration: 240, ease: 'Cubic.easeOut' });
    }
    if (!killer?.isLocal) return;
    if (getSettings().shake) this.punch = 1;
    sfx.play('thump', { volume: 0.75 });
    this.streak = time - this.streakAt < 4500 ? this.streak + 1 : 1;
    this.streakAt = time;
    if (this.streak >= 2) {
      const title = this.streak === 2 ? t('DOUBLE!') : this.streak === 3 ? t('TRIPLE!') : t('NO MERCY!');
      hudBus.emit('fable-banner', { title, sub: null, good: true, ms: 1700 });
    }
  }

  /** A blast: glare if it is on screen, and for a moment the world heard through cotton wool if it is close. */
  blast(x: number, y: number, me: RenderPlayer | null, time: number, flashbang = false): void {
    if (!this.on) return;
    const d = me ? Math.hypot(me.x - x, me.y - y) : 9999;
    const reach = flashbang ? 320 : 200;
    if (d < 420) this.glare = Math.max(this.glare, (flashbang ? 1.4 : 0.8) * (1 - d / 420));
    if (me?.alive && d < reach) {
      this.blastMuffle = (flashbang ? 0.9 : 0.75) * (1 - (d / reach) * 0.5);
      this.blastUntil = time + (flashbang ? 1900 : 900);
    }
  }

  /** The match is over: the colour drains and the camera draws in. */
  finish(): void {
    if (this.on) this.ending = true;
  }

  destroy(): void {
    this.ambient?.destroy();
    this.ambient = null;
    for (const b of this.blobs.values()) b.destroy();
    this.blobs.clear();
    this.pipeline = null;
    sfx.setFable(null);
    sfx.occluded = null;
    this.d.fx.onShell = null;
    hudBus.emit('fable-tag', null);
  }
}
