/** Samples keyboard/mouse or touch into fixed-step InputFrames (60 Hz). */
import * as Phaser from 'phaser';
import { BTN, quantizeAngle, quantizeAxis } from '@blatkom/shared';
import type { InputFrame } from '@blatkom/shared';
import { touchState } from './TouchState.js';
import { getSettings } from '../../app/settings.js';

/**
 * Input sequence shared by every InputManager of this page: a rematch or a second match in the same
 * room creates a new game scene, but the server must keep seeing increasing sequence numbers.
 */
let lastSeq = 0;

export class InputManager {
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private aim = 0;
  private edgeButtons = 0;
  private pendingSlot = 0;
  private lastMouseMove = 0;
  usingTouch = false;
  enabled = true;
  onPause: (() => void) | null = null;
  onScoreboard: ((show: boolean) => void) | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      const map: Record<string, number> = { W: K.W, A: K.A, S: K.S, D: K.D, UP: K.UP, DOWN: K.DOWN, LEFT: K.LEFT, RIGHT: K.RIGHT, SHIFT: K.SHIFT, R: K.R, Q: K.Q, E: K.E, ONE: K.ONE, TWO: K.TWO, THREE: K.THREE, G: K.G, TAB: K.TAB, ESC: K.ESC, SPACE: K.SPACE };
      for (const [name, code] of Object.entries(map)) this.keys[name] = kb.addKey(code, true, false);
      kb.on('keydown-R', () => (this.edgeButtons |= BTN.RELOAD));
      kb.on('keydown-Q', () => (this.edgeButtons |= BTN.NEXT_WEAPON));
      kb.on('keydown-E', () => (this.edgeButtons |= BTN.INTERACT));
      // equipment: one use per key press (auto-repeat of a held key is ignored)
      kb.on('keydown-G', (e: KeyboardEvent) => {
        if (!e.repeat) this.edgeButtons |= BTN.GADGET;
      });
      kb.on('keydown-ONE', () => (this.pendingSlot = 1));
      kb.on('keydown-TWO', () => (this.pendingSlot = 2));
      kb.on('keydown-THREE', () => (this.pendingSlot = 3));
      kb.on('keydown-ESC', () => this.onPause?.());
      kb.on('keydown-TAB', () => this.onScoreboard?.(true));
      kb.on('keyup-TAB', () => this.onScoreboard?.(false));
      kb.on('keydown', () => (this.usingTouch = false));
    }
    scene.input.mouse?.disableContextMenu();
    scene.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (Math.abs(dy) > 0) this.edgeButtons |= BTN.NEXT_WEAPON;
    });
    // the middle mouse button also uses the equipment
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch && p.middleButtonDown()) this.edgeButtons |= BTN.GADGET;
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      this.usingTouch = false;
      this.lastMouseMove = performance.now();
    });
  }

  get aimAngle(): number {
    return this.aim;
  }

  /** Builds the input for the next simulation tick. */
  sample(player: { x: number; y: number } | null, viewTime: number): InputFrame {
    let mx = 0;
    let my = 0;
    let buttons = 0;
    const k = this.keys;
    const touch = touchState.enabled && (this.usingTouch || performance.now() - this.lastMouseMove > 3000);
    if (this.enabled) {
      if (touch) {
        mx = touchState.moveX;
        my = touchState.moveY;
        if (touchState.aimActive) {
          this.aim = Math.atan2(touchState.aimY, touchState.aimX);
          const mag = Math.sqrt(touchState.aimX ** 2 + touchState.aimY ** 2);
          if (getSettings().autoFire && mag > 0.86) buttons |= BTN.FIRE;
        } else if (Math.abs(mx) + Math.abs(my) > 0.2) {
          this.aim = Math.atan2(my, mx);
        }
        if (touchState.fireHeld) buttons |= BTN.FIRE;
        if (touchState.reloadTap) buttons |= BTN.RELOAD;
        if (touchState.swapTap) buttons |= BTN.NEXT_WEAPON;
        if (touchState.interactTap) buttons |= BTN.INTERACT;
        if (touchState.gadgetTap) buttons |= BTN.GADGET;
        touchState.reloadTap = touchState.swapTap = touchState.interactTap = touchState.gadgetTap = false;
      } else {
        if (k.A?.isDown || k.LEFT?.isDown) mx -= 1;
        if (k.D?.isDown || k.RIGHT?.isDown) mx += 1;
        if (k.W?.isDown || k.UP?.isDown) my -= 1;
        if (k.S?.isDown || k.DOWN?.isDown) my += 1;
        const len = Math.sqrt(mx * mx + my * my);
        if (len > 1) {
          mx /= len;
          my /= len;
        }
        if (k.SHIFT?.isDown) buttons |= BTN.WALK;
        const pointer = this.scene.input.activePointer;
        if (player) {
          const cam = this.scene.cameras.main;
          const wp = cam.getWorldPoint(pointer.x, pointer.y);
          if (Math.abs(wp.x - player.x) + Math.abs(wp.y - player.y) > 2) this.aim = Math.atan2(wp.y - player.y, wp.x - player.x);
        }
        if (pointer.leftButtonDown() && !pointer.wasTouch) buttons |= BTN.FIRE;
        if (k.SPACE?.isDown) buttons |= BTN.FIRE;
      }
      buttons |= this.edgeButtons;
    }
    this.edgeButtons = 0;
    const slot = this.pendingSlot;
    this.pendingSlot = 0;
    return {
      seq: ++lastSeq,
      moveX: quantizeAxis(mx),
      moveY: quantizeAxis(my),
      aim: quantizeAngle(this.aim),
      buttons,
      slot,
      viewTime: Math.max(0, Math.round(viewTime)),
    };
  }

  setAim(a: number): void {
    this.aim = a;
  }
}
