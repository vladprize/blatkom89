/**
 * V2.0 referral links: `?ref=<code>` on the website, `/start ref_<code>` through the bot (Telegram passes
 * it to the server inside the signed launch data). The first code this browser was opened with is kept
 * until the first sign-in: the server attaches it to the account only if that account is new.
 */
import { isRefCode } from '@blatkom/shared';
import { storageGet, storageSet } from '../app/settings.js';

const REF_KEY = 'blatkom89.ref';

/** Reads `?ref=` once and takes it out of the address (the first code wins). */
export function captureReferral(loc: Pick<Location, 'search' | 'pathname' | 'hash'> = location, replace: (url: string) => void = (u) => history.replaceState(history.state, '', u)): string | null {
  const q = new URLSearchParams(loc.search);
  const code = q.get('ref');
  if (code === null) return pendingReferral();
  if (isRefCode(code) && !storageGet(REF_KEY)) storageSet(REF_KEY, code);
  q.delete('ref');
  const qs = q.toString();
  replace(`${loc.pathname}${qs ? `?${qs}` : ''}${loc.hash}`);
  return pendingReferral();
}

export function pendingReferral(): string | null {
  const v = storageGet(REF_KEY);
  return isRefCode(v) ? v : null;
}

/** After the first sign-in from this browser the code has done its job (or was not needed). */
export function clearReferral(): void {
  storageSet(REF_KEY, null);
}
