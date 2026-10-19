/**
 * Binary wire format for high-frequency traffic (inputs and snapshots). Little-endian.
 * Low-frequency messages (lobby, events, results) are JSON — see protocol.ts.
 */
import { MAX_INPUTS_PER_MESSAGE, POS_SCALE, VEL_SCALE } from '../constants/game.js';
import { MATCH_PHASES } from '../game-rules/match.js';
import type { MatchPhase, Team } from '../game-rules/match.js';
import { WEAPONS, WEAPON_BY_INDEX } from '../game-rules/weapons.js';
import type { WeaponId } from '../game-rules/weapons.js';
import { GADGETS, GADGET_IDS, armsAt, armsIndex } from '../game-rules/gadgets.js';
import type { ArmsId, GadgetId } from '../game-rules/gadgets.js';
import type { GadgetState, InputFrame, PelletResult, PickupState, PlayerState, WorldEvent } from '../sim/world.js';
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
    v.setUint8(o + 8, f.buttons & 0x3f);
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
    if (buttons > 0x3f || slot > 3) throw new ProtocolError('bad input flags');
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
  /** Loadout slots 1 and 2. */
  sidearm: WeaponId;
  melee: WeaponId;
  sideMag: number;
  heavy: WeaponId | null;
  heavyMag: number;
  heavyReserve: number;
  kills: number;
  assists: number;
  deaths: number;
  score: number;
  ack: number;
  reloadRemaining: number;
  cooldownRemaining: number;
  spreadHeat: number;
  shotCounter: number;
  respawnIn: number;
  /** Equipment type and charges left (slot 4). */
  gadget: GadgetId | null;
  gadgetCharges: number;
  /** Blinded by a flashbang for this many more ms. */
  flashedRemaining: number;
  /** The weapon in hand has a laser sight (visible to everyone). */
  laser: boolean;
  /** Team matches: 0 red, 1 blue; null in free-for-all. */
  team: Team | null;
}

export interface NetGadget {
  id: number;
  kind: GadgetId;
  /** Owner's slot. */
  owner: number;
  phase: 'moving' | 'armed' | 'active';
  /** Mine: triggered (about to blow). */
  triggered: boolean;
  x: number;
  y: number;
  /** Turret aim (radians). */
  aim: number;
  /** Turret health. */
  hp: number;
  /** Time left in the current phase (ms): fuse, arming, burning, smoke or turret life. */
  leftMs: number;
}

export interface NetPickup {
  id: number;
  /** Slot-3 weapon; null for a first-aid kit. */
  weapon: WeaponId | null;
  active: boolean;
  dropped: boolean;
  /** «Дефицит» supply crate. */
  supply: boolean;
  medkit: boolean;
  x: number;
  y: number;
}

export interface NetShot {
  shooter: number;
  /** A weapon, or 'turret' for a turret's shot (then ox/oy is the turret). */
  weapon: ArmsId;
  turret: boolean;
  /** Suppressed (by design or by a silencer modification): no flash, quiet sound, no radar blip. */
  silenced: boolean;
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
  /** Team matches: eliminations by red and blue (zeros in free-for-all). */
  teamScore: [number, number];
  players: NetPlayer[];
  pickups: NetPickup[];
  shots: NetShot[];
  melees: NetMelee[];
  gadgets: NetGadget[];
}

export interface SnapshotSource {
  tick: number;
  time: number;
  phase: MatchPhase;
  phaseRemaining: number;
  teamScore?: readonly [number, number];
  players: Iterable<PlayerState>;
  pickups: readonly PickupState[];
  gadgets: readonly GadgetState[];
  events: readonly WorldEvent[];
  now: number;
}

const HEADER_BYTES = 19;
const PLAYER_BYTES = 47;
const GADGET_BYTES = 15;
const GADGET_PHASES = ['moving', 'armed', 'active'] as const;

const u16 = (x: number) => clamp(Math.round(x), 0, 65535);
const i16 = (x: number) => clamp(Math.round(x), -32768, 32767);
const u8c = (x: number) => clamp(Math.round(x), 0, 255);

