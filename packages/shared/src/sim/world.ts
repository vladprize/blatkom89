/**
 * Authoritative deathmatch simulation. The same code runs on the server (one World per room) and in
 * the client for offline practice and for local-player prediction. Every random value is seeded so
 * that client prediction reproduces the server's spread pattern.
 */
import {
  DROPPED_WEAPON_TTL_MS,
  HISTORY_MS,
  MAX_HP,
  MEDKIT_HEAL,
  MAX_REWIND_MS,
  PICKUP_RADIUS,
  PLAYER_RADIUS,
  RUN_SPEED,
  TICK_DT,
  TICK_MS,
  WALK_SPEED,
  ACCELERATION,
  DECELERATION,
  MOVE_AXIS_MAX,
} from '../constants/game.js';
import type { CharacterId } from '../game-rules/characters.js';
import type { MatchConfig, MatchPhase } from '../game-rules/match.js';
import { DEFAULT_MATCH_CONFIG, SCORING } from '../game-rules/match.js';
import { rankPlaces } from '../game-rules/progression.js';
import type { WeaponDef, WeaponId, WeaponMods } from '../game-rules/weapons.js';
import { WEAPONS, applyMods, damageFalloff, isHeavy } from '../game-rules/weapons.js';
import type { Loadout } from '../game-rules/loadout.js';
import { DEFAULT_LOADOUT, sanitizeLoadout } from '../game-rules/loadout.js';
import type { CollisionWorld } from '../maps/collision.js';
import { rayCircle } from '../maps/collision.js';
import type { MapDef } from '../maps/types.js';
import { angleDiff, dequantizeAngle, wrapAngle } from './math.js';
import { hash32, mulberry32, spreadNoise } from './rng.js';

export const BTN = {
  FIRE: 1,
  RELOAD: 2,
  WALK: 4,
  INTERACT: 8,
  NEXT_WEAPON: 16,
} as const;

export interface InputFrame {
  seq: number;
  /** -127..127 */
  moveX: number;
  moveY: number;
  /** uint16 quantized angle */
  aim: number;
  buttons: number;
  /** 0 = keep, 1..3 = requested inventory slot */
  slot: number;
  /** Server-timeline time (ms) the client was rendering when it produced this input. */
  viewTime: number;
}

export interface PlayerState {
  id: string;
  slot: number;
  name: string;
  character: CharacterId;
  isBot: boolean;
  connected: boolean;
  joinedAt: number;

  x: number;
  y: number;
  vx: number;
  vy: number;
  aim: number;

  hp: number;
  alive: boolean;
  /** Has been spawned at least once in the current match. */
  spawned: boolean;
  diedAt: number;
  respawnAt: number;
  invulnUntil: number;

  /** Weapon in hand. */
  weapon: WeaponId;
  /** Loadout (slot 1 sidearm, slot 2 melee, spawn primary) and upgrade levels. */
  sidearm: WeaponId;
  melee: WeaponId;
  primary: WeaponId | null;
  mods: Partial<Record<WeaponId, WeaponMods>>;
  /** Sidearm magazine (its reserve is infinite). */
  sideMag: number;
  /** Slot-3 weapon currently carried (loadout primary or a map pickup). */
  heavy: WeaponId | null;
  heavyMag: number;
  heavyReserve: number;

  /** Player-local clock: advances by one tick per processed input. Weapon timers use it. */
  clock: number;
  reloadUntil: number;
  reloadWeapon: WeaponId | null;
  nextFireAt: number;
  spreadHeat: number;
  shotCounter: number;
  seed: number;

  kills: number;
  deaths: number;
  score: number;
  damageDealt: number;
  streak: number;
  bestStreak: number;
  lastKillAt: number;

  lastSeq: number;
  lastButtons: number;
  walking: boolean;
  lastShotAt: number;
  lastHitAt: number;
  lastDamagedBy: string | null;
  /** Eliminations of others this player contributed damage to (see SCORING). */
  assists: number;
  /** Damage taken since the last spawn, per attacker (assist detection). */
  recentDamage: Array<{ id: string; at: number; amount: number }>;
}

export interface PickupState {
  id: number;
  kind: 'weapon' | 'medkit';
  /** Slot-3 weapon (kind 'weapon'); null for first-aid kits. */
  weapon: WeaponId | null;
  x: number;
  y: number;
  active: boolean;
  dropped: boolean;
  mag: number;
  reserve: number;
  respawnAt: number;
  expiresAt: number;
  spawnIndex: number;
  /** A «дефицит» supply crate (full ammunition, expires). */
  supply: boolean;
}

export interface PelletResult {
  angle: number;
  dist: number;
  /** Slot of the player hit or -1. */
  hit: number;
  /** 0 = max range, 1 = wall, 2 = player */
  kind: 0 | 1 | 2;
}

export type WorldEvent =
  | { t: 'shot'; shooter: number; weapon: WeaponId; shotId: number; ox: number; oy: number; pellets: PelletResult[] }
  | { t: 'melee'; shooter: number; angle: number; hit: number }
  | { t: 'damage'; victim: number; attacker: number; amount: number; hp: number; weapon: WeaponId }
  | { t: 'kill'; killer: number; victim: number; weapon: WeaponId; assists: number[] }
  | { t: 'respawn'; slot: number; x: number; y: number }
  | { t: 'pickup'; slot: number; weapon: WeaponId; ammoOnly: boolean }
  | { t: 'drop'; slot: number; weapon: WeaponId }
  | { t: 'supply'; x: number; y: number; weapon: WeaponId }
  | { t: 'heal'; slot: number; amount: number; x: number; y: number }
  | { t: 'rocket'; id: number; shooter: number; weapon: WeaponId; x: number; y: number; angle: number; speed: number; range: number }
  | { t: 'boom'; id: number; shooter: number; weapon: WeaponId; x: number; y: number; radius: number }
  | { t: 'reload'; slot: number; weapon: WeaponId }
  | { t: 'dry'; slot: number }
  | { t: 'phase'; phase: MatchPhase }
  | { t: 'matchEnd'; reason: 'time' | 'score' | 'aborted' };

