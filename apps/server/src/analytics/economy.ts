/**
 * Admin funnel and economy metrics. Like metrics.ts, every number comes from canonical tables at
 * request time (visitors, users, match_participants, user_daily_activity, currency_ledger,
 * user_items, weapon_mods, case_openings, payments); nothing is estimated. Days are UTC.
 * Definitions: docs/ANALYTICS.md («Funnel», «Economy»).
 */
import type { AdminCurrencyFlow, AdminEconomy, AdminFunnel, AdminFunnelCohort, AdminRange } from '@blatkom/shared';
import type { Sql } from '../database/db.js';

interface CohortRow {
  entered: number;
  registered: number;
  played: number;
  returned: number;
  paid: number;
  email_linked: number;
}

const cohort = (r: CohortRow): AdminFunnelCohort => ({
  entered: r.entered,
  registered: r.registered,
  played: r.played,
  returned: r.returned,
  paid: r.paid,
  emailLinked: r.email_linked,
});

/**
 * Visitors: anonymous browser ids first seen in the period → those that got an account (linked at
 * sign-up) → played a completed match → came back on a later UTC day (and had played) → paid.
 * Players: everyone registered in the period, any sign-in method (Telegram players never pass through
 * the visitor table when their client is older than the funnel).
 */
export async function funnel(sql: Sql, r: AdminRange): Promise<AdminFunnel> {
  const from = new Date(r.from);
  const to = new Date(r.to);
  const [v] = await sql<CohortRow[]>`
    WITH v AS (SELECT visitor_id, user_id FROM visitors WHERE first_seen_at BETWEEN ${from} AND ${to}),
    u AS (
      SELECT u.id, u.email, (u.created_at AT TIME ZONE 'UTC')::date AS d,
             EXISTS (SELECT 1 FROM match_participants mp WHERE mp.user_id = u.id AND mp.completed) AS played
      FROM users u WHERE u.deleted_at IS NULL AND u.merged_at IS NULL AND u.id IN (SELECT user_id FROM v WHERE user_id IS NOT NULL)
    )
    SELECT (SELECT count(*) FROM v)::int AS entered,
           (SELECT count(*) FROM u)::int AS registered,
           (SELECT count(*) FROM u WHERE played)::int AS played,
           (SELECT count(*) FROM u WHERE played AND EXISTS (SELECT 1 FROM user_daily_activity a WHERE a.user_id = u.id AND a.day > u.d))::int AS returned,
           (SELECT count(*) FROM u WHERE EXISTS (SELECT 1 FROM payments p WHERE p.user_id = u.id AND p.status IN ('paid', 'refunded')))::int AS paid,
           (SELECT count(*) FROM u WHERE email IS NOT NULL)::int AS email_linked`;
  const [p] = await sql<CohortRow[]>`
    WITH u AS (
      SELECT u.id, u.email, (u.created_at AT TIME ZONE 'UTC')::date AS d,
             EXISTS (SELECT 1 FROM match_participants mp WHERE mp.user_id = u.id AND mp.completed) AS played
      FROM users u WHERE u.deleted_at IS NULL AND u.merged_at IS NULL AND u.created_at BETWEEN ${from} AND ${to}
    )
    SELECT (SELECT count(*) FROM u)::int AS entered,
           (SELECT count(*) FROM u)::int AS registered,
           (SELECT count(*) FROM u WHERE played)::int AS played,
           (SELECT count(*) FROM u WHERE played AND EXISTS (SELECT 1 FROM user_daily_activity a WHERE a.user_id = u.id AND a.day > u.d))::int AS returned,
           (SELECT count(*) FROM u WHERE EXISTS (SELECT 1 FROM payments p WHERE p.user_id = u.id AND p.status IN ('paid', 'refunded')))::int AS paid,
           (SELECT count(*) FROM u WHERE email IS NOT NULL)::int AS email_linked`;
  const referrers = await sql<Array<{ key: string; visitors: number; registered: number }>>`
    SELECT COALESCE(referrer, '') AS key, count(*)::int AS visitors, count(user_id)::int AS registered
    FROM visitors WHERE first_seen_at BETWEEN ${from} AND ${to}
    GROUP BY 1 ORDER BY visitors DESC, registered DESC, key LIMIT 10`;
  const daily = await sql<Array<{ day: string; unique_visitors: number; new_visitors: number; registrations: number }>>`
    SELECT to_char(g.day, 'YYYY-MM-DD') AS day,
      (SELECT count(*) FROM visitor_days vd WHERE vd.day = g.day::date)::int AS unique_visitors,
      (SELECT count(*) FROM visitors x WHERE x.first_seen_at >= (g.day AT TIME ZONE 'UTC') AND x.first_seen_at < ((g.day + interval '1 day') AT TIME ZONE 'UTC'))::int AS new_visitors,
      (SELECT count(*) FROM users u WHERE u.deleted_at IS NULL AND u.merged_at IS NULL
         AND u.created_at >= (g.day AT TIME ZONE 'UTC') AND u.created_at < ((g.day + interval '1 day') AT TIME ZONE 'UTC'))::int AS registrations
    FROM generate_series(${r.firstDay}::date, ${r.lastDay}::date, interval '1 day') AS g(day)
    ORDER BY g.day`;
  return {
    range: r,
    visitors: cohort(v!),
    players: cohort(p!),
    referrers: [...referrers],
    daily: daily.map((d) => ({ day: d.day, uniqueVisitors: d.unique_visitors, newVisitors: d.new_visitors, registrations: d.registrations })),
  };
}

