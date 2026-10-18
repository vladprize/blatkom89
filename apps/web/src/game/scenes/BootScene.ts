import * as Phaser from 'phaser';
import { preloadAssets, registerAnimations } from '../assets.js';

/** Loads every atlas/texture once and registers animations; reports progress to the DOM boot bar. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    const bar = document.querySelector<HTMLElement>('#boot .boot__bar i');
    this.load.on('progress', (v: number) => {
      if (bar) bar.style.width = `${Math.round(v * 100)}%`;
    });
    preloadAssets(this);
  }

  create(): void {
    registerAnimations(this);
    this.game.events.emit('assets-ready');
  }
}
