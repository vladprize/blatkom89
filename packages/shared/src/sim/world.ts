/**
 * Authoritative match simulation (free-for-all, team deathmatch, capture the flag, base capture). The same code runs on the server (one World per room) and in
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
import type { MatchConfig, MatchPhase, Team } from '../game-rules/match.js';
import { BASE_RULES, CTF_RULES, DEFAULT_MATCH_CONFIG, SCORING, TEAMS, isTeamMode } from '../game-rules/match.js';
import { rankPlaces } from '../game-rules/progression.js';
import type { ModId, WeaponDef, WeaponId, WeaponMods } from '../game-rules/weapons.js';
import { WEAPONS, applyMods, damageFalloff, isHeavy } from '../game-rules/weapons.js';
import type { ArmsId, GadgetId } from '../game-rules/gadgets.js';
import { FIRE_TICK_MS, GADGETS, MINE_TRIGGER, THROW_BOUNCE, THROW_FRICTION, TURRET } from '../game-rules/gadgets.js';
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
  /** Throw / place / deploy the equipment (slot 4); detonates a placed C4. */
  GADGET: 32,
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
  /** Team matches: 0 = red, 1 = blue; null in free-for-all. */
  team: Team | null;
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
  mods: Partial<Record<WeaponId, ModId[]>>;
  /** Equipment type (slot 4), charges left in this life and the anti-spam cooldown (world time). */
  gadget: GadgetId | null;
  gadgetCharges: number;
  gadgetReadyAt: number;
  /** Blinded by a flashbang until this world time. */
  flashedUntil: number;
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
  /** Capture the flag: flags captured; base capture: bases captured. */
  objectives: number;
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
  | { t: 'shot'; shooter: number; weapon: ArmsId; shotId: number; ox: number; oy: number; pellets: PelletResult[]; turret?: boolean; silenced?: boolean }
  | { t: 'melee'; shooter: number; angle: number; hit: number }
  | { t: 'damage'; victim: number; attacker: number; amount: number; hp: number; weapon: ArmsId }
  | { t: 'kill'; killer: number; victim: number; weapon: ArmsId; assists: number[] }
  | { t: 'respawn'; slot: number; x: number; y: number }
  | { t: 'pickup'; slot: number; weapon: WeaponId; ammoOnly: boolean }
  | { t: 'drop'; slot: number; weapon: WeaponId }
  | { t: 'supply'; x: number; y: number; weapon: WeaponId }
  | { t: 'heal'; slot: number; amount: number; x: number; y: number }
  | { t: 'rocket'; id: number; shooter: number; weapon: WeaponId; x: number; y: number; angle: number; speed: number; range: number }
  | { t: 'boom'; id: number; shooter: number; weapon: ArmsId; x: number; y: number; radius: number }
  /** Equipment thrown, placed or deployed (sound, hand animation). */
  | { t: 'gadget'; id: number; kind: GadgetId; slot: number; x: number; y: number }
  | { t: 'flashbang'; x: number; y: number }
  | { t: 'ignite'; id: number; x: number; y: number; radius: number }
  | { t: 'smoke'; id: number; x: number; y: number; radius: number }
  | { t: 'beep'; id: number; x: number; y: number }
  | { t: 'turretDown'; id: number; x: number; y: number }
  | { t: 'reload'; slot: number; weapon: WeaponId }
  | { t: 'dry'; slot: number }
  | { t: 'phase'; phase: MatchPhase }
  | { t: 'matchEnd'; reason: 'time' | 'score' | 'aborted' }
  /** Capture the flag: `team`'s flag was taken / dropped / sent home / captured by `slot` (-1: by itself). */
  | { t: 'flag'; action: FlagAction; team: Team; slot: number }
  /** Base capture: base `base` went to `team` (from `from`); `slots` captured it. */
  | { t: 'base'; base: number; team: Team; from: Team | null; slots: number[] };

export type FlagAction = 'taken' | 'dropped' | 'returned' | 'captured';
export type FlagStatus = 'home' | 'carried' | 'dropped';

/** Capture the flag: one flag per team. */
export interface FlagState {
  team: Team;
  status: FlagStatus;
  /** Where the flag is: on its stand, with the carrier or where it fell. */
  x: number;
  y: number;
  standX: number;
  standY: number;
  carrierId: string | null;
  carrierSlot: number;
  /** Dropped: when it goes home by itself. */
  returnAt: number;
}

/** Base capture: one per base (A, B, C). */
export interface BaseState {
  index: number;
  x: number;
  y: number;
  owner: Team | null;
  /** The team whose capture bar is filling (or being pushed back); null when the bar is empty. */
  capturer: Team | null;
  /** Capture bar of `capturer`, 0..1. */
  progress: number;
  /** Both teams inside: nothing moves. */
  contested: boolean;
  /** Living players inside: red, blue. */
  inside: [number, number];
}

export interface Standing {
  id: string;
  slot: number;
  name: string;
  character: CharacterId;
  isBot: boolean;
  /** Team matches only. */
  team?: Team | null;
  /** Capture the flag: flags captured; base capture: bases captured (those modes only). */
  objectives?: number;
  kills: number;
  assists: number;
  deaths: number;
  /** Match points: eliminations and assists (SCORING). */
  score: number;
  damageDealt: number;
  bestStreak: number;
  place: number;
}

