/**
 * Clubs in PostgreSQL (v0.3, migration 013). One club per player (a unique index); join requests wait
 * for the club's head; the head of a real club can change its flag, emblem and motto, take people in,
 * show them out and disband the club; a head who leaves hands the club to the longest-standing member.
 * House clubs (clubs/house.ts) live in the same table with a seed: their people are computed, their
 * requests are answered by `answerHouseRequests`.
 */
import { CLUB_RULES, ClubEmblemSchema, ClubFlagSchema, isAvatarId, isCharacterId, nameKey } from '@blatkom/shared';
import type { AdminClubRow, ClubDetails, ClubEmblem, ClubFlag, ClubMember, ClubRequestEntry, ClubStanding, ClubSummary, CreateClubBody, GangCard, NickLang, UpdateClubBody } from '@blatkom/shared';
import type postgres from 'postgres';
import type { Sql } from '../database/db.js';
import { HOUSE_CLUBS, acceptAfterMs, drift, housePeople, houseSeed, houseSize } from './house.js';

type Tx = postgres.TransactionSql<Record<string, unknown>>;

interface ClubRow {
  id: string;
  name: string;
  tag: string;
  motto: string;
  flag: unknown;
  emblem: unknown;
  head_id: string | null;
  recruiting: boolean;
  rating: number;
  house_seed: number | null;
  house_size: number;
  drift_at: Date | null;
  created_at: Date;
  real_members: number;
}

const DEFAULT_FLAG: ClubFlag = { pattern: 'solid', colors: [0, 2, 3] };
const DEFAULT_EMBLEM: ClubEmblem = { icon: 'star', color: 9 };

export class ClubError extends Error {
  constructor(readonly code: 'not_found' | 'in_club' | 'not_member' | 'not_head' | 'level' | 'funds' | 'name_taken' | 'tag_taken' | 'full' | 'closed' | 'already_requested' | 'too_many_requests' | 'no_request' | 'house') {
    super(code);
  }
}

const HOUSE_BY_SEED = new Map(HOUSE_CLUBS.map((c) => [houseSeed(c.name), c]));
const houseOf = (r: Pick<ClubRow, 'house_seed'>) => (r.house_seed !== null ? (HOUSE_BY_SEED.get(r.house_seed) ?? null) : null);

