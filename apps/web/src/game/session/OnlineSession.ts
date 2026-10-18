/**
 * Networked session: client-side prediction + reconciliation for the local player, snapshot
 * interpolation for everyone else, server-authoritative everything. Events about other players are
 * released in sync with the interpolated timeline; events about the local player are immediate.
 */
import {
  createPlayerState,
  stepMovement,
  stepWeapons,
  pelletAngles,
  getCollision,
  getMap,
  TICK_MS,
  PICKUP_RADIUS,
  lerpAngle,
  dequantizeAngle,
  weaponAmmo,
  weaponFor,
} from '@blatkom/shared';
import type { CollisionWorld, GameEvent, InputFrame, MapId, MatchConfig, PlayerState, RosterEntry, Snapshot, NetPlayer, Standing, PersonalResult, PelletResult, MatchPhase } from '@blatkom/shared';
import type { GameSession, HudState, RenderPickup, RenderPlayer, ResultsData, SessionEvent } from './types.js';
import type { GameConnection } from '../../net/GameConnection.js';

const INTERP_DELAY = 100;
const MAX_EXTRAPOLATE = 120;

interface TimedEvent {
  at: number;
  e: SessionEvent;
}

export class OnlineSession implements GameSession {
  readonly mode = 'online' as const;
  readonly mapId: MapId;
  private readonly collision: CollisionWorld;
  private me: PlayerState | null = null;
  private pending: InputFrame[] = [];
  private buttonsBySeq = new Map<number, number>();
  private snaps: Array<{ s: Snapshot; arrived: number }> = [];
  private offsets: Array<{ at: number; off: number }> = [];
  private offset = 0;
  private renderTime = 0;
  private events: SessionEvent[] = [];
  private delayed: TimedEvent[] = [];
  private roster = new Map<number, RosterEntry>();
  private renderOffX = 0;
  private renderOffY = 0;
  private resultsData: ResultsData | null = null;
  private personal: PersonalResult | null = null;
  private killedBy: string | null = null;
  private interpolated = new Map<number, RenderPlayer>();
  private readonly silent = { shot: () => {}, melee: () => {}, event: () => {} };
  status: HudState['connection'] = 'online';

  constructor(
    private readonly conn: GameConnection,
    mapId: MapId,
    private slot: number,
    private readonly playerId: string,
    readonly config: MatchConfig,
    roster: RosterEntry[],
  ) {
    this.mapId = mapId;
    this.collision = getCollision(mapId);
    this.setRoster(roster);
    void getMap(mapId);
  }

  setRoster(entries: RosterEntry[]): void {
    this.roster.clear();
    for (const r of entries) if (r.slot >= 0) this.roster.set(r.slot, r);
    const mine = entries.find((r) => r.id === this.playerId);
    if (mine && mine.slot >= 0) this.slot = mine.slot;
  }

  localSlot(): number {
    return this.slot;
  }

  // ── network input ───────────────────────────────────────────────────────
  onSnapshot(s: Snapshot, arrived: number): void {
    this.snaps.push({ s, arrived });
    if (this.snaps.length > 40) this.snaps.shift();
    // clock sync: max(server - local) over a sliding window approximates the least-delayed packet
    this.offsets.push({ at: arrived, off: s.serverTime - arrived });
    while (this.offsets.length && arrived - this.offsets[0]!.at > 3000) this.offsets.shift();
    const best = Math.max(...this.offsets.map((o) => o.off));
    this.offset = this.offset === 0 ? best : this.offset + (best - this.offset) * 0.1;
    const np = s.players.find((p) => p.slot === this.slot);
    if (np) this.reconcile(np);
    for (const shot of s.shots) {
      const own = shot.shooter === this.slot;
      const e: SessionEvent = { t: 'shot', shooter: shot.shooter, weapon: shot.weapon, ox: shot.ox, oy: shot.oy, aim: shot.pellets[0]?.angle ?? 0, pellets: shot.pellets, predicted: false };
      if (own) this.events.push(e);
      else this.delayed.push({ at: s.serverTime, e });
    }
    for (const m of s.melees) {
      if (m.shooter === this.slot) continue;
      this.delayed.push({ at: s.serverTime, e: { t: 'melee', shooter: m.shooter, angle: m.angle, hit: m.hit, predicted: false } });
    }
  }

