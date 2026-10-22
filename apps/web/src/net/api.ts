/** HTTP API client (same origin). Never handles secrets other than the player's own session token. */
import type {
  AuthResponse,
  BlatResponse,
  BlatDropInfo,
  AvatarId,
  CreateRoomResponse,
  InviteInfo,
  MapId,
  PublicProfile,
  CharacterId,
  GameMode,
  MatchHistoryResponse,
  AchievementsResponse,
  Inventory,
  ShopConfig,
  CaseResult,
  SkinCaseResult,
  CheckoutResponse,
  PaymentStatusResponse,
  LedgerEntry,
  Loadout,
  ModId,
  ShopKind,
  WeaponId,
  FriendsResponse,
  FriendEntry,
  FriendRequestResult,
  PlayerCard,
  DirectMessage,
  MessagesResponse,
  LeaderboardBy,
  LeaderboardResponse,
  NameCheckResponse,
  ClubDetails,
  ClubsResponse,
  CreateClubBody,
  UpdateClubBody,
} from '@blatkom/shared';
import { platform } from '../telegram/tg.js';
import { VERSION } from '../app/config.js';
import { errorText } from './errors.js';

/** A refused API call: `code` is stable, `message` is already in the player's language. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class Api {
  token: string | null = null;

  async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(path.replace(/^\//, ''), {
        method,
        headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, 'network', errorText('network'));
    }
    if (res.status === 204) return undefined as T;
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON */
    }
    if (!res.ok) {
      const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
      const code = err?.code ?? `http_${res.status}`;
      throw new ApiError(res.status, code, errorText(code, err?.message ?? null, res.status));
    }
    return data as T;
  }

  authTelegram(initData: string, visitorId?: string, ref?: string) {
    return this.req<AuthResponse>('POST', '/api/auth/telegram', { initData, platform: platform(), clientVersion: VERSION, ...(visitorId ? { visitorId } : {}), ...(ref ? { ref } : {}) });
  }
  /** Public website: device-bound guest account (the server stores only an HMAC of `deviceId`). */
  authGuest(name: string, deviceId: string, visitorId?: string, ref?: string) {
    return this.req<AuthResponse>('POST', '/api/auth/guest', { name, deviceId, platform: platform(), clientVersion: VERSION, ...(visitorId ? { visitorId } : {}), ...(ref ? { ref } : {}) });
  }
  /** V2.0: $BLAT — balance, history, level rewards, the referral programme. */
  blat() {
    return this.req<BlatResponse>('GET', '/api/blat');
  }
  /** V2.0 part C: the BLAT DROP announcement date and the server's clock. */
  blatDrop() {
    return this.req<BlatDropInfo>('GET', '/api/blat/drop');
  }
  /** Anonymous «opened the site» ping for the admin funnel (random per-browser id only). */
  visit(visitorId: string, referrer?: string) {
    return this.req<void>('POST', '/api/visit', { visitorId, platform: platform(), ...(referrer ? { referrer } : {}) });
  }
  // ── email sign-in ───────────────────────────────────────────────────────
  loginEmail(email: string, password: string) {
    return this.req<AuthResponse>('POST', '/api/auth/email/login', { email, password, platform: platform(), clientVersion: VERSION });
  }
  linkEmail(email: string, password: string) {
    return this.req<PublicProfile>('POST', '/api/auth/email/link', { email, password });
  }
  changePassword(current: string, password: string) {
    return this.req<{ ok: true }>('POST', '/api/auth/email/password', { current, password });
  }
  resetRequest(email: string) {
    return this.req<{ ok: true }>('POST', '/api/auth/email/reset-request', { email });
  }
  resetConfirm(token: string, password: string) {
    return this.req<{ ok: true }>('POST', '/api/auth/email/reset', { token, password });
  }
  // ── economy ─────────────────────────────────────────────────────────────
  shopConfig() {
    return this.req<ShopConfig>('GET', '/api/shop/config');
  }
  inventory() {
    return this.req<Inventory>('GET', '/api/me/inventory');
  }
  ledger() {
    return this.req<{ entries: LedgerEntry[] }>('GET', '/api/me/ledger?limit=30');
  }
  buy(kind: ShopKind, id: string) {
    return this.req<Inventory>('POST', '/api/shop/buy', { kind, id });
  }
  /** Buys a modification for one weapon (tokens); the server equips it right away. */
  buyMod(weapon: WeaponId, mod: ModId) {
    return this.req<Inventory>('POST', '/api/shop/mod', { weapon, mod });
  }
  openCase() {
    return this.req<CaseResult>('POST', '/api/shop/case', { confirmAge: true });
  }
  /** The skin case (v0.23): a weapon skin not owned yet. */
  openSkinCase() {
    return this.req<SkinCaseResult>('POST', '/api/shop/skin-case', { confirmAge: true });
  }
  setLoadout(l: Loadout) {
    return this.req<Inventory>('POST', '/api/me/loadout', { sidearm: l.sidearm, melee: l.melee, primary: l.primary, gadget: l.gadget, mods: l.mods, skins: l.skins ?? {} });
  }
  checkout(packId: string, method: 'card' | 'crypto') {
    return this.req<CheckoutResponse>('POST', '/api/pay/checkout', { packId, method });
  }
  paymentStatus(id: string) {
    return this.req<PaymentStatusResponse>('GET', `/api/pay/${encodeURIComponent(id)}`);
  }
  logout() {
    return this.req<void>('POST', '/api/auth/logout', {});
  }
  me() {
    return this.req<PublicProfile>('GET', '/api/me');
  }
  updateMe(patch: { displayName?: string; preferredCharacter?: CharacterId; avatar?: AvatarId | null }) {
    return this.req<PublicProfile>('PATCH', '/api/me', patch);
  }
  history() {
    return this.req<MatchHistoryResponse>('GET', '/api/me/history');
  }
  achievements() {
    return this.req<AchievementsResponse>('GET', '/api/me/achievements');
  }
  deleteAccount() {
    return this.req<void>('DELETE', '/api/me');
  }
  createRoom(mapId: MapId, isPrivate: boolean, mode: GameMode = 'ffa') {
    return this.req<CreateRoomResponse>('POST', '/api/rooms', { mapId, isPrivate, mode });
  }
  quickMatch(mapId?: MapId, mode: GameMode = 'ffa') {
    return this.req<{ roomId: string; mapId: MapId; mode: GameMode }>('POST', '/api/rooms/quick', mapId ? { mapId, mode } : { mode });
  }
  invite(code: string) {
    return this.req<InviteInfo>('GET', `/api/invites/${encodeURIComponent(code)}`);
  }
  // ── aliases, friends, messages, Top-100 ─────────────────────────────────
  /** Is an alias free (and a few free variants when it is not)? */
  checkName(name: string) {
    return this.req<NameCheckResponse>('GET', `/api/names/check?name=${encodeURIComponent(name)}`);
  }
  friends() {
    return this.req<FriendsResponse>('GET', '/api/friends');
  }
  /** A friend request by alias; when they had asked me first, we are friends at once. */
  friendRequest(name: string) {
    return this.req<{ result: FriendRequestResult; player: PlayerCard; friend?: FriendEntry }>('POST', '/api/friends/request', { name });
  }
  acceptFriend(id: string) {
    return this.req<{ friend: FriendEntry | null }>('POST', `/api/friends/${encodeURIComponent(id)}/accept`, {});
  }
  /** Declines or cancels a request, or ends a friendship. */
  removeFriend(id: string) {
    return this.req<{ ok: true }>('DELETE', `/api/friends/${encodeURIComponent(id)}`);
  }
  messages(id: string, before?: number) {
    return this.req<MessagesResponse>('GET', `/api/messages/${encodeURIComponent(id)}${before ? `?before=${before}` : ''}`);
  }
  sendMessage(id: string, text: string) {
    return this.req<{ message: DirectMessage }>('POST', `/api/messages/${encodeURIComponent(id)}`, { text });
  }
  readMessages(id: string) {
    return this.req<{ upTo: number }>('POST', `/api/messages/${encodeURIComponent(id)}/read`, {});
  }
  /** Invites a friend to the room I am in (delivered: the friend has the game open). */
  inviteFriend(id: string, roomId: string) {
    return this.req<{ delivered: boolean }>('POST', `/api/friends/${encodeURIComponent(id)}/invite`, { roomId });
  }
  leaderboard(by: LeaderboardBy) {
    return this.req<LeaderboardResponse>('GET', `/api/leaderboard?by=${by}`);
  }

  // ── sign-in with a provider (v0.3) ──
  providers() {
    return this.req<import('./oauth.js').ProvidersInfo>('GET', '/api/auth/providers');
  }
  oauthIntent() {
    return this.req<{ intent: string }>('POST', '/api/auth/oauth/intent', {});
  }
  oauthFinish(code: string) {
    return this.req<AuthResponse & { linked: boolean; provider: string }>('POST', '/api/auth/oauth/finish', { code, platform: platform(), clientVersion: VERSION });
  }
  telegramWebLogin(data: Record<string, string | number>) {
    return this.req<AuthResponse & { linked: boolean; provider: string }>('POST', '/api/auth/telegram/web', { data, platform: platform(), clientVersion: VERSION });
  }

  // ── clubs (v0.3) ──
  clubs(q?: string) {
    return this.req<ClubsResponse>('GET', `/api/clubs${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  }
  club(id: string) {
    return this.req<ClubDetails>('GET', `/api/clubs/${encodeURIComponent(id)}`);
  }
  createClub(body: CreateClubBody) {
    return this.req<ClubDetails>('POST', '/api/clubs', body);
  }
  updateClub(id: string, body: UpdateClubBody) {
    return this.req<ClubDetails>('PATCH', `/api/clubs/${encodeURIComponent(id)}`, body);
  }
  setClubRecruiting(id: string, recruiting: boolean) {
    return this.req<ClubDetails>('POST', `/api/clubs/${encodeURIComponent(id)}/recruiting`, { recruiting });
  }
  requestClub(id: string) {
    return this.req<ClubDetails>('POST', `/api/clubs/${encodeURIComponent(id)}/request`, {});
  }
  cancelClubRequest(id: string) {
    return this.req<ClubDetails>('DELETE', `/api/clubs/${encodeURIComponent(id)}/request`);
  }
  answerClubRequest(id: string, userId: string, accept: boolean) {
    return this.req<ClubDetails>('POST', `/api/clubs/${encodeURIComponent(id)}/requests/${encodeURIComponent(userId)}`, { accept });
  }
  kickFromClub(id: string, userId: string) {
    return this.req<ClubDetails>('POST', `/api/clubs/${encodeURIComponent(id)}/kick/${encodeURIComponent(userId)}`, {});
  }
  leaveClub() {
    return this.req<{ left: string; closed: boolean }>('POST', '/api/clubs/leave', {});
  }
  disbandClub(id: string) {
    return this.req<{ disbanded: string }>('DELETE', `/api/clubs/${encodeURIComponent(id)}`);
  }
}
