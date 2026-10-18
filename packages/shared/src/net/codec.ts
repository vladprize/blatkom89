/**
 * Binary wire format for high-frequency traffic (inputs and snapshots). Little-endian.
 * Low-frequency messages (lobby, events, results) are JSON — see protocol.ts.
 */
import { MAX_INPUTS_PER_MESSAGE, POS_SCALE, VEL_SCALE } from '../constants/game.js';
import { MATCH_PHASES } from '../game-rules/match.js';
import type { MatchPhase } from '../game-rules/match.js';
import { WEAPONS, WEAPON_BY_INDEX } from '../game-rules/weapons.js';
import type { HeavyWeaponId, WeaponId } from '../game-rules/weapons.js';
import type { InputFrame, PelletResult, PickupState, PlayerState, WorldEvent } from '../sim/world.js';
import { clamp, dequantizeAngle, quantizeAngle } from '../sim/math.js';

export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;

export class ProtocolError extends Error {}

const INPUT_BYTES = 14;

export function encodeInputs(inputs: readonly InputFrame[]): ArrayBuffer {
  const n = Math.min(inputs.length, MAX_INPUTS_PER_MESSAGE);
  const buf = new ArrayBuffer(2 + n * INPUT_BYTES);
  const v = new DataView(buf);
  v.setUint8(0, MSG_INPUT);
  v.setUint8(1, n);
  let o = 2;
  for (let i = inputs.length - n; i < inputs.length; i++) {
    const f = inputs[i]!;
    v.setUint32(o, f.seq >>> 0, true);
    v.setInt8(o + 4, clamp(Math.round(f.moveX), -127, 127));
    v.setInt8(o + 5, clamp(Math.round(f.moveY), -127, 127));
    v.setUint16(o + 6, f.aim & 0xffff, true);
    v.setUint8(o + 8, f.buttons & 0x1f);
    v.setUint8(o + 9, clamp(f.slot | 0, 0, 3));
    v.setUint32(o + 10, Math.max(0, Math.round(f.viewTime)) >>> 0, true);
    o += INPUT_BYTES;
  }
  return buf;
}

/** Strictly validates and decodes an input batch. Throws ProtocolError on malformed data. */
export function decodeInputs(data: ArrayBuffer | Uint8Array): InputFrame[] {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (u8.byteLength < 2) throw new ProtocolError('short input message');
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (v.getUint8(0) !== MSG_INPUT) throw new ProtocolError('not an input message');
  const n = v.getUint8(1);
  if (n === 0 || n > MAX_INPUTS_PER_MESSAGE) throw new ProtocolError('bad input count');
  if (u8.byteLength !== 2 + n * INPUT_BYTES) throw new ProtocolError('bad input length');
  const out: InputFrame[] = [];
  let o = 2;
  for (let i = 0; i < n; i++) {
    const buttons = v.getUint8(o + 8);
    const slot = v.getUint8(o + 9);
    if (buttons > 0x1f || slot > 3) throw new ProtocolError('bad input flags');
    const mx = v.getInt8(o + 4);
    const my = v.getInt8(o + 5);
    if (mx === -128 || my === -128) throw new ProtocolError('bad move axis');
    out.push({
      seq: v.getUint32(o, true),
      moveX: mx,
      moveY: my,
      aim: v.getUint16(o + 6, true),
      buttons,
      slot,
      viewTime: v.getUint32(o + 10, true),
    });
    o += INPUT_BYTES;
  }
  return out;
}

// ── Snapshot ───────────────────────────────────────────────────────────────

export interface NetPlayer {
  slot: number;
  alive: boolean;
  connected: boolean;
  reloading: boolean;
  invulnerable: boolean;
  walking: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aim: number;
  hp: number;
  weapon: WeaponId;
  pistolMag: number;
  heavy: HeavyWeaponId | null;
  heavyMag: number;
  heavyReserve: number;
  kills: number;
  deaths: number;
  score: number;
  ack: number;
  reloadRemaining: number;
  cooldownRemaining: number;
  spreadHeat: number;
  shotCounter: number;
  respawnIn: number;
}

export interface NetPickup {
  id: number;
  weapon: HeavyWeaponId;
  active: boolean;
  dropped: boolean;
  x: number;
  y: number;
}

export interface NetShot {
  shooter: number;
  weapon: WeaponId;
  shotId: number;
  ox: number;
  oy: number;
  pellets: PelletResult[];
}

export interface NetMelee {
  shooter: number;
  angle: number;
  hit: number;
}

export interface Snapshot {
  tick: number;
  serverTime: number;
  phase: MatchPhase;
  phaseRemaining: number;
  players: NetPlayer[];
  pickups: NetPickup[];
  shots: NetShot[];
  melees: NetMelee[];
}

export interface SnapshotSource {
  tick: number;
  time: number;
  phase: MatchPhase;
  phaseRemaining: number;
  players: Iterable<PlayerState>;
  pickups: readonly PickupState[];
  events: readonly WorldEvent[];
  now: number;
}

const PLAYER_BYTES = 40;