export interface Standing {
  id: string;
  slot: number;
  name: string;
  character: CharacterId;
  isBot: boolean;
  kills: number;
  assists: number;
  deaths: number;
  /** Match points: eliminations and assists (SCORING). */
  score: number;
  damageDealt: number;
  bestStreak: number;
  place: number;
}

export interface WorldOptions {
  config?: Partial<MatchConfig>;
  lagCompensation?: boolean;
  seed?: number;
}

/** A rocket / grenade in flight (server-authoritative; clients draw it from 'rocket'/'boom' events). */
export interface ProjectileState {
  id: number;
  ownerId: string;
  ownerSlot: number;
  weapon: WeaponId;
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  traveled: number;
  maxRange: number;
  radius: number;
  splash: number;
  direct: number;
  selfFactor: number;
}

interface HistoryFrame {
  time: number;
  data: Float32Array; // per slot: x, y, alive
}

const MAX_SLOTS = 8;

/** Weapons a «дефицит» supply crate can contain. */
export const SUPPLY_POOL: readonly WeaponId[] = ['avtomat', 'obrez', 'ksyuha', 'toz', 'svd', 'pkm', 'rpg', 'val', 'sayga'];

export function createPlayerState(id: string, slot: number, name: string, character: CharacterId, isBot: boolean, now: number, seed: number): PlayerState {
  return {
    id,
    slot,
    name,
    character,
    isBot,
    connected: true,
    joinedAt: now,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    aim: 0,
    hp: MAX_HP,
    alive: false,
    spawned: false,
    diedAt: 0,
    respawnAt: 0,
    invulnUntil: 0,
    weapon: 'pistol',
    sidearm: 'pistol',
    melee: 'montirovka',
    primary: null,
    mods: {},
    sideMag: WEAPONS.pistol.magazine,
    heavy: null,
    heavyMag: 0,
    heavyReserve: 0,
    clock: 0,
    reloadUntil: 0,
    reloadWeapon: null,
    nextFireAt: 0,
    spreadHeat: 0,
    shotCounter: 0,
    seed,
    kills: 0,
    deaths: 0,
    score: 0,
    damageDealt: 0,
    streak: 0,
    bestStreak: 0,
    lastKillAt: 0,
    lastSeq: 0,
    lastButtons: 0,
    walking: false,
    lastShotAt: -1e9,
    lastHitAt: -1e9,
    lastDamagedBy: null,
    assists: 0,
    recentDamage: [],
  };
}

/** Deterministic per-input movement step shared by server simulation and client prediction. */
export function stepMovement(p: PlayerState, input: InputFrame, collision: CollisionWorld, normals: number[]): void {
  let mx = input.moveX / MOVE_AXIS_MAX;
  let my = input.moveY / MOVE_AXIS_MAX;
  let mag = Math.sqrt(mx * mx + my * my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
    mag = 1;
  }
  const walking = (input.buttons & BTN.WALK) !== 0;
  const maxSpeed = (walking ? WALK_SPEED : RUN_SPEED) * WEAPONS[p.weapon].moveSpeed;
  const tx = mx * maxSpeed;
  const ty = my * maxSpeed;
  let dvx = tx - p.vx;
  let dvy = ty - p.vy;
  const dvl = Math.sqrt(dvx * dvx + dvy * dvy);
  const rate = mag > 0.01 ? ACCELERATION : DECELERATION;
  const maxDv = rate * TICK_DT;
  if (dvl > maxDv) {
    dvx = (dvx / dvl) * maxDv;
    dvy = (dvy / dvl) * maxDv;
  }
  p.vx += dvx;
  p.vy += dvy;
  if (Math.abs(p.vx) < 0.01) p.vx = 0;
  if (Math.abs(p.vy) < 0.01) p.vy = 0;
  p.x += p.vx * TICK_DT;
  p.y += p.vy * TICK_DT;
  const contacts = collision.resolveCircle(p, PLAYER_RADIUS, normals);
  if (contacts > 0) {
    for (let i = 0; i < normals.length; i += 2) {
      const nx = normals[i]!;
      const ny = normals[i + 1]!;
      const vn = p.vx * nx + p.vy * ny;
      if (vn < 0) {
        p.vx -= vn * nx;
        p.vy -= vn * ny;
      }
    }
  }
  p.walking = walking || (mag > 0.01 && mag < 0.6);
}

const modCache = new WeakMap<WeaponMods, Map<WeaponId, WeaponDef>>();

/** Effective stats of `w` for this player (upgrades applied). */
export function weaponFor(p: Pick<PlayerState, 'mods'>, w: WeaponId): WeaponDef {
  const mods = p.mods[w];
  if (!mods) return WEAPONS[w];
  let per = modCache.get(mods);
  if (!per) {
    per = new Map();
    modCache.set(mods, per);
  }
  let def = per.get(w);
  if (!def) {
    def = applyMods(WEAPONS[w], mods);
    per.set(w, def);
  }
  return def;
}

export function weaponAmmo(p: PlayerState, w: WeaponId): { mag: number; reserve: number } {
  if (w === p.sidearm) return { mag: p.sideMag, reserve: -1 };
  if (w === p.melee) return { mag: 0, reserve: 0 };
  if (p.heavy === w) return { mag: p.heavyMag, reserve: p.heavyReserve };
  return { mag: 0, reserve: 0 };
}

