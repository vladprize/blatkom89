/**
 * Migration steps that need application code. Each runs right after its SQL file, in the same
 * transaction and under the same advisory lock, and is recorded with it (forward-only, exactly once).
 */
import type postgres from 'postgres';
import { RATING_RULES, nameKey, numberedAlias, ratingDelta } from '@blatkom/shared';

export type MigrationTx = postgres.TransactionSql<Record<string, unknown>>;

/**
 * 010: fills users.name_key with the application's alias key, renames later duplicates («Петя» →
 * «Петя 2»; the oldest living account keeps the alias) and makes the key unique among living accounts.
 */
async function uniqueAliases(tx: MigrationTx): Promise<void> {
  type Row = { id: string; display_name: string; living: boolean };
  const rows = await tx<Row[]>`
    SELECT id, display_name, deleted_at IS NULL AS living FROM users ORDER BY created_at, id`;
  // first every alias goes to its oldest living holder, then the later holders get free numbers
  // (so an account already called «Петя 2» keeps that name)
  const taken = new Set<string>();
  const final = new Map<string, { name: string; key: string }>();
  const later: Row[] = [];
  for (const r of rows) {
    const key = nameKey(r.display_name);
    if (!r.living) final.set(r.id, { name: r.display_name, key });
    else if (taken.has(key)) later.push(r);
    else {
      taken.add(key);
      final.set(r.id, { name: r.display_name, key });
    }
  }
  for (const r of later) {
    let name = r.display_name;
    let key = nameKey(name);
    for (let n = 2; taken.has(key); n++) {
      name = numberedAlias(r.display_name, n);
      key = nameKey(name);
    }
    taken.add(key);
    final.set(r.id, { name, key });
  }
  const ids = [...final.keys()];
  const names = ids.map((id) => final.get(id)!.name);
  const keys = ids.map((id) => final.get(id)!.key);
  for (let i = 0; i < ids.length; i += 500) {
    await tx`
      UPDATE users u SET display_name = v.name, name_key = v.key
      FROM unnest(${tx.array(ids.slice(i, i + 500))}::uuid[], ${tx.array(names.slice(i, i + 500))}::text[], ${tx.array(keys.slice(i, i + 500))}::text[]) AS v(id, name, key)
      WHERE u.id = v.id`;
  }
  await tx`CREATE UNIQUE INDEX IF NOT EXISTS users_name_key_unique ON users (name_key) WHERE deleted_at IS NULL`;
}

/**
 * 010: the rating of players who already have matches — replayed from their recorded results, match
 * by match in the order the matches ended, with the same rule as new matches (game-rules/progression).
 * Every participant row gets its rating change, every profile its rating.
 */
async function replayRatings(tx: MigrationTx): Promise<void> {
  type Row = { match_id: string; user_id: string; place: number | null; completed: boolean; team: number | null; mode: string; winner_team: number | null; players: number };
  const rows = await tx<Row[]>`
    SELECT mp.match_id, mp.user_id, mp.place, mp.completed, mp.team, m.mode, m.winner_team, (m.player_count + m.bot_count)::int AS players
    FROM match_participants mp JOIN matches m ON m.id = mp.match_id
    WHERE m.results_processed_at IS NOT NULL
    ORDER BY m.ended_at NULLS LAST, m.results_processed_at, m.id, mp.user_id`;
  const rating = new Map<string, number>();
  const matchIds: string[] = [];
  const userIds: string[] = [];
  const deltas: number[] = [];
  for (const r of rows) {
    const teamOutcome = r.mode !== 'ffa' && r.team !== null ? (r.winner_team === null ? 'draw' : r.winner_team === r.team ? 'win' : 'loss') : undefined;
    const d = ratingDelta({ place: r.place ?? r.players, playersAtEnd: r.players, completed: r.completed, ...(teamOutcome ? { teamOutcome } : {}) });
    const before = rating.get(r.user_id) ?? RATING_RULES.start;
    const after = Math.max(RATING_RULES.floor, before + d);
    rating.set(r.user_id, after);
    matchIds.push(r.match_id);
    userIds.push(r.user_id);
    deltas.push(after - before);
  }
  for (let i = 0; i < matchIds.length; i += 1000) {
    await tx`
      UPDATE match_participants mp SET rating_delta = v.d
      FROM unnest(${tx.array(matchIds.slice(i, i + 1000))}::uuid[], ${tx.array(userIds.slice(i, i + 1000))}::uuid[], ${tx.array(deltas.slice(i, i + 1000))}::int[]) AS v(m, u, d)
      WHERE mp.match_id = v.m AND mp.user_id = v.u`;
  }
  const users = [...rating.keys()];
  for (let i = 0; i < users.length; i += 1000) {
    const part = users.slice(i, i + 1000);
    await tx`
      UPDATE profiles p SET rating = v.r
      FROM unnest(${tx.array(part)}::uuid[], ${tx.array(part.map((u) => rating.get(u)!))}::int[]) AS v(u, r)
      WHERE p.user_id = v.u`;
  }
}

export const CODE_STEPS: Readonly<Record<string, (tx: MigrationTx) => Promise<void>>> = Object.freeze({
  '010_social.sql': async (tx: MigrationTx) => {
    await uniqueAliases(tx);
    await replayRatings(tx);
  },
});
