/**
 * Online flow controller: authentication (Telegram initData or dev login), room creation/quick
 * match/invites over HTTP, the game WebSocket, lobby state and the OnlineSession lifecycle.
 */
import type { CharacterId, InviteInfo, MapId, MatchConfig, MatchPhase, PublicProfile, RosterEntry, ServerMessage } from '@blatkom/shared';
import { Api, ApiError } from './api.js';
import { GameConnection } from './GameConnection.js';
import { OnlineSession } from '../game/session/OnlineSession.js';
import type { ResultsData } from '../game/session/types.js';
import { tg, telegramUserName } from '../telegram/tg.js';
import { storageGet, storageSet } from '../app/settings.js';
import { analytics } from '../analytics/client.js';

export interface LobbyState {
  roomId: string;
  mapId: MapId;
  phase: MatchPhase;
  players: RosterEntry[];
  hostId: string | null;
  myId: string;
  isHost: boolean;
  inviteCode: string | null;
  inviteUrl: string | null;
  isPrivate: boolean;
  maxPlayers: number;
}

export interface OnlineCallbacks {
  onLobby(s: LobbyState): void;
  onMatchStart(session: OnlineSession): void;
  onResults(r: ResultsData): void;
  onProgress(): void;
  onError(message: string, fatal: boolean): void;
  onLeft(): void;
}

const TOKEN_KEY = 'blatkom89.token';
const DEVICE_KEY = 'blatkom89.device';

export class OnlineClient {
  readonly api = new Api();
  profile: PublicProfile | null = null;
  private conn: GameConnection | null = null;
  private session: OnlineSession | null = null;
  private roomId: string | null = null;
  private playerId = '';
  private slot = -1;
  private mapId: MapId = 'factory';
  private config: MatchConfig | null = null;
  private roster: RosterEntry[] = [];
  private lobby: LobbyState | null = null;
  private inviteUrl: string | null = null;
  private authPromise: Promise<PublicProfile> | null = null;
  lastResults: ResultsData | null = null;

  constructor(private readonly cb: OnlineCallbacks) {}

  ensureAuth(): Promise<PublicProfile> {
    if (this.profile && this.api.token) return Promise.resolve(this.profile);
    if (!this.authPromise) this.authPromise = this.doAuth().finally(() => (this.authPromise = null));
    return this.authPromise;
  }

