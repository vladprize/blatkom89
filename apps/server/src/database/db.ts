/** PostgreSQL access via the `postgres` driver (tagged templates = parameterized queries). */
import postgres from 'postgres';
import type { Logger } from '../logging/logger.js';

export type Sql = postgres.Sql<Record<string, unknown>>;

export function createDb(url: string, opts: { max?: number; log?: Logger } = {}): Sql {
  return postgres(url, {
    max: opts.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: true,
    onnotice: () => {},
    types: {},
    transform: { undefined: null },
  }) as unknown as Sql;
}