export class ClubRepo {
  constructor(
    private readonly sql: Sql,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ── reading ─────────────────────────────────────────────────────────────────────────────────────

  private members(r: ClubRow): number {
    const house = houseOf(r);
    if (!house || r.house_seed === null) return r.real_members;
    return r.real_members + houseSize(r.house_size, r.house_seed, r.created_at, this.now(), r.real_members);
  }

  private summary(r: ClubRow, rank: number): ClubSummary {
    const members = this.members(r);
    return {
      id: r.id,
      name: r.name,
      tag: r.tag,
      flag: parseFlag(r.flag),
      emblem: parseEmblem(r.emblem),
      rating: r.rating,
      rank,
      members,
      recruiting: r.recruiting && members < CLUB_RULES.maxMembers,
    };
  }

  /** The club table: the first `limit` clubs by rating (ties: the older club first). */
  async table(limit = 100): Promise<ClubSummary[]> {
    const rows = await this.sql<ClubRow[]>`
      SELECT c.*, (SELECT count(*)::int FROM club_members m WHERE m.club_id = c.id) AS real_members
      FROM clubs c ORDER BY c.rating DESC, c.created_at ASC, c.id LIMIT ${limit}`;
    return rows.map((r, i) => this.summary(r, i + 1));
  }

  /** Clubs whose name or tag contains the text (by the folded key). */
  async search(text: string, limit = 30): Promise<ClubSummary[]> {
    const key = `%${nameKey(text).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const rows = await this.sql<ClubRow[]>`
      SELECT c.*, (SELECT count(*)::int FROM club_members m WHERE m.club_id = c.id) AS real_members
      FROM clubs c WHERE c.name_key LIKE ${key} OR c.tag_key LIKE ${key}
      ORDER BY c.rating DESC, c.created_at ASC LIMIT ${limit}`;
    const out: ClubSummary[] = [];
    for (const r of rows) out.push(this.summary(r, await this.rankOf(r)));
    return out;
  }

  private async rankOf(r: Pick<ClubRow, 'rating' | 'created_at' | 'id'>): Promise<number> {
    const [x] = await this.sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM clubs WHERE rating > ${r.rating} OR (rating = ${r.rating} AND (created_at < ${r.created_at} OR (created_at = ${r.created_at} AND id < ${r.id})))`;
    return (x?.n ?? 0) + 1;
  }

  private async row(clubId: string, q: Sql | Tx = this.sql, lock = false): Promise<ClubRow | null> {
    const rows = lock
      ? await q<ClubRow[]>`SELECT c.*, 0 AS real_members FROM clubs c WHERE c.id = ${clubId} FOR UPDATE`
      : await q<ClubRow[]>`SELECT c.*, (SELECT count(*)::int FROM club_members m WHERE m.club_id = c.id) AS real_members FROM clubs c WHERE c.id = ${clubId}`;
    if (!rows[0]) return null;
    if (lock) {
      const [n] = await q<Array<{ n: number }>>`SELECT count(*)::int AS n FROM club_members WHERE club_id = ${clubId}`;
      rows[0].real_members = n?.n ?? 0;
    }
    return rows[0];
  }

  /** The player's club (with its place in the table), or null. */
  async clubOf(userId: string): Promise<{ summary: ClubSummary; role: 'head' | 'member' } | null> {
    const rows = await this.sql<Array<ClubRow & { role: 'head' | 'member' }>>`
      SELECT c.*, m.role, (SELECT count(*)::int FROM club_members x WHERE x.club_id = c.id) AS real_members
      FROM club_members m JOIN clubs c ON c.id = m.club_id WHERE m.user_id = ${userId}`;
    const r = rows[0];
    if (!r) return null;
    return { summary: this.summary(r, await this.rankOf(r)), role: r.role };
  }

  /**
   * v0.2.17, gang battles: the caller's gang and the gang called out — each as a battle shows it, with the
   * number of its people (real players: a house gang's made-up members don't play).
   */
  async battleSides(userId: string, targetId: string): Promise<{ mine: { card: GangCard; people: number } | null; target: { card: GangCard; people: number } | null }> {
    const side = (r: ClubRow & { people: number }) => ({ card: { id: r.id, name: r.name, tag: r.tag, flag: parseFlag(r.flag), emblem: parseEmblem(r.emblem) }, people: r.people });
    const [mine] = await this.sql<Array<ClubRow & { people: number }>>`
      SELECT c.*, (SELECT count(*)::int FROM club_members x WHERE x.club_id = c.id) AS people
      FROM club_members m JOIN clubs c ON c.id = m.club_id WHERE m.user_id = ${userId}`;
    const [target] = await this.sql<Array<ClubRow & { people: number }>>`
      SELECT c.*, (SELECT count(*)::int FROM club_members x WHERE x.club_id = c.id) AS people FROM clubs c WHERE c.id = ${targetId}`;
    return { mine: mine ? side(mine) : null, target: target ? side(target) : null };
  }

  /** The people (players, not the house's made-up members) of these gangs. */
  async peopleOf(clubIds: string[]): Promise<string[]> {
    if (!clubIds.length) return [];
    const rows = await this.sql<Array<{ user_id: string }>>`SELECT user_id FROM club_members WHERE club_id IN ${this.sql(clubIds)}`;
    return rows.map((r) => r.user_id);
  }

  async requestedBy(userId: string): Promise<string[]> {
    const rows = await this.sql<Array<{ club_id: string }>>`SELECT club_id FROM club_requests WHERE user_id = ${userId} ORDER BY created_at`;
    return rows.map((r) => r.club_id);
  }

  /** Requests waiting for this head's answer. */
  async incomingFor(userId: string): Promise<number> {
    const [r] = await this.sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM club_requests q JOIN club_members m ON m.club_id = q.club_id AND m.user_id = ${userId} AND m.role = 'head'`;
    return r?.n ?? 0;
  }

  async details(clubId: string, userId: string): Promise<ClubDetails | null> {
    const r = await this.row(clubId);
    if (!r) return null;
    const real = await this.sql<Array<{ id: string; display_name: string; avatar: string | null; preferred_character: string | null; level: number | null; role: 'head' | 'member' }>>`
      SELECT u.id, u.display_name, p.avatar, p.preferred_character, p.level, m.role
      FROM club_members m JOIN users u ON u.id = m.user_id LEFT JOIN profiles p ON p.user_id = u.id
      WHERE m.club_id = ${clubId} AND u.deleted_at IS NULL
      ORDER BY (m.role = 'head') DESC, p.level DESC NULLS LAST, m.joined_at`;
    const people: ClubMember[] = real.map((m) => ({ id: m.id, name: m.display_name, level: m.level ?? 1, avatar: isAvatarId(m.avatar) ? m.avatar : null, character: m.preferred_character && isCharacterId(m.preferred_character) ? m.preferred_character : null, role: m.role }));
    const house = houseOf(r);
    if (house && r.house_seed !== null) {
      const size = houseSize(r.house_size, r.house_seed, r.created_at, this.now(), r.real_members);
      const computed = housePeople(r.house_seed, house.lang as NickLang, size, r.created_at, this.now());
      // the house head first, then everybody by level
      const [head, ...rest] = computed;
      const all = [...rest, ...people].sort((a, b) => b.level - a.level);
      people.splice(0, people.length, head!, ...all);
    }
    const mine = people.find((p) => p.id === userId);
    let me: ClubStanding = mine ? (mine.role === 'head' ? 'head' : 'member') : 'none';
    if (me === 'none') {
      const q = await this.sql`SELECT 1 FROM club_requests WHERE club_id = ${clubId} AND user_id = ${userId}`;
      if (q.length) me = 'requested';
    }
    let requests: ClubRequestEntry[] = [];
    if (me === 'head') {
      const rows = await this.sql<Array<{ id: string; display_name: string; avatar: string | null; preferred_character: string | null; level: number | null; created_at: Date }>>`
        SELECT u.id, u.display_name, p.avatar, p.preferred_character, p.level, q.created_at
        FROM club_requests q JOIN users u ON u.id = q.user_id LEFT JOIN profiles p ON p.user_id = u.id
        WHERE q.club_id = ${clubId} AND u.deleted_at IS NULL ORDER BY q.created_at`;
      requests = rows.map((q) => ({ id: q.id, name: q.display_name, level: q.level ?? 1, avatar: isAvatarId(q.avatar) ? q.avatar : null, character: q.preferred_character && isCharacterId(q.preferred_character) ? q.preferred_character : null, at: q.created_at.toISOString() }));
    }
    return { ...this.summary(r, await this.rankOf(r)), motto: r.motto, createdAt: r.created_at.toISOString(), memberList: people, me, requests };
  }

  // ── founding and changing ───────────────────────────────────────────────────────────────────────

  async create(userId: string, body: CreateClubBody): Promise<string> {
    return this.sql.begin(async (tx) => {
      await tx`INSERT INTO profiles (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;
      const [p] = await tx<Array<{ tokens: number; level: number }>>`SELECT tokens, level FROM profiles WHERE user_id = ${userId} FOR UPDATE`;
      if ((await tx`SELECT 1 FROM club_members WHERE user_id = ${userId}`).length) throw new ClubError('in_club');
      if (p!.level < CLUB_RULES.createLevel) throw new ClubError('level');
      if (p!.tokens < CLUB_RULES.createTokens) throw new ClubError('funds');
      if ((await tx`SELECT 1 FROM clubs WHERE name_key = ${nameKey(body.name)}`).length) throw new ClubError('name_taken');
      if ((await tx`SELECT 1 FROM clubs WHERE tag_key = ${nameKey(body.tag)}`).length) throw new ClubError('tag_taken');
      let id: string;
      try {
        const [c] = await tx<Array<{ id: string }>>`
          INSERT INTO clubs (name, name_key, tag, tag_key, motto, flag, emblem, head_id, rating)
          VALUES (${body.name}, ${nameKey(body.name)}, ${body.tag}, ${nameKey(body.tag)}, ${body.motto ?? ''}, ${tx.json(body.flag)}, ${tx.json(body.emblem)}, ${userId}, ${CLUB_RULES.startRating})
          RETURNING id`;
        id = c!.id;
      } catch (e) {
        // two players founding the same name at once: the unique index decides
        if ((e as { code?: string }).code === '23505') throw new ClubError(String((e as { constraint_name?: string }).constraint_name ?? '').includes('tag') ? 'tag_taken' : 'name_taken');
        throw e;
      }
      await tx`INSERT INTO club_members (club_id, user_id, role) VALUES (${id}, ${userId}, 'head')`;
      await tx`DELETE FROM club_requests WHERE user_id = ${userId}`;
      if (CLUB_RULES.createTokens > 0) {
        const after = p!.tokens - CLUB_RULES.createTokens;
        await tx`UPDATE profiles SET tokens = ${after}, updated_at = now() WHERE user_id = ${userId}`;
        await tx`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref) VALUES (${userId}, 'tokens', ${-CLUB_RULES.createTokens}, ${after}, 'purchase', ${`club:${id}`})`;
      }
      return id;
    });
  }

