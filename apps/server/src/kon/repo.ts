/**
 * «Блатной кон» (V2.0 part D): the Kon rating after a match (players and gangs), the player's numbers,
 * the tables and the history. Results are written inside the match-results transaction
 * (progression/recorder.ts), once per match like XP. Never touches $BLAT.
 */
import { KON_RATING, konDelta } from '@blatkom/shared';
import type { CharacterId, KonFormat, KonHistoryEntry, KonOutcome, KonStats, KonTopResponse, KonTopRow, MapId } from '@blatkom/shared';
import type postgres from 'postgres';
import type { Sql } from '../database/db.js';

type Tx = postgres.TransactionSql<Record<string, unknown>>;

export interface KonParticipant {
  userId: string;
  team: 0 | 1 | null;
  completed: boolean;
}

/** A player's Kon result: who left loses; otherwise the server's winner (null: a draw). */
export function konOutcome(p: KonParticipant, winner: 0 | 1 | null): KonOutcome {
  if (!p.completed || p.team === null) return 'loss';
  if (winner === null) return 'draw';
  return p.team === winner ? 'win' : 'loss';
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : KON_RATING.start);

/**
 * Applies one Kon match: every participant's rating, record and streak, the gangs that played as a
 * side, the match's format. The caller holds the participants' profile rows (FOR UPDATE).
 */
export async function applyKonResults(tx: Tx, m: { matchId: string; format: KonFormat; winner: 0 | 1 | null; participants: KonParticipant[] }): Promise<Map<string, { delta: number; rating: number; outcome: KonOutcome }>> {
  const out = new Map<string, { delta: number; rating: number; outcome: KonOutcome }>();
  const ids = m.participants.map((p) => p.userId);
  if (ids.length === 0) return out;
  const rows = await tx<Array<{ user_id: string; kon_rating: number; kon_matches: number; kon_streak: number }>>`
    SELECT user_id, kon_rating, kon_matches, kon_streak FROM profiles WHERE user_id IN ${tx(ids)}`;
  const prof = new Map(rows.map((r) => [r.user_id, r]));
  const side = (team: 0 | 1) => m.participants.filter((p) => p.team === team).map((p) => prof.get(p.userId)?.kon_rating ?? KON_RATING.start);
  const sideAvg: [number, number] = [avg(side(0)), avg(side(1))];
  for (const p of m.participants) {
    const r = prof.get(p.userId);
    if (!r) continue;
    const outcome = konOutcome(p, m.winner);
    const team = p.team ?? 0;
    const delta = konDelta({ mine: sideAvg[team], theirs: sideAvg[team === 0 ? 1 : 0], outcome, matches: r.kon_matches });
    const rating = Math.max(KON_RATING.floor, r.kon_rating + delta);
    const streak = outcome === 'win' ? r.kon_streak + 1 : 0;
    await tx`
      UPDATE profiles SET kon_rating = ${rating}, kon_matches = kon_matches + 1,
        kon_wins = kon_wins + ${outcome === 'win' ? 1 : 0}, kon_losses = kon_losses + ${outcome === 'loss' ? 1 : 0}, kon_draws = kon_draws + ${outcome === 'draw' ? 1 : 0},
        kon_streak = ${streak}, kon_best_streak = GREATEST(kon_best_streak, ${streak}), updated_at = now()
      WHERE user_id = ${p.userId}`;
    await tx`UPDATE match_participants SET kon_delta = ${rating - r.kon_rating} WHERE match_id = ${m.matchId} AND user_id = ${p.userId}`;
    out.set(p.userId, { delta: rating - r.kon_rating, rating, outcome });
  }
  // gangs: a side of two or more people all in one gang plays for it
  const clubOf = new Map((await tx<Array<{ user_id: string; club_id: string }>>`SELECT user_id, club_id FROM club_members WHERE user_id IN ${tx(ids)}`).map((r) => [r.user_id, r.club_id]));
  const gangSide = (team: 0 | 1): string | null => {
    const people = m.participants.filter((p) => p.team === team);
    if (people.length < 2) return null;
    const first = clubOf.get(people[0]!.userId);
    return first && people.every((p) => clubOf.get(p.userId) === first) ? first : null;
  };
  const gangs: [string | null, string | null] = [gangSide(0), gangSide(1)];
  const gangIds = [...new Set(gangs.filter((g): g is string => g !== null))].sort();
  if (gangIds.length) {
    const g = new Map((await tx<Array<{ id: string; kon_rating: number; kon_matches: number }>>`SELECT id, kon_rating, kon_matches FROM clubs WHERE id IN ${tx(gangIds)} ORDER BY id FOR UPDATE`).map((r) => [r.id, r]));
    for (const team of [0, 1] as const) {
      const id = gangs[team];
      const me = id ? g.get(id) : undefined;
      if (!id || !me) continue;
      const otherGang = gangs[team === 0 ? 1 : 0];
      const theirs = otherGang && g.get(otherGang) ? g.get(otherGang)!.kon_rating : sideAvg[team === 0 ? 1 : 0];
      const outcome: KonOutcome = m.winner === null ? 'draw' : m.winner === team ? 'win' : 'loss';
      const rating = Math.max(KON_RATING.floor, me.kon_rating + konDelta({ mine: me.kon_rating, theirs, outcome, matches: me.kon_matches }));
      await tx`
        UPDATE clubs SET kon_rating = ${rating}, kon_matches = kon_matches + 1,
          kon_wins = kon_wins + ${outcome === 'win' ? 1 : 0}, kon_losses = kon_losses + ${outcome === 'loss' ? 1 : 0}, kon_draws = kon_draws + ${outcome === 'draw' ? 1 : 0}
        WHERE id = ${id}`;
    }
  }
  await tx`UPDATE matches SET kon_format = ${m.format} WHERE id = ${m.matchId}`;
  return out;
}

