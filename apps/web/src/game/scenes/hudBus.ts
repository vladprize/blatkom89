import * as Phaser from 'phaser';

/** Event bus between GameScene, HudScene and the HTML app shell. */
export const hudBus = new Phaser.Events.EventEmitter();

export interface KillFeedEntry {
  killer: string;
  killerLocal: boolean;
  victim: string;
  victimLocal: boolean;
  weapon: import('@blatkom/shared').WeaponId;
}
