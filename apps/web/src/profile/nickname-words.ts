/**
 * District-style nickname suggestions in the player's language — the word lists live in the shared
 * package (game-rules/nicknames.ts).
 */
import { randomNickname as sharedNickname } from '@blatkom/shared';
import { getLang } from '../i18n/index.js';

export function randomNickname(rnd: () => number = Math.random, lang = getLang()): string {
  return sharedNickname(rnd, lang);
}
