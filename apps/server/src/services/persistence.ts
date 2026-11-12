/**
 * PostgreSQL-backed implementations of the service contracts, plus the shared per-database context
 * used by the HTTP route modules (auth, profile, events, admin).
 */
import { randomBytes } from 'node:crypto';
import type { Sql } from '../database/db.js';
import type { Env } from '../config/env.js';
import type { ReferralBlatsRules } from '@blatkom/shared';
import type { Logger } from '../logging/logger.js';
import type { Gangs, InviteRegistry, Services } from './contracts.js';
import { ActivityTracker } from '../auth/activity.js';
import { UserRepo } from '../auth/users.js';
import { SessionStore } from '../auth/sessions.js';
import { ProfileRepo } from '../profiles/repo.js';
import { PgMatchRecorder, seedAchievements } from '../progression/recorder.js';
import { PgAnalytics } from '../analytics/writer.js';
import { AdminAuth } from '../admin/auth.js';
import { bootstrapAdmin } from '../admin/bootstrap.js';
import { scheduleRetention } from '../analytics/retention.js';
import { scheduleHousePlayers } from '../social/housePlayers.js';
import { EconomyRepo } from '../economy/repo.js';
import { EmailAuth } from '../auth/email.js';
import { PaymentService } from '../payments/service.js';
import { StripeProvider, XsollaProvider } from '../payments/providers.js';
import { StarsProvider } from '../payments/stars.js';
import { ClubRepo } from '../clubs/repo.js';

export interface Persistence {
  services: Services;
  /** The PostgreSQL recorder itself (V2.0: the app hooks its referral notices). */
  recorder?: PgMatchRecorder;
  close?(): Promise<void>;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export const INVITE_TTL_MS = 24 * 3600_000;

export class PgInvites implements InviteRegistry {
  constructor(private readonly sql: Sql) {}

  async create(roomId: string, createdBy: string | null): Promise<{ code: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    for (let attempt = 0; attempt < 5; attempt++) {
      const bytes = randomBytes(8);
      let code = '';
      for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
      const rows = await this.sql`
        INSERT INTO invitations (code, room_id, created_by, expires_at)
        SELECT ${code}, ${roomId}, (SELECT id FROM users WHERE id::text = ${createdBy ?? ''}), ${expiresAt}
        ON CONFLICT (code) DO NOTHING
        RETURNING code`;
      if (rows.length) return { code, expiresAt };
    }
    throw new Error('could not allocate invite code');
  }