  async update(clubId: string, userId: string, body: UpdateClubBody): Promise<void> {
    await this.sql.begin(async (tx) => {
      const r = await this.row(clubId, tx, true);
      if (!r) throw new ClubError('not_found');
      await this.mustHead(tx, clubId, userId);
      await tx`
        UPDATE clubs SET
          motto = ${body.motto ?? r.motto},
          flag = ${tx.json(body.flag ?? parseFlag(r.flag))},
          emblem = ${tx.json(body.emblem ?? parseEmblem(r.emblem))},
          updated_at = now()
        WHERE id = ${clubId}`;
    });
  }

  async setRecruiting(clubId: string, userId: string, recruiting: boolean): Promise<void> {
    await this.sql.begin(async (tx) => {
      await this.mustHead(tx, clubId, userId);
      await tx`UPDATE clubs SET recruiting = ${recruiting}, updated_at = now() WHERE id = ${clubId}`;
    });
  }

  private async mustHead(tx: Tx, clubId: string, userId: string): Promise<void> {
    const rows = await tx<Array<{ role: string }>>`SELECT role FROM club_members WHERE club_id = ${clubId} AND user_id = ${userId}`;
    if (!rows[0]) throw new ClubError('not_member');
    if (rows[0].role !== 'head') throw new ClubError('not_head');
  }

