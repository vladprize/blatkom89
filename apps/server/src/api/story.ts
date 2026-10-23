/**
 * Story mode API (v0.3 part 4). The missions run in the player's browser (like practice), so the server
 * guards what it pays for: a mission is started with a signed ticket (only when it is open — its chapter
 * written and the mission before it done), and reported done with that ticket no sooner than
 * STORY_MIN_MS later; each mission pays once (story/repo.ts).
 *
 *   GET  /api/story            → the missions done
 *   POST /api/story/start      { mission }                    → { ticket }
 *   POST /api/story/complete   { ticket, ms, kills, deaths }  → the rewards and the missions done
 */
import { randomBytes } from 'node:crypto';
import { STORY_MIN_MS, STORY_TICKET_TTL_MS, StoryCompleteBody, StoryStartBody, isMissionOpen, storyMission } from '@blatkom/shared';
import type { StoryProgressResponse, StoryStartResponse } from '@blatkom/shared';
import type { RouteModule } from '../app.js';
import { HttpError } from '../http/router.js';
import type { Ctx } from '../http/router.js';
import { requireUser, currentUser } from '../http/auth.js';
import { RateLimiter, rateLimit } from '../security/rateLimit.js';
import { readToken, signToken } from '../security/signed.js';
import { StoryError, StoryRepo } from '../story/repo.js';

interface Ticket {
  /** The player. */
  u: string;
  /** The mission. */
  m: string;
}

export const registerStoryRoutes: RouteModule = (router, deps) => {
  const auth = requireUser(deps.services.sessions);
  const byUser = (ctx: Ctx) => currentUser(ctx).userId;
  const readLimiter = new RateLimiter(120, 2);
  const startLimiter = new RateLimiter(30, 30 / 60);
  const doneLimiter = new RateLimiter(30, 30 / 60);
  const repo = () => {
    if (!deps.sql) throw new HttpError(503, 'persistence_unavailable', 'The service is temporarily unavailable');
    return new StoryRepo(deps.sql);
  };
  const secret = deps.env.SESSION_SECRET;

  router.get('/api/story', auth, rateLimit(readLimiter, byUser), async (ctx) => {
    const res: StoryProgressResponse = { done: await repo().done(currentUser(ctx).userId) };
    ctx.json(200, res);
  });

  router.post('/api/story/start', auth, rateLimit(startLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const body = await ctx.body(StoryStartBody, 1024);
    const m = storyMission(body.mission);
    if (!m) throw new HttpError(404, 'not_found', 'No such mission');
    if (!isMissionOpen(m.id, await repo().doneIds(me.userId))) throw new HttpError(403, 'mission_locked', 'Finish the mission before this one first');
    const res: StoryStartResponse = { ticket: signToken(secret, 'story', { u: me.userId, m: m.id, t: Date.now(), r: randomBytes(6).toString('base64url') }) };
    deps.services.analytics.server('story_started', { mission: m.id }, { userId: me.userId, sessionId: me.sessionId });
    ctx.json(200, res);
  });

  router.post('/api/story/complete', auth, rateLimit(doneLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const body = await ctx.body(StoryCompleteBody, 2048);
    const now = Date.now();
    const t = readToken<Ticket>(secret, 'story', body.ticket, STORY_TICKET_TTL_MS, now);
    if (!t || t.u !== me.userId) throw new HttpError(403, 'bad_ticket', 'This mission wasn’t started from your account — start it again');
    const m = storyMission(t.m);
    if (!m) throw new HttpError(404, 'not_found', 'No such mission');
    if (now - t.t < STORY_MIN_MS) throw new HttpError(409, 'too_fast', 'That was too quick to be true — play the mission through');
    const ms = Math.min(body.ms, now - t.t);
    try {
      const reward = await repo().complete(me.userId, m, ms);
      deps.services.analytics.server('story_completed', { mission: m.id, ms, first: reward.first }, { userId: me.userId, sessionId: me.sessionId });
      if (reward.first) deps.log.info('story mission done', { userId: me.userId, mission: m.id, talons: reward.talons, achievement: reward.achievement });
      ctx.json(200, reward);
    } catch (e) {
      if (e instanceof StoryError) throw new HttpError(404, 'no_profile', 'Profile not found');
      throw e;
    }
  });
};
