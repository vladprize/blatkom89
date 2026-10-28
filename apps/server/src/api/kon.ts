/**
 * «Блатной кон» (V2.0 part D): the player's Kon numbers, history and the tables.
 *
 *   GET /api/kon             → KonResponse (the player's numbers, the last 20 Kon matches, people waiting
 *                              in public Kon rooms of each format)
 *   GET /api/kon/top?by=players|gangs → KonTopResponse (the first 100 by Kon rating, the player's place)
 *
 * Kon rooms are made through /api/rooms (`kon`) and /api/rooms/quick (`kon`) — api/rooms.ts.
 */
import type { KonResponse } from '@blatkom/shared';
import type { RouteModule } from '../app.js';
import { HttpError } from '../http/router.js';
import { requireUser, currentUser } from '../http/auth.js';
import { RateLimiter, rateLimit } from '../security/rateLimit.js';
import { KonRepo } from '../kon/repo.js';
import { PgStakes } from '../blat/stakes.js';

export const registerKonRoutes: RouteModule = (router, deps) => {
  const auth = requireUser(deps.services.sessions);
  const limiter = new RateLimiter(60, 1);
  const byUser = (ctx: Parameters<typeof currentUser>[0]) => currentUser(ctx).userId;
  const repo = () => {
    if (!deps.sql) throw new HttpError(503, 'persistence_unavailable', 'The service is temporarily unavailable');
    return new KonRepo(deps.sql);
  };

  router.get('/api/kon', auth, rateLimit(limiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const r = repo();
    const stakes = await new PgStakes(deps.sql!, deps.env.TOURNAMENT_STAKES).status(me.userId);
    const res: KonResponse = { me: await r.stats(me.userId), history: await r.history(me.userId, 20), waiting: deps.rooms.konWaiting(), waitingByStake: deps.rooms.konWaitingByStake(), stakes };
    ctx.json(200, res, { 'cache-control': 'no-store' });
  });

  router.get('/api/kon/top', auth, rateLimit(limiter, byUser), async (ctx) => {
    const by = ctx.query.get('by') === 'gangs' ? 'gangs' : 'players';
    ctx.json(200, await repo().top(by, currentUser(ctx).userId), { 'cache-control': 'no-store' });
  });
};
