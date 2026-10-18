/** Player authentication: Telegram Mini App initData, guest login (public website), dev-only login, logout. */
import { DevAuthRequest, EmailLinkRequest, EmailLoginRequest, GuestAuthRequest, PasswordChangeRequest, PasswordResetConfirm, PasswordResetRequest, TelegramAuthRequest, VisitRequest } from '@blatkom/shared';
import type { AuthResponse } from '@blatkom/shared';
import { createHmac, randomBytes } from 'node:crypto';
import type { RouteModule } from '../app.js';
import { HttpError } from '../http/router.js';
import { bearerToken, requireUser, currentUser } from '../http/auth.js';
import { RateLimiter, rateLimit } from '../security/rateLimit.js';
import { validateInitData } from '../auth/telegram.js';
import { pgContext } from '../services/persistence.js';
import { sendResetMail } from '../auth/email.js';

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
  // email sign-in: per network address and per account (password guessing), per player for account
  // changes, and a cap on visit pings
  const emailLimiter = new RateLimiter(20, 20 / 300);
  const emailAccountLimiter = new RateLimiter(10, 10 / 900);
  const emailUserLimiter = new RateLimiter(6, 6 / 300);
  const byUser = (ctx: Parameters<typeof currentUser>[0]) => currentUser(ctx).userId;
  const visitLimiter = new RateLimiter(30, 30 / 60);
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
    // the visitor funnel: link the anonymous visit to the account it became
    if (up.isNew && body.visitorId) await deps.sql`UPDATE visitors SET user_id = ${up.userId} WHERE visitor_id = ${body.visitorId} AND user_id IS NULL`;
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

  /** Anonymous «opened the site» ping (no account yet): feeds the admin funnel. */
  router.post('/api/visit', rateLimit(visitLimiter), async (ctx) => {
    if (!deps.sql) return ctx.json(204, null);
    const body = await ctx.body(VisitRequest, 2 * 1024);
    const referrer = body.referrer ? body.referrer.replace(/^https?:\/\//, '').split('/')[0]!.slice(0, 80) : null;
    await deps.sql`
      INSERT INTO visitors (visitor_id, platform, referrer) VALUES (${body.visitorId}, ${body.platform ?? null}, ${referrer})
      ON CONFLICT (visitor_id) DO UPDATE SET last_seen_at = now()`;
    await deps.sql`INSERT INTO visitor_days (visitor_id, day) VALUES (${body.visitorId}, (now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING`;
    ctx.json(204, null);
  });

  // ── Email sign-in (restore the account on another device) ────────────────
  router.post('/api/auth/email/login', rateLimit(emailLimiter), async (ctx) => {
    if (!deps.sql) return unavailable();
    const body = await ctx.body(EmailLoginRequest, 4 * 1024);
    if (!emailAccountLimiter.take(body.email)) throw new HttpError(429, 'rate_limited', 'Слишком много попыток — подождите несколько минут', { 'retry-after': '120' });
    const pg = pgContext(deps.sql, env, deps.log);
    const userId = await pg.emailAuth.verify(body.email, body.password);
    if (!userId) throw new HttpError(401, 'bad_credentials', 'Неверная почта или пароль');
    const platform = body.platform ?? null;
    const s = await pg.sessions.issue(userId, 'email', platform, body.clientVersion ?? null);
    services.analytics.server('session_started', { platform: platform ?? 'unknown', method: 'email' }, { userId, sessionId: s.sessionId, platform });
    const profile = await pg.profiles.get(userId);
    if (!profile) throw new HttpError(500, 'internal', 'Профиль не найден');
    const res: AuthResponse = { token: s.token, expiresAt: s.expiresAt.toISOString(), profile, isNew: false };
    ctx.json(200, res);
  });

  router.post('/api/auth/email/link', requireUser(services.sessions), rateLimit(emailUserLimiter, byUser), async (ctx) => {
    if (!deps.sql) return unavailable();
    const user = currentUser(ctx);
    const body = await ctx.body(EmailLinkRequest, 4 * 1024);
    const pg = pgContext(deps.sql, env, deps.log);
    const r = await pg.emailAuth.link(user.userId, body.email, body.password);
    if (r === 'already_linked') throw new HttpError(409, 'already_linked', 'Почта уже привязана к этому аккаунту');
    if (r === 'email_taken') throw new HttpError(409, 'email_taken', 'Эта почта уже привязана к другому аккаунту');
    services.analytics.server('email_linked', {}, user);
    ctx.json(200, await pg.profiles.get(user.userId));
  });

  router.post('/api/auth/email/password', requireUser(services.sessions), rateLimit(emailUserLimiter, byUser), async (ctx) => {
    if (!deps.sql) return unavailable();
    const user = currentUser(ctx);
    const body = await ctx.body(PasswordChangeRequest, 4 * 1024);
    const ok = await pgContext(deps.sql, env, deps.log).emailAuth.changePassword(user.userId, body.current, body.password);
    if (!ok) throw new HttpError(401, 'bad_credentials', 'Текущий пароль не подходит');
    ctx.json(200, { ok: true });
  });

  router.post('/api/auth/email/reset-request', rateLimit(emailLimiter), async (ctx) => {
    if (!deps.sql) return unavailable();
    const body = await ctx.body(PasswordResetRequest, 2 * 1024);
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw new HttpError(503, 'mail_not_configured', 'Сброс пароля по почте пока не подключён — напишите администрации игры');
    if (!emailAccountLimiter.take(`reset:${body.email}`)) throw new HttpError(429, 'rate_limited', 'Письмо уже отправлено — проверьте почту', { 'retry-after': '300' });
    const pg = pgContext(deps.sql, env, deps.log);
    const r = await pg.emailAuth.createReset('email', { email: body.email });
    if (r) await sendResetMail(env, body.email, `${env.PUBLIC_URL.replace(/\/$/, '')}/?reset=${r.token}`, deps.log);
    // same answer whether or not the address is registered
    ctx.json(200, { ok: true });
  });

  router.post('/api/auth/email/reset', rateLimit(emailLimiter), async (ctx) => {
    if (!deps.sql) return unavailable();
    const body = await ctx.body(PasswordResetConfirm, 2 * 1024);
    const userId = await pgContext(deps.sql, env, deps.log).emailAuth.consumeReset(body.token, body.password);
    if (!userId) throw new HttpError(400, 'bad_token', 'Ссылка устарела или уже использована');
    ctx.json(200, { ok: true });
  });

  router.post('/api/auth/logout', requireUser(services.sessions), async (ctx) => {
    if (!deps.sql) return unavailable();
    currentUser(ctx);
    const token = bearerToken(ctx);
    if (token) await pgContext(deps.sql, env, deps.log).sessions.revoke(token);
    ctx.json(200, { ok: true });
  });
};