  // ── joining ─────────────────────────────────────────────────────────────────────────────────────

  /** Asks to join; returns the head to tell (null for a house club, which answers by itself). */
  async request(clubId: string, userId: string): Promise<{ headId: string | null }> {
    return this.sql.begin(async (tx) => {
      const r = await this.row(clubId, tx, true);
      if (!r) throw new ClubError('not_found');
      if ((await tx`SELECT 1 FROM club_members WHERE user_id = ${userId}`).length) throw new ClubError('in_club');
      if (!r.recruiting) throw new ClubError('closed');
      if (this.members(r) >= CLUB_RULES.maxMembers) throw new ClubError('full');
      if ((await tx`SELECT 1 FROM club_requests WHERE club_id = ${clubId} AND user_id = ${userId}`).length) throw new ClubError('already_requested');
      const [mine] = await tx<Array<{ n: number }>>`SELECT count(*)::int AS n FROM club_requests WHERE user_id = ${userId}`;
      if ((mine?.n ?? 0) >= CLUB_RULES.maxOutgoingRequests) throw new ClubError('too_many_requests');
      const [theirs] = await tx<Array<{ n: number }>>`SELECT count(*)::int AS n FROM club_requests WHERE club_id = ${clubId}`;
      if ((theirs?.n ?? 0) >= CLUB_RULES.maxIncomingRequests) throw new ClubError('full');
      await tx`INSERT INTO club_requests (club_id, user_id) VALUES (${clubId}, ${userId})`;
      return { headId: r.house_seed !== null ? null : r.head_id };
    });
  }

