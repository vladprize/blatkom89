/**
 * Small signed tokens (HMAC-SHA-256 with the session secret): `<base64url JSON>.<mac>`, a purpose
 * (`kind`) mixed into the MAC so a token made for one thing never passes as another, and a time `t` in
 * the payload that bounds its age. Used for the sign-in intent and state (auth/oauth.ts) and the story
 * mission tickets (api/story.ts). The payload is readable by whoever holds the token — never put a
 * secret in it.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signToken(secret: string, kind: string, payload: Record<string, unknown> & { t: number }): string {
  const body = b64(JSON.stringify(payload));
  const mac = createHmac('sha256', secret).update(`${kind}.${body}`).digest('base64url');
  return `${body}.${mac}`;
}

/** The payload when the signature is right and `t` is not older than `maxAgeMs` (nor in the future). */
export function readToken<T>(secret: string, kind: string, token: string, maxAgeMs: number, now = Date.now()): (T & { t: number }) | null {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const [body, mac, extra] = token.split('.');
  if (!body || !mac || extra !== undefined) return null;
  const want = Buffer.from(createHmac('sha256', secret).update(`${kind}.${body}`).digest('base64url'));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { t?: number };
    if (!p || typeof p !== 'object' || typeof p.t !== 'number' || p.t > now + 60_000 || now - p.t > maxAgeMs) return null;
    return p as T & { t: number };
  } catch {
    return null;
  }
}
