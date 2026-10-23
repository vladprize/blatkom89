/** Player authentication: Telegram Mini App initData (and attaching Telegram to an existing account), guest login (public website), dev-only login, email, logout. */
import { latinName, DevAuthRequest, EmailLinkRequest, EmailLoginRequest, GuestAuthRequest, PasswordChangeRequest, PasswordResetConfirm, PasswordResetRequest, TelegramAuthRequest, VisitRequest } from '@blatkom/shared';
import type { AuthResponse, FirstTouch, TelegramLinkCodeResponse } from '@blatkom/shared';
import { createHmac, randomBytes } from 'node:crypto';
import type { RouteModule } from '../app.js';
import { HttpError } from '../http/router.js';
import { bearerToken, requireUser, currentUser } from '../http/auth.js';
import { RateLimiter, rateLimit } from '../security/rateLimit.js';
import { validateInitData } from '../auth/telegram.js';
import { TelegramLinkError, createTelegramLinkCode, linkTelegramToAccount, telegramLinkUrl, useTelegramLinkCode } from '../auth/telegramLink.js';
import type { TelegramLinkOutcome } from '../auth/telegramLink.js';
import { pgContext } from '../services/persistence.js';
import { sendResetMail } from '../auth/email.js';
import type { Sql } from '../database/db.js';
import { BlatRepo } from '../blat/repo.js';
import { attachSource, partnerFromStartParam, recordVisitSource } from '../analytics/growth.js';

/**
 * V2.0: a NEW account opened through a referral link is attached to its inviter (it counts once the new
 * player has played a whole match — blat/repo.ts). Existing accounts are never re-attached. Never fails
 * the sign-in.
 */
export async function attachReferral(sql: Sql, log: { warn(m: string, f?: Record<string, unknown>): void }, userId: string, isNew: boolean, code: string | null | undefined): Promise<boolean> {
  if (!isNew || !code) return false;
  try {
    return (await new BlatRepo(sql, { publicUrl: '' }).attach(userId, code)) === 'attached';
  } catch (e) {
    log.warn('referral attach failed', { err: e as Error });
    return false;
  }
}

/** A Telegram start parameter `ref_<code>` (the bot's referral link) → the code. */
export const refFromStartParam = (p: string | null | undefined): string | null => (p && /^ref_[A-Za-z0-9_-]{4,32}$/.test(p) ? p.slice(4) : null);

/** A Telegram start parameter that is a room's invitation code (not a referral, partner or linking one). */
const isRoomStartParam = (p: string | null | undefined): boolean => !!p && !/^(ref|p|link)_/.test(p);

/**
 * Links a new account to the anonymous visitor id of the browser it was created in (admin funnel).
 * An upsert, because the visit ping and the sign-up are sent concurrently on the first launch.
 */
async function linkVisitor(sql: Sql, visitorId: string, userId: string, platform: string | null, source?: FirstTouch): Promise<void> {
  await sql`
    INSERT INTO visitors (visitor_id, platform, user_id) VALUES (${visitorId}, ${platform}, ${userId})
    ON CONFLICT (visitor_id) DO UPDATE SET user_id = COALESCE(visitors.user_id, EXCLUDED.user_id), last_seen_at = now()`;
  await sql`INSERT INTO visitor_days (visitor_id, day) VALUES (${visitorId}, (now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING`;
  // V2.0 part F: the visit ping and the sign-up race on the first launch — either one leaves the first touch
  await recordVisitSource(sql, visitorId, source);
}

const REASONS: Record<string, string> = {
  malformed: 'Damaged sign-in data',
  missing_hash: 'No Telegram signature',
  bad_signature: 'The Telegram signature didn’t check out',
  stale: 'The sign-in data has gone stale — restart the mini app',
  future: 'Wrong sign-in time',
  no_user: 'No Telegram user data',
};