  async cancelRequest(clubId: string, userId: string): Promise<void> {
    const rows = await this.sql`DELETE FROM club_requests WHERE club_id = ${clubId} AND user_id = ${userId} RETURNING 1`;
    if (!rows.length) throw new ClubError('no_request');
  }

  /**
   * The head's answer. Accepting someone who has meanwhile joined another club, or a full club, only
   * removes the request (`joined: false`).
   */
  async answer(clubId: string, headId: string, userId: string, accept: boolean): Promise<{ joined: boolean }> {
    return this.sql.begin(async (tx) => {
      const r = await this.row(clubId, tx, true);
      if (!r) throw new ClubError('not_found');
      await this.mustHead(tx, clubId, headId);
      const del = await tx`DELETE FROM club_requests WHERE club_id = ${clubId} AND user_id = ${userId} RETURNING 1`;
      if (!del.length) throw new ClubError('no_request');
      if (!accept) return { joined: false };
      return { joined: await this.join(tx, r, userId) };
    });
  }

  private async join(tx: Tx, r: ClubRow, userId: string): Promise<boolean> {
    if ((await tx`SELECT 1 FROM club_members WHERE user_id = ${userId}`).length) return false;
    if (this.members(r) >= CLUB_RULES.maxMembers) return false;
    await tx`INSERT INTO club_members (club_id, user_id, role) VALUES (${r.id}, ${userId}, 'member') ON CONFLICT DO NOTHING`;
    await tx`DELETE FROM club_requests WHERE user_id = ${userId}`;
    return true;
  }

  /** House clubs answer «yes» a few minutes after a request; returns who got in (to tell them). */
  async answerHouseRequests(): Promise<Array<{ userId: string; clubId: string }>> {
    const now = this.now().getTime();
    const waiting = await this.sql<Array<{ club_id: string; user_id: string; created_at: Date; house_seed: number }>>`
      SELECT q.club_id, q.user_id, q.created_at, c.house_seed FROM club_requests q JOIN clubs c ON c.id = q.club_id
      WHERE c.house_seed IS NOT NULL ORDER BY q.created_at LIMIT 200`;
    const out: Array<{ userId: string; clubId: string }> = [];
    for (const w of waiting) {
      if (w.created_at.getTime() + acceptAfterMs(w.house_seed, w.user_id) > now) continue;
      const joined = await this.sql.begin(async (tx) => {
        const r = await this.row(w.club_id, tx, true);
        if (!r) return false;
        const del = await tx`DELETE FROM club_requests WHERE club_id = ${w.club_id} AND user_id = ${w.user_id} RETURNING 1`;
        if (!del.length) return false;
        return this.join(tx, r, w.user_id);
      });
      if (joined) out.push({ userId: w.user_id, clubId: w.club_id });
    }
    return out;
  }

  // ── leaving ─────────────────────────────────────────────────────────────────────────────────────

  /** Leaves the club; a head hands it to the longest-standing member, a last member closes it. */
  async leave(userId: string): Promise<{ clubId: string; newHead: string | null; closed: boolean }> {
    return this.sql.begin(async (tx) => {
      const [m] = await tx<Array<{ club_id: string; role: string }>>`SELECT club_id, role FROM club_members WHERE user_id = ${userId}`;
      if (!m) throw new ClubError('not_member');
      const r = await this.row(m.club_id, tx, true);
      await tx`DELETE FROM club_members WHERE club_id = ${m.club_id} AND user_id = ${userId}`;
      if (m.role !== 'head' || !r || r.house_seed !== null) return { clubId: m.club_id, newHead: null, closed: false };
      const [next] = await tx<Array<{ user_id: string }>>`SELECT user_id FROM club_members WHERE club_id = ${m.club_id} ORDER BY joined_at, user_id LIMIT 1`;
      if (!next) {
        await tx`DELETE FROM clubs WHERE id = ${m.club_id}`;
        return { clubId: m.club_id, newHead: null, closed: true };
      }
      await tx`UPDATE club_members SET role = 'head' WHERE club_id = ${m.club_id} AND user_id = ${next.user_id}`;
      await tx`UPDATE clubs SET head_id = ${next.user_id}, updated_at = now() WHERE id = ${m.club_id}`;
      return { clubId: m.club_id, newHead: next.user_id, closed: false };
    });
  }

