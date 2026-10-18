/** Offline practice: the shared World + bots running locally (no server). */
import { World, NavGrid, BotBrain, getMap, getCollision, CHARACTER_IDS, TICK_MS, PICKUP_RADIUS, WEAPONS, DEFAULT_LOADOUT, weaponAmmo } from '@blatkom/shared';
import type { CharacterId, GadgetId, InputFrame, MapId, Standing, BotDifficulty, PlayerState, Loadout, WeaponId } from '@blatkom/shared';
import type { GameSession, HudState, RenderGadget, RenderPickup, RenderPlayer, ResultsData, SessionEvent } from './types.js';
import { toRenderGadget, toRenderPlayer, worldEventToSession, reloadProgress } from './convert.js';

const BOT_NAMES = ['Beardy', 'Comrade_312', 'The Cooperator', 'Petrovich', 'Plumber', 'Quartermaster', 'Praporshchik', 'Kolyan'];

/** Practice bots carry varied gear so the training ground shows what the arsenal holds. */
const BOT_PRIMARIES: WeaponId[] = ['avtomat', 'obrez', 'ksyuha', 'uzi', 'ppsh', 'mp5', 's12', 'm4', 'g36', 'svd', 'm24', 'm249', 'tommy'];
const BOT_SIDEARMS: WeaponId[] = ['pistol', 'pistol', 'tt', 'p92', 'deagle'];
const BOT_MELEE: WeaponId[] = ['montirovka', 'montirovka', 'bita', 'nozh', 'topor'];
const BOT_GADGETS: GadgetId[] = ['f1', 'f1', 'f1', 'molotov', 'flash', 'smoke', 'mine', 'turret'];
export function botLoadout(seed: number): Loadout {
  const pick = <T,>(list: readonly T[], k: number) => list[Math.abs(Math.floor(seed * 7919 + k * 104729)) % list.length]!;
  return { sidearm: pick(BOT_SIDEARMS, 1), melee: pick(BOT_MELEE, 2), primary: pick(BOT_PRIMARIES, 3), gadget: pick(BOT_GADGETS, 4), mods: {} };
}

export interface OfflineOptions {
  mapId: MapId;
  character: CharacterId;
  name: string;
  /** The local player's profile level (nameplate, scoreboard); null/undefined = not shown. */
  level?: number | null;
  bots: number;
  difficulty: BotDifficulty;
  durationMs?: number;
  scoreLimit?: number;
  /** The local player's loadout (owned weapons, modifications, equipment); the free default otherwise. */
  loadout?: Loadout;
}

export class OfflineSession implements GameSession {
  readonly mode = 'offline' as const;
  readonly mapId: MapId;
  readonly world: World;
  private readonly nav: NavGrid;
  private readonly brains: BotBrain[] = [];
  private readonly localId = 'local';
  private events: SessionEvent[] = [];
  private prev = new Map<number, { x: number; y: number; aim: number }>();
  private lastStepAt = performance.now();
  private alpha = 1;
  private resultsData: ResultsData | null = null;
  private killedBy: string | null = null;
  private readonly levels = new Map<string, number>();
  private matchSeq = 0;

