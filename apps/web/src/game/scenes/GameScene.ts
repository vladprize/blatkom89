/**
 * The playable top-down scene. Steps the session at a fixed 60 Hz, renders map/characters/effects,
 * runs the camera and lighting, and turns session events into feedback (visual, audio, haptics).
 */
import * as Phaser from 'phaser';
import { TICK_MS, getMap, WEAPONS } from '@blatkom/shared';
import type { MapDef } from '@blatkom/shared';
import type { GameSession, RenderPlayer, SessionEvent, RenderPickup } from '../session/types.js';
import { MapRenderer } from '../render/MapRenderer.js';
import { Lighting } from '../render/Lighting.js';
import { Effects, muzzlePoint } from '../render/Effects.js';
import { CharacterView, spawnCorpse } from '../render/CharacterView.js';
import { VhsPipeline, vhsIntensity } from '../render/VhsPipeline.js';
import { InputManager } from '../input/InputManager.js';
import { D } from '../render/depth.js';
import { sfx } from '../audio/Sfx.js';
import { getSettings, onSettings } from '../../app/settings.js';
import { hudBus } from './hudBus.js';
import { haptic } from '../../telegram/tg.js';
import { toast } from '../../ui/dom.js';

export interface GameSceneData {
  session: GameSession;
}

const TEX = 2;
/** Camera may scroll this far past the map edge so HUD panels never cover a player standing at a wall. */
const CAM_PAD = 44;

export class GameScene extends Phaser.Scene {
  session!: GameSession;
  private map!: MapDef;
  private mapView!: MapRenderer;
  private lighting!: Lighting;
  private fx!: Effects;
  private inputs!: InputManager;
  private readonly views = new Map<number, CharacterView>();
  private readonly pickupSprites = new Map<number, { img: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Image; marker: Phaser.GameObjects.Image | null }>();
  private acc = 0;
  private camX = 0;
  private camY = 0;
  private vhs: VhsPipeline | null = null;
  private damagePulse = 0;
  private lastPlayers: RenderPlayer[] = [];
  private paused = false;
  private unsubSettings: (() => void) | null = null;
  private lastCountdown = -1;
  private crosshair: Phaser.GameObjects.Image | null = null;
  private lastNow = 0;
  private readonly debug = new URLSearchParams(location.search);
  /** Practice-only debug camera (`?cam=x,y`), used for art review screenshots. */
  private debugCam: { x: number; y: number } | null = null;
  /** Adaptive quality: frame-rate samples (one per second) used to drop the VHS pass on slow devices. */
  private perfFrames = 0;
  private perfStart = 0;
  private slowSeconds = 0;
  private qualityReduced = false;

  constructor() {
    super('game');
  }

  init(data: GameSceneData): void {
    this.session = data.session;
    this.map = getMap(this.session.mapId);
    this.acc = 0;
    this.views.clear();
    this.pickupSprites.clear();
    this.lastCountdown = -1;
    this.paused = false;
    this.vhs = null;
    this.perfFrames = 0;
    this.perfStart = 0;
    this.slowSeconds = 0;
    this.qualityReduced = false;
  }

