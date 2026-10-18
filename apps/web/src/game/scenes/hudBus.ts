import * as Phaser from 'phaser';

/** Event bus between GameScene, HudScene and the HTML app shell. */
export const hudBus = new Phaser.Events.EventEmitter();

export interface KillFeedEntry {
  killer: string;
  killerLocal: boolean;
  victim: string;
  victimLocal: boolean;
  weapon: import('@blatkom/shared').WeaponId;
  /** Names of players credited with an assist. */
  assists: string[];
  assistLocal: boolean;
}

/** Points the local player just earned (floating «+2» popup). */
export interface PointsEntry {
  points: number;
  label: string;
  /** Health restored by a first-aid kit (green popup, not match points). */
  heal?: boolean;
}

/** A «дефицит» supply crate appeared. */
export interface SupplyEntry {
  x: number;
  y: number;
  weapon: import('@blatkom/shared').WeaponId;
}