  async resolve(code: string): Promise<{ roomId: string } | null> {
    if (!/^[A-Za-z0-9]{6,16}$/.test(code)) return null;
    const rows = await this.sql<Array<{ room_id: string }>>`
      UPDATE invitations SET opened = opened + 1 WHERE code = ${code} AND expires_at > now() RETURNING room_id`;
    return rows[0] ? { roomId: rows[0].room_id } : null;
  }
}

export interface PgContext {
  sql: Sql;
  env: Env;
  log: Logger;
  activity: ActivityTracker;
  users: UserRepo;
  sessions: SessionStore;
  profiles: ProfileRepo;
  recorder: PgMatchRecorder;
  invites: PgInvites;
  analytics: PgAnalytics;
  adminAuth: AdminAuth;
  economy: EconomyRepo;
  payments: PaymentService;
  emailAuth: EmailAuth;
}

const contexts = new WeakMap<object, PgContext>();

/** v0.2.17: the gang a person is in (gang battles). */
export function pgGangs(sql: Sql): Gangs {
  return {
    async gangOf(userId) {
      const [r] = await sql<Array<{ club_id: string }>>`SELECT club_id FROM club_members WHERE user_id = ${userId}`;
      return r?.club_id ?? null;
    },
  };
}

/** v0.2.25: the BLATS for invitations, from the server's settings. */
export function referralBlatsRules(env: Pick<Env, 'REFERRAL_BLATS' | 'REFERRAL_BLATS_MATCHES' | 'REFERRAL_BLATS_MONTHLY'>): ReferralBlatsRules {
  return { amount: env.REFERRAL_BLATS, matches: env.REFERRAL_BLATS_MATCHES, monthlyCap: env.REFERRAL_BLATS_MONTHLY };
}

/** One context per database handle so that route modules and services share the same instances. */
export function pgContext(sql: Sql, env: Env, log: Logger): PgContext {
  const existing = contexts.get(sql as unknown as object);
  if (existing) return existing;
  const activity = new ActivityTracker(sql, log);
  const analytics = new PgAnalytics(sql, log, env.SERVER_VERSION);
  const origins = new Set([new URL(env.PUBLIC_URL).origin, ...env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)]);
  const ctx: PgContext = {
    sql,
    env,
    log,
    activity,
    users: new UserRepo(sql),
    sessions: new SessionStore(sql, env.SESSION_SECRET, env.SESSION_TTL_HOURS, activity, log),
    profiles: new ProfileRepo(sql, env.WELCOME_BONUS_BLATS),
    recorder: new PgMatchRecorder(sql, log, referralBlatsRules(env)),
    invites: new PgInvites(sql),
    analytics,
    adminAuth: new AdminAuth(sql, env.SESSION_SECRET, env.ADMIN_SESSION_TTL_HOURS, env.PUBLIC_URL.startsWith('https://'), origins),
    economy: new EconomyRepo(sql, log, env.WELCOME_GIFT_UNTIL ?? null),
    emailAuth: new EmailAuth(sql, env.SESSION_SECRET, log),
    payments: new PaymentService(
      sql,
      log,
      analytics,
      env.PUBLIC_URL,
      env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET ? new StripeProvider(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET) : null,
      {
        // v0.2.18 part 3: Xsolla takes the website's payments once its four keys are set
        xsolla:
          env.XSOLLA_MERCHANT_ID && env.XSOLLA_PROJECT_ID && env.XSOLLA_API_KEY && env.XSOLLA_WEBHOOK_SECRET
            ? new XsollaProvider({ merchantId: env.XSOLLA_MERCHANT_ID, projectId: env.XSOLLA_PROJECT_ID, apiKey: env.XSOLLA_API_KEY, webhookSecret: env.XSOLLA_WEBHOOK_SECRET, sandbox: env.XSOLLA_SANDBOX, skuPrefix: env.XSOLLA_SKU_PREFIX })
            : null,
        // …and Telegram Stars the Mini App's, whenever the bot is on
        stars: env.TELEGRAM_BOT_TOKEN && env.STARS_ENABLED ? new StarsProvider(env.TELEGRAM_BOT_TOKEN, env.STARS_PER_USD, fetch, env.TELEGRAM_API_BASE ?? 'https://api.telegram.org') : null,
      },
    ),
  };
  contexts.set(sql as unknown as object, ctx);
  return ctx;
}

export async function createPersistence(deps: { sql: Sql; env: Env; log: Logger }): Promise<Persistence> {
  const ctx = pgContext(deps.sql, deps.env, deps.log);
  await seedAchievements(deps.sql);
  // the house clubs (clubs/house.ts): in the table from the first start, their ratings caught up;
  // never a reason not to start
  try {
    const clubs = new ClubRepo(deps.sql);
    const added = await clubs.seedHouse();
    if (added) deps.log.info('house clubs added', { added });
    await clubs.driftHouse();
  } catch (e) {
    deps.log.warn('house clubs not ready', { err: e as Error });
  }
  await bootstrapAdmin(deps.sql, ctx.adminAuth, deps.log, deps.env.ADMIN_BOOTSTRAP_USERNAME, deps.env.ADMIN_BOOTSTRAP_PASSWORD);
  // Retention purge (docs/PRIVACY.md): first run 5 min after start, then daily; unref'd timers.
  const stopRetention = deps.env.NODE_ENV === 'test' ? () => {} : scheduleRetention(deps.sql, deps.log);
  // v0.2.20: the house players (social/housePlayers.ts): in the tables from the first start, then they play on
  const stopHouse = deps.env.NODE_ENV === 'test' || deps.env.HOUSE_PLAYERS === 0 ? () => {} : scheduleHousePlayers(deps.sql, deps.log, deps.env.HOUSE_PLAYERS);
  return {
    services: { sessions: ctx.sessions, recorder: ctx.recorder, invites: ctx.invites, analytics: ctx.analytics, economy: ctx.economy, gangs: pgGangs(deps.sql) },
    recorder: ctx.recorder,
    close: async () => {
      stopRetention();
      stopHouse();
      await ctx.analytics.close();
    },
  };
}