export function availableWeapons(p: PlayerState): WeaponId[] {
  const out: WeaponId[] = [p.sidearm, p.melee];
  if (p.heavy) out.push(p.heavy);
  return out;
}

export interface WeaponHooks {
  shot(p: PlayerState, w: WeaponDef, spread: number): void;
  melee(p: PlayerState, w: WeaponDef): void;
  event(e: WorldEvent): void;
}

/** Deterministic pellet angles for the current shot (shotCounter must already be incremented). */
export function pelletAngles(p: PlayerState, w: WeaponDef, spread: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < w.pellets; k++) out.push(wrapAngle(p.aim + spreadNoise(p.seed, p.shotCounter, k) * spread));
  return out;
}

export function setWeapon(p: PlayerState, w: WeaponId): void {
  p.weapon = w;
  p.reloadWeapon = null;
  p.reloadUntil = 0;
  p.spreadHeat = 0;
  p.nextFireAt = Math.max(p.nextFireAt, p.clock + 150);
}

export function switchToSlot(p: PlayerState, slot: number): void {
  const target: WeaponId | null = slot === 1 ? p.sidearm : slot === 2 ? p.melee : p.heavy;
  if (!target || target === p.weapon) return;
  setWeapon(p, target);
}

export function cycleWeapon(p: PlayerState): void {
  const list = availableWeapons(p);
  const i = list.indexOf(p.weapon);
  setWeapon(p, list[(i + 1) % list.length]!);
}

export function startReload(p: PlayerState, emit?: (e: WorldEvent) => void): boolean {
  const w = weaponFor(p, p.weapon);
  if (w.kind === 'melee' || p.reloadWeapon) return false;
  const ammo = weaponAmmo(p, p.weapon);
  if (ammo.mag >= w.magazine) return false;
  if (ammo.reserve === 0) return false;
  p.reloadWeapon = p.weapon;
  p.reloadUntil = p.clock + w.reloadMs;
  emit?.({ t: 'reload', slot: p.slot, weapon: p.weapon });
  return true;
}

export function finishReload(p: PlayerState): void {
  if (!p.reloadWeapon) return;
  const w = weaponFor(p, p.reloadWeapon);
  if (p.reloadWeapon === p.sidearm) p.sideMag = w.magazine;
  else if (p.heavy === p.reloadWeapon) {
    const take = Math.min(w.magazine - p.heavyMag, p.heavyReserve);
    p.heavyMag += take;
    p.heavyReserve -= take;
  }
  p.reloadWeapon = null;
  p.reloadUntil = 0;
}

/**
 * Weapon state machine for one input step (switching, reloading, cooldowns, ammo, spread).
 * Shared by the authoritative World and client-side prediction; effects are delegated to hooks.
 */
export function stepWeapons(p: PlayerState, input: InputFrame, pressed: number, hooks: WeaponHooks): void {
  const w = weaponFor(p, p.weapon);
  if (w.spreadRecovery > 0 && p.clock - p.lastShotAt > w.fireIntervalMs * 1.5) {
    p.spreadHeat = Math.max(0, p.spreadHeat - w.spreadRecovery * TICK_DT);
  }
  if (p.reloadWeapon && p.clock + 1e-6 >= p.reloadUntil) finishReload(p);
  if (input.slot >= 1 && input.slot <= 3) switchToSlot(p, input.slot);
  if (pressed & BTN.NEXT_WEAPON) cycleWeapon(p);
  if (pressed & BTN.RELOAD) startReload(p, hooks.event);

  if ((input.buttons & BTN.FIRE) === 0) return;
  const cur = weaponFor(p, p.weapon);
  if (p.reloadWeapon) return;
  if (p.clock + 1e-6 < p.nextFireAt) return;
  if (!cur.automatic && (pressed & BTN.FIRE) === 0) return;

  // Firing on the first tick at/after the scheduled time carries the sub-tick remainder over, so
  // the average fire rate matches fireIntervalMs exactly (upgrades are not eaten by 60 Hz rounding).
  const fireBase = p.clock - p.nextFireAt < TICK_MS - 1e-6 ? p.nextFireAt : p.clock;
  if (cur.kind === 'melee') {
    p.shotCounter++;
    p.lastShotAt = p.clock;
    hooks.melee(p, cur);
    p.nextFireAt = fireBase + cur.fireIntervalMs;
    return;
  }
  const ammo = weaponAmmo(p, p.weapon);
  if (ammo.mag <= 0) {
    if (!startReload(p, hooks.event) && pressed & BTN.FIRE) hooks.event({ t: 'dry', slot: p.slot });
    return;
  }
  if (p.weapon === p.sidearm) p.sideMag--;
  else p.heavyMag--;
  p.shotCounter++;
  p.lastShotAt = p.clock;
  const spread = cur.spread + p.spreadHeat;
  p.spreadHeat = Math.min(cur.spreadMax, p.spreadHeat + cur.spreadPerShot);
  hooks.shot(p, cur, spread);
  p.nextFireAt = fireBase + cur.fireIntervalMs;
  if (weaponAmmo(p, p.weapon).mag <= 0) startReload(p, hooks.event);
}

export class World {
  readonly map: MapDef;
  readonly collision: CollisionWorld;
  readonly config: MatchConfig;
  readonly lagCompensation: boolean;
  time = 0;
  tick = 0;
  phase: MatchPhase = 'waiting';
  phaseEndsAt = 0;
  matchStartedAt = 0;
  matchEndsAt = 0;
  endReason: 'time' | 'score' | 'aborted' | null = null;
  readonly players = new Map<string, PlayerState>();
  readonly pickups: PickupState[] = [];
  readonly projectiles: ProjectileState[] = [];
  events: WorldEvent[] = [];
  private nextPickupId = 1;
  private nextProjectileId = 1;
  /** World time of the next «дефицит» supply drop (active phase only). */
  nextSupplyAt = 0;
  private readonly history: HistoryFrame[] = [];
  private readonly rng: () => number;
  private readonly normals: number[] = [];

