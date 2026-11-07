import * as Phaser from 'phaser';
import { bootCharacters, preloadAssets, registerAnimations } from '../assets.js';
import { startBackgroundLoad } from '../lazyAssets.js';
import { storageGet } from '../../app/settings.js';

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
    // v0.2.21: the menu's backdrop crew and the player's own character; the rest comes after the menu is up
    preloadAssets(this, 'assets/', bootCharacters(storageGet('blatkom89.character')), false);
  }

  create(): void {
    registerAnimations(this);
    this.game.events.emit('assets-ready');
    // the boot bar is gone by now: the background load reports nowhere
    this.load.off('progress');
    startBackgroundLoad(this);
  }
}
