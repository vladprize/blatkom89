/**
 * Sign-in with Google, Facebook, Discord, Reddit (OAuth, auth/oauth.ts) and Telegram on the website
 * (auth/telegramLogin.ts) — v0.3 part 3.
 *
 *   GET  /api/auth/providers                      which are set up (the page shows only those; `telegramLink`: the bot links accounts)
 *   POST /api/auth/oauth/intent                   a 5-minute token naming the page's current account
 *   GET  /api/auth/oauth/:provider/start?intent=  → the provider (sets the nonce cookie)
 *   GET  /api/auth/oauth/:provider/callback       ← the provider; → /#login=<one-time code> or /?login_error=…
 *   POST /api/auth/oauth/finish {code}            the one-time code → a session
 *   POST /api/auth/telegram/web {data}            Telegram Login data (+ the current session, optional)
 */
import { latinName, nameKey, PlatformSchema } from '@blatkom/shared';
import type { AuthResponse } from '@blatkom/shared';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { RouteModule } from '../app.js';
import { HttpError } from '../http/router.js';
import type { Ctx } from '../http/router.js';
import { bearerToken } from '../http/auth.js';
import { RateLimiter, rateLimit } from '../security/rateLimit.js';
import { pgContext } from '../services/persistence.js';
import { freeName, isNameConflict } from '../auth/names.js';
import { OAuthError, authorizeUrl, callbackUrl, credentials, enabledProviders, fetchProfile, handoffHash, intentToken, isOAuthProvider, newNonce, providerSpec, readIntent, readState, stateToken } from '../auth/oauth.js';
import type { OAuthProvider } from '../auth/oauth.js';
import { TelegramLoginData, botIdOf, validateTelegramLogin } from '../auth/telegramLogin.js';
import type { Sql } from '../database/db.js';
import { attachSource } from '../analytics/growth.js';

const NONCE_COOKIE = 'blk_oauth';
const HANDOFF_TTL_MS = 5 * 60_000;

const FinishBody = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{20,80}$/), platform: PlatformSchema.optional(), clientVersion: z.string().max(32).optional() }).strict();
const TelegramWebBody = z.object({ data: TelegramLoginData, platform: PlatformSchema.optional(), clientVersion: z.string().max(32).optional() }).strict();

/** A fresh account for a player who arrives through a provider with nothing else (no guest yet). */
async function createAccount(sql: Sql, name: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const candidate = await freeName(sql, name);
    try {
      const [u] = await sql<Array<{ id: string }>>`
        INSERT INTO users (display_name, name_key, oauth_only) VALUES (${candidate}, ${nameKey(candidate)}, true) RETURNING id`;
      await sql`INSERT INTO profiles (user_id) VALUES (${u!.id}) ON CONFLICT DO NOTHING`;
      return u!.id;
    } catch (e) {
      if (!isNameConflict(e) || attempt >= 4) throw e;
    }
  }
}

