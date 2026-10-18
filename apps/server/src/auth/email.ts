/**
 * Email sign-in: an email + password attached to an existing account so that it can be restored on
 * any device (e.g. after buying diamonds). Passwords are scrypt-hashed; reset tokens are random,
 * stored as HMAC hashes, single-use and expire after an hour.
 */
import type { Sql } from '../database/db.js';
import type { Logger } from '../logging/logger.js';
import { hashPassword, verifyPassword, DUMMY_HASH } from '../admin/password.js';
import { hashToken, newToken } from './tokens.js';

export const RESET_TTL_MS = 3600_000;

export type LinkResult = 'ok' | 'already_linked' | 'email_taken';

export class EmailAuth {
  constructor(
    private readonly sql: Sql,
    private readonly secret: string,
    private readonly log: Logger,
  ) {}

  /** Returns the user id for valid credentials (constant-time-ish when the email is unknown). */
  async verify(email: string, password: string): Promise<string | null> {
    const rows = await this.sql<Array<{ id: string; password_hash: string | null }>>`
      SELECT id, password_hash FROM users WHERE email = ${email} AND deleted_at IS NULL`;
    const r = rows[0];
    const ok = await verifyPassword(password, r?.password_hash ?? DUMMY_HASH);
    return r && r.password_hash && ok ? r.id : null;
  }

  async link(userId: string, email: string, password: string): Promise<LinkResult> {
    const hash = await hashPassword(password);
    return this.sql.begin(async (tx) => {
      const [me] = await tx<Array<{ email: string | null }>>`SELECT email FROM users WHERE id = ${userId} FOR UPDATE`;
      if (me?.email) return 'already_linked';
      const taken = await tx`SELECT 1 FROM users WHERE email = ${email} AND id <> ${userId}`;
      if (taken.length) return 'email_taken';
      await tx`UPDATE users SET email = ${email}, password_hash = ${hash}, email_linked_at = now() WHERE id = ${userId}`;
      this.log.info('email linked', { userId });
      return 'ok';
    });
  }

  async changePassword(userId: string, current: string, next: string): Promise<boolean> {
    const rows = await this.sql<Array<{ password_hash: string | null }>>`SELECT password_hash FROM users WHERE id = ${userId}`;
    const stored = rows[0]?.password_hash;
    if (!stored || !(await verifyPassword(current, stored))) return false;
    await this.sql`UPDATE users SET password_hash = ${await hashPassword(next)} WHERE id = ${userId}`;
    return true;
  }

  /** Creates a single-use reset token for the account with this email (null when unknown). */
  async createReset(by: 'email' | 'admin', target: { email: string } | { userId: string }): Promise<{ token: string; userId: string } | null> {
    const rows =
      'email' in target
        ? await this.sql<Array<{ id: string }>>`SELECT id FROM users WHERE email = ${target.email} AND deleted_at IS NULL`
        : await this.sql<Array<{ id: string }>>`SELECT id FROM users WHERE id = ${target.userId} AND email IS NOT NULL AND deleted_at IS NULL`;
    const userId = rows[0]?.id;
    if (!userId) return null;
    const token = newToken(24);
    await this.sql`INSERT INTO password_resets (token_hash, user_id, expires_at, created_by) VALUES (${hashToken(this.secret, token, 'reset')}, ${userId}, ${new Date(Date.now() + RESET_TTL_MS)}, ${by})`;
    return { token, userId };
  }

  /** Sets a new password with a valid reset token; revokes every session of the account. */
  async consumeReset(token: string, password: string): Promise<string | null> {
    const hash = await hashPassword(password);
    return this.sql.begin(async (tx) => {
      const rows = await tx<Array<{ user_id: string }>>`
        UPDATE password_resets SET used_at = now()
        WHERE token_hash = ${hashToken(this.secret, token, 'reset')} AND used_at IS NULL AND expires_at > now()
        RETURNING user_id`;
      const userId = rows[0]?.user_id;
      if (!userId) return null;
      await tx`UPDATE users SET password_hash = ${hash} WHERE id = ${userId}`;
      await tx`UPDATE sessions SET revoked_at = now() WHERE user_id = ${userId} AND revoked_at IS NULL`;
      return userId;
    });
  }
}

/** Password-reset mail through the Resend HTTP API (no SDK). Returns false when not configured or failed. */
export async function sendResetMail(env: { RESEND_API_KEY?: string | undefined; MAIL_FROM?: string | undefined }, to: string, link: string, log: Logger): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [to],
        subject: 'БЛАТКОМ ’89 — новый пароль',
        text: `Кто-то (надеемся, вы) попросил сменить пароль от аккаунта БЛАТКОМ ’89.\n\nНовый пароль можно задать по ссылке (действует 1 час):\n${link}\n\nЕсли это были не вы — просто удалите письмо.`,
      }),
    });
    if (!res.ok) log.warn('reset mail failed', { status: res.status });
    return res.ok;
  } catch (e) {
    log.warn('reset mail failed', { err: e as Error });
    return false;
  }
}