export function encodeSnapshot(src: SnapshotSource): ArrayBuffer {
  const players = [...src.players];
  const shots = src.events.filter((e): e is Extract<WorldEvent, { t: 'shot' }> => e.t === 'shot');
  const melees = src.events.filter((e): e is Extract<WorldEvent, { t: 'melee' }> => e.t === 'melee');
  const pickups = src.pickups.filter((p) => p.active || !p.dropped);
  const gadgets = src.gadgets.slice(0, 255);
  let size = HEADER_BYTES + players.length * PLAYER_BYTES + 1 + pickups.length * 8 + 2 + 1 + 1;
  for (const s of shots) size += 10 + s.pellets.length * 6;
  size += melees.length * 4 + gadgets.length * GADGET_BYTES;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o, MSG_SNAPSHOT);
  v.setUint32(o + 1, src.tick >>> 0, true);
  v.setUint32(o + 5, Math.max(0, Math.round(src.time)) >>> 0, true);
  v.setUint8(o + 9, MATCH_PHASES.indexOf(src.phase));
  v.setUint32(o + 10, Math.max(0, Math.round(src.phaseRemaining)) >>> 0, true);
  v.setUint16(o + 14, u16(src.teamScore?.[0] ?? 0), true);
  v.setUint16(o + 16, u16(src.teamScore?.[1] ?? 0), true);
  v.setUint8(o + 18, players.length);
  o += HEADER_BYTES;
  for (const p of players) {
    const flags =
      (p.alive ? 1 : 0) |
      (p.connected ? 2 : 0) |
      (p.reloadWeapon ? 4 : 0) |
      (src.now < p.invulnUntil ? 8 : 0) |
      (p.walking ? 16 : 0) |
      (p.heavy ? 32 : 0) |
      (p.mods[p.weapon]?.includes('laser') ? 64 : 0);
    v.setUint8(o, p.slot);
    v.setUint8(o + 1, flags);
    v.setUint16(o + 2, u16(p.x * POS_SCALE), true);
    v.setUint16(o + 4, u16(p.y * POS_SCALE), true);
    v.setInt16(o + 6, i16(p.vx * VEL_SCALE), true);
    v.setInt16(o + 8, i16(p.vy * VEL_SCALE), true);
    v.setUint16(o + 10, quantizeAngle(p.aim), true);
    v.setUint8(o + 12, u8c(p.hp));
    v.setUint8(o + 13, WEAPONS[p.weapon].index);
    v.setUint8(o + 14, u8c(p.sideMag));
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
    v.setUint16(o + 38, u16(p.assists), true);
    v.setUint8(o + 40, WEAPONS[p.sidearm].index);
    v.setUint8(o + 41, WEAPONS[p.melee].index);
    v.setUint8(o + 42, p.gadget ? GADGETS[p.gadget].index : 255);
    v.setUint8(o + 43, u8c(p.gadgetCharges));
    v.setUint16(o + 44, u16(Math.max(0, p.flashedUntil - src.time)), true);
    v.setUint8(o + 46, p.team === null ? 255 : p.team);
    o += PLAYER_BYTES;
  }
  v.setUint8(o, pickups.length);
  o += 1;
  for (const pk of pickups) {
    v.setUint16(o, pk.id & 0xffff, true);
    v.setUint8(o + 2, pk.weapon ? WEAPONS[pk.weapon].index : 255);
    v.setUint8(o + 3, (pk.active ? 1 : 0) | (pk.dropped ? 2 : 0) | (pk.supply ? 4 : 0) | (pk.kind === 'medkit' ? 8 : 0));
    v.setUint16(o + 4, u16(pk.x * POS_SCALE), true);
    v.setUint16(o + 6, u16(pk.y * POS_SCALE), true);
    o += 8;
  }
  v.setUint16(o, shots.length, true);
  o += 2;
  for (const s of shots) {
    v.setUint8(o, s.shooter);
    v.setUint8(o + 1, armsIndex(s.weapon));
    v.setUint16(o + 2, s.shotId & 0xffff, true);
    v.setUint16(o + 4, u16(s.ox * POS_SCALE), true);
    v.setUint16(o + 6, u16(s.oy * POS_SCALE), true);
    v.setUint8(o + 8, s.pellets.length);
    v.setUint8(o + 9, (s.turret ? 1 : 0) | (s.silenced ? 2 : 0));
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
  v.setUint8(o, gadgets.length);
  o += 1;
  for (const g of gadgets) {
    const left = g.phase === 'active' || (g.phase === 'armed' && src.time >= g.fuseAt) ? g.endsAt - src.time : g.fuseAt - src.time;
    v.setUint16(o, g.id & 0xffff, true);
    v.setUint8(o + 2, GADGETS[g.kind].index);
    v.setUint8(o + 3, g.ownerSlot);
    v.setUint8(o + 4, GADGET_PHASES.indexOf(g.phase) | (g.triggeredAt > 0 ? 8 : 0));
    v.setUint16(o + 5, u16(g.x * POS_SCALE), true);
    v.setUint16(o + 7, u16(g.y * POS_SCALE), true);
    v.setUint16(o + 9, quantizeAngle(g.aim), true);
    v.setUint8(o + 11, u8c(g.hp));
    v.setUint16(o + 12, u16(Math.max(0, left) / 10), true);
    v.setUint8(o + 14, 0);
    o += GADGET_BYTES;
  }
  if (o !== size) throw new Error(`snapshot size mismatch ${o} != ${size}`);
  return buf;
}

