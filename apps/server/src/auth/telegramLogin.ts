/**
 * Telegram on the website (v0.3): «Log in with Telegram» (oauth.telegram.org) outside the Mini App.
 * Telegram signs what it sends back with the bot token, differently from Mini App data:
 *
 *   secret_key        = SHA256(bot_token)
 *   data_check_string = every field except `hash`, sorted by key, "key=value" joined by "\n"
 *   valid             ⇔ hex(HMAC_SHA256(secret_key, data_check_string)) == hash   (constant-time)
 *
 * https://core.telegram.org/widgets/login#checking-authorization. The account is found by the
 * Telegram id — the same account the Mini App signs in to, so a player keeps one profile in Telegram
 * and in the browser. Needs the site's domain set for the bot in @BotFather (/setdomain).
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** Field values as Telegram sends them (strings and numbers; nothing nested). */
export const TelegramLoginData = z.record(z.string().max(32), z.union([z.string().max(512), z.number()])).refine((r) => Object.keys(r).length <= 16, 'too many fields');

export type TelegramLoginResult = { ok: true; user: { id: number; firstName: string; lastName: string | null } } | { ok: false; reason: 'missing_hash' | 'bad_signature' | 'stale' | 'future' | 'no_user' };

export function validateTelegramLogin(data: Record<string, string | number>, botToken: string, maxAgeSec: number, nowSec = Math.floor(Date.now() / 1000)): TelegramLoginResult {
  const hash = String(data.hash ?? '');
  if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: 'missing_hash' };
  const check = Object.keys(data)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${String(data[k])}`)
    .join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  const want = Buffer.from(createHmac('sha256', secret).update(check).digest('hex'));
  const got = Buffer.from(hash);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'bad_signature' };
  const at = Number(data.auth_date);
  if (!Number.isFinite(at)) return { ok: false, reason: 'stale' };
  if (at > nowSec + 60) return { ok: false, reason: 'future' };
  if (nowSec - at > maxAgeSec) return { ok: false, reason: 'stale' };
  const id = Number(data.id);
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, reason: 'no_user' };
  const first = String(data.first_name ?? '').slice(0, 64);
  const last = data.last_name !== undefined ? String(data.last_name).slice(0, 64) : null;
  return { ok: true, user: { id, firstName: first, lastName: last } };
}

/** The bot's id is the token's first part (public: the login page shows the bot by it). */
export function botIdOf(token: string): string | null {
  const id = token.split(':')[0] ?? '';
  return /^\d{5,15}$/.test(id) ? id : null;
}