  constructor(map: MapDef, collision: CollisionWorld, options: WorldOptions = {}) {
    this.map = map;
    this.collision = collision;
    this.config = { ...DEFAULT_MATCH_CONFIG, ...options.config };
    this.lagCompensation = options.lagCompensation ?? true;
    this.rng = mulberry32(options.seed ?? 0x5eed);
    map.pickups.forEach((ps, i) => {
      this.pickups.push({
        id: this.nextPickupId++,
        kind: 'weapon',
        weapon: ps.weapon,
        x: ps.x,
        y: ps.y,
        active: true,
        dropped: false,
        mag: WEAPONS[ps.weapon].magazine,
        reserve: WEAPONS[ps.weapon].reserveOnPickup,
        respawnAt: 0,
        expiresAt: 0,
        spawnIndex: i,
        supply: false,
      });
    });
    map.medkits.forEach((m, i) => {
      this.pickups.push({ id: this.nextPickupId++, kind: 'medkit', weapon: null, x: m.x, y: m.y, active: true, dropped: false, mag: 0, reserve: 0, respawnAt: 0, expiresAt: 0, spawnIndex: i, supply: false });
    });
  }

  // ── Roster ──────────────────────────────────────────────────────────────
  freeSlot(): number {
    const used = new Set([...this.players.values()].map((p) => p.slot));
    for (let s = 0; s < MAX_SLOTS; s++) if (!used.has(s)) return s;
    return -1;
  }

  addPlayer(id: string, name: string, character: CharacterId, isBot = false, loadout: Loadout = DEFAULT_LOADOUT): PlayerState {
    const existing = this.players.get(id);
    if (existing) return existing;
    const slot = this.freeSlot();
    if (slot < 0) throw new Error('room full');
    const p = createPlayerState(id, slot, name, character, isBot, this.time, hash32(slot + 1, Math.floor(this.rng() * 0xffffffff)));
    this.applyLoadout(p, loadout);
    this.players.set(id, p);
    if (this.phase === 'countdown' || this.phase === 'active') this.spawnPlayer(p, this.phase === 'countdown');
    return p;
  }

  /** Loadout used from the next spawn on (the weapon in hand is not swapped mid-life). */
  setLoadout(id: string, loadout: Loadout): void {
    const p = this.players.get(id);
    if (p) this.applyLoadout(p, loadout);
  }

  private applyLoadout(p: PlayerState, raw: Loadout) {
    const l = sanitizeLoadout(raw);
    p.sidearm = l.sidearm;
    p.melee = l.melee;
    p.primary = l.primary;
    p.mods = l.mods;
    if (!p.alive) {
      p.weapon = l.primary ?? l.sidearm;
      p.sideMag = weaponFor(p, l.sidearm).magazine;
    }
  }

