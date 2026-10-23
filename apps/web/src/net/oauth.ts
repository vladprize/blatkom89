/**
 * Signing in with Google, Facebook, Discord, Reddit or Telegram on the website (v0.3) — the page's part.
 *
 * Leaving: the page asks the server for an intent (it names the account the page is on, so a guest's
 * progress gets the provider attached) and goes to /api/auth/oauth/<provider>/start; Telegram goes to
 * oauth.telegram.org. Coming back: the provider's redirect lands on the site with `#login=<code>` (or
 * `?login_error=…`), Telegram with `#tgAuthResult=…` or the signed fields in the query; `readLoginReturn`
 * picks them up (and cleans the address) so the online client can trade them for a session.
 */
export type LoginProvider = 'google' | 'facebook' | 'discord' | 'reddit' | 'telegram';

export interface ProvidersInfo {
  providers: Array<Exclude<LoginProvider, 'telegram'>>;
  telegram: { botId: string } | null;
  /** V2.0 part E: the bot can attach Telegram to this account (the website's «Link Telegram»). */
  telegramLink?: boolean;
}

export type LoginReturn = { kind: 'oauth'; code: string } | { kind: 'telegram'; data: Record<string, string | number> } | { kind: 'error'; reason: string };

const TG_FIELDS = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash'];

/** What a provider sent back in the address (once: the address is cleaned). */
export function readLoginReturn(loc: Pick<Location, 'hash' | 'search' | 'pathname'> = location, replace: (url: string) => void = (u) => history.replaceState(null, '', u)): LoginReturn | null {
  const hash = loc.hash.replace(/^#/, '');
  const hp = new URLSearchParams(hash);
  const q = new URLSearchParams(loc.search);
  let out: LoginReturn | null = null;
  const login = hp.get('login');
  const tg = hp.get('tgAuthResult');
  if (login && /^[A-Za-z0-9_-]{20,80}$/.test(login)) out = { kind: 'oauth', code: login };
  else if (tg) {
    try {
      const bin = atob(tg.replace(/-/g, '+').replace(/_/g, '/'));
      const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
      if (json && typeof json === 'object') out = { kind: 'telegram', data: pickTelegram(json as Record<string, unknown>) };
    } catch {
      out = { kind: 'error', reason: 'telegram' };
    }
  } else if (q.get('hash') && q.get('id') && q.get('auth_date')) {
    out = { kind: 'telegram', data: pickTelegram(Object.fromEntries(q.entries())) };
  } else if (q.get('login_error')) out = { kind: 'error', reason: q.get('login_error')!.slice(0, 32) };
  if (out) {
    const rest = new URLSearchParams(loc.search);
    for (const k of ['login_error', ...TG_FIELDS]) rest.delete(k);
    const qs = rest.toString();
    replace(`${loc.pathname}${qs ? `?${qs}` : ''}`);
  }
  return out;
}

function pickTelegram(src: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(src)) {
    if (!/^[a-z_]{1,32}$/.test(k)) continue;
    if (typeof v === 'string' || typeof v === 'number') out[k] = v;
  }
  return out;
}

/** Off to the provider (the page is left; the intent says which account to attach the provider to). */
export function goToProvider(provider: Exclude<LoginProvider, 'telegram'>, intent: string): void {
  location.href = new URL(`api/auth/oauth/${provider}/start?intent=${encodeURIComponent(intent)}`, document.baseURI).toString();
}

/** Off to Telegram's sign-in page; it comes back to this page with the signed data. */
export function goToTelegram(botId: string): void {
  const origin = location.origin;
  const back = `${origin}${location.pathname}`;
  location.href = `https://oauth.telegram.org/auth?bot_id=${encodeURIComponent(botId)}&origin=${encodeURIComponent(origin)}&request_access=write&return_to=${encodeURIComponent(back)}`;
}
