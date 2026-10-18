/**
 * Admin metrics. Every number is computed from canonical tables at request time; when the data needed
 * for a metric does not exist the value is null (never estimated). All days are UTC calendar days.
 * Definitions: docs/ANALYTICS.md.
 */
import type { AdminCharts, AdminErrorGroup, AdminErrorRow, AdminOverview, AdminPlayerRow, AdminPlayersPage, AdminRange, AdminRangeKey } from '@blatkom/shared';
import type { Sql } from '../database/db.js';

const DAY = 86_400_000;

export class RangeError400 extends Error {}

export function utcDayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Resolves a range key (or custom YYYY-MM-DD bounds) into inclusive timestamps and UTC days. */
export function resolveRange(key: string | null, fromStr: string | null, toStr: string | null, now = new Date()): AdminRange {
  const k = (key ?? '7d') as AdminRangeKey;
  let from: Date;
  let to: Date;
  switch (k) {
    case '24h':
      from = new Date(now.getTime() - DAY);
      to = now;
      break;
    case '7d':
    case '30d':
    case '90d': {
      const days = Number(k.replace('d', ''));
      to = now;
      from = new Date(Date.parse(utcDayString(now)) - (days - 1) * DAY);
      break;
    }
    case 'custom': {
      const re = /^\d{4}-\d{2}-\d{2}$/;
      if (!fromStr || !toStr || !re.test(fromStr) || !re.test(toStr)) throw new RangeError400('custom range requires from/to as YYYY-MM-DD');
      from = new Date(`${fromStr}T00:00:00.000Z`);
      to = new Date(`${toStr}T23:59:59.999Z`);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new RangeError400('invalid date');
      if (from > to) throw new RangeError400('from must be before to');
      if (to.getTime() - from.getTime() > 400 * DAY) throw new RangeError400('range too long (max 400 days)');
      break;
    }
    default:
      throw new RangeError400('unknown range');
  }
  return { key: k, from: from.toISOString(), to: to.toISOString(), firstDay: utcDayString(from), lastDay: utcDayString(to) };
}

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export async function overview(sql: Sql, r: AdminRange, activeRooms: number, now = new Date()): Promise<AdminOverview> {
  const from = new Date(r.from);
  const to = new Date(r.to);
  const today = utcDayString(now);
  const [counts] = await sql<
    Array<{ total_players: number; new_players: number; dau: number; wau: number; mau: number; started: number; completed: number; avg_match: number | null; avg_session: number | null; errors: number }>
  >`
    SELECT
      (SELECT count(*) FROM users WHERE deleted_at IS NULL AND created_at <= ${to})::int AS total_players,
      (SELECT count(*) FROM users WHERE deleted_at IS NULL AND created_at BETWEEN ${from} AND ${to})::int AS new_players,
      (SELECT count(*) FROM user_daily_activity WHERE day = ${r.lastDay}::date)::int AS dau,
      (SELECT count(DISTINCT user_id) FROM user_daily_activity WHERE day > ${r.lastDay}::date - 7 AND day <= ${r.lastDay}::date)::int AS wau,
      (SELECT count(DISTINCT user_id) FROM user_daily_activity WHERE day > ${r.lastDay}::date - 30 AND day <= ${r.lastDay}::date)::int AS mau,
      (SELECT count(*) FROM matches WHERE started_at BETWEEN ${from} AND ${to})::int AS started,
      (SELECT count(*) FROM matches WHERE status = 'completed' AND ended_at BETWEEN ${from} AND ${to})::int AS completed,
      (SELECT avg(duration_ms)::float8 FROM matches WHERE status = 'completed' AND ended_at BETWEEN ${from} AND ${to}) AS avg_match,
      (SELECT avg((props->>'durationMs')::float8) FROM analytics_events
         WHERE name = 'session_ended' AND occurred_at BETWEEN ${from} AND ${to} AND jsonb_typeof(props->'durationMs') = 'number') AS avg_session,
      (SELECT count(*) FROM app_errors WHERE occurred_at BETWEEN ${from} AND ${to})::int AS errors`;
  const [conv] = await sql<Array<{ cohort: number; converted: number }>>`
    SELECT count(*)::int AS cohort,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM match_participants mp WHERE mp.user_id = u.id AND mp.completed))::int AS converted
    FROM users u WHERE u.deleted_at IS NULL AND u.created_at BETWEEN ${from} AND ${to}`;
  const [ret] = await sql<Array<{ d1_size: number; d1_ret: number; d7_size: number; d7_ret: number }>>`
    WITH cohort AS (
      SELECT u.id, (u.created_at AT TIME ZONE 'UTC')::date AS d
      FROM users u
      WHERE u.deleted_at IS NULL AND (u.created_at AT TIME ZONE 'UTC')::date BETWEEN ${r.firstDay}::date AND ${r.lastDay}::date
    )
    SELECT
      count(*) FILTER (WHERE c.d + 1 < ${today}::date)::int AS d1_size,
      count(*) FILTER (WHERE c.d + 1 < ${today}::date AND EXISTS (SELECT 1 FROM user_daily_activity a WHERE a.user_id = c.id AND a.day = c.d + 1))::int AS d1_ret,
      count(*) FILTER (WHERE c.d + 7 < ${today}::date)::int AS d7_size,
      count(*) FILTER (WHERE c.d + 7 < ${today}::date AND EXISTS (SELECT 1 FROM user_daily_activity a WHERE a.user_id = c.id AND a.day = c.d + 7))::int AS d7_ret
    FROM cohort c`;
  return {
    range: r,
    generatedAt: now.toISOString(),
    totalPlayers: counts!.total_players,
    newPlayers: counts!.new_players,
    dau: counts!.dau,
    wau: counts!.wau,
    mau: counts!.mau,
    matchesStarted: counts!.started,
    matchesCompleted: counts!.completed,
    activeRooms,
    avgMatchDurationMs: counts!.avg_match === null ? null : Math.round(counts!.avg_match),
    avgSessionDurationMs: counts!.avg_session === null ? null : Math.round(counts!.avg_session),
    firstMatchConversion: ratio(conv!.converted, conv!.cohort),
    d1Retention: ratio(ret!.d1_ret, ret!.d1_size),
    d7Retention: ratio(ret!.d7_ret, ret!.d7_size),
    d1CohortSize: ret!.d1_size,
    d7CohortSize: ret!.d7_size,
    errorCount: counts!.errors,
  };
}