export const registerOAuthRoutes: RouteModule = (router, deps) => {
  const { env } = deps;
  // per address and per step: a sign-in is four calls (intent, start, callback, finish)
  const intentLimiter = new RateLimiter(30, 30 / 60);
  const startLimiter = new RateLimiter(30, 30 / 60);
  const callbackLimiter = new RateLimiter(30, 30 / 60);
  const finishLimiter = new RateLimiter(30, 30 / 60);
  const telegramLimiter = new RateLimiter(20, 20 / 60);
  const secure = env.PUBLIC_URL.startsWith('https://');
  const home = env.PUBLIC_URL.replace(/\/$/, '');
  const db = () => {
    if (!deps.sql) throw new HttpError(503, 'persistence_unavailable', 'The service is temporarily unavailable');
    return deps.sql;
  };
  const back = (ctx: Ctx, where: string) => {
    ctx.res.writeHead(302, { location: `${home}/${where}`, 'set-cookie': `${NONCE_COOKIE}=; Path=/api/auth/oauth; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}; Max-Age=0`, 'cache-control': 'no-store' });
    ctx.res.end();
  };
  const fail = (ctx: Ctx, why: string) => back(ctx, `?login_error=${encodeURIComponent(why)}`);
  /** The current account behind a Bearer token, if any (the page may also be signed out). */
  const currentUserId = async (ctx: Ctx): Promise<string | null> => {
    const token = bearerToken(ctx);
    if (!token) return null;
    return (await deps.services.sessions.verify(token))?.userId ?? null;
  };

  router.get('/api/auth/providers', (ctx) => {
    const botId = env.TELEGRAM_BOT_TOKEN ? botIdOf(env.TELEGRAM_BOT_TOKEN) : null;
    // V2.0 part E: `telegramLink` — the bot can attach Telegram to a website account (docs/TELEGRAM.md §4)
    ctx.json(200, { providers: enabledProviders(env), telegram: env.TELEGRAM_WEB_LOGIN && botId ? { botId } : null, telegramLink: !!(botId && env.TELEGRAM_BOT_USERNAME) });
  });

  router.post('/api/auth/oauth/intent', rateLimit(intentLimiter), async (ctx) => {
    ctx.json(200, { intent: intentToken(env.SESSION_SECRET, await currentUserId(ctx)) });
  });

  router.get('/api/auth/oauth/:provider/start', rateLimit(startLimiter), (ctx) => {
    const provider = ctx.params.provider ?? '';
    if (!isOAuthProvider(provider)) throw new HttpError(404, 'not_found', 'Not found');
    const creds = credentials(provider, env);
    if (!creds) return fail(ctx, 'not_configured');
    const intent = readIntent(env.SESSION_SECRET, ctx.query.get('intent') ?? '');
    if (!intent) return fail(ctx, 'expired');
    const nonce = newNonce();
    const state = stateToken(env.SESSION_SECRET, { p: provider, u: intent.u, n: nonce });
    const url = authorizeUrl(providerSpec(provider, env), creds.id, callbackUrl(env, provider), state);
    ctx.res.writeHead(302, { location: url, 'set-cookie': `${NONCE_COOKIE}=${nonce}; Path=/api/auth/oauth; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}; Max-Age=600`, 'cache-control': 'no-store' });
    ctx.res.end();
  });

  router.get('/api/auth/oauth/:provider/callback', rateLimit(callbackLimiter), async (ctx) => {
    const provider = ctx.params.provider ?? '';
    if (!isOAuthProvider(provider)) throw new HttpError(404, 'not_found', 'Not found');
    const creds = credentials(provider, env);
    if (!creds) return fail(ctx, 'not_configured');
    if (ctx.query.get('error')) return fail(ctx, 'cancelled');
    const state = readState(env.SESSION_SECRET, ctx.query.get('state') ?? '');
    if (!state || state.p !== provider || !state.n || ctx.cookies[NONCE_COOKIE] !== state.n) return fail(ctx, 'state');
    const code = ctx.query.get('code') ?? '';
    if (!code || code.length > 2048) return fail(ctx, 'state');
    let profile;
    try {
      profile = await fetchProfile(providerSpec(provider, env), creds, callbackUrl(env, provider), code, deps.oauthFetch ?? fetch);
    } catch (e) {
      deps.log.warn('oauth sign-in failed', { provider, step: e instanceof OAuthError ? e.step : 'network', err: e as Error });
      return fail(ctx, 'provider');
    }
    const sql = db();
    const { userId, isNew, linked, refused } = await resolveAccount(sql, provider, profile, state.u);
    if (refused) return fail(ctx, 'already_linked');
    const handoff = randomBytes(24).toString('base64url');
    await sql`DELETE FROM auth_handoffs WHERE created_at < now() - interval '10 minutes'`;
    await sql`INSERT INTO auth_handoffs (code_hash, user_id, provider, is_new, linked) VALUES (${handoffHash(handoff)}, ${userId}, ${provider}, ${isNew}, ${linked})`;
    deps.log.info('oauth sign-in', { provider, isNew, linked });
    back(ctx, `#login=${handoff}`);
  });

  router.post('/api/auth/oauth/finish', rateLimit(finishLimiter), async (ctx) => {
    const body = await ctx.body(FinishBody, 2048);
    const sql = db();
    const [h] = await sql<Array<{ user_id: string; provider: string; is_new: boolean; linked: boolean; created_at: Date }>>`
      DELETE FROM auth_handoffs WHERE code_hash = ${handoffHash(body.code)} RETURNING user_id, provider, is_new, linked, created_at`;
    if (!h || Date.now() - h.created_at.getTime() > HANDOFF_TTL_MS) throw new HttpError(401, 'login_expired', 'The sign-in has expired — try again');
    const pg = pgContext(sql, env, deps.log);
    const platform = body.platform ?? null;
    const s = await pg.sessions.issue(h.user_id, 'oauth', platform, body.clientVersion ?? null);
    const evCtx = { userId: h.user_id, sessionId: s.sessionId, platform };
    deps.services.analytics.server('session_started', { platform: platform ?? 'unknown', method: 'oauth' }, evCtx);
    if (h.is_new) deps.services.analytics.server('profile_created', { method: 'oauth' }, evCtx);
    await attachSource(sql, deps.log, h.user_id, h.is_new, undefined, { referral: false, telegram: false });
    if (h.linked) deps.services.analytics.server('identity_linked', { provider: h.provider }, evCtx);
    const profile = await pg.profiles.get(h.user_id);
    if (!profile) throw new HttpError(401, 'login_expired', 'The sign-in has expired — try again');
    const res: AuthResponse & { linked: boolean; provider: string } = { token: s.token, expiresAt: s.expiresAt.toISOString(), profile, isNew: h.is_new, linked: h.linked, provider: h.provider };
    ctx.json(200, res);
  });

  router.post('/api/auth/telegram/web', rateLimit(telegramLimiter), async (ctx) => {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEB_LOGIN) throw new HttpError(503, 'telegram_not_configured', 'Telegram sign-in isn’t set up on this server');
    const body = await ctx.body(TelegramWebBody, 8 * 1024);
    const v = validateTelegramLogin(body.data, env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_AUTH_MAX_AGE_SEC);
    if (!v.ok) {
      deps.log.info('telegram web login rejected', { reason: v.reason, ip: ctx.ip });
      throw new HttpError(401, 'invalid_init_data', 'The Telegram signature didn’t check out');
    }
    const sql = db();
    const current = await currentUserId(ctx);
    const tgId = String(v.user.id);
    let userId: string;
    let isNew = false;
    let linked = false;
    const [owner] = await sql<Array<{ id: string }>>`SELECT id FROM users WHERE telegram_id = ${tgId}::bigint AND deleted_at IS NULL`;
    if (owner) userId = owner.id;
    else if (current && (await sql`UPDATE users SET telegram_id = ${tgId}::bigint WHERE id = ${current} AND telegram_id IS NULL AND deleted_at IS NULL RETURNING id`).length) {
      userId = current;
      linked = true;
    } else {
      const name = latinName(`${v.user.firstName} ${v.user.lastName ?? ''}`, `Comrade ${tgId.slice(-4)}`);
      for (let attempt = 0; ; attempt++) {
        const candidate = await freeName(sql, name);
        try {
          const [u] = await sql<Array<{ id: string }>>`INSERT INTO users (telegram_id, display_name, name_key) VALUES (${tgId}::bigint, ${candidate}, ${nameKey(candidate)}) RETURNING id`;
          await sql`INSERT INTO profiles (user_id) VALUES (${u!.id}) ON CONFLICT DO NOTHING`;
          userId = u!.id;
          isNew = true;
          break;
        } catch (e) {
          if (!isNameConflict(e) || attempt >= 4) throw e;
        }
      }
    }
    const pg = pgContext(sql, env, deps.log);
    const platform = body.platform ?? null;
    const s = await pg.sessions.issue(userId, 'telegram', platform, body.clientVersion ?? null);
    const evCtx = { userId, sessionId: s.sessionId, platform };
    deps.services.analytics.server('session_started', { platform: platform ?? 'unknown', method: 'telegram' }, evCtx);
    if (isNew) deps.services.analytics.server('profile_created', { method: 'telegram' }, evCtx);
    if (linked) deps.services.analytics.server('identity_linked', { provider: 'telegram', via: 'widget' }, evCtx);
    await attachSource(sql, deps.log, userId, isNew, undefined, { referral: false, telegram: true });
    const profile = await pg.profiles.get(userId);
    if (!profile) throw new HttpError(500, 'internal', 'Profile not found');
    const res: AuthResponse & { linked: boolean; provider: string } = { token: s.token, expiresAt: s.expiresAt.toISOString(), profile, isNew, linked, provider: 'telegram' };
    ctx.json(200, res);
  });
};