/** The read side: a player's numbers, the tables, the history. */
export class KonRepo {
  constructor(private readonly sql: Sql) {}

  async stats(userId: string): Promise<KonStats> {
    const [r] = await this.sql<Array<{ kon_rating: number; kon_matches: number; kon_wins: number; kon_losses: number; kon_draws: number; kon_streak: number; kon_best_streak: number }>>`
      SELECT kon_rating, kon_matches, kon_wins, kon_losses, kon_draws, kon_streak, kon_best_streak FROM profiles WHERE user_id = ${userId}`;
    return {
      rating: r?.kon_rating ?? KON_RATING.start,
      matches: r?.kon_matches ?? 0,
      wins: r?.kon_wins ?? 0,
      losses: r?.kon_losses ?? 0,
      draws: r?.kon_draws ?? 0,
      streak: r?.kon_streak ?? 0,
      bestStreak: r?.kon_best_streak ?? 0,
    };
  }

  /** The first 100 by Kon rating (players or gangs with at least one Kon match) and the player's own row. */
  async top(by: 'players' | 'gangs', userId: string): Promise<KonTopResponse> {
    if (by === 'players') {
      const rows = await this.sql<Array<{ id: string; name: string; level: number; rating: number; matches: number; wins: number; losses: number; draws: number; best: number; place: number }>>`
        SELECT * FROM (
          SELECT u.id, u.display_name AS name, p.level, p.kon_rating AS rating, p.kon_matches AS matches, p.kon_wins AS wins, p.kon_losses AS losses, p.kon_draws AS draws, p.kon_best_streak AS best,
                 row_number() OVER (ORDER BY p.kon_rating DESC, p.kon_wins DESC, p.kon_matches DESC, u.id)::int AS place
          FROM profiles p JOIN users u ON u.id = p.user_id
          WHERE p.kon_matches > 0 AND u.deleted_at IS NULL
        ) t WHERE place <= 100 OR id = ${userId} ORDER BY place`;
      const toRow = (r: (typeof rows)[number]): KonTopRow => ({ place: r.place, id: r.id, name: r.name, level: r.level, rating: r.rating, matches: r.matches, wins: r.wins, losses: r.losses, draws: r.draws, bestStreak: r.best });
      return { by, rows: rows.filter((r) => r.place <= 100).map(toRow), me: rows.find((r) => r.id === userId) ? toRow(rows.find((r) => r.id === userId)!) : null };
    }
    const [mine] = await this.sql<Array<{ club_id: string }>>`SELECT club_id FROM club_members WHERE user_id = ${userId}`;
    const gangId = mine?.club_id ?? '00000000-0000-0000-0000-000000000000';
    const rows = await this.sql<Array<{ id: string; name: string; tag: string; rating: number; matches: number; wins: number; losses: number; draws: number; place: number }>>`
      SELECT * FROM (
        SELECT c.id, c.name, c.tag, c.kon_rating AS rating, c.kon_matches AS matches, c.kon_wins AS wins, c.kon_losses AS losses, c.kon_draws AS draws,
               row_number() OVER (ORDER BY c.kon_rating DESC, c.kon_wins DESC, c.kon_matches DESC, c.id)::int AS place
        FROM clubs c WHERE c.kon_matches > 0
      ) t WHERE place <= 100 OR id = ${gangId} ORDER BY place`;
    const toRow = (r: (typeof rows)[number]): KonTopRow => ({ place: r.place, id: r.id, name: r.name, tag: r.tag, rating: r.rating, matches: r.matches, wins: r.wins, losses: r.losses, draws: r.draws });
    const me = rows.find((r) => r.id === gangId);
    return { by, rows: rows.filter((r) => r.place <= 100).map(toRow), me: me ? toRow(me) : null };
  }