const SESSION_BUCKETS = ['<1 мин', '1–3 мин', '3–5 мин', '5–10 мин', '10–20 мин', '20–30 мин', '30–60 мин', '60+ мин'];
const MATCH_BUCKETS = ['<1 мин', '1–2 мин', '2–3 мин', '3–4 мин', '4–5 мин', '5+ мин'];

function fillBuckets(order: string[], rows: Array<{ bucket: string; count: number }>) {
  const m = new Map(rows.map((r) => [r.bucket, r.count]));
  return order.map((bucket) => ({ bucket, count: m.get(bucket) ?? 0 }));
}

export async function charts(sql: Sql, r: AdminRange, now = new Date()): Promise<AdminCharts> {
  const from = new Date(r.from);
  const to = new Date(r.to);
  const today = utcDayString(now);
  const registrations = await sql<Array<{ day: string; count: number }>>`
    SELECT to_char(g.day, 'YYYY-MM-DD') AS day,
      (SELECT count(*) FROM users u WHERE u.deleted_at IS NULL
         AND u.created_at >= (g.day AT TIME ZONE 'UTC') AND u.created_at < ((g.day + interval '1 day') AT TIME ZONE 'UTC'))::int AS count
    FROM generate_series(${r.firstDay}::date, ${r.lastDay}::date, interval '1 day') AS g(day)
    ORDER BY g.day`;
  const dau = await sql<Array<{ day: string; count: number }>>`
    SELECT to_char(g.day, 'YYYY-MM-DD') AS day, (SELECT count(*) FROM user_daily_activity a WHERE a.day = g.day::date)::int AS count
    FROM generate_series(${r.firstDay}::date, ${r.lastDay}::date, interval '1 day') AS g(day)
    ORDER BY g.day`;
  const matches = await sql<Array<{ day: string; started: number; completed: number }>>`
    SELECT to_char(g.day, 'YYYY-MM-DD') AS day,
      (SELECT count(*) FROM matches m WHERE m.started_at >= (g.day AT TIME ZONE 'UTC') AND m.started_at < ((g.day + interval '1 day') AT TIME ZONE 'UTC'))::int AS started,
      (SELECT count(*) FROM matches m WHERE m.status = 'completed'
         AND m.ended_at >= (g.day AT TIME ZONE 'UTC') AND m.ended_at < ((g.day + interval '1 day') AT TIME ZONE 'UTC'))::int AS completed
    FROM generate_series(${r.firstDay}::date, ${r.lastDay}::date, interval '1 day') AS g(day)
    ORDER BY g.day`;
  const cohorts = await sql<Array<{ day: string; cohort: number; d1: number; d7: number; d1_mature: boolean; d7_mature: boolean }>>`
    WITH days AS (SELECT g.day::date AS d FROM generate_series(${r.firstDay}::date, ${r.lastDay}::date, interval '1 day') AS g(day)),
    cohort AS (
      SELECT u.id, (u.created_at AT TIME ZONE 'UTC')::date AS d FROM users u
      WHERE u.deleted_at IS NULL AND (u.created_at AT TIME ZONE 'UTC')::date BETWEEN ${r.firstDay}::date AND ${r.lastDay}::date
    )
    SELECT to_char(days.d, 'YYYY-MM-DD') AS day,
      count(c.id)::int AS cohort,
      count(c.id) FILTER (WHERE EXISTS (SELECT 1 FROM user_daily_activity a WHERE a.user_id = c.id AND a.day = c.d + 1))::int AS d1,
      count(c.id) FILTER (WHERE EXISTS (SELECT 1 FROM user_daily_activity a WHERE a.user_id = c.id AND a.day = c.d + 7))::int AS d7,
      (days.d + 1 < ${today}::date) AS d1_mature,
      (days.d + 7 < ${today}::date) AS d7_mature
    FROM days LEFT JOIN cohort c ON c.d = days.d
    GROUP BY days.d ORDER BY days.d`;
  const sessionDuration = await sql<Array<{ bucket: string; count: number }>>`
    SELECT bucket, count(*)::int AS count FROM (
      SELECT CASE
        WHEN v < 60000 THEN '<1 мин' WHEN v < 180000 THEN '1–3 мин' WHEN v < 300000 THEN '3–5 мин'
        WHEN v < 600000 THEN '5–10 мин' WHEN v < 1200000 THEN '10–20 мин' WHEN v < 1800000 THEN '20–30 мин'
        WHEN v < 3600000 THEN '30–60 мин' ELSE '60+ мин' END AS bucket
      FROM (SELECT (props->>'durationMs')::float8 AS v FROM analytics_events
            WHERE name = 'session_ended' AND occurred_at BETWEEN ${from} AND ${to} AND jsonb_typeof(props->'durationMs') = 'number') s
    ) b GROUP BY bucket`;
  const matchDuration = await sql<Array<{ bucket: string; count: number }>>`
    SELECT bucket, count(*)::int AS count FROM (
      SELECT CASE
        WHEN duration_ms < 60000 THEN '<1 мин' WHEN duration_ms < 120000 THEN '1–2 мин' WHEN duration_ms < 180000 THEN '2–3 мин'
        WHEN duration_ms < 240000 THEN '3–4 мин' WHEN duration_ms < 300000 THEN '4–5 мин' ELSE '5+ мин' END AS bucket
      FROM matches WHERE status = 'completed' AND duration_ms IS NOT NULL AND ended_at BETWEEN ${from} AND ${to}
    ) b GROUP BY bucket`;
  const maps = await sql<Array<{ key: string; count: number }>>`
    SELECT map_id AS key, count(*)::int AS count FROM matches WHERE started_at BETWEEN ${from} AND ${to} GROUP BY map_id ORDER BY count DESC`;
  const characters = await sql<Array<{ key: string; count: number }>>`
    SELECT mp.character AS key, count(*)::int AS count
    FROM match_participants mp JOIN matches m ON m.id = mp.match_id
    WHERE m.started_at BETWEEN ${from} AND ${to} GROUP BY mp.character ORDER BY count DESC`;
  const platforms = await sql<Array<{ key: string; count: number }>>`
    SELECT COALESCE(platform, 'unknown') AS key, count(DISTINCT user_id)::int AS count
    FROM sessions WHERE created_at BETWEEN ${from} AND ${to} GROUP BY 1 ORDER BY count DESC`;
  return {
    range: r,
    registrations: [...registrations],
    dau: [...dau],
    matches: [...matches],
    retention: cohorts.map((c) => ({
      day: c.day,
      cohort: c.cohort,
      d1: c.d1_mature && c.cohort > 0 ? c.d1 / c.cohort : null,
      d7: c.d7_mature && c.cohort > 0 ? c.d7 / c.cohort : null,
    })),
    sessionDuration: fillBuckets(SESSION_BUCKETS, [...sessionDuration]),
    matchDuration: fillBuckets(MATCH_BUCKETS, [...matchDuration]),
    maps: [...maps],
    characters: [...characters],
    platforms: [...platforms],
  };
}

