/** Player authentication: Telegram Mini App initData, dev-only browser login, logout. */
import { DevAuthRequest, TelegramAuthRequest } from '@blatkom/shared';
import type { AuthResponse } from '@blatkom/shared';
import { randomBytes } from 'node:crypto';
import type { RouteModule } from '../app.js';
import { HttpError } from '../http/router.js';
import { bearerToken, requireUser, currentUser } from '../http/auth.js';
import { RateLimiter, rateLimit } from '../security/rateLimit.js';
import { validateInitData } from '../auth/telegram.js';
import { pgContext } from '../services/persistence.js';

const REASONS: Record<string, string> = {
  malformed: 'Повреждённые данные авторизации',
  missing_hash: 'Нет подписи Telegram',
  bad_signature: 'Подпись Telegram не прошла проверку',
  stale: 'Данные авторизации устарели — перезапустите мини-приложение',
  future: 'Неверное время авторизации',
  no_user: 'Нет данных пользователя Telegram',
};

export const registerAuthRoutes: RouteModule = (router, deps) => {
  const { env, services } = deps;
  const limiter = new RateLimiter(20, 20 / 60);
  const unavailable = () => {
    throw new HttpError(503, 'persistence_unavailable', 'Сервис временно недоступен');
  };

  router.post('/api/auth/telegram', rateLimit(limiter), async (ctx) => {
    if (!deps.sql) return unavailable();
    const body = await ctx.body(TelegramAuthRequest, 16 * 1024);
    if (!env.TELEGRAM_BOT_TOKEN) throw new HttpError(503, 'telegram_not_configured', 'Вход через Telegram не настроен на сервере');
    const pg = pgContext(deps.sql, env, deps.log);
    const v = validateInitData(body.initData, env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_AUTH_MAX_AGE_SEC);
    if (!v.ok) {
      deps.log.info('telegram auth rejected', { reason: v.reason, ip: ctx.ip });
      throw new HttpError(401, 'invalid_init_data', REASONS[v.reason] ?? 'Ошибка авторизации');
    }
    const platform = body.platform ?? null;
    const up = await pg.users.upsertTelegram(v.user, platform);
    const s = await pg.sessions.issue(up.userId, 'telegram', platform, body.clientVersion ?? null);
    const evCtx = { userId: up.userId, sessionId: s.sessionId, platform };
    services.analytics.server('session_started', { platform: platform ?? 'unknown', method: 'telegram' }, evCtx);
    if (up.isNew) services.analytics.server('profile_created', { method: 'telegram' }, evCtx);
    const profile = await pg.profiles.get(up.userId);
    if (!profile) throw new HttpError(500, 'internal', 'Профиль не найден');
    const res: AuthResponse = { token: s.token, expiresAt: s.expiresAt.toISOString(), profile, isNew: up.isNew };
    ctx.json(200, res);
  });

  router.post('/api/auth/dev', rateLimit(limiter), async (ctx) => {
    if (!env.DEV_AUTH_ENABLED || env.NODE_ENV === 'production') throw new HttpError(403, 'dev_auth_disabled', 'Вход для разработки отключён');
    if (!deps.sql) return unavailable();
    const body = await ctx.body(DevAuthRequest, 4 * 1024);
    const pg = pgContext(deps.sql, env, deps.log);
    const deviceId = body.deviceId ?? randomBytes(12).toString('base64url');
    const platform = body.platform ?? null;
    const up = await pg.users.upsertDev(deviceId, body.name, platform);
    const s = await pg.sessions.issue(up.userId, 'dev', platform, body.clientVersion ?? null);
    const evCtx = { userId: up.userId, sessionId: s.sessionId, platform };
    services.analytics.server('session_started', { platform: platform ?? 'unknown', method: 'dev' }, evCtx);
    if (up.isNew) services.analytics.server('profile_created', { method: 'dev' }, evCtx);
    const profile = await pg.profiles.get(up.userId);
    if (!profile) throw new HttpError(500, 'internal', 'Профиль не найден');
    const res: AuthResponse & { deviceId: string } = { token: s.token, expiresAt: s.expiresAt.toISOString(), profile, isNew: up.isNew, deviceId };
    ctx.json(200, res);
  });

  router.post('/api/auth/logout', requireUser(services.sessions), async (ctx) => {
    if (!deps.sql) return unavailable();
    currentUser(ctx);
    const token = bearerToken(ctx);
    if (token) await pgContext(deps.sql, env, deps.log).sessions.revoke(token);
    ctx.json(200, { ok: true });
  });
};
