/**
 * Night lighting: a camera-sized light map (ambient colour + additive light stamps for every visible
 * lamp, muzzle flash and player) composited over the scene.
 *
 * On WebGL the light map is applied with an "overbright" blend (result = 2 × light × scene), so a
 * value of 0.5 leaves the scene unchanged and sodium lamps can push their pools above the base
 * texture colour — warm, saturated light like the reference art instead of a uniformly dim screen.
 * The Canvas fallback uses a plain multiply (no overbright). Lamp fixtures are drawn as emissive
 * sprites above the light map and flicker in sync with their light.
 */
import * as Phaser from 'phaser';
import type { LightDef, MapDef } from '@blatkom/shared';
import { D } from './depth.js';

interface DynLight {
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
  until: number;
  born: number;
}

interface Fixture {
  index: number;
  glow: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image | null;
  base: number;
}

const LIGHT_TEX = 'lightpool';
/** Light-map resolution in texels per world pixel (the map is smooth, so a quarter of the pixels is plenty). */
const LIGHT_RES = 0.5;
const LIGHT_TEX_SIZE = 256;
/** Peak brightness gain of a map lamp at full intensity (in scene-multiplier units). */
const LAMP_GAIN = 1.25;
const BLEND_KEY = '__blatkomOverbright';

function overbrightBlend(scene: Phaser.Scene): number | null {
  const r = scene.game.renderer;
  if (r.type !== Phaser.WEBGL) return null;
  const wr = r as Phaser.Renderer.WebGL.WebGLRenderer;
  const holder = wr as unknown as Record<string, number | undefined>;
  if (holder[BLEND_KEY] === undefined) {
    const gl = wr.gl;
    holder[BLEND_KEY] = wr.addBlendMode([gl.DST_COLOR, gl.SRC_COLOR], gl.FUNC_ADD);
  }
  return holder[BLEND_KEY]!;
}

