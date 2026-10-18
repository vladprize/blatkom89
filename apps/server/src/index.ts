/** Server entry point: HTTP API + static client + WebSocket game rooms on one port. */
import { createServer } from 'node:http';
import { loadEnv } from './config/env.js';
import { createLogger } from './logging/logger.js';
import { createDb } from './database/db.js';
import { migrate } from './database/migrate.js';
import { createApp } from './app.js';
import { RoomManager } from './rooms/RoomManager.js';
import { attachGateway } from './rooms/gateway.js';
import { createPersistence } from './services/persistence.js';

const env = loadEnv();
const log = createLogger(env.LOG_LEVEL, { service: 'blatkom-server', version: env.SERVER_VERSION });
const sql = createDb(env.DATABASE_URL, { max: env.DATABASE_POOL_MAX, log });

const applied = await migrate(sql);
if (applied.length) log.info('migrations applied', { applied });

const persistence = await createPersistence({ sql, env, log });
const services = persistence.services;
const rooms = new RoomManager(services, log, { maxRooms: env.MAX_ROOMS });
const handler = createApp({ env, sql, log, services, rooms });
const server = createServer((req, res) => {
  handler(req, res).catch((e: Error) => log.error('fatal request error', { err: e }));
});
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;
attachGateway(server, rooms, services, log, {
  allowedOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  publicUrl: env.PUBLIC_URL,
  maxConnectionsPerIp: 24,
  trustProxy: env.TRUST_PROXY,
});
rooms.start();
server.listen(env.PORT, env.HOST, () => log.info('listening', { host: env.HOST, port: env.PORT, publicUrl: env.PUBLIC_URL, devAuth: env.DEV_AUTH_ENABLED }));

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info('shutting down', { signal });
  rooms.stop();
  server.close();
  await persistence.close?.();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (e) => log.error('unhandledRejection', { err: e as Error }));
