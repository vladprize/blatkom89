/**
 * Clubs (v0.3): the table, a club's page, founding, join requests and the head's answers, leaving,
 * showing out, disbanding. Live notices go through the social hub (`/ws/social`): a head hears about a
 * request, a player about being taken in, turned down or shown out.
 */
import { CreateClubBody, GangBattleBody, KON_RULES, MAP_ORDER, UpdateClubBody, gangBattleRefusal } from '@blatkom/shared';
import type { ClubsResponse, GangBattleRefusal, GangBattleResponse, SocialEvent } from '@blatkom/shared';
import { inviteUrls } from './rooms.js';
import { z } from 'zod';
import type { RouteModule } from '../app.js';
import { HttpError } from '../http/router.js';
import type { Ctx } from '../http/router.js';
import { requireUser, currentUser } from '../http/auth.js';
import { RateLimiter, rateLimit } from '../security/rateLimit.js';
import { ClubError, ClubRepo } from '../clubs/repo.js';
import { SocialRepo } from '../social/repo.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REFUSALS: Record<ClubError['code'], [number, string]> = {
  not_found: [404, 'No such gang'],
  in_club: [409, 'You are already in a gang — leave it first'],
  not_member: [403, 'You are not in this gang'],
  not_head: [403, 'Only the gang’s boss can do that'],
  level: [403, 'Starting a gang needs a higher level'],
  funds: [409, 'Not enough talons to start a gang'],
  name_taken: [409, 'A gang with that name already exists'],
  tag_taken: [409, 'That tag is taken by another gang'],
  full: [409, 'The gang is full'],
  closed: [409, 'The gang isn’t taking anyone right now'],
  already_requested: [409, 'You have already asked to join'],
  too_many_requests: [409, 'You can ask three gangs at a time — wait for an answer or withdraw a request'],
  no_request: [404, 'No such request'],
  house: [403, 'This gang can’t be changed'],
};