  onEvents(tick: number, list: GameEvent[]): void {
    const at = tick * TICK_MS;
    for (const e of list) {
      const involvesMe =
        (e.t === 'damage' && (e.victim === this.slot || e.attacker === this.slot)) ||
        (e.t === 'kill' && (e.victim === this.slot || e.killer === this.slot)) ||
        ((e.t === 'respawn' || e.t === 'pickup' || e.t === 'drop' || e.t === 'heal') && e.slot === this.slot) ||
        ((e.t === 'rocket' || e.t === 'boom') && e.shooter === this.slot) ||
        e.t === 'phase' ||
        e.t === 'supply' ||
        e.t === 'matchEnd' ||
        (e.t === 'kill' && e.assists.includes(this.slot));
      if ((e.t === 'reload' || e.t === 'dry') && e.slot === this.slot) continue; // predicted locally
      if (e.t === 'kill' && e.victim === this.slot) this.killedBy = this.roster.get(e.killer)?.name ?? null;
      if (e.t === 'respawn' && e.slot === this.slot) {
        this.killedBy = null;
        this.renderOffX = this.renderOffY = 0;
      }
      if (involvesMe) {
        // own rockets are shown on the live timeline: start them where they already are
        if (e.t === 'rocket') this.events.push({ ...e, age: Math.max(0, Math.min(400, this.renderTime + INTERP_DELAY - at)) });
        else this.events.push(e as SessionEvent);
      } else this.delayed.push({ at, e: e as SessionEvent });
    }
  }

  setResults(r: { matchId: string; reason: 'time' | 'score' | 'aborted'; durationMs: number; standings: Standing[]; mapId: MapId }): void {
    this.resultsData = { ...r, personal: this.personal };
  }

  setPersonal(p: PersonalResult): void {
    this.personal = p;
    if (this.resultsData) this.resultsData.personal = p;
  }

  private latest(): Snapshot | null {
    return this.snaps.length ? this.snaps[this.snaps.length - 1]!.s : null;
  }

  private reconcile(np: NetPlayer) {
    const prevX = this.me ? this.me.x + this.renderOffX : np.x;
    const prevY = this.me ? this.me.y + this.renderOffY : np.y;
    if (!this.me) {
      const r = this.roster.get(this.slot);
      this.me = createPlayerState(this.playerId, this.slot, r?.name ?? '', r?.character ?? 'petya', false, 0, 0);
    }
    const me = this.me;
    const r = this.roster.get(this.slot);
    if (r) {
      me.name = r.name;
      me.character = r.character;
    }
    me.x = np.x;
    me.y = np.y;
    me.vx = np.vx;
    me.vy = np.vy;
    me.hp = np.hp;
    me.alive = np.alive;
    me.weapon = np.weapon;
    me.sidearm = np.sidearm;
    me.melee = np.melee;
    me.sideMag = np.sideMag;
    if (r?.mods) me.mods = r.mods;
    me.heavy = np.heavy;
    me.heavyMag = np.heavyMag;
    me.heavyReserve = np.heavyReserve;
    me.kills = np.kills;
    me.assists = np.assists;
    me.deaths = np.deaths;
    me.score = np.score;
    me.walking = np.walking;
    me.connected = np.connected;
    me.lastSeq = np.ack;
    me.clock = np.ack * TICK_MS;
    me.reloadWeapon = np.reloading ? np.weapon : null;
    me.reloadUntil = me.clock + np.reloadRemaining;
    me.nextFireAt = me.clock + np.cooldownRemaining;
    me.spreadHeat = np.spreadHeat;
    // shot counter travels as 16 bits: rebuild the high bits from the local counter
    const high = me.shotCounter & ~0xffff;
    let sc = high | np.shotCounter;
    if (sc < me.shotCounter - 0x8000) sc += 0x10000;
    me.shotCounter = sc;
    me.invulnUntil = np.invulnerable ? Number.MAX_SAFE_INTEGER : 0;
    me.respawnAt = np.respawnIn;
    me.lastButtons = this.buttonsBySeq.get(np.ack) ?? 0;
    this.pending = this.pending.filter((f) => f.seq > np.ack);
    for (const seq of this.buttonsBySeq.keys()) if (seq < np.ack - 120) this.buttonsBySeq.delete(seq);
    if (me.alive) for (const f of this.pending) this.predict(f, false);
    const ex = prevX - me.x;
    const ey = prevY - me.y;
    if (Math.abs(ex) + Math.abs(ey) < 48 && me.alive) {
      this.renderOffX = ex;
      this.renderOffY = ey;
    } else {
      this.renderOffX = 0;
      this.renderOffY = 0;
    }
  }

