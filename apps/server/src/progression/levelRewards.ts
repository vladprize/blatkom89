/**
 * v0.2.18: BLATS for levels — 10 for every new level (2 and up), each level paid once. Called in the
 * match-results and story transactions, and whenever the player's own profile is read (sign-in, /api/me)
 * and has levels not paid yet (the levels reached before v0.2.18 are paid that way, once).
 *
 * Every credit is a ledger row (currency `diamonds` — BLATS in the game — reason `level`, ref `level:7`);
 * a unique index makes a second write of the same level impossible, also under retries and concurrent
 * requests, and `profiles.blats_level` remembers how far the levels are paid.
 */
import { blatsForLevel } from '@blatkom/shared';
import type postgres from 'postgres';

type Tx = postgres.TransactionSql<Record<string, unknown>>;

/** Credits the levels up to `level` not paid yet. Call inside a transaction (it locks the profile row). */
export async function creditLevelBlats(tx: Tx, userId: string, level: number): Promise<{ gained: number; balance: number }> {
  const [p] = await tx<Array<{ diamonds: number; blats_level: number }>>`SELECT diamonds, blats_level FROM profiles WHERE user_id = ${userId} FOR UPDATE`;
  if (!p) return { gained: 0, balance: 0 };
  if (p.blats_level >= level) return { gained: 0, balance: p.diamonds };
  let balance = p.diamonds;
  let gained = 0;
  for (let l = Math.max(2, p.blats_level + 1); l <= level; l++) {
    const amount = blatsForLevel(l);
    if (amount <= 0) continue;
    const ins = await tx`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref) VALUES (${userId}, 'diamonds', ${amount}, ${balance + amount}, 'level', ${`level:${l}`}) ON CONFLICT DO NOTHING RETURNING id`;
    if (ins.length === 0) continue;
    balance += amount;
    gained += amount;
  }
  await tx`UPDATE profiles SET diamonds = ${balance}, blats_level = GREATEST(blats_level, ${level}), updated_at = now() WHERE user_id = ${userId}`;
  return { gained, balance };
}
