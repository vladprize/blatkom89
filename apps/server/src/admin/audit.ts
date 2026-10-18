/** Append-only admin audit log. */
import type postgres from 'postgres';
import type { Sql } from '../database/db.js';
import type { Logger } from '../logging/logger.js';

export interface AuditEntry {
  adminId: string | null;
  action: string;
  target?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}

export async function audit(sql: Sql, log: Logger, e: AuditEntry): Promise<void> {
  try {
    await sql`
      INSERT INTO admin_audit_log (admin_id, action, target, details, ip)
      VALUES (${e.adminId}, ${e.action}, ${e.target ?? null}, ${sql.json((e.details ?? {}) as postgres.JSONValue)}, ${e.ip ?? null})`;
  } catch (err) {
    log.error('audit write failed', { err: err as Error, action: e.action });
  }
}
