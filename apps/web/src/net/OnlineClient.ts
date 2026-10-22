/**
 * Online flow controller: authentication (Telegram initData or dev login), room creation/quick
 * match/invites over HTTP, the game WebSocket, lobby state and the OnlineSession lifecycle.
 */
import type { AvatarId, CharacterId, GameMode, InviteInfo, Inventory, Loadout, MapId, MatchConfig, MatchPhase, ModId, PublicProfile, RosterEntry, ServerMessage, ShopKind, Team, WeaponId } from '@blatkom/shared';
import { latinName } from '@blatkom/shared';
import { Api, ApiError } from './api.js';
import { readLoginReturn } from './oauth.js';
import { captureReferral, clearReferral, pendingReferral } from './referral.js';
import type { LoginReturn, ProvidersInfo } from './oauth.js';
import { GameConnection } from './GameConnection.js';
import { SocialClient } from './SocialClient.js';
import { OnlineSession } from '../game/session/OnlineSession.js';
import type { ResultsData } from '../game/session/types.js';
import { tg, telegramUserName } from '../telegram/tg.js';
import { storageGet, storageSet } from '../app/settings.js';
import { analytics } from '../analytics/client.js';
import { t } from '../i18n/index.js';
import { errorText } from './errors.js';

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
  /** The game mode (the host switches it). */
  mode: GameMode;
  /** People the host needs to start (1 when the lineup fills up at kick-off). */
  minToStart: number;
  /** The room's win limits (from the server's match rules). */
  limits?: { teamScoreLimit: number; captureLimit: number; baseScoreLimit: number };
}

/** A line of the room chat as the client keeps it (system: a local notice such as «not so fast»). */
export type ChatLine = Omit<Extract<ServerMessage, { type: 'chat' }>, 'type'> & { mine: boolean; system?: boolean };

export interface OnlineCallbacks {
  /** A chat line arrived (lobby, match, results). */
  onChat?(line: ChatLine): void;
  onLobby(s: LobbyState): void;
  onMatchStart(session: OnlineSession): void;
  onResults(r: ResultsData): void;
  onProgress(): void;
  onError(message: string, fatal: boolean): void;
  onLeft(): void;
}

const TOKEN_KEY = 'blatkom89.token';
const DEVICE_KEY = 'blatkom89.device';
/** Signed in with email on this browser: when the session expires, ask for the password instead of creating a guest. */
const EMAIL_MODE_KEY = 'blatkom89.email-account';
/** v0.3: this browser signs in through a provider (google, telegram…): when that session runs out, the welcome window offers it again. */
const PROVIDER_MODE_KEY = 'blatkom89.provider-account';
/** Anonymous per-browser id for the visitor funnel (no other data). */
const VISITOR_KEY = 'blatkom89.visitor';
const VISIT_DAY_KEY = 'blatkom89.visit-day';
/** Free hosting (e.g. Render) sleeps after ~15 min without HTTP traffic — ping while in a room. */
const KEEPALIVE_MS = 4 * 60_000;

export class OnlineClient {
  readonly api = new Api();
  private me: PublicProfile | null = null;
  /** V2.0: a profile read paid $BLAT for levels (the welcome, levels reached before $BLAT) — say so once. */
  onBlatCredited: ((amount: number, level: number) => void) | null = null;
  get profile(): PublicProfile | null {
    return this.me;
  }
  set profile(p: PublicProfile | null) {
    const credited = p?.blatCredited ?? 0;
    this.me = p && credited ? { ...p, blatCredited: 0 } : p;
    if (p && credited > 0) this.onBlatCredited?.(credited, p.level);
  }
  /** Friends, presence, private messages, invitations (opened once signed in). */
  readonly social = new SocialClient(this.api, () => this.profile?.id ?? null);
  /** Friends invited from the current room (id → when), so the lobby shows «Invited ✓». */
  readonly invited = new Map<string, number>();
  /** The current room's chat (the last 60 lines) and the room it belongs to. */
  chatLines: ChatLine[] = [];
  chatRoomId: string | null = null;
  /** Wallet, owned items and loadout (refreshed after purchases and matches). */
  inventory: Inventory | null = null;
  /** Called when the stored email session has expired and the player has to sign in again. */
  onEmailSessionExpired: ((email: string) => void) | null = null;
  /** v0.3: what came back from a provider in the address (read once, the address cleaned). */
  private loginReturn: LoginReturn | null = null;
  /** v0.3: how that sign-in went, for the menu to say so (taken once by `takeLoginOutcome`). */
  private loginOutcome: { ok: true; provider: string; linked: boolean; isNew: boolean } | { ok: false; reason: string } | null = null;
  /** v0.3: the providers this server offers (loaded once). */
  private providersInfo: Promise<ProvidersInfo | null> | null = null;
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
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  lastResults: ResultsData | null = null;

