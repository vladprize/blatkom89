/**
 * Test harness shared by the persistence/admin test suites: an isolated PostgreSQL schema per suite
 * (safe for parallel test files) and an HTTP app on an ephemeral port.
 * Database: DATABASE_URL_TEST (default postgres://blatkom:blatkom@127.0.0.1:54329/blatkom_test).
 */
import postgres from 'postgres';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { migrate } from '../database/migrate.js';
import type { Sql } from '../database/db.js';
import type { Env } from '../config/env.js';
import { createApp, ROUTE_MODULES } from '../app.js';
import { RoomManager } from '../rooms/RoomManager.js';
import { attachGateway } from '../rooms/gateway.js';
import { SocialHub } from '../social/hub.js';
import { silentLogger } from '../logging/logger.js';
import { createPersistence } from '../services/persistence.js';
import type { Persistence } from '../services/persistence.js';

export const TEST_DB_URL = process.env.DATABASE_URL_TEST ?? 'postgres://blatkom:blatkom@127.0.0.1:54329/blatkom_test';

export interface TestDb {
  sql: Sql;
  schema: string;
  drop(): Promise<void>;
}

export async function testDb(): Promise<TestDb> {
  const schema = `t_${randomBytes(6).toString('hex')}`;
  const root = postgres(TEST_DB_URL, { max: 1, onnotice: () => {} });
  await root.unsafe(`CREATE SCHEMA ${schema}`);
  await root.end({ timeout: 5 });
  const sql = postgres(TEST_DB_URL, { max: 6, onnotice: () => {}, connection: { search_path: schema }, transform: { undefined: null } }) as unknown as Sql;
  await migrate(sql);
  return {
    sql,
    schema,
    async drop() {
      await sql.end({ timeout: 5 });
      const r = postgres(TEST_DB_URL, { max: 1, onnotice: () => {} });
      await r.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await r.end({ timeout: 5 });
    },
  };
}

export const TEST_BOT_TOKEN = '7000000001:AAH-test-token-for-blatkom-unit-tests';

export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: 0,
    PUBLIC_URL: 'http://127.0.0.1:8080',
    DATABASE_URL: TEST_DB_URL,
    DATABASE_POOL_MAX: 4,
    SESSION_SECRET: 'unit-test-session-secret-0123456789-abcdefghijklmnop',
    SESSION_TTL_HOURS: 24,
    TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
    TELEGRAM_BOT_USERNAME: 'blatkom_test_bot',
    TELEGRAM_MINIAPP_SHORT_NAME: 'play',
    TELEGRAM_AUTH_MAX_AGE_SEC: 86400,
    BOT_WARM_MINUTES: 20,
    KEEP_AWAKE: false,
    DEV_AUTH_ENABLED: true,
    GUEST_AUTH_ENABLED: false,
    CORS_ORIGINS: '',
    TRUST_PROXY: false,
    ADMIN_SESSION_TTL_HOURS: 12,
    LOG_LEVEL: 'error',
    SERVER_VERSION: 'test',
    MAX_ROOMS: 10,
    CASES_ENABLED: true,
    NOWPAYMENTS_SANDBOX: false,
    MATCH_DURATION_SEC: 240,
    MATCH_SCORE_LIMIT: 50,
    MATCH_MIN_PLAYERS: 2,
    MATCH_MAX_PLAYERS: 6,
    MATCH_TEAM_SCORE_LIMIT: 40,
    MATCH_CAPTURE_LIMIT: 3,
    GUEST_SIGNUPS_PER_IP_HOUR: 10,
    MATCH_BASE_SCORE_LIMIT: 250,
    MATCH_FILL_BOTS: false,
    ...overrides,
  };
}

export interface TestApp {
  db: TestDb;
  env: Env;
  persistence: Persistence;
  rooms: RoomManager;
  social: SocialHub;
  base: string;
  /** ws://… — `/ws` (rooms) and `/ws/social` are attached. */
  wsBase: string;
  server: Server;
  close(): Promise<void>;
}

export async function startTestApp(envOverrides: Partial<Env> = {}): Promise<TestApp> {
  const db = await testDb();
  const env = testEnv(envOverrides);
  const persistence = await createPersistence({ sql: db.sql, env, log: silentLogger });
  const rooms = new RoomManager(persistence.services, silentLogger, { maxRooms: 10, fillBots: env.MATCH_FILL_BOTS });
  const social = new SocialHub(rooms, silentLogger);
  rooms.onPresence((userId) => void social.announce(userId));
  const handler = createApp({ env, sql: db.sql, log: silentLogger, services: persistence.services, rooms, social }, ROUTE_MODULES);
  const server = createServer((req, res) => void handler(req, res));
  const wss = attachGateway(server, rooms, persistence.services, silentLogger, { allowedOrigins: [], publicUrl: env.PUBLIC_URL, maxConnectionsPerIp: 64, trustProxy: false }, social);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  rooms.start();
  return {
    db,
    env,
    persistence,
    rooms,
    social,
    base,
    wsBase: `ws://127.0.0.1:${port}`,
    server,
    async close() {
      social.closeAll();
      for (const c of wss.clients) c.terminate();
      wss.close();
      rooms.stop();
      await persistence.close?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.drop();
    },
  };
}

export interface ApiResult<T = any> {
  status: number;
  body: T;
  text: string;
  headers: Headers;
}

export async function api<T = any>(
  base: string,
  path: string,
  opts: { method?: string; body?: unknown; token?: string; cookie?: string; csrf?: string; headers?: Record<string, string> } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.csrf) headers['x-csrf-token'] = opts.csrf;
  const res = await fetch(base + path, { method: opts.method ?? 'GET', headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: res.status, body, text, headers: res.headers };
}

/** Extracts `name=value` from a Set-Cookie header for re-sending. */
export function cookieFrom(headers: Headers, name: string): string | null {
  const raw = headers.get('set-cookie');
  if (!raw) return null;
  const m = new RegExp(`${name}=([^;]*)`).exec(raw);
  return m && m[1] ? `${name}=${m[1]}` : null;
}

export async function devLogin(base: string, name: string, deviceId?: string): Promise<{ token: string; userId: string; deviceId: string }> {
  const r = await api(base, '/api/auth/dev', { method: 'POST', body: { name, deviceId: deviceId ?? `dev-${randomBytes(6).toString('hex')}` } });
  if (r.status !== 200) throw new Error(`dev login failed: ${r.status} ${r.text}`);
  return { token: r.body.token, userId: r.body.profile.id, deviceId: r.body.deviceId };
}
