/**
 * V2.0 part F: where players come from and what invitations bring (docs/ANALYTICS.md §6).
 *
 * * The first touch: a browser's first visit keeps what it came with (a partner's link `?p=`, a campaign
 *   `utm_*`, the referring domain) on its `visitors` row; a new account keeps how it came
 *   (`users.source_channel` / `source_detail` / `partner_id`) — set once, when the account is made.
 *   Channels in order of precedence: a partner's link, a player's referral link, a room invitation, a
 *   campaign, another site, Telegram, direct.
 * * Partner links (authors, streamers): an administrator's list with what each link brought —
 *   measuring only: nothing is paid, credited or promised to a partner.
 * * The numbers: unique players, first matches, sources, invitations and their conversion, the level
 *   distribution, the Kon, $BLAT issued. Every number comes from canonical tables at request time;
 *   merged empty profiles (V2.0 part E) are left out of player counts.
 */
import { randomBytes } from 'node:crypto';
import type { AdminGrowth, AdminPartnerRow, AdminRange, AdminSourceRow, AdminVisitSourceRow, FirstTouch, KonFormat, SourceChannel } from '@blatkom/shared';
import { KON_FORMATS } from '@blatkom/shared';
import type { Sql } from '../database/db.js';

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** The links a partner hands out: the website (`?p=`) and, with a bot, Telegram (`start=p_`). */
export function partnerLinks(code: string, env: { PUBLIC_URL: string; TELEGRAM_BOT_USERNAME?: string }): { webUrl: string; telegramUrl: string | null } {
  return {
    webUrl: `${env.PUBLIC_URL.replace(/\/$/, '')}/?p=${code}`,
    telegramUrl: env.TELEGRAM_BOT_USERNAME ? `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=p_${code}` : null,
  };
}

/** A Telegram start parameter `p_<code>` (a partner's bot link) → the code. */
export const partnerFromStartParam = (p: string | null | undefined): string | null => (p && /^p_[a-z0-9_]{3,24}$/i.test(p) ? p.slice(2).toLowerCase() : null);

/** An active partner's id by code (the code as typed, any case). */
async function activePartner(sql: Sql, code: string | null | undefined): Promise<string | null> {
  if (!code || !/^[a-z0-9_]{3,24}$/i.test(code)) return null;
  const [p] = await sql<Array<{ id: string }>>`SELECT id FROM partners WHERE code = ${code.toLowerCase()} AND active`;
  return p?.id ?? null;
}

/** The first visit of a browser: what it came with, kept as first seen (later visits change nothing). */
export async function recordVisitSource(sql: Sql, visitorId: string, src: FirstTouch | undefined): Promise<void> {
  if (!src) return;
  const partnerId = await activePartner(sql, src.partner);
  await sql`
    UPDATE visitors SET
      utm_source = COALESCE(utm_source, ${src.utmSource ?? null}),
      utm_medium = COALESCE(utm_medium, ${src.utmMedium ?? null}),
      utm_campaign = COALESCE(utm_campaign, ${src.utmCampaign ?? null}),
      partner_id = COALESCE(partner_id, ${partnerId})
    WHERE visitor_id = ${visitorId} AND first_seen_at > now() - interval '1 day'`;
}

/**
 * How a NEW account came (set once; existing accounts are never touched). `partnerCode` / `invite` may
 * come from Telegram's signed start parameter as well as from the browser.
 */
export async function attachSource(
  sql: Sql,
  log: { warn(m: string, f?: Record<string, unknown>): void },
  userId: string,
  isNew: boolean,
  src: FirstTouch | undefined,
  o: { referral: boolean; telegram: boolean; partnerCode?: string | null; invite?: boolean },
): Promise<void> {
  if (!isNew) return;
  try {
    const code = o.partnerCode ?? src?.partner ?? null;
    const partnerId = await activePartner(sql, code);
    let channel: SourceChannel;
    let detail: string | null = null;
    if (partnerId) {
      channel = 'partner';
      detail = code!.toLowerCase();
    } else if (o.referral) channel = 'referral';
    else if (o.invite || src?.invite) channel = 'invite';
    else if (src?.utmSource) {
      channel = 'utm';
      detail = [src.utmSource, src.utmMedium, src.utmCampaign].filter(Boolean).join(' / ').slice(0, 80);
    } else if (src?.referrer) {
      channel = 'referrer';
      detail = src.referrer;
    } else channel = o.telegram ? 'telegram' : 'direct';
    await sql`UPDATE users SET source_channel = ${channel}, source_detail = ${detail}, partner_id = ${partnerId} WHERE id = ${userId} AND source_channel IS NULL`;
  } catch (e) {
    log.warn('source attach failed', { err: e as Error });
  }
}

