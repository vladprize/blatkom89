/** Player profile, history, achievements and account deletion. */
import { UpdateProfileRequest } from '@blatkom/shared';
import type { AchievementsResponse, MatchHistoryResponse } from '@blatkom/shared';
import type { RouteModule } from '../app.js';
import { HttpError } from '../http/router.js';
import { requireUser, currentUser } from '../http/auth.js';
import { RateLimiter, rateLimit } from '../security/rateLimit.js';
import { pgContext } from '../services/persistence.js';

export const registerProfileRoutes: RouteModule = (router, deps) => {
  const auth = requireUser(deps.services.sessions);
  const writeLimiter = new RateLimiter(10, 10 / 60);
  const pg = () => {
    if (!deps.sql) throw new HttpError(503, 'persistence_unavailable', 'Сервис временно недоступен');
    return pgContext(deps.sql, deps.env, deps.log);
  };

  router.get('/api/me', auth, async (ctx) => {
    const user = currentUser(ctx);
    const profile = await pg().profiles.get(user.userId);
    if (!profile) throw new HttpError(404, 'not_found', 'Профиль не найден');
    ctx.json(200, profile);
  });

  router.patch('/api/me', auth, rateLimit(writeLimiter, (ctx) => currentUser(ctx).userId), async (ctx) => {
    const user = currentUser(ctx);
    const body = await ctx.body(UpdateProfileRequest, 4 * 1024);
    if (body.preferredCharacter) {
      const inv = await pg().economy.inventory(user.userId);
      if (!inv.characters.includes(body.preferredCharacter)) throw new HttpError(409, 'not_owned', 'Этот персонаж ещё не открыт');
    }
    await pg().profiles.update(user.userId, body);
    const profile = await pg().profiles.get(user.userId);
    ctx.json(200, profile);
  });

  router.get('/api/me/history', auth, async (ctx) => {
    const user = currentUser(ctx);
    const limit = Math.min(50, Math.max(1, Number(ctx.query.get('limit') ?? 20) || 20));
    const res: MatchHistoryResponse = { matches: await pg().profiles.history(user.userId, limit) };
    ctx.json(200, res);
  });

  router.get('/api/me/achievements', auth, async (ctx) => {
    const user = currentUser(ctx);
    const res: AchievementsResponse = { achievements: await pg().profiles.achievements(user.userId) };
    ctx.json(200, res);
  });

  router.delete('/api/me', auth, rateLimit(writeLimiter, (ctx) => currentUser(ctx).userId), async (ctx) => {
    const user = currentUser(ctx);
    const p = pg();
    await p.sessions.revokeAllForUser(user.userId);
    await p.profiles.deleteUser(user.userId);
    p.activity.forget(user.userId);
    deps.log.info('account deleted', { userId: user.userId });
    ctx.json(200, { deleted: true });
  });
};
