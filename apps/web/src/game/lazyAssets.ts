/**
 * v0.2.21: the assets the menu does not need, loaded in the background once it is up (game/assets.ts
 * queueRest): the other characters' sprites, then the portraits. A match waits for the sprites only.
 */
import type * as Phaser from 'phaser';
import { CHARACTER_IDS } from '@blatkom/shared';
import { queueRest, registerAnimations } from './assets.js';

let started = false;
let spritesDone = false;
let allDone = false;
const spriteWaiters: Array<() => void> = [];

function flushSprites() {
  if (spritesDone) return;
  spritesDone = true;
  for (const w of spriteWaiters.splice(0)) w();
}

/** Starts the background load on `scene`'s loader (the boot scene, which stays alive). */
export function startBackgroundLoad(scene: Phaser.Scene): void {
  if (started) return;
  started = true;
  const { sprites, files } = queueRest(scene);
  if (!files) {
    allDone = true;
    flushSprites();
    return;
  }
  if (!sprites) flushSprites();
  // an atlas is two files (its picture and its frames): the sprites are in when every character's texture is
  const allSprites = () => CHARACTER_IDS.every((c) => scene.textures.exists(`char_${c}`));
  scene.load.on('filecomplete', (key: string) => {
    if (!key.startsWith('char_')) return;
    registerAnimations(scene);
    if (allSprites()) flushSprites();
  });
  scene.load.once('complete', () => {
    registerAnimations(scene);
    flushSprites();
    allDone = true;
  });
  scene.load.start();
}

/** Every character's sprites are in (a match can start). */
export function spritesReady(): boolean {
  return spritesDone;
}

/** Resolves once every character's sprites are in. */
export function whenSprites(): Promise<void> {
  return spritesDone ? Promise.resolve() : new Promise((res) => spriteWaiters.push(res));
}

/** Tests and tools: the whole background load is over. */
export function backgroundLoadDone(): boolean {
  return allDone;
}