  create(): void {
    const cam = this.cameras.main;
    cam.setZoom(TEX);
    this.applyCameraBounds();
    cam.setBackgroundColor('#0b0908');
    cam.setRoundPixels(true);
    this.mapView = new MapRenderer(this, this.map);
    this.mapView.build();
    this.lighting = new Lighting(this, this.map);
    this.fx = new Effects(this);
    this.inputs = new InputManager(this);
    this.inputs.onPause = () => hudBus.emit('pause');
    this.inputs.onScoreboard = (show) => hudBus.emit('scoreboard', show);
    this.crosshair = this.add.image(0, 0, 'fx', 'crosshair').setDepth(D.CROSSHAIR).setScale(0.5).setVisible(false);
    if (this.debug.has('nolight')) this.lighting.enabled = false;
    const camParam = this.debug.get('cam');
    if (camParam && this.session.mode === 'offline') {
      const [x, y] = camParam.split(',').map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) this.debugCam = { x: x!, y: y! };
    }
    this.applySettings();
    this.unsubSettings = onSettings(() => this.applySettings(true));
    const me = this.session.players().find((p) => p.isLocal);
    if (me) {
      this.camX = me.x;
      this.camY = me.y;
      this.inputs.setAim(me.aim);
      cam.centerOn(me.x, me.y);
    }
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.scene.launch('hud', { session: this.session });
    this.scene.bringToTop('hud');
    hudBus.on('pause-state', this.onPauseState, this);
  }

  private onPauseState(p: boolean) {
    this.paused = p;
  }

  private onResize(size: Phaser.Structs.Size) {
    this.cameras.main.setSize(size.width, size.height);
    this.applyCameraBounds();
  }

  /** Lets the camera look past the map edge (by ~30% of the view) so touch controls and HUD never hide the player. */
  private applyCameraBounds() {
    const cam = this.cameras.main;
    const px = Math.max(CAM_PAD, (cam.width / TEX) * 0.3);
    const py = Math.max(CAM_PAD, (cam.height / TEX) * 0.3);
    cam.setBounds(-px, -py, this.map.width + px * 2, this.map.height + py * 2);
  }

  private applySettings(userChange = false) {
    const s = getSettings();
    // the VHS pass is a full-screen post-process: removed entirely when switched off (saves GPU on phones)
    const cam = this.cameras.main;
    const wantVhs = s.vhs > 0 && this.game.renderer.type === Phaser.WEBGL && !this.debug.has('novhs');
    if (wantVhs && !this.vhs) {
      cam.setPostPipeline(VhsPipeline);
      this.vhs = cam.getPostPipeline(VhsPipeline) as VhsPipeline;
      if (userChange) this.qualityReduced = true; // the player chose it: never auto-disable again
    } else if (!wantVhs && this.vhs) {
      cam.resetPostPipeline();
      this.vhs = null;
    }
    if (this.vhs) this.vhs.intensity = vhsIntensity(s.vhs);
    this.fx.shakeScale = s.shake ? 1 : 0;
    sfx.setVolume(s.sfxVolume);
  }

  private cleanup() {
    this.unsubSettings?.();
    hudBus.off('pause-state', this.onPauseState, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.lighting.destroy();
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    this.scene.stop('hud');
  }

  override update(time: number, _delta: number): void {
    // own clock: Phaser's smoothed delta under-reports on slow frames and would slow the simulation
    const nowMs = performance.now();
    const dt = this.lastNow ? Math.min(nowMs - this.lastNow, 250) : 16.7;
    this.lastNow = nowMs;
    this.acc += dt;
    if (this.acc > 250) this.acc = 250;
    const meNow = this.lastPlayers.find((p) => p.isLocal) ?? null;
    if (this.paused && this.session.mode === 'offline') this.acc = 0; // practice pauses the whole world
    while (this.acc >= TICK_MS) {
      const phase = this.session.phase();
      const controllable = !this.paused && (phase === 'active' || phase === 'countdown');
      const input = this.inputs.sample(meNow && meNow.alive ? meNow : null, this.session.viewTime());
      this.session.step(controllable ? input : { ...input, moveX: 0, moveY: 0, buttons: 0, slot: 0 });
      this.acc -= TICK_MS;
    }
    this.session.frame(performance.now());
    const players = this.session.players();
    this.lastPlayers = players;
    const me = players.find((p) => p.isLocal) ?? null;

    // views
    const seen = new Set<number>();
    for (const p of players) {
      seen.add(p.slot);
      let v = this.views.get(p.slot);
      if (!v) {
        v = new CharacterView(this, p);
        v.onFootstep = (x, y) => {
          this.fx.dust(x, y);
          if (p.isLocal) sfx.play('step', { volume: 0.25 });
        };
        v.onSmoke = (x, y) => this.fx.cigaretteSmoke(x, y);
        this.views.set(p.slot, v);
      }
      v.update(p, time, dt);
    }
    for (const [slot, v] of this.views) {
      if (!seen.has(slot)) {
        v.destroy();
        this.views.delete(slot);
      }
    }
    this.renderPickups(this.session.pickups(), time);
    for (const e of this.session.drainEvents()) this.handleEvent(e, players, time);

    // camera with aim look-ahead
    if (this.debugCam) this.cameras.main.centerOn(this.debugCam.x, this.debugCam.y);
    else if (me) {
      let tx = me.x;
      let ty = me.y;
      if (me.alive) {
        const look = this.inputs.usingTouch ? 40 : 60;
        tx += Math.cos(this.inputs.aimAngle) * look;
        ty += Math.sin(this.inputs.aimAngle) * look;
      }
      const k = 1 - Math.pow(0.0001, dt / 1000);
      this.camX += (tx - this.camX) * Math.min(1, k * 1.2);
      this.camY += (ty - this.camY) * Math.min(1, k * 1.2);
      this.cameras.main.centerOn(Math.round(this.camX * TEX) / TEX, Math.round(this.camY * TEX) / TEX);
      sfx.setListener(me.x, me.y);
      this.mapView.updateOverhead(me.x, me.y, dt);
    }
    this.mapView.cull(this.cameras.main.worldView);
    this.adaptQuality(nowMs);
    // crosshair (desktop)
    const pointer = this.input.activePointer;
    if (this.crosshair) {
      const show = !this.inputs.usingTouch && !!me?.alive && this.session.phase() !== 'finished';
      this.crosshair.setVisible(show);
      if (show) {
        const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.crosshair.setPosition(wp.x, wp.y);
      }
    }
    this.fx.update(dt);
    this.lighting.update(time, players);
    this.damagePulse = Math.max(0, this.damagePulse - dt / 400);
    if (this.vhs) this.vhs.damage = this.damagePulse + (me && me.alive && me.hp < 30 ? 0.25 + Math.sin(time / 180) * 0.15 : 0);

    // countdown beeps
    const hud = this.session.hud();
    if (hud.phase === 'countdown') {
      const n = Math.ceil(hud.phaseRemainingMs / 1000);
      if (n !== this.lastCountdown && n > 0) sfx.play('beep');
      this.lastCountdown = n;
    } else if (this.lastCountdown > 0 && hud.phase === 'active') {
      sfx.play('beepHigh');
      this.lastCountdown = -1;
    }
  }

  /** If the game runs below ~40 FPS for 6 s with post-processing on, turn the VHS pass off once. */
  private adaptQuality(nowMs: number) {
    if (this.qualityReduced || !this.vhs || this.debugCam) return;
    if (!this.perfStart) this.perfStart = nowMs;
    this.perfFrames++;
    const span = nowMs - this.perfStart;
    if (span < 1000) return;
    const fps = (this.perfFrames * 1000) / span;
    this.perfFrames = 0;
    this.perfStart = nowMs;
    this.slowSeconds = fps < 40 && !this.paused ? this.slowSeconds + 1 : 0;
    if (this.slowSeconds >= 6) {
      this.qualityReduced = true;
      this.cameras.main.resetPostPipeline();
      this.vhs = null;
      toast('Видеоэффекты отключены для плавности — включить можно в настройках');
    }
  }

  private renderPickups(list: RenderPickup[], time: number) {
    const seen = new Set<number>();
    for (const pk of list) {
      seen.add(pk.id);
      let s = this.pickupSprites.get(pk.id);
      if (!s) {
        const ring = this.add.image(pk.x, pk.y, 'fx', 'ring').setScale(0.55).setTint(0xffd36a).setDepth(D.PICKUP).setBlendMode(Phaser.BlendModes.ADD);
        const img = this.add.image(pk.x, pk.y, 'props', `pickup_${pk.weapon}`).setScale(0.5).setDepth(D.PICKUP + 0.1);
        const marker = pk.dropped ? null : this.add.image(pk.x, pk.y, 'fx', 'ring').setScale(0.4).setTint(0xd9c7a3).setAlpha(0.18).setDepth(D.DECAL);
        s = { img, ring, marker };
        this.pickupSprites.set(pk.id, s);
      }
      s.img.setVisible(pk.active).setPosition(pk.x, pk.y).setRotation(Math.sin(time / 600 + pk.id) * 0.25 + (pk.dropped ? 0.6 : 0));
      s.ring.setVisible(pk.active).setPosition(pk.x, pk.y).setAlpha(0.35 + Math.sin(time / 260 + pk.id) * 0.2);
    }
    for (const [id, s] of this.pickupSprites) {
      if (!seen.has(id)) {
        s.img.destroy();
        s.ring.destroy();
        s.marker?.destroy();
        this.pickupSprites.delete(id);
      }
    }
  }

  private handleEvent(e: SessionEvent, players: RenderPlayer[], time: number) {
    const bySlot = (slot: number) => players.find((p) => p.slot === slot);
    const local = players.find((p) => p.isLocal);
    const cam = this.cameras.main;
    switch (e.t) {
      case 'shot': {
        const shooter = bySlot(e.shooter);
        const isLocal = shooter?.isLocal ?? false;
        if (isLocal && !e.predicted && this.session.mode === 'online') {
          // own shots were already shown by prediction; only show authoritative impacts
          this.impacts(e);
          return;
        }
        const aim = shooter && shooter.alive ? shooter.aim : e.aim;
        const ox = shooter ? shooter.x : e.ox;
        const oy = shooter ? shooter.y : e.oy;
        this.views.get(e.shooter)?.onShot(e.weapon);
        hudBus.emit('radar', e.shooter);
        this.fx.muzzleFlash(ox, oy, aim, e.weapon);
        const m = muzzlePoint(ox, oy, aim, e.weapon);
        for (const pl of e.pellets) {
          const ex = e.ox + Math.cos(pl.angle) * pl.dist;
          const ey = e.oy + Math.sin(pl.angle) * pl.dist;
          this.fx.tracer(m.x, m.y, ex, ey, e.weapon);
        }
        if (!(isLocal && e.predicted && this.session.mode === 'online')) this.impacts(e);
        this.lighting.flash(m.x, m.y, e.weapon === 'obrez' ? 150 : 110, 0xffb050, 0.9, 60, time);
        sfx.play(WEAPONS[e.weapon].sound === 'swing' ? 'swing' : (WEAPONS[e.weapon].sound as 'pistol' | 'avtomat' | 'obrez'), { x: ox, y: oy, volume: isLocal ? 0.9 : 1 });
        if (isLocal) this.fx.shake(cam, WEAPONS[e.weapon].shake);
        break;
      }
      case 'melee': {
        const shooter = bySlot(e.shooter);
        if (shooter?.isLocal && !e.predicted && this.session.mode === 'online') return;
        this.views.get(e.shooter)?.onShot('montirovka');
        if (shooter) {
          this.fx.meleeSwing(shooter.x, shooter.y, e.angle);
          sfx.play('swing', { x: shooter.x, y: shooter.y });
        }
        break;
      }
      case 'damage': {
        const victim = bySlot(e.victim);
        const attacker = bySlot(e.attacker);
        if (victim) {
          const a = attacker ? Math.atan2(victim.y - attacker.y, victim.x - attacker.x) : 0;
          this.fx.blood(victim.x, victim.y, a, e.amount);
          this.views.get(e.victim)?.onHit(time);
          sfx.play('hit', { x: victim.x, y: victim.y });
        }
        if (victim?.isLocal) {
          this.damagePulse = Math.min(1, this.damagePulse + 0.5);
          this.fx.shake(cam, 0.35);
          sfx.play('hurt', { volume: 0.7 });
          haptic('impact-medium');
          hudBus.emit('damaged', e.amount);
        }
        if (attacker?.isLocal) hudBus.emit('hitmarker', false);
        break;
      }
      case 'kill': {
        const victim = bySlot(e.victim);
        const killer = bySlot(e.killer);
        if (victim) {
          spawnCorpse(this, victim.character, victim.x, victim.y, victim.aim);
          this.fx.bloodPool(victim.x, victim.y);
          sfx.play('death', { x: victim.x, y: victim.y });
        }
        hudBus.emit('killfeed', { killer: killer?.name ?? '—', killerLocal: !!killer?.isLocal, victim: victim?.name ?? '—', victimLocal: !!victim?.isLocal, weapon: e.weapon });
        if (killer?.isLocal) {
          hudBus.emit('hitmarker', true);
          sfx.play('kill', { volume: 0.8 });
          haptic('notify-success');
        }
        if (victim?.isLocal) haptic('impact-heavy');
        break;
      }
      case 'respawn': {
        const p = bySlot(e.slot);
        if (p?.isLocal) {
          sfx.play('respawn', { volume: 0.6 });
          this.camX = e.x;
          this.camY = e.y;
        }
        break;
      }
      case 'pickup': {
        const p = bySlot(e.slot);
        if (p) {
          this.fx.pickupSparkle(p.x, p.y);
          sfx.play('pickup', { x: p.x, y: p.y, volume: p.isLocal ? 1 : 0.6 });
        }
        if (p?.isLocal) haptic('impact-light');
        break;
      }
      case 'reload': {
        const p = bySlot(e.slot);
        if (p) sfx.play('reload', { x: p.x, y: p.y, volume: p.isLocal ? 0.8 : 0.6 });
        break;
      }
      case 'dry': {
        const p = bySlot(e.slot);
        if (p?.isLocal) sfx.play('dry');
        break;
      }
      case 'matchEnd':
        sfx.play('end', { volume: 0.7 });
        hudBus.emit('match-end', e.reason);
        break;
      case 'phase':
        hudBus.emit('phase', e.phase);
        break;
      default:
        break;
    }
    void local;
  }

  private impacts(e: Extract<SessionEvent, { t: 'shot' }>) {
    for (const pl of e.pellets) {
      if (pl.kind === 1) {
        const ex = e.ox + Math.cos(pl.angle) * pl.dist;
        const ey = e.oy + Math.sin(pl.angle) * pl.dist;
        this.fx.wallHit(ex, ey, pl.angle);
        if (Math.random() < 0.3) sfx.play('ricochet', { x: ex, y: ey, volume: 0.5 });
      }
    }
  }
}
