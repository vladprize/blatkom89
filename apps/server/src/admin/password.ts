/** scrypt password hashing (node:crypto). Format: scrypt$N$r$p$salt$hash (base64url). */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || n > 1 << 20) return false;
  const salt = Buffer.from(parts[4]!, 'base64url');
  const expected = Buffer.from(parts[5]!, 'base64url');
  const key = await scrypt(password, salt, n, r, p);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Used to equalize timing when the username does not exist. */
export const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + Buffer.alloc(64).toString('base64url');

export function passwordProblems(password: string): string | null {
  if (password.length < 12) return 'Пароль должен быть не короче 12 символов';
  if (/^(.)\1+$/.test(password)) return 'Пароль слишком простой';
  return null;
}