/** Outcome of a team match: team scores (red, blue) and the winner (null = draw). */
export interface TeamResult {
  scores: [number, number];
  winner: Team | null;
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
  /** The owner's team when fired (team matches: no damage to teammates even if the owner left). */
  ownerTeam: Team | null;
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

/**
 * Equipment in the world: thrown grenades (moving), placed mines/C4 and deploying turrets (armed),
 * burning fire, smoke clouds and working turrets (active).
 */
export interface GadgetState {
  id: number;
  kind: GadgetId;
  ownerId: string;
  ownerSlot: number;
  ownerTeam: Team | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: 'moving' | 'armed' | 'active';
  born: number;
  /** Throwables: detonation / activation time; placed charges and turrets: when they arm. */
  fuseAt: number;
  /** End of a lingering effect or expiry of a placed charge / turret (0 = none yet). */
  endsAt: number;
  hp: number;
  aim: number;
  nextTickAt: number;
  ammo: number;
  shots: number;
  /** Mine: when it was triggered (0 = waiting). */
  triggeredAt: number;
}

interface HistoryFrame {
  time: number;
  data: Float32Array; // per slot: x, y, alive
}

/** Slot numbers 0…MAX_SLOTS-1 (rooms hold up to MatchConfig.maxPlayers ≤ MAX_SLOTS players). */
export const MAX_SLOTS = 12;

/** Weapons a «дефицит» supply crate can contain. */
export const SUPPLY_POOL: readonly WeaponId[] = ['avtomat', 'obrez', 'ksyuha', 's12', 'mp5', 'm4', 'g36', 'svd', 'm249', 'rpg'];

export function createPlayerState(id: string, slot: number, name: string, character: CharacterId, isBot: boolean, now: number, seed: number, team: Team | null = null): PlayerState {
  return {
    id,
    slot,
    name,
    character,
    isBot,
    team,
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
    gadget: null,
    gadgetCharges: 0,
    gadgetReadyAt: 0,
    flashedUntil: 0,
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
    objectives: 0,
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

/** Effective stats of `w` for this player (modifications applied). */
export function weaponFor(p: Pick<PlayerState, 'mods'>, w: WeaponId): WeaponDef {
  const mods = p.mods[w];
  if (!mods || mods.length === 0) return WEAPONS[w];
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
  p.nextFireAt = Math.max(p.nextFireAt, p.clock + weaponFor(p, w).drawMs);
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
  /**
   * Team matches, red (0) and blue (1): eliminations (teams), flags captured (ctf) or points from
   * the bases held (bases).
   */
  readonly teamScore: [number, number] = [0, 0];
  /** Capture the flag: the two flags (empty in other modes). */
  readonly flags: FlagState[] = [];
  /** Base capture: the bases (empty in other modes). */
  readonly bases: BaseState[] = [];
  private nextBaseTickAt = 0;
  readonly players = new Map<string, PlayerState>();
  readonly pickups: PickupState[] = [];
  readonly projectiles: ProjectileState[] = [];
  readonly gadgets: GadgetState[] = [];
  events: WorldEvent[] = [];
  private nextPickupId = 1;
  private nextProjectileId = 1;
  private nextGadgetId = 1;
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
    if (this.config.mode === 'ctf') {
      for (const team of TEAMS) {
        const s = map.flagStands[team] ?? this.fallbackStand(team);
        this.flags.push({ team, status: 'home', x: s.x, y: s.y, standX: s.x, standY: s.y, carrierId: null, carrierSlot: -1, returnAt: 0 });
      }
    } else if (this.config.mode === 'bases') {
      const pts = map.bases.length > 0 ? map.bases : [{ x: map.width / 2, y: map.height / 2 }];
      pts.forEach((b, index) => this.bases.push({ index, x: b.x, y: b.y, owner: null, capturer: null, progress: 0, contested: false, inside: [0, 0] }));
    }
  }

  /** A map without flag stands: the deepest spawn point of the team's half. */
  private fallbackStand(team: Team): { x: number; y: number } {
    const horizontal = this.map.width >= this.map.height;
    const key = (i: number) => (horizontal ? this.map.spawns[i]!.x : this.map.spawns[i]!.y);
    const side = this.teamSpawnIndicesStable(team);
    const i = side.reduce((a, b) => ((team === 0 ? key(b) < key(a) : key(b) > key(a)) ? b : a));
    return { x: this.map.spawns[i]!.x, y: this.map.spawns[i]!.y };
  }

  // ── Roster ──────────────────────────────────────────────────────────────
  freeSlot(): number {
    const used = new Set([...this.players.values()].map((p) => p.slot));
    for (let s = 0; s < MAX_SLOTS; s++) if (!used.has(s)) return s;
    return -1;
  }

  /** Two teams (every mode but free-for-all). */
  get teams(): boolean {
    return isTeamMode(this.config.mode);
  }

  /** Can `a` hurt `b`? Anyone else in free-for-all, only the other team in team matches. */
  hostile(a: { id: string; team: Team | null }, b: { id: string; team: Team | null }): boolean {
    if (a.id === b.id) return false;
    return !this.teams || a.team === null || b.team === null || a.team !== b.team;
  }

  /** Is `q` an enemy of whoever owns this projectile / piece of equipment (owner excluded)? */
  private hostileToOwner(owner: { ownerId: string; ownerTeam: Team | null }, q: PlayerState): boolean {
    if (q.id === owner.ownerId) return false;
    return !this.teams || owner.ownerTeam === null || q.team === null || owner.ownerTeam !== q.team;
  }

  teamSize(team: Team): number {
    let n = 0;
    for (const p of this.players.values()) if (p.team === team) n++;
    return n;
  }

  /** The team a newcomer joins: the smaller one (the trailing one on a tie). */
  smallerTeam(): Team {
    const a = this.teamSize(0);
    const b = this.teamSize(1);
    if (a !== b) return a < b ? 0 : 1;
    return this.teamScore[0] <= this.teamScore[1] ? 0 : 1;
  }

  /** Moves a player to a team (the caller checks when that is allowed). */
  setTeam(id: string, team: Team): void {
    const p = this.players.get(id);
    if (p && this.teams) p.team = team;
  }

  /** Evens the teams out (difference of at most one): the latest arrivals move, bots first. */
  balanceTeams(): void {
    if (!this.teams || this.config.fixedTeams) return;
    for (const p of this.players.values()) if (p.team === null) p.team = this.smallerTeam();
    for (let guard = 0; guard < 16; guard++) {
      const a = this.teamSize(0);
      const b = this.teamSize(1);
      if (Math.abs(a - b) <= 1) return;
      const from: Team = a > b ? 0 : 1;
      const movers = [...this.players.values()].filter((p) => p.team === from).sort((x, y) => Number(y.isBot) - Number(x.isBot) || y.joinedAt - x.joinedAt || y.slot - x.slot);
      movers[0]!.team = from === 0 ? 1 : 0;
    }
  }

  addPlayer(id: string, name: string, character: CharacterId, isBot = false, loadout: Loadout = DEFAULT_LOADOUT, team?: Team): PlayerState {
    const existing = this.players.get(id);
    if (existing) return existing;
    const slot = this.freeSlot();
    if (slot < 0) throw new Error('room full');
    const p = createPlayerState(id, slot, name, character, isBot, this.time, hash32(slot + 1, Math.floor(this.rng() * 0xffffffff)), this.teams ? (team ?? this.smallerTeam()) : null);
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
    p.gadget = l.gadget;
    if (!p.alive) {
      p.weapon = l.primary ?? l.sidearm;
      p.sideMag = weaponFor(p, l.sidearm).magazine;
    }
  }

  removePlayer(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.alive && p.heavy) this.dropHeavy(p);
    const flag = this.flags.find((f) => f.carrierId === id);
    if (flag) this.dropFlag(flag, p);
    this.players.delete(id);
    // placed charges and turrets leave with their owner; fire and smoke burn out on their own
    for (let i = this.gadgets.length - 1; i >= 0; i--) {
      const g = this.gadgets[i]!;
      if (g.ownerId === id && (g.kind === 'mine' || g.kind === 'c4' || g.kind === 'turret')) this.gadgets.splice(i, 1);
    }
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
    this.balanceTeams();
    if (skipReady) this.startCountdown();
    else this.setPhase('ready', this.config.readyMs);
  }

  private startCountdown() {
    this.setPhase('countdown', this.config.countdownMs);
    this.resetPickups();
    this.resetObjectives();
    const order = [...this.players.values()].sort((a, b) => a.slot - b.slot);
    if (this.teams) {
      // each team starts on its own side of the map
      for (const team of [0, 1] as const) {
        const side = this.teamSpawnIndices(team);
        order.filter((p) => p.team === team).forEach((p, i) => this.spawnPlayer(p, true, side[i % side.length]));
      }
      return;
    }
    const spawns = this.shuffledSpawnIndices();
    order.forEach((p, i) => this.spawnPlayer(p, true, spawns[i % spawns.length]));
  }

  private startActive() {
    this.setPhase('active', this.config.durationMs);
    this.matchStartedAt = this.time;
    this.matchEndsAt = this.time + this.config.durationMs;
    this.nextSupplyAt = this.time + this.config.supplyFirstMs;
    this.nextBaseTickAt = this.time + BASE_RULES.tickMs;
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
    this.gadgets.length = 0;
    this.resetPickups();
    this.resetObjectives();
  }

  close(): void {
    this.setPhase('closed', 0);
  }

  private resetScores() {
    this.teamScore[0] = 0;
    this.teamScore[1] = 0;
    for (const p of this.players.values()) {
      p.kills = 0;
      p.assists = 0;
      p.deaths = 0;
      p.score = 0;
      p.damageDealt = 0;
      p.streak = 0;
      p.bestStreak = 0;
      p.lastKillAt = 0;
      p.objectives = 0;
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
    this.gadgets.length = 0;
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

  /**
   * Spawn points of a team's home side: the map is split along its longer axis, red (0) gets the
   * left/top half, blue (1) the right/bottom half (shuffled).
   */
  teamSpawnIndices(team: Team): number[] {
    const horizontal = this.map.width >= this.map.height;
    const key = (i: number) => (horizontal ? this.map.spawns[i]!.x : this.map.spawns[i]!.y);
    const sorted = this.map.spawns.map((_, i) => i).sort((a, b) => key(a) - key(b) || a - b);
    const half = Math.ceil(sorted.length / 2);
    const mine = team === 0 ? sorted.slice(0, half) : sorted.slice(sorted.length - half);
    for (let i = mine.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [mine[i], mine[j]] = [mine[j]!, mine[i]!];
    }
    return mine;
  }

  /**
   * Picks the spawn farthest from living opponents, penalizing spawns they can see. In team
   * matches the home side and nearby teammates are preferred, so the teams keep their fronts; in
   * capture the flag and base capture a team always comes back on its own half.
   */
  chooseSpawn(forId: string): number {
    const me = this.players.get(forId);
    const enemies = [...this.players.values()].filter((p) => p.alive && p.id !== forId && (!me || this.hostile(me, p)));
    const friends = me && this.teams ? [...this.players.values()].filter((p) => p.alive && p.id !== forId && p.team === me.team) : [];
    const home = me && this.teams && me.team !== null ? new Set(this.teamSpawnIndicesStable(me.team)) : null;
    const homeOnly = !!home && (this.config.mode === 'ctf' || this.config.mode === 'bases');
    let best = home && homeOnly ? [...home][0]! : 0;
    let bestScore = -Infinity;
    this.map.spawns.forEach((s, i) => {
      if (homeOnly && !home!.has(i)) return;
      if (this.collision.overlapsCircle(s.x, s.y, PLAYER_RADIUS)) return;
      let minD = 1200;
      let seen = false;
      for (const e of enemies) {
        const d = Math.sqrt((e.x - s.x) ** 2 + (e.y - s.y) ** 2);
        minD = Math.min(minD, d);
        if (d < 700 && this.collision.lineOfSight(e.x, e.y, s.x, s.y)) seen = true;
      }
      let bonus = 0;
      if (home?.has(i)) bonus += 160;
      for (const f of friends) if (Math.hypot(f.x - s.x, f.y - s.y) < 420) bonus += 40;
      const score = minD - (seen ? 400 : 0) + Math.min(bonus, 280) + this.rng() * 60;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }

  /** Home-side spawn indices without consuming the RNG (respawn scoring). */
  private teamSpawnIndicesStable(team: Team): number[] {
    const horizontal = this.map.width >= this.map.height;
    const key = (i: number) => (horizontal ? this.map.spawns[i]!.x : this.map.spawns[i]!.y);
    const sorted = this.map.spawns.map((_, i) => i).sort((a, b) => key(a) - key(b) || a - b);
    const half = Math.ceil(sorted.length / 2);
    return team === 0 ? sorted.slice(0, half) : sorted.slice(sorted.length - half);
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
    p.gadgetCharges = p.gadget ? GADGETS[p.gadget].charges : 0;
    p.gadgetReadyAt = 0;
    p.flashedUntil = 0;
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
    if (pressed & BTN.GADGET) this.useGadget(p);
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
      // teammates are transparent to their own side's bullets and blades
      if (q === exclude || !q.alive || !this.hostile(exclude, q)) continue;
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
    const turrets = this.gadgets.filter((g) => g.kind === 'turret' && g.ownerId !== p.id && (!this.teams || g.ownerTeam !== p.team));
    const pellets: PelletResult[] = [];
    const dmgByVictim = new Map<PlayerState, number>();
    const dmgByTurret = new Map<GadgetState, number>();
    for (const a of pelletAngles(p, w, spread)) {
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const wallHit = this.collision.raycast(p.x, p.y, dx, dy, w.range, 'shot');
      let maxT = wallHit ? wallHit.t : w.range;
      let victim: PlayerState | null = null;
      let turret: GadgetState | null = null;
      for (const tgt of targets) {
        const t = rayCircle(p.x, p.y, dx, dy, tgt.x, tgt.y, PLAYER_RADIUS);
        if (t !== null && t < maxT) {
          maxT = t;
          victim = tgt.p;
        }
      }
      for (const g of turrets) {
        const t = rayCircle(p.x, p.y, dx, dy, g.x, g.y, TURRET.radius);
        if (t !== null && t < maxT) {
          maxT = t;
          victim = null;
          turret = g;
        }
      }
      if (victim) {
        const dmg = w.damage * damageFalloff(w, maxT);
        dmgByVictim.set(victim, (dmgByVictim.get(victim) ?? 0) + dmg);
        pellets.push({ angle: a, dist: maxT, hit: victim.slot, kind: 2 });
      } else if (turret) {
        dmgByTurret.set(turret, (dmgByTurret.get(turret) ?? 0) + w.damage * damageFalloff(w, maxT));
        pellets.push({ angle: a, dist: maxT, hit: -1, kind: 1 });
      } else {
        pellets.push({ angle: a, dist: maxT, hit: -1, kind: wallHit ? 1 : 0 });
      }
    }
    this.events.push({ t: 'shot', shooter: p.slot, weapon: w.id, shotId: p.shotCounter, ox: p.x, oy: p.y, pellets, ...(w.silenced ? { silenced: true } : {}) });
    for (const [victim, dmg] of dmgByVictim) this.applyDamage(victim, p, Math.round(dmg), w.id);
    for (const [g, dmg] of dmgByTurret) this.damageTurret(g, dmg);
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
      ownerTeam: p.team,
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
        if (q.id !== pr.ownerId && !this.hostileToOwner(pr, q)) continue;
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
    this.blast({ id: pr.id, ownerId: pr.ownerId, ownerSlot: pr.ownerSlot, ownerTeam: pr.ownerTeam, arms: pr.weapon, x, y, radius: pr.radius, splash: pr.splash, selfFactor: pr.selfFactor, direct, directDamage: pr.direct });
  }

  /** An explosion: splash damage with line of sight to players and turrets around (x, y). */
  private blast(b: { id: number; ownerId: string; ownerSlot: number; ownerTeam: Team | null; arms: ArmsId; x: number; y: number; radius: number; splash: number; selfFactor: number; direct?: PlayerState | null; directDamage?: number }) {
    const { x, y, radius } = b;
    this.events.push({ t: 'boom', id: b.id, shooter: b.ownerSlot, weapon: b.arms, x, y, radius });
    const owner = this.players.get(b.ownerId) ?? null;
    for (const q of [...this.players.values()]) {
      if (!q.alive) continue;
      if (q.id !== b.ownerId && !this.hostileToOwner(b, q)) continue;
      const d = Math.hypot(q.x - x, q.y - y);
      if (d > radius + PLAYER_RADIUS) continue;
      if (q !== b.direct && !this.collision.lineOfSight(x, y, q.x, q.y)) continue;
      const k = Math.max(0, Math.min(1, (d - PLAYER_RADIUS * 0.5) / radius));
      let dmg = b.splash * (1 - 0.7 * k) + (q === b.direct ? (b.directDamage ?? 0) : 0);
      if (q.id === b.ownerId) dmg *= b.selfFactor;
      this.applyDamage(q, owner, Math.round(dmg), b.arms);
    }
    for (const g of [...this.gadgets]) {
      if (g.kind !== 'turret') continue;
      if (this.teams && g.ownerId !== b.ownerId && g.ownerTeam !== null && g.ownerTeam === b.ownerTeam) continue;
      const d = Math.hypot(g.x - x, g.y - y);
      if (d > radius + TURRET.radius || !this.collision.lineOfSight(x, y, g.x, g.y)) continue;
      this.damageTurret(g, b.splash * (1 - 0.7 * Math.max(0, Math.min(1, d / radius))));
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
    if (best) return this.applyDamage(best, p, w.damage, w.id);
    // nobody in reach: an opponent's turret can be smashed
    for (const g of this.gadgets) {
      if (g.kind !== 'turret' || g.ownerId === p.id || (this.teams && g.ownerTeam === p.team)) continue;
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      if (d > w.meleeRange + TURRET.radius) continue;
      if (Math.abs(angleDiff(p.aim, Math.atan2(g.y - p.y, g.x - p.x))) > w.meleeArc / 2 && d > TURRET.radius * 1.6) continue;
      this.damageTurret(g, w.damage);
      return;
    }
  }

  applyDamage(victim: PlayerState, attacker: PlayerState | null, amount: number, weapon: ArmsId): void {
    if (!victim.alive || amount <= 0) return;
    if (this.time < victim.invulnUntil) return;
    if (this.phase !== 'active') return;
    // no friendly fire in team matches (the owner's own explosives still hurt the owner)
    if (attacker && attacker !== victim && !this.hostile(attacker, victim)) return;
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

  private kill(victim: PlayerState, killer: PlayerState | null, weapon: ArmsId) {
    victim.alive = false;
    victim.deaths++;
    victim.streak = 0;
    victim.diedAt = this.time;
    victim.respawnAt = this.time + this.config.respawnDelayMs;
    victim.vx = 0;
    victim.vy = 0;
    victim.reloadWeapon = null;
    if (victim.heavy) this.dropHeavy(victim);
    const carried = this.flags.find((f) => f.carrierId === victim.id);
    if (carried) this.dropFlag(carried, victim);
    const scorers: PlayerState[] = [];
    if (killer && killer !== victim) {
      killer.kills++;
      killer.score += SCORING.killPoints;
      killer.streak++;
      killer.bestStreak = Math.max(killer.bestStreak, killer.streak);
      killer.lastKillAt = this.time;
      scorers.push(killer);
      if (this.config.mode === 'teams' && killer.team !== null) this.teamScore[killer.team]++;
      // stopped the enemy carrier
      if (carried && killer.team === carried.team) killer.score += CTF_RULES.carrierKillPoints;
    }
    // assists: recent, meaningful damage by anyone other than the killer
    const assists: number[] = [];
    for (const rec of victim.recentDamage) {
      if (rec.id === killer?.id || rec.id === victim.id) continue;
      if (this.time - rec.at > SCORING.assistWindowMs || rec.amount < SCORING.assistMinDamage) continue;
      const helper = this.players.get(rec.id);
      if (!helper || !this.hostile(helper, victim)) continue;
      helper.assists++;
      helper.score += SCORING.assistPoints;
      assists.push(helper.slot);
      scorers.push(helper);
    }
    victim.recentDamage = [];
    this.events.push({ t: 'kill', killer: killer ? killer.slot : -1, victim: victim.slot, weapon, assists });
    if (this.config.mode === 'teams') {
      if (this.teamScore[0] >= this.config.teamScoreLimit || this.teamScore[1] >= this.config.teamScoreLimit) this.finish('score');
    } else if (this.config.mode === 'ffa' && scorers.some((p) => p.score >= this.config.scoreLimit)) this.finish('score');
  }

  // ── Objectives: capture the flag, base capture ──────────────────────────
  private resetObjectives() {
    for (const f of this.flags) this.flagHome(f);
    for (const b of this.bases) {
      b.owner = null;
      b.capturer = null;
      b.progress = 0;
      b.contested = false;
      b.inside = [0, 0];
    }
  }

  private flagHome(f: FlagState) {
    f.status = 'home';
    f.x = f.standX;
    f.y = f.standY;
    f.carrierId = null;
    f.carrierSlot = -1;
    f.returnAt = 0;
  }

  private dropFlag(f: FlagState, carrier: PlayerState) {
    f.status = 'dropped';
    f.x = carrier.x;
    f.y = carrier.y;
    f.carrierId = null;
    f.carrierSlot = -1;
    f.returnAt = this.time + CTF_RULES.returnMs;
    this.events.push({ t: 'flag', action: 'dropped', team: f.team, slot: carrier.slot });
  }

  /** The flag `p` carries, if any. */
  flagCarriedBy(id: string): FlagState | undefined {
    return this.flags.find((f) => f.carrierId === id);
  }

  private stepFlags() {
    const r2 = CTF_RULES.touchRadius * CTF_RULES.touchRadius;
    for (const f of this.flags) {
      if (f.status === 'carried') {
        const c = f.carrierId ? this.players.get(f.carrierId) : undefined;
        // left, disconnected or otherwise gone: the flag falls where the carrier was
        if (!c || !c.alive || !c.connected) {
          f.status = 'dropped';
          f.carrierId = null;
          f.carrierSlot = -1;
          f.returnAt = this.time + CTF_RULES.returnMs;
          this.events.push({ t: 'flag', action: 'dropped', team: f.team, slot: c ? c.slot : -1 });
          continue;
        }
        f.x = c.x;
        f.y = c.y;
      } else if (f.status === 'dropped' && this.time >= f.returnAt) {
        this.flagHome(f);
        this.events.push({ t: 'flag', action: 'returned', team: f.team, slot: -1 });
      }
    }
    const order = [...this.players.values()].filter((p) => p.alive && p.team !== null).sort((a, b) => a.slot - b.slot);
    for (const p of order) {
      const team = p.team!;
      for (const f of this.flags) {
        if (f.status === 'carried' || (p.x - f.x) ** 2 + (p.y - f.y) ** 2 > r2) continue;
        if (f.team !== team) {
          // the enemy flag, on its stand or on the ground: take it (spawn protection ends)
          f.status = 'carried';
          f.carrierId = p.id;
          f.carrierSlot = p.slot;
          f.returnAt = 0;
          f.x = p.x;
          f.y = p.y;
          p.score += CTF_RULES.takePoints;
          p.invulnUntil = Math.min(p.invulnUntil, this.time);
          this.events.push({ t: 'flag', action: 'taken', team: f.team, slot: p.slot });
        } else if (f.status === 'dropped') {
          // our own flag on the ground: back to its stand
          this.flagHome(f);
          p.score += CTF_RULES.returnPoints;
          this.events.push({ t: 'flag', action: 'returned', team: f.team, slot: p.slot });
        }
      }
      // a carrier at their own stand, with their own flag at home, scores
      const carried = this.flagCarriedBy(p.id);
      const own = this.flags.find((f) => f.team === team);
      if (carried && own && own.status === 'home' && (p.x - own.standX) ** 2 + (p.y - own.standY) ** 2 <= r2) {
        this.flagHome(carried);
        p.score += CTF_RULES.capturePoints;
        p.objectives++;
        this.teamScore[team]++;
        this.events.push({ t: 'flag', action: 'captured', team: carried.team, slot: p.slot });
        if (this.teamScore[team] >= this.config.captureLimit) {
          this.finish('score');
          return;
        }
      }
    }
  }

  private stepBases() {
    const r2 = BASE_RULES.radius * BASE_RULES.radius;
    const unit = TICK_MS / BASE_RULES.captureMs;
    for (const b of this.bases) {
      const inside: [number, number] = [0, 0];
      for (const p of this.players.values()) {
        if (p.alive && p.team !== null && (p.x - b.x) ** 2 + (p.y - b.y) ** 2 <= r2) inside[p.team]++;
      }
      b.inside = inside;
      b.contested = inside[0] > 0 && inside[1] > 0;
      if (b.contested) continue;
      const team: Team | null = inside[0] > 0 ? 0 : inside[1] > 0 ? 1 : null;
      if (team === null) {
        // nobody inside: an unfinished bar fades
        if (b.capturer !== null) {
          b.progress -= unit * BASE_RULES.decayRate;
          if (b.progress <= 0) {
            b.progress = 0;
            b.capturer = null;
          }
        }
        continue;
      }
      const rate = unit * Math.min(BASE_RULES.maxRate, 1 + (inside[team] - 1) * BASE_RULES.extraPlayerRate);
      if (b.capturer !== null && b.capturer !== team) {
        // the other team's unfinished bar is pushed back first
        b.progress -= rate;
        if (b.progress <= 0) {
          b.progress = 0;
          b.capturer = null;
        }
        continue;
      }
      if (b.owner === team) continue;
      b.capturer = team;
      b.progress += rate;
      if (b.progress >= 1 - 1e-9) {
        const from = b.owner;
        b.owner = team;
        b.capturer = null;
        b.progress = 0;
        const slots: number[] = [];
        for (const p of this.players.values()) {
          if (p.alive && p.team === team && (p.x - b.x) ** 2 + (p.y - b.y) ** 2 <= r2) {
            p.score += BASE_RULES.capturePoints;
            p.objectives++;
            slots.push(p.slot);
          }
        }
        slots.sort((x, y) => x - y);
        this.events.push({ t: 'base', base: b.index, team, from, slots });
      }
    }
    if (this.time >= this.nextBaseTickAt) {
      this.nextBaseTickAt = Math.max(this.nextBaseTickAt + BASE_RULES.tickMs, this.time + 1);
      for (const b of this.bases) if (b.owner !== null) this.teamScore[b.owner]++;
      const limit = this.config.baseScoreLimit;
      if (this.teamScore[0] >= limit || this.teamScore[1] >= limit) this.finish('score');
    }
  }

  // ── Equipment (slot 4) ──────────────────────────────────────────────────
  /** Throw / place / deploy the equipped gadget, or detonate this player's armed C4. */
  private useGadget(p: PlayerState) {
    const armedC4 = this.gadgets.filter((g) => g.kind === 'c4' && g.ownerId === p.id && this.time >= g.fuseAt);
    if (armedC4.length > 0) {
      for (const g of armedC4) this.detonateGadget(g);
      return;
    }
    if (!p.gadget || p.gadgetCharges <= 0 || this.time < p.gadgetReadyAt) return;
    const kind = p.gadget;
    const def = GADGETS[kind];
    const dx = Math.cos(p.aim);
    const dy = Math.sin(p.aim);
    // a turret stands clear of its owner (radius 10 + 9); grenades and charges leave from the hand
    const reach = def.use === 'deploy' ? PLAYER_RADIUS + TURRET.radius + 8 : 12;
    const clearance = def.use === 'deploy' ? TURRET.radius + 2 : 5;
    const wall = this.collision.raycast(p.x, p.y, dx, dy, reach + 4, 'shot');
    const d = wall ? Math.max(0, wall.t - clearance) : reach;
    let x = p.x + dx * d;
    let y = p.y + dy * d;
    if (def.use === 'deploy' && this.collision.overlapsCircle(x, y, TURRET.radius)) {
      x = p.x;
      y = p.y;
    }
    const g: GadgetState = {
      id: this.nextGadgetId,
      kind,
      ownerId: p.id,
      ownerSlot: p.slot,
      ownerTeam: p.team,
      x,
      y,
      vx: def.use === 'throw' ? dx * def.throwSpeed + p.vx * 0.5 : 0,
      vy: def.use === 'throw' ? dy * def.throwSpeed + p.vy * 0.5 : 0,
      phase: def.use === 'throw' ? 'moving' : 'armed',
      born: this.time,
      fuseAt: this.time + def.fuseMs,
      endsAt: def.use === 'throw' ? 0 : this.time + def.fuseMs + def.durationMs,
      hp: def.use === 'deploy' ? TURRET.hp : 0,
      aim: p.aim,
      nextTickAt: 0,
      ammo: def.use === 'deploy' ? TURRET.ammo : 0,
      shots: 0,
      triggeredAt: 0,
    };
    this.nextGadgetId = this.nextGadgetId >= 0xffff ? 1 : this.nextGadgetId + 1;
    // two mines, one C4 and one turret per player at a time: the oldest goes
    const limit = kind === 'mine' ? 2 : def.use === 'throw' ? Infinity : 1;
    if (limit < Infinity) {
      const mine = this.gadgets.filter((o) => o.ownerId === p.id && o.kind === kind);
      while (mine.length >= limit) this.removeGadget(mine.shift()!);
    }
    this.gadgets.push(g);
    p.gadgetCharges--;
    p.gadgetReadyAt = this.time + def.cooldownMs;
    p.invulnUntil = Math.min(p.invulnUntil, this.time);
    this.events.push({ t: 'gadget', id: g.id, kind, slot: p.slot, x, y });
  }

  private removeGadget(g: GadgetState) {
    const i = this.gadgets.indexOf(g);
    if (i >= 0) this.gadgets.splice(i, 1);
  }

  private detonateGadget(g: GadgetState) {
    const def = GADGETS[g.kind];
    this.removeGadget(g);
    this.blast({ id: 0x10000 + g.id, ownerId: g.ownerId, ownerSlot: g.ownerSlot, ownerTeam: g.ownerTeam, arms: g.kind, x: g.x, y: g.y, radius: def.radius, splash: def.damage, selfFactor: def.selfFactor });
  }

  private damageTurret(g: GadgetState, amount: number) {
    if (g.kind !== 'turret' || !this.gadgets.includes(g)) return;
    g.hp -= amount;
    if (g.hp <= 0) {
      this.removeGadget(g);
      this.events.push({ t: 'turretDown', id: g.id, x: g.x, y: g.y });
    }
  }

  /** Is the segment a→b hidden by an active smoke cloud? */
  smokeBlocks(ax: number, ay: number, bx: number, by: number): boolean {
    const r = GADGETS.smoke.radius * 0.85;
    for (const g of this.gadgets) {
      if (g.kind !== 'smoke' || g.phase !== 'active') continue;
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((g.x - ax) * dx + (g.y - ay) * dy) / l2));
      const px = ax + dx * t - g.x;
      const py = ay + dy * t - g.y;
      if (px * px + py * py < r * r) return true;
    }
    return false;
  }

  /** Is the point inside an active smoke cloud? */
  inSmoke(x: number, y: number): boolean {
    const r = GADGETS.smoke.radius * 0.85;
    return this.gadgets.some((g) => g.kind === 'smoke' && g.phase === 'active' && (g.x - x) ** 2 + (g.y - y) ** 2 < r * r);
  }

  /** Slides a thrown item along the floor with friction and wall bounces. Returns true if it hit a wall. */
  private slide(g: GadgetState): boolean {
    const dt = TICK_MS / 1000;
    const sp = Math.hypot(g.vx, g.vy);
    if (sp <= 0) return false;
    const nsp = Math.max(0, sp - THROW_FRICTION * dt);
    let dist = ((sp + nsp) / 2) * dt;
    let dx = g.vx / sp;
    let dy = g.vy / sp;
    let bounced = false;
    for (let k = 0; k < 3 && dist > 0.01; k++) {
      const hit = this.collision.raycast(g.x, g.y, dx, dy, dist + 3, 'shot');
      if (!hit) {
        g.x += dx * dist;
        g.y += dy * dist;
        break;
      }
      const t = Math.max(0, hit.t - 3);
      g.x += dx * t;
      g.y += dy * t;
      dist = (dist - t) * THROW_BOUNCE;
      const dot = dx * hit.nx + dy * hit.ny;
      dx -= 2 * dot * hit.nx;
      dy -= 2 * dot * hit.ny;
      bounced = true;
      if (g.kind === 'molotov') break;
    }
    const out = bounced ? nsp * THROW_BOUNCE : nsp;
    g.vx = out < 6 ? 0 : dx * out;
    g.vy = out < 6 ? 0 : dy * out;
    return bounced;
  }

  private stepGadgets() {
    for (const g of [...this.gadgets]) {
      if (!this.gadgets.includes(g)) continue; // removed by an earlier explosion this tick
      const def = GADGETS[g.kind];
      if (g.phase === 'moving') {
        const hitWall = this.slide(g);
        const stopped = g.vx === 0 && g.vy === 0;
        if (g.kind === 'molotov') {
          if (hitWall || stopped || this.time >= g.fuseAt) this.ignite(g);
        } else if (this.time >= g.fuseAt) {
          if (g.kind === 'f1') this.detonateGadget(g);
          else if (g.kind === 'flash') this.flashbang(g);
          else if (g.kind === 'smoke') {
            g.phase = 'active';
            g.vx = 0;
            g.vy = 0;
            g.endsAt = this.time + def.durationMs;
            this.events.push({ t: 'smoke', id: g.id, x: g.x, y: g.y, radius: def.radius });
          }
        }
        continue;
      }
      switch (g.kind) {
        case 'molotov':
          if (this.time >= g.endsAt) this.removeGadget(g);
          else if (this.time >= g.nextTickAt) {
            g.nextTickAt += FIRE_TICK_MS;
            this.burn(g);
          }
          break;
        case 'smoke':
          if (this.time >= g.endsAt) this.removeGadget(g);
          break;
        case 'mine':
          if (this.time >= g.endsAt) this.removeGadget(g);
          else if (g.triggeredAt > 0) {
            if (this.time >= g.triggeredAt + 250) this.detonateGadget(g);
          } else if (this.time >= g.fuseAt) {
            for (const q of this.players.values()) {
              if (!q.alive || !this.hostileToOwner(g, q)) continue;
              if ((q.x - g.x) ** 2 + (q.y - g.y) ** 2 > (MINE_TRIGGER + PLAYER_RADIUS) ** 2) continue;
              g.triggeredAt = this.time;
              this.events.push({ t: 'beep', id: g.id, x: g.x, y: g.y });
              break;
            }
          }
          break;
        case 'c4':
          if (this.time >= g.endsAt) this.removeGadget(g);
          break;
        case 'turret':
          this.stepTurret(g);
          break;
        default:
          break;
      }
    }
  }

  private ignite(g: GadgetState) {
    const def = GADGETS.molotov;
    g.phase = 'active';
    g.vx = 0;
    g.vy = 0;
    g.endsAt = this.time + def.durationMs;
    g.nextTickAt = this.time;
    this.events.push({ t: 'ignite', id: g.id, x: g.x, y: g.y, radius: def.radius });
  }

  /** One damage tick of a burning molotov. */
  private burn(g: GadgetState) {
    const def = GADGETS.molotov;
    const owner = this.players.get(g.ownerId) ?? null;
    for (const q of [...this.players.values()]) {
      if (!q.alive) continue;
      if (q.id !== g.ownerId && !this.hostileToOwner(g, q)) continue;
      if ((q.x - g.x) ** 2 + (q.y - g.y) ** 2 > def.radius * def.radius) continue;
      if (!this.collision.lineOfSight(g.x, g.y, q.x, q.y)) continue;
      const dmg = q.id === g.ownerId ? def.damage * def.selfFactor : def.damage;
      this.applyDamage(q, owner, Math.max(1, Math.round(dmg)), 'molotov');
    }
    for (const t of [...this.gadgets]) {
      if (t.kind !== 'turret' || (this.teams && t.ownerId !== g.ownerId && t.ownerTeam !== null && t.ownerTeam === g.ownerTeam)) continue;
      if ((t.x - g.x) ** 2 + (t.y - g.y) ** 2 <= def.radius * def.radius) this.damageTurret(t, def.damage);
    }
  }

  /** Flashbang: blinds everyone with line of sight, longer when close and looking at it. */
  private flashbang(g: GadgetState) {
    const def = GADGETS.flash;
    this.removeGadget(g);
    this.events.push({ t: 'flashbang', x: g.x, y: g.y });
    for (const q of this.players.values()) {
      if (!q.alive) continue;
      // teammates know it is coming and look away; the thrower can still blind himself
      if (q.id !== g.ownerId && !this.hostileToOwner(g, q)) continue;
      const d = Math.hypot(q.x - g.x, q.y - g.y);
      if (d > def.radius || !this.collision.lineOfSight(g.x, g.y, q.x, q.y)) continue;
      const look = Math.abs(angleDiff(q.aim, Math.atan2(g.y - q.y, g.x - q.x)));
      const facing = look < Math.PI / 3 ? 1 : look < (Math.PI * 2) / 3 ? 0.6 : 0.3;
      // full strength up close, 60 % at the edge of the radius
      const ms = def.durationMs * facing * (1 - 0.4 * (d / def.radius));
      q.flashedUntil = Math.max(q.flashedUntil, this.time + ms);
    }
  }

  /** Turret: turns to the nearest visible opponent in range and fires short bursts. */
  private stepTurret(g: GadgetState) {
    const def = GADGETS.turret;
    if (this.time >= g.endsAt || g.ammo <= 0) {
      this.removeGadget(g);
      this.events.push({ t: 'turretDown', id: g.id, x: g.x, y: g.y });
      return;
    }
    if (g.phase === 'armed') {
      if (this.time >= g.fuseAt) {
        g.phase = 'active';
        g.nextTickAt = this.time;
      }
      return;
    }
    let target: PlayerState | null = null;
    let bestD = def.radius;
    for (const q of this.players.values()) {
      if (!q.alive || !this.hostileToOwner(g, q) || this.time < q.invulnUntil) continue;
      const d = Math.hypot(q.x - g.x, q.y - g.y);
      if (d > bestD) continue;
      if (!this.collision.lineOfSight(g.x, g.y, q.x, q.y) || this.smokeBlocks(g.x, g.y, q.x, q.y)) continue;
      bestD = d;
      target = q;
    }
    if (!target) return;
    const want = Math.atan2(target.y - g.y, target.x - g.x);
    const maxTurn = TURRET.turnRate * (TICK_MS / 1000);
    g.aim = wrapAngle(g.aim + Math.max(-maxTurn, Math.min(maxTurn, angleDiff(g.aim, want))));
    if (Math.abs(angleDiff(g.aim, want)) > 0.12 || this.time < g.nextTickAt) return;
    g.nextTickAt = this.time + TURRET.fireIntervalMs;
    g.ammo--;
    g.shots++;
    const a = wrapAngle(g.aim + spreadNoise(g.id * 7919 + 13, g.shots, 0) * TURRET.spread);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const range = def.radius + 40;
    const wall = this.collision.raycast(g.x, g.y, dx, dy, range, 'shot');
    let maxT = wall ? wall.t : range;
    let victim: PlayerState | null = null;
    for (const q of this.players.values()) {
      if (!q.alive || !this.hostileToOwner(g, q)) continue;
      const t = rayCircle(g.x, g.y, dx, dy, q.x, q.y, PLAYER_RADIUS);
      if (t !== null && t < maxT) {
        maxT = t;
        victim = q;
      }
    }
    this.events.push({ t: 'shot', shooter: g.ownerSlot, weapon: 'turret', shotId: g.shots & 0xffff, ox: g.x, oy: g.y, pellets: [{ angle: a, dist: maxT, hit: victim ? victim.slot : -1, kind: victim ? 2 : wall ? 1 : 0 }], turret: true });
    if (victim) this.applyDamage(victim, this.players.get(g.ownerId) ?? null, def.damage, 'turret');
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
      this.stepGadgets();
      if (this.phase === 'active' && this.flags.length > 0) this.stepFlags();
      if (this.phase === 'active' && this.bases.length > 0) this.stepBases();
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

  /** Team matches: team scores and the winner (null on a draw). */
  teamResult(): TeamResult {
    const [a, b] = this.teamScore;
    return { scores: [a, b], winner: a === b ? null : a > b ? 0 : 1 };
  }

  /**
   * Final table. Free-for-all: by points with shared places for equal results. Team matches: the
   * winning team first (place 1 for all of its players, 2 for the other team; 1 for everyone on a
   * draw), each team ordered by points.
   */
  standings(): Standing[] {
    const byPerf = (a: PlayerState, b: PlayerState) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths || b.damageDealt - a.damageDealt || a.joinedAt - b.joinedAt;
    const row = (p: PlayerState, place: number): Standing => ({
      id: p.id,
      slot: p.slot,
      name: p.name,
      character: p.character,
      isBot: p.isBot,
      ...(this.teams ? { team: p.team } : {}),
      ...(this.config.mode === 'ctf' || this.config.mode === 'bases' ? { objectives: p.objectives } : {}),
      kills: p.kills,
      assists: p.assists,
      deaths: p.deaths,
      score: p.score,
      damageDealt: p.damageDealt,
      bestStreak: p.bestStreak,
      place,
    });
    if (this.teams) {
      const { winner } = this.teamResult();
      const first: Team = winner ?? 0;
      const order = (p: PlayerState) => (p.team === first ? 0 : 1);
      const list = [...this.players.values()].sort((a, b) => order(a) - order(b) || byPerf(a, b));
      return list.map((p) => row(p, winner === null || p.team === winner ? 1 : 2));
    }
    const list = [...this.players.values()].sort(byPerf);
    const places = rankPlaces(list);
    return list.map((p, i) => row(p, places[i]!));
  }
}
