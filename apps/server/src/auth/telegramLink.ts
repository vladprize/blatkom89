/**
 * V2.0 part E: Telegram is attached to an account that already exists, so opening the game in Telegram
 * never makes a second profile and never resets progress (docs/TELEGRAM.md §4). Two ways:
 *
 *   From the website: the player asks for a one-time code (10 minutes; only its HMAC is kept) and gets
 *   the bot's address `t.me/<bot>?start=link_<code>`. The bot answers with a button that opens the game
 *   in Telegram with `?tglink=<code>`; the game signs in with Telegram's signed launch data (checked on
 *   the server — never `initDataUnsafe`) and the code, and the Telegram account is bound to the code's
 *   account.
 *
 *   Inside Telegram: the player signs in to the account by its email and password; the signed launch
 *   data goes along, and the Telegram account is bound to that account.
 *
 * When the Telegram account already belongs to another game account: an EMPTY one — made by an earlier
 * launch in Telegram, it never finished a match, has no XP, coins, purchases, gang, friends or other
 * way in — lets the Telegram id go: it is kept as it was, marked `merged_into` the real account and left
 * out of player counts; nothing is deleted. An account with anything in it keeps its Telegram id
 * (`conflict`): nothing changes, and Telegram keeps opening that account. A code works once, also when
 * it fails.
 */
import { createHmac, randomBytes } from 'node:crypto';
import type postgres from 'postgres';
import type { Sql } from '../database/db.js';

export const TELEGRAM_LINK_TTL_MS = 10 * 60_000;
export type TelegramLinkOutcome = 'linked' | 'already' | 'conflict' | 'expired' | 'invalid';

/** The code as it travels: in `t.me/<bot>?start=link_<code>` and `?tglink=<code>` (16 base64url characters). */
export const LINK_CODE_RE = /^[A-Za-z0-9_-]{16,32}$/;
const hashCode = (secret: string, code: string) => createHmac('sha256', secret).update(`tglink:${code}`).digest('base64url');

export class TelegramLinkError extends Error {
  constructor(readonly code: 'already_linked' | 'no_user') {
    super(code);
  }
}

/** A new one-time code for the player (an earlier unused one stops working). */
export async function createTelegramLinkCode(sql: Sql, secret: string, userId: string, now = Date.now()): Promise<{ code: string; expiresAt: Date }> {
  const [u] = await sql<Array<{ telegram_id: string | null }>>`SELECT telegram_id::text FROM users WHERE id = ${userId} AND deleted_at IS NULL`;
  if (!u) throw new TelegramLinkError('no_user');
  if (u.telegram_id) throw new TelegramLinkError('already_linked');
  const code = randomBytes(12).toString('base64url');
  const expiresAt = new Date(now + TELEGRAM_LINK_TTL_MS);
  await sql.begin(async (tx) => {
    await tx`DELETE FROM telegram_link_codes WHERE user_id = ${userId} AND used_at IS NULL`;
    await tx`INSERT INTO telegram_link_codes (code_hash, user_id, expires_at) VALUES (${hashCode(secret, code)}, ${userId}, ${expiresAt})`;
  });
  return { code, expiresAt };
}

type Tx = postgres.TransactionSql<Record<string, unknown>>;

/**
 * Binds the Telegram account to `targetId` inside a transaction (see the file's comment). `released` is
 * the empty account that let the Telegram id go.
 */
async function bind(tx: Tx, targetId: string, telegramId: string): Promise<{ outcome: 'linked' | 'already' | 'conflict'; released: string | null }> {
  const [target] = await tx<Array<{ id: string; telegram_id: string | null }>>`SELECT id, telegram_id::text FROM users WHERE id = ${targetId} AND deleted_at IS NULL FOR UPDATE`;
  if (!target) return { outcome: 'conflict', released: null };
  if (target.telegram_id === telegramId) return { outcome: 'already', released: null };
  if (target.telegram_id) return { outcome: 'conflict', released: null };
  const [owner] = await tx<Array<{ id: string }>>`SELECT id FROM users WHERE telegram_id = ${telegramId}::bigint FOR UPDATE`;
  if (owner) {
    const [row] = await tx<Array<{ empty: boolean }>>`
      SELECT COALESCE((SELECT p.matches_played = 0 AND p.xp = 0 AND p.tokens = 0 AND p.diamonds = 0 FROM profiles p WHERE p.user_id = ${owner.id}), true)
         AND (SELECT email IS NULL AND dev_device_id IS NULL FROM users WHERE id = ${owner.id})
         AND NOT EXISTS (SELECT 1 FROM user_identities WHERE user_id = ${owner.id})
         AND NOT EXISTS (SELECT 1 FROM user_items WHERE user_id = ${owner.id})
         AND NOT EXISTS (SELECT 1 FROM club_members WHERE user_id = ${owner.id})
         AND NOT EXISTS (SELECT 1 FROM friendships WHERE user_id = ${owner.id} OR friend_id = ${owner.id}) AS empty`;
    if (!row?.empty) return { outcome: 'conflict', released: null };
    // the empty account an earlier launch in Telegram made: it stays as it was, only without Telegram
    await tx`UPDATE users SET telegram_id = NULL, merged_into = ${targetId}, merged_at = now() WHERE id = ${owner.id}`;
  }
  await tx`UPDATE users SET telegram_id = ${telegramId}::bigint, last_seen_at = now() WHERE id = ${targetId}`;
  return { outcome: 'linked', released: owner?.id ?? null };
}

/** The Telegram account opened the bot's link: binds it to the code's account. */
export async function useTelegramLinkCode(sql: Sql, secret: string, code: string, telegramId: string, now = Date.now()): Promise<{ outcome: TelegramLinkOutcome; userId: string | null; released: string | null }> {
  if (!LINK_CODE_RE.test(code)) return { outcome: 'invalid', userId: null, released: null };
  const hash = hashCode(secret, code);
  return sql.begin(async (tx) => {
    const [c] = await tx<Array<{ user_id: string; expires_at: Date; used_at: Date | null }>>`SELECT user_id, expires_at, used_at FROM telegram_link_codes WHERE code_hash = ${hash} FOR UPDATE`;
    if (!c || c.used_at) return { outcome: 'invalid' as const, userId: null, released: null };
    await tx`UPDATE telegram_link_codes SET used_at = now() WHERE code_hash = ${hash}`;
    if (c.expires_at.getTime() < now) return { outcome: 'expired' as const, userId: null, released: null };
    const r = await bind(tx, c.user_id, telegramId);
    return { outcome: r.outcome, userId: r.outcome === 'conflict' ? null : c.user_id, released: r.released };
  });
}

/** Inside Telegram the player signed in to `userId` by email: binds this Telegram account to it. */
export async function linkTelegramToAccount(sql: Sql, userId: string, telegramId: string): Promise<{ outcome: 'linked' | 'already' | 'conflict'; released: string | null }> {
  return sql.begin((tx) => bind(tx, userId, telegramId));
}

/** The bot's address that starts the linking (the bot's username is public). */
export function telegramLinkUrl(botUsername: string, code: string): string {
  return `https://t.me/${botUsername}?start=link_${code}`;
}