const LEVEL_BUCKETS: Array<[string, number, number]> = [
  ['1', 1, 1],
  ['2–4', 2, 4],
  ['5–9', 5, 9],
  ['10–19', 10, 19],
  ['20–29', 20, 29],
  ['30–49', 30, 49],
  ['50+', 50, 1_000_000],
];

export async function growth(sql: Sql, r: AdminRange, now = new Date()): Promise<AdminGrowth> {
  const from = new Date(r.from);
  const to = new Date(r.to);
  const [pl] = await sql<Array<{ registered: number; unique: number; first: number; completed: number }>>`
    SELECT
      (SELECT count(*) FROM users WHERE deleted_at IS NULL AND merged_at IS NULL AND created_at BETWEEN ${from} AND ${to})::int AS registered,
      (SELECT count(DISTINCT mp.user_id) FROM match_participants mp JOIN matches m ON m.id = mp.match_id WHERE m.started_at BETWEEN ${from} AND ${to})::int AS unique,
      (SELECT count(*) FROM (
         SELECT mp.user_id, min(m.started_at) AS first FROM match_participants mp JOIN matches m ON m.id = mp.match_id GROUP BY mp.user_id
       ) f WHERE f.first BETWEEN ${from} AND ${to})::int AS first,
      (SELECT count(*) FROM matches WHERE status = 'completed' AND ended_at BETWEEN ${from} AND ${to})::int AS completed`;
  const sources = await sql<Array<{ channel: string; detail: string | null; accounts: number; first_match: number; completed: number; returned: number }>>`
    SELECT COALESCE(u.source_channel, 'unknown') AS channel, u.source_detail AS detail, count(*)::int AS accounts,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM match_participants mp WHERE mp.user_id = u.id))::int AS first_match,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM match_participants mp WHERE mp.user_id = u.id AND mp.completed))::int AS completed,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_daily_activity a WHERE a.user_id = u.id AND a.day > (u.created_at AT TIME ZONE 'UTC')::date))::int AS returned
    FROM users u
    WHERE u.deleted_at IS NULL AND u.merged_at IS NULL AND u.created_at BETWEEN ${from} AND ${to}
    GROUP BY 1, 2 ORDER BY accounts DESC, channel, detail LIMIT 50`;
  const visits = await sql<Array<{ kind: AdminVisitSourceRow['kind']; key: string; visitors: number; registered: number }>>`
    SELECT CASE WHEN v.partner_id IS NOT NULL THEN 'partner' WHEN v.utm_source IS NOT NULL THEN 'utm' WHEN COALESCE(v.referrer, '') <> '' THEN 'referrer' ELSE 'direct' END AS kind,
           COALESCE(p.code, v.utm_source, NULLIF(v.referrer, ''), '') AS key,
           count(*)::int AS visitors, count(v.user_id)::int AS registered
    FROM visitors v LEFT JOIN partners p ON p.id = v.partner_id
    WHERE v.first_seen_at BETWEEN ${from} AND ${to}
    GROUP BY 1, 2 ORDER BY visitors DESC, registered DESC, key LIMIT 30`;
  const [inv] = await sql<Array<{ created: number; opened: number; joined: number; played: number; new_players: number; attached: number; confirmed: number }>>`
    SELECT
      (SELECT count(*) FROM analytics_events WHERE name = 'invite_created' AND occurred_at BETWEEN ${from} AND ${to})::int AS created,
      (SELECT count(*) FROM analytics_events WHERE name = 'invite_opened' AND occurred_at BETWEEN ${from} AND ${to})::int AS opened,
      (SELECT count(DISTINCT user_id) FROM analytics_events
         WHERE name = 'lobby_joined' AND props->>'viaInvite' = 'true' AND occurred_at BETWEEN ${from} AND ${to})::int AS joined,
      (SELECT count(DISTINCT mp.user_id) FROM match_participants mp JOIN matches m ON m.id = mp.match_id
         WHERE mp.via_invite AND mp.completed AND m.started_at BETWEEN ${from} AND ${to})::int AS played,
      (SELECT count(DISTINCT mp.user_id) FROM match_participants mp JOIN matches m ON m.id = mp.match_id JOIN users u ON u.id = mp.user_id
         WHERE mp.via_invite AND mp.completed AND m.started_at BETWEEN ${from} AND ${to} AND u.created_at BETWEEN ${from} AND ${to})::int AS new_players,
      (SELECT count(*) FROM referrals WHERE attached_at BETWEEN ${from} AND ${to})::int AS attached,
      (SELECT count(*) FROM referrals WHERE attached_at BETWEEN ${from} AND ${to} AND status = 'confirmed')::int AS confirmed`;
  const levelRows = await sql<Array<{ level: number; players: number }>>`
    SELECT p.level, count(*)::int AS players FROM profiles p JOIN users u ON u.id = p.user_id
    WHERE u.deleted_at IS NULL AND u.merged_at IS NULL GROUP BY p.level`;
  const reached = await sql<Array<{ level: number; players: number }>>`
    SELECT substring(ref FROM 7)::int AS level, count(*)::int AS players FROM currency_ledger
    WHERE currency = 'blat' AND reason = 'level' AND ref ~ '^level:[0-9]{1,6}$' AND created_at BETWEEN ${from} AND ${to}
    GROUP BY 1 ORDER BY 1`;
  const konRows = await sql<Array<{ format: KonFormat; matches: number }>>`
    SELECT kon_format AS format, count(*)::int AS matches FROM matches
    WHERE kon_format IS NOT NULL AND status = 'completed' AND ended_at BETWEEN ${from} AND ${to} GROUP BY 1`;
  const [konPlayers] = await sql<Array<{ n: number }>>`
    SELECT count(DISTINCT mp.user_id)::int AS n FROM match_participants mp JOIN matches m ON m.id = mp.match_id
    WHERE m.kon_format IS NOT NULL AND m.status = 'completed' AND m.ended_at BETWEEN ${from} AND ${to}`;
  const [blat] = await sql<Array<{ issued: number; levels: number; referrals: number }>>`
    SELECT COALESCE(sum(delta), 0)::int AS issued,
           COALESCE(sum(delta) FILTER (WHERE reason = 'level'), 0)::int AS levels,
           COALESCE(sum(delta) FILTER (WHERE reason = 'referral'), 0)::int AS referrals
    FROM currency_ledger WHERE currency = 'blat' AND delta > 0 AND created_at BETWEEN ${from} AND ${to}`;
  const totalPlayers = levelRows.reduce((a, x) => a + x.players, 0);
  const levelSum = levelRows.reduce((a, x) => a + x.level * x.players, 0);
  const konBy = new Map(konRows.map((x) => [x.format, x.matches]));
  return {
    range: r,
    generatedAt: now.toISOString(),
    players: { registered: pl!.registered, unique: pl!.unique, firstMatch: pl!.first, completedMatches: pl!.completed },
    sources: sources.map((x): AdminSourceRow => ({ channel: x.channel as AdminSourceRow['channel'], detail: x.detail, accounts: x.accounts, firstMatch: x.first_match, completed: x.completed, returned: x.returned })),
    visits: visits.map((x) => ({ kind: x.kind, key: x.key, visitors: x.visitors, registered: x.registered })),
    invites: {
      roomInvites: inv!.created,
      opened: inv!.opened,
      joinedLobby: inv!.joined,
      played: inv!.played,
      newPlayers: inv!.new_players,
      conversion: ratio(inv!.played, inv!.created),
      referralAttached: inv!.attached,
      referralConfirmed: inv!.confirmed,
      referralConversion: ratio(inv!.confirmed, inv!.attached),
    },
    levels: {
      buckets: LEVEL_BUCKETS.map(([bucket, lo, hi]) => ({ bucket, players: levelRows.filter((x) => x.level >= lo && x.level <= hi).reduce((a, x) => a + x.players, 0) })),
      reached: [...reached],
      average: totalPlayers ? Math.round((levelSum / totalPlayers) * 10) / 10 : null,
      max: levelRows.reduce((a, x) => Math.max(a, x.level), 0),
    },
    kon: { matches: konRows.reduce((a, x) => a + x.matches, 0), players: konPlayers!.n, byFormat: KON_FORMATS.map((format) => ({ format, matches: konBy.get(format) ?? 0 })) },
    blat: { issued: blat!.issued, fromLevels: blat!.levels, fromReferrals: blat!.referrals },
  };
}