const u16 = (x: number) => clamp(Math.round(x), 0, 65535);
const i16 = (x: number) => clamp(Math.round(x), -32768, 32767);
const u8c = (x: number) => clamp(Math.round(x), 0, 255);

export function encodeSnapshot(src: SnapshotSource): ArrayBuffer {
  const players = [...src.players];
  const shots = src.events.filter((e): e is Extract<WorldEvent, { t: 'shot' }> => e.t === 'shot');
  const melees = src.events.filter((e): e is Extract<WorldEvent, { t: 'melee' }> => e.t === 'melee');
  const pickups = src.pickups.filter((p) => p.active || !p.dropped);
  let size = 1 + 4 + 4 + 1 + 4 + 1 + players.length * PLAYER_BYTES + 1 + pickups.length * 8 + 2 + 1;
  for (const s of shots) size += 10 + s.pellets.length * 6;
  size += melees.length * 4;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o, MSG_SNAPSHOT);
  v.setUint32(o + 1, src.tick >>> 0, true);
  v.setUint32(o + 5, Math.max(0, Math.round(src.time)) >>> 0, true);
  v.setUint8(o + 9, MATCH_PHASES.indexOf(src.phase));
  v.setUint32(o + 10, Math.max(0, Math.round(src.phaseRemaining)) >>> 0, true);
  v.setUint8(o + 14, players.length);
  o += 15;
  for (const p of players) {
    const flags =
      (p.alive ? 1 : 0) |
      (p.connected ? 2 : 0) |
      (p.reloadWeapon ? 4 : 0) |
      (src.now < p.invulnUntil ? 8 : 0) |
      (p.walking ? 16 : 0) |
      (p.heavy ? 32 : 0);
    v.setUint8(o, p.slot);
    v.setUint8(o + 1, flags);
    v.setUint16(o + 2, u16(p.x * POS_SCALE), true);
    v.setUint16(o + 4, u16(p.y * POS_SCALE), true);
    v.setInt16(o + 6, i16(p.vx * VEL_SCALE), true);
    v.setInt16(o + 8, i16(p.vy * VEL_SCALE), true);
    v.setUint16(o + 10, quantizeAngle(p.aim), true);
    v.setUint8(o + 12, u8c(p.hp));
    v.setUint8(o + 13, WEAPONS[p.weapon].index);
    v.setUint8(o + 14, u8c(p.pistolMag));
    v.setUint8(o + 15, p.heavy ? WEAPONS[p.heavy].index : 255);
    v.setUint8(o + 16, u8c(p.heavyMag));
    v.setUint8(o + 17, u8c(p.heavyReserve));
    v.setUint16(o + 18, u16(p.kills), true);
    v.setUint16(o + 20, u16(p.deaths), true);
    v.setUint16(o + 22, u16(p.score), true);
    v.setUint32(o + 24, p.lastSeq >>> 0, true);
    v.setUint16(o + 28, u16(p.reloadWeapon ? p.reloadUntil - p.clock : 0), true);
    v.setUint16(o + 30, u16(Math.max(0, p.nextFireAt - p.clock)), true);
    v.setUint16(o + 32, u16(p.spreadHeat * 10000), true);
    v.setUint16(o + 34, p.shotCounter & 0xffff, true);
    v.setUint16(o + 36, u16(p.alive ? 0 : Math.max(0, p.respawnAt - src.time)), true);
    v.setUint16(o + 38, 0, true);
    o += PLAYER_BYTES;
  }
  v.setUint8(o, pickups.length);
  o += 1;
  for (const pk of pickups) {
    v.setUint16(o, pk.id & 0xffff, true);
    v.setUint8(o + 2, WEAPONS[pk.weapon].index);
    v.setUint8(o + 3, (pk.active ? 1 : 0) | (pk.dropped ? 2 : 0));
    v.setUint16(o + 4, u16(pk.x * POS_SCALE), true);
    v.setUint16(o + 6, u16(pk.y * POS_SCALE), true);
    o += 8;
  }
  v.setUint16(o, shots.length, true);
  o += 2;
  for (const s of shots) {
    v.setUint8(o, s.shooter);
    v.setUint8(o + 1, WEAPONS[s.weapon].index);
    v.setUint16(o + 2, s.shotId & 0xffff, true);
    v.setUint16(o + 4, u16(s.ox * POS_SCALE), true);
    v.setUint16(o + 6, u16(s.oy * POS_SCALE), true);
    v.setUint8(o + 8, s.pellets.length);
    v.setUint8(o + 9, 0);
    o += 10;
    for (const pl of s.pellets) {
      v.setUint16(o, quantizeAngle(pl.angle), true);
      v.setUint16(o + 2, u16(pl.dist * POS_SCALE), true);
      v.setUint8(o + 4, pl.hit < 0 ? 255 : pl.hit);
      v.setUint8(o + 5, pl.kind);
      o += 6;
    }
  }
  v.setUint8(o, melees.length);
  o += 1;
  for (const m of melees) {
    v.setUint8(o, m.shooter);
    v.setUint16(o + 1, quantizeAngle(m.angle), true);
    v.setUint8(o + 3, m.hit < 0 ? 255 : m.hit);
    o += 4;
  }
  if (o !== size) throw new Error(`snapshot size mismatch ${o} != ${size}`);
  return buf;
}

