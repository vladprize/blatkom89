import type * as Phaser from 'phaser';

/**
 * v0.2.22: Phaser redraws a text's canvas and uploads it to the GPU on every `setColor` — even to the colour it
 * already has. Whatever sets a text's colour every frame (the HUD's timer, ammo and status, the bases' letters)
 * goes through here: the redraw happens on a change only.
 */
export function tint<T extends Phaser.GameObjects.Text>(t: T, color: string): T {
  if (t.style.color !== color) t.setColor(color);
  return t;
}