/** Every partner with what its link brought in the period (newest first). */
export async function partnersWithStats(sql: Sql, r: AdminRange, env: { PUBLIC_URL: string; TELEGRAM_BOT_USERNAME?: string }): Promise<AdminPartnerRow[]> {
  const from = new Date(r.from);
  const to = new Date(r.to);
  const rows = await sql<
    Array<{ id: string; code: string; name: string; note: string | null; active: boolean; created_at: Date; visitors: number; accounts: number; first_match: number; completed: number; returned: number; matches: number }>
  >`
    SELECT p.id, p.code, p.name, p.note, p.active, p.created_at,
      (SELECT count(*) FROM visitors v WHERE v.partner_id = p.id AND v.first_seen_at BETWEEN ${from} AND ${to})::int AS visitors,
      count(u.id)::int AS accounts,
      count(u.id) FILTER (WHERE EXISTS (SELECT 1 FROM match_participants mp WHERE mp.user_id = u.id))::int AS first_match,
      count(u.id) FILTER (WHERE EXISTS (SELECT 1 FROM match_participants mp WHERE mp.user_id = u.id AND mp.completed))::int AS completed,
      count(u.id) FILTER (WHERE EXISTS (SELECT 1 FROM user_daily_activity a WHERE a.user_id = u.id AND a.day > (u.created_at AT TIME ZONE 'UTC')::date))::int AS returned,
      (SELECT count(*) FROM match_participants mp JOIN matches m ON m.id = mp.match_id JOIN users x ON x.id = mp.user_id
         WHERE x.partner_id = p.id AND mp.completed AND m.ended_at BETWEEN ${from} AND ${to})::int AS matches
    FROM partners p
    LEFT JOIN users u ON u.partner_id = p.id AND u.deleted_at IS NULL AND u.merged_at IS NULL AND u.created_at BETWEEN ${from} AND ${to}
    GROUP BY p.id ORDER BY p.created_at DESC, p.code`;
  return rows.map((x) => ({
    id: x.id,
    code: x.code,
    name: x.name,
    note: x.note,
    active: x.active,
    createdAt: x.created_at.toISOString(),
    ...partnerLinks(x.code, env),
    visitors: x.visitors,
    accounts: x.accounts,
    firstMatch: x.first_match,
    completed: x.completed,
    returned: x.returned,
    matches: x.matches,
  }));
}

