/**
 * v0.2.20 (the owner's final edits): promo codes for BLATS — BLATNOY gives 500, for the owner's friends.
 * The codes, their amounts, end dates and caps live on the server (table promo_codes); each code works once
 * per account. A code is typed in any case, with spaces, or in Russian letters: «blatnoy», «Blat noy» and
 * «БЛАТНОЙ» are all BLATNOY.
 */
import { transliterate } from './aliases.js';

/** A code as the server keeps it: 3–32 capital Latin letters, digits, _ and -. */
export const PROMO_CODE_RE = /^[A-Z0-9_-]{3,32}$/;

/** «blatnoy», « Blat noy », «БЛАТНОЙ» → «BLATNOY». */
export function normalizePromoCode(raw: string): string {
  return transliterate(raw).replace(/\s+/g, '').toUpperCase();
}
