/** Client analytics ingestion with validation and de-duplication by event UUID. */
import { EventsBatchSchema } from '@blatkom/shared';
import type { RouteModule } from '../app.js';
import { HttpError } from '../http/router.js';
import { requireUser, currentUser } from '../http/auth.js';
import { RateLimiter, rateLimit } from '../security/rateLimit.js';
import { ingestClientEvents } from '../analytics/ingest.js';

export const registerEventRoutes: RouteModule = (router, deps) => {
  const limiter = new RateLimiter(30, 30 / 60);
  router.post('/api/events', requireUser(deps.services.sessions), rateLimit(limiter, (ctx) => currentUser(ctx).userId), async (ctx) => {
    if (!deps.sql) throw new HttpError(503, 'persistence_unavailable', 'The service is temporarily unavailable');
    const user = currentUser(ctx);
    const body = await ctx.body(EventsBatchSchema, 64 * 1024);
    const result = await ingestClientEvents(deps.sql, user, body.events);
    ctx.json(200, result);
  });
};