function weaponAt(i: number): WeaponId {
  const w = WEAPON_BY_INDEX[i];
  if (!w) throw new ProtocolError('bad weapon index');
  return w;
}

function armsFrom(i: number): ArmsId {
  const a = armsAt(i);
  if (!a) throw new ProtocolError('bad arms index');
  return a;
}

function teamAt(i: number): Team | null {
  if (i === 255) return null;
  if (i === 0 || i === 1) return i;
  throw new ProtocolError('bad team');
}

function gadgetAt(i: number): GadgetId {
  const g = GADGET_IDS[i];
  if (!g) throw new ProtocolError('bad gadget index');
  return g;
}

export function decodeSnapshot(data: ArrayBuffer | Uint8Array): Snapshot {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 0;
  const need = (n: number) => {
    if (o + n > u8.byteLength) throw new ProtocolError('truncated snapshot');
  };
  need(HEADER_BYTES);
  if (v.getUint8(0) !== MSG_SNAPSHOT) throw new ProtocolError('not a snapshot');
  const phase = MATCH_PHASES[v.getUint8(9)];
  if (!phase) throw new ProtocolError('bad phase');
  const snap: Snapshot = {
    tick: v.getUint32(1, true),
    serverTime: v.getUint32(5, true),
    phase,
    phaseRemaining: v.getUint32(10, true),
    teamScore: [v.getUint16(14, true), v.getUint16(16, true)],
    players: [],
    pickups: [],
    shots: [],
    melees: [],
    gadgets: [],
  };
  const np = v.getUint8(18);
  o = HEADER_BYTES;
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
      sidearm: weaponAt(v.getUint8(o + 40)),
      melee: weaponAt(v.getUint8(o + 41)),
      sideMag: v.getUint8(o + 14),
      heavy: heavyIdx === 255 ? null : weaponAt(heavyIdx),
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
      assists: v.getUint16(o + 38, true),
      gadget: v.getUint8(o + 42) === 255 ? null : gadgetAt(v.getUint8(o + 42)),
      gadgetCharges: v.getUint8(o + 43),
      flashedRemaining: v.getUint16(o + 44, true),
      laser: (flags & 64) !== 0,
      team: teamAt(v.getUint8(o + 46)),
    });
    o += PLAYER_BYTES;
  }
  need(1);
  const nk = v.getUint8(o);
  o += 1;
  for (let i = 0; i < nk; i++) {
    need(8);
    const flags = v.getUint8(o + 3);
    const wi = v.getUint8(o + 2);
    const medkit = (flags & 8) !== 0;
    snap.pickups.push({
      id: v.getUint16(o, true),
      weapon: medkit || wi === 255 ? null : weaponAt(wi),
      active: (flags & 1) !== 0,
      dropped: (flags & 2) !== 0,
      supply: (flags & 4) !== 0,
      medkit,
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
      weapon: armsFrom(v.getUint8(o + 1)),
      turret: (v.getUint8(o + 9) & 1) !== 0,
      silenced: (v.getUint8(o + 9) & 2) !== 0,
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
  need(1);
  const ng = v.getUint8(o);
  o += 1;
  for (let i = 0; i < ng; i++) {
    need(GADGET_BYTES);
    const ph = v.getUint8(o + 4);
    const phase = GADGET_PHASES[ph & 3];
    if (!phase) throw new ProtocolError('bad gadget phase');
    snap.gadgets.push({
      id: v.getUint16(o, true),
      kind: gadgetAt(v.getUint8(o + 2)),
      owner: v.getUint8(o + 3),
      phase,
      triggered: (ph & 8) !== 0,
      x: v.getUint16(o + 5, true) / POS_SCALE,
      y: v.getUint16(o + 7, true) / POS_SCALE,
      aim: dequantizeAngle(v.getUint16(o + 9, true)),
      hp: v.getUint8(o + 11),
      leftMs: v.getUint16(o + 12, true) * 10,
    });
    o += GADGET_BYTES;
  }
  return snap;
}