  /** The player's last Kon matches with their team-mates and opponents. */
  async history(userId: string, limit = 20): Promise<KonHistoryEntry[]> {
    // v0.2.17: a staked match — the stake and what came back (the ledger's rows of this match)
    const rows = await this.sql<Array<{ match_id: string; ended_at: Date | null; started_at: Date; kon_format: KonFormat; map_id: MapId; team: 0 | 1 | null; won: boolean; completed: boolean; winner_team: 0 | 1 | null; kills: number; deaths: number; kon_delta: number; character: CharacterId; stake: number; payout: number }>>`
      SELECT m.id AS match_id, m.ended_at, m.started_at, m.kon_format, m.map_id, mp.team, mp.won, mp.completed, m.winner_team, mp.kills, mp.deaths, mp.kon_delta, mp.character,
             m.stake,
             COALESCE((SELECT sum(l.delta) FROM currency_ledger l WHERE l.user_id = mp.user_id AND l.currency = 'blat' AND l.ref IN ('stake_win:' || m.id::text, 'stake_refund:' || m.id::text)), 0)::int AS payout
      FROM match_participants mp JOIN matches m ON m.id = mp.match_id
      WHERE mp.user_id = ${userId} AND m.kon_format IS NOT NULL AND m.status = 'completed'
      ORDER BY m.ended_at DESC NULLS LAST LIMIT ${limit}`;
    if (rows.length === 0) return [];
    const others = await this.sql<Array<{ match_id: string; user_id: string; team: 0 | 1 | null; name: string }>>`
      SELECT mp.match_id, mp.user_id, mp.team, u.display_name AS name
      FROM match_participants mp JOIN users u ON u.id = mp.user_id
      WHERE mp.match_id IN ${this.sql(rows.map((r) => r.match_id))} AND mp.user_id <> ${userId}
      ORDER BY u.display_name`;
    return rows.map((r) => {
      const left = !r.completed;
      const outcome: KonOutcome = left ? 'loss' : r.winner_team === null ? 'draw' : r.team === r.winner_team ? 'win' : 'loss';
      const here = others.filter((o) => o.match_id === r.match_id);
      return {
        matchId: r.match_id,
        endedAt: (r.ended_at ?? r.started_at).toISOString(),
        format: r.kon_format,
        mapId: r.map_id,
        team: r.team,
        outcome,
        left,
        kills: r.kills,
        deaths: r.deaths,
        delta: r.kon_delta,
        character: r.character,
        mates: here.filter((o) => o.team === r.team).map((o) => o.name),
        rivals: here.filter((o) => o.team !== r.team).map((o) => o.name),
        ...(r.stake > 0 ? { stake: r.stake, payout: r.payout } : {}),
      };
    });
  }
}
