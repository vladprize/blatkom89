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
  /** Team matches: the teams of the killer and the victim (null in free-for-all). */
  killerTeam?: import('@blatkom/shared').Team | null;
  victimTeam?: import('@blatkom/shared').Team | null;
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

/**
 * Capture the flag / base capture: a line for the kill feed («Petya stole the blue flag») and,
 * for what matters to the local player's team, a banner under the score box.
 */
export interface ObjectiveEntry {
  /** Who did it (empty when the flag went home by itself). */
  actor: string;
  actorTeam: import('@blatkom/shared').Team | null;
  actorLocal: boolean;
  /** The rest of the feed line, after the name. */
  text: string;
  /** The team the line is about (colours the marker in the feed). */
  team: import('@blatkom/shared').Team;
  banner?: { title: string; sub?: string; good: boolean | null };
}
