/** Server entry point: HTTP API + static client + WebSocket game rooms on one port. */
import { createServer } from 'node:http';
import { loadEnv, matchConfigFromEnv } from './config/env.js';
import { createLogger } from './logging/logger.js';
import { createDb } from './database/db.js';
import { migrate } from './database/migrate.js';
import { createApp } from './app.js';
import { RoomManager } from './rooms/RoomManager.js';
import { attachGateway } from './rooms/gateway.js';
import { SocialHub } from './social/hub.js';
import { createPersistence } from './services/persistence.js';
import { KeepAwake } from './services/keepAwake.js';
import { setupBot } from './telegram/bot.js';
import { notifyReferral } from './api/blat.js';

const env = loadEnv();
const log = createLogger(env.LOG_LEVEL, { service: 'blatkom-server', version: env.SERVER_VERSION });
const sql = createDb(env.DATABASE_URL, { max: env.DATABASE_POOL_MAX, log });

const applied = await migrate(sql);
if (applied.length) log.info('migrations applied', { applied });

const persistence = await createPersistence({ sql, env, log });
const services = persistence.services;
const rooms = new RoomManager(services, log, { maxRooms: env.MAX_ROOMS, config: matchConfigFromEnv(env), fillBots: env.MATCH_FILL_BOTS });
const social = new SocialHub(rooms, log);
rooms.onPresence((userId) => void social.announce(userId));
// V2.0: an invitation counted after a match — the inviter hears it live
if (persistence.recorder) persistence.recorder.onReferral = (r) => notifyReferral(social, r);
const keepAwake = new KeepAwake(env.PUBLIC_URL, { always: env.KEEP_AWAKE, log });
const handler = createApp({ env, sql, log, services, rooms, social, keepAwake });
const server = createServer((req, res) => {
  handler(req, res).catch((e: Error) => log.error('fatal request error', { err: e }));
});
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;
attachGateway(server, rooms, services, log, {
  allowedOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  publicUrl: env.PUBLIC_URL,
  // a game socket and a social socket per app window: 24 players behind one address, as before v0.23
  maxConnectionsPerIp: 48,
  trustProxy: env.TRUST_PROXY,
}, social);
rooms.start();
server.listen(env.PORT, env.HOST, () => {
  log.info('listening', { host: env.HOST, port: env.PORT, publicUrl: env.PUBLIC_URL, devAuth: env.DEV_AUTH_ENABLED });
  keepAwake.start();
  // the Telegram bot (TELEGRAM_BOT_TOKEN + an https PUBLIC_URL): webhook and settings, once per address
  void setupBot(env, log).then((r) => r !== 'off' && log.info('telegram bot', { setup: r }));
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info('shutting down', { signal });
  rooms.stop();
  keepAwake.stop();
  server.close();
  await persistence.close?.();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (e) => log.error('unhandledRejection', { err: e as Error }));