  private predict(f: InputFrame, visual: boolean) {
    const me = this.me!;
    me.clock += TICK_MS;
    const pressed = f.buttons & ~me.lastButtons;
    me.lastButtons = f.buttons;
    me.aim = dequantizeAngle(f.aim);
    const phase = this.latest()?.phase;
    if (!me.alive || phase !== 'active') return;
    stepMovement(me, f, this.collision, []);
    stepWeapons(
      me,
      f,
      pressed,
      visual
        ? {
            shot: (p, w, spread) => {
              // rockets are drawn when the server launches them; prediction shows flash and sound only
              const pellets: PelletResult[] = w.kind === 'projectile' ? [] : pelletAngles(p, w, spread).map((a) => {
                const hit = this.collision.raycast(p.x, p.y, Math.cos(a), Math.sin(a), w.range, 'shot');
                return { angle: a, dist: hit ? hit.t : w.range, hit: -1, kind: hit ? 1 : 0 };
              });
              this.events.push({ t: 'shot', shooter: p.slot, weapon: w.id, ox: p.x, oy: p.y, aim: p.aim, pellets, predicted: true });
            },
            melee: (p) => this.events.push({ t: 'melee', shooter: p.slot, angle: p.aim, hit: -1, predicted: true }),
            event: (e) => this.events.push(e as SessionEvent),
          }
        : this.silent,
    );
  }

  // ── GameSession ─────────────────────────────────────────────────────────
  step(input: InputFrame | null): void {
    if (!input) return;
    this.buttonsBySeq.set(input.seq, input.buttons);
    if (this.me) {
      this.pending.push(input);
      if (this.pending.length > 180) this.pending.shift();
      this.predict(input, true);
    }
    this.conn.queueInput(input);
  }

  frame(now: number): void {
    this.renderTime = now + this.offset - INTERP_DELAY;
    const k = 0.82;
    this.renderOffX *= k;
    this.renderOffY *= k;
    if (Math.abs(this.renderOffX) < 0.05) this.renderOffX = 0;
    if (Math.abs(this.renderOffY) < 0.05) this.renderOffY = 0;
    this.conn.flushInputs();
    // release delayed events whose time has been reached on the interpolated timeline
    if (this.delayed.length) {
      const keep: TimedEvent[] = [];
      for (const d of this.delayed) {
        if (d.at <= this.renderTime || d.at < this.renderTime - 1000) this.events.push(d.e);
        else keep.push(d);
      }
      this.delayed = keep.length > 400 ? keep.slice(-400) : keep;
    }
    this.interpolate();
  }

