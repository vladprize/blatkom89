/**
 * One multiplayer room: lobby + authoritative simulation for up to 10 players, every man for himself
 * or two teams (red vs blue, capture the flag, base capture).
 * Clients send inputs; the room runs the shared World at 60 Hz and broadcasts binary snapshots at
 * 30 Hz plus JSON control messages. Results are recorded once through MatchRecorder.
 * Lineups too small for a good match are filled with players the room runs itself (sim/fill.ts):
 * they look and are reported to clients exactly like people (`isBot` never leaves the server).
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  World,
  getMap,
  getCollision,
  encodeSnapshot,
  decodeInputs,
  ClientMessageSchema,
  ProtocolError,
  PROTOCOL_VERSION,
  INPUT_BUCKET_MAX,
  INPUT_QUEUE_MAX,
  MAX_INPUTS_PER_TICK,
  SNAPSHOT_EVERY_TICKS,
  TICK_MS,
  WS_CLOSE,
  DEFAULT_MATCH_CONFIG,
  DEFAULT_LOADOUT,
  FREE_CHARACTERS,
  isMapId,
  isTeamMode,
  rankPlaces,
  NavGrid,
  BotBrain,
  FILL_RULES,
  fillTarget,
  fillPersona,
} from '@blatkom/shared';
import type {
  AvatarId,
  BotDifficulty,
  FillTiming,
  NickLang,
  Team,
  CharacterId,
  ClientMessage,
  GameEvent,
  GameMode,
  InputFrame,
  MapId,
  MatchConfig,
  RosterEntry,
  ServerMessage,
  WorldEvent,
  Standing,
} from '@blatkom/shared';
import type { AuthedUser, PlayerGear, Services } from '../services/contracts.js';
import type { Logger } from '../logging/logger.js';

export interface RoomOptions {
  id: string;
  mapId: MapId;
  isPrivate: boolean;
  hostUserId: string | null;
  config?: Partial<MatchConfig>;
  inviteCode?: string | null;
  /** Public rooms start automatically once enough players are present. */
  autoStart?: boolean;
  /** Free-for-all (default) or teams; the host can switch it in the lobby. */
  mode?: GameMode;
  /** Fill small lineups with players the room runs itself (off unless the server enables it). */
  fillBots?: boolean;
  /** Shorter fill timings (tests). */
  fillTiming?: Partial<FillTiming>;
}

/** A player the room runs itself to fill the lineup (never labelled as such to clients). */
interface FillSeat {
  id: string;
  name: string;
  character: CharacterId;
  level: number;
  avatar: AvatarId | null;
  difficulty: BotDifficulty;
  addedAt: number;
  /** The AI and the world it plays in (a new world — map or mode change — needs a new brain). */
  brain: BotBrain | null;
  brainWorld: World | null;
  /** After a match: wants a rematch (from rematchAt on, like a person pressing the button). */
  rematch: boolean;
  rematchAt: number;
}

/** One change of the filled lineup: someone arrives, leaves, or (lobby) changes sides. */
type FillStep = { kind: 'add'; team: Team | null } | { kind: 'remove'; seat: FillSeat } | { kind: 'move'; seat: FillSeat; team: Team };

const between = (a: number, b: number) => a + Math.random() * Math.max(0, b - a);

/** Navigation grids per map, shared by every room (built once from the static collision). */
const NAV = new Map<MapId, NavGrid>();
function navFor(mapId: MapId, world: World): NavGrid {
  let nav = NAV.get(mapId);
  if (!nav) {
    nav = new NavGrid(world.collision);
    NAV.set(mapId, nav);
  }
  return nav;
}

interface Client {
  user: AuthedUser;
  ws: WebSocket | null;
  character: CharacterId;
  /** Owned characters and the validated spawn loadout (refreshed on 'loadout'). */
  gear: PlayerGear;
  lastGearAt: number;
  ready: boolean;
  rematch: boolean;
  viaInvite: boolean;
  connected: boolean;
  disconnectedAt: number;
  queue: InputFrame[];
  tokens: number;
  lastQueuedSeq: number;
  reconnectToken: string;
  joinedAt: number;
  /** Real time spent in the current match (ms). */
  matchTimeMs: number;
  violations: number;
  msgWindowStart: number;
  msgCount: number;
}

const AUTO_START_DELAY_MS = 4000;
/** Free gear (used when the economy is unavailable). */
export const FREE_GEAR: PlayerGear = Object.freeze({ loadout: DEFAULT_LOADOUT, characters: new Set(FREE_CHARACTERS) });
const SOLO_ABORT_MS = 20_000;
const MAX_MSGS_PER_SEC = 150;

export class MatchRoom {
  readonly id: string;
  readonly isPrivate: boolean;
  readonly createdAt = Date.now();
  /** Match rules; `mode` changes when the host switches between free-for-all and teams. */
  config: MatchConfig;
  mapId: MapId;
  hostId: string | null;
  inviteCode: string | null;
  world: World;
  matchId: string | null = null;
  matchStartedAtWall = 0;
  closed = false;
  private readonly clients = new Map<string, Client>();
  private pendingShots: WorldEvent[] = [];
  private pendingEvents: GameEvent[] = [];
  private emptySince = Date.now();
  /** The time of the latest tick (the room's clock between ticks; the wall clock before the first). */
  private lastNow = 0;
  private autoStartAt = 0;
  private soloSince = 0;
  private resultsSent = false;
  private readonly autoStart: boolean;
  private readonly fillBots: boolean;
  /** Players the room runs itself, by id (they are in the World like everyone else). */
  private readonly seats = new Map<string, FillSeat>();
  private readonly fillTiming: FillTiming;
  /** Quick Match lobby: players start arriving from this time on (0: nobody waiting yet). */
  private fillFrom = 0;
  /** When the next change of the filled lineup happens (0: none scheduled). */
  private nextFillAt = 0;
  private readonly log: Logger;

