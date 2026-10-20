/**
 * The playable top-down scene. Steps the session at a fixed 60 Hz, renders map/characters/effects,
 * runs the camera and lighting, and turns session events into feedback (visual, audio, haptics).
 */
import * as Phaser from 'phaser';
import { TICK_MS, getMap, getCollision, WEAPONS, SCORING, CTF_RULES, BASE_RULES, isWeaponId } from '@blatkom/shared';
import type { CollisionWorld, MapDef } from '@blatkom/shared';
import type { GameSession, RenderPlayer, SessionEvent, RenderPickup } from '../session/types.js';
import { MapRenderer } from '../render/MapRenderer.js';
import { Lighting } from '../render/Lighting.js';
import { Effects, muzzlePoint } from '../render/Effects.js';
import { CharacterView, spawnCorpse } from '../render/CharacterView.js';
import { GadgetView } from '../render/GadgetView.js';
import { ObjectiveView, TEAM_CLOTH } from '../render/ObjectiveView.js';
import { VhsPipeline, vhsIntensity } from '../render/VhsPipeline.js';
import { InputManager } from '../input/InputManager.js';
import { D } from '../render/depth.js';
import { sfx } from '../audio/Sfx.js';
import { getSettings, onSettings } from '../../app/settings.js';
import { hudBus } from './hudBus.js';
import type { ObjectiveEntry } from './hudBus.js';
import { haptic } from '../../telegram/tg.js';
import { toast } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';

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
  private gadgetView!: GadgetView;
  private objectives: ObjectiveView | null = null;
  private collision!: CollisionWorld;
  private lasers!: Phaser.GameObjects.Graphics;
  private laserDots: Phaser.GameObjects.Image[] = [];
  private inputs!: InputManager;
  private readonly views = new Map<number, CharacterView>();
  private readonly pickupSprites = new Map<number, { img: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Image; marker: Phaser.GameObjects.Image | null; crate: Phaser.GameObjects.Image | null; glow: Phaser.GameObjects.Image | null }>();
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
    this.gadgetView = new GadgetView(this, this.fx, this.lighting);
    this.objectives = this.session.gameMode === 'ctf' || this.session.gameMode === 'bases' ? new ObjectiveView(this, this.lighting) : null;
    this.collision = getCollision(this.session.mapId);
    this.lasers = this.add.graphics().setDepth(D.FX_ADD - 0.5).setBlendMode(Phaser.BlendModes.ADD);
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
    hudBus.on('chat-open', this.onChatOpen, this);
    hudBus.on('chat-say', this.onChatSay, this);
  }

  private onPauseState(p: boolean) {
    this.paused = p;
  }

  /** The chat input took the keyboard: keys held at that moment must not stay «down». */
  private onChatOpen() {
    this.input.keyboard?.resetKeys();
  }

  /** A chat line: a speech bubble over the speaker for a few seconds. */
  private onChatSay(e: { slot: number; text: string }) {
    this.views.get(e.slot)?.say(e.text, this.time.now);
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
    hudBus.off('chat-open', this.onChatOpen, this);
    hudBus.off('chat-say', this.onChatSay, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.objectives?.destroy();
    this.objectives = null;
    this.lighting.destroy();
    this.gadgetView.destroy();
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

    // equipment first: smoke clouds decide who is concealed
    this.gadgetView.update(this.session.gadgets(), this.session.localSlot(), time, dt);
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
      v.update(p, time, dt, !p.isLocal && this.gadgetView.concealed(p.x, p.y));
    }
    this.drawLasers(players);
    for (const [slot, v] of this.views) {
      if (!seen.has(slot)) {
        v.destroy();
        this.views.delete(slot);
      }
    }
    this.renderPickups(this.session.pickups(), time);
    this.objectives?.update(this.session.flags(), this.session.bases(), players, time);
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
    this.mapView.animate(time);
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
      toast(t('Video effects switched off to keep things smooth — turn them back on in the settings'));
    }
  }

  /** Laser sights: a thin red beam from the muzzle to the first wall, visible to everyone. */
  private drawLasers(players: RenderPlayer[]) {
    const g = this.lasers;
    g.clear();
    let n = 0;
    for (const p of players) {
      if (!p.alive || !p.laser || !isWeaponId(p.weapon)) continue;
      const m = muzzlePoint(p.x, p.y, p.aim, p.weapon);
      const dx = Math.cos(p.aim);
      const dy = Math.sin(p.aim);
      const hit = this.collision.raycast(m.x, m.y, dx, dy, 700, 'shot');
      const len = hit ? hit.t : 700;
      g.lineStyle(0.6, 0xff2a1a, 0.55).lineBetween(m.x, m.y, m.x + dx * len, m.y + dy * len);
      let dot = this.laserDots[n];
      if (!dot) {
        dot = this.add.image(0, 0, 'fx', 'glow').setTint(0xff3a24).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.FX_ADD).setScale(0.12);
        this.laserDots.push(dot);
      }
      dot.setVisible(true).setPosition(m.x + dx * len, m.y + dy * len).setAlpha(0.7 + Math.random() * 0.3);
      n++;
    }
    for (let i = n; i < this.laserDots.length; i++) this.laserDots[i]!.setVisible(false);
  }

  private renderPickups(list: RenderPickup[], time: number) {
    const seen = new Set<number>();
    for (const pk of list) {
      seen.add(pk.id);
      let s = this.pickupSprites.get(pk.id);
      if (!s) {
        // «дефицит» crates: an army crate with a red pulsing ring and an emissive glow, readable from afar
        const crate = pk.supply ? this.add.image(pk.x, pk.y + 3, 'props', 'prop_crate_green_0').setScale(0.55).setDepth(D.PICKUP - 0.05) : null;
        const glow = pk.supply ? this.add.image(pk.x, pk.y, 'fx', 'glow').setScale(0.9).setTint(0xff7a3a).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.LIGHT + 0.4) : null;
        const ring = this.add.image(pk.x, pk.y, 'fx', 'ring').setScale(pk.supply ? 0.8 : 0.55).setTint(pk.supply ? 0xff5a3a : pk.medkit ? 0x6aff7a : 0xffd36a).setDepth(D.PICKUP).setBlendMode(Phaser.BlendModes.ADD);
        const img = this.add.image(pk.x, pk.y, 'weapons', pk.weapon ? `pickup_${pk.weapon}` : 'pickup_medkit').setScale(0.5).setDepth(D.PICKUP + 0.1);
        const marker = pk.dropped ? null : this.add.image(pk.x, pk.y, 'fx', 'ring').setScale(0.4).setTint(0xd9c7a3).setAlpha(0.18).setDepth(D.DECAL);
        s = { img, ring, marker, crate, glow };
        this.pickupSprites.set(pk.id, s);
      }
      s.img.setVisible(pk.active).setPosition(pk.x, pk.y - (pk.supply ? 2 : 0)).setRotation(pk.medkit ? 0 : Math.sin(time / 600 + pk.id) * 0.25 + (pk.dropped && !pk.supply ? 0.6 : 0));
      if (pk.medkit) s.img.setScale(0.5 + Math.sin(time / 300 + pk.id) * 0.03);
      s.ring.setVisible(pk.active).setPosition(pk.x, pk.y).setAlpha((pk.supply ? 0.55 : 0.35) + Math.sin(time / (pk.supply ? 160 : 260) + pk.id) * 0.2);
      s.crate?.setVisible(pk.active);
      s.glow?.setVisible(pk.active).setAlpha(0.35 + Math.sin(time / 160) * 0.15);
    }
    for (const [id, s] of this.pickupSprites) {
      if (!seen.has(id)) {
        s.img.destroy();
        s.ring.destroy();
        s.marker?.destroy();
        s.crate?.destroy();
        s.glow?.destroy();
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
        if (e.turret || !isWeaponId(e.weapon)) {
          // a turret's burst: tracer from the turret, small flash, its own sound
          const c = Math.cos(e.aim);
          const sn = Math.sin(e.aim);
          const mx = e.ox + c * 12;
          const my = e.oy + sn * 12;
          for (const pl of e.pellets) this.fx.tracer(mx, my, e.ox + Math.cos(pl.angle) * pl.dist, e.oy + Math.sin(pl.angle) * pl.dist, 'mp5');
          this.fx.particle('glow', mx, my, { life: 50, scale: 0.3, tint: 0xffc060, alpha: 0.9, add: true });
          this.lighting.flash(mx, my, 70, 0xffb050, 0.7, 50, time);
          this.impacts(e);
          sfx.play('turret', { x: e.ox, y: e.oy, volume: 0.8 });
          hudBus.emit('radar', e.shooter);
          break;
        }
        const weapon = e.weapon;
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
        // the shot carries the base weapon; a silencer modification arrives as a flag
        const def = WEAPONS[weapon];
        const silenced = def.silenced || e.silenced === true;
        this.views.get(e.shooter)?.onShot(weapon, time);
        // suppressed weapons do not give the shooter away on the minimap radar
        if (!silenced) hudBus.emit('radar', e.shooter);
        if (!silenced) this.fx.muzzleFlash(ox, oy, aim, weapon);
        const m = muzzlePoint(ox, oy, aim, weapon);
        for (const pl of e.pellets) {
          const ex = e.ox + Math.cos(pl.angle) * pl.dist;
          const ey = e.oy + Math.sin(pl.angle) * pl.dist;
          this.fx.tracer(m.x, m.y, ex, ey, weapon);
        }
        if (!(isLocal && e.predicted && this.session.mode === 'online')) this.impacts(e);
        if (!silenced) this.lighting.flash(m.x, m.y, def.flash === 'obrez' || def.sound === 'flame' ? 150 : 110, def.sound === 'flame' ? 0xff8a30 : 0xffb050, 0.9, def.sound === 'flame' ? 120 : 60, time);
        sfx.play(silenced && !def.silenced && def.sound !== 'shotgun' && def.sound !== 'obrez' ? 'silenced' : def.sound, { x: ox, y: oy, volume: isLocal ? 0.9 : silenced ? 0.6 : 1 });
        if (isLocal) this.fx.shake(cam, def.shake);
        break;
      }
      case 'melee': {
        const shooter = bySlot(e.shooter);
        if (shooter?.isLocal && !e.predicted && this.session.mode === 'online') return;
        if (shooter) {
          this.views.get(e.shooter)?.onShot(shooter.weapon, time);
          this.fx.meleeSwing(shooter.x, shooter.y, e.angle);
          sfx.play(WEAPONS[shooter.weapon].sound === 'heavySwing' ? 'heavySwing' : 'swing', { x: shooter.x, y: shooter.y });
        }
        break;
      }
      case 'gadget': {
        const p = bySlot(e.slot);
        const kind = e.kind;
        sfx.play(kind === 'mine' || kind === 'c4' ? 'place' : kind === 'turret' ? 'deploy' : 'throw', { x: e.x, y: e.y, volume: p?.isLocal ? 1 : 0.7 });
        if (p?.isLocal) haptic('impact-light');
        break;
      }
      case 'flashbang': {
        this.fx.flashBurst(e.x, e.y);
        this.lighting.flash(e.x, e.y, 520, 0xffffff, 1.4, 260, time);
        sfx.play('flashbang', { x: e.x, y: e.y });
        if (local && local.alive && Math.hypot(local.x - e.x, local.y - e.y) < 300) {
          this.fx.shake(cam, 0.5);
          haptic('impact-heavy');
        }
        break;
      }
      case 'ignite':
        sfx.play('ignite', { x: e.x, y: e.y });
        this.lighting.flash(e.x, e.y, e.radius * 3, 0xff8a24, 1.1, 300, time);
        break;
      case 'smoke':
        sfx.play('hiss', { x: e.x, y: e.y });
        break;
      case 'beep':
        sfx.play('mineBeep', { x: e.x, y: e.y });
        break;
      case 'turretDown':
        this.fx.debris(e.x, e.y);
        sfx.play('crash', { x: e.x, y: e.y });
        break;
      case 'rocket': {
        const shooter = bySlot(e.shooter);
        this.fx.launch(e.id, e.weapon, e.x, e.y, e.angle, e.speed, e.range, e.age ?? 0);
        // the local player's launch was already shown by prediction (online)
        if (shooter?.isLocal && this.session.mode === 'online') break;
        const ox = shooter ? shooter.x : e.x;
        const oy = shooter ? shooter.y : e.y;
        const aim = shooter?.alive ? shooter.aim : e.angle;
        this.views.get(e.shooter)?.onShot(e.weapon, time);
        this.fx.muzzleFlash(ox, oy, aim, e.weapon);
        hudBus.emit('radar', e.shooter);
        sfx.play('rocket', { x: ox, y: oy, volume: 0.9 });
        if (shooter?.isLocal) this.fx.shake(cam, WEAPONS[e.weapon].shake);
        break;
      }
      case 'boom': {
        this.fx.endFlight(e.id);
        this.fx.explosion(e.x, e.y, e.radius);
        this.lighting.flash(e.x, e.y, e.radius * 3, 0xff9a40, 1, 380, time);
        sfx.play('boom', { x: e.x, y: e.y });
        if (local) {
          const d = Math.hypot(local.x - e.x, local.y - e.y);
          if (d < 360) this.fx.shake(cam, Math.max(0.2, 1 - d / 360));
          if (d < 160) haptic('impact-heavy');
        }
        break;
      }
      case 'heal': {
        this.fx.heal(e.x, e.y);
        const p = bySlot(e.slot);
        sfx.play('heal', { x: e.x, y: e.y, volume: p?.isLocal ? 1 : 0.6 });
        if (p?.isLocal) {
          haptic('notify-success');
          hudBus.emit('points', { points: e.amount, label: t('HEALTH'), heal: true });
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
        const helpers = e.assists.map((slot) => bySlot(slot)).filter((p): p is RenderPlayer => !!p);
        const assistLocal = helpers.some((p) => p.isLocal);
        hudBus.emit('killfeed', { killer: killer?.name ?? '—', killerLocal: !!killer?.isLocal, victim: victim?.name ?? '—', victimLocal: !!victim?.isLocal, weapon: e.weapon, assists: helpers.map((p) => p.name), assistLocal, killerTeam: killer?.team ?? null, victimTeam: victim?.team ?? null });
        if (killer?.isLocal) {
          hudBus.emit('hitmarker', true);
          hudBus.emit('points', { points: SCORING.killPoints, label: t('ELIMINATION') });
          sfx.play('kill', { volume: 0.8 });
          haptic('notify-success');
        } else if (assistLocal) {
          hudBus.emit('points', { points: SCORING.assistPoints, label: t('ASSIST') });
          sfx.play('assist', { volume: 0.8 });
          haptic('impact-light');
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
      case 'supply': {
        this.fx.pickupSparkle(e.x, e.y);
        this.fx.dust(e.x, e.y);
        this.lighting.flash(e.x, e.y, 120, 0xff7a3a, 0.8, 400, time);
        sfx.play('supply', { volume: 0.75 });
        hudBus.emit('supply', { x: e.x, y: e.y, weapon: e.weapon });
        break;
      }
      case 'flag':
        this.onFlagEvent(e, players, time);
        break;
      case 'base':
        this.onBaseEvent(e, players, time);
        break;
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


  /** Capture the flag: sound, light, points popup, feed line and (for our team's business) a banner. */
  private onFlagEvent(e: Extract<SessionEvent, { t: 'flag' }>, players: RenderPlayer[], time: number) {
    const actor = e.slot >= 0 ? players.find((p) => p.slot === e.slot) : undefined;
    const local = players.find((p) => p.isLocal);
    const myTeam = local?.team ?? null;
    const ours = myTeam !== null && e.team === myTeam;
    const flag = e.team === 0 ? t('the red flag') : t('the blue flag');
    const entry: ObjectiveEntry = { actor: actor?.name ?? '', actorTeam: actor?.team ?? null, actorLocal: !!actor?.isLocal, text: '', team: e.team };
    const at = actor ? { x: actor.x, y: actor.y } : null;
    switch (e.action) {
      case 'taken':
        entry.text = t('stole {flag}', { flag });
        if (ours) entry.banner = { title: t('OUR FLAG IS STOLEN!'), sub: t('Stop the carrier — follow the marker'), good: false };
        else if (actor?.isLocal) entry.banner = { title: t('THE FLAG IS YOURS!'), sub: t('Carry it to your stand'), good: true };
        else entry.banner = { title: t('WE HAVE THEIR FLAG!'), sub: t('Cover {name}', { name: actor?.name ?? '' }), good: true };
        sfx.play('flagTaken', { volume: ours ? 0.9 : 0.6 });
        if (actor?.isLocal) {
          hudBus.emit('points', { points: CTF_RULES.takePoints, label: t('FLAG') });
          haptic('notify-success');
        } else if (ours) haptic('notify-error');
        break;
      case 'dropped':
        entry.text = t('dropped {flag}', { flag });
        entry.banner = ours ? { title: t('OUR FLAG IS DOWN'), sub: t('Touch it to send it home'), good: null } : { title: t('THEIR FLAG IS DOWN'), sub: t('Pick it up!'), good: null };
        sfx.play('flagDropped', { volume: 0.8 });
        break;
      case 'returned':
        if (actor) entry.text = t('brought back {flag}', { flag });
        else {
          entry.actor = '';
          entry.text = e.team === 0 ? t('The red flag went back to its stand') : t('The blue flag went back to its stand');
        }
        if (ours) entry.banner = { title: t('OUR FLAG IS HOME'), good: true };
        sfx.play('flagReturned', { volume: 0.8 });
        if (actor?.isLocal) hudBus.emit('points', { points: CTF_RULES.returnPoints, label: t('FLAG RETURNED') });
        break;
      case 'captured': {
        entry.text = t('captured {flag}', { flag });
        entry.banner = ours ? { title: t('THEY CAPTURED OUR FLAG'), good: false } : { title: t('FLAG CAPTURED!'), sub: actor?.isLocal ? t('Your capture') : t('{name} brought it home', { name: actor?.name ?? '' }), good: true };
        sfx.play(ours ? 'baseLost' : 'flagCaptured', { volume: 0.9 });
        if (at) {
          const color = actor?.team === 0 || actor?.team === 1 ? TEAM_CLOTH[actor.team] : 0xffd36a;
          this.lighting.flash(at.x, at.y, 220, color, 1.2, 600, time);
          this.fx.pickupSparkle(at.x, at.y);
        }
        if (actor?.isLocal) {
          hudBus.emit('points', { points: CTF_RULES.capturePoints, label: t('CAPTURE') });
          haptic('notify-success');
          this.fx.shake(this.cameras.main, 0.25);
        }
        break;
      }
    }
    hudBus.emit('objective', entry);
  }

  /** Base capture: a base changed hands. */
  private onBaseEvent(e: Extract<SessionEvent, { t: 'base' }>, players: RenderPlayer[], time: number) {
    const local = players.find((p) => p.isLocal);
    const myTeam = local?.team ?? null;
    const letter = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][e.base] ?? '?';
    const takers = e.slots.map((slot) => players.find((p) => p.slot === slot)).filter((p): p is RenderPlayer => !!p);
    const first = takers[0];
    const mine = myTeam !== null && e.team === myTeam;
    const entry: ObjectiveEntry = {
      actor: first ? (takers.length > 1 ? `${first.name} +${takers.length - 1}` : first.name) : '',
      actorTeam: e.team,
      actorLocal: takers.some((p) => p.isLocal),
      text: first ? t('took base {l}', { l: letter }) : e.team === 0 ? t('Red took base {l}', { l: letter }) : t('Blue took base {l}', { l: letter }),
      team: e.team,
      banner: mine ? { title: t('BASE {l} IS OURS', { l: letter }), good: true } : e.from !== null && e.from === myTeam ? { title: t('WE LOST BASE {l}', { l: letter }), sub: t('Take it back!'), good: false } : { title: t('THE ENEMY TOOK BASE {l}', { l: letter }), good: false },
    };
    sfx.play(mine ? 'baseCaptured' : 'baseLost', { volume: 0.85 });
    const base = this.session.bases()[e.base];
    if (base) this.lighting.flash(base.x, base.y, BASE_RULES.radius * 3, TEAM_CLOTH[e.team], 1, 500, time);
    if (takers.some((p) => p.isLocal)) {
      hudBus.emit('points', { points: BASE_RULES.capturePoints, label: t('BASE {l}', { l: letter }) });
      haptic('notify-success');
    }
    hudBus.emit('objective', entry);
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