export const registerAuthRoutes: RouteModule = (router, deps) => {
  const { env, services } = deps;
  const limiter = new RateLimiter(20, 20 / 60);
  // new guest accounts: per address (a whole party behind one Wi-Fi still fits) and a global backstop
  const newGuestPerIp = new RateLimiter(env.GUEST_SIGNUPS_PER_IP_HOUR, env.GUEST_SIGNUPS_PER_IP_HOUR / 3600);
  const newGuestGlobal = new RateLimiter(200, 200 / 3600);
  const guestEnabled = env.GUEST_AUTH_ENABLED || (env.DEV_AUTH_ENABLED && env.NODE_ENV !== 'production');
  // email sign-in: per network address and per account (password guessing), per player for account
  // changes, and a cap on visit pings
  const emailLimiter = new RateLimiter(20, 20 / 300);
  const emailAccountLimiter = new RateLimiter(10, 10 / 900);
  const emailUserLimiter = new RateLimiter(6, 6 / 300);
  const byUser = (ctx: Parameters<typeof currentUser>[0]) => currentUser(ctx).userId;
  const visitLimiter = new RateLimiter(30, 30 / 60);
  // V2.0 part E: a few Telegram links per player in 10 minutes
  const linkLimiter = new RateLimiter(5, 5 / 600);
  const unavailable = () => {
    throw new HttpError(503, 'persistence_unavailable', 'The service is temporarily unavailable');
  };

  router.post('/api/auth/telegram', rateLimit(limiter), async (ctx) => {
    if (!deps.sql) return unavailable();
    const body = await ctx.body(TelegramAuthRequest, 16 * 1024);
    if (!env.TELEGRAM_BOT_TOKEN) throw new HttpError(503, 'telegram_not_configured', 'Telegram sign-in isn’t set up on this server');
    const pg = pgContext(deps.sql, env, deps.log);
    const v = validateInitData(body.initData, env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_AUTH_MAX_AGE_SEC);
    if (!v.ok) {
      deps.log.info('telegram auth rejected', { reason: v.reason, ip: ctx.ip });
      throw new HttpError(401, 'invalid_init_data', REASONS[v.reason] ?? 'Sign-in error');
    }
    const platform = body.platform ?? null;
    // V2.0 part E: the bot's link from the website (`?tglink=`) — Telegram goes to that account first, so
    // the sign-in below finds it there instead of making (or opening) a second profile
    let link: { outcome: TelegramLinkOutcome; released: string | null } | null = null;
    if (body.link) {
      link = await useTelegramLinkCode(deps.sql, env.SESSION_SECRET, body.link, String(v.user.id));
      deps.log.info('telegram link code used', { outcome: link.outcome, merged: !!link.released });
    }
    const up = await pg.users.upsertTelegram(v.user, platform);
    const referred = await attachReferral(deps.sql, deps.log, up.userId, up.isNew, refFromStartParam(v.startParam) ?? body.ref);
    // V2.0 part F: how the new account came — a partner's or a room's start parameter is read from the signed data
    await attachSource(deps.sql, deps.log, up.userId, up.isNew, body.source, { referral: referred, telegram: true, partnerCode: partnerFromStartParam(v.startParam), invite: isRoomStartParam(v.startParam) });
    const s = await pg.sessions.issue(up.userId, 'telegram', platform, body.clientVersion ?? null);
    const evCtx = { userId: up.userId, sessionId: s.sessionId, platform };
    services.analytics.server('session_started', { platform: platform ?? 'unknown', method: 'telegram' }, evCtx);
    if (up.isNew) services.analytics.server('profile_created', { method: 'telegram' }, evCtx);
    if (link?.outcome === 'linked') services.analytics.server('identity_linked', { provider: 'telegram', via: 'code', merged: !!link.released }, evCtx);
    if (up.isNew && body.visitorId) await linkVisitor(deps.sql, body.visitorId, up.userId, platform, body.source);
    const profile = await pg.profiles.get(up.userId);
    if (!profile) throw new HttpError(500, 'internal', 'Profile not found');
    const res: AuthResponse = { token: s.token, expiresAt: s.expiresAt.toISOString(), profile, isNew: up.isNew, ...(link ? { telegramLink: link.outcome } : {}) };
    ctx.json(200, res);
  });

  /** V2.0 part E: the bot's one-time link that attaches Telegram to this (website) account. */
  router.post('/api/auth/telegram/link-code', requireUser(services.sessions), rateLimit(linkLimiter, byUser), async (ctx) => {
    if (!deps.sql) return unavailable();
    const user = currentUser(ctx);
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_BOT_USERNAME) throw new HttpError(503, 'telegram_not_configured', 'Linking Telegram isn’t set up on this server yet');
    try {
      const c = await createTelegramLinkCode(deps.sql, env.SESSION_SECRET, user.userId);
      const res: TelegramLinkCodeResponse = { url: telegramLinkUrl(env.TELEGRAM_BOT_USERNAME, c.code), expiresAt: c.expiresAt.toISOString() };
      ctx.json(200, res);
    } catch (e) {
      if (e instanceof TelegramLinkError && e.code === 'already_linked') throw new HttpError(409, 'already_linked', 'Telegram is already linked to this account');
      throw e;
    }
  });

  router.post('/api/auth/guest', rateLimit(limiter), async (ctx) => {
    if (!guestEnabled) throw new HttpError(403, 'guest_auth_disabled', 'Signing in without Telegram is switched off on this server');
    if (!deps.sql) return unavailable();
    const body = await ctx.body(GuestAuthRequest, 4 * 1024);
    const pg = pgContext(deps.sql, env, deps.log);
    // only an HMAC of the browser's secret is stored, so a database leak does not reveal sign-in keys
    const deviceKey = 'g1:' + createHmac('sha256', env.SESSION_SECRET).update(body.deviceId).digest('base64url');
    const existing = await pg.users.findGuest(deviceKey);
    if (!existing && (!newGuestPerIp.take(ctx.ip) || !newGuestGlobal.take('all'))) {
      deps.log.warn('guest sign-up rate limited', { ip: ctx.ip });
      throw new HttpError(429, 'rate_limited', 'Too many new players in a row — try again in a few minutes', { 'retry-after': '60' });
    }
    const platform = body.platform ?? null;
    const up = await pg.users.upsertGuest(deviceKey, latinName(body.name, `Comrade_${deviceKey.slice(3, 7).replace(/[^A-Za-z0-9]/g, 'X').toUpperCase()}`), platform);
    // the visitor funnel: link the anonymous visit to the account it became
    if (up.isNew && body.visitorId) await linkVisitor(deps.sql, body.visitorId, up.userId, platform, body.source);
    const referred = await attachReferral(deps.sql, deps.log, up.userId, up.isNew, body.ref);
    await attachSource(deps.sql, deps.log, up.userId, up.isNew, body.source, { referral: referred, telegram: false });
    const s = await pg.sessions.issue(up.userId, 'guest', platform, body.clientVersion ?? null);
    const evCtx = { userId: up.userId, sessionId: s.sessionId, platform };
    services.analytics.server('session_started', { platform: platform ?? 'unknown', method: 'guest' }, evCtx);
    if (up.isNew) services.analytics.server('profile_created', { method: 'guest' }, evCtx);
    const profile = await pg.profiles.get(up.userId);
    if (!profile) throw new HttpError(500, 'internal', 'Profile not found');
    const res: AuthResponse = { token: s.token, expiresAt: s.expiresAt.toISOString(), profile, isNew: up.isNew };
    ctx.json(200, res);
  });

  router.post('/api/auth/dev', rateLimit(limiter), async (ctx) => {
    if (!env.DEV_AUTH_ENABLED || env.NODE_ENV === 'production') throw new HttpError(403, 'dev_auth_disabled', 'Developer sign-in is switched off');
    if (!deps.sql) return unavailable();
    const body = await ctx.body(DevAuthRequest, 4 * 1024);
    const pg = pgContext(deps.sql, env, deps.log);
    const deviceId = body.deviceId ?? randomBytes(12).toString('base64url');
    const platform = body.platform ?? null;
    const up = await pg.users.upsertDev(deviceId, latinName(body.name, `Comrade_${deviceId.slice(-4).replace(/[^A-Za-z0-9]/g, 'X').toUpperCase()}`), platform);
    const referred = await attachReferral(deps.sql, deps.log, up.userId, up.isNew, body.ref);
    await attachSource(deps.sql, deps.log, up.userId, up.isNew, body.source, { referral: referred, telegram: false });
    const s = await pg.sessions.issue(up.userId, 'dev', platform, body.clientVersion ?? null);
    const evCtx = { userId: up.userId, sessionId: s.sessionId, platform };
    services.analytics.server('session_started', { platform: platform ?? 'unknown', method: 'dev' }, evCtx);
    if (up.isNew) services.analytics.server('profile_created', { method: 'dev' }, evCtx);
    const profile = await pg.profiles.get(up.userId);
    if (!profile) throw new HttpError(500, 'internal', 'Profile not found');
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
      ON CONFLICT (visitor_id) DO UPDATE SET last_seen_at = now(),
        referrer = CASE WHEN visitors.referrer IS NULL AND visitors.first_seen_at > now() - interval '1 day' THEN EXCLUDED.referrer ELSE visitors.referrer END`;
    await deps.sql`INSERT INTO visitor_days (visitor_id, day) VALUES (${body.visitorId}, (now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING`;
    // V2.0 part F: a partner's link or a campaign the first visit came with
    await recordVisitSource(deps.sql, body.visitorId, body.source);
    ctx.json(204, null);
  });

  // ── Email sign-in (restore the account on another device) ────────────────
  router.post('/api/auth/email/login', rateLimit(emailLimiter), async (ctx) => {
    if (!deps.sql) return unavailable();
    const body = await ctx.body(EmailLoginRequest, 4 * 1024);
    if (!emailAccountLimiter.take(body.email)) throw new HttpError(429, 'rate_limited', 'Too many attempts — wait a few minutes', { 'retry-after': '120' });
    const pg = pgContext(deps.sql, env, deps.log);
    const userId = await pg.emailAuth.verify(body.email, body.password);
    if (!userId) throw new HttpError(401, 'bad_credentials', 'Wrong email or password');
    const platform = body.platform ?? null;
    // V2.0 part E: signing in inside Telegram attaches this Telegram account to the email's account (the
    // signed launch data proves the Telegram account; a broken one only skips the attaching)
    let link: { outcome: 'linked' | 'already' | 'conflict'; released: string | null } | null = null;
    if (body.initData && env.TELEGRAM_BOT_TOKEN) {
      const v = validateInitData(body.initData, env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_AUTH_MAX_AGE_SEC);
      if (v.ok) link = await linkTelegramToAccount(deps.sql, userId, String(v.user.id));
      else deps.log.info('telegram data with an email sign-in rejected', { reason: v.reason });
    }
    const s = await pg.sessions.issue(userId, 'email', platform, body.clientVersion ?? null);
    const evCtx = { userId, sessionId: s.sessionId, platform };
    services.analytics.server('session_started', { platform: platform ?? 'unknown', method: 'email' }, evCtx);
    if (link?.outcome === 'linked') services.analytics.server('identity_linked', { provider: 'telegram', via: 'email', merged: !!link.released }, evCtx);
    const profile = await pg.profiles.get(userId);
    if (!profile) throw new HttpError(500, 'internal', 'Profile not found');
    const res: AuthResponse = { token: s.token, expiresAt: s.expiresAt.toISOString(), profile, isNew: false, ...(link ? { telegramLink: link.outcome } : {}) };
    ctx.json(200, res);
  });

  router.post('/api/auth/email/link', requireUser(services.sessions), rateLimit(emailUserLimiter, byUser), async (ctx) => {
    if (!deps.sql) return unavailable();
    const user = currentUser(ctx);
    const body = await ctx.body(EmailLinkRequest, 4 * 1024);
    const pg = pgContext(deps.sql, env, deps.log);
    const r = await pg.emailAuth.link(user.userId, body.email, body.password);
    if (r === 'already_linked') throw new HttpError(409, 'already_linked', 'An email is already registered to this account');
    if (r === 'email_taken') throw new HttpError(409, 'email_taken', 'This email is already registered to another account');
    services.analytics.server('email_linked', {}, user);
    ctx.json(200, await pg.profiles.get(user.userId));
  });

  router.post('/api/auth/email/password', requireUser(services.sessions), rateLimit(emailUserLimiter, byUser), async (ctx) => {
    if (!deps.sql) return unavailable();
    const user = currentUser(ctx);
    const body = await ctx.body(PasswordChangeRequest, 4 * 1024);
    const ok = await pgContext(deps.sql, env, deps.log).emailAuth.changePassword(user.userId, body.current, body.password);
    if (!ok) throw new HttpError(401, 'bad_credentials', 'The current password doesn’t match');
    ctx.json(200, { ok: true });
  });

  router.post('/api/auth/email/reset-request', rateLimit(emailLimiter), async (ctx) => {
    if (!deps.sql) return unavailable();
    const body = await ctx.body(PasswordResetRequest, 2 * 1024);
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw new HttpError(503, 'mail_not_configured', 'Password reset by email isn’t connected yet — write to the game’s administration');
    if (!emailAccountLimiter.take(`reset:${body.email}`)) throw new HttpError(429, 'rate_limited', 'The letter is already on its way — check your inbox', { 'retry-after': '300' });
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
    if (!userId) throw new HttpError(400, 'bad_token', 'The link has expired or was already used');
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
