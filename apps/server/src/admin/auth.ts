/**
 * Admin authentication: scrypt passwords, opaque session cookie (HttpOnly, SameSite=Strict, Secure on
 * HTTPS) scoped to /api/admin, and a CSRF token derived from the session token (HMAC) that must be
 * echoed in `x-csrf-token` for every state-changing request.
 */
import { createHmac } from 'node:crypto';
import type { Sql } from '../database/db.js';
import type { AdminRole } from '@blatkom/shared';
import { hashToken, newToken, safeEqualStr } from '../auth/tokens.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.js';
import { HttpError, serializeCookie } from '../http/router.js';
import type { Ctx, Handler } from '../http/router.js';

export const ADMIN_COOKIE = 'blk_admin';

export interface AdminPrincipal {
  id: string;
  username: string;
  role: AdminRole;
  sessionId: string;
}

export class AdminAuth {
  constructor(
    private readonly sql: Sql,
    private readonly secret: string,
    private readonly ttlHours: number,
    readonly secureCookie: boolean,
    readonly allowedOrigins: Set<string>,
  ) {}

  csrfFor(token: string): string {
    return createHmac('sha256', this.secret).update(`csrf:${token}`).digest('base64url');
  }

  async createAdmin(username: string, password: string, role: AdminRole): Promise<string> {
    const hash = await hashPassword(password);
    const rows = await this.sql<Array<{ id: string }>>`
      INSERT INTO admin_users (username, password_hash, role) VALUES (${username.toLowerCase()}, ${hash}, ${role}) RETURNING id`;
    return rows[0]!.id;
  }

  async adminCount(): Promise<number> {
    const [r] = await this.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM admin_users`;
    return r!.n;
  }

  /** Returns a new session or null for bad credentials (constant-ish time for unknown users). */
  async login(username: string, password: string, ip: string, userAgent: string): Promise<{ token: string; csrf: string; admin: AdminPrincipal } | null> {
    const rows = await this.sql<Array<{ id: string; username: string; role: AdminRole; password_hash: string; disabled_at: Date | null }>>`
      SELECT id, username, role, password_hash, disabled_at FROM admin_users WHERE username = ${username.toLowerCase()}`;
    const row = rows[0];
    const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !ok || row.disabled_at) return null;
    const token = newToken(32);
    const csrf = this.csrfFor(token);
    const expiresAt = new Date(Date.now() + this.ttlHours * 3600_000);
    const s = await this.sql<Array<{ id: string }>>`
      INSERT INTO admin_sessions (admin_id, token_hash, csrf_hash, expires_at, ip, user_agent)
      VALUES (${row.id}, ${hashToken(this.secret, token, 'admin')}, ${hashToken(this.secret, csrf, 'csrf')}, ${expiresAt}, ${ip}, ${userAgent.slice(0, 200)})
      RETURNING id`;
    await this.sql`UPDATE admin_users SET last_login_at = now() WHERE id = ${row.id}`;
    return { token, csrf, admin: { id: row.id, username: row.username, role: row.role, sessionId: s[0]!.id } };
  }

  async verify(token: string): Promise<AdminPrincipal | null> {
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(token)) return null;
    const rows = await this.sql<Array<{ session_id: string; id: string; username: string; role: AdminRole }>>`
      SELECT s.id AS session_id, a.id, a.username, a.role
      FROM admin_sessions s JOIN admin_users a ON a.id = s.admin_id
      WHERE s.token_hash = ${hashToken(this.secret, token, 'admin')} AND s.revoked_at IS NULL AND s.expires_at > now() AND a.disabled_at IS NULL`;
    const r = rows[0];
    return r ? { id: r.id, username: r.username, role: r.role, sessionId: r.session_id } : null;
  }

  async logout(token: string): Promise<void> {
    await this.sql`UPDATE admin_sessions SET revoked_at = now() WHERE token_hash = ${hashToken(this.secret, token, 'admin')} AND revoked_at IS NULL`;
  }

  sessionCookie(token: string): string {
    return serializeCookie(ADMIN_COOKIE, token, { path: '/api/admin', httpOnly: true, secure: this.secureCookie, sameSite: 'Strict', maxAge: this.ttlHours * 3600 });
  }

  clearCookie(): string {
    return serializeCookie(ADMIN_COOKIE, '', { path: '/api/admin', httpOnly: true, secure: this.secureCookie, sameSite: 'Strict', maxAge: 0 });
  }

  /** Rejects requests whose Origin is present and not our own (defense in depth next to SameSite + CSRF). */
  checkOrigin(ctx: Ctx): void {
    const origin = ctx.req.headers.origin;
    if (!origin) return;
    const host = ctx.req.headers.host;
    let sameHost = false;
    try {
      sameHost = !!host && new URL(origin).host === host;
    } catch {
      sameHost = false;
    }
    if (!sameHost && !this.allowedOrigins.has(origin)) throw new HttpError(403, 'bad_origin', 'Запрос с чужого источника');
  }

  /** Middleware: valid admin session (+ role) and CSRF token for state-changing methods. */
  require(role: AdminRole | null = null): Handler {
    return async (ctx) => {
      const token = ctx.cookies[ADMIN_COOKIE];
      if (!token) throw new HttpError(401, 'unauthorized', 'Требуется вход');
      const admin = await this.verify(token);
      if (!admin) throw new HttpError(401, 'unauthorized', 'Сессия истекла');
      if (role === 'admin' && admin.role !== 'admin') throw new HttpError(403, 'forbidden', 'Недостаточно прав');
      if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
        this.checkOrigin(ctx);
        const header = String(ctx.req.headers['x-csrf-token'] ?? '');
        if (!header || !safeEqualStr(header, this.csrfFor(token))) throw new HttpError(403, 'csrf', 'Неверный CSRF-токен');
      }
      ctx.state.admin = admin;
      ctx.state.adminToken = token;
    };
  }
}

export function currentAdmin(ctx: Ctx): AdminPrincipal {
  const a = ctx.state.admin as AdminPrincipal | undefined;
  if (!a) throw new HttpError(401, 'unauthorized', 'Требуется вход');
  return a;
}
