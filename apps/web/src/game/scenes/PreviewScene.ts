/**
 * Live backdrop behind the HTML menus: a lit slice of «Заводская проходная» with the four
 * characters patrolling and shooting — real game sprites, not the reference art.
 */
import * as Phaser from 'phaser';
import { getMap, CHARACTER_IDS } from '@blatkom/shared';
import type { CharacterId, WeaponId } from '@blatkom/shared';
import { MapRenderer } from '../render/MapRenderer.js';
import { Lighting } from '../render/Lighting.js';
import { Effects } from '../render/Effects.js';
import { CharacterView } from '../render/CharacterView.js';
import type { RenderPlayer } from '../session/types.js';
import { VhsPipeline, vhsIntensity } from '../render/VhsPipeline.js';
import { getSettings } from '../../app/settings.js';

interface Actor {
  p: RenderPlayer;
  view: CharacterView;
  path: Array<{ x: number; y: number }>;
  seg: number;
  t: number;
  nextShot: number;
}

/** Gear of the four backdrop actors (a sampler of the arsenal). */
const GEAR: WeaponId[] = ['avtomat', 'uzi', 'obrez', 'm249'];

export class PreviewScene extends Phaser.Scene {
  private actors: Actor[] = [];
  private fx!: Effects;
  private lighting!: Lighting;
  private focus: CharacterId | null = null;
  private camX = 700;
  private camY = 470;

  constructor() {
    super('preview');
  }

  create(): void {
    const map = getMap('factory');
    const cam = this.cameras.main;
    cam.setZoom(2).setBounds(0, 0, map.width, map.height).setBackgroundColor('#0b0908').setRoundPixels(true);
    new MapRenderer(this, map).build();
    this.lighting = new Lighting(this, map);
    this.fx = new Effects(this);
    if (this.game.renderer.type === Phaser.WEBGL) {
      cam.setPostPipeline(VhsPipeline);
      const vhs = cam.getPostPipeline(VhsPipeline) as VhsPipeline;
      vhs.intensity = Math.max(0.55, vhsIntensity(getSettings().vhs));
    }
    const paths: Array<Array<[number, number]>> = [
      [[640, 650], [800, 660], [800, 760], [640, 760]],
      [[860, 430], [1000, 470], [880, 500]],
      [[560, 420], [620, 300], [480, 330]],
      [[720, 690], [760, 600], [900, 640]],
    ];
    this.actors = CHARACTER_IDS.slice(0, paths.length).map((c, i) => {
      const path = paths[i]!.map(([x, y]) => ({ x, y }));
      const p: RenderPlayer = {
        slot: i,
        id: c,
        name: '',
        character: c,
        isLocal: false,
        isBot: true,
        x: path[0]!.x,
        y: path[0]!.y,
        vx: 0,
        vy: 0,
        aim: 0,
        hp: 100,
        alive: true,
        weapon: GEAR[i % GEAR.length]!,
        reloading: false,
        invulnerable: false,
        walking: i % 2 === 1,
        connected: true,
        kills: 0,
        assists: 0,
        deaths: 0,
        score: 0,
        level: null,
        laser: false,
        flashedMs: 0,
        team: null,
        objectives: 0,
      };
      const view = new CharacterView(this, p);
      view.onSmoke = (x, y) => this.fx.cigaretteSmoke(x, y);
      return { p, view, path, seg: 0, t: Math.random(), nextShot: 1500 + Math.random() * 2500 };
    });
    // name tags are not needed in the backdrop
    this.children.list.filter((o) => o instanceof Phaser.GameObjects.Text).forEach((o) => (o as Phaser.GameObjects.Text).setVisible(false));
    // the backdrop is stopped while a match runs: the resize listener must go with it (a stale one
    // throws on the next resize and stops Phaser from notifying the game and HUD scenes)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this));
  }

  private onResize(s: Phaser.Structs.Size): void {
    this.cameras.main?.setSize(s.width, s.height);
  }

  setFocus(c: CharacterId | null): void {
    this.focus = c;
    // characters beyond the four backdrop actors borrow the first actor's body
    if (c && !this.actors.some((a) => a.p.character === c) && this.actors[0]) this.actors[0].p.character = c;
  }

  override update(time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    for (const a of this.actors) {
      const from = a.path[a.seg]!;
      const to = a.path[(a.seg + 1) % a.path.length]!;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const speed = a.p.walking ? 60 : 110;
      a.t += (speed * dt) / len;
      if (a.t >= 1) {
        a.t = 0;
        a.seg = (a.seg + 1) % a.path.length;
      }
      a.p.x = from.x + dx * a.t;
      a.p.y = from.y + dy * a.t;
      a.p.vx = (dx / len) * speed;
      a.p.vy = (dy / len) * speed;
      const target = Math.atan2(dy, dx) + Math.sin(time / 900 + a.p.slot) * 0.5;
      a.p.aim += Phaser.Math.Angle.Wrap(target - a.p.aim) * Math.min(1, dt * 4);
      a.nextShot -= delta;
      if (a.nextShot <= 0) {
        a.nextShot = 1800 + Math.random() * 3000;
        a.view.onShot(a.p.weapon);
        this.fx.muzzleFlash(a.p.x, a.p.y, a.p.aim, a.p.weapon);
        const ex = a.p.x + Math.cos(a.p.aim) * 200;
        const ey = a.p.y + Math.sin(a.p.aim) * 200;
        this.fx.tracer(a.p.x + Math.cos(a.p.aim) * 24, a.p.y + Math.sin(a.p.aim) * 24, ex, ey, a.p.weapon);
        this.lighting.flash(a.p.x, a.p.y, 120, 0xffb050, 0.9, 60, time);
      }
      a.view.update(a.p, time, delta);
    }
    const f = this.focus ? this.actors.find((a) => a.p.character === this.focus) : null;
    const tx = f ? f.p.x : 720 + Math.sin(time / 7000) * 160;
    const ty = f ? f.p.y : 560 + Math.cos(time / 9000) * 90;
    const k = Math.min(1, dt * (f ? 3 : 0.8));
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    this.cameras.main.centerOn(Math.round(this.camX * 2) / 2, Math.round(this.camY * 2) / 2);
    this.fx.update(delta);
    this.lighting.update(time, []);
  }
}
