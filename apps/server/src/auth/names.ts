/**
 * Unique aliases: no two living accounts share one (users.name_key = nameKey(display_name), unique
 * index users_name_key_unique, migration 010; the key ignores letter case, spacing and Cyrillic
 * look-alikes of Latin letters). New accounts whose name is taken (a Telegram first name, a guest's
 * temporary name) get the first free numbered variant; a player choosing an alias is told it is taken
 * and offered free variants.
 */
import { MAX_NAME_LENGTH, nameKey, numberedAlias } from '@blatkom/shared';
import type { Sql } from '../database/db.js';

/** Postgres unique violation on the alias index (a concurrent sign-up took the name first). */
export function isNameConflict(e: unknown): boolean {
  const err = e as { code?: string; constraint_name?: string; constraint?: string } | null;
  return !!err && err.code === '23505' && (err.constraint_name ?? err.constraint ?? '').includes('name_key');
}

export async function isNameFree(sql: Sql, name: string, exceptUserId?: string): Promise<boolean> {
  const key = nameKey(name);
  const rows = exceptUserId
    ? await sql<Array<{ id: string }>>`SELECT id FROM users WHERE name_key = ${key} AND deleted_at IS NULL AND id <> ${exceptUserId} LIMIT 1`
    : await sql<Array<{ id: string }>>`SELECT id FROM users WHERE name_key = ${key} AND deleted_at IS NULL LIMIT 1`;
  return rows.length === 0;
}

/** The name itself when free, otherwise the first free numbered variant (then a random one). */
export async function freeName(sql: Sql, base: string): Promise<string> {
  if (await isNameFree(sql, base)) return base;
  // one query for the variants already used (every numbered variant starts with this prefix)
  const prefix = nameKey(base.slice(0, MAX_NAME_LENGTH - 5)).replace(/[\\%_]/g, (c) => `\\${c}`) + '%';
  const used = new Set((await sql<Array<{ k: string }>>`SELECT name_key AS k FROM users WHERE name_key LIKE ${prefix} AND deleted_at IS NULL`).map((r) => r.k));
  for (let n = 2; n < 1000; n++) {
    const candidate = numberedAlias(base, n);
    if (!used.has(nameKey(candidate)) && (await isNameFree(sql, candidate))) return candidate;
  }
  return numberedAlias(base, 1000 + Math.floor(Math.random() * 9000));
}

/** A few free variants of a taken alias for the player to pick from. */
export async function suggestNames(sql: Sql, base: string, count = 3): Promise<string[]> {
  const out: string[] = [];
  const tries = [
    ...[89, 777, 1989, 7].map((n) => `${base.slice(0, MAX_NAME_LENGTH - String(n).length - 1)}_${n}`),
    ...Array.from({ length: 6 }, () => numberedAlias(base, 2 + Math.floor(Math.random() * 98))),
  ];
  for (const c of tries) {
    if (out.length >= count) break;
    if (out.some((x) => nameKey(x) === nameKey(c))) continue;
    if (await isNameFree(sql, c)) out.push(c);
  }
  return out;
}
