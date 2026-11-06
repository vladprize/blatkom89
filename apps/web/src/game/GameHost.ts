/**
 * Owns the Phaser.Game instance: fixed internal resolution (short side = 300 world px at 2 texels
 * per px), CSS upscaling with crisp pixels, scene switching between menu backdrop and gameplay.
 */
import * as Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';
import { HudScene } from './scenes/HudScene.js';
import { PreviewScene } from './scenes/PreviewScene.js';
import { VhsPipeline } from './render/VhsPipeline.js';
import { internalSize } from './viewSize.js';
import { isRotated, patchPhaser } from '../app/landscape.js';

export { internalSize };
import type { GameSession } from './session/types.js';

export class GameHost {
  readonly game: Phaser.Game;
  private readyPromise: Promise<void>;

  constructor(parent: HTMLElement) {
    // v0.2.20: while a match turns an upright phone sideways (app/landscape.ts) the game is as wide as the screen is tall
    const view = () => (isRotated() ? { w: parent.clientWidth, h: parent.clientHeight } : { w: window.innerWidth, h: window.innerHeight });
    const v0 = view();
    const size = internalSize(v0.w, v0.h);
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: '#0b0908',
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      width: size.width,
      height: size.height,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      input: { activePointers: 4, touch: { capture: true } },
      fps: { target: 60, smoothStep: true },
      render: { powerPreference: 'high-performance', batchSize: 4096 },
      audio: { noAudio: true },
      pipeline: { Vhs: VhsPipeline } as unknown as Phaser.Types.Core.PipelineConfig,
      scene: [BootScene, PreviewScene, GameScene, HudScene],
      banner: false,
    });
    this.readyPromise = new Promise((res) => this.game.events.once('assets-ready', () => res()));
    patchPhaser(this.game);
    const onResize = () => {
      const v = view();
      const s = internalSize(v.w, v.h);
      if (s.width !== this.game.scale.gameSize.width || s.height !== this.game.scale.gameSize.height) this.game.scale.setGameSize(s.width, s.height);
      this.game.scale.refresh();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
    // v0.2.17: typing in the menus. A match's keys (W, A, S, D, the arrows, Space, R, Q, E, G, 1–3…) are
    // captured by Phaser for the whole page, and the captures outlive the match — so after one match a
    // club's name or a friend's alias lost those letters. While a text field has the focus the game's
    // keyboard is off; a match also releases its captures when it ends (GameScene.cleanup).
    const editable = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
    document.addEventListener('focusin', (e) => {
      const kb = this.game.input?.keyboard;
      if (kb && editable(e.target)) kb.enabled = false;
    });
    document.addEventListener('focusout', (e) => {
      const kb = this.game.input?.keyboard;
      if (kb && editable(e.target)) kb.enabled = true;
    });
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  showPreview(): void {
    if (this.game.scene.isActive('game')) this.game.scene.stop('game');
    if (!this.game.scene.isActive('preview')) this.game.scene.start('preview');
  }

  startGame(session: GameSession): void {
    if (this.game.scene.isActive('preview')) this.game.scene.stop('preview');
    if (this.game.scene.isActive('game')) this.game.scene.stop('game');
    this.game.scene.start('game', { session });
  }

  stopGame(): void {
    if (this.game.scene.isActive('game')) this.game.scene.stop('game');
  }

  previewScene(): PreviewScene | null {
    return (this.game.scene.getScene('preview') as PreviewScene) ?? null;
  }
}
