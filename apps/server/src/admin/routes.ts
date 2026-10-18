/** /api/admin/* — secure analytics dashboard API (see docs/ADMIN.md). */
import { AdminCreateUserRequest, AdminLoginRequest, getMap, isMapId, levelForXp } from '@blatkom/shared';
import type { AdminMe, AdminPlayerDetail, CharacterId } from '@blatkom/shared';
import type { RouteModule } from '../app.js';
import { HttpError } from '../http/router.js';
import type { Ctx } from '../http/router.js';
import { RateLimiter } from '../security/rateLimit.js';
import { pgContext } from '../services/persistence.js';
import { currentAdmin } from './auth.js';
import { audit } from './audit.js';
import { toCsv } from './csv.js';
import { passwordProblems } from './password.js';
import { RangeError400, charts, dailyMetrics, errorGroups, listPlayers, overview, playerErrors, resolveRange, toPlayerRow } from '../analytics/metrics.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const registerAdminRoutes: RouteModule = (router, deps) => {
  const loginPerIp = new RateLimiter(10, 10 / 60);
  const loginPerUser = new RateLimiter(5, 5 / 300);
  const pg = () => {
    if (!deps.sql) throw new HttpError(503, 'persistence_unavailable', 'База данных недоступна');
    return pgContext(deps.sql, deps.env, deps.log);
  };
  const viewer = (ctx: Ctx) => pg().adminAuth.require(null)(ctx);
  const admin = (ctx: Ctx) => pg().adminAuth.require('admin')(ctx);
  const range = (ctx: Ctx) => {
    try {
      return resolveRange(ctx.query.get('range'), ctx.query.get('from'), ctx.query.get('to'));
    } catch (e) {
      if (e instanceof RangeError400) throw new HttpError(400, 'bad_range', e.message);
      throw e;
    }
  };
  const me = (ctx: Ctx): AdminMe => {
    const a = currentAdmin(ctx);
    return { id: a.id, username: a.username, role: a.role, csrfToken: pg().adminAuth.csrfFor(String(ctx.state.adminToken)) };
  };
  const csv = (ctx: Ctx, name: string, body: string) =>
    ctx.send(200, body, 'text/csv; charset=utf-8', { 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' });

  router.post('/api/admin/login', async (ctx) => {
    const p = pg();
    p.adminAuth.checkOrigin(ctx);
    if (!loginPerIp.take(ctx.ip)) throw new HttpError(429, 'rate_limited', 'Слишком много попыток, подождите', { 'retry-after': '60' });
    const body = await ctx.body(AdminLoginRequest, 2048);
    const key = `${ctx.ip}|${body.username.toLowerCase()}`;
    if (!loginPerUser.take(key)) throw new HttpError(429, 'rate_limited', 'Слишком много попыток, подождите', { 'retry-after': '300' });
    const res = await p.adminAuth.login(body.username, body.password, ctx.ip, String(ctx.req.headers['user-agent'] ?? ''));
    if (!res) {
      await audit(p.sql, deps.log, { adminId: null, action: 'login_failed', target: body.username.toLowerCase().slice(0, 32), ip: ctx.ip });
      throw new HttpError(401, 'bad_credentials', 'Неверный логин или пароль');
    }
    await audit(p.sql, deps.log, { adminId: res.admin.id, action: 'login', ip: ctx.ip });
    const out: AdminMe = { id: res.admin.id, username: res.admin.username, role: res.admin.role, csrfToken: res.csrf };
    ctx.json(200, out, { 'set-cookie': p.adminAuth.sessionCookie(res.token) });
  });

  router.post('/api/admin/logout', viewer, async (ctx) => {
    const p = pg();
    await p.adminAuth.logout(String(ctx.state.adminToken));
    await audit(p.sql, deps.log, { adminId: currentAdmin(ctx).id, action: 'logout', ip: ctx.ip });
    ctx.json(200, { ok: true }, { 'set-cookie': p.adminAuth.clearCookie() });
  });

  router.get('/api/admin/me', viewer, (ctx) => ctx.json(200, me(ctx)));

  router.get('/api/admin/overview', viewer, async (ctx) => {
    ctx.json(200, await overview(pg().sql, range(ctx), deps.rooms.count()));
  });

  router.get('/api/admin/charts', viewer, async (ctx) => {
    ctx.json(200, await charts(pg().sql, range(ctx)));
  });

  router.get('/api/admin/rooms', viewer, (ctx) => {
    ctx.json(200, deps.rooms.list().map((r) => ({ ...r.info(), mapName: getMap(r.mapId).name, createdAt: new Date(r.createdAt).toISOString() })));
  });

  router.get('/api/admin/players', viewer, async (ctx) => {
    ctx.json(
      200,
      await listPlayers(pg().sql, {
        q: ctx.query.get('q'),
        sort: ctx.query.get('sort'),
        dir: ctx.query.get('dir'),
        page: Number(ctx.query.get('page') ?? 1) || 1,
        pageSize: Number(ctx.query.get('pageSize') ?? 25) || 25,
      }),
    );
  });

  router.get('/api/admin/players/:id', viewer, async (ctx) => {
    const id = ctx.params.id ?? '';
    if (!UUID_RE.test(id)) throw new HttpError(400, 'bad_id', 'Неверный идентификатор');
    const p = pg();
    const rows = await p.sql<
      Array<{ id: string; display_name: string; telegram_id: string | null; created_at: Date; last_seen_at: Date; language_code: string | null; platform: string | null; level: number; xp: number; matches_played: number; matches_completed: number; wins: number; losses: number; kills: number; assists: number; deaths: number; playtime_sec: number; current_win_streak: number; best_win_streak: number; preferred_character: CharacterId | null }>
    >`
      SELECT u.id, u.display_name, u.telegram_id::text AS telegram_id, u.created_at, u.last_seen_at, u.language_code, u.platform,
             COALESCE(p.level, 1) AS level, COALESCE(p.xp, 0) AS xp, COALESCE(p.matches_played, 0) AS matches_played,
             COALESCE(p.matches_completed, 0) AS matches_completed, COALESCE(p.wins, 0) AS wins, COALESCE(p.losses, 0) AS losses,
             COALESCE(p.kills, 0) AS kills, COALESCE(p.assists, 0) AS assists, COALESCE(p.deaths, 0) AS deaths, COALESCE(p.playtime_sec, 0) AS playtime_sec,
             COALESCE(p.current_win_streak, 0) AS current_win_streak, COALESCE(p.best_win_streak, 0) AS best_win_streak, p.preferred_character
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ${id} AND u.deleted_at IS NULL`;
    const r = rows[0];
    if (!r) throw new HttpError(404, 'not_found', 'Игрок не найден');
    const [s] = await p.sql<Array<{ total: number; active: number; last_platform: string | null; last_client: string | null }>>`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE revoked_at IS NULL AND expires_at > now())::int AS active,
             (array_agg(platform ORDER BY created_at DESC))[1] AS last_platform,
             (array_agg(client_version ORDER BY created_at DESC))[1] AS last_client
      FROM sessions WHERE user_id = ${id}`;
    // Viewing an individual player's record (incl. Telegram ID) is audited like exports.
    await audit(p.sql, deps.log, { adminId: currentAdmin(ctx).id, action: 'player_viewed', target: id, ip: ctx.ip });
    const lv = levelForXp(r.xp);
    const detail: AdminPlayerDetail = {
      player: {
        ...toPlayerRow(r),
        matchesCompleted: r.matches_completed,
        currentWinStreak: r.current_win_streak,
        bestWinStreak: r.best_win_streak,
        preferredCharacter: r.preferred_character,
        xpIntoLevel: lv.intoLevel,
        xpForNextLevel: lv.nextLevelCost,
        languageCode: r.language_code,
        platform: r.platform,
      },
      sessions: { total: s!.total, active: s!.active, lastPlatform: s!.last_platform, lastClientVersion: s!.last_client },
      achievements: await p.profiles.achievements(id),
      matches: await p.profiles.history(id, 50),
      errors: await playerErrors(p.sql, id, 50),
    };
    ctx.json(200, detail);
  });

  router.get('/api/admin/errors', viewer, async (ctx) => {
    ctx.json(200, await errorGroups(pg().sql, range(ctx)));
  });

  router.get('/api/admin/audit', admin, async (ctx) => {
    const rows = await pg().sql<Array<{ id: string; created_at: Date; action: string; target: string | null; ip: string | null; username: string | null; details: unknown }>>`
      SELECT l.id::text AS id, l.created_at, l.action, l.target, l.ip, a.username, l.details
      FROM admin_audit_log l LEFT JOIN admin_users a ON a.id = l.admin_id
      ORDER BY l.created_at DESC LIMIT 200`;
    ctx.json(200, rows.map((r) => ({ id: Number(r.id), at: r.created_at.toISOString(), action: r.action, target: r.target, ip: r.ip, username: r.username, details: r.details })));
  });

  router.post('/api/admin/users', admin, async (ctx) => {
    const p = pg();
    const body = await ctx.body(AdminCreateUserRequest, 2048);
    const problem = passwordProblems(body.password);
    if (problem) throw new HttpError(400, 'weak_password', problem);
    let id: string;
    try {
      id = await p.adminAuth.createAdmin(body.username, body.password, body.role);
    } catch {
      throw new HttpError(409, 'exists', 'Такой администратор уже существует');
    }
    await audit(p.sql, deps.log, { adminId: currentAdmin(ctx).id, action: 'admin_created', target: body.username, details: { role: body.role }, ip: ctx.ip });
    ctx.json(201, { id, username: body.username, role: body.role });
  });

  // ── CSV exports (admin role, audited) ────────────────────────────────────
  router.get('/api/admin/export/players.csv', admin, async (ctx) => {
    const p = pg();
    const rows = await p.sql<Array<{ id: string; display_name: string; telegram_id: string | null; created_at: Date; last_seen_at: Date; level: number; xp: number; matches_played: number; wins: number; losses: number; kills: number; assists: number; deaths: number; playtime_sec: number }>>`
      SELECT u.id, u.display_name, u.telegram_id::text AS telegram_id, u.created_at, u.last_seen_at,
             COALESCE(p.level, 1) AS level, COALESCE(p.xp, 0) AS xp, COALESCE(p.matches_played, 0) AS matches_played,
             COALESCE(p.wins, 0) AS wins, COALESCE(p.losses, 0) AS losses, COALESCE(p.kills, 0) AS kills,
             COALESCE(p.assists, 0) AS assists, COALESCE(p.deaths, 0) AS deaths, COALESCE(p.playtime_sec, 0) AS playtime_sec
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.deleted_at IS NULL ORDER BY u.created_at`;
    await audit(p.sql, deps.log, { adminId: currentAdmin(ctx).id, action: 'export_players', details: { rows: rows.length }, ip: ctx.ip });
    csv(
      ctx,
      'players.csv',
      toCsv(
        ['id', 'display_name', 'telegram_id', 'registered_at', 'last_activity', 'level', 'xp', 'matches', 'wins', 'losses', 'eliminations', 'assists', 'deaths', 'playtime_sec'],
        rows.map((r) => [r.id, r.display_name, r.telegram_id, r.created_at, r.last_seen_at, r.level, r.xp, r.matches_played, r.wins, r.losses, r.kills, r.assists, r.deaths, r.playtime_sec]),
      ),
    );
  });

  router.get('/api/admin/export/matches.csv', admin, async (ctx) => {
    const p = pg();
    const r = range(ctx);
    const rows = await p.sql<Array<{ id: string; room_id: string; map_id: string; is_private: boolean; status: string; started_at: Date; ended_at: Date | null; duration_ms: number | null; end_reason: string | null; player_count: number }>>`
      SELECT id, room_id, map_id, is_private, status, started_at, ended_at, duration_ms, end_reason, player_count
      FROM matches WHERE started_at BETWEEN ${new Date(r.from)} AND ${new Date(r.to)} ORDER BY started_at`;
    await audit(p.sql, deps.log, { adminId: currentAdmin(ctx).id, action: 'export_matches', details: { rows: rows.length, from: r.from, to: r.to }, ip: ctx.ip });
    csv(
      ctx,
      `matches_${r.firstDay}_${r.lastDay}.csv`,
      toCsv(
        ['match_id', 'room_id', 'map', 'private', 'status', 'started_at', 'ended_at', 'duration_ms', 'end_reason', 'players'],
        rows.map((m) => [m.id, m.room_id, isMapId(m.map_id) ? getMap(m.map_id).name : m.map_id, m.is_private, m.status, m.started_at, m.ended_at, m.duration_ms, m.end_reason, m.player_count]),
      ),
    );
  });

  router.get('/api/admin/export/daily.csv', admin, async (ctx) => {
    const p = pg();
    const r = range(ctx);
    const rows = await dailyMetrics(p.sql, r);
    await audit(p.sql, deps.log, { adminId: currentAdmin(ctx).id, action: 'export_daily', details: { from: r.firstDay, to: r.lastDay }, ip: ctx.ip });
    csv(
      ctx,
      `daily_${r.firstDay}_${r.lastDay}.csv`,
      toCsv(
        ['day', 'registrations', 'dau', 'matches_started', 'matches_completed', 'errors'],
        rows.map((d) => [d.day, d.registrations, d.dau, d.matches_started, d.matches_completed, d.errors]),
      ),
    );
  });
};