  constructor(opts: OfflineOptions) {
    this.mapId = opts.mapId;
    this.world = new World(getMap(opts.mapId), getCollision(opts.mapId), {
      lagCompensation: false,
      config: { readyMs: 0, countdownMs: 3000, durationMs: opts.durationMs ?? 4 * 60_000, scoreLimit: opts.scoreLimit ?? 40, maxPlayers: 8 },
      seed: Math.floor(Math.random() * 1e9),
    });
    this.nav = new NavGrid(this.world.collision);
    this.world.addPlayer(this.localId, opts.name, opts.character, false, opts.loadout ?? DEFAULT_LOADOUT);
    if (opts.level) this.levels.set(this.localId, opts.level);
    this.matchSeq = Math.floor(Math.random() * 1e6);
    const others = CHARACTER_IDS.filter((c) => c !== opts.character);
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < opts.bots; i++) {
      const id = `bot${i}`;
      this.world.addPlayer(id, names[i % names.length]!, others[i % others.length]!, true, botLoadout(i + Math.floor(Math.random() * 1000)));
      this.levels.set(id, 2 + Math.floor(Math.random() * 14)); // practice bots wear plausible levels
      this.brains.push(new BotBrain(id, this.world, this.nav, opts.difficulty, 1000 + i * 77 + Math.floor(Math.random() * 1000)));
    }
    this.world.beginMatch(true);
  }

  localSlot(): number {
    return this.world.players.get(this.localId)?.slot ?? 0;
  }

  step(input: InputFrame | null): void {
    for (const p of this.world.players.values()) this.prev.set(p.slot, { x: p.x, y: p.y, aim: p.aim });
    if (input) this.world.applyInput(this.localId, input);
    for (const b of this.brains) this.world.applyInput(b.id, b.nextInput());
    this.world.update();
    const bySlot = new Map<number, PlayerState>();
    for (const p of this.world.players.values()) bySlot.set(p.slot, p);
    for (const e of this.world.drainEvents()) {
      const se = worldEventToSession(e, bySlot, false);
      if (se) this.events.push(se);
      if (e.t === 'kill' && e.victim === this.localSlot()) this.killedBy = bySlot.get(e.killer)?.name ?? null;
      if (e.t === 'respawn' && e.slot === this.localSlot()) this.killedBy = null;
      if (e.t === 'matchEnd') {
        this.resultsData = {
          // unique per match: the demo profile records each finished practice match exactly once
          matchId: `offline-${Date.now().toString(36)}-${(this.matchSeq++).toString(36)}`,
          reason: e.reason,
          durationMs: this.world.time - this.world.matchStartedAt,
          standings: this.world.standings(),
          mapId: this.mapId,
          personal: null,
        };
      }
    }
    this.lastStepAt = performance.now();
  }

  frame(now: number): void {
    this.alpha = Math.max(0, Math.min(1, (now - this.lastStepAt) / TICK_MS));
  }

  players(): RenderPlayer[] {
    const out: RenderPlayer[] = [];
    for (const p of this.world.players.values()) {
      const r = toRenderPlayer(p, p.id === this.localId, this.world.time);
      r.level = this.levels.get(p.id) ?? null;
      const pr = this.prev.get(p.slot);
      if (pr && p.alive) {
        r.x = pr.x + (p.x - pr.x) * this.alpha;
        r.y = pr.y + (p.y - pr.y) * this.alpha;
      }
      out.push(r);
    }
    return out;
  }

  pickups(): RenderPickup[] {
    return this.world.pickups.map((p) => ({ id: p.id, weapon: p.weapon, medkit: p.kind === 'medkit', x: p.x, y: p.y, active: p.active, dropped: p.dropped, supply: p.supply }));
  }

  gadgets(): RenderGadget[] {
    return this.world.gadgets.map((g) => toRenderGadget(g, this.world.time));
  }

  drainEvents(): SessionEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  hud(): HudState {
    const me = this.world.players.get(this.localId)!;
    const w = this.world;
    let prompt: HudState['pickupPrompt'] = null;
    if (me.alive && me.heavy) {
      for (const pk of w.pickups) {
        if (!pk.active || !pk.weapon || pk.weapon === me.heavy) continue;
        if ((pk.x - me.x) ** 2 + (pk.y - me.y) ** 2 < PICKUP_RADIUS * PICKUP_RADIUS) prompt = pk.weapon;
      }
    }
    return {
      hp: me.hp,
      alive: me.alive,
      respawnInMs: me.alive ? 0 : Math.max(0, me.respawnAt - w.time),
      weapon: me.weapon,
      sidearm: me.sidearm,
      melee: me.melee,
      heavy: me.heavy,
      mag: weaponAmmo(me, me.weapon).mag,
      reserve: weaponAmmo(me, me.weapon).reserve,
      reloading: me.reloadWeapon !== null,
      reloadProgress: reloadProgress(me),
      phase: w.phase,
      phaseRemainingMs: w.phaseEndsAt ? Math.max(0, w.phaseEndsAt - w.time) : 0,
      timeLeftMs: w.matchTimeLeftMs,
      scoreLimit: w.config.scoreLimit,
      ping: null,
      connection: 'offline',
      pickupPrompt: prompt,
      killedBy: this.killedBy,
      gadget: me.gadget,
      gadgetCharges: me.gadgetCharges,
      c4Armed: w.gadgets.some((g) => g.kind === 'c4' && g.ownerId === me.id && w.time >= g.fuseAt),
      flashedMs: Math.max(0, me.flashedUntil - w.time),
    };
  }

  standings(): Standing[] {
    return this.world.standings();
  }

  results(): ResultsData | null {
    return this.resultsData;
  }

  phase() {
    return this.world.phase;
  }

  viewTime(): number {
    return this.world.time;
  }

  /** Loadout of the local player from the next spawn on (changed in the arsenal between matches). */
  setLocalLoadout(loadout: Loadout): void {
    this.world.setLoadout(this.localId, loadout);
  }

  /** Nickname/level of the local player (the profile can change between matches). */
  setLocalIdentity(name: string, level: number | null): void {
    const me = this.world.players.get(this.localId);
    if (me) me.name = name;
    if (level) this.levels.set(this.localId, level);
    else this.levels.delete(this.localId);
  }

  /** Restart the practice match with the same roster. */
  restart(): void {
    this.world.resetToLobby();
    this.resultsData = null;
    this.killedBy = null;
    this.world.beginMatch(true);
  }

  destroy(): void {
    this.events = [];
  }

  static magazineOf(w: keyof typeof WEAPONS) {
    return WEAPONS[w].magazine;
  }
}
