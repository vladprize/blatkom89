/**
 * Telegram Mini App initData validation (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 *
 *   secret_key       = HMAC_SHA256(key = "WebAppData", message = bot_token)
 *   data_check_string = all received fields except `hash`, sorted by key, "key=value" joined with "\n"
 *   valid            ⇔ hex(HMAC_SHA256(key = secret_key, message = data_check_string)) == hash
 *
 * Since Bot API 8.0 initData may also carry `signature` (Ed25519, for third-party validation); it is a
 * regular received field and therefore part of the data-check-string for the HMAC check above.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { latinName } from '@blatkom/shared';

export interface TelegramUser {
  id: number;
  firstName: string;
  lastName: string | null;
  languageCode: string | null;
}

export type InitDataResult =
  | { ok: true; user: TelegramUser; authDate: number; startParam: string | null }
  | { ok: false; reason: 'malformed' | 'missing_hash' | 'bad_signature' | 'stale' | 'future' | 'no_user' };

const UserSchema = z
  .object({
    id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    first_name: z.string().max(256).default(''),
    last_name: z.string().max(256).optional(),
    language_code: z.string().max(16).optional(),
  })
  .passthrough();

/** Derives the HMAC key from the bot token. Exported for tests that need to sign fixtures. */
export function telegramSecretKey(botToken: string): Buffer {
  return createHmac('sha256', 'WebAppData').update(botToken).digest();
}

export function dataCheckString(params: URLSearchParams): string {
  const pairs: string[] = [];
  for (const [k, v] of params) if (k !== 'hash') pairs.push(`${k}=${v}`);
  pairs.sort();
  return pairs.join('\n');
}

/** Signs a set of fields the way Telegram does (test fixtures / local tooling only). */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  const hash = createHmac('sha256', telegramSecretKey(botToken)).update(dataCheckString(params)).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

export function validateInitData(initData: string, botToken: string, maxAgeSec: number, nowSec = Math.floor(Date.now() / 1000)): InitDataResult {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const seen = new Set<string>();
  for (const k of params.keys()) {
    if (seen.has(k)) return { ok: false, reason: 'malformed' };
    seen.add(k);
  }
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: 'missing_hash' };
  const expected = createHmac('sha256', telegramSecretKey(botToken)).update(dataCheckString(params)).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'bad_signature' };

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate <= 0) return { ok: false, reason: 'malformed' };
  if (authDate > nowSec + 60) return { ok: false, reason: 'future' };
  if (nowSec - authDate > maxAgeSec) return { ok: false, reason: 'stale' };

  const rawUser = params.get('user');
  if (!rawUser) return { ok: false, reason: 'no_user' };
  let user: z.infer<typeof UserSchema>;
  try {
    const parsed = UserSchema.safeParse(JSON.parse(rawUser));
    if (!parsed.success) return { ok: false, reason: 'no_user' };
    user = parsed.data;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const startParam = params.get('start_param');
  return {
    ok: true,
    authDate,
    startParam: startParam && /^[A-Za-z0-9_-]{1,64}$/.test(startParam) ? startParam : null,
    user: { id: user.id, firstName: user.first_name, lastName: user.last_name ?? null, languageCode: user.language_code ?? null },
  };
}

/** Builds an in-game display name from Telegram names (letters, digits, space, _ . - ’ '). */
/** The first alias of a new Telegram player: their name in Latin letters (v0.3: «Влад» → «Vlad»). */
export function displayNameFromTelegram(u: TelegramUser): string {
  return latinName(`${u.firstName} ${u.lastName ?? ''}`, `Comrade ${String(u.id).slice(-4)}`);
}
