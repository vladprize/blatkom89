/**
 * PostgreSQL-backed implementations of the service contracts, plus the shared per-database context
 * used by the HTTP route modules (auth, profile, events, admin).
 */
import { randomBytes } from 'node:crypto';
import type { Sql } from '../database/db.js';
import type { Env } from '../config/env.js';
import type { Logger } from '../logging/logger.js';
import type { InviteRegistry, Services } from './contracts.js';
import { ActivityTracker } from '../auth/activity.js';
import { UserRepo } from '../auth/users.js';
import { SessionStore } from '../auth/sessions.js';
import { ProfileRepo } from '../profiles/repo.js';
import { PgMatchRecorder, seedAchievements } from '../progression/recorder.js';
import { PgAnalytics } from '../analytics/writer.js';
import { AdminAuth } from '../admin/auth.js';
import { bootstrapAdmin } from '../admin/bootstrap.js';
import { scheduleRetention } from '../analytics/retention.js';

export interface Persistence {
  services: Services;
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
}

const contexts = new WeakMap<object, PgContext>();

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
    profiles: new ProfileRepo(sql),
    recorder: new PgMatchRecorder(sql, log),
    invites: new PgInvites(sql),
    analytics,
    adminAuth: new AdminAuth(sql, env.SESSION_SECRET, env.ADMIN_SESSION_TTL_HOURS, env.PUBLIC_URL.startsWith('https://'), origins),
  };
  contexts.set(sql as unknown as object, ctx);
  return ctx;
}

export async function createPersistence(deps: { sql: Sql; env: Env; log: Logger }): Promise<Persistence> {
  const ctx = pgContext(deps.sql, deps.env, deps.log);
  await seedAchievements(deps.sql);
  await bootstrapAdmin(deps.sql, ctx.adminAuth, deps.log, deps.env.ADMIN_BOOTSTRAP_USERNAME, deps.env.ADMIN_BOOTSTRAP_PASSWORD);
  // Retention purge (docs/PRIVACY.md): first run 5 min after start, then daily; unref'd timers.
  const stopRetention = deps.env.NODE_ENV === 'test' ? () => {} : scheduleRetention(deps.sql, deps.log);
  return {
    services: { sessions: ctx.sessions, recorder: ctx.recorder, invites: ctx.invites, analytics: ctx.analytics },
    close: async () => {
      stopRetention();
      await ctx.analytics.close();
    },
  };
}
