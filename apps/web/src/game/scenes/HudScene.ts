/**
 * Screen-space HUD in the БЛАТКОМ ’89 VHS style: score/timer, kill feed, minimap, health with
 * portrait, weapon & ammo with slots, centre messages, hit markers, scoreboard and touch controls.
 */
import * as Phaser from 'phaser';
import { CHARACTERS, getMap, PROP_DEFS, propFootprint, WEAPONS } from '@blatkom/shared';
import type { MapDef, WeaponId } from '@blatkom/shared';
import type { GameSession, RenderPlayer } from '../session/types.js';
import { hudBus } from './hudBus.js';
import type { KillFeedEntry } from './hudBus.js';
import { touchState, isTouchDevice } from '../input/TouchState.js';
import { getSettings, storageGet, storageSet } from '../../app/settings.js';
import { analytics } from '../../analytics/client.js';

const TUTORIAL_KEY = 'blatkom89.tutorial.v1';

const BEIGE = '#e8dcc0';
const RED = '#d8392e';
const BLUE = '#4a9be0';
const FONT = 'Oswald, "PT Sans Narrow", sans-serif';
const PANEL = 0x0d0b0a;

interface FeedLine {
  container: Phaser.GameObjects.Container;
  born: number;
}

interface Stick {
  id: number | null;
  baseX: number;
  baseY: number;
  base: Phaser.GameObjects.Image;
  knob: Phaser.GameObjects.Image;
  x: number;
  y: number;
}

interface Btn {
  x: number;
  y: number;
  r: number;
  ring: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  pointer: number | null;
  onDown: () => void;
  onUp?: () => void;
  visible: boolean;
}