  async kick(clubId: string, headId: string, userId: string): Promise<void> {
    await this.sql.begin(async (tx) => {
      await this.mustHead(tx, clubId, headId);
      if (userId === headId) throw new ClubError('not_member');
      const rows = await tx`DELETE FROM club_members WHERE club_id = ${clubId} AND user_id = ${userId} AND role = 'member' RETURNING 1`;
      if (!rows.length) throw new ClubError('not_member');
    });
  }

  /** The head closes the club: everybody is out, the requests are gone. Returns who was in it. */
  async disband(clubId: string, headId: string): Promise<string[]> {
    return this.sql.begin(async (tx) => {
      const r = await this.row(clubId, tx, true);
      if (!r) throw new ClubError('not_found');
      if (r.house_seed !== null) throw new ClubError('house');
      await this.mustHead(tx, clubId, headId);
      const people = await tx<Array<{ user_id: string }>>`SELECT user_id FROM club_members WHERE club_id = ${clubId}`;
      await tx`DELETE FROM clubs WHERE id = ${clubId}`;
      return people.map((p) => p.user_id).filter((id) => id !== headId);
    });
  }

  /** An account being deleted: out of its club like a player who leaves, its requests withdrawn. */
  async forget(userId: string): Promise<void> {
    if ((await this.sql`SELECT 1 FROM club_members WHERE user_id = ${userId}`).length) await this.leave(userId);
    await this.sql`DELETE FROM club_requests WHERE user_id = ${userId}`;
  }

  // ── moderation ──────────────────────────────────────────────────────────────────────────────────

  async adminList(): Promise<AdminClubRow[]> {
    const rows = await this.sql<Array<ClubRow & { head_name: string | null; requests: number }>>`
      SELECT c.*, u.display_name AS head_name,
             (SELECT count(*)::int FROM club_members m WHERE m.club_id = c.id) AS real_members,
             (SELECT count(*)::int FROM club_requests q WHERE q.club_id = c.id) AS requests
      FROM clubs c LEFT JOIN users u ON u.id = c.head_id
      ORDER BY c.rating DESC, c.created_at ASC, c.id`;
    return rows.map((r, i) => {
      const s = this.summary(r, i + 1);
      return { id: r.id, name: r.name, tag: r.tag, motto: r.motto, rating: r.rating, rank: s.rank, members: s.members, realMembers: r.real_members, headName: r.head_name, recruiting: r.recruiting, house: r.house_seed !== null, createdAt: r.created_at.toISOString(), requests: r.requests };
    });
  }

  /** A player club removed by the admin; house clubs stay (they would come back on the next start). */
  async adminDelete(clubId: string): Promise<'not_found' | 'house' | { name: string; tag: string; members: string[] }> {
    return this.sql.begin(async (tx) => {
      const r = await this.row(clubId, tx, true);
      if (!r) return 'not_found' as const;
      if (r.house_seed !== null) return 'house' as const;
      const people = await tx<Array<{ user_id: string }>>`SELECT user_id FROM club_members WHERE club_id = ${clubId}`;
      await tx`DELETE FROM clubs WHERE id = ${clubId}`;
      return { name: r.name, tag: r.tag, members: people.map((p) => p.user_id) };
    });
  }

  // ── the house clubs ─────────────────────────────────────────────────────────────────────────────

