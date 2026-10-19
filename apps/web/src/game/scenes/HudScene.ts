/**
 * Screen-space HUD in the БЛАТКОМ ’89 VHS style: score/timer, kill feed, minimap, health with
 * portrait, weapon & ammo with slots, centre messages, hit markers, scoreboard and touch controls.
 */
import * as Phaser from 'phaser';
import { getMap, PROP_DEFS, propFootprint, WEAPONS, SCORING, BASE_RULES, CTF_RULES, isTeamMode } from '@blatkom/shared';
import type { MapDef, Team, WeaponId } from '@blatkom/shared';
import type { GameSession, RenderBase, RenderFlag, RenderPlayer } from '../session/types.js';
import { hudBus } from './hudBus.js';
import type { KillFeedEntry, ObjectiveEntry, PointsEntry, SupplyEntry } from './hudBus.js';
import { touchState, isTouchDevice } from '../input/TouchState.js';
import { getSettings, storageGet, storageSet } from '../../app/settings.js';
import { analytics } from '../../analytics/client.js';
import { sfx } from '../audio/Sfx.js';
import { t, plural, getLang } from '../../i18n/index.js';
import { charName, mapName, weaponName } from '../../i18n/content.js';

const TUTORIAL_KEY = 'blatkom89.tutorial.v1';
/** Team colours: names / text and fills (red 0, blue 1). */
const TEAM_TEXT = ['#ff8a7a', '#8cc8f6'] as const;
const TEAM_FILL = [0xd8392e, 0x4a9be0] as const;
const BASE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
/** Extra height of the score box in capture the flag / base capture (the objective strip). */
const OBJ_STRIP = 22;

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

/** Shortens `s` with an ellipsis until the text object fits `maxW` pixels. */
function fitText(t: Phaser.GameObjects.Text, s: string, maxW: number): Phaser.GameObjects.Text {
  t.setText(s);
  let n = s.length;
  while (t.width > maxW && n > 3) t.setText(s.slice(0, --n) + '…');
  return t;
}