  constructor(private readonly cb: OnlineCallbacks) {
    // inside the Mini App Telegram signs the player in; elsewhere a provider may have just sent them back
    if (!tg()) this.loginReturn = readLoginReturn();
    // V2.0: a referral link (?ref=) — kept until the first sign-in from this browser
    captureReferral();
  }

  /** The sign-in that just came back from a provider: shown once in the menu. */
  takeLoginOutcome() {
    const o = this.loginOutcome;
    this.loginOutcome = null;
    return o;
  }

  /** Google, Facebook, Discord, Reddit and Telegram on the website — the ones set up on this server. */
  providers(): Promise<ProvidersInfo | null> {
    if (!this.providersInfo) this.providersInfo = this.api.providers().catch(() => null);
    return this.providersInfo;
  }

  ensureAuth(): Promise<PublicProfile> {
    if (this.profile && this.api.token) return Promise.resolve(this.profile);
    if (!this.authPromise) this.authPromise = this.doAuth().finally(() => (this.authPromise = null));
    return this.authPromise;
  }

  private async doAuth(): Promise<PublicProfile> {
    const app = tg();
    const back = this.loginReturn;
    this.loginReturn = null;
    if (!app && back) {
      const signedIn = await this.finishProviderLogin(back);
      if (signedIn) return signedIn;
    }
    if (app) {
      const res = await this.api.authTelegram(app.initData, storageGet(VISITOR_KEY) ?? undefined, pendingReferral() ?? undefined);
      clearReferral();
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
      } catch (e) {
        this.api.token = null;
        // a provider's account on this browser: the new guest's welcome window offers that provider again
        if (storageGet(PROVIDER_MODE_KEY) && e instanceof ApiError && e.status === 401) {
          storageSet(PROVIDER_MODE_KEY, null);
          storageSet('blatkom89.welcome.v1', null);
        }
        // an email account on this browser: never silently replace it with a fresh guest
        const email = storageGet(EMAIL_MODE_KEY);
        if (email && e instanceof ApiError && e.status === 401) {
          this.onEmailSessionExpired?.(email);
          throw new Error(t('Session expired — sign in with your email again.'));
        }
      }
    }
    // guest account bound to this browser: a random device secret (the server keeps only its HMAC)
    let device = storageGet(DEVICE_KEY);
    if (!device || !/^[A-Za-z0-9_-]{20,64}$/.test(device)) {
      device = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      storageSet(DEVICE_KEY, device);
    }
    // v0.3: aliases are Latin — a Telegram name is transliterated («Влад» → «Vlad»)
    const fallback = `Comrade_${device.slice(0, 3).toUpperCase()}`;
    const name = latinName(telegramUserName() ?? '', fallback);
    try {
      const res = await this.api.authGuest(name, device, storageGet(VISITOR_KEY) ?? undefined, pendingReferral() ?? undefined);
      clearReferral();
      this.setToken(res.token);
      storageSet(TOKEN_KEY, res.token);
      this.profile = res.profile;
      return res.profile;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) throw new Error(t('On this server you can only sign in through Telegram. Open the game from the bot.'));
      throw e;
    }
  }

  /**
   * A provider sent the player back: the one-time code (or Telegram's signed data, with the session of
   * the account the page was on, so that account gets Telegram attached) is traded for a session.
   */
  private async finishProviderLogin(back: LoginReturn): Promise<PublicProfile | null> {
    if (back.kind === 'error') {
      this.loginOutcome = { ok: false, reason: back.reason };
      return null;
    }
    try {
      let res;
      if (back.kind === 'oauth') res = await this.api.oauthFinish(back.code);
      else {
        const saved = storageGet(TOKEN_KEY);
        this.api.token = saved && saved.length >= 16 ? saved : null;
        res = await this.api.telegramWebLogin(back.data);
      }
      this.setToken(res.token);
      storageSet(TOKEN_KEY, res.token);
      storageSet(PROVIDER_MODE_KEY, res.provider);
      this.profile = res.profile;
      this.inventory = null;
      this.loginOutcome = { ok: true, provider: res.provider, linked: res.linked, isNew: res.isNew };
      return res.profile;
    } catch (e) {
      this.api.token = null;
      this.loginOutcome = { ok: false, reason: e instanceof ApiError && e.code === 'login_expired' ? 'expired' : 'failed' };
      return null;
    }
  }

  /** Drops the locally stored session token and device id (used after account deletion). */
  forgetLocalSession(): void {
    storageSet(TOKEN_KEY, null);
    storageSet(DEVICE_KEY, null);
    storageSet(EMAIL_MODE_KEY, null);
    storageSet(PROVIDER_MODE_KEY, null);
    this.social.stop();
    this.api.token = null;
    this.profile = null;
    this.inventory = null;
  }

  /** Once a day per browser: an anonymous visit for the admin funnel (before any sign-up). */
  pingVisit(): void {
    const day = new Date().toISOString().slice(0, 10);
    if (storageGet(VISIT_DAY_KEY) === day) return;
    let vid = storageGet(VISITOR_KEY);
    if (!vid || !/^[A-Za-z0-9_-]{16,64}$/.test(vid)) {
      vid = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
      storageSet(VISITOR_KEY, vid);
    }
    let ref: string | undefined;
    try {
      ref = document.referrer && new URL(document.referrer).host !== location.host ? document.referrer.slice(0, 120) : undefined;
    } catch {
      ref = undefined;
    }
    void this.api
      .visit(vid, ref)
      .then(() => storageSet(VISIT_DAY_KEY, day))
      .catch(() => {});
  }

  // ── email account ───────────────────────────────────────────────────────
  /** Signs in to an existing account by email (this browser switches to it). */
  async loginEmail(email: string, password: string): Promise<PublicProfile> {
    const res = await this.api.loginEmail(email, password);
    this.setToken(res.token);
    storageSet(TOKEN_KEY, res.token);
    storageSet(EMAIL_MODE_KEY, res.profile.email ?? email);
    this.profile = res.profile;
    this.inventory = null;
    return res.profile;
  }

  async linkEmail(email: string, password: string): Promise<PublicProfile> {
    await this.ensureAuth();
    this.profile = await this.api.linkEmail(email, password);
    storageSet(EMAIL_MODE_KEY, this.profile.email ?? email);
    return this.profile;
  }

  // ── economy ─────────────────────────────────────────────────────────────
  async loadInventory(): Promise<Inventory> {
    await this.ensureAuth();
    this.inventory = await this.api.inventory();
    return this.inventory;
  }

  private applyInventory(inv: Inventory, loadoutChanged: boolean): Inventory {
    this.inventory = inv;
    if (this.profile) this.profile = { ...this.profile, tokens: inv.tokens, diamonds: inv.diamonds };
    // tell the room to re-read the loadout (applies from the next spawn)
    if (loadoutChanged) this.conn?.send({ type: 'loadout' });
    return inv;
  }

  async buy(kind: ShopKind, id: string): Promise<Inventory> {
    return this.applyInventory(await this.api.buy(kind, id), kind !== 'character');
  }

  async buyMod(weapon: WeaponId, mod: ModId): Promise<Inventory> {
    return this.applyInventory(await this.api.buyMod(weapon, mod), true);
  }

  async openCase() {
    const r = await this.api.openCase();
    this.applyInventory(r.inventory, true);
    return r;
  }

  /** The skin case: a new skin goes on its weapon at once when the weapon wore none (the room re-reads it). */
  async openSkinCase() {
    const r = await this.api.openSkinCase();
    this.applyInventory(r.inventory, true);
    return r;
  }

  async setLoadout(l: Loadout): Promise<Inventory> {
    return this.applyInventory(await this.api.setLoadout(l), true);
  }

  private setToken(token: string) {
    this.api.token = token;
    analytics.setToken(token);
    this.social.start(token);
  }

  /** The room this browser is connected to (lobby or match). */
  currentRoomId(): string | null {
    return this.conn ? this.roomId : null;
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

  /** Profile avatar (null removes it); other players see it in rooms joined from now on. */
  async setAvatar(avatar: AvatarId | null): Promise<void> {
    await this.ensureAuth();
    this.profile = await this.api.updateMe({ avatar });
  }

  async quickMatch(c: CharacterId, mode: GameMode = 'ffa'): Promise<void> {
    await this.ensureAuth();
    const r = await this.api.quickMatch(undefined, mode);
    this.inviteUrl = null;
    await this.joinRoom(r.roomId, c);
  }

  async createRoom(mapId: MapId, c: CharacterId, mode: GameMode = 'ffa'): Promise<void> {
    await this.ensureAuth();
    const r = await this.api.createRoom(mapId, true, mode);
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
    if (this.chatRoomId !== roomId) {
      this.chatLines = [];
      this.chatRoomId = roomId;
    }
    this.roomId = roomId;
    this.invited.clear();
    const conn = new GameConnection(
      {
        onMessage: (m) => this.onMessage(m),
        onSnapshot: (s, at) => this.session?.onSnapshot(s, at),
        onStatus: (st, reason) => {
          if (this.session) this.session.status = st === 'open' ? 'online' : st === 'reconnecting' || st === 'connecting' ? 'reconnecting' : 'lost';
          if (st === 'closed' && reason !== 'user' && this.conn === conn) {
            const msg = reason === 'room_full' ? t('The room is full.') : reason === 'room not found' ? t('Room not found.') : reason === 'replaced' ? t('You connected from another device.') : t('Lost the line to the server.');
            this.cleanup();
            this.cb.onError(msg, true);
          }
        },
      },
      { token: this.api.token!, roomId, character: c },
    );
    this.conn = conn;
    conn.connect();
    this.startKeepAlive();
  }

  private startKeepAlive() {
    if (this.keepAlive) return;
    this.keepAlive = setInterval(() => {
      if (!this.conn) return this.stopKeepAlive();
      void fetch('api/health', { cache: 'no-store' }).catch(() => {});
    }, KEEPALIVE_MS);
  }

  private stopKeepAlive() {
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
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
          mode: m.mode,
          minToStart: m.minToStart ?? this.config?.minPlayers ?? 2,
          ...(this.config ? { limits: { teamScoreLimit: this.config.teamScoreLimit, captureLimit: this.config.captureLimit, baseScoreLimit: this.config.baseScoreLimit } } : {}),
        };
        if (this.session) this.session.setRoster(m.players);
        const inMatch = m.phase === 'ready' || m.phase === 'countdown' || m.phase === 'active';
        if (inMatch && !this.session && this.config && this.conn) {
          // the host may have switched the mode after we joined: the roster carries the current one
          this.session = new OnlineSession(this.conn, this.mapId, this.slot, this.playerId, { ...this.config, mode: m.mode }, this.roster);
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
        } else {
          const { mode, teams, ...rest } = m;
          this.lastResults = { ...rest, personal: null, gameMode: mode, ...(teams ? { teams } : {}) };
        }
        if (this.lastResults) this.cb.onResults(this.lastResults);
        break;
      case 'progress':
        this.session?.setPersonal(m.result);
        if (this.lastResults) this.lastResults.personal = m.result;
        void this.refreshProfile().catch(() => {});
        this.cb.onProgress();
        break;
      case 'error':
        if (m.code === 'chat_rate') {
          this.pushChat({ id: '', name: '', slot: -1, team: null, text: errorText(m.code, m.message), toTeam: false, at: Date.now(), mine: true, system: true });
          break;
        }
        this.cb.onError(errorText(m.code, m.message), m.code === 'unauthorized' || m.code === 'room_not_found' || m.code === 'room_full' || m.code === 'version_mismatch');
        break;
      case 'kicked':
        this.cb.onError(t('Disconnected by the server.'), true);
        break;
      case 'chat': {
        const { type: _type, ...line } = m;
        this.pushChat({ ...line, mine: m.id === this.playerId });
        break;
      }
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
  setMode(mode: GameMode): void {
    this.conn?.send({ type: 'mode', mode });
  }
  setTeam(team: Team): void {
    this.conn?.send({ type: 'team', team });
  }
  rematch(): void {
    this.conn?.send({ type: 'rematch' });
  }
  private pushChat(line: ChatLine) {
    this.chatLines.push(line);
    if (this.chatLines.length > 60) this.chatLines.splice(0, this.chatLines.length - 60);
    this.cb.onChat?.(line);
  }
  /** A chat line to the room (team: only to your own team in team modes). */
  sendChat(text: string, team = false): void {
    this.conn?.send({ type: 'chat', text: text.slice(0, 400), ...(team ? { team: true } : {}) });
  }
  /** In a room right now (lobby, match or results). */
  inRoom(): boolean {
    return this.conn !== null;
  }

  async leave(): Promise<void> {
    this.conn?.send({ type: 'leave' });
    this.cleanup();
    this.cb.onLeft();
  }

  private closeConn() {
    if (this.conn) this.conn.close();
    this.conn = null;
    this.stopKeepAlive();
  }

  private cleanup() {
    this.closeConn();
    this.session = null;
    this.roomId = null;
    this.lobby = null;
    this.invited.clear();
    this.chatLines = [];
    this.chatRoomId = null;
  }
}