  constructor(
    opts: RoomOptions,
    private readonly services: Services,
    log: Logger,
  ) {
    this.id = opts.id;
    this.mapId = opts.mapId;
    this.isPrivate = opts.isPrivate;
    this.hostId = opts.hostUserId;
    this.inviteCode = opts.inviteCode ?? null;
    this.autoStart = opts.autoStart ?? !opts.isPrivate;
    this.fillBots = opts.fillBots ?? false;
    this.fillTiming = { ...FILL_RULES, ...opts.fillTiming };
    this.config = { ...DEFAULT_MATCH_CONFIG, ...opts.config, mode: opts.mode ?? opts.config?.mode ?? 'ffa' };
    this.log = log.child({ room: this.id });
    this.world = this.createWorld();
  }

  private createWorld(): World {
    return new World(getMap(this.mapId), getCollision(this.mapId), { config: this.config, lagCompensation: true, seed: Math.floor(Math.random() * 2 ** 31) });
  }

  get phase() {
    return this.world.phase;
  }

  get mode(): GameMode {
    return this.config.mode;
  }

  /** Players occupying a slot (connected or within the reconnect grace window). */
  get occupancy(): number {
    return this.clients.size;
  }

  get connectedCount(): number {
    let n = 0;
    for (const c of this.clients.values()) if (c.connected) n++;
    return n;
  }

  /** Everyone in the lineup as players see it: people plus the players the room filled in. */
  get lineup(): number {
    return Math.min(this.config.maxPlayers, this.clients.size + this.seats.size);
  }

  /** People the host needs to start: one when the room fills the lineup up itself. */
  get minToStart(): number {
    return this.fillBots ? 1 : this.config.minPlayers;
  }

  isJoinable(userId?: string): boolean {
    if (this.closed || this.world.phase === 'closed') return false;
    if (userId && this.clients.has(userId)) return true;
    if (this.clients.size >= this.config.maxPlayers) return false;
    if (this.world.phase === 'finished') return false;
    if ((this.world.phase === 'active' || this.world.phase === 'countdown' || this.world.phase === 'ready') && !this.config.allowJoinInProgress) return false;
    return true;
  }

  hostName(): string | null {
    return this.hostId ? (this.clients.get(this.hostId)?.user.displayName ?? null) : null;
  }

  // ── Connections ─────────────────────────────────────────────────────────
  /** Adds or resumes a player. Returns an error code when the join is refused. */
  join(user: AuthedUser, ws: WebSocket, requested: CharacterId, viaInvite: boolean, gear: PlayerGear = FREE_GEAR): 'ok' | 'resumed' | 'room_full' | 'room_closed' {
    if (this.closed) return 'room_closed';
    // only owned characters can be played online
    const character: CharacterId = gear.characters.has(requested) ? requested : 'petya';
    const existing = this.clients.get(user.userId);
    if (existing) {
      existing.gear = gear;
      this.world.setLoadout(user.userId, gear.loadout);
      if (existing.ws && existing.ws !== ws) {
        try {
          existing.ws.close(WS_CLOSE.REPLACED, 'replaced');
        } catch {
          /* ignore */
        }
      }
      existing.ws = ws;
      existing.connected = true;
      existing.queue = [];
      existing.lastQueuedSeq = 0; // a reloaded client restarts its input sequence
      existing.tokens = INPUT_BUCKET_MAX;
      const p = this.world.players.get(user.userId);
      if (p) {
        p.connected = true;
        if (p.spawned && !p.alive) p.respawnAt = this.world.time + this.config.respawnDelayMs;
      }
      this.send(existing, this.welcome(existing, true));
      this.broadcastRoster();
      this.services.analytics.server('lobby_joined', { roomId: this.id, viaInvite: existing.viaInvite, resumed: true }, user);
      return 'resumed';
    }
    if (!this.isJoinable()) return this.world.phase === 'finished' || this.world.phase === 'closed' ? 'room_closed' : 'room_full';
    // a person always gets a place: a filled player gives up theirs when the room is full
    if (this.world.players.size >= this.config.maxPlayers && this.seats.size > 0) {
      const seats = [...this.seats.values()];
      const crowded: Team | null = isTeamMode(this.config.mode) ? (this.world.teamSize(0) >= this.world.teamSize(1) ? 0 : 1) : null;
      const pool = crowded === null ? seats : seats.filter((x) => this.world.players.get(x.id)?.team === crowded);
      this.dropSeat(this.leaver(pool.length ? pool : seats));
    }
    const client: Client = {
      user,
      ws,
      character,
      gear,
      lastGearAt: 0,
      ready: this.autoStart,
      rematch: false,
      viaInvite,
      connected: true,
      disconnectedAt: 0,
      queue: [],
      tokens: INPUT_BUCKET_MAX,
      lastQueuedSeq: 0,
      reconnectToken: randomBytes(18).toString('base64url'),
      joinedAt: Date.now(),
      matchTimeMs: 0,
      violations: 0,
      msgWindowStart: Date.now(),
      msgCount: 0,
    };
    this.clients.set(user.userId, client);
    if (!this.hostId) this.hostId = user.userId;
    this.world.addPlayer(user.userId, user.displayName, character, false, gear.loadout);
    this.send(client, this.welcome(client, false));
    this.broadcastRoster();
    this.services.analytics.server('lobby_joined', { roomId: this.id, viaInvite }, user);
    this.log.info('player joined', { user: user.userId, players: this.clients.size });
    return 'ok';
  }