function txt(scene: Phaser.Scene, x: number, y: number, s: string, size: number, color = BEIGE, weight = '600'): Phaser.GameObjects.Text {
  return scene.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: weight, color, stroke: '#0b0908', strokeThickness: Math.max(2, size / 7) });
}

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export class HudScene extends Phaser.Scene {
  private session!: GameSession;
  private map!: MapDef;
  private touch = false;
  // score box
  private scoreBg!: Phaser.GameObjects.Graphics;
  private myScore!: Phaser.GameObjects.Text;
  private leadScore!: Phaser.GameObjects.Text;
  private timer!: Phaser.GameObjects.Text;
  private mode!: Phaser.GameObjects.Text;
  // feed
  private feed: FeedLine[] = [];
  // minimap
  private mm!: Phaser.GameObjects.RenderTexture;
  private mmDots!: Phaser.GameObjects.Graphics;
  private mmLabel!: Phaser.GameObjects.Container;
  private mmScale = 0.1;
  private mmW = 150;
  private mmH = 110;
  // health
  private healthBg!: Phaser.GameObjects.Graphics;
  private portrait!: Phaser.GameObjects.Image;
  private nameText!: Phaser.GameObjects.Text;
  private feedY0 = 14;
  private tutorial: Phaser.GameObjects.Container | null = null;
  private tutorialState: { moved: boolean; fired: boolean; startX: number; startY: number; startMag: number; shownAt: number } | null = null;
  private hpText!: Phaser.GameObjects.Text;
  private hpBar!: Phaser.GameObjects.Graphics;
  // weapon
  private weaponBg!: Phaser.GameObjects.Graphics;
  private weaponIcon!: Phaser.GameObjects.Image;
  private ammoText!: Phaser.GameObjects.Text;
  private weaponName!: Phaser.GameObjects.Text;
  private slotGfx!: Phaser.GameObjects.Graphics;
  private slotIcons: Phaser.GameObjects.Image[] = [];
  private slotNums: Phaser.GameObjects.Text[] = [];
  // centre
  private bigText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private hitMarker!: Phaser.GameObjects.Graphics;
  private hitUntil = 0;
  private hitKill = false;
  private goUntil = 0;
  private scoreboard!: Phaser.GameObjects.Container;
  private scoreboardVisible = false;
  private fpsText: Phaser.GameObjects.Text | null = null;
  private lastShotAt = new Map<number, number>();
  // touch
  private sticks: Stick[] = [];
  private buttons: Btn[] = [];
  private interactBtn: Btn | null = null;
  private pauseBtn!: Phaser.GameObjects.Container;
  private layoutW = 0;
  private layoutH = 0;

  constructor() {
    super('hud');
  }

  init(data: { session: GameSession }): void {
    this.session = data.session;
    this.map = getMap(this.session.mapId);
    this.feed = [];
    this.sticks = [];
    this.buttons = [];
    this.slotIcons = [];
    this.slotNums = [];
    this.lastShotAt.clear();
  }

  create(): void {
    this.touch = isTouchDevice();
    touchState.enabled = this.touch;
    this.input.addPointer(3);
    this.buildScoreBox();
    this.buildMinimap();
    this.buildHealth();
    this.buildWeapon();
    this.buildCentre();
    this.buildScoreboard();
    this.buildPause();
    if (this.touch) this.buildTouch();
    this.buildTutorial();
    if (getSettings().showFps) this.fpsText = txt(this, 6, 0, '', 11, '#9a9080', '400').setDepth(100);
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    hudBus.on('killfeed', this.onKillFeed, this);
    hudBus.on('hitmarker', this.onHitMarker, this);
    hudBus.on('scoreboard', this.onScoreboard, this);
    hudBus.on('phase', this.onPhase, this);
    hudBus.on('radar', this.onRadar, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      hudBus.off('killfeed', this.onKillFeed, this);
      hudBus.off('hitmarker', this.onHitMarker, this);
      hudBus.off('scoreboard', this.onScoreboard, this);
      hudBus.off('phase', this.onPhase, this);
      hudBus.off('radar', this.onRadar, this);
      touchState.moveX = touchState.moveY = 0;
      touchState.aimActive = false;
      touchState.fireHeld = false;
    });
  }

  // ── building blocks ─────────────────────────────────────────────────────
  private panel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, alpha = 0.78) {
    g.fillStyle(PANEL, alpha).fillRect(x, y, w, h);
    g.lineStyle(1, 0x3a3128, 1).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.lineStyle(1, 0xd9c7a3, 0.18);
    for (let i = x + 4; i < x + w - 4; i += 6) {
      g.lineBetween(i, y + 3.5, i + 3, y + 3.5);
      g.lineBetween(i, y + h - 3.5, i + 3, y + h - 3.5);
    }
  }

  private tape(label: string, size = 11): Phaser.GameObjects.Container {
    const t = txt(this, 0, 0, label, size, '#1a1410', '600').setStroke('#000', 0).setOrigin(0.5);
    const w = t.width + 16;
    const h = t.height + 4;
    const g = this.add.graphics();
    g.fillStyle(0xd9c7a3, 0.95).fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle(0x0d0b0a, 0.5);
    for (let i = -w / 2; i < w / 2; i += 4) g.fillRect(i, -h / 2, 2, 1).fillRect(i + 1, h / 2 - 1, 2, 1);
    return this.add.container(0, 0, [g, t]).setAngle(-2);
  }

  private buildScoreBox() {
    this.scoreBg = this.add.graphics();
    this.myScore = txt(this, 0, 0, '0', 26, BEIGE, '700').setOrigin(0.5);
    this.leadScore = txt(this, 0, 0, '0', 26, BEIGE, '700').setOrigin(0.5);
    this.timer = txt(this, 0, 0, '00:00', 24, BEIGE, '600').setOrigin(0.5, 0);
    this.mode = txt(this, 0, 0, 'ДЕЗМАТЧ', 10, '#b8a888', '500').setOrigin(0.5, 0);
  }

  private buildMinimap() {
    const m = this.map;
    const maxW = this.touch ? 118 : 150;
    this.mmScale = Math.min(maxW / m.width, (this.touch ? 86 : 112) / m.height);
    this.mmW = Math.ceil(m.width * this.mmScale);
    this.mmH = Math.ceil(m.height * this.mmScale);
    this.mm = this.add.renderTexture(0, 0, this.mmW + 4, this.mmH + 4).setOrigin(0, 0);
    const g = this.make.graphics({}, false);
    const s = this.mmScale;
    g.fillStyle(0x0b0908, 0.92).fillRect(0, 0, this.mmW + 4, this.mmH + 4);
    g.fillStyle(Phaser.Display.Color.HexStringToColor(m.minimapFloor).color, 1).fillRect(2, 2, this.mmW, this.mmH);
    for (const f of m.floors) g.fillStyle(0x47423b, 0.35).fillRect(2 + f.x * s, 2 + f.y * s, f.w * s, f.h * s);
    for (const p of m.props) {
      const d = PROP_DEFS[p.type];
      if (d.shape === 'none') continue;
      const fp = propFootprint(d, p.rot);
      g.fillStyle(d.layer === 'high' ? 0x1e1b18 : 0x5c564c, 1).fillRect(2 + (p.x - fp.w / 2) * s, 2 + (p.y - fp.h / 2) * s, Math.max(1, fp.w * s), Math.max(1, fp.h * s));
    }
    for (const w of m.walls) g.fillStyle(w.style === 'fence_chain' ? 0x7a7e84 : 0x151210, 1).fillRect(2 + w.x * s, 2 + w.y * s, Math.max(1, w.w * s), Math.max(1, w.h * s));
    g.lineStyle(1, 0xd9c7a3, 0.5).strokeRect(0.5, 0.5, this.mmW + 3, this.mmH + 3);
    this.mm.draw(g, 0, 0);
    g.destroy();
    this.mmDots = this.add.graphics();
    this.mmLabel = this.tape(m.name.toUpperCase(), this.touch ? 9 : 10);
  }

  private buildHealth() {
    this.healthBg = this.add.graphics();
    const me = this.session.players().find((p) => p.isLocal);
    const c = me?.character ?? 'petya';
    this.portrait = this.add.image(0, 0, this.touch ? `portrait_small_${c}` : `portrait_${c}`).setOrigin(0, 0);
    this.nameText = txt(this, 0, 0, me?.name ?? CHARACTERS[c].name, this.touch ? 12 : 15, BEIGE, '600');
    this.hpText = txt(this, 0, 0, '100/100', this.touch ? 12 : 15, BEIGE, '500');
    this.hpBar = this.add.graphics();
  }

  private buildWeapon() {
    this.weaponBg = this.add.graphics();
    this.weaponIcon = this.add.image(0, 0, 'fx', 'ico_pistol').setOrigin(0.5);
    this.ammoText = txt(this, 0, 0, '8/∞', this.touch ? 16 : 22, BEIGE, '600').setOrigin(0.5, 0);
    this.weaponName = txt(this, 0, 0, '', 10, '#b8a888', '500').setOrigin(0.5, 0);
    this.slotGfx = this.add.graphics();
    for (let i = 0; i < 3; i++) {
      this.slotIcons.push(this.add.image(0, 0, 'fx', 'ico_pistol').setOrigin(0.5));
      this.slotNums.push(txt(this, 0, 0, String(i + 1), 10, '#1a1410', '700').setStroke('#000', 0).setOrigin(0.5));
    }
  }

  private buildCentre() {
    this.bigText = txt(this, 0, 0, '', 64, BEIGE, '700').setOrigin(0.5).setDepth(20);
    this.subText = txt(this, 0, 0, '', 16, BEIGE, '500').setOrigin(0.5).setDepth(20);
    this.promptText = txt(this, 0, 0, '', 14, BEIGE, '600').setOrigin(0.5).setDepth(20);
    this.statusText = txt(this, 0, 0, '', 11, '#9a9080', '500').setOrigin(1, 0).setDepth(20);
    this.hitMarker = this.add.graphics().setDepth(21);
  }

  /** First match ever: a short controls card until the player has moved and fired (then never again). */
  private buildTutorial() {
    this.tutorial = null;
    this.tutorialState = null;
    if (storageGet(TUTORIAL_KEY)) return;
    const lines = this.touch
      ? ['Левый стик — движение', 'Правый стик — прицел и огонь', '⟳ — перезарядка · ⇄ — смена оружия', 'Подходи к оружию на полу, чтобы взять']
      : ['WASD — движение · Shift — шагом', 'Мышь — прицел · ЛКМ — огонь', 'R — перезарядка · 1/2/3, Q — оружие', 'E — взять оружие · Tab — счёт · Esc — пауза'];
    const title = txt(this, 0, 0, 'КАК ВЕСТИ ДЕЛА', 13, '#1a1410', '700').setStroke('#000', 0).setOrigin(0.5, 0);
    const body = txt(this, 0, 0, lines.join('\n'), this.touch ? 12 : 14, BEIGE, '500').setOrigin(0.5, 0).setAlign('center').setLineSpacing(4);
    const w = Math.max(title.width, body.width) + 32;
    const h = title.height + body.height + 26;
    const g = this.add.graphics();
    this.panel(g, -w / 2, 0, w, h, 0.86);
    g.fillStyle(0xd9c7a3, 0.95).fillRect(-title.width / 2 - 8, -6, title.width + 16, title.height + 4);
    title.setY(-4);
    body.setY(title.height + 8);
    this.tutorial = this.add.container(0, 0, [g, title, body]).setDepth(19);
    this.tutorialState = { moved: false, fired: false, startX: NaN, startY: NaN, startMag: -1, shownAt: 0 };
  }

  private updateTutorial(me: RenderPlayer | undefined, mag: number, weapon: WeaponId, phase: string, time: number) {
    const t = this.tutorial;
    const st = this.tutorialState;
    if (!t || !st) return;
    const W = this.scale.width;
    const H = this.scale.height;
    t.setPosition(W / 2, this.touch ? H * 0.2 : H * 0.18);
    // stays out of the way of the countdown and the «go» flash in the centre of the screen
    t.setVisible(phase === 'active' && time > this.goUntil);
    if (phase !== 'active' || !me || !me.alive) return;
    if (!st.shownAt) st.shownAt = time;
    if (Number.isNaN(st.startX)) {
      st.startX = me.x;
      st.startY = me.y;
    }
    if (st.startMag < 0 || weapon !== 'pistol') st.startMag = Math.max(st.startMag, mag);
    if (Math.hypot(me.x - st.startX, me.y - st.startY) > 40) st.moved = true;
    if (mag < st.startMag) st.fired = true;
    const done = st.moved && st.fired;
    if (done || time - st.shownAt > 30_000) {
      storageSet(TUTORIAL_KEY, '1');
      if (done) analytics.track('tutorial_completed', { step: 'controls' });
      this.tweens.add({ targets: t, alpha: 0, duration: 500, onComplete: () => t.destroy() });
      this.tutorial = null;
      this.tutorialState = null;
    }
  }

  private buildScoreboard() {
    this.scoreboard = this.add.container(0, 0).setDepth(30).setVisible(false);
  }

  private buildPause() {
    const g = this.add.graphics();
    g.fillStyle(PANEL, 0.7).fillRect(-17, -17, 34, 34);
    g.lineStyle(1, 0xd9c7a3, 0.5).strokeRect(-16.5, -16.5, 33, 33);
    const icon = this.add.image(0, 0, 'fx', 'ico_pause').setScale(0.7);
    this.pauseBtn = this.add.container(0, 0, [g, icon]).setSize(40, 40).setDepth(25);
    this.pauseBtn.setInteractive({ useHandCursor: true }).on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      void p;
      hudBus.emit('pause');
    });
  }

  private buildTouch() {
    const mk = (): Stick => ({
      id: null,
      baseX: 0,
      baseY: 0,
      x: 0,
      y: 0,
      base: this.add.image(0, 0, 'fx', 'joy_base').setAlpha(0.5).setDepth(40),
      knob: this.add.image(0, 0, 'fx', 'joy_knob').setAlpha(0.75).setDepth(41),
    });
    this.sticks = [mk(), mk()];
    const btn = (icon: string, r: number, onDown: () => void, onUp?: () => void): Btn => {
      const ring = this.add.image(0, 0, 'fx', 'btn_ring').setDepth(40).setAlpha(0.8);
      const ic = this.add.image(0, 0, 'fx', icon).setDepth(41);
      return { x: 0, y: 0, r, ring, icon: ic, pointer: null, onDown, onUp, visible: true };
    };
    const fire = btn(
      'ico_fire',
      44,
      () => (touchState.fireHeld = true),
      () => (touchState.fireHeld = false),
    );
    const reload = btn('ico_reload', 32, () => (touchState.reloadTap = true));
    const swap = btn('ico_swap', 32, () => (touchState.swapTap = true));
    this.interactBtn = btn('ico_hand', 36, () => (touchState.interactTap = true));
    this.buttons = [fire, reload, swap, this.interactBtn];
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
  }

  // ── touch handling ─────────────────────────────────────────────────────
  private stickRadius() {
    return 58 * getSettings().stickScale;
  }

  private onPointerDown(p: Phaser.Input.Pointer) {
    if (!p.wasTouch) return;
    for (const b of this.buttons) {
      if (!b.visible) continue;
      if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 <= (b.r + 8) ** 2) {
        b.pointer = p.id;
        b.onDown();
        b.ring.setAlpha(1).setTint(0xffb8a8);
        return;
      }
    }
    const W = this.scale.width;
    const left = getSettings().leftHanded ? p.x > W * 0.5 : p.x < W * 0.5;
    const stick = left ? this.sticks[0]! : this.sticks[1]!;
    if (stick.id !== null) return;
    stick.id = p.id;
    stick.baseX = p.x;
    stick.baseY = p.y;
    stick.x = 0;
    stick.y = 0;
    this.updateStick(stick, left);
  }

  private onPointerMove(p: Phaser.Input.Pointer) {
    for (const [i, s] of this.sticks.entries()) {
      if (s.id !== p.id) continue;
      const R = this.stickRadius();
      let dx = p.x - s.baseX;
      let dy = p.y - s.baseY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > R) {
        // drag the base along so the stick never "sticks" at the edge
        s.baseX += (dx / d) * (d - R);
        s.baseY += (dy / d) * (d - R);
        dx = p.x - s.baseX;
        dy = p.y - s.baseY;
      }
      s.x = dx / R;
      s.y = dy / R;
      this.updateStick(s, i === 0);
    }
  }

  private onPointerUp(p: Phaser.Input.Pointer) {
    for (const b of this.buttons) {
      if (b.pointer === p.id) {
        b.pointer = null;
        b.onUp?.();
        b.ring.setAlpha(0.8).clearTint();
      }
    }
    for (const [i, s] of this.sticks.entries()) {
      if (s.id !== p.id) continue;
      s.id = null;
      s.x = 0;
      s.y = 0;
      this.updateStick(s, i === 0);
    }
  }

  private updateStick(s: Stick, isMove: boolean) {
    const R = this.stickRadius();
    const active = s.id !== null;
    if (active) {
      s.base.setPosition(s.baseX, s.baseY).setScale(getSettings().stickScale).setAlpha(0.6);
      s.knob.setPosition(s.baseX + s.x * R, s.baseY + s.y * R).setScale(getSettings().stickScale).setAlpha(0.9);
    }
    const dead = 0.12;
    const mag = Math.sqrt(s.x * s.x + s.y * s.y);
    const k = mag < dead ? 0 : Math.min(1, (mag - dead) / (1 - dead)) / (mag || 1);
    if (isMove) {
      touchState.moveX = s.x * k;
      touchState.moveY = s.y * k;
    } else {
      touchState.aimActive = active && mag > 0.25;
      touchState.aimX = s.x;
      touchState.aimY = s.y;
    }
    if (!active) this.restSticks();
  }

  private restSticks() {
    const W = this.scale.width;
    const H = this.scale.height;
    const lh = getSettings().leftHanded;
    const rest = [
      { x: lh ? W - 150 : 150, y: H - 130 },
      { x: lh ? 150 : W - 150, y: H - 130 },
    ];
    this.sticks.forEach((s, i) => {
      if (s.id !== null) return;
      s.base.setPosition(rest[i]!.x, rest[i]!.y).setScale(getSettings().stickScale).setAlpha(0.28);
      s.knob.setPosition(rest[i]!.x, rest[i]!.y).setScale(getSettings().stickScale).setAlpha(0.35);
    });
  }

  // ── layout ─────────────────────────────────────────────────────────────
  private layout() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.layoutW = W;
    this.layoutH = H;
    const pad = 14;
    // on narrow (portrait) screens centre the score/health group in the space left of the minimap
    const reserved = this.mmW + 4 + pad + 48;
    const cx = W - reserved < 330 ? Math.max(160, (W - reserved) / 2) : W / 2;
    // kill feed sits top-left; on narrow screens it moves below the centred score/health panels
    this.feedY0 = W < 760 ? (this.touch ? pad + 100 : pad + 62) : 14;
    // score box
    this.scoreBg.clear();
    this.scoreBg.fillStyle(0x8a1a16, 0.95).fillRect(cx - 118, pad, 50, 40);
    this.scoreBg.lineStyle(2, 0xd8392e, 1).strokeRect(cx - 117, pad + 1, 48, 38);
    this.scoreBg.fillStyle(0x14304e, 0.95).fillRect(cx + 68, pad, 50, 40);
    this.scoreBg.lineStyle(2, 0x4a9be0, 1).strokeRect(cx + 69, pad + 1, 48, 38);
    this.panel(this.scoreBg, cx - 62, pad, 124, 46);
    this.myScore.setPosition(cx - 93, pad + 20);
    this.leadScore.setPosition(cx + 93, pad + 20);
    this.timer.setPosition(cx, pad + 2);
    this.mode.setPosition(cx, pad + 31);
    // minimap
    const mmx = W - pad - this.mmW - 4;
    const mmy = pad + 14;
    this.mm.setPosition(mmx, mmy);
    this.mmLabel.setPosition(mmx + this.mmW / 2, mmy - 4);
    this.statusText.setPosition(W - pad, mmy + this.mmH + 10);
    this.pauseBtn.setPosition(mmx - 26, pad + 18);
    // health + weapon panels
    if (this.touch) {
      const y = pad + 54;
      this.healthBg.clear();
      this.panel(this.healthBg, cx - 150, y, 300, 36, 0.7);
      this.portrait.setPosition(cx - 147, y + 3).setDisplaySize(30, 30);
      this.nameText.setPosition(cx - 112, y + 2);
      this.hpText.setPosition(cx - 112, y + 17);
      this.weaponIcon.setPosition(cx + 52, y + 18);
      this.ammoText.setPosition(cx + 118, y + 6);
      this.weaponName.setVisible(false);
      this.weaponBg.clear();
      this.slotGfx.clear();
      for (const o of [...this.slotIcons, ...this.slotNums]) o.setVisible(false);
      // buttons
      const lh = getSettings().leftHanded;
      const bx = (x: number) => (lh ? W - x : x);
      const [fire, reload, swap, interact] = this.buttons;
      if (fire) Object.assign(fire, { x: bx(W - 88), y: H - 236 });
      if (reload) Object.assign(reload, { x: bx(W - 236), y: H - 52 });
      if (swap) Object.assign(swap, { x: bx(W - 58), y: H - 330 });
      if (interact) Object.assign(interact, { x: bx(W - 196), y: H - 300 });
      for (const b of this.buttons) {
        b.ring.setPosition(b.x, b.y).setScale((b.r * 2) / 112);
        b.icon.setPosition(b.x, b.y).setScale(b.r / 34);
      }
      this.restSticks();
    } else {
      // desktop: bottom-left health, bottom-right weapon (like the reference HUD)
      const hy = H - pad - 74;
      this.healthBg.clear();
      this.panel(this.healthBg, pad, hy, 250, 74);
      this.portrait.setPosition(pad + 6, hy + 6).setDisplaySize(62, 62);
      this.healthBg.lineStyle(1, 0xd9c7a3, 0.6).strokeRect(pad + 5.5, hy + 5.5, 63, 63);
      this.nameText.setPosition(pad + 80, hy + 8);
      this.hpText.setPosition(pad + 80, hy + 30);
      const wy = H - pad - 74;
      const wx = W - pad - 330;
      this.weaponBg.clear();
      this.panel(this.weaponBg, wx, wy, 170, 74);
      this.weaponIcon.setPosition(wx + 85, wy + 24);
      this.ammoText.setPosition(wx + 85, wy + 40);
      this.weaponName.setPosition(wx + 85, wy + 4).setVisible(true);
      for (let i = 0; i < 3; i++) {
        const sx = wx + 182 + i * 50;
        this.slotIcons[i]!.setPosition(sx + 20, wy + 26).setVisible(true);
        this.slotNums[i]!.setPosition(sx + 20, wy + 62).setVisible(true);
      }
    }
    this.bigText.setPosition(cx, H * 0.36);
    this.subText.setPosition(cx, H * 0.36 + 48);
    this.promptText.setPosition(cx, H * 0.7);
  }

  // ── events ─────────────────────────────────────────────────────────────
  private onKillFeed(e: KillFeedEntry) {
    const k = txt(this, 0, 0, e.killer, 14, e.killerLocal ? RED : BLUE, '600');
    const icon = this.add.image(0, 0, 'fx', `ico_${e.weapon}`).setOrigin(0, 0.5).setScale(0.55);
    const v = txt(this, 0, 0, e.victim, 14, e.victimLocal ? RED : BLUE, '600');
    icon.setPosition(k.width + 8, k.height / 2);
    v.setPosition(icon.x + icon.displayWidth + 8, 0);
    const bgW = v.x + v.width + 10;
    const bg = this.add.graphics();
    bg.fillStyle(PANEL, 0.55).fillRect(-6, -1, bgW, k.height + 2);
    const c = this.add.container(14, 0, [bg, k, icon, v]);
    this.feed.unshift({ container: c, born: this.time.now });
    while (this.feed.length > 5) this.feed.pop()!.container.destroy();
  }

  private onHitMarker(kill: boolean) {
    this.hitUntil = this.time.now + (kill ? 320 : 150);
    this.hitKill = kill;
  }

  private onScoreboard(show: boolean) {
    this.scoreboardVisible = show;
    this.scoreboard.setVisible(show);
  }

  private onRadar(slot: number) {
    this.noteShot(slot, this.time.now);
  }

  private onPhase(phase: string) {
    if (phase === 'active') this.goUntil = this.time.now + 900;
  }

  // ── per frame ───────────────────────────────────────────────────────────
  override update(time: number, delta: number): void {
    if (this.scale.width !== this.layoutW || this.scale.height !== this.layoutH) this.layout();
    const hud = this.session.hud();
    const players = this.session.players();
    const me = players.find((p) => p.isLocal);
    const sorted = players.slice().sort((a, b) => b.score - a.score || a.deaths - b.deaths);
    const leader = sorted.find((p) => !p.isLocal);
    // score / timer
    this.myScore.setText(String(me?.score ?? 0));
    this.leadScore.setText(String(leader?.score ?? 0));
    const t = hud.phase === 'active' ? hud.timeLeftMs : hud.phase === 'countdown' || hud.phase === 'ready' ? hud.timeLeftMs : 0;
    this.timer.setText(fmtTime(t));
    this.timer.setColor(hud.phase === 'active' && t < 30_000 ? '#ff6a5a' : BEIGE);
    this.mode.setText(`ДЕЗМАТЧ · ${hud.scoreLimit} УБИЙСТВ`);
    // feed
    let fy = this.feedY0;
    for (const f of this.feed) {
      const age = time - f.born;
      f.container.setPosition(14, fy).setAlpha(age > 5000 ? Math.max(0, 1 - (age - 5000) / 800) : 1);
      fy += 22;
    }
    this.feed = this.feed.filter((f) => {
      if (time - f.born > 5800) {
        f.container.destroy();
        return false;
      }
      return true;
    });
    // identity can change after the HUD was built (roster arrives late online, character swaps between lives)
    if (me) {
      const key = this.touch ? `portrait_small_${me.character}` : `portrait_${me.character}`;
      if (this.portrait.texture.key !== key && this.textures.exists(key)) {
        const w = this.portrait.displayWidth;
        const hgt = this.portrait.displayHeight;
        this.portrait.setTexture(key).setDisplaySize(w, hgt);
      }
      if (me.name && this.nameText.text !== me.name) this.nameText.setText(me.name);
    }
    this.updateTutorial(me, hud.mag, hud.weapon, hud.phase, time);
    // health
    const hp = Math.max(0, hud.hp);
    this.hpText.setText(`${hp}/100`);
    this.hpBar.clear();
    if (this.touch) {
      const x = this.nameText.x + 70;
      const y = this.hpText.y + 6;
      this.hpBar.fillStyle(0x200a08, 1).fillRect(x, y, 90, 7).fillStyle(hp < 30 ? 0xff3a2a : 0xc8312a, 1).fillRect(x, y, (90 * hp) / 100, 7);
    } else {
      const x = this.hpText.x;
      const y = this.hpText.y + 24;
      this.hpBar.fillStyle(0x200a08, 1).fillRect(x, y, 150, 10).fillStyle(hp < 30 ? 0xff3a2a : 0xc8312a, 1).fillRect(x, y, (150 * hp) / 100, 10);
      this.hpBar.lineStyle(1, 0x0b0908, 1).strokeRect(x - 0.5, y - 0.5, 151, 11);
    }
    // weapon
    this.weaponIcon.setFrame(`ico_${hud.weapon}`).setScale(this.touch ? 0.6 : 0.85);
    const def = WEAPONS[hud.weapon];
    this.ammoText.setText(def.kind === 'melee' ? '—' : `${hud.mag}/${hud.reserve < 0 ? '∞' : hud.reserve}`);
    this.ammoText.setColor(def.kind !== 'melee' && hud.mag === 0 ? '#ff6a5a' : BEIGE);
    this.weaponName.setText(hud.reloading ? 'ПЕРЕЗАРЯДКА…' : def.name.toUpperCase());
    if (!this.touch) this.drawSlots(hud.weapon, hud.heavy);
    if (hud.reloading) {
      const x = this.ammoText.x - 40;
      const y = this.ammoText.y + (this.touch ? 22 : 28);
      this.hpBar.fillStyle(0x2a241e, 1).fillRect(x, y, 80, 3).fillStyle(0xe8dcc0, 1).fillRect(x, y, 80 * hud.reloadProgress, 3);
    }
    // minimap dots: me always, enemies only when recently firing (no wallhack)
    this.mmDots.clear();
    const s = this.mmScale;
    const ox = this.mm.x + 2;
    const oy = this.mm.y + 2;
    for (const p of players) {
      if (!p.alive) continue;
      if (p.isLocal) {
        this.mmDots.fillStyle(0xff4a3a, 1).fillCircle(ox + p.x * s, oy + p.y * s, 3);
        this.mmDots.lineStyle(1, 0xffe0c0, 1).lineBetween(ox + p.x * s, oy + p.y * s, ox + p.x * s + Math.cos(p.aim) * 6, oy + p.y * s + Math.sin(p.aim) * 6);
      } else if (time - (this.lastShotAt.get(p.slot) ?? -1e9) < 2000) {
        this.mmDots.fillStyle(0x4a9be0, 1).fillCircle(ox + p.x * s, oy + p.y * s, 2.5);
      }
    }
    for (const pk of this.session.pickups()) if (pk.active) this.mmDots.fillStyle(0xffd36a, 0.9).fillRect(ox + pk.x * s - 1, oy + pk.y * s - 1, 2, 2);
    // centre messages
    this.centre(hud, me, time);
    // hit marker at the crosshair position
    this.hitMarker.clear();
    if (time < this.hitUntil) {
      const p = this.input.activePointer;
      const x = this.touch ? this.scale.width / 2 : p.x;
      const y = this.touch ? this.scale.height / 2 : p.y;
      const r = this.hitKill ? 11 : 8;
      this.hitMarker.lineStyle(2, this.hitKill ? 0xff4a3a : 0xffffff, 1);
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        this.hitMarker.lineBetween(x + dx * 4, y + dy * 4, x + dx * r, y + dy * r);
    }
    // status
    const conn = hud.connection;
    this.statusText.setText(conn === 'offline' ? 'ТРЕНИРОВКА' : conn === 'reconnecting' ? 'ПЕРЕПОДКЛЮЧЕНИЕ…' : conn === 'lost' ? 'НЕТ СВЯЗИ' : hud.ping !== null ? `${hud.ping} мс` : '');
    this.statusText.setColor(conn === 'online' ? ((hud.ping ?? 0) > 150 ? '#e8a040' : '#8fae78') : conn === 'offline' ? '#9a9080' : '#ff6a5a');
    // touch interact button only when a weapon can be swapped
    if (this.interactBtn) {
      const v = !!hud.pickupPrompt && hud.alive;
      this.interactBtn.visible = v;
      this.interactBtn.ring.setVisible(v);
      this.interactBtn.icon.setVisible(v);
    }
    if (this.scoreboardVisible) this.drawScoreboard(sorted);
    if (this.fpsText) this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} fps`);
    void delta;
  }

  /** Remember recent shooters for the minimap radar. */
  noteShot(slot: number, now: number): void {
    this.lastShotAt.set(slot, now);
  }

  private drawSlots(weapon: WeaponId, heavy: string | null) {
    const g = this.slotGfx;
    g.clear();
    const items: Array<WeaponId | null> = ['pistol', 'montirovka', (heavy as WeaponId) ?? null];
    items.forEach((w, i) => {
      const icon = this.slotIcons[i]!;
      const x = icon.x - 20;
      const y = icon.y - 20;
      const active = w === weapon;
      g.fillStyle(PANEL, active ? 0.9 : 0.65).fillRect(x, y, 40, 40);
      g.lineStyle(active ? 2 : 1, active ? 0xd8392e : 0x3a3128, 1).strokeRect(x + 0.5, y + 0.5, 39, 39);
      g.fillStyle(0xd9c7a3, 1).fillRect(icon.x - 7, icon.y + 29, 14, 14);
      if (w) icon.setFrame(`ico_${w}`).setScale(w === 'pistol' ? 0.55 : 0.36).setAlpha(active ? 1 : 0.55).setVisible(true);
      else icon.setVisible(false);
    });
  }

  private centre(hud: ReturnType<GameSession['hud']>, me: RenderPlayer | undefined, time: number) {
    let big = '';
    let sub = '';
    if (hud.phase === 'ready') big = 'ПРИГОТОВИТЬСЯ';
    else if (hud.phase === 'countdown') {
      big = String(Math.max(1, Math.ceil(hud.phaseRemainingMs / 1000)));
      sub = 'Районные дела — серьёзные дела';
    } else if (hud.phase === 'active' && time < this.goUntil) big = 'ВПЕРЁД!';
    else if (hud.phase === 'finished') {
      big = 'МАТЧ ОКОНЧЕН';
    } else if (me && !me.alive && hud.phase === 'active') {
      big = 'ВАС УСТРАНИЛИ';
      sub = `${hud.killedBy ? `Завалил: ${hud.killedBy} · ` : ''}возвращение через ${(hud.respawnInMs / 1000).toFixed(1)} с`;
    }
    if (hud.connection === 'reconnecting') {
      big = 'СВЯЗЬ ПОТЕРЯНА';
      sub = 'Переподключение…';
    }
    this.bigText.setText(big).setFontSize(big.length > 3 ? (this.touch ? 34 : 44) : 72);
    this.bigText.setColor(big === 'ВАС УСТРАНИЛИ' || big === 'СВЯЗЬ ПОТЕРЯНА' ? '#ff5a4a' : BEIGE);
    this.subText.setText(sub);
    this.promptText.setText(hud.pickupPrompt && hud.alive ? (this.touch ? `Взять: ${WEAPONS[hud.pickupPrompt].name}` : `[E] — взять ${WEAPONS[hud.pickupPrompt].name.toLowerCase()}`) : '');
  }

  private drawScoreboard(sorted: RenderPlayer[]) {
    this.scoreboard.removeAll(true);
    const W = this.scale.width;
    const w = Math.min(460, W - 40);
    const h = 54 + sorted.length * 28;
    const x = (W - w) / 2;
    const y = 80;
    const g = this.add.graphics();
    this.panel(g, x, y, w, h, 0.92);
    this.scoreboard.add(g);
    const head = txt(this, x + 16, y + 12, 'ИГРОК', 12, '#b8a888', '600');
    const kd = txt(this, x + w - 150, y + 12, 'УБ / СМ', 12, '#b8a888', '600');
    const sc = txt(this, x + w - 60, y + 12, 'ОЧКИ', 12, '#b8a888', '600');
    this.scoreboard.add([head, kd, sc]);
    sorted.forEach((p, i) => {
      const ry = y + 40 + i * 28;
      const portrait = this.add.image(x + 16, ry, `portrait_small_${p.character}`).setOrigin(0, 0).setDisplaySize(22, 22);
      const n = txt(this, x + 46, ry + 1, `${i + 1}. ${p.name}${p.isBot ? ' · бот' : ''}`, 15, p.isLocal ? RED : BEIGE, '500');
      const k = txt(this, x + w - 150, ry + 1, `${p.kills} / ${p.deaths}`, 15, BEIGE, '500');
      const s = txt(this, x + w - 60, ry + 1, String(p.score), 15, BEIGE, '700');
      this.scoreboard.add([portrait, n, k, s]);
    });
  }
}
