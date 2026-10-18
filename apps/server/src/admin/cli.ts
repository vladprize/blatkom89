/**
 * `npm run admin:create` — creates an admin or viewer account.
 * Uses DATABASE_URL, SESSION_SECRET (not needed for creation), ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_ROLE.
 * Missing username/password are prompted interactively (password input is not echoed).
 */
import { createInterface } from 'node:readline';
import { createDb } from '../database/db.js';
import { migrate } from '../database/migrate.js';
import { createLogger } from '../logging/logger.js';
import { AdminAuth } from './auth.js';
import { audit } from './audit.js';
import { passwordProblems } from './password.js';

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const anyRl = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
      anyRl._writeToOutput = (s: string) => {
        if (s.includes(question)) anyRl.output.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

const cmd = process.argv[2];
if (cmd !== 'create') {
  console.error('usage: admin:create   (env: DATABASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_ROLE=admin|viewer)');
  process.exit(2);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const username = (process.env.ADMIN_USERNAME || (await ask('Логин администратора: '))).toLowerCase();
const password = process.env.ADMIN_PASSWORD || (await ask('Пароль (мин. 12 символов): ', true));
const role = process.env.ADMIN_ROLE === 'viewer' ? 'viewer' : 'admin';
if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
  console.error('Логин: 3–32 символа a-z 0-9 _ . -');
  process.exit(1);
}
const problem = passwordProblems(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}
const log = createLogger('warn');
const sql = createDb(url, { max: 1 });
try {
  await migrate(sql);
  const auth = new AdminAuth(sql, process.env.SESSION_SECRET ?? 'cli-not-used-for-creation-0000000000', 12, false, new Set());
  const id = await auth.createAdmin(username, password, role);
  await audit(sql, log, { adminId: id, action: 'admin_created_cli', target: username, details: { role } });
  console.info(`created ${role} "${username}" (${id})`);
} catch (e) {
  const err = e as Error & { code?: string };
  console.error(err.code === '23505' ? `Администратор "${username}" уже существует` : `failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