  private welcome(c: Client, resumed: boolean): ServerMessage {
    const p = this.world.players.get(c.user.userId);
    return {
      type: 'welcome',
      playerId: c.user.userId,
      slot: p?.slot ?? -1,
      roomId: this.id,
      reconnectToken: c.reconnectToken,
      mode: this.config.mode,
      serverTime: this.world.time,
      tick: this.world.tick,
      mapId: this.mapId,
      config: this.config,
      resumed,
    };
  }

  onSocketClose(ws: WebSocket): void {
    for (const c of this.clients.values()) {
      if (c.ws !== ws) continue;
      c.ws = null;
      c.connected = false;
      c.disconnectedAt = this.clock();
      c.queue = [];
      const p = this.world.players.get(c.user.userId);
      if (p) {
        p.connected = false;
        if (p.alive && this.world.phase === 'active') {
          // Remove the avatar from play while disconnected (no free kills, no ghost).
          p.alive = false;
          p.respawnAt = Number.MAX_SAFE_INTEGER;
        }
      }
      if (this.world.phase === 'waiting') this.removeClient(c, 'left');
      else this.broadcastRoster();
      return;
    }
  }

  private removeClient(c: Client, reason: string) {
    this.clients.delete(c.user.userId);
    this.world.removePlayer(c.user.userId);
    this.services.analytics.server('lobby_left', { roomId: this.id, phase: this.world.phase, reason }, c.user);
    if (this.hostId === c.user.userId) {
      const next = [...this.clients.values()].find((x) => x.connected) ?? [...this.clients.values()][0];
      this.hostId = next ? next.user.userId : null;
    }
    this.broadcastRoster();
  }

