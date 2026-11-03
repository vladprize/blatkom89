/** Migrations 010, 014 and 026 on a database that already has players: duplicate aliases are resolved, keys filled. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { nameKey } from '@blatkom/shared';
import { DEFAULT_MIGRATIONS_DIR, migrate } from './migrate.js';
import { TEST_DB_URL } from '../admin/testkit.js';
import type { Sql } from './db.js';

test('010 keeps every alias with its oldest living holder and numbers the later ones', async () => {
  const schema = `t_${randomBytes(6).toString('hex')}`;
  const root = postgres(TEST_DB_URL, { max: 1, onnotice: () => {} });
  await root.unsafe(`CREATE SCHEMA ${schema}`);
  const sql = postgres(TEST_DB_URL, { max: 2, onnotice: () => {}, connection: { search_path: schema } }) as unknown as Sql;
  const before = mkdtempSync(join(tmpdir(), 'blatkom-mig-'));
  try {
    for (const f of readdirSync(DEFAULT_MIGRATIONS_DIR).filter((f) => f < '010')) cpSync(join(DEFAULT_MIGRATIONS_DIR, f), join(before, f));
    await migrate(sql, before);
    const people: Array<[string, boolean]> = [
      ['Петя', false],
      ['ПЕТЯ', false],
      ['Петя 2', false],
      ['Сом', false],
      ['Com', false],
      ['петя', true], // a deleted account: keeps its name, no number
      ['Пётр', false],
      ['Петр', false],
      ['Valuta', false],
    ];
    const ids: string[] = [];
    for (const [i, [name, deleted]] of people.entries()) {
      const [r] = await sql<Array<{ id: string }>>`
        INSERT INTO users (dev_device_id, display_name, created_at, deleted_at)
        VALUES (${'dev-mig-' + i}, ${name}, ${new Date(Date.UTC(2026, 0, 1 + i))}, ${deleted ? new Date() : null}) RETURNING id`;
      ids.push(r!.id);
    }
    // matches played before 010: their ratings are replayed in the order the matches ended
    const [petya, , , som, com] = ids as [string, string, string, string, string];
    for (const u of [petya, som, com]) await sql`INSERT INTO profiles (user_id, matches_completed) VALUES (${u}, 1)`;
    const match = async (n: number, mode: string, people: number, fill: number, winner: number | null, processed: boolean, rows: Array<[string, number | null, boolean, number | null]>) => {
      const id = `00000000-0000-4000-8000-00000000000${n}`;
      const ended = new Date(Date.UTC(2026, 1, n));
      await sql`INSERT INTO matches (id, room_id, map_id, status, started_at, ended_at, player_count, bot_count, mode, winner_team, results_processed_at)
                VALUES (${id}, 'room', 'factory', 'completed', ${ended}, ${ended}, ${people}, ${fill}, ${mode}, ${winner}, ${processed ? ended : null})`;
      for (const [u, place, completed, team] of rows)
        await sql`INSERT INTO match_participants (match_id, user_id, character, place, completed, team) VALUES (${id}, ${u}, 'petya', ${place}, ${completed}, ${team})`;
      return id;
    };
    // inserted out of order on purpose: the replay follows ended_at
    const m2 = await match(2, 'ffa', 3, 0, null, true, [[petya, 1, true, null], [som, 2, true, null]]);
    const m1 = await match(1, 'ffa', 3, 1, null, true, [[petya, 1, true, null], [som, 4, true, null], [com, null, false, null]]);
    await match(3, 'teams', 2, 0, null, true, [[com, 1, true, 0]]);
    await match(4, 'ctf', 2, 4, 1, true, [[som, 2, true, 1]]);
    await match(5, 'ffa', 2, 0, null, false, [[petya, 2, true, null]]); // never processed: ignored
    // the migrations up to 013 (014 turns the aliases Latin: checked below)
    const upTo013 = mkdtempSync(join(tmpdir(), 'blatkom-mig-'));
    for (const f of readdirSync(DEFAULT_MIGRATIONS_DIR).filter((f) => f < '014')) cpSync(join(DEFAULT_MIGRATIONS_DIR, f), join(upTo013, f));
    const applied = await migrate(sql, upTo013);
    rmSync(upTo013, { recursive: true, force: true });
    assert.equal(applied[0], '010_social.sql', 'the migrations after 009, 010 first');
    const ratings = await sql<Array<{ user_id: string; rating: number }>>`SELECT user_id, rating FROM profiles`;
    const r = new Map(ratings.map((x) => [x.user_id, x.rating]));
    assert.deepEqual([r.get(petya), r.get(som), r.get(com)], [1032, 1000, 984], 'first place +16 twice; last −16, middle ±0, team win +16; leaver −16, team draw ±0');
    const deltas = await sql<Array<{ match_id: string; user_id: string; rating_delta: number }>>`SELECT match_id, user_id, rating_delta FROM match_participants`;
    const d = (m: string, u: string) => deltas.find((x) => x.match_id === m && x.user_id === u)?.rating_delta;
    assert.deepEqual([d(m1, petya), d(m1, som), d(m1, com), d(m2, som)], [16, -16, -16, 0]);
    const rows = await sql<Array<{ id: string; display_name: string; name_key: string }>>`SELECT id, display_name, name_key FROM users`;
    const byId = new Map(rows.map((r) => [r.id, r]));
    assert.deepEqual(
      ids.map((id) => byId.get(id)!.display_name),
      ['Петя', 'ПЕТЯ 3', 'Петя 2', 'Сом', 'Com 2', 'петя', 'Пётр', 'Петр 2', 'Valuta'],
    );
    for (const r of rows) assert.equal(r.name_key, nameKey(r.display_name));
    // the key is unique among living accounts now
    await assert.rejects(
      sql`INSERT INTO users (dev_device_id, display_name, name_key) VALUES ('dev-mig-x', 'пЕтЯ', ${nameKey('пЕтЯ')})`,
      (e: { code?: string; constraint_name?: string }) => e.code === '23505' && (e.constraint_name ?? '').includes('name_key'),
    );
    // a row written without a key (an older server) still gets one
    const [plain] = await sql<Array<{ name_key: string }>>`INSERT INTO users (dev_device_id, display_name) VALUES ('dev-mig-y', 'Plain Name') RETURNING name_key`;
    assert.equal(plain!.name_key, 'plain name');

    // 014 (v0.3): every living alias in Latin letters; a transliteration already taken gets a number
    await sql`INSERT INTO users (dev_device_id, display_name, name_key, created_at) VALUES ('dev-mig-z', 'Pyotr', 'pyotr', ${new Date(Date.UTC(2026, 0, 30))})`;
    const upTo025 = mkdtempSync(join(tmpdir(), 'blatkom-mig-'));
    for (const f of readdirSync(DEFAULT_MIGRATIONS_DIR).filter((f) => f < '026')) cpSync(join(DEFAULT_MIGRATIONS_DIR, f), join(upTo025, f));
    const later = await migrate(sql, upTo025);
    rmSync(upTo025, { recursive: true, force: true });
    assert.equal(later[0], '014_latin_names.sql', 'the migrations after 013, 014 first');
    const after = new Map((await sql<Array<{ id: string; display_name: string; name_key: string }>>`SELECT id, display_name, name_key FROM users`).map((r) => [r.id, r]));
    assert.deepEqual(
      ids.map((id) => after.get(id)!.display_name),
      ['Petya', 'PETYA 3', 'Petya 2', 'Som', 'Com 2', 'петя', 'Pyotr 2', 'Petr 2', 'Valuta'],
      'Latin letters for the living (a deleted account keeps its row as it was); «Пётр» meets an existing «Pyotr»',
    );
    for (const r of after.values()) assert.equal(r.name_key, nameKey(r.display_name));
    await assert.rejects(
      sql`INSERT INTO users (dev_device_id, display_name, name_key) VALUES ('dev-mig-w', 'PETYA', ${nameKey('PETYA')})`,
      (e: { code?: string; constraint_name?: string }) => e.code === '23505' && (e.constraint_name ?? '').includes('name_key'),
    );

    // 026 (v0.2.19): every living alias in one word of small letters; an alias that already fits stays
    // («petya_2»: the older «Petya 2» comes to the same and takes the next number); two aliases that come to
    // the same one in the same pass — the older keeps it; the old alias is kept
    const extra: Array<[string, string, number]> = [
      ['dev-mig-n1', 'petya_2', 31],
      ['dev-mig-n2', 'Mr. Smith', 32],
      ['dev-mig-n3', 'Mr.Smith', 33],
      ['dev-mig-n4', 'Seasoned Badger', 34],
      ['dev-mig-n5', '__', 35],
    ];
    const extraIds: string[] = [];
    for (const [dev, name, day] of extra) {
      const [x] = await sql<Array<{ id: string }>>`INSERT INTO users (dev_device_id, display_name, name_key, created_at) VALUES (${dev}, ${name}, ${nameKey(name)}, ${new Date(Date.UTC(2026, 0, day))}) RETURNING id`;
      extraIds.push(x!.id);
    }
    const last = await migrate(sql);
    assert.deepEqual(last, ['026_nicknames.sql']);
    const nick = new Map((await sql<Array<{ id: string; display_name: string; name_key: string; old_display_name: string | null }>>`SELECT id, display_name, name_key, old_display_name FROM users`).map((r) => [r.id, r]));
    assert.deepEqual(
      ids.map((id) => nick.get(id)!.display_name),
      ['petya', 'petya_3', 'petya_2_2', 'som', 'com_2', 'петя', 'pyotr_2', 'petr_2', 'valuta'],
      'one word, small letters (the deleted account as it was); «Petya 2» meets the newer «petya_2» that already fits',
    );
    assert.equal(nick.get(ids[0]!)!.old_display_name, 'Petya', 'the old alias is kept');
    assert.equal(nick.get(ids[5]!)!.old_display_name, null, 'a deleted account is not touched');
    const fallback = nick.get(extraIds[4]!)!.display_name;
    assert.deepEqual(extraIds.slice(0, 4).map((id) => nick.get(id)!.display_name), ['petya_2', 'mr.smith', 'mr.smith_2', 'seasoned_badger']);
    assert.match(fallback, /^comrade_\d{4}$/, 'nothing left of the alias: comrade and four digits');
    assert.equal(nick.get(extraIds[0]!)!.old_display_name, null, 'an alias that fits is not touched');
    for (const r of nick.values()) assert.equal(r.name_key, nameKey(r.display_name));
    const living = [...nick.values()].filter((r) => r.id !== ids[5]);
    assert.equal(new Set(living.map((r) => r.name_key)).size, living.length, 'every key unique');
  } finally {
    await sql.end({ timeout: 5 });
    await root.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await root.end({ timeout: 5 });
    rmSync(before, { recursive: true, force: true });
  }
});