export const registerClubRoutes: RouteModule = (router, deps) => {
  const auth = requireUser(deps.services.sessions);
  const byUser = (ctx: Ctx) => currentUser(ctx).userId;
  const readLimiter = new RateLimiter(120, 2);
  const writeLimiter = new RateLimiter(30, 30 / 60);
  const foundLimiter = new RateLimiter(10, 10 / 3600);
  const hub = deps.social ?? null;
  const repo = () => {
    if (!deps.sql) throw new HttpError(503, 'persistence_unavailable', 'The service is temporarily unavailable');
    return new ClubRepo(deps.sql);
  };
  const run = async <T>(f: () => Promise<T>): Promise<T> => {
    try {
      return await f();
    } catch (e) {
      if (e instanceof ClubError) {
        const [status, text] = REFUSALS[e.code];
        throw new HttpError(status, e.code === 'level' ? 'level_required' : e.code === 'funds' ? 'insufficient_funds' : e.code, text);
      }
      throw e;
    }
  };
  const push = (userId: string, ev: SocialEvent) => hub?.push(userId, ev);
  const card = async (userId: string) => (deps.sql ? new SocialRepo(deps.sql).card(userId) : null);

  // the house clubs: their ratings move and their heads answer requests (also between visits)
  let lastHouse = 0;
  const house = async () => {
    if (!deps.sql || Date.now() - lastHouse < 20_000) return;
    lastHouse = Date.now();
    const r = new ClubRepo(deps.sql);
    await r.driftHouse();
    for (const j of await r.answerHouseRequests()) {
      const mine = await r.clubOf(j.userId);
      if (mine) push(j.userId, { type: 'club_joined', club: mine.summary });
    }
  };
  if (deps.sql && deps.env.NODE_ENV !== 'test') {
    const timer = setInterval(() => void house().catch((e: Error) => deps.log.warn('house clubs', { err: e })), 60_000);
    timer.unref();
  }
  const clubId = (ctx: Ctx) => {
    const id = ctx.params.id ?? '';
    if (!UUID.test(id)) throw new HttpError(400, 'bad_id', 'Invalid gang id');
    return id;
  };
  const userParam = (ctx: Ctx) => {
    const id = ctx.params.userId ?? '';
    if (!UUID.test(id)) throw new HttpError(400, 'bad_id', 'Invalid player id');
    return id;
  };

  router.get('/api/clubs', auth, rateLimit(readLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    await house().catch(() => {});
    const r = repo();
    const q = (ctx.query.get('q') ?? '').trim().slice(0, 24);
    const [clubs, mine, requested, incoming] = await Promise.all([q.length >= 2 ? r.search(q) : r.table(), r.clubOf(me.userId), r.requestedBy(me.userId), r.incomingFor(me.userId)]);
    const res: ClubsResponse = { clubs, mine: mine?.summary ?? null, requested, incoming };
    ctx.json(200, res);
  });

  // ── v0.2.17: gang battles — a gang calls another out to a tournament battle ───────────────────────
  const battleLimiter = new RateLimiter(6, 6 / 120);
  const BATTLE_REFUSALS: Record<GangBattleRefusal, [number, (size: number) => string]> = {
    no_gang: [403, () => 'Join a gang first — a battle is gang against gang'],
    own_gang: [409, () => 'That’s your own gang'],
    not_found: [404, () => 'No such gang'],
    too_few: [409, (n) => `Both gangs need at least ${n} people of their own for that battle`],
  };
  router.post('/api/clubs/:id/battle', auth, rateLimit(battleLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const target = clubId(ctx);
    const body = await ctx.body(GangBattleBody, 1024);
    const r = repo();
    const sides = await r.battleSides(me.userId, target);
    const why = gangBattleRefusal({ mine: sides.mine?.card.id ?? null, target: sides.target?.card.id ?? null, targetExists: !!sides.target, mineMembers: sides.mine?.people ?? 0, targetMembers: sides.target?.people ?? 0, format: body.kon });
    if (why || !sides.mine || !sides.target) {
      const [status, text] = BATTLE_REFUSALS[why ?? 'not_found'];
      throw new HttpError(status, why ?? 'not_found', text(KON_RULES[body.kon].size));
    }
    const battle = { red: sides.mine.card, blue: sides.target.card };
    const mapId = body.mapId ?? MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)]!;
    let room;
    try {
      room = deps.rooms.create(mapId, true, me.userId, null, 'teams', body.kon, 0, battle);
    } catch {
      throw new HttpError(503, 'capacity', 'The server is full, try again later');
    }
    const inv = await deps.services.invites.create(room.id, me.userId);
    room.inviteCode = inv.code;
    const urls = inviteUrls(deps.env, inv.code);
    // the call goes to the people of both gangs who are online now (the link works for the others)
    const from = await card(me.userId);
    let told = 0;
    if (from) {
      const at = new Date().toISOString();
      for (const id of await r.peopleOf([battle.red.id, battle.blue.id])) {
        if (id === me.userId) continue;
        if (push(id, { type: 'invite', invite: { from, roomId: room.id, mode: room.mode, mapId: room.mapId, isPrivate: true, at, battle: { ...battle, format: body.kon } } })) told++;
      }
    }
    deps.services.analytics.server('invite_created', { code: inv.code, roomId: room.id, battle: true }, me);
    const res: GangBattleResponse = { roomId: room.id, inviteCode: inv.code, inviteUrl: urls.tg ?? urls.web, webUrl: urls.web, mapId: room.mapId, mode: room.mode, kon: body.kon, stake: 0, battle, told };
    ctx.json(201, res);
  });

  router.get('/api/clubs/:id', auth, rateLimit(readLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    await house().catch(() => {});
    const d = await repo().details(clubId(ctx), me.userId);
    if (!d) throw new HttpError(404, 'not_found', 'No such gang');
    ctx.json(200, d);
  });

  router.post('/api/clubs', auth, rateLimit(writeLimiter, byUser), rateLimit(foundLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const body = await ctx.body(CreateClubBody, 4 * 1024);
    const r = repo();
    const id = await run(() => r.create(me.userId, body));
    deps.log.info('club founded', { clubId: id });
    ctx.json(200, await r.details(id, me.userId));
  });

  router.patch('/api/clubs/:id', auth, rateLimit(writeLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const id = clubId(ctx);
    const body = await ctx.body(UpdateClubBody, 4 * 1024);
    const r = repo();
    await run(() => r.update(id, me.userId, body));
    ctx.json(200, await r.details(id, me.userId));
  });

  router.post('/api/clubs/:id/recruiting', auth, rateLimit(writeLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const id = clubId(ctx);
    const body = await ctx.body(z.object({ recruiting: z.boolean() }).strict(), 1024);
    const r = repo();
    await run(() => r.setRecruiting(id, me.userId, body.recruiting));
    ctx.json(200, await r.details(id, me.userId));
  });

  router.post('/api/clubs/:id/request', auth, rateLimit(writeLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const id = clubId(ctx);
    const r = repo();
    const { headId } = await run(() => r.request(id, me.userId));
    if (headId) {
      const from = await card(me.userId);
      if (from) push(headId, { type: 'club_request', clubId: id, from });
    }
    ctx.json(200, await r.details(id, me.userId));
  });

  router.delete('/api/clubs/:id/request', auth, rateLimit(writeLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const id = clubId(ctx);
    const r = repo();
    await run(() => r.cancelRequest(id, me.userId));
    ctx.json(200, await r.details(id, me.userId));
  });

  router.post('/api/clubs/:id/requests/:userId', auth, rateLimit(writeLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const id = clubId(ctx);
    const who = userParam(ctx);
    const body = await ctx.body(z.object({ accept: z.boolean() }).strict(), 1024);
    const r = repo();
    const { joined } = await run(() => r.answer(id, me.userId, who, body.accept));
    if (joined) {
      const mine = await r.clubOf(who);
      if (mine) push(who, { type: 'club_joined', club: mine.summary });
    } else if (!body.accept) {
      const d = await r.details(id, who);
      if (d) push(who, { type: 'club_declined', clubId: id, name: d.name });
    }
    ctx.json(200, await r.details(id, me.userId));
  });

  router.post('/api/clubs/:id/kick/:userId', auth, rateLimit(writeLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const id = clubId(ctx);
    const who = userParam(ctx);
    const r = repo();
    await run(() => r.kick(id, me.userId, who));
    push(who, { type: 'club_left', clubId: id, reason: 'removed' });
    ctx.json(200, await r.details(id, me.userId));
  });

  router.post('/api/clubs/leave', auth, rateLimit(writeLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const r = repo();
    const out = await run(() => r.leave(me.userId));
    if (out.newHead) push(out.newHead, { type: 'club_head', clubId: out.clubId });
    ctx.json(200, { left: out.clubId, closed: out.closed });
  });

  router.delete('/api/clubs/:id', auth, rateLimit(writeLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const id = clubId(ctx);
    const people = await run(() => repo().disband(id, me.userId));
    for (const p of people) push(p, { type: 'club_left', clubId: id, reason: 'disbanded' });
    deps.log.info('club disbanded', { clubId: id });
    ctx.json(200, { disbanded: id });
  });
};
