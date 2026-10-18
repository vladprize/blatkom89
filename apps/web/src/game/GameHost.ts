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
import { VIEW_SHORT_WORLD, TEXELS_PER_WORLD_PX } from '../app/config.js';
import type { GameSession } from './session/types.js';

export function internalSize(w: number, h: number): { width: number; height: number } {
  const short = VIEW_SHORT_WORLD * TEXELS_PER_WORLD_PX;
  const landscape = w >= h;
  const aspect = landscape ? w / h : h / w;
  const long = Math.min(Math.round(short * aspect), short * 2.4);
  return landscape ? { width: long, height: short } : { width: short, height: long };
}

export class GameHost {
  readonly game: Phaser.Game;
  private readyPromise: Promise<void>;

  constructor(parent: HTMLElement) {
    const size = internalSize(window.innerWidth, window.innerHeight);
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
    const onResize = () => {
      const s = internalSize(window.innerWidth, window.innerHeight);
      if (s.width !== this.game.scale.gameSize.width || s.height !== this.game.scale.gameSize.height) this.game.scale.setGameSize(s.width, s.height);
      this.game.scale.refresh();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
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
