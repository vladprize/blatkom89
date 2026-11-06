/** Core simulation constants. All distances are world pixels, times are milliseconds unless noted. */
export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;
export const TICK_DT = 1 / TICK_RATE;
/** Snapshots are broadcast every N simulation ticks (60 / 2 = 30 Hz). */
export const SNAPSHOT_EVERY_TICKS = 2;

export const PLAYER_RADIUS = 10;
export const MAX_HP = 100;
export const RUN_SPEED = 140;
export const WALK_SPEED = 72;
export const ACCELERATION = 1400;
export const DECELERATION = 1900;

/**
 * v0.2.20 (the owner: «добавь игрокам спринт с запасом дыхалки — на мобильном бежишь, если сильно тянешь
 * джойстик бега, на ПК — зажимая Shift»): a sprint that costs breath. Held with the move stick past its ring
 * or Shift; it runs out after about three seconds and comes back after a short rest; firing stops it.
 */
export const SPRINT = Object.freeze({
  /** × the run speed. */
  speed: 1.36,
  /** A full breath. */
  max: 100,
  /** Spent per second of sprint (≈3.1 s from full). */
  drainPerSec: 32,
  /** Back per second once rested (≈4.5 s to full). */
  regenPerSec: 22,
  /** The rest before the breath starts coming back (ms). */
  regenDelayMs: 700,
  /** A new sprint needs at least this much (no stutter at the bottom of the bar). */
  minToStart: 18,
  /** The stick's share of a full pull it takes (a sprint is a run, not a creep). */
  minStick: 0.6,
});

/** Lag compensation: how far back (ms) the server may rewind targets for hit detection. */
export const MAX_REWIND_MS = 250;
export const HISTORY_MS = 600;

export const PICKUP_RADIUS = 18;
export const DROPPED_WEAPON_TTL_MS = 20_000;
/** HP restored by a first-aid kit (capped at MAX_HP). */
export const MEDKIT_HEAL = 50;

export const SPAWN_PROTECTION_MS = 1500;
export const RESPAWN_DELAY_MS = 2500;

/** Fixed-point scales used by the binary protocol. */
export const POS_SCALE = 4; // 0.25 px precision, max 16383 px
export const VEL_SCALE = 8;
export const MOVE_AXIS_MAX = 127;

/** Server-side input rate limiting (token bucket, one token per tick). */
export const INPUT_BUCKET_MAX = 12;
export const INPUT_QUEUE_MAX = 40;
export const MAX_INPUTS_PER_TICK = 3;
export const MAX_INPUTS_PER_MESSAGE = 8;

export const MAX_NAME_LENGTH = 24;
export const ROOM_CODE_LENGTH = 6;