  private interpolate() {
    this.interpolated.clear();
    const T = this.renderTime;
    const n = this.snaps.length;
    if (n === 0) return;
    let i = n - 1;
    while (i > 0 && this.snaps[i]!.s.serverTime > T) i--;
    const a = this.snaps[i]!.s;
    const b = this.snaps[Math.min(i + 1, n - 1)]!.s;
    const span = b.serverTime - a.serverTime;
    let t = span > 0 ? (T - a.serverTime) / span : 0;
    let extrapolate = 0;
    if (a === b) {
      extrapolate = Math.min(MAX_EXTRAPOLATE, Math.max(0, T - a.serverTime)) / 1000;
      t = 0;
    }
    t = Math.max(0, Math.min(1, t));
    for (const pb of b.players) {
      if (pb.slot === this.slot) continue;
      const pa = a.players.find((q) => q.slot === pb.slot) ?? pb;
      const r = this.roster.get(pb.slot);
      const teleport = !pa.alive || Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y) > 80;
      const src = t >= 0.5 ? pb : pa;
      const x = teleport ? pb.x : pa.x + (pb.x - pa.x) * t + pb.vx * extrapolate;
      const y = teleport ? pb.y : pa.y + (pb.y - pa.y) * t + pb.vy * extrapolate;
      this.interpolated.set(pb.slot, {
        slot: pb.slot,
        id: r?.id ?? String(pb.slot),
        name: r?.name ?? '???',
        character: r?.character ?? 'petya',
        isLocal: false,
        isBot: r?.isBot ?? false,
        x,
        y,
        vx: pa.vx + (pb.vx - pa.vx) * t,
        vy: pa.vy + (pb.vy - pa.vy) * t,
        aim: lerpAngle(pa.aim, pb.aim, t),
        hp: src.hp,
        alive: src.alive,
        weapon: src.weapon,
        reloading: src.reloading,
        invulnerable: src.invulnerable,
        walking: src.walking,
        connected: src.connected,
        kills: pb.kills,
        assists: pb.assists,
        deaths: pb.deaths,
        score: pb.score,
        level: r?.level ?? null,
      });
    }
  }

  players(): RenderPlayer[] {
    const out = [...this.interpolated.values()];
    const me = this.me;
    if (me) {
      const r = this.roster.get(this.slot);
      out.push({
        slot: this.slot,
        id: this.playerId,
        name: r?.name ?? me.name,
        character: r?.character ?? me.character,
        isLocal: true,
        isBot: false,
        x: me.x + this.renderOffX,
        y: me.y + this.renderOffY,
        vx: me.vx,
        vy: me.vy,
        aim: me.aim,
        hp: me.hp,
        alive: me.alive,
        weapon: me.weapon,
        reloading: me.reloadWeapon !== null,
        invulnerable: me.invulnUntil > 0,
        walking: me.walking,
        connected: true,
        kills: me.kills,
        assists: me.assists,
        deaths: me.deaths,
        score: me.score,
        level: r?.level ?? null,
      });
    }
    return out;
  }

  pickups(): RenderPickup[] {
    const s = this.latest();
    return s ? s.pickups.map((p) => ({ ...p })) : [];
  }

  drainEvents(): SessionEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  phase(): MatchPhase {
    return this.latest()?.phase ?? 'countdown';
  }

  hud(): HudState {
    const s = this.latest();
    const me = this.me;
    const phase = s?.phase ?? 'countdown';
    let prompt: HudState['pickupPrompt'] = null;
    if (me && me.alive && me.heavy && s) {
      for (const pk of s.pickups) {
        if (!pk.active || !pk.weapon || pk.weapon === me.heavy) continue;
        if ((pk.x - me.x) ** 2 + (pk.y - me.y) ** 2 < PICKUP_RADIUS * PICKUP_RADIUS) prompt = pk.weapon;
      }
    }
    const elapsed = s ? Math.max(0, this.renderTime + INTERP_DELAY - s.serverTime) : 0;
    const remaining = s ? Math.max(0, s.phaseRemaining - elapsed) : 0;
    const weapon = me?.weapon ?? 'pistol';
    const ammo = me ? weaponAmmo(me, weapon) : { mag: 0, reserve: 0 };
    return {
      hp: me?.hp ?? 100,
      alive: me?.alive ?? true,
      respawnInMs: me && !me.alive ? Math.max(0, me.respawnAt - elapsed) : 0,
      weapon,
      sidearm: me?.sidearm ?? 'pistol',
      melee: me?.melee ?? 'montirovka',
      heavy: me?.heavy ?? null,
      mag: ammo.mag,
      reserve: ammo.reserve,
      reloading: !!me?.reloadWeapon,
      reloadProgress: me?.reloadWeapon ? Math.max(0, Math.min(1, 1 - (me.reloadUntil - me.clock) / weaponFor(me, me.reloadWeapon).reloadMs)) : 0,
      phase,
      phaseRemainingMs: phase === 'active' ? 0 : remaining,
      timeLeftMs: phase === 'active' ? remaining : this.config.durationMs,
      scoreLimit: this.config.scoreLimit,
      ping: this.conn.rtt !== null ? Math.round(this.conn.rtt) : null,
      connection: this.status,
      pickupPrompt: prompt,
      killedBy: this.killedBy,
    };
  }

  standings(): Standing[] {
    const s = this.latest();
    if (!s) return [];
    return s.players
      .map((p) => ({ p, r: this.roster.get(p.slot) }))
      .sort((x, y) => y.p.score - x.p.score || y.p.kills - x.p.kills || x.p.deaths - y.p.deaths)
      .map(({ p, r }, i) => ({ id: r?.id ?? String(p.slot), slot: p.slot, name: r?.name ?? '???', character: r?.character ?? 'petya', isBot: false, kills: p.kills, assists: p.assists, deaths: p.deaths, score: p.score, damageDealt: 0, bestStreak: 0, place: i + 1 }));
  }

  results(): ResultsData | null {
    return this.resultsData;
  }

  viewTime(): number {
    return this.renderTime;
  }

  destroy(): void {
    this.events = [];
    this.delayed = [];
  }
}
