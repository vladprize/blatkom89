/**
 * V2.0 part F: the first touch — what this browser's first visit came with: a partner's link (`?p=`), a
 * campaign (`utm_source`, `utm_medium`, `utm_campaign`), a room invitation (`?invite=`), another site (the
 * referring domain; only the domain). Read once and kept in this browser — later visits change nothing —
 * and sent with the visit ping and the first sign-up; the server keeps it with the new account. `?p=` and
 * `utm_*` are taken out of the address. Analytics only: nothing is paid or credited for it.
 */
import type { FirstTouch } from '@blatkom/shared';
import { storageGet, storageSet } from '../app/settings.js';

const KEY = 'blatkom89.first-touch';
const UTM = ['utm_source', 'utm_medium', 'utm_campaign'] as const;

const utmValue = (v: string | null): string | undefined => {
  if (!v) return undefined;
  const s = v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ._+-]+/g, '_')
    .replace(/^[ _]+|[ _]+$/g, '')
    .slice(0, 64);
  return s || undefined;
};

/** What an address and a referrer carry (pure: no storage, no address changes). */
export function firstTouchOf(search: string, referrer: string, host: string): FirstTouch {
  const q = new URLSearchParams(search);
  const out: FirstTouch = {};
  const p = (q.get('p') ?? '').trim().toLowerCase();
  if (/^[a-z0-9_]{3,24}$/.test(p)) out.partner = p;
  const src = utmValue(q.get('utm_source'));
  if (src) {
    out.utmSource = src;
    const medium = utmValue(q.get('utm_medium'));
    const campaign = utmValue(q.get('utm_campaign'));
    if (medium) out.utmMedium = medium;
    if (campaign) out.utmCampaign = campaign;
  }
  if (q.has('invite')) out.invite = true;
  try {
    const r = referrer ? new URL(referrer) : null;
    if (r && /^https?:$/.test(r.protocol) && r.host && r.host !== host) {
      const d = r.hostname.toLowerCase().replace(/^www\./, '').slice(0, 80);
      if (/^[a-z0-9.-]+$/.test(d)) out.referrer = d;
    }
  } catch {
    /* not an address */
  }
  return out;
}

/**
 * Reads the first touch once (the first visit of this browser keeps it) and cleans `?p=` / `utm_*` out of
 * the address. Returns the kept first touch.
 */
export function captureFirstTouch(
  loc: Pick<Location, 'search' | 'pathname' | 'hash' | 'host'> = location,
  referrer: string = typeof document !== 'undefined' ? document.referrer : '',
  replace: (url: string) => void = (u) => history.replaceState(history.state, '', u),
): FirstTouch {
  const now = firstTouchOf(loc.search, referrer, loc.host);
  const q = new URLSearchParams(loc.search);
  if (q.has('p') || UTM.some((k) => q.has(k))) {
    q.delete('p');
    for (const k of UTM) q.delete(k);
    const qs = q.toString();
    replace(`${loc.pathname}${qs ? `?${qs}` : ''}${loc.hash}`);
  }
  const kept = pendingFirstTouch();
  if (kept) return kept;
  storageSet(KEY, JSON.stringify(now));
  return now;
}

/** The kept first touch of this browser (null before the first visit was read). */
export function pendingFirstTouch(): FirstTouch | null {
  const raw = storageGet(KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as FirstTouch;
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

/** For the requests: undefined instead of an empty object. */
export function firstTouchForRequest(t: FirstTouch | null): FirstTouch | undefined {
  return t && Object.keys(t).length ? t : undefined;
}