export class PartnerError extends Error {
  constructor(readonly code: 'code_taken' | 'not_found') {
    super(code);
  }
}

/** A new partner link; without a code one is made from the name (plus a few random letters if taken). */
export async function createPartner(sql: Sql, adminId: string | null, o: { name: string; code?: string; note?: string }): Promise<{ id: string; code: string }> {
  const base =
    o.code ??
    (o.name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 16) || 'partner');
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = attempt === 0 && base.length >= 3 ? base : `${base.slice(0, 16)}_${randomBytes(3).toString('hex').slice(0, 5)}`.replace(/^_/, '');
    const rows = await sql<Array<{ id: string }>>`
      INSERT INTO partners (code, name, note, created_by) VALUES (${code}, ${o.name}, ${o.note || null}, ${adminId})
      ON CONFLICT (code) DO NOTHING RETURNING id`;
    if (rows[0]) return { id: rows[0].id, code };
    if (o.code) throw new PartnerError('code_taken');
  }
  throw new PartnerError('code_taken');
}

export async function updatePartner(sql: Sql, id: string, o: { name?: string; note?: string | null; active?: boolean }): Promise<void> {
  await sql.begin(async (tx) => {
    const [p] = await tx<Array<{ id: string }>>`SELECT id FROM partners WHERE id = ${id} FOR UPDATE`;
    if (!p) throw new PartnerError('not_found');
    if (o.name !== undefined) await tx`UPDATE partners SET name = ${o.name} WHERE id = ${id}`;
    if (o.note !== undefined) await tx`UPDATE partners SET note = ${o.note || null} WHERE id = ${id}`;
    if (o.active !== undefined) await tx`UPDATE partners SET active = ${o.active} WHERE id = ${id}`;
  });
}
