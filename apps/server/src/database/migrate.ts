/** Forward-only SQL migrations with an advisory lock and a schema_migrations ledger. */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Sql } from './db.js';

export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));
const LOCK_ID = 891989;

export interface MigrationStatus {
  applied: string[];
  pending: string[];
}

function listFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
}

async function ensureLedger(sql: Sql) {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
}

export async function migrationStatus(sql: Sql, dir = DEFAULT_MIGRATIONS_DIR): Promise<MigrationStatus> {
  await ensureLedger(sql);
  const rows = await sql<{ version: string }[]>`SELECT version FROM schema_migrations ORDER BY version`;
  const applied = rows.map((r) => r.version);
  return { applied, pending: listFiles(dir).filter((f) => !applied.includes(f)) };
}

export async function migrate(sql: Sql, dir = DEFAULT_MIGRATIONS_DIR): Promise<string[]> {
  await ensureLedger(sql);
  const done: string[] = [];
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK_ID})`;
    const rows = await tx<{ version: string }[]>`SELECT version FROM schema_migrations`;
    const applied = new Set(rows.map((r) => r.version));
    for (const file of listFiles(dir)) {
      if (applied.has(file)) continue;
      await tx.unsafe(readFileSync(`${dir}/${file}`, 'utf8'));
      await tx`INSERT INTO schema_migrations (version) VALUES (${file})`;
      done.push(file);
    }
  });
  return done;
}