// ── Players ─────────────────────────────────────────────────────────────────

const UPPER_CYR = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯІЇЄҐ';
const LOWER_CYR = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюяіїєґ';

export const PLAYER_SORTS = ['created', 'last_seen', 'name', 'level', 'xp', 'matches', 'wins', 'losses', 'kills', 'playtime'] as const;
export type PlayerSort = (typeof PLAYER_SORTS)[number];

interface PlayerDbRow {
  id: string;
  display_name: string;
  telegram_id: string | null;
  created_at: Date;
  last_seen_at: Date;
  level: number;
  xp: number;
  matches_played: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  playtime_sec: number;
  total?: number;
}

export function toPlayerRow(r: PlayerDbRow): AdminPlayerRow {
  return {
    id: r.id,
    displayName: r.display_name,
    telegramId: r.telegram_id,
    createdAt: r.created_at.toISOString(),
    lastSeenAt: r.last_seen_at.toISOString(),
    level: r.level,
    xp: r.xp,
    matches: r.matches_played,
    wins: r.wins,
    losses: r.losses,
    kills: r.kills,
    deaths: r.deaths,
    playtimeSec: r.playtime_sec,
  };
}

export async function listPlayers(sql: Sql, opts: { q?: string | null; sort?: string | null; dir?: string | null; page?: number; pageSize?: number }): Promise<AdminPlayersPage> {
  const sort: PlayerSort = (PLAYER_SORTS as readonly string[]).includes(opts.sort ?? '') ? (opts.sort as PlayerSort) : 'created';
  const dir: 'asc' | 'desc' = opts.dir === 'asc' ? 'asc' : 'desc';
  const pageSize = Math.min(100, Math.max(5, Math.floor(opts.pageSize ?? 25)));
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const q = (opts.q ?? '').trim().slice(0, 64);
  // Case folding is done in JS for the term and with translate()+lower() in SQL so that Cyrillic
  // search works regardless of the database's LC_CTYPE (lower() only folds ASCII under the C locale).
  const like = `%${q.toLowerCase().replace(/[\\%_]/g, (m) => '\\' + m)}%`;
  const folded = sql`lower(translate(u.display_name, ${UPPER_CYR}, ${LOWER_CYR}))`;
  const col = {
    created: sql`u.created_at`,
    last_seen: sql`u.last_seen_at`,
    name: sql`lower(u.display_name)`,
    level: sql`COALESCE(p.xp, 0)`,
    xp: sql`COALESCE(p.xp, 0)`,
    matches: sql`COALESCE(p.matches_played, 0)`,
    wins: sql`COALESCE(p.wins, 0)`,
    losses: sql`COALESCE(p.losses, 0)`,
    kills: sql`COALESCE(p.kills, 0)`,
    playtime: sql`COALESCE(p.playtime_sec, 0)`,
  }[sort];
  const order = dir === 'asc' ? sql`ASC` : sql`DESC`;
  const filter = q
    ? /^\d{1,20}$/.test(q)
      ? sql`AND (u.telegram_id::text = ${q} OR ${folded} LIKE ${like})`
      : /^[0-9a-f-]{36}$/i.test(q)
        ? sql`AND (u.id::text = ${q.toLowerCase()} OR ${folded} LIKE ${like})`
        : sql`AND ${folded} LIKE ${like}`
    : sql``;
  const rows = await sql<PlayerDbRow[]>`
    SELECT u.id, u.display_name, u.telegram_id::text AS telegram_id, u.created_at, u.last_seen_at,
           COALESCE(p.level, 1) AS level, COALESCE(p.xp, 0) AS xp, COALESCE(p.matches_played, 0) AS matches_played,
           COALESCE(p.wins, 0) AS wins, COALESCE(p.losses, 0) AS losses, COALESCE(p.kills, 0) AS kills,
           COALESCE(p.deaths, 0) AS deaths, COALESCE(p.playtime_sec, 0) AS playtime_sec,
           (count(*) OVER ())::int AS total
    FROM users u LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.deleted_at IS NULL ${filter}
    ORDER BY ${col} ${order} NULLS LAST, u.id
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && page > 1) {
    const [c] = await sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM users u WHERE u.deleted_at IS NULL ${filter}`;
    total = c!.n;
  }
  return { rows: rows.map(toPlayerRow), total, page, pageSize, sort, dir };
}