  /**
   * Puts the house clubs in the table (once; a name or tag a player already holds is skipped). House
   * clubs that are no longer on the list (renamed in a release) leave the table when nobody real is in
   * them.
   */
  async seedHouse(): Promise<number> {
    const now = this.now();
    const seeds = HOUSE_CLUBS.map((c) => houseSeed(c.name));
    await this.sql`
      DELETE FROM clubs c WHERE c.house_seed IS NOT NULL AND NOT (c.house_seed = ANY(${this.sql.array(seeds)}::int[]))
        AND NOT EXISTS (SELECT 1 FROM club_members m WHERE m.club_id = c.id)`;
    let added = 0;
    for (const c of HOUSE_CLUBS) {
      const created = new Date(now.getTime() - c.ageDays * 86_400_000);
      const rows = await this.sql`
        INSERT INTO clubs (name, name_key, tag, tag_key, motto, flag, emblem, recruiting, rating, house_seed, house_size, drift_at, created_at, updated_at)
        VALUES (${c.name}, ${nameKey(c.name)}, ${c.tag}, ${nameKey(c.tag)}, ${c.motto}, ${this.sql.json(c.flag)}, ${this.sql.json(c.emblem)}, ${c.recruiting}, ${c.rating}, ${houseSeed(c.name)}, ${c.size}, ${now}, ${created}, ${now})
        ON CONFLICT DO NOTHING RETURNING 1`;
      added += rows.length;
    }
    return added;
  }

  /** Moves the house clubs' ratings by the half-hour steps since their last move. */
  async driftHouse(): Promise<void> {
    const now = this.now();
    const rows = await this.sql<Array<{ id: string; rating: number; house_seed: number; house_size: number; created_at: Date; drift_at: Date | null }>>`
      SELECT id, rating, house_seed, house_size, created_at, drift_at FROM clubs WHERE house_seed IS NOT NULL`;
    for (const r of rows) {
      const def = HOUSE_BY_SEED.get(r.house_seed);
      if (!def) continue;
      const base = def.rating - def.trend * def.ageDays;
      const next = drift(r.rating, { seed: r.house_seed, base, trend: def.trend, size: r.house_size, createdAt: r.created_at, from: r.drift_at ?? now, now });
      if (next.rating !== r.rating || (r.drift_at && next.at.getTime() !== r.drift_at.getTime())) {
        await this.sql`UPDATE clubs SET rating = ${next.rating}, drift_at = ${next.at} WHERE id = ${r.id} AND drift_at IS NOT DISTINCT FROM ${r.drift_at}`;
      }
    }
  }
}

function parseFlag(v: unknown): ClubFlag {
  const p = ClubFlagSchema.safeParse(v);
  return p.success ? p.data : DEFAULT_FLAG;
}

function parseEmblem(v: unknown): ClubEmblem {
  const p = ClubEmblemSchema.safeParse(v);
  return p.success ? p.data : DEFAULT_EMBLEM;
}

/**
 * The match recorder's part: each member's rating change moves their club's rating too. Clubs are
 * updated in id order, so two matches finishing at once never wait for each other in a circle.
 */
export async function moveClubRatings(tx: Tx, deltas: ReadonlyArray<{ userId: string; delta: number }>): Promise<void> {
  const moving = deltas.filter((d) => d.delta !== 0);
  if (!moving.length) return;
  const rows = await tx<Array<{ club_id: string; user_id: string }>>`SELECT club_id, user_id FROM club_members WHERE user_id IN ${tx(moving.map((d) => d.userId))}`;
  const byClub = new Map<string, number>();
  for (const r of rows) byClub.set(r.club_id, (byClub.get(r.club_id) ?? 0) + moving.find((d) => d.userId === r.user_id)!.delta);
  for (const [clubId, delta] of [...byClub].sort(([a], [b]) => (a < b ? -1 : 1))) {
    await tx`UPDATE clubs SET rating = GREATEST(0, rating + ${delta}), updated_at = now() WHERE id = ${clubId}`;
  }
}
