/**
 * One multiplayer room: lobby + authoritative deathmatch simulation for 2–6 players.
 * Clients send inputs; the room runs the shared World at 60 Hz and broadcasts binary snapshots at
 * 30 Hz plus JSON control messages. Results are recorded once through MatchRecorder.
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
  isMapId,
  rankPlaces,
} from '@blatkom/shared';
import type {
  CharacterId,
  ClientMessage,
  GameEvent,
  InputFrame,
  MapId,
  MatchConfig,
  RosterEntry,
  ServerMessage,
  WorldEvent,
  Standing,
} from '@blatkom/shared';
import type { AuthedUser, Services } from '../services/contracts.js';
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
}

interface Client {
  user: AuthedUser;
  ws: WebSocket | null;
  character: CharacterId;
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
const SOLO_ABORT_MS = 20_000;
const MAX_MSGS_PER_SEC = 150;

export class MatchRoom {
  readonly id: string;
  readonly isPrivate: boolean;
  readonly createdAt = Date.now();
  readonly config: MatchConfig;
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
  private autoStartAt = 0;
  private soloSince = 0;
  private resultsSent = false;
  private readonly autoStart: boolean;
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
    this.config = { ...DEFAULT_MATCH_CONFIG, ...opts.config };
    this.log = log.child({ room: this.id });
    this.world = this.createWorld();
  }

  private createWorld(): World {
    return new World(getMap(this.mapId), getCollision(this.mapId), { config: this.config, lagCompensation: true, seed: Math.floor(Math.random() * 2 ** 31) });
  }

  get phase() {
    return this.world.phase;
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
  join(user: AuthedUser, ws: WebSocket, character: CharacterId, viaInvite: boolean): 'ok' | 'resumed' | 'room_full' | 'room_closed' {
    if (this.closed) return 'room_closed';
    const existing = this.clients.get(user.userId);
    if (existing) {
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
    const client: Client = {
      user,
      ws,
      character,
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
    this.world.addPlayer(user.userId, user.displayName, character, false);
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
      c.disconnectedAt = Date.now();
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
        c.character = msg.character;
        const p = this.world.players.get(c.user.userId);
        if (p && (this.world.phase === 'waiting' || !p.alive)) p.character = msg.character;
        this.broadcastRoster();
        return;
      }
      case 'map':
        if (c.user.userId !== this.hostId) return this.error(c, 'not_host', 'Только хозяин комнаты меняет карту');
        if (this.world.phase !== 'waiting') return this.error(c, 'invalid_state', 'Матч уже идёт');
        if (!isMapId(msg.mapId)) return;
        this.changeMap(msg.mapId);
        return;
      case 'start':
        if (c.user.userId !== this.hostId) return this.error(c, 'not_host', 'Только хозяин комнаты запускает матч');
        if (this.world.phase !== 'waiting') return this.error(c, 'invalid_state', 'Матч уже идёт');
        if (this.connectedCount < this.config.minPlayers) return this.error(c, 'invalid_state', `Нужно минимум ${this.config.minPlayers} игрока`);
        this.startMatch();
        return;
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
    const roster = [...this.world.players.values()];
    this.mapId = mapId;
    this.world = this.createWorld();
    for (const p of roster) this.world.addPlayer(p.id, p.name, p.character, p.isBot).connected = p.connected;
    this.broadcastRoster();
  }

  // ── Match lifecycle ─────────────────────────────────────────────────────
  private startMatch() {
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
    const players = [...this.clients.values()].map((c) => ({ userId: c.user.userId, character: c.character, viaInvite: c.viaInvite }));
    this.services.recorder
      .matchStarted({ matchId: this.matchId, roomId: this.id, mapId: this.mapId, isPrivate: this.isPrivate, startedAt: new Date(), players })
      .catch((e: Error) => this.log.error('matchStarted failed', { err: e }));
    this.services.analytics.server('match_started', { matchId: this.matchId, roomId: this.id, mapId: this.mapId, players: players.length });
    this.services.analytics.server('map_played', { matchId: this.matchId, mapId: this.mapId });
    this.log.info('match started', { matchId: this.matchId, players: players.length, map: this.mapId });
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
    this.broadcastRoster();
    if (rematch && this.connectedCount >= this.config.minPlayers) this.startMatch();
  }

  private finishResults(reason: 'time' | 'score' | 'aborted') {
    if (this.resultsSent || !this.matchId) return;
    this.resultsSent = true;
    const standings: Standing[] = this.world.standings();
    const durationMs = Math.max(0, this.world.time - this.world.matchStartedAt);
    // deliver the deciding shot/kill events before the results screen
    this.flush();
    this.broadcast({ type: 'results', matchId: this.matchId, reason, durationMs, standings, mapId: this.mapId });
    const matchId = this.matchId;
    const presentAtEnd = standings.filter((s) => this.clients.get(s.id)?.connected);
    const presentPlaces = rankPlaces(presentAtEnd);
    const participants = standings
      .filter((s) => !s.isBot && this.clients.has(s.id))
      .map((s) => {
        const c = this.clients.get(s.id)!;
        const presentIdx = presentAtEnd.findIndex((x) => x.id === s.id);
        return {
          userId: s.id,
          character: c.character,
          place: presentIdx >= 0 ? presentPlaces[presentIdx]! : standings.length,
          kills: s.kills,
          assists: s.assists,
          deaths: s.deaths,
          score: s.score,
          damageDealt: s.damageDealt,
          completed: c.connected,
          viaInvite: c.viaInvite,
          playtimeMs: Math.round(c.matchTimeMs),
        };
      });
    this.services.analytics.server('match_completed', { matchId, mapId: this.mapId, durationMs, players: presentAtEnd.length, reason });
    this.services.recorder
      .matchCompleted({
        matchId,
        roomId: this.id,
        mapId: this.mapId,
        isPrivate: this.isPrivate,
        startedAt: new Date(this.matchStartedAtWall),
        endedAt: new Date(),
        durationMs,
        endReason: reason,
        playersAtEnd: presentAtEnd.length,
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
  tick(now: number): void {
    if (this.closed) return;
    const w = this.world;
    // lobby automation
    if (w.phase === 'waiting') {
      const connected = [...this.clients.values()].filter((c) => c.connected);
      const enough = connected.length >= this.config.minPlayers;
      const allReady = enough && connected.every((c) => c.ready);
      if (allReady) {
        if (!this.autoStartAt) this.autoStartAt = now + (this.autoStart ? AUTO_START_DELAY_MS : 600);
        if (now >= this.autoStartAt) {
          this.autoStartAt = 0;
          this.startMatch();
        }
      } else this.autoStartAt = 0;
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
    // solo abort: everyone else left during a match
    if (w.phase === 'active' && this.connectedCount < 2) {
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
      players: w.players.values(),
      pickups: w.pickups,
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
    this.log.info('room closed', { reason });
  }

  // ── Output helpers ──────────────────────────────────────────────────────
  roster(): ServerMessage {
    const players: RosterEntry[] = [...this.clients.values()].map((c) => {
      const p = this.world.players.get(c.user.userId);
      return {
        id: c.user.userId,
        slot: p?.slot ?? -1,
        name: c.user.displayName,
        character: c.character,
        ready: this.world.phase === 'finished' ? c.rematch : c.ready,
        connected: c.connected,
        isHost: c.user.userId === this.hostId,
        isBot: false,
        level: c.user.level,
      };
    });
    return { type: 'roster', players, hostId: this.hostId, mapId: this.mapId, phase: this.world.phase, inviteCode: this.inviteCode, isPrivate: this.isPrivate, maxPlayers: this.config.maxPlayers };
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

  info() {
    return { id: this.id, mapId: this.mapId, phase: this.world.phase, players: this.clients.size, maxPlayers: this.config.maxPlayers, isPrivate: this.isPrivate, hostName: this.hostName() };
  }

  static protocolVersion = PROTOCOL_VERSION;
}