export async function playerErrors(sql: Sql, userId: string, limit = 50): Promise<AdminErrorRow[]> {
  const rows = await sql<Array<{ id: string; occurred_at: Date; source: 'client' | 'server'; component: string; category: string; message: string; client_version: string | null; server_version: string | null; session_id: string | null }>>`
    SELECT id::text AS id, occurred_at, source, component, category, message, client_version, server_version, session_id::text AS session_id
    FROM app_errors WHERE user_id = ${userId} ORDER BY occurred_at DESC LIMIT ${limit}`;
  return rows.map((r) => ({
    id: Number(r.id),
    occurredAt: r.occurred_at.toISOString(),
    source: r.source,
    component: r.component,
    category: r.category,
    message: r.message,
    clientVersion: r.client_version,
    serverVersion: r.server_version,
    sessionId: r.session_id,
  }));
}

export async function errorGroups(sql: Sql, r: AdminRange, limit = 200): Promise<AdminErrorGroup[]> {
  const rows = await sql<
    Array<{ fingerprint: string; source: 'client' | 'server'; component: string; category: string; message: string; count: number; first_seen: Date; last_seen: Date; client_versions: string[] | null; server_versions: string[] | null; session_ids: string[] | null }>
  >`
    SELECT fingerprint,
      (array_agg(source ORDER BY occurred_at DESC))[1] AS source,
      (array_agg(component ORDER BY occurred_at DESC))[1] AS component,
      (array_agg(category ORDER BY occurred_at DESC))[1] AS category,
      (array_agg(message ORDER BY occurred_at DESC))[1] AS message,
      count(*)::int AS count,
      min(occurred_at) AS first_seen,
      max(occurred_at) AS last_seen,
      (array_remove(array_agg(DISTINCT client_version), NULL))[1:5] AS client_versions,
      (array_remove(array_agg(DISTINCT server_version), NULL))[1:5] AS server_versions,
      (array_remove(array_agg(DISTINCT session_id::text), NULL))[1:5] AS session_ids
    FROM app_errors
    WHERE occurred_at BETWEEN ${new Date(r.from)} AND ${new Date(r.to)}
    GROUP BY fingerprint
    ORDER BY count(*) DESC, max(occurred_at) DESC
    LIMIT ${limit}`;
  return rows.map((x) => ({
    fingerprint: x.fingerprint,
    source: x.source,
    component: x.component,
    category: x.category,
    message: x.message,
    count: x.count,
    firstSeen: x.first_seen.toISOString(),
    lastSeen: x.last_seen.toISOString(),
    clientVersions: x.client_versions ?? [],
    serverVersions: x.server_versions ?? [],
    sessionIds: x.session_ids ?? [],
  }));
}