function flow(rows: Array<{ currency: string; reason: string; plus: number; minus: number }>, currency: 'tokens' | 'diamonds', circulating: number, holders: number): AdminCurrencyFlow {
  const issued: Record<string, number> = {};
  const spent: Record<string, number> = {};
  for (const r of rows) {
    if (r.currency !== currency) continue;
    if (r.plus > 0) issued[r.reason] = r.plus;
    if (r.minus > 0) spent[r.reason] = r.minus;
  }
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  return { issued, spent, issuedTotal: sum(issued), spentTotal: sum(spent), circulating, holders };
}

export async function economy(sql: Sql, r: AdminRange, now = new Date()): Promise<AdminEconomy> {
  const from = new Date(r.from);
  const to = new Date(r.to);
  const ledger = await sql<Array<{ currency: string; reason: string; plus: number; minus: number }>>`
    SELECT currency, reason,
           COALESCE(sum(delta) FILTER (WHERE delta > 0), 0)::int AS plus,
           COALESCE(sum(-delta) FILTER (WHERE delta < 0), 0)::int AS minus
    FROM currency_ledger WHERE created_at BETWEEN ${from} AND ${to}
    GROUP BY currency, reason`;
  const [bal] = await sql<Array<{ tokens: number; diamonds: number; token_holders: number; diamond_holders: number }>>`
    SELECT COALESCE(sum(p.tokens), 0)::int AS tokens, COALESCE(sum(p.diamonds), 0)::int AS diamonds,
           count(*) FILTER (WHERE p.tokens > 0)::int AS token_holders, count(*) FILTER (WHERE p.diamonds > 0)::int AS diamond_holders
    FROM profiles p JOIN users u ON u.id = p.user_id WHERE u.deleted_at IS NULL`;
  const [rev] = await sql<Array<{ payments: number; payers: number; pending: number; failed: number }>>`
    SELECT count(*) FILTER (WHERE status IN ('paid', 'refunded') AND paid_at BETWEEN ${from} AND ${to})::int AS payments,
           count(DISTINCT user_id) FILTER (WHERE status IN ('paid', 'refunded') AND paid_at BETWEEN ${from} AND ${to})::int AS payers,
           count(*) FILTER (WHERE status = 'created' AND created_at BETWEEN ${from} AND ${to})::int AS pending,
           count(*) FILTER (WHERE status IN ('failed', 'expired') AND created_at BETWEEN ${from} AND ${to})::int AS failed
    FROM payments`;
  const byCurrency = await sql<Array<{ currency: string; gross: number; refunded: number }>>`
    SELECT currency, sum(amount_cents)::int AS gross, COALESCE(sum(amount_cents) FILTER (WHERE status = 'refunded'), 0)::int AS refunded
    FROM payments WHERE status IN ('paid', 'refunded') AND paid_at BETWEEN ${from} AND ${to}
    GROUP BY currency ORDER BY gross DESC`;
  const byProvider = await sql<Array<{ provider: string; payments: number; gross: number }>>`
    SELECT provider, count(*)::int AS payments, sum(amount_cents)::int AS gross
    FROM payments WHERE status IN ('paid', 'refunded') AND paid_at BETWEEN ${from} AND ${to}
    GROUP BY provider ORDER BY gross DESC`;
  const byPack = await sql<Array<{ pack_id: string; payments: number }>>`
    SELECT pack_id, count(*)::int AS payments FROM payments
    WHERE status IN ('paid', 'refunded') AND paid_at BETWEEN ${from} AND ${to}
    GROUP BY pack_id ORDER BY payments DESC, pack_id`;
  const byKind = await sql<Array<{ kind: string; source: string; count: number }>>`
    SELECT kind, source, count(*)::int AS count FROM user_items
    WHERE acquired_at BETWEEN ${from} AND ${to} GROUP BY kind, source ORDER BY count DESC, kind, source`;
  const top = await sql<Array<{ kind: string; id: string; count: number }>>`
    SELECT kind, item_id AS id, count(*)::int AS count FROM user_items
    WHERE acquired_at BETWEEN ${from} AND ${to} AND source IN ('tokens', 'diamonds')
    GROUP BY kind, item_id ORDER BY count DESC, kind, item_id LIMIT 12`;
  const mods = await sql<Array<{ id: string; count: number }>>`
    SELECT mod_id AS id, count(*)::int AS count FROM weapon_mods
    WHERE acquired_at BETWEEN ${from} AND ${to} GROUP BY mod_id ORDER BY count DESC, mod_id`;
  const cases = await sql<Array<{ rarity: string; count: number; spent: number }>>`
    SELECT rarity, count(*)::int AS count, COALESCE(sum(price) FILTER (WHERE currency = 'diamonds'), 0)::int AS spent FROM case_openings
    WHERE created_at BETWEEN ${from} AND ${to} GROUP BY rarity ORDER BY count DESC, rarity`;
  const caseKinds = await sql<Array<{ kind: string; count: number; spent: number }>>`
    SELECT kind, count(*)::int AS count, COALESCE(sum(price) FILTER (WHERE currency = 'diamonds'), 0)::int AS spent FROM case_openings
    WHERE created_at BETWEEN ${from} AND ${to} GROUP BY kind ORDER BY kind`;
  const daily = await sql<Array<{ day: string; ti: number; ts: number; di: number; ds: number; rev: number }>>`
    WITH l AS (
      SELECT (created_at AT TIME ZONE 'UTC')::date AS d, currency, delta FROM currency_ledger WHERE created_at BETWEEN ${from} AND ${to}
    ), p AS (
      SELECT (paid_at AT TIME ZONE 'UTC')::date AS d, amount_cents FROM payments WHERE status IN ('paid', 'refunded') AND paid_at BETWEEN ${from} AND ${to}
    )
    SELECT to_char(g.day, 'YYYY-MM-DD') AS day,
      COALESCE((SELECT sum(delta) FROM l WHERE l.d = g.day::date AND currency = 'tokens' AND delta > 0), 0)::int AS ti,
      COALESCE((SELECT sum(-delta) FROM l WHERE l.d = g.day::date AND currency = 'tokens' AND delta < 0), 0)::int AS ts,
      COALESCE((SELECT sum(delta) FROM l WHERE l.d = g.day::date AND currency = 'diamonds' AND delta > 0), 0)::int AS di,
      COALESCE((SELECT sum(-delta) FROM l WHERE l.d = g.day::date AND currency = 'diamonds' AND delta < 0), 0)::int AS ds,
      COALESCE((SELECT sum(amount_cents) FROM p WHERE p.d = g.day::date), 0)::int AS rev
    FROM generate_series(${r.firstDay}::date, ${r.lastDay}::date, interval '1 day') AS g(day)
    ORDER BY g.day`;
  const sum = (xs: Array<{ count: number }>) => xs.reduce((a, b) => a + b.count, 0);
  return {
    range: r,
    generatedAt: now.toISOString(),
    tokens: flow([...ledger], 'tokens', bal!.tokens, bal!.token_holders),
    diamonds: flow([...ledger], 'diamonds', bal!.diamonds, bal!.diamond_holders),
    revenue: {
      payments: rev!.payments,
      payers: rev!.payers,
      byCurrency: byCurrency.map((c) => ({ currency: c.currency, grossCents: c.gross, refundedCents: c.refunded })),
      byProvider: byProvider.map((p) => ({ provider: p.provider, payments: p.payments, grossCents: p.gross })),
      byPack: byPack.map((p) => ({ packId: p.pack_id, payments: p.payments })),
      pending: rev!.pending,
      failed: rev!.failed,
    },
    purchases: { total: sum(byKind.filter((k) => k.source === 'tokens' || k.source === 'diamonds')), byKind: [...byKind], top: [...top] },
    mods: { total: sum([...mods]), top: [...mods] },
    cases: {
      total: sum([...cases]),
      diamondsSpent: cases.reduce((a, c) => a + c.spent, 0),
      byRarity: cases.map((c) => ({ rarity: c.rarity, count: c.count })),
      byKind: caseKinds.map((c) => ({ kind: c.kind, count: c.count, diamondsSpent: c.spent })),
    },
    daily: daily.map((d) => ({ day: d.day, tokensIssued: d.ti, tokensSpent: d.ts, diamondsIssued: d.di, diamondsSpent: d.ds, revenueCents: d.rev })),
  };
}

/** «donater@example.com» → «d•••r@example.com» (short local parts keep only the first letter). */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at <= 0) return '•••';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const masked = local.length <= 2 ? `${local[0]}•••` : `${local[0]}•••${local[local.length - 1]}`;
  return `${masked}@${domain}`;
}
