/**
 * Fable cut: the match's picture and sound — the light map with shadows, the bloom-and-grade pass, shadows
 * under the characters, the map's ambient life, a camera that kicks with the shot and punches in on a kill,
 * blood on the walls, the place's echo.
 *
 * v0.2.26 (the owner: «сделай тогда просто FableCut главный… убери предыдущую»): it began as a trial build beside
 * the main version and is now the game's only picture — no switch, no key, no mark on the screen. What a
 * player chooses is how much of it their device draws (the quality), and a device that cannot keep up is
 * taken down the ladder by the game itself (watch.ts). The plain light map of the versions before is kept
 * for one case only: a browser that cannot draw this one (no WebGL, a driver that refuses the shaders).
 *
 * It is all presentation. The session (rules, hits, scores, the protocol) is read, never written: two
 * players on different qualities are in the same match with the same information.
 */
import * as Phaser from 'phaser';
import type { CollisionWorld, MapDef } from '@blatkom/shared';
import type { GameSession, RenderPlayer, SessionEvent } from '../session/types.js';
import type { Lighting } from '../render/Lighting.js';
import type { Effects } from '../render/Effects.js';
import type { MapRenderer } from '../render/MapRenderer.js';
import { D } from '../render/depth.js';
import { sfx } from '../audio/Sfx.js';
import { getSettings, updateSettings } from '../../app/settings.js';
import { hudBus } from '../scenes/hudBus.js';
import { toast } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { FablePipeline } from './FablePipeline.js';
import { Ambient } from './Ambient.js';
import { lookOf } from './looks.js';
import type { MapLook } from './looks.js';
import { TIERS } from './tiers.js';
import type { FableTier } from './tiers.js';
import { LOWEST, PerfWatch, qualityOf, stepDown } from './watch.js';
import type { QualityLevel } from './watch.js';

export interface FableWanted {
  on: boolean;
  /** The step of the quality ladder asked for. */
  level: QualityLevel;
  /**
   * Pinned — by the player in the settings, or by the address bar (screenshots, measurements): the game does
   * not lower it by itself.
   */
  locked: boolean;
}

/**
 * What is asked for: the «quality» setting. The address bar can pin it for screenshots and measurements —
 * `?fable=fast|balanced|cine`, or `?fablelock` (the setting's own, never lowered); `?fable=0` is the plain
 * light map of the versions before, for telling a fault of the picture from a fault of the driver. The
 * Canvas renderer has no shaders: the plain light map only.
 */
export function fableWanted(webgl: boolean): FableWanted {
  if (!webgl) return { on: false, level: 0, locked: true };
  let q: string | null = null;
  try {
    q = new URLSearchParams(location.search).get('fable');
  } catch {
    /* no address bar */
  }
  if (q === '0' || q === 'off' || q === 'classic') return { on: false, level: 0, locked: true };
  if (q === 'fast') return { on: true, level: 0, locked: true };
  if (q === 'balanced') return { on: true, level: 1, locked: true };
  if (q === 'cine') return { on: true, level: 2, locked: true };
  const s = getSettings();
  return { on: true, level: qualityOf(s.quality, 1), locked: s.qualityPicked === true || q !== null || has('fablelock') };
}

function has(param: string): boolean {
  try {
    return new URLSearchParams(location.search).has(param);
  } catch {
    return false;
  }
}

