/**
 * Fable cut: the light map with shadows in it.
 *
 * The map's lamps are baked with their shadows at the start (bake.ts) and cost a picture each, as before.
 * What moves is cast every frame against the same occluders: the local player's own light (a glow round
 * them and a beam where they aim) and the brightest flashes — a shot lights the room it is fired in and
 * the crates throw their shadows across it. Everything else (other players, flags, fires) is a plain pool.
 */
import * as Phaser from 'phaser';
import type { MapDef } from '@blatkom/shared';
import { D } from '../render/depth.js';
import { OccluderIndex, Visibility, buildOccluders, lightReaches } from './shadows.js';
import type { Occluder } from './shadows.js';
import { bakeLights, flickers, offTheWall, POOL_STOPS } from './bake.js';
import type { Baked } from './bake.js';
import { TIERS } from './tiers.js';
import type { FableTier } from './tiers.js';
import type { MapLook } from './looks.js';

interface Flash {
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
  until: number;
  born: number;
}

export interface LightPlayer {
  x: number;
  y: number;
  alive: boolean;
  isLocal: boolean;
  aim?: number;
}

const POOL_TEX = 'fable_pool';
const POOL_SIZE = 256;
/** Light-map units a lamp of intensity 1 adds at its centre (the classic picture: 1.25). */
const LAMP_GAIN = 1.5;

/** The local player's own light: a glow round them… */
const AURA = { radius: 128, color: 0xf2e4c8, gain: 0.4 };
/** …and a beam where they aim. */
const BEAM = { radius: 250, color: 0xfff0d2, gain: 0.5, half: 0.5, soft: 0.26 };
/** Everybody else carries a small glow so they are never lost in the dark. */
const OTHERS = { radius: 64, color: 0xd8ccb8, gain: 0.34 };

/** A dynamic light's falloff, as a few straight pieces (its triangles carry the brightness at their corners). */
const BANDS = [0.3, 0.62, 1];
function fall(t: number): number {
  if (t <= 0.3) return 1 - 0.38 * (t / 0.3);
  if (t <= 0.62) return 0.62 - 0.42 * ((t - 0.3) / 0.32);
  return Math.max(0, 0.2 * (1 - (t - 0.62) / 0.38));
}

let lastBake: { key: string; baked: Baked } | null = null;

