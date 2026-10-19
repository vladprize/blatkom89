/**
 * Player-facing text for server errors. The server answers in English with a stable error code;
 * the client shows a localized text: a fixed text per code where one exists, otherwise the server's
 * own message through the dictionary (ru.ts carries the server's English messages too).
 */
import { t } from '../i18n/index.js';
import { refusalText } from '../i18n/content.js';
import type { BuyRefusal } from '@blatkom/shared';

const REFUSALS: ReadonlySet<string> = new Set<BuyRefusal>(['owned', 'level', 'funds', 'not_for_sale', 'not_fit', 'not_owned', 'collection_complete']);

/** English base text per code (translated with t() when shown). */
const CODE_TEXT: Record<string, string> = {
  network: 'No line to the server. Check your internet.',
  unauthorized: 'Your session has gone stale. Restart the game.',
  capacity: 'The server is packed like a tram at rush hour. Try again later.',
  room_not_found: 'Room not found.',
  room_full: 'The room is full.',
  room_closed: 'The room is closed.',
  version_mismatch: 'The game has been updated — reload the page.',
  not_host: 'Only the room’s host can do that.',
  match_running: 'The match is already on.',
  team_full: 'That team already has more players — the teams must stay even.',
  character_locked: 'This character isn’t unlocked yet.',
  bad_message: 'The server didn’t understand the request.',
  internal: 'Something broke on the server. Try again.',
};

/** Localized message for an error code (+ the server's English message as a fallback). */
export function errorText(code: string, serverMessage?: string | null, status?: number): string {
  if (REFUSALS.has(code)) return refusalText(code as BuyRefusal);
  if (code === 'not_enough_players') {
    const n = Number(/\d+/.exec(serverMessage ?? '')?.[0] ?? 2);
    return t('At least {n} players needed', { n });
  }
  // the code is generic for several situations: keep the server's (more precise) message
  if (code === 'rate_limited' && serverMessage) return t(serverMessage);
  const fixed = CODE_TEXT[code];
  if (fixed) return t(fixed);
  if (serverMessage) return t(serverMessage);
  return status ? t('Server error ({n})', { n: status }) : t('That didn’t work');
}

/** Text of anything thrown by the API client or the online flow. */
export function apiErrorText(e: unknown): string {
  if (e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string') {
    const err = e as { code: string; message?: string; status?: number };
    return errorText(err.code, err.message, err.status);
  }
  if (e instanceof Error && e.message) return t(e.message);
  return t('That didn’t work');
}
