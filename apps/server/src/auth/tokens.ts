/** Opaque bearer tokens: 32 random bytes (base64url) shown once; only an HMAC is stored. */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(secret: string, token: string, purpose = 'session'): Buffer {
  return createHmac('sha256', secret).update(`${purpose}:${token}`).digest();
}

export function safeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
