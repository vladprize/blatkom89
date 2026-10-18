/** `npm run db:migrate` / `npm run db:status` */
import { createDb } from './db.js';
import { migrate, migrationStatus } from './migrate.js';

const cmd = process.argv[2] ?? 'status';
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const sql = createDb(url, { max: 1 });
try {
  if (cmd === 'migrate') {
    const applied = await migrate(sql);
    console.info(applied.length ? `applied: ${applied.join(', ')}` : 'database is up to date');
  } else {
    const s = await migrationStatus(sql);
    console.info(JSON.stringify(s, null, 2));
  }
} finally {
  await sql.end({ timeout: 5 });
}
