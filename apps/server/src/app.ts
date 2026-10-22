/** HTTP application: middleware, route modules, static client, health checks. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Router, HttpError, createCtx } from './http/router.js';
import type { Ctx } from './http/router.js';
import { serveStatic, securityHeaders } from './http/static.js';
import type { Env } from './config/env.js';
import type { Logger } from './logging/logger.js';
import type { Sql } from './database/db.js';
import type { Services } from './services/contracts.js';
import type { RoomManager } from './rooms/RoomManager.js';
import type { SocialHub } from './social/hub.js';
import { registerRoomRoutes } from './api/rooms.js';
import { registerAuthRoutes } from './api/auth.js';
import { registerProfileRoutes } from './api/profile.js';
import { registerEventRoutes } from './api/events.js';
import { registerAdminRoutes } from './admin/routes.js';
import { registerShopRoutes } from './api/shop.js';
import { registerSocialRoutes } from './api/social.js';
import { registerTelegramRoutes } from './telegram/bot.js';
import { registerClubRoutes } from './api/clubs.js';
import { registerOAuthRoutes } from './api/oauth.js';
import { registerBlatRoutes } from './api/blat.js';
import type { KeepAwake } from './services/keepAwake.js';

export interface AppDeps {
  env: Env;
  sql: Sql | null;
  log: Logger;
  services: Services;
  rooms: RoomManager;
  /** Presence and live social events (`/ws/social`); routes make their own when absent (tests). */
  social?: SocialHub;
  /** Keeps a free host awake after the Telegram bot hands out a link (services/keepAwake.ts). */
  keepAwake?: KeepAwake;
  /** Calls to the sign-in providers (tests pass a fake). */
  oauthFetch?: typeof fetch;
}

export type RouteModule = (router: Router, deps: AppDeps) => void;

export const ROUTE_MODULES: RouteModule[] = [registerAuthRoutes, registerOAuthRoutes, registerProfileRoutes, registerRoomRoutes, registerEventRoutes, registerShopRoutes, registerSocialRoutes, registerClubRoutes, registerBlatRoutes, registerTelegramRoutes, registerAdminRoutes];

export function createApp(deps: AppDeps, modules: RouteModule[] = ROUTE_MODULES) {
  const router = new Router();
  const startedAt = Date.now();
  router.get('/api/health', (ctx) => ctx.json(200, { ok: true, version: deps.env.SERVER_VERSION, uptimeSec: Math.round((Date.now() - startedAt) / 1000), rooms: deps.rooms.count() }));
  router.get('/api/ready', async (ctx) => {
    if (deps.sql) {
      try {
        await deps.sql`SELECT 1`;
      } catch {
        return ctx.json(503, { ok: false, db: false });
      }
    }
    ctx.json(200, { ok: true, db: !!deps.sql });
  });
  for (const m of modules) m(router, deps);
  const statics = deps.env.STATIC_DIR ? serveStatic(deps.env.STATIC_DIR) : null;
  const allowed = new Set(deps.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean));

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = randomUUID();
    const ctx: Ctx = createCtx(req, res, { trustProxy: deps.env.TRUST_PROXY, requestId, log: deps.log });
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
      res.setHeader('access-control-allow-credentials', 'true');
      res.setHeader('access-control-allow-headers', 'authorization, content-type, x-csrf-token');
      res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    }
    if (ctx.method === 'OPTIONS') {
      res.writeHead(origin && allowed.has(origin) ? 204 : 403);
      res.end();
      return;
    }
    const t0 = performance.now();
    try {
      if (ctx.path.startsWith('/api/')) {
        for (const [k, v] of Object.entries(securityHeaders(false))) res.setHeader(k, v);
        const handled = await router.handle(ctx);
        if (!handled) throw new HttpError(404, 'not_found', 'Not found');
      } else if (!statics || !statics(ctx)) {
        ctx.send(404, 'Not found', 'text/plain; charset=utf-8', securityHeaders(false));
      }
    } catch (err) {
      if (err instanceof HttpError) {
        ctx.json(err.status, { error: { code: err.code, message: err.message } }, err.headers);
      } else {
        deps.log.error('unhandled request error', { requestId, path: ctx.path, err: err as Error });
        deps.services.analytics.error({ source: 'server', component: 'http', category: 'unhandled', message: (err as Error).message ?? 'error' });
        ctx.json(500, { error: { code: 'internal', message: 'Internal error' } });
      }
    } finally {
      if (ctx.path.startsWith('/api/')) {
        deps.log.debug('http', { requestId, method: ctx.method, path: ctx.path, status: res.statusCode, ms: Math.round(performance.now() - t0) });
      }
    }
  };
}