  removePlayer(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.alive && p.heavy) this.dropHeavy(p);
    this.players.delete(id);
  }

  playerBySlot(slot: number): PlayerState | undefined {
    for (const p of this.players.values()) if (p.slot === slot) return p;
    return undefined;
  }

  // ── Phases ──────────────────────────────────────────────────────────────
  private setPhase(phase: MatchPhase, duration: number) {
    this.phase = phase;
    this.phaseEndsAt = duration > 0 ? this.time + duration : 0;
    this.events.push({ t: 'phase', phase });
  }

  /** Lobby → ready → countdown → active. */
  beginMatch(skipReady = false): void {
    if (this.phase !== 'waiting') return;
    this.resetScores();
    if (skipReady) this.startCountdown();
    else this.setPhase('ready', this.config.readyMs);
  }

  private startCountdown() {
    this.setPhase('countdown', this.config.countdownMs);
    this.resetPickups();
    const order = [...this.players.values()].sort((a, b) => a.slot - b.slot);
    const spawns = this.shuffledSpawnIndices();
    order.forEach((p, i) => this.spawnPlayer(p, true, spawns[i % spawns.length]));
  }

  private startActive() {
    this.setPhase('active', this.config.durationMs);
    this.matchStartedAt = this.time;
    this.matchEndsAt = this.time + this.config.durationMs;
    this.nextSupplyAt = this.time + this.config.supplyFirstMs;
    for (const p of this.players.values()) {
      if (!p.alive) this.spawnPlayer(p, false);
      p.invulnUntil = this.time + this.config.spawnProtectionMs;
    }
  }

  finish(reason: 'time' | 'score' | 'aborted'): void {
    if (this.phase === 'finished' || this.phase === 'closed') return;
    this.endReason = reason;
    this.setPhase('finished', this.config.finishedMs);
    this.events.push({ t: 'matchEnd', reason });
    for (const p of this.players.values()) {
      p.vx = 0;
      p.vy = 0;
    }
  }

  /** Back to the lobby for a rematch, keeping the roster. */
  resetToLobby(): void {
    this.setPhase('waiting', 0);
    this.endReason = null;
    for (const p of this.players.values()) {
      p.alive = false;
      p.spawned = false;
      p.heavy = null;
    }
    this.pickups.splice(0, this.pickups.length, ...this.pickups.filter((pk) => !pk.dropped));
    this.projectiles.length = 0;
    this.resetPickups();
  }

  close(): void {
    this.setPhase('closed', 0);
  }

  private resetScores() {
    for (const p of this.players.values()) {
      p.kills = 0;
      p.assists = 0;
      p.deaths = 0;
      p.score = 0;
      p.damageDealt = 0;
      p.streak = 0;
      p.bestStreak = 0;
      p.lastKillAt = 0;
    }
  }

  private resetPickups() {
    for (let i = this.pickups.length - 1; i >= 0; i--) if (this.pickups[i]!.dropped) this.pickups.splice(i, 1);
    for (const pk of this.pickups) {
      pk.active = true;
      if (pk.weapon) {
        pk.mag = WEAPONS[pk.weapon].magazine;
        pk.reserve = WEAPONS[pk.weapon].reserveOnPickup;
      }
    }
    this.projectiles.length = 0;
  }

  get matchTimeLeftMs(): number {
    if (this.phase === 'active') return Math.max(0, this.matchEndsAt - this.time);
    if (this.phase === 'countdown' || this.phase === 'ready') return this.config.durationMs;
    return 0;
  }

  // ── Spawning ────────────────────────────────────────────────────────────
  private shuffledSpawnIndices(): number[] {
    const idx = this.map.spawns.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
    return idx;
  }

  /** Picks the spawn farthest from living opponents, penalizing spawns they can see. */
  chooseSpawn(forId: string): number {
    const enemies = [...this.players.values()].filter((p) => p.alive && p.id !== forId);
    let best = 0;
    let bestScore = -Infinity;
    this.map.spawns.forEach((s, i) => {
      if (this.collision.overlapsCircle(s.x, s.y, PLAYER_RADIUS)) return;
      let minD = 1200;
      let seen = false;
      for (const e of enemies) {
        const d = Math.sqrt((e.x - s.x) ** 2 + (e.y - s.y) ** 2);
        minD = Math.min(minD, d);
        if (d < 700 && this.collision.lineOfSight(e.x, e.y, s.x, s.y)) seen = true;
      }
      const score = minD - (seen ? 400 : 0) + this.rng() * 60;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }

  spawnPlayer(p: PlayerState, frozen: boolean, spawnIndex?: number): void {
    const i = spawnIndex ?? this.chooseSpawn(p.id);
    const s = this.map.spawns[i] ?? this.map.spawns[0]!;
    p.x = s.x;
    p.y = s.y;
    p.vx = 0;
    p.vy = 0;
    p.aim = s.angle;
    p.hp = MAX_HP;
    p.alive = true;
    p.spawned = true;
    p.invulnUntil = this.time + (frozen ? this.config.countdownMs + this.config.spawnProtectionMs : this.config.spawnProtectionMs);
    p.sideMag = weaponFor(p, p.sidearm).magazine;
    if (p.primary) {
      // the loadout primary comes with a full magazine and one spare; map pickups top it up
      const def = weaponFor(p, p.primary);
      p.heavy = p.primary;
      p.heavyMag = def.magazine;
      p.heavyReserve = Math.min(WEAPONS[p.primary].reserveMax, def.magazine);
      p.weapon = p.primary;
    } else {
      p.heavy = null;
      p.heavyMag = 0;
      p.heavyReserve = 0;
      p.weapon = p.sidearm;
    }
    p.reloadUntil = 0;
    p.reloadWeapon = null;
    p.nextFireAt = p.clock;
    p.spreadHeat = 0;
    p.lastDamagedBy = null;
    p.recentDamage = [];
    this.events.push({ t: 'respawn', slot: p.slot, x: p.x, y: p.y });
  }

  // ── Inputs ──────────────────────────────────────────────────────────────
  /** Applies one fixed-step input (TICK_MS) for a player. */
  applyInput(id: string, input: InputFrame): void {
    const p = this.players.get(id);
    if (!p) return;
    p.lastSeq = input.seq;
    p.clock += TICK_MS;
    const pressed = input.buttons & ~p.lastButtons;
    p.lastButtons = input.buttons;
    if (!p.alive) return;
    p.aim = dequantizeAngle(input.aim);
    if (this.phase !== 'active') return;

    stepMovement(p, input, this.collision, this.normals);
    this.applyWeaponInput(p, input, pressed);
    this.checkPickups(p, (pressed & BTN.INTERACT) !== 0);
  }

  private applyWeaponInput(p: PlayerState, input: InputFrame, pressed: number) {
    stepWeapons(p, input, pressed, {
      shot: (pl, w, spread) => this.doShot(pl, w, spread, input.viewTime),
      melee: (pl, w) => this.doMelee(pl, w, input.viewTime),
      event: (e) => this.events.push(e),
    });
  }

  // ── Combat ──────────────────────────────────────────────────────────────
  private targetsAt(viewTime: number, exclude: PlayerState): Array<{ p: PlayerState; x: number; y: number }> {
    const out: Array<{ p: PlayerState; x: number; y: number }> = [];
    const frame = this.lagCompensation ? this.sampleHistory(viewTime) : null;
    for (const q of this.players.values()) {
      if (q === exclude || !q.alive) continue;
      let x = q.x;
      let y = q.y;
      if (frame) {
        const k = q.slot * 3;
        if (frame[k + 2]! > 0.5) {
          x = frame[k]!;
          y = frame[k + 1]!;
        }
      }
      out.push({ p: q, x, y });
    }
    return out;
  }

  private doShot(p: PlayerState, w: WeaponDef, spread: number, viewTime: number) {
    p.invulnUntil = Math.min(p.invulnUntil, this.time);
    if (w.kind === 'projectile' && w.projectile) return this.launch(p, w, spread);
    const targets = this.targetsAt(viewTime, p);
    const pellets: PelletResult[] = [];
    const dmgByVictim = new Map<PlayerState, number>();
    for (const a of pelletAngles(p, w, spread)) {
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const wallHit = this.collision.raycast(p.x, p.y, dx, dy, w.range, 'shot');
      let maxT = wallHit ? wallHit.t : w.range;
      let victim: PlayerState | null = null;
      for (const tgt of targets) {
        const t = rayCircle(p.x, p.y, dx, dy, tgt.x, tgt.y, PLAYER_RADIUS);
        if (t !== null && t < maxT) {
          maxT = t;
          victim = tgt.p;
        }
      }
      if (victim) {
        const dmg = w.damage * damageFalloff(w, maxT);
        dmgByVictim.set(victim, (dmgByVictim.get(victim) ?? 0) + dmg);
        pellets.push({ angle: a, dist: maxT, hit: victim.slot, kind: 2 });
      } else {
        pellets.push({ angle: a, dist: maxT, hit: -1, kind: wallHit ? 1 : 0 });
      }
    }
    this.events.push({ t: 'shot', shooter: p.slot, weapon: w.id, shotId: p.shotCounter, ox: p.x, oy: p.y, pellets });
    for (const [victim, dmg] of dmgByVictim) this.applyDamage(victim, p, Math.round(dmg), w.id);
  }

  /** Rockets and grenades: fly in a straight line, explode on walls, players or at max range. */
  private launch(p: PlayerState, w: WeaponDef, spread: number) {
    const pr = w.projectile!;
    const angle = pelletAngles(p, w, spread)[0]!;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    // start just in front of the shooter, but never inside a wall
    const start = Math.min(14, this.collision.raycast(p.x, p.y, dx, dy, 14, 'shot')?.t ?? 14);
    const proj: ProjectileState = {
      id: this.nextProjectileId++,
      ownerId: p.id,
      ownerSlot: p.slot,
      weapon: w.id,
      x: p.x + dx * start,
      y: p.y + dy * start,
      dx,
      dy,
      speed: pr.speed,
      traveled: start,
      maxRange: w.range,
      radius: pr.radius,
      splash: pr.splash,
      direct: w.damage,
      selfFactor: pr.selfFactor,
    };
    this.projectiles.push(proj);
    this.events.push({ t: 'rocket', id: proj.id, shooter: p.slot, weapon: w.id, x: proj.x, y: proj.y, angle, speed: pr.speed, range: w.range });
  }

  private stepProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i]!;
      const step = Math.min(pr.speed * (TICK_MS / 1000), pr.maxRange - pr.traveled);
      const wall = this.collision.raycast(pr.x, pr.y, pr.dx, pr.dy, step, 'shot');
      let t = wall ? wall.t : step;
      let direct: PlayerState | null = null;
      for (const q of this.players.values()) {
        if (!q.alive || (q.id === pr.ownerId && pr.traveled < 40)) continue;
        const ht = rayCircle(pr.x, pr.y, pr.dx, pr.dy, q.x, q.y, PLAYER_RADIUS);
        if (ht !== null && ht <= t) {
          t = ht;
          direct = q;
        }
      }
      pr.x += pr.dx * t;
      pr.y += pr.dy * t;
      pr.traveled += t;
      if (wall || direct || pr.traveled >= pr.maxRange - 0.01) {
        // explode slightly off the wall so line-of-sight checks see the room the rocket hit from
        const bx = pr.x - pr.dx * (wall && !direct ? 2 : 0);
        const by = pr.y - pr.dy * (wall && !direct ? 2 : 0);
        this.projectiles.splice(i, 1);
        this.explode(pr, bx, by, direct);
      }
    }
  }

  private explode(pr: ProjectileState, x: number, y: number, direct: PlayerState | null) {
    this.events.push({ t: 'boom', id: pr.id, shooter: pr.ownerSlot, weapon: pr.weapon, x, y, radius: pr.radius });
    const owner = this.players.get(pr.ownerId) ?? null;
    for (const q of [...this.players.values()]) {
      if (!q.alive) continue;
      const d = Math.hypot(q.x - x, q.y - y);
      if (d > pr.radius + PLAYER_RADIUS) continue;
      if (q !== direct && !this.collision.lineOfSight(x, y, q.x, q.y)) continue;
      const k = Math.max(0, Math.min(1, (d - PLAYER_RADIUS * 0.5) / pr.radius));
      let dmg = pr.splash * (1 - 0.7 * k) + (q === direct ? pr.direct : 0);
      if (q.id === pr.ownerId) dmg *= pr.selfFactor;
      this.applyDamage(q, owner, Math.round(dmg), pr.weapon);
    }
  }

  private doMelee(p: PlayerState, w: WeaponDef, viewTime: number) {
    p.invulnUntil = Math.min(p.invulnUntil, this.time);
    const targets = this.targetsAt(viewTime, p);
    let best: PlayerState | null = null;
    let bestD = Infinity;
    for (const tgt of targets) {
      const dx = tgt.x - p.x;
      const dy = tgt.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > w.meleeRange + PLAYER_RADIUS) continue;
      const a = Math.atan2(dy, dx);
      if (Math.abs(angleDiff(p.aim, a)) > w.meleeArc / 2 && d > PLAYER_RADIUS * 1.6) continue;
      if (!this.collision.lineOfSight(p.x, p.y, tgt.x, tgt.y)) continue;
      if (d < bestD) {
        bestD = d;
        best = tgt.p;
      }
    }
    this.events.push({ t: 'melee', shooter: p.slot, angle: p.aim, hit: best ? best.slot : -1 });
    if (best) this.applyDamage(best, p, w.damage, w.id);
  }

  applyDamage(victim: PlayerState, attacker: PlayerState | null, amount: number, weapon: WeaponId): void {
    if (!victim.alive || amount <= 0) return;
    if (this.time < victim.invulnUntil) return;
    if (this.phase !== 'active') return;
    victim.hp = Math.max(0, victim.hp - amount);
    victim.lastHitAt = this.time;
    if (attacker) {
      victim.lastDamagedBy = attacker.id;
      if (attacker !== victim) {
        attacker.damageDealt += amount;
        const rec = victim.recentDamage.find((r) => r.id === attacker.id);
        if (rec) {
          rec.amount += amount;
          rec.at = this.time;
        } else victim.recentDamage.push({ id: attacker.id, at: this.time, amount });
      }
    }
    this.events.push({ t: 'damage', victim: victim.slot, attacker: attacker ? attacker.slot : -1, amount, hp: victim.hp, weapon });
    if (victim.hp <= 0) this.kill(victim, attacker, weapon);
  }

  private kill(victim: PlayerState, killer: PlayerState | null, weapon: WeaponId) {
    victim.alive = false;
    victim.deaths++;
    victim.streak = 0;
    victim.diedAt = this.time;
    victim.respawnAt = this.time + this.config.respawnDelayMs;
    victim.vx = 0;
    victim.vy = 0;
    victim.reloadWeapon = null;
    if (victim.heavy) this.dropHeavy(victim);
    const scorers: PlayerState[] = [];
    if (killer && killer !== victim) {
      killer.kills++;
      killer.score += SCORING.killPoints;
      killer.streak++;
      killer.bestStreak = Math.max(killer.bestStreak, killer.streak);
      killer.lastKillAt = this.time;
      scorers.push(killer);
    }
    // assists: recent, meaningful damage by anyone other than the killer
    const assists: number[] = [];
    for (const rec of victim.recentDamage) {
      if (rec.id === killer?.id || rec.id === victim.id) continue;
      if (this.time - rec.at > SCORING.assistWindowMs || rec.amount < SCORING.assistMinDamage) continue;
      const helper = this.players.get(rec.id);
      if (!helper) continue;
      helper.assists++;
      helper.score += SCORING.assistPoints;
      assists.push(helper.slot);
      scorers.push(helper);
    }
    victim.recentDamage = [];
    this.events.push({ t: 'kill', killer: killer ? killer.slot : -1, victim: victim.slot, weapon, assists });
    if (scorers.some((p) => p.score >= this.config.scoreLimit)) this.finish('score');
  }

  // ── Pickups ─────────────────────────────────────────────────────────────
  private dropHeavy(p: PlayerState) {
    if (!p.heavy) return;
    const total = p.heavyMag + p.heavyReserve;
    if (total > 0) {
      this.pickups.push({
        id: this.nextPickupId++,
        kind: 'weapon',
        weapon: p.heavy,
        x: p.x,
        y: p.y,
        active: true,
        dropped: true,
        mag: p.heavyMag,
        reserve: p.heavyReserve,
        respawnAt: 0,
        expiresAt: this.time + DROPPED_WEAPON_TTL_MS,
        spawnIndex: -1,
        supply: false,
      });
      this.events.push({ t: 'drop', slot: p.slot, weapon: p.heavy });
    }
    p.heavy = null;
    p.heavyMag = 0;
    p.heavyReserve = 0;
    if (isHeavy(p.weapon)) p.weapon = p.sidearm;
  }

  private checkPickups(p: PlayerState, interact: boolean) {
    for (const pk of this.pickups) {
      if (!pk.active) continue;
      const dx = pk.x - p.x;
      const dy = pk.y - p.y;
      if (dx * dx + dy * dy > PICKUP_RADIUS * PICKUP_RADIUS) continue;
      if (pk.kind === 'medkit' || !pk.weapon) {
        if (p.hp >= MAX_HP) continue;
        const amount = Math.min(MEDKIT_HEAL, MAX_HP - p.hp);
        p.hp += amount;
        this.consumePickup(pk);
        this.events.push({ t: 'heal', slot: p.slot, amount, x: pk.x, y: pk.y });
        return;
      }
      const def = WEAPONS[pk.weapon];
      if (!p.heavy) {
        p.heavy = pk.weapon;
        p.heavyMag = pk.mag;
        p.heavyReserve = pk.reserve;
        setWeapon(p, pk.weapon);
        this.consumePickup(pk);
        this.events.push({ t: 'pickup', slot: p.slot, weapon: pk.weapon, ammoOnly: false });
        return;
      }
      if (p.heavy === pk.weapon && p.heavyReserve < def.reserveMax) {
        p.heavyReserve = Math.min(def.reserveMax, p.heavyReserve + pk.mag + pk.reserve);
        this.consumePickup(pk);
        this.events.push({ t: 'pickup', slot: p.slot, weapon: pk.weapon, ammoOnly: true });
        return;
      }
      if (interact && p.heavy !== pk.weapon) {
        const old = { weapon: p.heavy, mag: p.heavyMag, reserve: p.heavyReserve };
        p.heavy = pk.weapon;
        p.heavyMag = pk.mag;
        p.heavyReserve = pk.reserve;
        setWeapon(p, pk.weapon);
        this.consumePickup(pk);
        this.pickups.push({
          id: this.nextPickupId++,
          kind: 'weapon',
          weapon: old.weapon,
          x: p.x,
          y: p.y,
          active: true,
          dropped: true,
          mag: old.mag,
          reserve: old.reserve,
          respawnAt: 0,
          expiresAt: this.time + DROPPED_WEAPON_TTL_MS,
          spawnIndex: -1,
          supply: false,
        });
        this.events.push({ t: 'pickup', slot: p.slot, weapon: pk.weapon, ammoOnly: false });
        return;
      }
    }
  }

  private consumePickup(pk: PickupState) {
    pk.active = false;
    if (!pk.dropped) {
      const spec = pk.kind === 'medkit' ? this.map.medkits[pk.spawnIndex] : this.map.pickups[pk.spawnIndex];
      pk.respawnAt = this.time + (spec ? spec.respawnMs : 20_000);
    }
  }

  // ── Tick ────────────────────────────────────────────────────────────────
  /** Advances world time by one tick: timers, respawns, pickups, phases, lag-compensation history. */
  update(): void {
    this.time += TICK_MS;
    this.tick++;
    switch (this.phase) {
      case 'ready':
        if (this.time >= this.phaseEndsAt) this.startCountdown();
        break;
      case 'countdown':
        if (this.time >= this.phaseEndsAt) this.startActive();
        break;
      case 'active':
        if (this.time >= this.matchEndsAt) this.finish('time');
        break;
      default:
        break;
    }
    if (this.phase === 'active') {
      for (const p of this.players.values()) {
        if (!p.alive && p.spawned && this.time >= p.respawnAt && p.connected) this.spawnPlayer(p, false);
      }
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const pk = this.pickups[i]!;
        if (pk.dropped) {
          if (!pk.active || this.time >= pk.expiresAt) this.pickups.splice(i, 1);
        } else if (!pk.active && this.time >= pk.respawnAt) {
          pk.active = true;
          if (pk.weapon) {
            pk.mag = WEAPONS[pk.weapon].magazine;
            pk.reserve = WEAPONS[pk.weapon].reserveOnPickup;
          }
        }
      }
      this.stepProjectiles();
      if (this.nextSupplyAt > 0 && this.time >= this.nextSupplyAt) {
        this.nextSupplyAt = this.time + this.config.supplyIntervalMs;
        this.dropSupply();
      }
    }
    this.recordHistory();
  }

  /**
   * «Дефицит завезли»: a crate with a full heavy weapon appears at a free supply point away from
   * players (deterministic: world RNG). Unclaimed crates expire after `supplyTtlMs`.
   */
  dropSupply(): PickupState | null {
    const points = this.map.supplyPoints;
    if (points.length === 0) return null;
    const free = points.filter((pt) => {
      for (const pk of this.pickups) if (pk.active && Math.hypot(pk.x - pt.x, pk.y - pt.y) < 48) return false;
      for (const p of this.players.values()) if (p.alive && Math.hypot(p.x - pt.x, p.y - pt.y) < 110) return false;
      return true;
    });
    if (free.length === 0) return null;
    const pt = free[Math.floor(this.rng() * free.length)]!;
    // «дефицит»: mostly strong shop weapons — a free taste of what the shop sells
    const weapon = SUPPLY_POOL[Math.floor(this.rng() * SUPPLY_POOL.length)]!;
    const def = WEAPONS[weapon];
    const crate: PickupState = {
      id: this.nextPickupId++,
      kind: 'weapon',
      weapon,
      x: pt.x,
      y: pt.y,
      active: true,
      dropped: true,
      mag: def.magazine,
      reserve: def.reserveMax,
      respawnAt: 0,
      expiresAt: this.time + this.config.supplyTtlMs,
      spawnIndex: -1,
      supply: true,
    };
    this.pickups.push(crate);
    this.events.push({ t: 'supply', x: pt.x, y: pt.y, weapon });
    return crate;
  }

  private recordHistory() {
    if (!this.lagCompensation) return;
    const data = new Float32Array(MAX_SLOTS * 3);
    for (const p of this.players.values()) {
      data[p.slot * 3] = p.x;
      data[p.slot * 3 + 1] = p.y;
      data[p.slot * 3 + 2] = p.alive ? 1 : 0;
    }
    this.history.push({ time: this.time, data });
    const cutoff = this.time - HISTORY_MS;
    while (this.history.length > 0 && this.history[0]!.time < cutoff) this.history.shift();
  }

  /** Interpolated positions of all slots at `t` (clamped to the rewind window). */
  sampleHistory(t: number): Float32Array | null {
    if (this.history.length === 0) return null;
    const target = Math.min(this.time, Math.max(this.time - MAX_REWIND_MS, t));
    if (target >= this.time - 0.5) return null; // use live positions
    let i = this.history.length - 1;
    while (i > 0 && this.history[i]!.time > target) i--;
    const a = this.history[i]!;
    const b = this.history[Math.min(i + 1, this.history.length - 1)]!;
    if (a === b || b.time === a.time) return a.data;
    const f = (target - a.time) / (b.time - a.time);
    const out = new Float32Array(a.data.length);
    for (let k = 0; k < out.length; k += 3) {
      const aliveA = a.data[k + 2]!;
      const aliveB = b.data[k + 2]!;
      if (aliveA > 0.5 && aliveB > 0.5) {
        out[k] = a.data[k]! + (b.data[k]! - a.data[k]!) * f;
        out[k + 1] = a.data[k + 1]! + (b.data[k + 1]! - a.data[k + 1]!) * f;
        out[k + 2] = 1;
      } else {
        out[k] = b.data[k]!;
        out[k + 1] = b.data[k + 1]!;
        out[k + 2] = 0;
      }
    }
    return out;
  }

  drainEvents(): WorldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  standings(): Standing[] {
    const list = [...this.players.values()].sort(
      (a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths || b.damageDealt - a.damageDealt || a.joinedAt - b.joinedAt,
    );
    const places = rankPlaces(list);
    return list.map((p, i) => ({
      id: p.id,
      slot: p.slot,
      name: p.name,
      character: p.character,
      isBot: p.isBot,
      kills: p.kills,
      assists: p.assists,
      deaths: p.deaths,
      score: p.score,
      damageDealt: p.damageDealt,
      bestStreak: p.bestStreak,
      place: places[i]!,
    }));
  }
}
