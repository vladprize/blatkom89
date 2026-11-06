/**
 * v0.2.20 (the owner's final edits): BLATS given once.
 *
 *  - The welcome bonus (WELCOME_BONUS_BLATS, 199 by default) when a guest account registers: links an
 *    email, or a sign-in provider on the website (Google…, Telegram), or is created through one. An account
 *    that already had a way to sign in (an email, Telegram, a provider) is registered already: nothing.
 *  - Promo codes (table promo_codes; BLATNOY — 500, the owner's code for his friends): each code once per
 *    account, while it is active, before its end date and under its cap on uses.
 *
 * Every credit is a ledger row (currency `diamonds` — BLATS in the game): reason `welcome` (one per account)
 * or `promo` with the operation id `promo:<CODE>` (one per account and code). Unique indexes (migration 027)
 * make a second credit impossible, also under retries and concurrent requests.
 */
import { PROMO_CODE_RE, normalizePromoCode } from '@blatkom/shared';
import type postgres from 'postgres';
import type { Sql } from '../database/db.js';

type Tx = postgres.TransactionSql<Record<string, unknown>>;

/** The ways an account signs in: `email`, `telegram`, or an OAuth provider (`google`…). */
export type SignInWay = string;

/** Locks the wallet (making the profile row if the player has none yet) and returns its BLATS. */
async function lockWallet(tx: Tx, userId: string): Promise<number> {
  await tx`INSERT INTO profiles (user_id) VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING`;
  const [p] = await tx<Array<{ diamonds: number }>>`SELECT diamonds FROM profiles WHERE user_id = ${userId} FOR UPDATE`;
  return p?.diamonds ?? 0;
}

/**
 * Pays the welcome bonus for the registration just made with `via` — if the account had no other way to sign
 * in (it was a guest, or it is new) and has not been paid. Returns the BLATS paid (0: none) and the balance.
 */
export async function creditWelcomeBonus(sql: Sql, userId: string, amount: number, via: SignInWay): Promise<{ gained: number; balance: number | null }> {
  if (amount <= 0) return { gained: 0, balance: null };
  return sql.begin(async (tx) => {
    const [u] = await tx<Array<{ email: string | null; telegram: boolean; providers: string[] }>>`
      SELECT u.email, u.telegram_id IS NOT NULL AS telegram,
             ARRAY(SELECT i.provider FROM user_identities i WHERE i.user_id = u.id) AS providers
      FROM users u WHERE u.id = ${userId} AND u.deleted_at IS NULL`;
    if (!u) return { gained: 0, balance: null };
    const ways = [...(u.email ? ['email'] : []), ...(u.telegram ? ['telegram'] : []), ...u.providers];
    // registered before this: the bonus is for becoming registered
    if (ways.some((w) => w !== via)) return { gained: 0, balance: null };
    const balance = await lockWallet(tx, userId);
    const ins = await tx`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref) VALUES (${userId}, 'diamonds', ${amount}, ${balance + amount}, 'welcome', ${`welcome:${via}`}) ON CONFLICT DO NOTHING RETURNING id`;
    if (ins.length === 0) return { gained: 0, balance };
    await tx`UPDATE profiles SET diamonds = ${balance + amount}, updated_at = now() WHERE user_id = ${userId}`;
    return { gained: amount, balance: balance + amount };
  });
}

/** The bonus after a registration that has already happened: never fails it (a database hiccup is logged). */
export async function welcomeAfterRegistration(sql: Sql, log: { warn(m: string, f?: Record<string, unknown>): void }, userId: string, amount: number, via: SignInWay): Promise<number> {
  try {
    return (await creditWelcomeBonus(sql, userId, amount, via)).gained;
  } catch (e) {
    log.warn('welcome bonus failed', { via, err: e as Error });
    return 0;
  }
}

export type PromoOutcome =
  | { ok: true; code: string; gained: number; balance: number }
  | { ok: false; reason: 'unknown' | 'used' | 'expired' | 'exhausted' };

/** Redeems a promo code (as typed: game-rules/promo.ts spells it out) for the player. */
export async function redeemPromo(sql: Sql, userId: string, typed: string, now = new Date()): Promise<PromoOutcome> {
  const code = normalizePromoCode(typed);
  if (!PROMO_CODE_RE.test(code)) return { ok: false, reason: 'unknown' };
  return sql.begin(async (tx): Promise<PromoOutcome> => {
    // the code's row is locked, so its cap on uses holds under concurrent requests
    const [c] = await tx<Array<{ diamonds: number; active: boolean; max_uses: number | null; expires_at: Date | null }>>`
      SELECT diamonds, active, max_uses, expires_at FROM promo_codes WHERE code = ${code} FOR UPDATE`;
    if (!c) return { ok: false, reason: 'unknown' };
    const ref = `promo:${code}`;
    const [mine] = await tx`SELECT 1 FROM currency_ledger WHERE user_id = ${userId} AND reason = 'promo' AND ref = ${ref}`;
    if (mine) return { ok: false, reason: 'used' };
    if (!c.active || (c.expires_at && c.expires_at.getTime() <= now.getTime())) return { ok: false, reason: 'expired' };
    if (c.max_uses !== null) {
      const [n] = await tx<Array<{ n: number }>>`SELECT count(*)::int AS n FROM currency_ledger WHERE reason = 'promo' AND ref = ${ref}`;
      if ((n?.n ?? 0) >= c.max_uses) return { ok: false, reason: 'exhausted' };
    }
    const balance = await lockWallet(tx, userId);
    const ins = await tx`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref) VALUES (${userId}, 'diamonds', ${c.diamonds}, ${balance + c.diamonds}, 'promo', ${ref}) ON CONFLICT DO NOTHING RETURNING id`;
    if (ins.length === 0) return { ok: false, reason: 'used' };
    await tx`UPDATE profiles SET diamonds = ${balance + c.diamonds}, updated_at = now() WHERE user_id = ${userId}`;
    return { ok: true, code, gained: c.diamonds, balance: balance + c.diamonds };
  });
}
