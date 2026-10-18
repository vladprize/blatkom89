/**
 * PostgreSQL-backed implementations of the service contracts.
 * Placeholder wiring until the persistence workstream lands: uses in-memory services.
 */
import type { Sql } from '../database/db.js';
import type { Env } from '../config/env.js';
import type { Logger } from '../logging/logger.js';
import type { Services } from './contracts.js';
import { memoryServices } from './memory.js';

export interface Persistence {
  services: Services;
  close?(): Promise<void>;
}

export async function createPersistence(_deps: { sql: Sql; env: Env; log: Logger }): Promise<Persistence> {
  return { services: memoryServices() };
}