let software: boolean | null = null;
/** Whether WebGL is drawn by the processor (SwiftShader, llvmpipe…): every full-screen pass is dear there. */
function softwareRenderer(game: Phaser.Game): boolean {
  if (software !== null) return software;
  software = false;
  try {
    const gl = (game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch {
    /* unknown: treated as a real one */
  }
  return software;
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
  /** Where on the quality ladder the match is now (lower than what was asked for once the game stepped down). */
  level: QualityLevel = 2;
  /** The camera's offset from where it would be: the recoil of the last shots, in world px. */
  readonly cam = { x: 0, y: 0 };
  private kvx = 0;
  private kvy = 0;
  private locked = false;
  /** The driver refused the finish pass's shaders: the picture goes on without it. */
  private noPass = false;
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
  private intro: { rem0: number; fx: number; fy: number } | null = null;
  private introDone = false;
  private readonly perf = new PerfWatch();
  private told = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly d: FableDeps,
  ) {
    this.look = lookOf(d.map.id);
  }

  /** The quality tier drawn now: «Кино», «Баланс» or «Быстро» (the ladder's lowest step is «Быстро» too). */
  get tier(): FableTier {
    return this.level < 0 ? 0 : (this.level as FableTier);
  }

  /** Whether the picture's finish pass is on the camera (the scene keeps the plain tape pass off then). */
  get posting(): boolean {
    return this.on && this.pipeline !== null;
  }

  /**
   * Brings the match in line with the settings: called at the match's start and whenever a setting changes.
   * The quality is re-made only when it really is another one — the volume or the language changing does not
   * bake the lamps again, and neither does the game's own step down (it has applied itself already).
   */
  sync(): void {
    const webgl = this.scene.game.renderer.type === Phaser.WEBGL;
    const want = fableWanted(webgl);
    // a software renderer (no graphics card behind the browser) starts on the lowest step — every full-screen
    // pass is the processor's work there — unless a quality was asked for by name
    const level = want.on && !want.locked && softwareRenderer(this.scene.game) ? LOWEST : want.level;
    const first = !this.synced;
    this.synced = true;
    this.locked = want.locked;
    if (first || want.on !== this.on || level !== this.level) {
      this.on = want.on;
      this.level = level;
      this.apply(true);
    }
    if (this.pipeline) this.pipeline.vhs = getSettings().vhs === 0 ? 0 : getSettings().vhs === 1 ? 0.5 : 1;
  }

  private synced = false;

  private apply(rebuild: boolean) {
    const { lighting, mapView, fx, map } = this.d;
    const cam = this.scene.cameras.main;
    const cfg = TIERS[this.tier];
    lighting.setFable(this.on ? this.tier : null, this.look, rebuild, this.d.zoom);
    mapView.setDropShadows(this.on ? 0.4 : 1);
    // the picture's finish pass (the ladder's lowest step goes without it)
    const wantPost = this.on && this.level >= 0 && !this.noPass;
    if (wantPost && !this.pipeline) {
      try {
        cam.setPostPipeline(FablePipeline);
        const p = cam.getPostPipeline(FablePipeline);
        this.pipeline = ((Array.isArray(p) ? p[0] : p) as FablePipeline | undefined) ?? null;
      } catch (e) {
        // a graphics driver that will not take the shaders: the picture goes on without its finish pass
        console.warn('[fable] the picture pass is unavailable', e);
        this.pipeline = null;
      }
      if (!this.pipeline) this.noPass = true;
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

  private setZoom(k: number) {
    // at rest the zoom is exactly the scene's own: pixel art shimmers at 2.0001
    if (Math.abs(k - 1) < 0.0005) k = 1;
    if (k === this.zoomNow || (k !== 1 && Math.abs(k - this.zoomNow) < 0.0005)) return;
    this.zoomNow = k;
    this.scene.cameras.main.setZoom(this.d.zoom * k);
  }

  /**
   * The opening: on the countdown the camera glides in to the player from the map's side while the map's
   * name is up. Returns where the camera should be, or null once it is the player's again.
   */
  opening(tx: number, ty: number, me: RenderPlayer): { x: number; y: number } | null {
    if (!this.on || this.introDone) return null;
    const hud = this.d.session.hud();
    if (!this.intro) {
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
      this.intro = { rem0: hud.phaseRemainingMs, fx: me.x + dx * far, fy: me.y + dy * far };
    }
    const it = this.intro;
    // the match's own countdown is the clock: a slow first frame (the map being built) does not eat the pan
    // (the loading screen has just named the map and the mode: the pan needs no title of its own)
    const p = hud.phase === 'countdown' ? (it.rem0 - hud.phaseRemainingMs) / Math.max(1, it.rem0 - 300) : 1;
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
    // real time, so a slow frame does not slow the spring or the fades (a stall is not replayed)
    const dt = Math.min(0.25, dtMs / 1000);
    const { lighting, session } = this.d;
    this.listener = me;
    this.sparks = 0;

    // the recoil: a spring that brings the camera back (small steps keep it stable on a slow frame)
    const K = 260;
    const C = 30;
    const sub = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      this.kvx += (-K * this.cam.x - C * this.kvx) * h;
      this.kvy += (-K * this.cam.y - C * this.kvy) * h;
      this.cam.x += this.kvx * h;
      this.cam.y += this.kvy * h;
    }
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
        if (!paused) sfx.play('heart', { volume: 0.28 + 0.3 * low });
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

    // footprints: a print every stride walked (in the snow; in blood after a walk through it)
    if (this.ambient) {
      for (const q of players) {
        if (!q.alive) {
          this.strides.delete(q.slot);
          continue;
        }
        const last = this.strides.get(q.slot);
        if (!last) {
          this.strides.set(q.slot, { x: q.x, y: q.y });
          continue;
        }
        const dx = q.x - last.x;
        const dy = q.y - last.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 81) continue;
        last.x = q.x;
        last.y = q.y;
        // a respawn or a correction from the server is not a stride
        if (d2 < 3600) this.ambient.step(q.slot, q.x, q.y, Math.atan2(dy, dx), time);
      }
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
  /** Where each player's last footprint was left. */
  private readonly strides = new Map<number, { x: number; y: number }>();

  /**
   * A device that cannot keep up (watch.ts: under ~38 frames a second for four seconds in a row) goes one
   * step down the ladder, and the step is remembered: the next match starts there. It is the game's step, not
   * the player's choice — it can go lower still; a quality the player picked in the settings is never touched.
   */
  private watch(paused: boolean) {
    if (this.locked) return;
    if (!this.perf.frame(performance.now(), paused)) return;
    const next = stepDown(this.level);
    // nothing left to give up (the lowest step, or «Быстро» on a driver that never took the finish pass)
    if (next === null || (next === LOWEST && !this.pipeline)) {
      this.locked = true;
      return;
    }
    this.level = next;
    // what is baked stays as it was made; what is drawn every frame gets cheaper at once
    this.apply(false);
    // (the settings tell the match they changed: `sync` finds the level already there and re-makes nothing)
    updateSettings({ quality: next });
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
    const j = (1.2 + strength * 6) * 52;
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
    this.ambient?.pool(victim.x, victim.y, time);
    if (corpse) {
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const hit = this.d.collision.raycast(victim.x, victim.y, dx, dy, 22, 'move');
      const slide = Math.max(0, Math.min(11, (hit ? hit.t : 22) - 9));
      if (slide > 1) this.scene.tweens.add({ targets: corpse, x: victim.x + dx * slide, y: victim.y + dy * slide, duration: 240, ease: 'Cubic.easeOut' });
    }
    if (!killer?.isLocal) return;
    if (getSettings().shake) this.punch = 1;
    sfx.play('thump', { volume: 0.6 });
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
  }
}