  private async doAuth(): Promise<PublicProfile> {
    const t = tg();
    if (t) {
      const res = await this.api.authTelegram(t.initData);
      this.setToken(res.token);
      this.profile = res.profile;
      return res.profile;
    }
    const saved = storageGet(TOKEN_KEY);
    if (saved) {
      this.api.token = saved;
      try {
        this.profile = await this.api.me();
        this.setToken(saved);
        return this.profile;
      } catch {
        this.api.token = null;
      }
    }
    let device = storageGet(DEVICE_KEY);
    if (!device) {
      device = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
      storageSet(DEVICE_KEY, device);
    }
    const name = telegramUserName() ?? `Гость_${device.slice(0, 3).toUpperCase()}`;
    try {
      const res = await this.api.authDev(name, device);
      this.setToken(res.token);
      storageSet(TOKEN_KEY, res.token);
      this.profile = res.profile;
      return res.profile;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) throw new Error('Онлайн-режим доступен только через Telegram. Откройте игру из бота.');
      throw e;
    }
  }

  /** Drops the locally stored session token and device id (used after account deletion). */
  forgetLocalSession(): void {
    storageSet(TOKEN_KEY, null);
    storageSet(DEVICE_KEY, null);
    this.api.token = null;
    this.profile = null;
  }

  private setToken(token: string) {
    this.api.token = token;
    analytics.setToken(token);
  }

  async refreshProfile(): Promise<PublicProfile> {
    await this.ensureAuth();
    this.profile = await this.api.me();
    return this.profile;
  }

  async setPreferredCharacter(c: CharacterId): Promise<void> {
    this.conn?.send({ type: 'character', character: c });
    if (!this.api.token) return;
    try {
      this.profile = await this.api.updateMe({ preferredCharacter: c });
    } catch {
      /* non-critical */
    }
  }

  async rename(name: string): Promise<void> {
    await this.ensureAuth();
    this.profile = await this.api.updateMe({ displayName: name });
  }

  async quickMatch(c: CharacterId): Promise<void> {
    await this.ensureAuth();
    const r = await this.api.quickMatch();
    this.inviteUrl = null;
    await this.joinRoom(r.roomId, c);
  }

  async createRoom(mapId: MapId, c: CharacterId): Promise<void> {
    await this.ensureAuth();
    const r = await this.api.createRoom(mapId, true);
    this.inviteUrl = r.inviteUrl ?? r.webUrl;
    await this.joinRoom(r.roomId, c);
  }

  async resolveInvite(code: string): Promise<InviteInfo> {
    await this.ensureAuth();
    const info = await this.api.invite(code);
    if (info.status === 'joinable' || info.status === 'in_progress') this.inviteUrl = null;
    return info;
  }

  async joinRoom(roomId: string, c: CharacterId): Promise<void> {
    await this.ensureAuth();
    this.closeConn();
    this.roomId = roomId;
    const conn = new GameConnection(
      {
        onMessage: (m) => this.onMessage(m),
        onSnapshot: (s, at) => this.session?.onSnapshot(s, at),
        onStatus: (st, reason) => {
          if (this.session) this.session.status = st === 'open' ? 'online' : st === 'reconnecting' || st === 'connecting' ? 'reconnecting' : 'lost';
          if (st === 'closed' && reason !== 'user' && this.conn === conn) {
            const msg = reason === 'room_full' ? 'Комната заполнена.' : reason === 'room not found' ? 'Комната не найдена.' : reason === 'replaced' ? 'Вы подключились с другого устройства.' : 'Соединение с сервером потеряно.';
            this.cleanup();
            this.cb.onError(msg, true);
          }
        },
      },
      { token: this.api.token!, roomId, character: c },
    );
    this.conn = conn;
    conn.connect();
  }

  private onMessage(m: ServerMessage) {
    switch (m.type) {
      case 'welcome':
        this.playerId = m.playerId;
        this.slot = m.slot;
        this.mapId = m.mapId;
        this.config = m.config;
        break;
      case 'roster': {
        this.roster = m.players;
        this.mapId = m.mapId;
        const me = m.players.find((p) => p.id === this.playerId);
        if (me) this.slot = me.slot;
        this.lobby = {
          roomId: this.roomId ?? '',
          mapId: m.mapId,
          phase: m.phase,
          players: m.players,
          hostId: m.hostId,
          myId: this.playerId,
          isHost: m.hostId === this.playerId,
          inviteCode: m.inviteCode,
          inviteUrl: this.inviteUrl ?? (m.inviteCode ? `${location.origin}${location.pathname}?invite=${m.inviteCode}` : null),
          isPrivate: m.isPrivate,
          maxPlayers: m.maxPlayers,
        };
        if (this.session) this.session.setRoster(m.players);
        const inMatch = m.phase === 'ready' || m.phase === 'countdown' || m.phase === 'active';
        if (inMatch && !this.session && this.config && this.conn) {
          this.session = new OnlineSession(this.conn, this.mapId, this.slot, this.playerId, this.config, this.roster);
          this.lastResults = null;
          this.cb.onMatchStart(this.session);
        } else if (m.phase === 'waiting' && this.session) {
          this.session = null;
        }
        this.cb.onLobby(this.lobby);
        break;
      }
      case 'ev':
        this.session?.onEvents(m.tick, m.events);
        break;
      case 'results':
        if (this.session) {
          this.session.setResults(m);
          this.lastResults = this.session.results();
        } else this.lastResults = { ...m, personal: null };
        if (this.lastResults) this.cb.onResults(this.lastResults);
        break;
      case 'progress':
        this.session?.setPersonal(m.result);
        if (this.lastResults) this.lastResults.personal = m.result;
        void this.refreshProfile().catch(() => {});
        this.cb.onProgress();
        break;
      case 'error':
        this.cb.onError(m.message, m.code === 'unauthorized' || m.code === 'room_not_found' || m.code === 'room_full' || m.code === 'version_mismatch');
        break;
      case 'kicked':
        this.cb.onError('Отключено сервером.', true);
        break;
      default:
        break;
    }
  }

  setReady(r: boolean): void {
    this.conn?.send({ type: 'ready', ready: r });
  }
  startMatch(): void {
    this.conn?.send({ type: 'start' });
  }
  setMap(mapId: MapId): void {
    this.conn?.send({ type: 'map', mapId });
  }
  rematch(): void {
    this.conn?.send({ type: 'rematch' });
  }

  async leave(): Promise<void> {
    this.conn?.send({ type: 'leave' });
    this.cleanup();
    this.cb.onLeft();
  }

  private closeConn() {
    if (this.conn) this.conn.close();
    this.conn = null;
  }

  private cleanup() {
    this.closeConn();
    this.session = null;
    this.roomId = null;
    this.lobby = null;
  }
}