function ensureTextures(scene: Phaser.Scene): void {
  const tm = scene.textures;
  if (!tm.exists(LIGHT_TEX)) {
    const t = tm.createCanvas(LIGHT_TEX, LIGHT_TEX_SIZE, LIGHT_TEX_SIZE)!;
    const ctx = t.getContext();
    const c = LIGHT_TEX_SIZE / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    // smooth pool: bright core, long soft shoulder
    const stops: Array<[number, number]> = [
      [0, 1],
      [0.18, 0.86],
      [0.4, 0.52],
      [0.62, 0.24],
      [0.82, 0.07],
      [1, 0],
    ];
    for (const [o, a] of stops) g.addColorStop(o, `rgba(255,255,255,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LIGHT_TEX_SIZE, LIGHT_TEX_SIZE);
    t.refresh();
    t.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  if (!tm.exists('fixture_lamp')) {
    // enamel ceiling shade seen from above (2 texels per world px)
    const t = tm.createCanvas('fixture_lamp', 20, 20)!;
    const ctx = t.getContext();
    ctx.fillStyle = '#0d0f0c';
    ctx.beginPath();
    ctx.arc(10, 10, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3d5442';
    ctx.beginPath();
    ctx.arc(10, 10, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5b7a62';
    ctx.beginPath();
    ctx.arc(8.5, 8.5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#26332a';
    ctx.beginPath();
    ctx.arc(10, 10, 2.5, 0, Math.PI * 2);
    ctx.fill();
    t.refresh();
  }
  if (!tm.exists('fixture_street')) {
    // cobra-head street lamp: grey housing, glowing lens underneath peeking out
    const t = tm.createCanvas('fixture_street', 30, 14)!;
    const ctx = t.getContext();
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 3, 30, 8);
    ctx.fillRect(2, 1, 22, 12);
    ctx.fillStyle = '#4a4d4f';
    ctx.fillRect(3, 2, 20, 10);
    ctx.fillRect(1, 5, 28, 4);
    ctx.fillStyle = '#6c7174';
    ctx.fillRect(4, 3, 16, 3);
    ctx.fillStyle = '#ffd890';
    ctx.fillRect(6, 9, 14, 2);
    t.refresh();
  }
  if (!tm.exists('fixture_neon')) {
    const t = tm.createCanvas('fixture_neon', 44, 8)!;
    const ctx = t.getContext();
    ctx.fillStyle = '#100808';
    ctx.fillRect(0, 0, 44, 8);
    ctx.fillStyle = '#5a1410';
    ctx.fillRect(1, 1, 42, 6);
    ctx.fillStyle = '#ff8a7a';
    ctx.fillRect(3, 3, 38, 2);
    t.refresh();
  }
}

export class Lighting {
  private rt: Phaser.GameObjects.RenderTexture | null = null;
  private dyn: DynLight[] = [];
  /** Steady light pools set every frame from game state (flags, bases). */
  private steady: Array<{ x: number; y: number; radius: number; color: number; intensity: number }> = [];
  private readonly ambient: number;
  private readonly flickerSeeds: number[];
  private readonly blend: number | null;
  /** Light-map units per scene-multiplier unit (0.5 with the overbright blend, 1 with multiply). */
  private readonly unit: number;
  private readonly fixtures: Fixture[] = [];
  /** Pooled off-list images drawn into the light map in one batched pass (one framebuffer bind per frame). */
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private used = 0;
  enabled = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapDef,
  ) {
    ensureTextures(scene);
    this.blend = overbrightBlend(scene);
    this.unit = this.blend === null ? 1 : 0.5;
    const a = map.ambient;
    // Ambient: the map tint (hue only) blended toward white, at a brightness set by the level.
    const c = Phaser.Display.Color.IntegerToColor(a.color);
    const m = Math.max(c.red, c.green, c.blue, 1);
    const b = 0.42 + a.level * 0.4;
    const ch = (v: number) => Math.min(255, Math.round(255 * this.unit * b * (0.6 + 0.4 * (v / m))));
    this.ambient = Phaser.Display.Color.GetColor(ch(c.red), ch(c.green), ch(c.blue));
    this.flickerSeeds = map.lights.map((_, i) => Math.random() * 1000 + i * 37);
    this.buildFixtures();
  }

  private buildFixtures() {
    this.map.lights.forEach((l, index) => {
      const kind = l.fixture ?? 'lamp';
      if (kind === 'none' || kind === 'window') return;
      let core: Phaser.GameObjects.Image | null = null;
      let glowScale = 0.5;
      let base = 0.75;
      if (kind === 'lamp') {
        core = this.scene.add.image(l.x, l.y, 'fixture_lamp').setScale(0.5).setDepth(D.OVERHEAD);
        glowScale = 0.42;
      } else if (kind === 'street') {
        core = this.scene.add.image(l.x, l.y, 'fixture_street').setScale(0.5).setDepth(D.OVERHEAD).setRotation(((index * 97) % 4) * (Math.PI / 2));
        glowScale = 0.55;
        base = 0.85;
      } else if (kind === 'neon') {
        core = this.scene.add.image(l.x, l.y, 'fixture_neon').setScale(0.5).setDepth(D.OVERHEAD);
        glowScale = 0.6;
        base = 0.9;
      }
      const glow = this.scene.add
        .image(l.x, l.y, 'fx', 'glow')
        .setDepth(D.LIGHT + 0.5)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(l.color)
        .setScale(glowScale)
        .setAlpha(base);
      this.fixtures.push({ index, glow, core, base });
    });
  }

  private ensureRT(w: number, h: number) {
    const W = Math.ceil(w * LIGHT_RES) + 2;
    const H = Math.ceil(h * LIGHT_RES) + 2;
    if (this.rt && this.rt.width === W && this.rt.height === H) return this.rt;
    this.rt?.destroy();
    this.rt = this.scene.add
      .renderTexture(0, 0, W, H)
      .setOrigin(0, 0)
      .setDepth(D.LIGHT)
      .setScale(1 / LIGHT_RES);
    this.rt.setBlendMode(this.blend ?? Phaser.BlendModes.MULTIPLY);
    this.rt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return this.rt;
  }

  /** Light pools for this frame (replaces the previous set): objective markers glow in their team colour. */
  setSteady(lights: Array<{ x: number; y: number; radius: number; color: number; intensity: number }>): void {
    this.steady = lights;
  }

  flash(x: number, y: number, radius: number, color: number, intensity: number, durationMs: number, now: number): void {
    this.dyn.push({ x, y, radius, color, intensity, until: now + durationMs, born: now });
  }

  private flicker(l: LightDef, i: number, t: number): number {
    const s = this.flickerSeeds[i]!;
    if (l.flicker === 'soft') return 0.9 + Math.sin(t * 0.004 + s) * 0.05 + Math.sin(t * 0.017 + s * 2) * 0.04;
    if (l.flicker === 'broken') {
      const k = Math.floor((t + s * 10) / 90);
      const r = Math.sin(k * 12.9898 + s) * 43758.5453;
      const v = r - Math.floor(r);
      return v < 0.12 ? 0.08 : v < 0.2 ? 0.55 : 1;
    }
    return 1;
  }

  update(now: number, players: Array<{ x: number; y: number; alive: boolean; isLocal: boolean }>): void {
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const flick = this.map.lights.map((l, i) => this.flicker(l, i, now));
    for (const f of this.fixtures) f.glow.setVisible(this.enabled).setAlpha(f.base * flick[f.index]!);
    if (!this.enabled) {
      if (this.rt) this.rt.setVisible(false);
      return;
    }
    const rt = this.ensureRT(view.width, view.height);
    rt.setVisible(true);
    const ox = Math.floor(view.x) - 1;
    const oy = Math.floor(view.y) - 1;
    rt.setPosition(ox, oy);
    this.used = 0;
    this.map.lights.forEach((l, i) => {
      const a = l.intensity * flick[i]!;
      if (a <= 0.02) return;
      this.stamp(rt, l.x - ox, l.y - oy, l.radius, l.color, a * LAMP_GAIN, view, l.x, l.y);
    });
    for (const p of players) {
      if (!p.alive) continue;
      this.stamp(rt, p.x - ox, p.y - oy, p.isLocal ? 84 : 60, p.isLocal ? 0xf0e2c8 : 0xd8ccb8, p.isLocal ? 0.42 : 0.3, view, p.x, p.y);
    }
    for (const l of this.steady) this.stamp(rt, l.x - ox, l.y - oy, l.radius, l.color, l.intensity, view, l.x, l.y);
    this.dyn = this.dyn.filter((d) => d.until > now);
    for (const d of this.dyn) {
      const k = 1 - (now - d.born) / Math.max(1, d.until - d.born);
      this.stamp(rt, d.x - ox, d.y - oy, d.radius, d.color, d.intensity * k, view, d.x, d.y);
    }
    // one fill + one batched draw instead of a framebuffer switch per light (matters on tiled mobile GPUs)
    rt.fill(this.ambient, 1);
    if (this.used > 0) rt.draw(this.pool.slice(0, this.used));
  }

  /** Adds a light pool; `gain` is in scene-multiplier units (1 = doubles brightness at the centre with overbright). */
  private stamp(_rt: Phaser.GameObjects.RenderTexture, lx: number, ly: number, radius: number, color: number, gain: number, view: Phaser.Geom.Rectangle, wx: number, wy: number) {
    if (wx + radius < view.x || wx - radius > view.right || wy + radius < view.y || wy - radius > view.bottom) return;
    let img = this.pool[this.used];
    if (!img) {
      img = this.scene.make.image({ key: LIGHT_TEX, add: false }).setOrigin(0.5, 0.5).setBlendMode(Phaser.BlendModes.ADD);
      this.pool.push(img);
    }
    this.used++;
    img
      .setPosition(lx * LIGHT_RES, ly * LIGHT_RES)
      .setScale((radius * 2 * LIGHT_RES) / LIGHT_TEX_SIZE)
      .setTint(color)
      .setAlpha(Math.min(1, gain * this.unit));
  }

  destroy(): void {
    this.rt?.destroy();
    this.rt = null;
    for (const img of this.pool) img.destroy();
    this.pool.length = 0;
    for (const f of this.fixtures) {
      f.glow.destroy();
      f.core?.destroy();
    }
    this.fixtures.length = 0;
  }
}
