/** Player sessions: opaque bearer tokens, HMAC-hashed at rest, with expiry and revocation. */
import type { Sql } from '../database/db.js';
import type { Logger } from '../logging/logger.js';
import type { AuthedUser, SessionVerifier } from '../services/contracts.js';
import type { Platform } from '@blatkom/shared';
import { hashToken, newToken } from './tokens.js';
import type { ActivityTracker } from './activity.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{16,256}$/;
const LAST_SEEN_THROTTLE_MS = 5 * 60_000;

export interface IssuedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export class SessionStore implements SessionVerifier {
  private readonly lastSeenWrite = new Map<string, number>();

  constructor(
    private readonly sql: Sql,
    private readonly secret: string,
    private readonly ttlHours: number,
    private readonly activity: ActivityTracker,
    private readonly log: Logger,
  ) {}

  async issue(userId: string, method: 'telegram' | 'dev', platform: string | null, clientVersion: string | null): Promise<IssuedSession> {
    const token = newToken(32);
    const expiresAt = new Date(Date.now() + this.ttlHours * 3600_000);
    const rows = await this.sql<Array<{ id: string }>>`
      INSERT INTO sessions (user_id, token_hash, method, platform, client_version, expires_at)
      VALUES (${userId}, ${hashToken(this.secret, token)}, ${method}, ${platform}, ${clientVersion}, ${expiresAt})
      RETURNING id`;
    await this.sql`UPDATE users SET last_seen_at = now() WHERE id = ${userId}`;
    await this.activity.touch(userId);
    return { token, sessionId: rows[0]!.id, expiresAt };
  }

  async verify(token: string): Promise<AuthedUser | null> {
    if (!TOKEN_RE.test(token)) return null;
    const rows = await this.sql<Array<{ session_id: string; user_id: string; platform: string | null; last_seen_at: Date; display_name: string; level: number | null }>>`
      SELECT s.id AS session_id, s.user_id, s.platform, s.last_seen_at, u.display_name, p.level
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE s.token_hash = ${hashToken(this.secret, token)}
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.deleted_at IS NULL`;
    const r = rows[0];
    if (!r) return null;
    const now = Date.now();
    const last = this.lastSeenWrite.get(r.session_id) ?? r.last_seen_at.getTime();
    if (now - last > LAST_SEEN_THROTTLE_MS) {
      this.lastSeenWrite.set(r.session_id, now);
      if (this.lastSeenWrite.size > 50_000) this.lastSeenWrite.clear();
      this.sql`UPDATE sessions SET last_seen_at = now() WHERE id = ${r.session_id}`.catch((e: Error) => this.log.warn('session touch failed', { err: e }));
      this.sql`UPDATE users SET last_seen_at = now() WHERE id = ${r.user_id}`.catch((e: Error) => this.log.warn('user touch failed', { err: e }));
    }
    void this.activity.touch(r.user_id);
    return { userId: r.user_id, sessionId: r.session_id, displayName: r.display_name, level: r.level ?? 1, platform: (r.platform as Platform | null) ?? null };
  }

  async revoke(token: string): Promise<boolean> {
    if (!TOKEN_RE.test(token)) return false;
    const rows = await this.sql`UPDATE sessions SET revoked_at = now() WHERE token_hash = ${hashToken(this.secret, token)} AND revoked_at IS NULL RETURNING id`;
    return rows.length > 0;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.sql`UPDATE sessions SET revoked_at = now() WHERE user_id = ${userId} AND revoked_at IS NULL`;
  }
}