export async function dailyMetrics(sql: Sql, r: AdminRange): Promise<Array<{ day: string; registrations: number; dau: number; matches_started: number; matches_completed: number; errors: number }>> {
  const rows = await sql<Array<{ day: string; registrations: number; dau: number; matches_started: number; matches_completed: number; errors: number }>>`
    SELECT to_char(g.day, 'YYYY-MM-DD') AS day,
      (SELECT count(*) FROM users u WHERE u.deleted_at IS NULL AND u.created_at >= (g.day AT TIME ZONE 'UTC') AND u.created_at < ((g.day + interval '1 day') AT TIME ZONE 'UTC'))::int AS registrations,
      (SELECT count(*) FROM user_daily_activity a WHERE a.day = g.day::date)::int AS dau,
      (SELECT count(*) FROM matches m WHERE m.started_at >= (g.day AT TIME ZONE 'UTC') AND m.started_at < ((g.day + interval '1 day') AT TIME ZONE 'UTC'))::int AS matches_started,
      (SELECT count(*) FROM matches m WHERE m.status = 'completed' AND m.ended_at >= (g.day AT TIME ZONE 'UTC') AND m.ended_at < ((g.day + interval '1 day') AT TIME ZONE 'UTC'))::int AS matches_completed,
      (SELECT count(*) FROM app_errors e WHERE e.occurred_at >= (g.day AT TIME ZONE 'UTC') AND e.occurred_at < ((g.day + interval '1 day') AT TIME ZONE 'UTC'))::int AS errors
    FROM generate_series(${r.firstDay}::date, ${r.lastDay}::date, interval '1 day') AS g(day)
    ORDER BY g.day`;
  return [...rows];
}