function weaponAt(i: number): WeaponId {
  const w = WEAPON_BY_INDEX[i];
  if (!w) throw new ProtocolError('bad weapon index');
  return w;
}

export function decodeSnapshot(data: ArrayBuffer | Uint8Array): Snapshot {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 0;
  const need = (n: number) => {
    if (o + n > u8.byteLength) throw new ProtocolError('truncated snapshot');
  };
  need(15);
  if (v.getUint8(0) !== MSG_SNAPSHOT) throw new ProtocolError('not a snapshot');
  const phase = MATCH_PHASES[v.getUint8(9)];
  if (!phase) throw new ProtocolError('bad phase');
  const snap: Snapshot = {
    tick: v.getUint32(1, true),
    serverTime: v.getUint32(5, true),
    phase,
    phaseRemaining: v.getUint32(10, true),
    players: [],
    pickups: [],
    shots: [],
    melees: [],
  };
  const np = v.getUint8(14);
  o = 15;
  for (let i = 0; i < np; i++) {
    need(PLAYER_BYTES);
    const flags = v.getUint8(o + 1);
    const heavyIdx = v.getUint8(o + 15);
    snap.players.push({
      slot: v.getUint8(o),
      alive: (flags & 1) !== 0,
      connected: (flags & 2) !== 0,
      reloading: (flags & 4) !== 0,
      invulnerable: (flags & 8) !== 0,
      walking: (flags & 16) !== 0,
      x: v.getUint16(o + 2, true) / POS_SCALE,
      y: v.getUint16(o + 4, true) / POS_SCALE,
      vx: v.getInt16(o + 6, true) / VEL_SCALE,
      vy: v.getInt16(o + 8, true) / VEL_SCALE,
      aim: dequantizeAngle(v.getUint16(o + 10, true)),
      hp: v.getUint8(o + 12),
      weapon: weaponAt(v.getUint8(o + 13)),
      pistolMag: v.getUint8(o + 14),
      heavy: heavyIdx === 255 ? null : (weaponAt(heavyIdx) as HeavyWeaponId),
      heavyMag: v.getUint8(o + 16),
      heavyReserve: v.getUint8(o + 17),
      kills: v.getUint16(o + 18, true),
      deaths: v.getUint16(o + 20, true),
      score: v.getUint16(o + 22, true),
      ack: v.getUint32(o + 24, true),
      reloadRemaining: v.getUint16(o + 28, true),
      cooldownRemaining: v.getUint16(o + 30, true),
      spreadHeat: v.getUint16(o + 32, true) / 10000,
      shotCounter: v.getUint16(o + 34, true),
      respawnIn: v.getUint16(o + 36, true),
    });
    o += PLAYER_BYTES;
  }
  need(1);
  const nk = v.getUint8(o);
  o += 1;
  for (let i = 0; i < nk; i++) {
    need(8);
    const flags = v.getUint8(o + 3);
    snap.pickups.push({
      id: v.getUint16(o, true),
      weapon: weaponAt(v.getUint8(o + 2)) as HeavyWeaponId,
      active: (flags & 1) !== 0,
      dropped: (flags & 2) !== 0,
      x: v.getUint16(o + 4, true) / POS_SCALE,
      y: v.getUint16(o + 6, true) / POS_SCALE,
    });
    o += 8;
  }
  need(2);
  const ns = v.getUint16(o, true);
  o += 2;
  for (let i = 0; i < ns; i++) {
    need(10);
    const shot: NetShot = {
      shooter: v.getUint8(o),
      weapon: weaponAt(v.getUint8(o + 1)),
      shotId: v.getUint16(o + 2, true),
      ox: v.getUint16(o + 4, true) / POS_SCALE,
      oy: v.getUint16(o + 6, true) / POS_SCALE,
      pellets: [],
    };
    const n = v.getUint8(o + 8);
    o += 10;
    for (let k = 0; k < n; k++) {
      need(6);
      const hit = v.getUint8(o + 4);
      const kind = v.getUint8(o + 5);
      shot.pellets.push({
        angle: dequantizeAngle(v.getUint16(o, true)),
        dist: v.getUint16(o + 2, true) / POS_SCALE,
        hit: hit === 255 ? -1 : hit,
        kind: (kind > 2 ? 0 : kind) as 0 | 1 | 2,
      });
      o += 6;
    }
    snap.shots.push(shot);
  }
  need(1);
  const nm = v.getUint8(o);
  o += 1;
  for (let i = 0; i < nm; i++) {
    need(4);
    const hit = v.getUint8(o + 3);
    snap.melees.push({ shooter: v.getUint8(o), angle: dequantizeAngle(v.getUint16(o + 1, true)), hit: hit === 255 ? -1 : hit });
    o += 4;
  }
  return snap;
}