  // ── Messages ────────────────────────────────────────────────────────────
  onMessage(ws: WebSocket, data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean): void {
    const c = [...this.clients.values()].find((x) => x.ws === ws);
    if (!c) return;
    const now = Date.now();
    if (now - c.msgWindowStart > 1000) {
      c.msgWindowStart = now;
      c.msgCount = 0;
    }
    if (++c.msgCount > MAX_MSGS_PER_SEC) return this.violation(c, 'rate');
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (isBinary) {
      let frames: InputFrame[];
      try {
        frames = decodeInputs(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      } catch (e) {
        if (e instanceof ProtocolError) return this.violation(c, 'bad_input');
        throw e;
      }
      for (const f of frames) {
        if (f.seq <= c.lastQueuedSeq) continue;
        c.lastQueuedSeq = f.seq;
        c.queue.push(f);
      }
      if (c.queue.length > INPUT_QUEUE_MAX) c.queue.splice(0, c.queue.length - INPUT_QUEUE_MAX);
      return;
    }
    let msg: ClientMessage;
    try {
      const parsed = ClientMessageSchema.safeParse(JSON.parse(buf.toString('utf8')));
      if (!parsed.success) return this.violation(c, 'bad_message');
      msg = parsed.data;
    } catch {
      return this.violation(c, 'bad_json');
    }
    this.handleControl(c, msg);
  }

  private violation(c: Client, kind: string) {
    c.violations++;
    if (c.violations === 1 || c.violations % 20 === 0) this.log.warn('protocol violation', { user: c.user.userId, kind, count: c.violations });
    if (c.violations > 50 && c.ws) {
      this.send(c, { type: 'kicked', reason: 'protocol' });
      c.ws.close(WS_CLOSE.POLICY, 'protocol violations');
    }
  }

  private handleControl(c: Client, msg: ClientMessage) {
    switch (msg.type) {
      case 'ping':
        this.send(c, { type: 'pong', t: msg.t, serverTime: this.world.time });
        return;
      case 'ready':
        c.ready = msg.ready;
        this.broadcastRoster();
        return;
      case 'character': {
        if (!c.gear.characters.has(msg.character)) return this.error(c, 'character_locked', 'This character isn’t unlocked yet');
        c.character = msg.character;
        const p = this.world.players.get(c.user.userId);
        if (p && (this.world.phase === 'waiting' || !p.alive)) p.character = msg.character;
        this.broadcastRoster();
        return;
      }
      case 'map':
        if (c.user.userId !== this.hostId) return this.error(c, 'not_host', 'Only the room’s host changes the map');
        if (this.world.phase !== 'waiting') return this.error(c, 'match_running', 'The match is already on');
        if (!isMapId(msg.mapId)) return;
        this.changeMap(msg.mapId);
        return;
      case 'mode':
        if (c.user.userId !== this.hostId) return this.error(c, 'not_host', 'Only the room’s host changes the mode');
        if (this.world.phase !== 'waiting') return this.error(c, 'match_running', 'The match is already on');
        this.changeMode(msg.mode);
        return;
      case 'team': {
        if (!isTeamMode(this.config.mode)) return;
        if (this.world.phase !== 'waiting') return this.error(c, 'match_running', 'Teams are fixed once the match is on');
        const p = this.world.players.get(c.user.userId);
        if (!p || p.team === msg.team) return;
        if (this.fillBots) {
          // the room evens the sides out with its own players: only people are limited per side
          let there = 0;
          for (const x of this.clients.values()) if (x !== c && this.world.players.get(x.user.userId)?.team === msg.team) there++;
          if (there + 1 > Math.floor(this.config.maxPlayers / 2)) return this.error(c, 'team_full', 'That team already has more players');
          this.world.setTeam(c.user.userId, msg.team);
          this.settleLobby();
          this.broadcastRoster();
          return;
        }
        // the teams must stay even: at most one player more on either side
        const to = this.world.teamSize(msg.team) + 1;
        const from = this.world.teamSize(msg.team === 0 ? 1 : 0) - (p.team === null ? 0 : 1);
        if (to - from > 1) return this.error(c, 'team_full', 'That team already has more players');
        this.world.setTeam(c.user.userId, msg.team);
        this.broadcastRoster();
        return;
      }
      case 'start':
        if (c.user.userId !== this.hostId) return this.error(c, 'not_host', 'Only the room’s host starts the match');
        if (this.world.phase !== 'waiting') return this.error(c, 'match_running', 'The match is already on');
        if (this.connectedCount < this.minToStart) return this.error(c, 'not_enough_players', `At least ${this.config.minPlayers} players needed`);
        this.startMatch();
        return;
      case 'loadout': {
        // the player changed weapons/upgrades over the API: re-read them (applies from the next spawn)
        const now = Date.now();
        if (now - c.lastGearAt < 1500) return;
        c.lastGearAt = now;
        const userId = c.user.userId;
        void this.services.economy
          .gear(userId)
          .then((g) => {
            const cur = this.clients.get(userId);
            if (!cur || this.closed) return;
            cur.gear = g;
            this.world.setLoadout(userId, g.loadout);
            this.broadcastRoster();
          })
          .catch((e: Error) => this.log.warn('loadout refresh failed', { user: userId, err: e }));
        return;
      }
      case 'rematch':
        if (this.world.phase !== 'finished') return;
        c.rematch = true;
        this.broadcastRoster();
        if ([...this.clients.values()].filter((x) => x.connected).every((x) => x.rematch)) this.toLobby(true);
        return;
      case 'leave':
        if (c.ws) c.ws.close(WS_CLOSE.NORMAL, 'leave');
        this.removeClient(c, 'leave');
        return;
      case 'hello':
        return; // already joined
    }
  }

  private changeMap(mapId: MapId) {
    this.mapId = mapId;
    this.rebuildWorld(true);
  }

  /**
   * A new game mode: the roster stays; teams carry over between team modes and are dealt anew
   * (alternating by arrival) when coming from free-for-all.
   */
  private changeMode(mode: GameMode) {
    if (mode === this.config.mode) return;
    const keepTeams = isTeamMode(this.config.mode) && isTeamMode(mode);
    this.config = { ...this.config, mode };
    this.rebuildWorld(keepTeams);
    this.services.analytics.server('lobby_created', { roomId: this.id, mapId: this.mapId, isPrivate: this.isPrivate, mode }, { userId: this.hostId });
  }

  private rebuildWorld(keepTeams: boolean) {
    const roster = [...this.world.players.values()].sort((a, b) => a.joinedAt - b.joinedAt || a.slot - b.slot);
    this.world = this.createWorld();
    // loadouts (owned weapons, modifications and equipment) carry over
    for (const p of roster) {
      const team = keepTeams && isTeamMode(this.config.mode) && p.team !== null ? p.team : undefined;
      this.world.addPlayer(p.id, p.name, p.character, p.isBot, { sidearm: p.sidearm, melee: p.melee, primary: p.primary, gadget: p.gadget, mods: p.mods }, team).connected = p.connected;
    }
    this.broadcastRoster();
  }

  // ── Filling the lineup ──────────────────────────────────────────────────
  /**
   * How many players the room should add: in total (free-for-all) or per side (teams), so that the
   * people present get a full match (FILL_RULES). Null when the room does not fill or nobody is there.
   */
  private fillWant(): { total: number } | { red: number; blue: number } | null {
    if (!this.fillBots) return null;
    let total = 0;
    let red = 0;
    let blue = 0;
    for (const c of this.clients.values()) {
      if (!c.connected) continue;
      total++;
      const team = this.world.players.get(c.user.userId)?.team;
      if (team === 0) red++;
      else if (team === 1) blue++;
    }
    if (total === 0) return null;
    const target = fillTarget(this.config.mode, { total, red, blue }, this.config.maxPlayers);
    if ('side' in target) return { red: Math.max(0, target.side - red), blue: Math.max(0, target.side - blue) };
    return { total: Math.max(0, target.total - total) };
  }

  private hasFreeSlot(): boolean {
    return this.world.players.size < this.config.maxPlayers;
  }

  /** Who leaves first: in a match the one doing worst (latest arrival on a tie), in the lobby the latest arrival. */
  private leaver(list: FillSeat[]): FillSeat {
    const inMatch = this.world.phase !== 'waiting';
    const score = (x: FillSeat) => this.world.players.get(x.id)?.score ?? 0;
    return [...list].sort((a, b) => (inMatch ? score(a) - score(b) : 0) || b.addedAt - a.addedAt)[0]!;
  }

  /** The next change towards the wanted lineup (null: it is right as it is). */
  private fillStep(): FillStep | null {
    const seats = [...this.seats.values()];
    const want = this.fillWant();
    // nobody connected right now (people about to reconnect): the lineup stays as it is
    if (!want) return null;
    if ('total' in want) {
      if (seats.length > want.total) return { kind: 'remove', seat: this.leaver(seats) };
      if (seats.length < want.total && this.hasFreeSlot()) return { kind: 'add', team: null };
      return null;
    }
    const red = seats.filter((x) => this.world.players.get(x.id)?.team === 0);
    const blue = seats.filter((x) => this.world.players.get(x.id)?.team !== 0);
    const extraRed = red.length - want.red;
    const extraBlue = blue.length - want.blue;
    // in the lobby a player simply changes sides instead of leaving one and arriving on the other
    if (this.world.phase === 'waiting') {
      if (extraRed > 0 && extraBlue < 0) return { kind: 'move', seat: this.leaver(red), team: 1 };
      if (extraBlue > 0 && extraRed < 0) return { kind: 'move', seat: this.leaver(blue), team: 0 };
    }
    if (extraRed > 0 || extraBlue > 0) return { kind: 'remove', seat: this.leaver(extraRed >= extraBlue ? red : blue) };
    if ((extraRed < 0 || extraBlue < 0) && this.hasFreeSlot()) return { kind: 'add', team: extraRed <= extraBlue ? 0 : 1 };
    return null;
  }

  /** A new player for the lineup: a name, level, avatar, character and gear like everyone else's. */
  private addSeat(team: Team | null): FillSeat | null {
    if (!this.hasFreeSlot()) return null;
    let levels = 0;
    let people = 0;
    let cyrillic = false;
    for (const c of this.clients.values()) {
      if (!c.connected) continue;
      people++;
      levels += Math.max(1, c.user.level ?? 1);
      if (/[а-яё]/i.test(c.user.displayName)) cyrillic = true;
    }
    const lang: NickLang = Math.random() < (cyrillic ? 0.8 : 0.45) ? 'ru' : 'en';
    const taken = new Set<string>();
    for (const p of this.world.players.values()) taken.add(p.name.toLowerCase());
    const persona = fillPersona(Math.random, { lang, aroundLevel: people ? levels / people : 1, taken });
    const id = randomUUID();
    this.world.addPlayer(id, persona.name, persona.character, true, persona.loadout, team ?? undefined);
    const seat: FillSeat = {
      id,
      name: persona.name,
      character: persona.character,
      level: persona.level,
      avatar: persona.avatar,
      difficulty: persona.difficulty,
      addedAt: this.clock(),
      brain: null,
      brainWorld: null,
      rematch: false,
      rematchAt: 0,
    };
    this.seats.set(id, seat);
    return seat;
  }

  private dropSeat(seat: FillSeat) {
    this.seats.delete(seat.id);
    this.world.removePlayer(seat.id);
  }

  private applyStep(step: FillStep) {
    if (step.kind === 'add') this.addSeat(step.team);
    else if (step.kind === 'remove') this.dropSeat(step.seat);
    else this.world.setTeam(step.seat.id, step.team);
  }

  /** Brings the lineup to what it should be right away (the match is being started). */
  private fillNow() {
    for (let guard = 0; guard < 2 * this.config.maxPlayers + 4; guard++) {
      const step = this.fillStep();
      if (!step) return;
      this.applyStep(step);
    }
  }

  /** Lobby: sides are evened out at once (moves only); arrivals and departures keep their pace. */
  private settleLobby() {
    for (let guard = 0; guard < this.config.maxPlayers; guard++) {
      const step = this.fillStep();
      if (!step || step.kind !== 'move') return;
      this.applyStep(step);
    }
  }

  /**
   * Keeps the filled lineup right, at a human pace: Quick Match lobbies wait FILL_RULES.waitMs for
   * people, then players arrive one by one; rooms with friends fill up when the match is started;
   * during a match empty places are taken (and places a person takes are given up) after a while.
   */
  private fillTick(now: number) {
    const phase = this.world.phase;
    if (this.clients.size === 0) {
      // nobody left — not even someone about to reconnect
      if (this.seats.size > 0) {
        for (const seat of [...this.seats.values()]) this.dropSeat(seat);
        this.broadcastRoster();
      }
      this.fillFrom = 0;
      this.nextFillAt = 0;
      return;
    }
    if (phase === 'finished') {
      let voted = false;
      for (const seat of this.seats.values()) {
        if (!seat.rematch && seat.rematchAt && now >= seat.rematchAt) {
          seat.rematch = true;
          voted = true;
        }
      }
      if (voted) this.broadcastRoster();
      return;
    }
    if (phase === 'closed') return;
    const inLobby = phase === 'waiting';
    if (inLobby && this.connectedCount === 0) this.fillFrom = 0;
    else if (inLobby && !this.fillFrom) this.fillFrom = now + this.fillTiming.waitMs;
    const step = this.fillStep();
    if (!step) {
      this.nextFillAt = 0;
      return;
    }
    if (step.kind === 'move') {
      this.applyStep(step);
      this.broadcastRoster();
      return;
    }
    if (step.kind === 'add' && inLobby) {
      // rooms with friends fill up at kick-off; Quick Match gives people a head start
      if (!this.autoStart || now < this.fillFrom) {
        this.nextFillAt = 0;
        return;
      }
    }
    if (!this.nextFillAt) {
      const t = this.fillTiming;
      this.nextFillAt = now + (step.kind === 'remove' ? between(t.leaveMinMs, t.leaveMaxMs) : inLobby ? between(t.arriveMinMs, t.arriveMaxMs) : between(t.joinMinMs, t.joinMaxMs));
      return;
    }
    if (now < this.nextFillAt) return;
    this.nextFillAt = 0;
    this.applyStep(step);
    this.broadcastRoster();
  }

  // ── Match lifecycle ─────────────────────────────────────────────────────
  private startMatch() {
    // the lineup fills up (and the sides even out) the moment the match is started
    if (this.fillBots) this.fillNow();
    for (const seat of this.seats.values()) {
      seat.brain = null;
      seat.rematch = false;
    }
    for (const c of this.clients.values()) {
      const p = this.world.players.get(c.user.userId);
      if (p) p.character = c.character;
      c.matchTimeMs = 0;
      c.rematch = false;
      // a new match is a new input stream: the client's game scene (and its input sequence) is
      // recreated, so inputs numbered below the previous match's last seq must not be dropped
      c.queue = [];
      c.lastQueuedSeq = 0;
    }
    this.world.beginMatch();
    this.matchId = randomUUID();
    this.matchStartedAtWall = Date.now();
    this.resultsSent = false;
    const players = [...this.clients.values()].map((c) => ({ userId: c.user.userId, character: c.character, viaInvite: c.viaInvite, team: this.world.players.get(c.user.userId)?.team ?? null }));
    const fill = this.seats.size;
    this.services.recorder
      .matchStarted({ matchId: this.matchId, roomId: this.id, mapId: this.mapId, mode: this.config.mode, isPrivate: this.isPrivate, startedAt: new Date(), players, fill })
      .catch((e: Error) => this.log.error('matchStarted failed', { err: e }));
    this.services.analytics.server('match_started', { matchId: this.matchId, roomId: this.id, mapId: this.mapId, players: players.length, fill, mode: this.config.mode });
    this.services.analytics.server('map_played', { matchId: this.matchId, mapId: this.mapId });
    this.log.info('match started', { matchId: this.matchId, players: players.length, fill, map: this.mapId, mode: this.config.mode });
    this.broadcastRoster();
  }

  private toLobby(rematch: boolean) {
    this.world.resetToLobby();
    this.matchId = null;
    for (const [id, c] of [...this.clients]) {
      if (!c.connected) {
        this.clients.delete(id);
        this.world.removePlayer(id);
      }
      c.rematch = false;
      c.ready = this.autoStart || rematch;
    }
    for (const seat of [...this.seats.values()]) {
      seat.rematch = false;
      // after a public match some players move on (others take their places later)
      if (!rematch && !this.isPrivate && Math.random() < 0.3) this.dropSeat(seat);
    }
    this.broadcastRoster();
    if (rematch && this.connectedCount >= this.minToStart) this.startMatch();
  }

  private finishResults(reason: 'time' | 'score' | 'aborted') {
    if (this.resultsSent || !this.matchId) return;
    this.resultsSent = true;
    const standings: Standing[] = this.world.standings();
    const durationMs = Math.max(0, this.world.time - this.world.matchStartedAt);
    const teams = isTeamMode(this.config.mode) ? this.world.teamResult() : undefined;
    // deliver the deciding shot/kill events before the results screen
    this.flush();
    // everyone is shown the same way: players the room filled in are not marked
    const shown = standings.map((s) => (s.isBot ? { ...s, isBot: false } : s));
    this.broadcast({ type: 'results', matchId: this.matchId, reason, durationMs, standings: shown, mapId: this.mapId, mode: this.config.mode, ...(teams ? { teams } : {}) });
    const matchId = this.matchId;
    // places count everyone who finished the match — filled players are opponents like anyone else
    const presentAtEnd = standings.filter((s) => this.clients.get(s.id)?.connected || this.seats.has(s.id));
    const presentPlaces = rankPlaces(presentAtEnd);
    const peopleAtEnd = presentAtEnd.filter((s) => !s.isBot).length;
    const fillAtEnd = presentAtEnd.length - peopleAtEnd;
    const now = this.clock();
    for (const seat of this.seats.values()) {
      seat.rematch = false;
      seat.rematchAt = now + between(1500, 6000);
    }
    const participants = standings
      .filter((s) => !s.isBot && this.clients.has(s.id))
      .map((s) => {
        const c = this.clients.get(s.id)!;
        const presentIdx = presentAtEnd.findIndex((x) => x.id === s.id);
        const team = s.team ?? null;
        return {
          userId: s.id,
          character: c.character,
          // team matches: 1 for the winning team (both on a draw), 2 for the other
          place: teams ? s.place : presentIdx >= 0 ? presentPlaces[presentIdx]! : standings.length,
          team,
          ...(teams ? { teamOutcome: teams.winner === null ? ('draw' as const) : team === teams.winner ? ('win' as const) : ('loss' as const) } : {}),
          kills: s.kills,
          assists: s.assists,
          deaths: s.deaths,
          score: s.score,
          damageDealt: s.damageDealt,
          objectives: s.objectives ?? 0,
          completed: c.connected,
          viaInvite: c.viaInvite,
          playtimeMs: Math.round(c.matchTimeMs),
        };
      });
    this.services.analytics.server('match_completed', { matchId, mapId: this.mapId, durationMs, players: peopleAtEnd, fill: fillAtEnd, reason, mode: this.config.mode });
    this.services.recorder
      .matchCompleted({
        matchId,
        roomId: this.id,
        mapId: this.mapId,
        mode: this.config.mode,
        winnerTeam: teams ? teams.winner : null,
        isPrivate: this.isPrivate,
        startedAt: new Date(this.matchStartedAtWall),
        endedAt: new Date(),
        durationMs,
        endReason: reason,
        playersAtEnd: presentAtEnd.length,
        peopleAtEnd,
        fillAtEnd,
        participants,
      })
      .then((personal) => {
        let levelChanged = false;
        for (const [userId, result] of personal) {
          const c = this.clients.get(userId);
          if (!c) continue;
          // the roster shows the level the player has *now* (nameplates/scoreboard in a rematch)
          if (c.user.level !== result.level) {
            c.user = { ...c.user, level: result.level };
            levelChanged = true;
          }
          this.send(c, { type: 'progress', matchId, result });
        }
        if (levelChanged && !this.closed) this.broadcastRoster();
      })
      .catch((e: Error) => {
        this.log.error('matchCompleted failed', { err: e, matchId });
        this.services.analytics.error({ source: 'server', component: 'results', category: 'persist', message: e.message });
      });
  }

  // ── Tick ────────────────────────────────────────────────────────────────
  private clock(): number {
    return this.lastNow || Date.now();
  }

  tick(now: number): void {
    if (this.closed) return;
    this.lastNow = now;
    const w = this.world;
    // the filled part of the lineup (arrivals, departures, rematch votes)
    if (this.fillBots || this.seats.size > 0) this.fillTick(now);
    // lobby automation
    if (w.phase === 'waiting') {
      const connected = [...this.clients.values()].filter((c) => c.connected);
      // filled players are always ready; a person has to be there
      const enough = connected.length > 0 && connected.length + this.seats.size >= this.config.minPlayers;
      const allReady = enough && connected.every((c) => c.ready);
      if (allReady) {
        if (!this.autoStartAt) this.autoStartAt = now + (this.autoStart ? AUTO_START_DELAY_MS : 600);
        if (now >= this.autoStartAt) {
          this.autoStartAt = 0;
          this.startMatch();
        }
      } else this.autoStartAt = 0;
    }
    // filled players: their AI produces one input per tick, exactly like a client
    if (this.seats.size > 0 && (w.phase === 'countdown' || w.phase === 'active')) {
      const nav = navFor(this.mapId, w);
      for (const seat of this.seats.values()) {
        if (!seat.brain || seat.brainWorld !== w) {
          seat.brain = new BotBrain(seat.id, w, nav, seat.difficulty, Math.floor(Math.random() * 2 ** 31));
          seat.brainWorld = w;
        }
        w.applyInput(seat.id, seat.brain.nextInput());
      }
    }
    // inputs (token bucket: one input per server tick on average)
    for (const c of this.clients.values()) {
      if (!c.connected) continue;
      if (w.phase === 'active') c.matchTimeMs += TICK_MS;
      c.tokens = Math.min(INPUT_BUCKET_MAX, c.tokens + 1);
      let n = 0;
      while (c.queue.length > 0 && c.tokens >= 1 && n < MAX_INPUTS_PER_TICK) {
        w.applyInput(c.user.userId, c.queue.shift()!);
        c.tokens -= 1;
        n++;
      }
    }
    w.update();
    for (const e of w.drainEvents()) {
      if (e.t === 'shot' || e.t === 'melee') this.pendingShots.push(e);
      else {
        this.pendingEvents.push(e as GameEvent);
        if (e.t === 'phase') this.broadcastRoster();
        if (e.t === 'matchEnd') this.finishResults(e.reason);
      }
    }
    // finished → lobby
    if (w.phase === 'finished' && w.phaseEndsAt && w.time >= w.phaseEndsAt) this.toLobby(false);
    // solo abort: everyone else left during a match (filled players keep a person company)
    if (w.phase === 'active' && this.connectedCount + this.seats.size < 2) {
      if (!this.soloSince) this.soloSince = now;
      else if (now - this.soloSince > SOLO_ABORT_MS) {
        this.soloSince = 0;
        w.finish('aborted');
      }
    } else this.soloSince = 0;
    // reconnect grace expiry
    for (const c of [...this.clients.values()]) {
      if (!c.connected && now - c.disconnectedAt > this.config.reconnectGraceMs) this.removeClient(c, 'timeout');
    }
    // snapshots
    if (w.tick % SNAPSHOT_EVERY_TICKS === 0) this.flush();
    // empty room bookkeeping
    if (this.connectedCount === 0) {
      if (now - this.emptySince > this.config.emptyRoomTtlMs) this.close('empty');
    } else this.emptySince = now;
  }

  private flush() {
    const w = this.world;
    const snapshot = encodeSnapshot({
      tick: w.tick,
      time: w.time,
      phase: w.phase,
      phaseRemaining: w.phase === 'active' ? w.matchTimeLeftMs : w.phaseEndsAt ? Math.max(0, w.phaseEndsAt - w.time) : 0,
      teamScore: w.teamScore,
      players: w.players.values(),
      pickups: w.pickups,
      gadgets: w.gadgets,
      flags: w.flags,
      bases: w.bases,
      events: this.pendingShots,
      now: w.time,
    });
    this.pendingShots = [];
    const evMsg = this.pendingEvents.length ? JSON.stringify({ type: 'ev', tick: w.tick, events: this.pendingEvents } satisfies ServerMessage) : null;
    this.pendingEvents = [];
    for (const c of this.clients.values()) {
      if (!c.connected || !c.ws || c.ws.readyState !== 1) continue;
      if (c.ws.bufferedAmount > 256 * 1024) continue; // slow client: skip this snapshot
      c.ws.send(snapshot, { binary: true });
      if (evMsg) c.ws.send(evMsg);
    }
  }

  close(reason: string): void {
    if (this.closed) return;
    if (this.matchId && (this.world.phase === 'active' || this.world.phase === 'countdown' || this.world.phase === 'ready') && !this.resultsSent) {
      const id = this.matchId;
      this.services.recorder.matchAbandoned(id, reason).catch((e: Error) => this.log.error('matchAbandoned failed', { err: e }));
      this.services.analytics.server('match_abandoned', { matchId: id, mapId: this.mapId, phase: this.world.phase });
    }
    this.closed = true;
    this.world.close();
    for (const c of this.clients.values()) {
      try {
        c.ws?.close(WS_CLOSE.ROOM_CLOSED, 'room closed');
      } catch {
        /* ignore */
      }
    }
    this.clients.clear();
    this.seats.clear();
    this.log.info('room closed', { reason });
  }

  // ── Output helpers ──────────────────────────────────────────────────────
  roster(): ServerMessage {
    const finished = this.world.phase === 'finished';
    const order = (id: string) => {
      const p = this.world.players.get(id);
      return p ? p.joinedAt * 16 + p.slot : Number.MAX_SAFE_INTEGER;
    };
    const people: RosterEntry[] = [...this.clients.values()].map((c) => {
      const p = this.world.players.get(c.user.userId);
      return {
        id: c.user.userId,
        slot: p?.slot ?? -1,
        name: c.user.displayName,
        character: c.character,
        ready: finished ? c.rematch : c.ready,
        connected: c.connected,
        isHost: c.user.userId === this.hostId,
        isBot: false,
        level: c.user.level,
        avatar: c.user.avatar ?? null,
        team: p?.team ?? null,
        mods: c.gear.loadout.mods,
      };
    });
    // players the room filled in look exactly like people (always ready; never the host)
    const filled: RosterEntry[] = [...this.seats.values()].map((seat) => {
      const p = this.world.players.get(seat.id);
      return {
        id: seat.id,
        slot: p?.slot ?? -1,
        name: seat.name,
        character: seat.character,
        ready: finished ? seat.rematch : true,
        connected: true,
        isHost: false,
        isBot: false,
        level: seat.level,
        avatar: seat.avatar,
        team: p?.team ?? null,
        mods: {},
      };
    });
    const players = [...people, ...filled].sort((a, b) => order(a.id) - order(b.id));
    return {
      type: 'roster',
      players,
      hostId: this.hostId,
      mapId: this.mapId,
      phase: this.world.phase,
      inviteCode: this.inviteCode,
      isPrivate: this.isPrivate,
      maxPlayers: this.config.maxPlayers,
      mode: this.config.mode,
      minToStart: this.minToStart,
    };
  }

  broadcastRoster(): void {
    this.broadcast(this.roster());
  }

  broadcast(msg: ServerMessage): void {
    const s = JSON.stringify(msg);
    for (const c of this.clients.values()) if (c.connected && c.ws && c.ws.readyState === 1) c.ws.send(s);
  }

  private send(c: Client, msg: ServerMessage) {
    if (c.ws && c.ws.readyState === 1) c.ws.send(JSON.stringify(msg));
  }

  private error(c: Client, code: Extract<ServerMessage, { type: 'error' }>['code'], message: string) {
    this.send(c, { type: 'error', code, message });
  }

  /** For the admin dashboard: people and filled players counted separately. */
  info() {
    return { id: this.id, mapId: this.mapId, mode: this.config.mode, phase: this.world.phase, players: this.clients.size, fill: this.seats.size, maxPlayers: this.config.maxPlayers, isPrivate: this.isPrivate, hostName: this.hostName() };
  }

  /** For players: the lineup as they see it in the room. */
  publicInfo() {
    return { id: this.id, mapId: this.mapId, mode: this.config.mode, phase: this.world.phase, players: this.lineup, maxPlayers: this.config.maxPlayers, isPrivate: this.isPrivate, hostName: this.hostName() };
  }

  static protocolVersion = PROTOCOL_VERSION;
}
