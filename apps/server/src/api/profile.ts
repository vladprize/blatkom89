/** Player profile, history, achievements, alias checks and account deletion. */
import { UpdateProfileRequest, displayNameSchema } from '@blatkom/shared';
import type { AchievementsResponse, MatchHistoryResponse, NameCheckResponse } from '@blatkom/shared';
import { isNameConflict, isNameFree, suggestNames } from '../auth/names.js';
import type { RouteModule } from '../app.js';
import { HttpError } from '../http/router.js';
import { requireUser, currentUser } from '../http/auth.js';
import { RateLimiter, rateLimit } from '../security/rateLimit.js';
import { pgContext } from '../services/persistence.js';
import { ClubRepo } from '../clubs/repo.js';

export const registerProfileRoutes: RouteModule = (router, deps) => {
  const auth = requireUser(deps.services.sessions);
  const writeLimiter = new RateLimiter(10, 10 / 60);
  const nameLimiter = new RateLimiter(30, 30 / 60);
  const pg = () => {
    if (!deps.sql) throw new HttpError(503, 'persistence_unavailable', 'The service is temporarily unavailable');
    return pgContext(deps.sql, deps.env, deps.log);
  };

  router.get('/api/me', auth, async (ctx) => {
    const user = currentUser(ctx);
    const profile = await pg().profiles.get(user.userId);
    if (!profile) throw new HttpError(404, 'not_found', 'Profile not found');
    ctx.json(200, profile);
  });

  router.patch('/api/me', auth, rateLimit(writeLimiter, (ctx) => currentUser(ctx).userId), async (ctx) => {
    const user = currentUser(ctx);
    const body = await ctx.body(UpdateProfileRequest, 4 * 1024);
    if (body.preferredCharacter) {
      const inv = await pg().economy.inventory(user.userId);
      if (!inv.characters.includes(body.preferredCharacter)) throw new HttpError(409, 'not_owned', 'This character isn’t unlocked yet');
    }
    // aliases are unique (any letter case); changing the case of your own is fine
    if (body.displayName !== undefined && deps.sql && !(await isNameFree(deps.sql, body.displayName, user.userId))) throw new HttpError(409, 'name_taken', 'This alias is taken — pick another');
    try {
      await pg().profiles.update(user.userId, body);
    } catch (e) {
      if (isNameConflict(e)) throw new HttpError(409, 'name_taken', 'This alias is taken — pick another');
      throw e;
    }
    const profile = await pg().profiles.get(user.userId);
    ctx.json(200, profile);
  });

  /** Is an alias free? With a few free variants when it is not (the alias dialog checks as you type). */
  router.get('/api/names/check', auth, rateLimit(nameLimiter, (ctx) => currentUser(ctx).userId), async (ctx) => {
    const user = currentUser(ctx);
    const parsed = displayNameSchema.safeParse(ctx.query.get('name') ?? '');
    if (!parsed.success) throw new HttpError(400, 'bad_name', 'A name may contain letters, digits, spaces and _ . -');
    if (!deps.sql) throw new HttpError(503, 'persistence_unavailable', 'The service is temporarily unavailable');
    const name = parsed.data;
    const available = await isNameFree(deps.sql, name, user.userId);
    const res: NameCheckResponse = { name, available, suggestions: available ? [] : await suggestNames(deps.sql, name) };
    ctx.json(200, res);
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
    // out of the club first, so a head hands the club over before the account disappears
    await new ClubRepo(deps.sql!).forget(user.userId);
    await p.profiles.deleteUser(user.userId);
    p.activity.forget(user.userId);
    deps.log.info('account deleted', { userId: user.userId });
    ctx.json(200, { deleted: true });
  });
};
