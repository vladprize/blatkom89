/**
 * Capture the flag and base capture in the world: flag stands, the flags themselves (standing on
 * the stand, riding on a carrier's back, lying where they fell with the «back home» countdown) and
 * the three bases with their zone, capture bar, letter and a flagpole that raises the owner's flag.
 * Everything is drawn from session state every frame; one-off feedback comes from session events.
 */
import * as Phaser from 'phaser';
import { BASE_RULES, CTF_RULES } from '@blatkom/shared';
import type { Team } from '@blatkom/shared';
import type { RenderBase, RenderFlag, RenderPlayer } from '../session/types.js';
import type { Lighting } from './Lighting.js';
import { D } from './depth.js';

/** Cloth, darker fold and light (star, rim) per team: red 0, blue 1. */
export const TEAM_CLOTH = [0xd8392e, 0x3d8ee0] as const;
const TEAM_FOLD = [0x8a1a16, 0x1f4f88] as const;
const TEAM_LIGHT = [0xffd36a, 0xe8f2ff] as const;
const NEUTRAL = 0xd9c7a3;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export class ObjectiveView {
  /** Under the light map: stands, zones, lying flags. */
  private readonly ground: Phaser.GameObjects.Graphics;
  /** Standing / carried flags (above characters' torsos, still under the light map). */
  private readonly flagsGfx: Phaser.GameObjects.Graphics;
  /** Above the light map: zone rims and capture bars stay readable in the dark. */
  private readonly over: Phaser.GameObjects.Graphics;
  private readonly glows: Phaser.GameObjects.Image[] = [];
  private readonly letters: Phaser.GameObjects.Text[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly lighting: Lighting,
  ) {
    this.ground = scene.add.graphics().setDepth(D.DECAL + 0.4);
    this.flagsGfx = scene.add.graphics().setDepth(D.TORSO + 0.3);
    this.over = scene.add.graphics().setDepth(D.LIGHT + 0.6);
  }

  update(flags: RenderFlag[], bases: RenderBase[], players: RenderPlayer[], now: number): void {
    this.ground.clear();
    this.flagsGfx.clear();
    this.over.clear();
    const lights: Array<{ x: number; y: number; radius: number; color: number; intensity: number }> = [];
    let glow = 0;
    const glowAt = (x: number, y: number, color: number, scale: number, alpha: number) => {
      let g = this.glows[glow];
      if (!g) {
        g = this.scene.add.image(0, 0, 'fx', 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(D.LIGHT + 0.4);
        this.glows.push(g);
      }
      glow++;
      g.setVisible(true).setPosition(x, y).setTint(color).setScale(scale).setAlpha(alpha);
    };

    // ── bases ──
    bases.forEach((b, i) => {
      const R = BASE_RULES.radius;
      const own = b.owner;
      const color = own === null ? NEUTRAL : TEAM_CLOTH[own];
      this.ground.fillStyle(color, own === null ? 0.07 : 0.16).fillCircle(b.x, b.y, R);
      // painted ring of the zone on the floor
      this.dashedCircle(this.ground, b.x, b.y, R - 1, 2, color, own === null ? 0.35 : 0.6, 24);
      const blink = b.contested && Math.floor(now / 220) % 2 === 0;
      this.dashedCircle(this.over, b.x, b.y, R, 1.2, blink ? 0xffffff : color, blink ? 0.9 : 0.45, 24);
      // capture bar: from the top, clockwise, in the capturing team's colour
      if (b.capturer !== null && b.progress > 0.002) {
        this.over.lineStyle(3, TEAM_CLOTH[b.capturer], 0.95);
        this.over.beginPath();
        this.over.arc(b.x, b.y, R + 3, -Math.PI / 2, -Math.PI / 2 + b.progress * Math.PI * 2, false);
        this.over.strokePath();
      }
      // the flagpole: the owner's flag at the top; while a team captures, its flag climbs (or the old one comes down)
      let cloth: Team | null = own;
      let height = own === null ? 0 : 1;
      if (b.capturer !== null && b.progress > 0) {
        if (own === null) {
          cloth = b.capturer;
          height = b.progress;
        } else if (own !== b.capturer) height = 1 - b.progress;
      }
      this.pole(this.flagsGfx, b.x, b.y, 24, now, cloth, height, 0.8);
      lights.push({ x: b.x, y: b.y, radius: 90, color: own === null ? 0xd8ccb8 : TEAM_CLOTH[own], intensity: own === null ? 0.18 : 0.32 });
      let label = this.letters[i];
      if (!label) {
        label = this.scene.add
          .text(0, 0, LETTERS[i] ?? '?', { fontFamily: 'Oswald, sans-serif', fontSize: '13px', fontStyle: '700', color: '#f2e6c8', stroke: '#0b0908', strokeThickness: 3, resolution: 4 })
          .setOrigin(0.5)
          .setDepth(D.LIGHT + 0.7);
        this.letters.push(label);
      }
      label.setVisible(true).setPosition(b.x, b.y + R - 10).setColor(own === null ? '#f2e6c8' : own === 0 ? '#ff9a8a' : '#a8d4ff');
    });
    for (let i = bases.length; i < this.letters.length; i++) this.letters[i]!.setVisible(false);

    // ── flags ──
    for (const f of flags) {
      const away = f.status !== 'home';
      // the stand: a metal plate with the team rim; dashed when its flag is away
      this.ground.fillStyle(0x24201c, 0.95).fillCircle(f.standX, f.standY, 10);
      if (away) this.dashedCircle(this.ground, f.standX, f.standY, 11, 2, TEAM_CLOTH[f.team], 0.8, 10);
      else this.ground.lineStyle(2, TEAM_CLOTH[f.team], 0.95).strokeCircle(f.standX, f.standY, 11);
      this.ground.fillStyle(TEAM_FOLD[f.team], 0.9).fillCircle(f.standX, f.standY, 4);
      // capture zone hint around the stand
      this.dashedCircle(this.over, f.standX, f.standY, CTF_RULES.touchRadius + 6, 1, TEAM_CLOTH[f.team], away ? 0.25 : 0.45, 14);
      lights.push({ x: f.standX, y: f.standY, radius: 70, color: TEAM_CLOTH[f.team], intensity: away ? 0.15 : 0.3 });
      if (f.status === 'home') {
        this.pole(this.flagsGfx, f.standX, f.standY, 34, now, f.team, 1, 1.15);
        glowAt(f.standX + 10, f.standY - 30, TEAM_CLOTH[f.team], 0.6, 0.3 + Math.sin(now / 300 + f.team) * 0.08);
      } else if (f.status === 'carried') {
        const c = players.find((p) => p.slot === f.carrier && p.alive);
        const x = c ? c.x : f.x;
        const y = c ? c.y : f.y;
        const aim = c ? c.aim : 0;
        // on the carrier's back, leaning away from where they look
        const bx = x - Math.cos(aim) * 7;
        const by = y - Math.sin(aim) * 7;
        this.pole(this.flagsGfx, bx, by, 26, now * 1.8, f.team, 1, 1.05);
        glowAt(bx + 9, by - 22, TEAM_CLOTH[f.team], 0.6, 0.38 + Math.sin(now / 120) * 0.12);
        lights.push({ x, y, radius: 64, color: TEAM_CLOTH[f.team], intensity: 0.38 });
      } else {
        this.lying(this.ground, f.x, f.y, f.team);
        // «goes home in …»: a draining ring
        const k = Math.max(0, Math.min(1, f.returnInMs / CTF_RULES.returnMs));
        this.over.lineStyle(2, TEAM_CLOTH[f.team], 0.9);
        this.over.beginPath();
        this.over.arc(f.x, f.y, 20, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2, false);
        this.over.strokePath();
        glowAt(f.x, f.y, TEAM_CLOTH[f.team], 0.5, 0.3 + Math.sin(now / 160) * 0.15);
        lights.push({ x: f.x, y: f.y, radius: 56, color: TEAM_CLOTH[f.team], intensity: 0.3 });
      }
    }
    for (let i = glow; i < this.glows.length; i++) this.glows[i]!.setVisible(false);
    this.lighting.setSteady(lights);
  }

  /**
   * A flagpole standing at (x, y), drawn leaning slightly «up» the screen (the usual top-down
   * convention for tall things); `height` 0..1 places the cloth along the pole.
   */
  private pole(g: Phaser.GameObjects.Graphics, x: number, y: number, len: number, now: number, team: Team | null, height: number, scale: number) {
    const tx = x + 3 * scale;
    const ty = y - len * scale;
    // shadow on the floor, then the pole with a knob
    g.lineStyle(2 * scale, 0x000000, 0.28).lineBetween(x, y, x + len * 0.42 * scale, y + len * 0.2 * scale);
    g.lineStyle(1.6 * scale, 0x1a1612, 1).lineBetween(x, y, tx, ty);
    g.lineStyle(0.8 * scale, 0xb8b0a0, 0.9).lineBetween(x + 0.4, y - 1, tx + 0.4, ty + 1);
    g.fillStyle(0xd8b04a, 1).fillCircle(tx, ty - 0.6, 1.3 * scale);
    if (team === null) return;
    const h = Math.max(0, Math.min(1, height));
    // the cloth hangs from a point on the pole: bottom (h = 0) to the top (h = 1)
    const ax = x + (tx - x) * (0.25 + 0.75 * h);
    const ay = y + (ty - y) * (0.25 + 0.75 * h);
    this.cloth(g, ax, ay, 17 * scale, 11 * scale, now, team);
  }

  /** A waving cloth hung at (x, y), extending right. */
  private cloth(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, hgt: number, now: number, team: Team) {
    const n = 6;
    const top: Phaser.Math.Vector2[] = [];
    const bottom: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const wave = Math.sin(now / 140 - u * 5.5 + team) * 1.8 * u;
      top.push(new Phaser.Math.Vector2(x + u * w, y + wave));
      bottom.push(new Phaser.Math.Vector2(x + u * w, y + hgt + wave * 1.1));
    }
    g.fillStyle(TEAM_CLOTH[team], 1).fillPoints([...top, ...bottom.reverse()], true);
    // folds: darker bands where the wave turns
    for (let i = 1; i < n; i += 2) {
      const a = top[i]!;
      const b2 = top[i + 1]!;
      g.fillStyle(TEAM_FOLD[team], 0.45).fillTriangle(a.x, a.y, b2.x, b2.y, a.x, a.y + hgt);
    }
    // a five-pointed star in the cloth's corner
    const sx = x + w * 0.3;
    const sy = y + hgt * 0.45 + Math.sin(now / 140 - 1.6 + team) * 0.5;
    const r = hgt * 0.26;
    const pts: Phaser.Math.Vector2[] = [];
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 === 0 ? r : r * 0.45;
      pts.push(new Phaser.Math.Vector2(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr));
    }
    g.fillStyle(TEAM_LIGHT[team], 0.95).fillPoints(pts, true);
    g.lineStyle(0.6, 0x0b0908, 0.6).strokePoints([...top, ...bottom], true);
  }

  /** A dropped flag lying on the floor (pole across, cloth crumpled beside it). */
  private lying(g: Phaser.GameObjects.Graphics, x: number, y: number, team: Team) {
    const v = (dx: number, dy: number) => new Phaser.Math.Vector2(x + dx, y + dy);
    g.fillStyle(0x000000, 0.3).fillEllipse(x + 2, y + 4, 30, 12);
    g.lineStyle(2, 0x1a1612, 1).lineBetween(x - 15, y + 7, x + 13, y - 5);
    g.lineStyle(0.8, 0xb8b0a0, 0.9).lineBetween(x - 14, y + 6, x + 12, y - 5);
    g.fillStyle(TEAM_CLOTH[team], 1).fillPoints([v(-6, 3), v(10, -4), v(16, 8), v(0, 15)], true);
    g.fillStyle(TEAM_FOLD[team], 0.55).fillTriangle(x + 2, y + 1, x + 13, y + 2, x + 5, y + 12);
    g.fillStyle(TEAM_LIGHT[team], 0.9).fillCircle(x + 4, y + 5, 1.6);
    g.lineStyle(0.6, 0x0b0908, 0.6).strokePoints([v(-6, 3), v(10, -4), v(16, 8), v(0, 15)], true);
  }

  private dashedCircle(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, width: number, color: number, alpha: number, dashes: number) {
    g.lineStyle(width, color, alpha);
    const step = (Math.PI * 2) / dashes;
    for (let i = 0; i < dashes; i++) {
      g.beginPath();
      g.arc(x, y, r, i * step, i * step + step * 0.55, false);
      g.strokePath();
    }
  }

  destroy(): void {
    this.ground.destroy();
    this.flagsGfx.destroy();
    this.over.destroy();
    for (const g of this.glows) g.destroy();
    for (const t of this.letters) t.destroy();
    this.lighting.setSteady([]);
  }
}