/**
 * The account for a provider's player: the one the id already belongs to; otherwise the page's current
 * account gets it (unless that account already has another account of this provider — `refused`);
 * otherwise a new account.
 */
export async function resolveAccount(sql: Sql, provider: OAuthProvider, profile: { uid: string; name: string }, current: string | null): Promise<{ userId: string; isNew: boolean; linked: boolean; refused: boolean }> {
  const [known] = await sql<Array<{ user_id: string }>>`
    UPDATE user_identities SET last_used_at = now() WHERE provider = ${provider} AND provider_uid = ${profile.uid} RETURNING user_id`;
  if (known) return { userId: known.user_id, isNew: false, linked: false, refused: false };
  if (current) {
    const [alive] = await sql<Array<{ id: string }>>`SELECT id FROM users WHERE id = ${current} AND deleted_at IS NULL`;
    if (alive) {
      const [other] = await sql`SELECT 1 FROM user_identities WHERE user_id = ${current} AND provider = ${provider}`;
      if (other) return { userId: current, isNew: false, linked: false, refused: true };
      await sql`INSERT INTO user_identities (provider, provider_uid, user_id) VALUES (${provider}, ${profile.uid}, ${current}) ON CONFLICT DO NOTHING`;
      return { userId: current, isNew: false, linked: true, refused: false };
    }
  }
  const userId = await createAccount(sql, latinName(profile.name, `Comrade ${profile.uid.replace(/\D/g, '').slice(-4).padStart(4, '0')}`));
  await sql`INSERT INTO user_identities (provider, provider_uid, user_id) VALUES (${provider}, ${profile.uid}, ${userId})`;
  return { userId, isNew: true, linked: false, refused: false };
}
