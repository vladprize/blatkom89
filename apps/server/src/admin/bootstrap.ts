/** Creates the first admin from ADMIN_BOOTSTRAP_* only when no admin exists yet. */
import type { Sql } from '../database/db.js';
import type { Logger } from '../logging/logger.js';
import type { AdminAuth } from './auth.js';
import { passwordProblems } from './password.js';
import { audit } from './audit.js';

export async function bootstrapAdmin(sql: Sql, auth: AdminAuth, log: Logger, username?: string, password?: string): Promise<'created' | 'skipped' | 'invalid'> {
  if (!username || !password) return 'skipped';
  if ((await auth.adminCount()) > 0) {
    log.warn('ADMIN_BOOTSTRAP_* is set but an admin already exists — remove these variables');
    return 'skipped';
  }
  const problem = passwordProblems(password);
  if (problem || !/^[a-z0-9_.-]{3,32}$/.test(username.toLowerCase())) {
    log.error('admin bootstrap refused: weak password or invalid username', { problem });
    return 'invalid';
  }
  const id = await auth.createAdmin(username, password, 'admin');
  await audit(sql, log, { adminId: id, action: 'admin_bootstrap', target: username.toLowerCase() });
  log.warn('bootstrap admin created — remove ADMIN_BOOTSTRAP_PASSWORD from the environment now', { username: username.toLowerCase() });
  return 'created';
}
