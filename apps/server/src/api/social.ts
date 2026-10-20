/**
 * Friends, direct messages, room invitations and the Top-100 leaderboard. Live delivery goes through
 * the social hub (`/ws/social`); these routes are the source of truth. Only friends can write to each
 * other or send invitations; every action is rate-limited per player.
 */
import { DirectMessageBody, FriendRequestBody, InviteFriendBody, LEADERBOARD_BY } from '@blatkom/shared';
import type { FriendEntry, FriendsResponse, LeaderboardBy, LeaderboardEntry, LeaderboardResponse, MessagesResponse } from '@blatkom/shared';
import type { RouteModule } from '../app.js';
import { HttpError } from '../http/router.js';
import { requireUser, currentUser } from '../http/auth.js';
import { RateLimiter, rateLimit } from '../security/rateLimit.js';
import { SocialRepo } from '../social/repo.js';
import { SocialHub } from '../social/hub.js';
import type { Ctx } from '../http/router.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEADERBOARD_CACHE_MS = 30_000;

export const registerSocialRoutes: RouteModule = (router, deps) => {
  const auth = requireUser(deps.services.sessions);
  const hub = deps.social ?? new SocialHub(deps.rooms, deps.log);
  const byUser = (ctx: Ctx) => currentUser(ctx).userId;
  const requestLimiter = new RateLimiter(20, 20 / 60);
  const messageLimiter = new RateLimiter(30, 30 / 60);
  const inviteLimiter = new RateLimiter(10, 10 / 60);
  const readLimiter = new RateLimiter(120, 2);
  const repo = () => {
    if (!deps.sql) throw new HttpError(503, 'persistence_unavailable', 'The service is temporarily unavailable');
    return new SocialRepo(deps.sql);
  };
  if (deps.sql) {
    const store = new SocialRepo(deps.sql);
    const sql = deps.sql;
    hub.attachStore({ friendIds: (id) => store.friendIds(id), counts: (id) => store.counts(id), touch: async (id) => void (await sql`UPDATE users SET last_seen_at = now() WHERE id = ${id}`) });
  }
  const param = (ctx: Ctx) => {
    const id = ctx.params.id ?? '';
    if (!UUID.test(id)) throw new HttpError(400, 'bad_id', 'Invalid player id');
    return id;
  };
  const withPresence = (f: Omit<FriendEntry, 'status'>): FriendEntry => ({ ...f, status: hub.status(f.id) });

  router.get('/api/friends', auth, rateLimit(readLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const l = await repo().lists(me.userId);
    const res: FriendsResponse = { friends: l.friends.map(withPresence), incoming: l.incoming, outgoing: l.outgoing };
    ctx.json(200, res);
  });

  router.post('/api/friends/request', auth, rateLimit(requestLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const body = await ctx.body(FriendRequestBody, 2 * 1024);
    const r = repo();
    const { outcome, other } = await r.request(me.userId, body.name);
    switch (outcome) {
      case 'not_found':
        throw new HttpError(404, 'player_not_found', 'No player with that alias');
      case 'self':
        throw new HttpError(400, 'self', 'That’s your own alias');
      case 'already_friends':
        throw new HttpError(409, 'already_friends', 'You are already friends');
      case 'already_sent':
        throw new HttpError(409, 'already_sent', 'The request has already been sent');
      case 'too_many':
        throw new HttpError(409, 'too_many_friends', 'Too many friends or requests — remove some first');
    }
    const mine = (await r.card(me.userId))!;
    if (outcome === 'sent') {
      hub.push(other!.id, { type: 'friend_request', from: { ...mine, createdAt: new Date().toISOString() } });
      return ctx.json(200, { result: 'sent', player: other });
    }
    // they had asked me first: friends now, both sides learn it at once
    hub.push(other!.id, { type: 'friend_accepted', friend: { ...mine, status: hub.status(me.userId), lastSeenAt: new Date().toISOString(), unread: 0 } });
    void hub.announce(me.userId);
    ctx.json(200, { result: 'accepted', player: other, friend: { ...other!, status: hub.status(other!.id), lastSeenAt: null, unread: 0 } });
  });

  router.post('/api/friends/:id/accept', auth, rateLimit(requestLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const from = param(ctx);
    const r = repo();
    if (!(await r.accept(me.userId, from))) throw new HttpError(404, 'request_not_found', 'This request no longer exists');
    const mine = (await r.card(me.userId))!;
    const theirs = await r.card(from);
    hub.push(from, { type: 'friend_accepted', friend: { ...mine, status: hub.status(me.userId), lastSeenAt: new Date().toISOString(), unread: 0 } });
    ctx.json(200, { friend: theirs ? { ...theirs, status: hub.status(from), lastSeenAt: null, unread: 0 } : null });
  });

  router.delete('/api/friends/:id', auth, rateLimit(requestLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const other = param(ctx);
    if (!(await repo().remove(me.userId, other))) throw new HttpError(404, 'request_not_found', 'This request no longer exists');
    hub.push(other, { type: 'friend_removed', userId: me.userId });
    ctx.json(200, { ok: true });
  });

  router.get('/api/messages/:id', auth, rateLimit(readLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const friend = param(ctx);
    const r = repo();
    if (!(await r.areFriends(me.userId, friend))) throw new HttpError(403, 'not_friends', 'You can only write to your friends');
    const before = Number(ctx.query.get('before') ?? 0);
    const res: MessagesResponse = await r.conversation(me.userId, friend, Number.isSafeInteger(before) && before > 0 ? before : null);
    ctx.json(200, res);
  });

  router.post('/api/messages/:id', auth, rateLimit(messageLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const friend = param(ctx);
    const body = await ctx.body(DirectMessageBody, 4 * 1024);
    const r = repo();
    if (!(await r.areFriends(me.userId, friend))) throw new HttpError(403, 'not_friends', 'You can only write to your friends');
    const message = await r.send(me.userId, friend, body.text);
    const from = (await r.card(me.userId))!;
    hub.push(friend, { type: 'dm', message, from });
    // my other windows see it too
    hub.push(me.userId, { type: 'dm', message, from });
    ctx.json(200, { message });
  });

  router.post('/api/messages/:id/read', auth, rateLimit(readLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const friend = param(ctx);
    const upTo = await repo().markRead(me.userId, friend);
    if (upTo > 0) hub.push(friend, { type: 'dm_read', by: me.userId, upTo });
    ctx.json(200, { upTo });
  });

  router.post('/api/friends/:id/invite', auth, rateLimit(inviteLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const friend = param(ctx);
    const body = await ctx.body(InviteFriendBody, 1024);
    const r = repo();
    if (!(await r.areFriends(me.userId, friend))) throw new HttpError(403, 'not_friends', 'You can only invite your friends');
    const room = deps.rooms.get(body.roomId);
    if (!room || !room.hasPerson(me.userId)) throw new HttpError(409, 'not_in_room', 'Invite from the room you are in');
    if (room.hasPerson(friend)) throw new HttpError(409, 'already_in_room', 'Your friend is already in this room');
    const from = (await r.card(me.userId))!;
    const delivered = hub.push(friend, { type: 'invite', invite: { from, roomId: room.id, mode: room.mode, mapId: room.mapId, isPrivate: room.isPrivate, at: new Date().toISOString() } });
    deps.services.analytics.server('invite_created', { code: 'friend', roomId: room.id }, me);
    ctx.json(200, { delivered });
  });

  // ── Top-100 ─────────────────────────────────────────────────────────────
  const cache = new Map<LeaderboardBy, { at: number; entries: LeaderboardEntry[] }>();
  router.get('/api/leaderboard', auth, rateLimit(readLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const raw = ctx.query.get('by') ?? 'rating';
    const by = (LEADERBOARD_BY as readonly string[]).includes(raw) ? (raw as LeaderboardBy) : 'rating';
    const r = repo();
    let hit = cache.get(by);
    if (!hit || Date.now() - hit.at > LEADERBOARD_CACHE_MS) {
      hit = { at: Date.now(), entries: await r.leaderboard(by) };
      cache.set(by, hit);
    }
    const res: LeaderboardResponse = { by, entries: hit.entries, me: await r.standing(by, me.userId), updatedAt: new Date(hit.at).toISOString() };
    ctx.json(200, res);
  });
};