export class ShadowLights {
  private rt: Phaser.GameObjects.RenderTexture | null = null;
  private readonly index: OccluderIndex;
  private readonly baked: Baked;
  private readonly baseImg: Phaser.GameObjects.Image;
  private readonly cookieImgs: Array<{ index: number; img: Phaser.GameObjects.Image; x: number; y: number; size: number }> = [];
  private readonly fans: Phaser.GameObjects.Graphics;
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private used = 0;
  private flashes: Flash[] = [];
  private steady: Array<{ x: number; y: number; radius: number; color: number; intensity: number }> = [];
  private readonly vis = new Visibility();
  private readonly ambient: number;
  private readonly res: number;
  private readonly texKeys: string[] = [];
  private readonly drawList: Phaser.GameObjects.GameObject[] = [];
  private readonly nearScratch: Occluder[] = [];
  private tier: FableTier;
  /** How long the lamps took to bake, for the report. */
  readonly bakeMs: number;
  /** Shadowed lights cast last frame and the rays they took (for the performance read-out). */
  stats = { casts: 0, rays: 0, tris: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapDef,
    tier: FableTier,
    look: MapLook,
    private readonly blend: number,
    private readonly addBlend: number,
    /** The camera's zoom when nothing punches it in: the light map is sized for that view. */
    private readonly zoom: number,
  ) {
    this.tier = tier;
    const cfg = TIERS[tier];
    this.res = cfg.lightRes;
    this.index = new OccluderIndex(buildOccluders(map), map.width, map.height);
    // the night's own light: the map's tint, kept more of than the classic picture keeps, and darker
    const c = Phaser.Display.Color.IntegerToColor(map.ambient.color);
    const m = Math.max(c.red, c.green, c.blue, 1);
    const b = (0.42 + map.ambient.level * 0.4) * look.night;
    const ch = (v: number) => Math.min(255, Math.round(255 * 0.5 * b * (0.52 + 0.48 * (v / m))));
    const amb: [number, number, number] = [ch(c.red), ch(c.green), ch(c.blue)];
    this.ambient = Phaser.Display.Color.GetColor(amb[0], amb[1], amb[2]);
    const wet = look.weather === 'rain';
    const key = `${map.id}|${this.res}|${cfg.samples}|${amb.join(',')}|${wet}`;
    if (lastBake?.key === key) this.baked = lastBake.baked;
    else {
      this.baked = bakeLights(map, this.index, { res: this.res, samples: cfg.samples, ambient: amb, gain: LAMP_GAIN * 0.5, wet });
      lastBake = { key, baked: this.baked };
    }
    this.bakeMs = this.baked.ms;
    ensurePool(scene);
    const tm = scene.textures;
    const baseKey = `fable_base_${map.id}`;
    if (tm.exists(baseKey)) tm.remove(baseKey);
    tm.addCanvas(baseKey, this.baked.base)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.texKeys.push(baseKey);
    this.baseImg = scene.make.image({ key: baseKey, add: false }).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.NORMAL);
    for (const ck of this.baked.cookies) {
      const k = `fable_cookie_${map.id}_${ck.index}`;
      if (tm.exists(k)) tm.remove(k);
      tm.addCanvas(k, ck.canvas)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.texKeys.push(k);
      const img = scene.make.image({ key: k, add: false }).setOrigin(0, 0).setBlendMode(addBlend);
      this.cookieImgs.push({ index: ck.index, img, x: ck.x, y: ck.y, size: ck.size });
    }
    this.fans = scene.make.graphics({}, false).setBlendMode(addBlend);
  }

  /** Where the lamp's light comes from (a lamp on a wall: just off it). */
  origin(i: number): { x: number; y: number } {
    return this.baked.origins[i]!;
  }

  setTier(tier: FableTier): void {
    // the baked pictures stay as they were made; what is cast every frame follows the tier at once
    this.tier = tier;
  }

  setSteady(lights: Array<{ x: number; y: number; radius: number; color: number; intensity: number }>): void {
    this.steady = lights;
  }

  flash(x: number, y: number, radius: number, color: number, intensity: number, durationMs: number, now: number): void {
    // a muzzle pressed into a wall would light the room behind it: the light starts just off the wall
    const near = this.index.query(x - 2, y - 2, x + 2, y + 2, this.nearScratch, true);
    const p = near.length ? offTheWall(near, x, y) : { x, y };
    this.flashes.push({ x: p.x, y: p.y, radius, color, intensity, until: now + durationMs, born: now });
  }

  /**
   * The lamp light falling on a point: which way a shadow thrown there points and how strong it is.
   * `flick`: every lamp's brightness now.
   */
  lampAt(x: number, y: number, flick: number[], out: { dx: number; dy: number; k: number }): { dx: number; dy: number; k: number } {
    let sx = 0;
    let sy = 0;
    let sum = 0;
    const lights = this.map.lights;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i]!;
      const o = this.baked.origins[i]!;
      const dx = x - o.x;
      const dy = y - o.y;
      const d = Math.hypot(dx, dy);
      if (d >= l.radius || d < 0.5) continue;
      const w = l.intensity * (flick[i] ?? 1) * fall(d / l.radius);
      if (w < 0.04) continue;
      const near = this.index.query(Math.min(x, o.x), Math.min(y, o.y), Math.max(x, o.x), Math.max(y, o.y), this.nearScratch, true);
      if (!lightReaches(near, o.x, o.y, x, y)) continue;
      // a lamp overhead throws a short shadow, a far one a long one
      const reach = Math.min(1, d / 90);
      sx += (dx / d) * w * reach;
      sy += (dy / d) * w * reach;
      sum += w;
    }
    const len = Math.hypot(sx, sy);
    out.k = Math.min(1, sum);
    out.dx = len > 1e-4 ? sx / Math.max(sum, 1e-4) : 0;
    out.dy = len > 1e-4 ? sy / Math.max(sum, 1e-4) : 0;
    return out;
  }

  private ensureRT(w: number, h: number) {
    const even = (n: number) => n + (n % 2);
    const W = even(Math.ceil(w * this.res) + 2);
    const H = even(Math.ceil(h * this.res) + 2);
    if (this.rt && this.rt.width === W && this.rt.height === H) return this.rt;
    this.rt?.destroy();
    this.rt = this.scene.add
      .renderTexture(0, 0, W, H)
      .setOrigin(0, 0)
      .setDepth(D.LIGHT)
      .setScale(1 / this.res);
    this.rt.setBlendMode(this.blend);
    this.rt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return this.rt;
  }

  setVisible(v: boolean): void {
    this.rt?.setVisible(v);
  }

  update(now: number, players: LightPlayer[], flick: number[]): void {
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    // sized for the view at rest: a camera punching in sees less, never more, so nothing is re-made
    const rt = this.ensureRT(cam.width / this.zoom, cam.height / this.zoom);
    rt.setVisible(true);
    const res = this.res;
    const ox = Math.floor(view.x) - 1;
    const oy = Math.floor(view.y) - 1;
    rt.setPosition(ox, oy);
    const cfg = TIERS[this.tier];
    const list = this.drawList;
    list.length = 0;
    this.used = 0;
    this.stats.casts = 0;
    this.stats.rays = 0;
    this.stats.tris = 0;

    // the whole map's night and steady lamps: one picture
    this.baseImg.setPosition(-ox * res, -oy * res).setScale(res / this.baked.res);
    list.push(this.baseImg);
    // the lamps that flicker
    for (const c of this.cookieImgs) {
      const a = flick[c.index] ?? 1;
      if (a <= 0.02) continue;
      if (c.x + c.size < view.x || c.x > view.right || c.y + c.size < view.y || c.y > view.bottom) continue;
      c.img.setPosition((c.x - ox) * res, (c.y - oy) * res).setScale(res / this.baked.res).setAlpha(Math.min(1, a));
      list.push(c.img);
    }

    const g = this.fans;
    g.clear();
    let local: LightPlayer | null = null;
    for (const p of players) {
      if (!p.alive) continue;
      if (p.isLocal) local = p;
      else this.stamp(p.x - ox, p.y - oy, OTHERS.radius, OTHERS.color, OTHERS.gain, view, p.x, p.y);
    }
    if (local) {
      if (cfg.playerShadows) {
        const aim = local.aim ?? 0;
        this.vis.compute(this.index, local.x, local.y, BEAM.radius, 72, beamRays(aim));
        this.stats.casts++;
        this.stats.rays += this.vis.n;
        this.fan(g, local.x, local.y, AURA.radius, AURA.color, AURA.gain * 0.5, ox, oy, null);
        this.fan(g, local.x, local.y, BEAM.radius, BEAM.color, BEAM.gain * 0.5, ox, oy, aim);
      } else this.stamp(local.x - ox, local.y - oy, AURA.radius * 1.1, AURA.color, AURA.gain * 1.15, view, local.x, local.y);
    }
    for (const l of this.steady) this.stamp(l.x - ox, l.y - oy, l.radius, l.color, l.intensity, view, l.x, l.y);

    // flashes: the brightest few throw shadows, the rest are plain pools
    this.flashes = this.flashes.filter((f) => f.until > now);
    let budget = cfg.shadowFlashes;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]!;
      if (f.x + f.radius < view.x || f.x - f.radius > view.right || f.y + f.radius < view.y || f.y - f.radius > view.bottom) continue;
      const k = 1 - (now - f.born) / Math.max(1, f.until - f.born);
      const gain = f.intensity * k;
      if (gain <= 0.02) continue;
      // a flashbang fills the screen whatever stands in its way; small sparks are not worth a cast
      if (budget > 0 && f.radius >= 60 && f.radius <= 420) {
        budget--;
        this.vis.compute(this.index, f.x, f.y, f.radius, 40);
        this.stats.casts++;
        this.stats.rays += this.vis.n;
        this.fan(g, f.x, f.y, f.radius, f.color, Math.min(1, gain * 0.5), ox, oy, null);
      } else this.stamp(f.x - ox, f.y - oy, f.radius, f.color, gain, view, f.x, f.y);
    }
    for (let i = 0; i < this.used; i++) list.push(this.pool[i]!);
    list.push(g);

    const r = this.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    r.setBlendMode(Phaser.BlendModes.NORMAL);
    // past the map's edge there is only the night
    rt.fill(this.ambient, 1);
    rt.draw(list);
  }

  /** A plain pool (no shadows); `gain` in scene-multiplier units, as in the classic light map. */
  private stamp(lx: number, ly: number, radius: number, color: number, gain: number, view: Phaser.Geom.Rectangle, wx: number, wy: number) {
    if (wx + radius < view.x || wx - radius > view.right || wy + radius < view.y || wy - radius > view.bottom) return;
    let img = this.pool[this.used];
    if (!img) {
      img = this.scene.make.image({ key: POOL_TEX, add: false }).setOrigin(0.5, 0.5).setBlendMode(this.addBlend);
      this.pool.push(img);
    }
    this.used++;
    img
      .setPosition(lx * this.res, ly * this.res)
      .setScale((radius * 2 * this.res) / POOL_SIZE)
      .setTint(color)
      .setAlpha(Math.min(1, gain * 0.5));
  }

  /**
   * Draws what the last cast saw as a fan of triangles, brightness at their corners: the centre, then a ring
   * per falloff band, each ray cut where it met a wall. `aim`: a beam that way (null: all round).
   */
  private fan(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, color: number, peak: number, ox: number, oy: number, aim: number | null) {
    const { n, ang, dist } = this.vis;
    if (n < 3) return;
    const res = this.res;
    const cx = (x - ox) * res;
    const cy = (y - oy) * res;
    let tris = 0;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      const ai = ang[i]!;
      const aj = ang[j]!;
      const wi = aim === null ? 1 : beamWeight(ai - aim);
      const wj = aim === null ? 1 : beamWeight(aj - aim);
      if (wi <= 0 && wj <= 0) continue;
      const di = Math.min(dist[i]!, radius);
      const dj = Math.min(dist[j]!, radius);
      const cxi = Math.cos(ai);
      const syi = Math.sin(ai);
      const cxj = Math.cos(aj);
      const syj = Math.sin(aj);
      let pi = 0;
      let pj = 0;
      let ali = peak * (wi + wj) * 0.5;
      let alj = ali;
      let xi = cx;
      let yi = cy;
      let xj = cx;
      let yj = cy;
      for (let b = 0; b < BANDS.length; b++) {
        const edge = BANDS[b]! * radius;
        const ni = Math.min(di, edge);
        const nj = Math.min(dj, edge);
        if (ni <= pi && nj <= pj) break;
        const nxi = cx + cxi * ni * res;
        const nyi = cy + syi * ni * res;
        const nxj = cx + cxj * nj * res;
        const nyj = cy + syj * nj * res;
        const nai = peak * wi * fall(ni / radius);
        const naj = peak * wj * fall(nj / radius);
        if (b === 0) {
          g.fillGradientStyle(color, color, color, color, ali, nai, naj, naj);
          g.fillTriangle(cx, cy, nxi, nyi, nxj, nyj);
          tris++;
        } else {
          g.fillGradientStyle(color, color, color, color, ali, nai, naj, naj);
          g.fillTriangle(xi, yi, nxi, nyi, nxj, nyj);
          g.fillGradientStyle(color, color, color, color, ali, naj, alj, alj);
          g.fillTriangle(xi, yi, nxj, nyj, xj, yj);
          tris += 2;
        }
        pi = ni;
        pj = nj;
        xi = nxi;
        yi = nyi;
        xj = nxj;
        yj = nyj;
        ali = nai;
        alj = naj;
      }
    }
    this.stats.tris += tris;
  }

  destroy(): void {
    this.rt?.destroy();
    this.rt = null;
    this.baseImg.destroy();
    for (const c of this.cookieImgs) c.img.destroy();
    this.cookieImgs.length = 0;
    for (const img of this.pool) img.destroy();
    this.pool.length = 0;
    this.fans.destroy();
    for (const k of this.texKeys) if (this.scene.textures.exists(k)) this.scene.textures.remove(k);
    this.texKeys.length = 0;
  }
}

/** How much of the beam a direction gets: all of it inside the cone, fading over its soft edge. */
function beamWeight(delta: number): number {
  const d = Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
  if (d <= BEAM.half) return 1;
  if (d >= BEAM.half + BEAM.soft) return 0;
  const t = 1 - (d - BEAM.half) / BEAM.soft;
  return t * t * (3 - 2 * t);
}

const beamScratch: number[] = [];
/** Extra rays across the beam and its edges, so its outline turns smoothly with the aim. */
function beamRays(aim: number): number[] {
  beamScratch.length = 0;
  const span = BEAM.half + BEAM.soft;
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const a = aim - span + (i / steps) * span * 2;
    beamScratch.push(Math.atan2(Math.sin(a), Math.cos(a)));
  }
  return beamScratch;
}

function ensurePool(scene: Phaser.Scene): void {
  const tm = scene.textures;
  if (tm.exists(POOL_TEX)) return;
  const t = tm.createCanvas(POOL_TEX, POOL_SIZE, POOL_SIZE)!;
  const ctx = t.getContext();
  const c = POOL_SIZE / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  for (const [o, a] of POOL_STOPS) g.addColorStop(o, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, POOL_SIZE, POOL_SIZE);
  t.refresh();
  t.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

export { flickers };
