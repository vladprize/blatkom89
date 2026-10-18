/** Player authentication: Telegram Mini App initData, guest login (public website), dev-only login, logout. */
import { DevAuthRequest, GuestAuthRequest, TelegramAuthRequest } from '@blatkom/shared';
import type { AuthResponse } from '@blatkom/shared';
import { createHmac, randomBytes } from 'node:crypto';
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
  // new guest accounts: per address (a whole party behind one Wi-Fi still fits) and a global backstop
  const newGuestPerIp = new RateLimiter(10, 10 / 3600);
  const newGuestGlobal = new RateLimiter(200, 200 / 3600);
  const guestEnabled = env.GUEST_AUTH_ENABLED || (env.DEV_AUTH_ENABLED && env.NODE_ENV !== 'production');
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

  router.post('/api/auth/guest', rateLimit(limiter), async (ctx) => {
    if (!guestEnabled) throw new HttpError(403, 'guest_auth_disabled', 'Вход без Telegram отключён на этом сервере');
    if (!deps.sql) return unavailable();
    const body = await ctx.body(GuestAuthRequest, 4 * 1024);
    const pg = pgContext(deps.sql, env, deps.log);
    // only an HMAC of the browser's secret is stored, so a database leak does not reveal sign-in keys
    const deviceKey = 'g1:' + createHmac('sha256', env.SESSION_SECRET).update(body.deviceId).digest('base64url');
    const existing = await pg.users.findGuest(deviceKey);
    if (!existing && (!newGuestPerIp.take(ctx.ip) || !newGuestGlobal.take('all'))) {
      deps.log.warn('guest sign-up rate limited', { ip: ctx.ip });
      throw new HttpError(429, 'rate_limited', 'Слишком много новых игроков подряд — попробуйте через несколько минут', { 'retry-after': '60' });
    }
    const platform = body.platform ?? null;
    const up = await pg.users.upsertGuest(deviceKey, body.name, platform);
    const s = await pg.sessions.issue(up.userId, 'guest', platform, body.clientVersion ?? null);
    const evCtx = { userId: up.userId, sessionId: s.sessionId, platform };
    services.analytics.server('session_started', { platform: platform ?? 'unknown', method: 'guest' }, evCtx);
    if (up.isNew) services.analytics.server('profile_created', { method: 'guest' }, evCtx);
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