/** Sets a weapon icon (atlas «weapons») scaled to fit a box, never upscaled past `maxScale`. */
function fitIcon(img: Phaser.GameObjects.Image, frame: string, maxW: number, maxH: number, maxScale = 1.1): Phaser.GameObjects.Image {
  if (img.frame.name !== frame) img.setFrame(frame);
  const f = img.frame;
  return img.setScale(Math.min(maxScale, maxW / f.realWidth, maxH / f.realHeight));
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
  /** Team matches: a frame around the local player's team score. */
  private teamMark!: Phaser.GameObjects.Graphics;
  private scoreCx = 0;
  private scorePad = 14;
  /** Capture the flag / base capture: the strip under the timer (flag states or the bases). */
  private objMode: 'ctf' | 'bases' | null = null;
  private objGfx!: Phaser.GameObjects.Graphics;
  private objTexts: Phaser.GameObjects.Text[] = [];
  private extraTop = 0;
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
  private levelText!: Phaser.GameObjects.Text;
  private shownName = '';
  private shownLevel: number | null | undefined = undefined;
  // «+2 ELIMINATION» popups, supply banner, edge arrows towards supply crates
  private popups: Array<{ text: Phaser.GameObjects.Text; born: number }> = [];
  private banner: Phaser.GameObjects.Container | null = null;
  private bannerUntil = 0;
  private bannerMs = 3400;
  private supplyPings: Array<{ x: number; y: number; at: number }> = [];
  private edge!: Phaser.GameObjects.Graphics;
  private edgeLabels: Phaser.GameObjects.Text[] = [];
  private modeSig = '';
  private sbSig = '';
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
  /** Slot 4: equipment icon + charges (desktop panel). */
  private gadgetIcon!: Phaser.GameObjects.Image;
  private gadgetCount!: Phaser.GameObjects.Text;
  private gadgetBtn: Btn | null = null;
  private gadgetBtnCount: Phaser.GameObjects.Text | null = null;
  private flashOverlay!: Phaser.GameObjects.Rectangle;
  private wasFlashed = false;
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
    this.popups = [];
    this.banner = null;
    this.supplyPings = [];
    this.shownName = '';
    this.shownLevel = undefined;
    this.modeSig = '';
    this.sbSig = '';
    this.wasFlashed = false;
    this.gadgetBtn = null;
    this.gadgetBtnCount = null;
    this.objMode = this.session.gameMode === 'ctf' ? 'ctf' : this.session.gameMode === 'bases' ? 'bases' : null;
    this.edgeLabels = [];
    this.extraTop = this.objMode ? OBJ_STRIP : 0;
    this.objTexts = [];
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
    // flashbang: the screen goes white and fades back (under the touch controls, over everything else)
    this.flashOverlay = this.add.rectangle(0, 0, 10, 10, 0xffffff, 1).setOrigin(0, 0).setDepth(35).setVisible(false);
    if (getSettings().showFps) this.fpsText = txt(this, 6, 0, '', 11, '#9a9080', '400').setDepth(100);
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    hudBus.on('killfeed', this.onKillFeed, this);
    hudBus.on('hitmarker', this.onHitMarker, this);
    hudBus.on('scoreboard', this.onScoreboard, this);
    hudBus.on('phase', this.onPhase, this);
    hudBus.on('radar', this.onRadar, this);
    hudBus.on('points', this.onPoints, this);
    hudBus.on('supply', this.onSupply, this);
    hudBus.on('objective', this.onObjective, this);
    this.edge = this.add.graphics().setDepth(18);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      hudBus.off('killfeed', this.onKillFeed, this);
      hudBus.off('hitmarker', this.onHitMarker, this);
      hudBus.off('scoreboard', this.onScoreboard, this);
      hudBus.off('phase', this.onPhase, this);
      hudBus.off('radar', this.onRadar, this);
      hudBus.off('points', this.onPoints, this);
      hudBus.off('supply', this.onSupply, this);
      hudBus.off('objective', this.onObjective, this);
      touchState.moveX = touchState.moveY = 0;
      touchState.aimActive = false;
      touchState.fireHeld = false;
      touchState.gadgetTap = false;
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

  private tape(label: string, size = 11, fill = 0xd9c7a3, ink = '#1a1410'): Phaser.GameObjects.Container {
    const t = txt(this, 0, 0, label, size, ink, '600').setStroke('#000', 0).setOrigin(0.5);
    const w = t.width + 16;
    const h = t.height + 4;
    const g = this.add.graphics();
    g.fillStyle(fill, 0.95).fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle(0x0d0b0a, 0.5);
    for (let i = -w / 2; i < w / 2; i += 4) g.fillRect(i, -h / 2, 2, 1).fillRect(i + 1, h / 2 - 1, 2, 1);
    return this.add.container(0, 0, [g, t]).setAngle(-2);
  }

  private buildScoreBox() {
    this.scoreBg = this.add.graphics();
    this.myScore = txt(this, 0, 0, '0', 26, BEIGE, '700').setOrigin(0.5);
    this.leadScore = txt(this, 0, 0, '0', 26, BEIGE, '700').setOrigin(0.5);
    this.timer = txt(this, 0, 0, '00:00', 24, BEIGE, '600').setOrigin(0.5, 0);
    this.mode = txt(this, 0, 0, '', 10, '#b8a888', '500').setOrigin(0.5, 0);
    this.teamMark = this.add.graphics();
    this.objGfx = this.add.graphics();
    if (this.objMode === 'ctf') for (let i = 0; i < 2; i++) this.objTexts.push(txt(this, 0, 0, '', 10, BEIGE, '600').setOrigin(0.5, 0.5));
    else if (this.objMode === 'bases') for (let i = 0; i < Math.max(1, this.map.bases.length); i++) this.objTexts.push(txt(this, 0, 0, BASE_LETTERS[i] ?? '?', 11, BEIGE, '700').setOrigin(0.5, 0.5));
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
    this.mmLabel = this.tape(mapName(m.id).toUpperCase(), this.touch ? 9 : 10);
  }

  private buildHealth() {
    this.healthBg = this.add.graphics();
    const me = this.session.players().find((p) => p.isLocal);
    const c = me?.character ?? 'petya';
    this.portrait = this.add.image(0, 0, this.touch ? `portrait_small_${c}` : `portrait_${c}`).setOrigin(0, 0);
    this.nameText = txt(this, 0, 0, me?.name ?? charName(c), this.touch ? 12 : 15, BEIGE, '600');
    this.levelText = txt(this, 0, 0, '', this.touch ? 10 : 12, '#ffd36a', '600');
    this.hpText = txt(this, 0, 0, '100/100', this.touch ? 12 : 15, BEIGE, '500');
    this.hpBar = this.add.graphics();
  }

  private buildWeapon() {
    this.weaponBg = this.add.graphics();
    this.weaponIcon = this.add.image(0, 0, 'weapons', 'ico_pistol').setOrigin(0.5);
    this.ammoText = txt(this, 0, 0, '8/∞', this.touch ? 16 : 22, BEIGE, '600').setOrigin(0.5, 0);
    this.weaponName = txt(this, 0, 0, '', 10, '#b8a888', '500').setOrigin(0.5, 0);
    this.slotGfx = this.add.graphics();
    for (let i = 0; i < 4; i++) {
      this.slotIcons.push(this.add.image(0, 0, 'weapons', 'ico_pistol').setOrigin(0.5));
      this.slotNums.push(txt(this, 0, 0, i === 3 ? 'G' : String(i + 1), 10, '#1a1410', '700').setStroke('#000', 0).setOrigin(0.5));
    }
    this.gadgetIcon = this.slotIcons[3]!;
    this.gadgetCount = txt(this, 0, 0, '', 11, BEIGE, '700').setOrigin(1, 0);
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
      ? [t('Left stick — move'), t('Right stick — aim and fire'), t('⟳ — reload · ⇄ — switch weapon'), t('Grenade button — equipment'), t('Weapons and medkits are picked up on the move')]
      : [t('WASD — move · Shift — walk quietly'), t('Mouse — aim · Left click — fire'), t('R — reload · 1/2/3, Q — weapons'), t('G — grenade / equipment'), t('E — pick up · Tab — score · Esc — pause')];
    const title = txt(this, 0, 0, t('HOW BUSINESS IS DONE'), 13, '#1a1410', '700').setStroke('#000', 0).setOrigin(0.5, 0);
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
    // equipment: the icon comes from the weapons atlas and follows the equipped gadget
    const gadget = btn('ico_reload', 34, () => (touchState.gadgetTap = true));
    gadget.icon.setTexture('weapons', 'ico_f1');
    this.gadgetBtn = gadget;
    this.gadgetBtnCount = txt(this, 0, 0, '', 12, BEIGE, '700').setOrigin(0.5).setDepth(42);
    this.buttons = [fire, reload, swap, this.interactBtn, gadget];
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
    this.feedY0 = W < 760 ? (this.touch ? pad + 100 : pad + 62) + this.extraTop : 14;
    // score box
    this.scoreBg.clear();
    this.scoreBg.fillStyle(0x8a1a16, 0.95).fillRect(cx - 118, pad, 50, 40);
    this.scoreBg.lineStyle(2, 0xd8392e, 1).strokeRect(cx - 117, pad + 1, 48, 38);
    this.scoreBg.fillStyle(0x14304e, 0.95).fillRect(cx + 68, pad, 50, 40);
    this.scoreBg.lineStyle(2, 0x4a9be0, 1).strokeRect(cx + 69, pad + 1, 48, 38);
    this.panel(this.scoreBg, cx - 62, pad, 124, 46 + this.extraTop);
    this.scoreCx = cx;
    this.scorePad = pad;
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
      const y = pad + 54 + this.extraTop;
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
      const [fire, reload, swap, interact, gadget] = this.buttons;
      if (fire) Object.assign(fire, { x: bx(W - 88), y: H - 236 });
      if (reload) Object.assign(reload, { x: bx(W - 236), y: H - 52 });
      if (swap) Object.assign(swap, { x: bx(W - 58), y: H - 330 });
      if (interact) Object.assign(interact, { x: bx(W - 196), y: H - 300 });
      if (gadget) Object.assign(gadget, { x: bx(W - 268), y: H - 186 });
      for (const b of this.buttons) {
        b.ring.setPosition(b.x, b.y).setScale((b.r * 2) / 112);
        b.icon.setPosition(b.x, b.y);
        if (b !== gadget) b.icon.setScale(b.r / 34);
      }
      if (gadget) this.gadgetBtnCount?.setPosition(gadget.x + gadget.r * 0.62, gadget.y + gadget.r * 0.62);
      this.gadgetCount.setVisible(false);
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
      const wx = W - pad - 380;
      this.weaponBg.clear();
      this.panel(this.weaponBg, wx, wy, 170, 74);
      this.weaponIcon.setPosition(wx + 85, wy + 24);
      this.ammoText.setPosition(wx + 85, wy + 40);
      this.weaponName.setPosition(wx + 85, wy + 4).setVisible(true);
      for (let i = 0; i < 4; i++) {
        const sx = wx + 182 + i * 50;
        this.slotIcons[i]!.setPosition(sx + 20, wy + 26).setVisible(true);
        this.slotNums[i]!.setPosition(sx + 20, wy + 62).setVisible(true);
      }
      this.gadgetCount.setPosition(wx + 182 + 3 * 50 + 38, wy + 7).setVisible(true);
    }
    this.flashOverlay.setSize(W, H);
    this.bigText.setPosition(cx, H * 0.36);
    this.subText.setPosition(cx, H * 0.36 + 48);
    this.promptText.setPosition(cx, H * 0.7);
  }

  // ── events ─────────────────────────────────────────────────────────────
  private onKillFeed(e: KillFeedEntry) {
    // free-for-all: the local player red, everyone else blue; teams: everyone in their team colour
    const teamColor = (team: number | null | undefined, local: boolean) => (team === 0 || team === 1 ? TEAM_TEXT[team] : local ? RED : BLUE);
    const k = txt(this, 0, 0, e.killer, 14, teamColor(e.killerTeam, e.killerLocal), '600');
    let right = k.width;
    // assisters ride along after the killer: «Petya + Valyuta [sawn-off] Mikhalych»
    const a = e.assists.length ? txt(this, right + 5, 3, `+ ${e.assists.join(', ')}`, 11, e.killerTeam === 0 || e.killerTeam === 1 ? TEAM_TEXT[e.killerTeam] : e.assistLocal ? '#ff8a7a' : '#9fbfdf', '500') : null;
    if (a) right = a.x + a.width;
    const icon = fitIcon(this.add.image(right + 8, k.height / 2, 'weapons', `ico_${e.weapon}`).setOrigin(0, 0.5), `ico_${e.weapon}`, 46, 15, 0.8);
    const v = txt(this, icon.x + icon.displayWidth + 8, 0, e.victim, 14, teamColor(e.victimTeam, e.victimLocal), '600');
    const bgW = v.x + v.width + 10;
    const bg = this.add.graphics();
    bg.fillStyle(PANEL, 0.55).fillRect(-6, -1, bgW, k.height + 2);
    if (e.killerLocal || e.assistLocal || e.victimLocal) bg.fillStyle(e.victimLocal ? 0x8a1a16 : 0xd9c7a3, e.victimLocal ? 0.5 : 0.85).fillRect(-6, -1, 2, k.height + 2);
    const c = this.add.container(14, 0, a ? [bg, k, a, icon, v] : [bg, k, icon, v]);
    this.feed.unshift({ container: c, born: this.time.now });
    while (this.feed.length > 5) this.feed.pop()!.container.destroy();
  }

  private onHitMarker(kill: boolean) {
    this.hitUntil = this.time.now + (kill ? 320 : 150);
    this.hitKill = kill;
  }

  private onScoreboard(show: boolean) {
    this.sbSig = '';
    this.scoreboardVisible = show;
    this.scoreboard.setVisible(show);
  }

  private onRadar(slot: number) {
    this.noteShot(slot, this.time.now);
  }

  private onPoints(e: PointsEntry) {
    const big = e.points >= SCORING.killPoints;
    const color = e.heal ? '#7cff8a' : big ? '#ffd36a' : BEIGE;
    const t = txt(this, 0, 0, `+${e.points} ${e.label}`, this.touch ? 15 : 19, color, '700').setOrigin(0.5).setDepth(22).setAlpha(0);
    this.popups.push({ text: t, born: this.time.now });
    while (this.popups.length > 3) this.popups.shift()!.text.destroy();
  }

  private onSupply(e: SupplyEntry) {
    const name = weaponName(e.weapon);
    this.showBanner(this.touch ? t('DEFICIT GOODS: {name}', { name: name.toUpperCase() }) : t('DEFICIT GOODS DELIVERED!'), this.touch ? null : t('In the crate: {name} with a full load of ammo — look for the marker on the map', { name }), null);
    this.supplyPings.push({ x: e.x, y: e.y, at: this.time.now });
  }

  /** A tape banner under the score box: beige news, red alarm (`good` false), gold for good news. */
  private showBanner(title: string, sub: string | null, good: boolean | null, ms = 3400) {
    this.banner?.destroy();
    const fill = good === false ? 0xc8312a : good === true ? 0xe8c060 : 0xd9c7a3;
    const ink = good === false ? '#fff4e4' : '#1a1410';
    const parts: Phaser.GameObjects.GameObject[] = [this.tape(title, this.touch ? 13 : 17, fill, ink)];
    if (sub) parts.push(txt(this, 0, 16, sub, this.touch ? 11 : 13, BEIGE, '500').setOrigin(0.5, 0));
    this.banner = this.add.container(0, 0, parts).setDepth(23).setAlpha(0);
    this.bannerUntil = this.time.now + ms;
    this.bannerMs = ms;
  }

  /** Flags and bases: a line in the kill feed, and a banner when it concerns the local player's team. */
  private onObjective(e: ObjectiveEntry) {
    const actorColor = e.actorTeam === 0 || e.actorTeam === 1 ? TEAM_TEXT[e.actorTeam] : BEIGE;
    const mark = this.add.graphics();
    // a small flag in the colour of the team the line is about
    mark.lineStyle(1.5, 0x1a1612, 1).lineBetween(1, 2, 1, 16);
    mark.fillStyle(TEAM_FILL[e.team], 1).fillTriangle(2, 3, 13, 6.5, 2, 10);
    let x = 18;
    const parts: Phaser.GameObjects.GameObject[] = [mark];
    if (e.actor) {
      const a = txt(this, x, 0, e.actor, 14, actorColor, e.actorLocal ? '700' : '600');
      parts.push(a);
      x += a.width + 5;
    }
    const rest = txt(this, x, 1, e.text, 13, '#e8dcc0', '500');
    parts.push(rest);
    const bg = this.add.graphics();
    bg.fillStyle(PANEL, 0.55).fillRect(-6, -1, rest.x + rest.width + 10, rest.height + 3);
    if (e.actorLocal) bg.fillStyle(0xd9c7a3, 0.85).fillRect(-6, -1, 2, rest.height + 3);
    const c = this.add.container(14, 0, [bg, ...parts]);
    this.feed.unshift({ container: c, born: this.time.now });
    while (this.feed.length > 5) this.feed.pop()!.container.destroy();
    if (e.banner) this.showBanner(e.banner.title, e.banner.sub ?? null, e.banner.good, 3000);
  }

  /** Popups, the supply banner and minimap pings, advanced every frame. */
  private updateTransient(time: number) {
    const W = this.scale.width;
    const H = this.scale.height;
    this.popups = this.popups.filter((p, i, all) => {
      const age = time - p.born;
      if (age > 1700) {
        p.text.destroy();
        return false;
      }
      const rise = Math.min(1, age / 500) * 16;
      const stack = (all.length - 1 - i) * (this.touch ? 18 : 22);
      p.text.setPosition(W / 2, H * 0.62 - rise - stack);
      p.text.setAlpha(age < 120 ? age / 120 : age > 1300 ? Math.max(0, 1 - (age - 1300) / 400) : 1);
      p.text.setScale(age < 160 ? 1.3 - (age / 160) * 0.3 : 1);
      return true;
    });
    if (this.banner) {
      const left = this.bannerUntil - time;
      if (left <= 0) {
        this.banner.destroy();
        this.banner = null;
      } else {
        // below the first-match controls card if it is still up, otherwise under the score box
        const tut = this.tutorial?.visible ? this.tutorial.getBounds().bottom + 24 : 0;
        const y = Math.max(tut, this.touch ? 138 + this.extraTop : Math.max(H * 0.2, 96 + this.extraTop));
        this.banner.setPosition(W / 2, y).setAlpha(left < 400 ? left / 400 : Math.min(1, (this.bannerMs - left) / 150));
      }
    }
    this.supplyPings = this.supplyPings.filter((p) => time - p.at < 2400);
  }

  /**
   * Markers on the screen edge for things out of view: «deficit goods» crates (orange arrows),
   * flags (their team's colour) and bases that need the local player's team (lettered).
   */
  private drawSupplyArrows(time: number, myTeam: Team | null, mySlot: number) {
    this.edge.clear();
    const marks: Array<{ x: number; y: number; color: number; ring: number; label: string | null; urgent: boolean }> = [];
    for (const pk of this.session.pickups()) if (pk.supply && pk.active) marks.push({ x: pk.x, y: pk.y, color: 0xff7a3a, ring: 0xffd36a, label: null, urgent: false });
    if (myTeam !== null) {
      for (const f of this.session.flags()) {
        if (f.carrier === mySlot) continue;
        // their flag always; ours only when it has left its stand
        if (f.team === myTeam && f.status === 'home') continue;
        const c = f.status === 'carried' ? this.session.players().find((p) => p.slot === f.carrier) : undefined;
        marks.push({ x: c ? c.x : f.x, y: c ? c.y : f.y, color: TEAM_FILL[f.team], ring: f.team === myTeam ? 0xffffff : 0xf2e6c8, label: null, urgent: f.team === myTeam });
      }
      for (const b of this.session.bases()) {
        if (b.owner === myTeam && !b.contested && b.capturer === null) continue;
        marks.push({ x: b.x, y: b.y, color: b.owner === null ? 0x6a6458 : TEAM_FILL[b.owner], ring: b.contested ? 0xffffff : 0xf2e6c8, label: BASE_LETTERS[b.index] ?? '?', urgent: b.owner === myTeam });
      }
    }
    for (let i = 0; i < this.edgeLabels.length; i++) this.edgeLabels[i]!.setVisible(false);
    if (!marks.length) return;
    const game = this.scene.get('game');
    const cam = game?.cameras?.main;
    if (!cam) return;
    const W = this.scale.width;
    const H = this.scale.height;
    const wv = cam.worldView;
    const cx = W / 2;
    const cy = H / 2;
    // the arrows run along an inner frame that keeps clear of the score box and the bottom panels
    const left = 34;
    const right = W - 34;
    const top = this.touch ? 112 : 78;
    const bottom = H - (this.touch ? 40 : 104);
    const pulse = 0.65 + Math.sin(time / 140) * 0.35;
    let li = 0;
    for (const pk of marks) {
      const sx = (pk.x - wv.x) * cam.zoom + cam.x;
      const sy = (pk.y - wv.y) * cam.zoom + cam.y;
      if (sx > 24 && sx < W - 24 && sy > 24 && sy < H - 24) continue;
      const a = Math.atan2(sy - cy, sx - cx);
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const tx = dx > 1e-6 ? (right - cx) / dx : dx < -1e-6 ? (left - cx) / dx : Infinity;
      const ty = dy > 1e-6 ? (bottom - cy) / dy : dy < -1e-6 ? (top - cy) / dy : Infinity;
      const r = Math.max(0, Math.min(tx, ty));
      let ex = cx + dx * r;
      let ey = cy + dy * r;
      // never on top of the minimap: slide below it along the right edge
      const mmLeft = this.mm.x - 18;
      const mmBottom = this.mm.y + this.mmH + 30;
      if (ex > mmLeft && ey < mmBottom) {
        ex = Math.min(ex, right);
        ey = mmBottom;
      }
      const k = pk.urgent ? 0.55 + Math.sin(time / 90) * 0.45 : pulse;
      this.edge.fillStyle(0x0b0908, 0.7).fillCircle(ex, ey, 13);
      if (pk.label) {
        // a base: a lettered disc in the owner's colour with a pointer
        this.edge.fillStyle(pk.color, 0.95).fillCircle(ex, ey, 10);
        this.edge.fillStyle(pk.ring, k).fillTriangle(ex + Math.cos(a) * 16, ey + Math.sin(a) * 16, ex + Math.cos(a + 0.5) * 11, ey + Math.sin(a + 0.5) * 11, ex + Math.cos(a - 0.5) * 11, ey + Math.sin(a - 0.5) * 11);
        let lt = this.edgeLabels[li];
        if (!lt) {
          lt = txt(this, 0, 0, '', 12, '#f2e6c8', '700').setOrigin(0.5).setDepth(18.5);
          this.edgeLabels.push(lt);
        }
        lt.setText(pk.label).setPosition(ex, ey).setVisible(true);
        li++;
      } else {
        this.edge.fillStyle(pk.color, k);
        this.edge.fillTriangle(ex + Math.cos(a) * 11, ey + Math.sin(a) * 11, ex + Math.cos(a + 2.4) * 9, ey + Math.sin(a + 2.4) * 9, ex + Math.cos(a - 2.4) * 9, ey + Math.sin(a - 2.4) * 9);
      }
      this.edge.lineStyle(1.5, pk.ring, k).strokeCircle(ex, ey, 13);
    }
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
    const sorted = players.slice().sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths);
    const leader = sorted.find((p) => !p.isLocal);
    const teams = isTeamMode(hud.gameMode);
    // score / timer: free-for-all — mine vs the best opponent; teams — red vs blue
    this.myScore.setText(String(teams ? hud.teamScore[0] : (me?.score ?? 0)));
    this.leadScore.setText(String(teams ? hud.teamScore[1] : (leader?.score ?? 0)));
    const left = hud.phase === 'active' ? hud.timeLeftMs : hud.phase === 'countdown' || hud.phase === 'ready' ? hud.timeLeftMs : 0;
    this.timer.setText(fmtTime(left));
    this.timer.setColor(hud.phase === 'active' && left < 30_000 ? '#ff6a5a' : BEIGE);
    const modeSig = `${hud.gameMode}|${hud.scoreLimit}|${hud.teamScoreLimit}|${getLang()}`;
    if (this.modeSig !== modeSig) {
      this.modeSig = modeSig;
      this.mode.setText(
        hud.gameMode === 'ctf'
          ? t('FLAGS · TO {n}', { n: hud.teamScoreLimit })
          : hud.gameMode === 'bases'
            ? t('BASES · TO {n}', { n: hud.teamScoreLimit })
            : teams
              ? t('RED VS BLUE · TO {n}', { n: hud.teamScoreLimit })
              : t('DEATHMATCH · TO {n} {points}', { n: hud.scoreLimit, points: plural(hud.scoreLimit, 'point').toUpperCase() }),
      );
    }
    this.teamMark.clear();
    if (teams && hud.myTeam !== null) {
      // the local player's side: a light frame and a notch under the box
      const bx = hud.myTeam === 0 ? this.scoreCx - 118 : this.scoreCx + 68;
      const by = this.scorePad;
      this.teamMark.lineStyle(2, 0xf2e6c8, 0.95).strokeRect(bx - 2, by - 2, 54, 44);
      this.teamMark.fillStyle(0xf2e6c8, 0.95).fillTriangle(bx + 19, by + 44, bx + 31, by + 44, bx + 25, by + 50);
    }
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
      if ((me.name && this.shownName !== me.name) || this.shownLevel !== me.level) {
        this.shownName = me.name;
        this.shownLevel = me.level;
        this.levelText.setText(me.level !== null ? `${t('LVL')} ${me.level}` : '');
        const room = (this.touch ? 128 : 162) - (me.level !== null ? this.levelText.width + 6 : 0);
        fitText(this.nameText, me.name || charName(me.character), room);
      }
      this.levelText.setPosition(this.nameText.x + this.nameText.width + 6, this.nameText.y + (this.touch ? 1.5 : 3));
    }
    this.updateTransient(time);
    this.drawSupplyArrows(time, teams ? hud.myTeam : null, me?.slot ?? -1);
    this.drawObjectiveStrip(time, hud.myTeam);
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
    fitIcon(this.weaponIcon, `ico_${hud.weapon}`, this.touch ? 64 : 120, this.touch ? 24 : 34);
    const def = WEAPONS[hud.weapon];
    this.ammoText.setText(def.kind === 'melee' ? '—' : `${hud.mag}/${hud.reserve < 0 ? '∞' : hud.reserve}`);
    this.ammoText.setColor(def.kind !== 'melee' && hud.mag === 0 ? '#ff6a5a' : BEIGE);
    this.weaponName.setText(hud.reloading ? t('RELOADING…') : weaponName(hud.weapon).toUpperCase());
    if (!this.touch) this.drawSlots(hud.weapon, [hud.sidearm, hud.melee, hud.heavy]);
    this.updateGadget(hud, time);
    // flashbang: full white, then fades over the last 0.7 s; the ears ring while it lasts
    const fl = hud.flashedMs;
    this.flashOverlay.setVisible(fl > 0).setAlpha(Math.min(1, fl / 700) * 0.97);
    if (fl > 400 && !this.wasFlashed) sfx.play('tinnitus', { volume: Math.min(1, fl / 2000) });
    this.wasFlashed = fl > 0;
    if (hud.reloading) {
      const x = this.ammoText.x - 40;
      const y = this.ammoText.y + (this.touch ? 22 : 28);
      this.hpBar.fillStyle(0x2a241e, 1).fillRect(x, y, 80, 3).fillStyle(0xe8dcc0, 1).fillRect(x, y, 80 * hud.reloadProgress, 3);
    }
    // minimap dots: me always; teammates always (team matches); enemies only when recently firing (no wallhack)
    this.mmDots.clear();
    const s = this.mmScale;
    const ox = this.mm.x + 2;
    const oy = this.mm.y + 2;
    for (const p of players) {
      if (!p.alive) continue;
      const mate = teams && hud.myTeam !== null && p.team === hud.myTeam;
      if (p.isLocal) {
        this.mmDots.fillStyle(teams && hud.myTeam !== null ? TEAM_FILL[hud.myTeam] : 0xff4a3a, 1).fillCircle(ox + p.x * s, oy + p.y * s, 3);
        this.mmDots.lineStyle(1, 0xffe0c0, 1).lineBetween(ox + p.x * s, oy + p.y * s, ox + p.x * s + Math.cos(p.aim) * 6, oy + p.y * s + Math.sin(p.aim) * 6);
      } else if (mate) {
        this.mmDots.fillStyle(TEAM_FILL[hud.myTeam!], 0.9).fillCircle(ox + p.x * s, oy + p.y * s, 2.2);
        this.mmDots.lineStyle(1, 0xf2e6c8, 0.7).strokeCircle(ox + p.x * s, oy + p.y * s, 2.6);
      } else if (time - (this.lastShotAt.get(p.slot) ?? -1e9) < 2000) {
        this.mmDots.fillStyle(teams && (p.team === 0 || p.team === 1) ? TEAM_FILL[p.team] : 0x4a9be0, 1).fillCircle(ox + p.x * s, oy + p.y * s, 2.5);
      }
    }
    for (const pk of this.session.pickups()) {
      if (!pk.active) continue;
      if (pk.supply) {
        const blink = Math.floor(time / 250) % 2 === 0;
        this.mmDots.fillStyle(0x0b0908, 1).fillRect(ox + pk.x * s - 3, oy + pk.y * s - 3, 6, 6);
        this.mmDots.fillStyle(blink ? 0xff7a3a : 0xffd36a, 1).fillRect(ox + pk.x * s - 2, oy + pk.y * s - 2, 4, 4);
      } else if (pk.medkit) {
        // first-aid kits: a small green cross
        this.mmDots.fillStyle(0x6aff7a, 0.95).fillRect(ox + pk.x * s - 2, oy + pk.y * s - 0.5, 4, 1).fillRect(ox + pk.x * s - 0.5, oy + pk.y * s - 2, 1, 4);
      } else this.mmDots.fillStyle(0xffd36a, 0.9).fillRect(ox + pk.x * s - 1, oy + pk.y * s - 1, 2, 2);
    }
    for (const p of this.supplyPings) {
      const k = (time - p.at) / 800;
      const r = 3 + (k % 1) * 12;
      this.mmDots.lineStyle(1, 0xff7a3a, Math.max(0, 1 - (k % 1))).strokeCircle(ox + p.x * s, oy + p.y * s, r);
    }
    // bases: a disc in the owner's colour; flags: a little pennant (on its carrier when carried)
    for (const b of this.session.bases()) {
      const r = Math.max(3.5, BASE_RULES.radius * s);
      this.mmDots.fillStyle(b.owner === null ? 0xd9c7a3 : TEAM_FILL[b.owner], b.owner === null ? 0.35 : 0.75).fillCircle(ox + b.x * s, oy + b.y * s, r);
      if (b.contested && Math.floor(time / 220) % 2 === 0) this.mmDots.lineStyle(1, 0xffffff, 1).strokeCircle(ox + b.x * s, oy + b.y * s, r + 1);
    }
    for (const f of this.session.flags()) {
      const c = f.status === 'carried' ? players.find((p) => p.slot === f.carrier) : undefined;
      const x = ox + (c ? c.x : f.x) * s;
      const y = oy + (c ? c.y : f.y) * s;
      if (f.status !== 'home' && Math.floor(time / 200) % 2 === 0) continue;
      this.mmDots.lineStyle(1, 0x0b0908, 1).lineBetween(x, y + 2, x, y - 6);
      this.mmDots.fillStyle(TEAM_FILL[f.team], 1).fillTriangle(x, y - 6, x + 6, y - 4, x, y - 2);
    }
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
    this.statusText.setText(conn === 'offline' ? t('PRACTICE') : conn === 'reconnecting' ? t('RECONNECTING…') : conn === 'lost' ? t('LINE IS DEAD') : hud.ping !== null ? t('{n} ms', { n: hud.ping }) : '');
    this.statusText.setColor(conn === 'online' ? ((hud.ping ?? 0) > 150 ? '#e8a040' : '#8fae78') : conn === 'offline' ? '#9a9080' : '#ff6a5a');
    // touch interact button only when a weapon can be swapped
    if (this.interactBtn) {
      const v = !!hud.pickupPrompt && hud.alive;
      this.interactBtn.visible = v;
      this.interactBtn.ring.setVisible(v);
      this.interactBtn.icon.setVisible(v);
    }
    if (this.scoreboardVisible) this.drawScoreboard(sorted, teams ? hud.teamScore : null, hud.gameMode);
    if (this.fpsText) this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} fps`);
    void delta;
  }

  /** The strip under the timer: both flags' state (capture the flag) or the bases A, B, C (base capture). */
  private drawObjectiveStrip(time: number, myTeam: Team | null) {
    const g = this.objGfx;
    g.clear();
    if (!this.objMode) return;
    const cx = this.scoreCx;
    const y = this.scorePad + 46 + OBJ_STRIP / 2;
    const blink = Math.floor(time / 250) % 2 === 0;
    if (this.objMode === 'ctf') {
      const flags = this.session.flags();
      ([0, 1] as const).forEach((team) => {
        const f: RenderFlag | undefined = flags.find((x) => x.team === team);
        const x0 = cx + (team === 0 ? -56 : 6);
        const status = f?.status ?? 'home';
        // the pennant: upright at home, tilted when carried, lying when dropped
        const fx = x0 + 6;
        if (status === 'home') {
          g.lineStyle(1.5, 0xd9c7a3, 1).lineBetween(fx, y - 7, fx, y + 7);
          g.fillStyle(TEAM_FILL[team], 1).fillTriangle(fx + 1, y - 7, fx + 11, y - 4, fx + 1, y - 1);
        } else if (status === 'carried') {
          g.lineStyle(1.5, 0xd9c7a3, 1).lineBetween(fx - 2, y + 6, fx + 4, y - 7);
          g.fillStyle(TEAM_FILL[team], blink ? 1 : 0.45).fillTriangle(fx + 4, y - 7, fx + 13, y - 2, fx + 2, y - 1);
        } else {
          g.lineStyle(1.5, 0xd9c7a3, 1).lineBetween(fx - 3, y + 5, fx + 9, y + 1);
          g.fillStyle(TEAM_FILL[team], 0.9).fillTriangle(fx + 1, y + 4, fx + 7, y + 2, fx + 5, y + 7);
        }
        const label = status === 'home' ? t('HOME') : status === 'carried' ? t('TAKEN') : t('DOWN {s}', { s: Math.ceil((f?.returnInMs ?? 0) / 1000) });
        const tx = this.objTexts[team]!;
        tx.setText(label).setPosition(x0 + 34, y).setColor(status === 'home' ? '#b8a888' : team === myTeam ? '#ff6a5a' : '#ffd36a');
      });
      return;
    }
    const bases = this.session.bases();
    const n = bases.length;
    bases.forEach((b: RenderBase, i) => {
      const bx = cx + (i - (n - 1) / 2) * 34;
      const r = 8.5;
      g.fillStyle(b.owner === null ? 0x3a352e : TEAM_FILL[b.owner], 1).fillCircle(bx, y, r);
      g.lineStyle(1, b.contested && blink ? 0xffffff : 0x0b0908, 1).strokeCircle(bx, y, r);
      if (b.capturer !== null && b.progress > 0.01) {
        g.lineStyle(2.5, TEAM_FILL[b.capturer], 1);
        g.beginPath();
        g.arc(bx, y, r + 2.5, -Math.PI / 2, -Math.PI / 2 + b.progress * Math.PI * 2, false);
        g.strokePath();
      }
      const tx = this.objTexts[i];
      tx?.setPosition(bx, y).setColor(b.owner === myTeam && myTeam !== null ? '#fff4e4' : '#e8dcc0');
    });
  }

  /** Remember recent shooters for the minimap radar. */
  noteShot(slot: number, now: number): void {
    this.lastShotAt.set(slot, now);
  }

  /** Slot 4 (desktop) / the equipment button (touch): icon, charges left, «detonate» state of C4. */
  private updateGadget(hud: ReturnType<GameSession['hud']>, time: number) {
    const g = hud.gadget;
    const n = hud.gadgetCharges;
    const armed = hud.c4Armed;
    const blink = Math.floor(time / 250) % 2 === 0;
    if (!this.touch) {
      const icon = this.gadgetIcon;
      const x = icon.x - 20;
      const y = icon.y - 20;
      const gfx = this.slotGfx;
      gfx.fillStyle(PANEL, 0.65).fillRect(x, y, 40, 40);
      gfx.lineStyle(armed ? 2 : 1, armed ? (blink ? 0xff3a2a : 0x8a1a16) : 0x3a3128, 1).strokeRect(x + 0.5, y + 0.5, 39, 39);
      gfx.fillStyle(0xd9c7a3, 1).fillRect(icon.x - 7, icon.y + 29, 14, 14);
      if (g) {
        fitIcon(icon, `ico_${g}`, 30, 26, 1).setAlpha(n > 0 || armed ? 1 : 0.3).setVisible(true);
        this.gadgetCount.setText(armed ? '' : `×${n}`).setColor(n > 0 ? BEIGE : '#8a7a68');
      } else {
        icon.setVisible(false);
        this.gadgetCount.setText('');
      }
      this.slotNums[3]!.setVisible(true);
    } else if (this.gadgetBtn) {
      const b = this.gadgetBtn;
      const show = !!g && hud.alive;
      b.visible = show;
      b.ring.setVisible(show);
      b.icon.setVisible(show);
      this.gadgetBtnCount?.setVisible(show);
      if (show) {
        fitIcon(b.icon, `ico_${g}`, b.r * 1.25, b.r * 0.95, 2);
        b.icon.setAlpha(n > 0 || armed ? 1 : 0.35);
        if (armed) b.icon.setTint(blink ? 0xff5a4a : 0xffffff);
        else b.icon.clearTint();
        this.gadgetBtnCount?.setText(armed ? '!' : String(n));
      }
    }
  }

  private drawSlots(weapon: WeaponId, items: Array<WeaponId | null>) {
    const g = this.slotGfx;
    g.clear();
    items.forEach((w, i) => {
      const icon = this.slotIcons[i]!;
      const x = icon.x - 20;
      const y = icon.y - 20;
      const active = w === weapon;
      g.fillStyle(PANEL, active ? 0.9 : 0.65).fillRect(x, y, 40, 40);
      g.lineStyle(active ? 2 : 1, active ? 0xd8392e : 0x3a3128, 1).strokeRect(x + 0.5, y + 0.5, 39, 39);
      g.fillStyle(0xd9c7a3, 1).fillRect(icon.x - 7, icon.y + 29, 14, 14);
      if (w) fitIcon(icon, `ico_${w}`, 36, 26, 0.8).setAlpha(active ? 1 : 0.55).setVisible(true);
      else icon.setVisible(false);
    });
  }

  private centre(hud: ReturnType<GameSession['hud']>, me: RenderPlayer | undefined, time: number) {
    let big = '';
    let sub = '';
    let color = BEIGE;
    const teams = isTeamMode(hud.gameMode);
    const teamName = (team: 0 | 1) => (team === 0 ? t('RED') : t('BLUE'));
    if (hud.phase === 'ready') big = t('GET READY');
    else if (hud.phase === 'countdown') {
      big = String(Math.max(1, Math.ceil(hud.phaseRemainingMs / 1000)));
      sub = teams && hud.myTeam !== null ? t('You play for the {team} team', { team: teamName(hud.myTeam) }) : t('District business is serious business');
      if (teams && hud.myTeam !== null) color = TEAM_TEXT[hud.myTeam];
    } else if (hud.phase === 'active' && time < this.goUntil) big = t('FORWARD!');
    else if (hud.phase === 'finished') {
      big = t('MATCH OVER');
      if (teams) {
        const [r, b] = hud.teamScore;
        sub = r === b ? t('Draw: {r} — {b}', { r, b }) : t('{team} team wins {r} — {b}', { team: teamName(r > b ? 0 : 1), r, b });
      }
    } else if (me && !me.alive && hud.phase === 'active') {
      big = t('ELIMINATED');
      color = '#ff5a4a';
      const back = t('back in {s} s', { s: (hud.respawnInMs / 1000).toFixed(1) });
      sub = hud.killedBy ? `${t('Dropped by {name}', { name: hud.killedBy })} · ${back}` : back;
    }
    if (hud.connection === 'reconnecting') {
      big = t('CONNECTION LOST');
      sub = t('Reconnecting…');
      color = '#ff5a4a';
    }
    this.bigText.setText(big).setFontSize(big.length > 3 ? (this.touch ? 34 : 44) : 72);
    this.bigText.setColor(color);
    this.subText.setText(sub);
    let prompt = '';
    if (hud.alive && hud.pickupPrompt) prompt = this.touch ? t('Take: {name}', { name: weaponName(hud.pickupPrompt) }) : t('[E] — pick up the {name}', { name: weaponName(hud.pickupPrompt) });
    // a placed C4 waits for the second press
    else if (hud.alive && hud.c4Armed) prompt = this.touch ? t('Equipment button — detonate the C4') : t('[G] — detonate the C4');
    else if (me?.alive && hud.phase === 'active' && this.objMode === 'ctf') {
      const flags = this.session.flags();
      if (flags.some((f) => f.carrier === me.slot && f.status === 'carried')) {
        const own = flags.find((f) => f.team === hud.myTeam);
        prompt = own && own.status !== 'home' ? t('You have the flag! Your own flag must be home to score — hold on') : t('You have the flag! Carry it to your stand');
      }
    } else if (me?.alive && hud.phase === 'active' && this.objMode === 'bases') {
      const b = this.session.bases().find((x) => Math.hypot(x.x - me.x, x.y - me.y) <= BASE_RULES.radius);
      if (b) {
        const letter = BASE_LETTERS[b.index] ?? '?';
        prompt = b.contested ? t('Base {l}: the enemy is inside — clear them out', { l: letter }) : b.owner === hud.myTeam && b.capturer === null ? t('Base {l} is ours', { l: letter }) : t('Taking base {l}… {p}%', { l: letter, p: Math.floor((b.capturer === hud.myTeam ? b.progress : 0) * 100) });
      }
    }
    this.promptText.setText(prompt);
  }

  /**
   * Tab table: rebuilt only when its content or the screen width changes. Team matches: a red and a
   * blue section with the team's eliminations in the header.
   */
  private drawScoreboard(sorted: RenderPlayer[], teamScore: [number, number] | null, mode: import('@blatkom/shared').GameMode) {
    const W = this.scale.width;
    const H = this.scale.height;
    const sig = `${W}|${H}|${getLang()}|${mode}|${teamScore?.join(':') ?? ''}|${sorted.map((p) => `${p.slot}:${p.name}:${p.level}:${p.kills}:${p.assists}:${p.deaths}:${p.score}:${p.isBot}:${p.team}:${p.objectives}`).join('|')}`;
    if (sig === this.sbSig) return;
    this.sbSig = sig;
    this.scoreboard.removeAll(true);
    type Row = { kind: 'team'; team: 0 | 1; score: number } | { kind: 'player'; p: RenderPlayer; rank: number };
    const rows: Row[] = [];
    if (teamScore) {
      for (const team of [0, 1] as const) {
        rows.push({ kind: 'team', team, score: teamScore[team] });
        sorted.filter((p) => p.team === team).forEach((p, i) => rows.push({ kind: 'player', p, rank: i + 1 }));
      }
    } else sorted.forEach((p, i) => rows.push({ kind: 'player', p, rank: i + 1 }));
    const w = Math.min(560, W - 24);
    const step = w < 470 ? 38 : 50;
    // ten players + two team headers must fit on a phone held sideways
    const rowH = Math.max(20, Math.min(28, Math.floor((H - 80 - 86) / Math.max(1, rows.length))));
    const font = rowH < 24 ? 13 : 15;
    const h = 66 + rows.length * rowH;
    const x = (W - w) / 2;
    const y = Math.max(8, Math.min(80, H - h - 8));
    const g = this.add.graphics();
    this.panel(g, x, y, w, h, 0.92);
    this.scoreboard.add(g);
    const cols: Array<[string, (p: RenderPlayer) => string]> = [
      [t('LVL'), (p) => (p.level === null ? '—' : String(p.level))],
      ...(mode === 'ctf' ? [[t('FLAGS'), (p: RenderPlayer) => String(p.objectives)] as [string, (p: RenderPlayer) => string]] : mode === 'bases' ? [[t('BASES'), (p: RenderPlayer) => String(p.objectives)] as [string, (p: RenderPlayer) => string]] : []),
      [t('ELIM'), (p) => String(p.kills)],
      [t('AST'), (p) => String(p.assists)],
      [t('DTH'), (p) => String(p.deaths)],
      [t('PTS'), (p) => String(p.score)],
    ];
    const colX = (i: number) => x + w - 14 - step / 2 - (cols.length - 1 - i) * step;
    this.scoreboard.add(txt(this, x + 16, y + 12, t('PLAYER'), 12, '#b8a888', '600'));
    cols.forEach(([label], i) => this.scoreboard.add(txt(this, colX(i), y + 12, label, 11, i === cols.length - 1 ? BEIGE : '#b8a888', '600').setOrigin(0.5, 0)));
    const nameRoom = colX(0) - step / 2 - (x + 46) - 6;
    rows.forEach((row, i) => {
      const ry = y + 40 + i * rowH;
      if (row.kind === 'team') {
        g.fillStyle(TEAM_FILL[row.team], 0.28).fillRect(x + 8, ry - 3, w - 16, rowH);
        g.fillStyle(TEAM_FILL[row.team], 1).fillRect(x + 8, ry - 3, 3, rowH);
        this.scoreboard.add(txt(this, x + 18, ry + 1, row.team === 0 ? t('RED TEAM') : t('BLUE TEAM'), font, TEAM_TEXT[row.team], '700'));
        this.scoreboard.add(txt(this, colX(cols.length - 1), ry + 1, String(row.score), font, TEAM_TEXT[row.team], '700').setOrigin(0.5, 0));
        this.scoreboard.add(txt(this, colX(cols.length - 2) + step / 2, ry + 3, mode === 'ctf' ? t('flags captured') : mode === 'bases' ? t('base points') : t('eliminations'), 10, '#b8a888', '500').setOrigin(1, 0));
        return;
      }
      const p = row.p;
      if (p.isLocal) g.fillStyle(0x8a1a16, 0.35).fillRect(x + 8, ry - 3, w - 16, rowH);
      const size = Math.min(22, rowH - 4);
      const portrait = this.add.image(x + 16, ry, `portrait_small_${p.character}`).setOrigin(0, 0).setDisplaySize(size, size);
      const nameColor = p.team === 0 || p.team === 1 ? TEAM_TEXT[p.team] : p.isLocal ? RED : BEIGE;
      const n = fitText(txt(this, x + 46, ry + 1, '', font, nameColor, p.isLocal ? '700' : '500'), `${row.rank}. ${p.name}${p.isBot ? ` · ${t('bot')}` : ''}`, nameRoom);
      this.scoreboard.add([portrait, n]);
      cols.forEach(([, get], c) => {
        const last = c === cols.length - 1;
        const color = c === 0 ? '#ffd36a' : last ? BEIGE : '#d9cdb2';
        this.scoreboard.add(txt(this, colX(c), ry + 1, get(p), font, color, last ? '700' : '500').setOrigin(0.5, 0));
      });
    });
    const rule =
      mode === 'ctf'
        ? t('Capture +{c} · return +{r} · steal +{s} · stopping a carrier +{k}', { c: CTF_RULES.capturePoints, r: CTF_RULES.returnPoints, s: CTF_RULES.takePoints, k: CTF_RULES.carrierKillPoints })
        : mode === 'bases'
          ? t('Base taken +{b} for everyone inside · a team point every second per base held', { b: BASE_RULES.capturePoints })
          : t('Elimination +{k} · assist +{a} ({d}+ damage within {s} s before the elimination)', { k: SCORING.killPoints, a: SCORING.assistPoints, d: SCORING.assistMinDamage, s: SCORING.assistWindowMs / 1000 });
    this.scoreboard.add(fitText(txt(this, W / 2, y + h - 20, '', 11, '#9a9080', '400').setOrigin(0.5, 0), rule, w - 24));
  }
}
