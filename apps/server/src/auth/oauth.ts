/**
 * Sign-in with Google, Facebook, Discord and Reddit (v0.3) — OAuth 2.0 authorization code flow, server
 * side (a confidential client: the secrets never leave the server).
 *
 *   1. The page asks for an «intent» (POST /api/auth/oauth/intent, with its session if it has one) and
 *      navigates to /api/auth/oauth/:provider/start?intent=… — the server sets a short-lived cookie with a
 *      nonce and redirects to the provider with a signed `state` (provider, the current account, the nonce).
 *   2. The provider sends the player back to /api/auth/oauth/:provider/callback?code&state: the state's
 *      signature, age, provider and nonce (against the cookie) are checked, the code is traded for a token
 *      and the token for the player's id and name.
 *   3. The account: the one this provider id already belongs to; otherwise the current account gets it
 *      linked (a guest secures their progress in one tap); otherwise a new account. A one-time code goes
 *      back to the page in the address fragment (never sent to a server) and is traded for a session
 *      (POST /api/auth/oauth/finish), so no session token ever sits in an address.
 *
 * Nothing but the provider's id for the player is kept (no email, no picture, no tokens).
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../config/env.js';
import { readToken, signToken } from '../security/signed.js';

export const OAUTH_PROVIDERS = ['google', 'facebook', 'discord', 'reddit'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
export const isOAuthProvider = (v: string): v is OAuthProvider => (OAUTH_PROVIDERS as readonly string[]).includes(v);

export interface OAuthProfile {
  uid: string;
  name: string;
}

interface ProviderSpec {
  authorize: string;
  token: string;
  profile: string;
  scope: string;
  /** Extra parameters of the authorization request. */
  extra?: Record<string, string>;
  /** How the client authenticates at the token endpoint. */
  tokenAuth: 'body' | 'basic';
  /** Reddit wants a descriptive User-Agent on every call. */
  headers?: Record<string, string>;
  parse: (json: Record<string, unknown>) => OAuthProfile | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const UA = { 'user-agent': 'web:blatkom89:0.3 (game sign-in)' };

export function providerSpec(p: OAuthProvider, env: Pick<Env, 'FACEBOOK_GRAPH_VERSION'>): ProviderSpec {
  switch (p) {
    case 'google':
      return {
        authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
        token: 'https://oauth2.googleapis.com/token',
        profile: 'https://openidconnect.googleapis.com/v1/userinfo',
        scope: 'openid profile',
        extra: { prompt: 'select_account' },
        tokenAuth: 'body',
        parse: (j) => (str(j.sub) ? { uid: str(j.sub), name: str(j.given_name) || str(j.name) } : null),
      };
    case 'facebook': {
      const v = env.FACEBOOK_GRAPH_VERSION;
      return {
        authorize: `https://www.facebook.com/${v}/dialog/oauth`,
        token: `https://graph.facebook.com/${v}/oauth/access_token`,
        profile: `https://graph.facebook.com/${v}/me?fields=id,first_name,name`,
        scope: 'public_profile',
        tokenAuth: 'body',
        parse: (j) => (str(j.id) ? { uid: str(j.id), name: str(j.first_name) || str(j.name) } : null),
      };
    }
    case 'discord':
      return {
        authorize: 'https://discord.com/oauth2/authorize',
        token: 'https://discord.com/api/oauth2/token',
        profile: 'https://discord.com/api/users/@me',
        scope: 'identify',
        tokenAuth: 'body',
        parse: (j) => (str(j.id) ? { uid: str(j.id), name: str(j.global_name) || str(j.username) } : null),
      };
    case 'reddit':
      return {
        authorize: 'https://www.reddit.com/api/v1/authorize',
        token: 'https://www.reddit.com/api/v1/access_token',
        profile: 'https://oauth.reddit.com/api/v1/me',
        scope: 'identity',
        extra: { duration: 'temporary' },
        tokenAuth: 'basic',
        headers: UA,
        parse: (j) => (str(j.id) ? { uid: str(j.id), name: str(j.name) } : null),
      };
  }
}

/** The provider's client id and secret, or null when the provider is not set up. */
export function credentials(p: OAuthProvider, env: Env): { id: string; secret: string } | null {
  const pair: Record<OAuthProvider, [string | undefined, string | undefined]> = {
    google: [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET],
    facebook: [env.FACEBOOK_APP_ID, env.FACEBOOK_APP_SECRET],
    discord: [env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET],
    reddit: [env.REDDIT_CLIENT_ID, env.REDDIT_CLIENT_SECRET],
  };
  const [id, secret] = pair[p];
  return id && secret ? { id, secret } : null;
}

export function enabledProviders(env: Env): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter((p) => credentials(p, env) !== null);
}

export function callbackUrl(env: Pick<Env, 'PUBLIC_URL'>, p: OAuthProvider): string {
  return `${env.PUBLIC_URL.replace(/\/$/, '')}/api/auth/oauth/${p}/callback`;
}

// ── signed tokens: the intent (page → start) and the state (start → provider → callback) ─────────────

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sign = signToken;
const verify = readToken;

export interface OAuthIntent {
  /** The account the page is signed in to (it gets the provider linked when the id is new). */
  u: string | null;
  t: number;
}
export const intentToken = (secret: string, userId: string | null, now = Date.now()) => sign(secret, 'intent', { u: userId, t: now, r: b64(randomBytes(6)) });
export const readIntent = (secret: string, token: string, now = Date.now()) => verify<OAuthIntent>(secret, 'intent', token, 5 * 60_000, now);

export interface OAuthState {
  p: OAuthProvider;
  u: string | null;
  /** Matches the cookie set on the same browser: a link sent to someone else can't finish here. */
  n: string;
  t: number;
}
export const stateToken = (secret: string, s: Omit<OAuthState, 't'>, now = Date.now()) => sign(secret, 'state', { ...s, t: now });
export const readState = (secret: string, token: string, now = Date.now()) => verify<OAuthState>(secret, 'state', token, 10 * 60_000, now);

export const newNonce = () => b64(randomBytes(18));
export const handoffHash = (code: string) => createHash('sha256').update(code).digest('hex');

// ── talking to the provider ──────────────────────────────────────────────────────────────────────────

type Fetch = typeof fetch;

export function authorizeUrl(spec: ProviderSpec, clientId: string, redirectUri: string, state: string): string {
  const u = new URL(spec.authorize);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', spec.scope);
  u.searchParams.set('state', state);
  for (const [k, v] of Object.entries(spec.extra ?? {})) u.searchParams.set(k, v);
  return u.toString();
}

export class OAuthError extends Error {
  constructor(readonly step: 'token' | 'profile', detail: string) {
    super(`${step}: ${detail}`);
  }
}

/** Trades the code for an access token, then the token for the player's id and name. */
export async function fetchProfile(spec: ProviderSpec, creds: { id: string; secret: string }, redirectUri: string, code: string, fetchImpl: Fetch = fetch): Promise<OAuthProfile> {
  const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', ...(spec.headers ?? {}) };
  if (spec.tokenAuth === 'basic') headers.authorization = `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString('base64')}`;
  else {
    form.set('client_id', creds.id);
    form.set('client_secret', creds.secret);
  }
  const tr = await fetchImpl(spec.token, { method: 'POST', headers, body: form.toString(), signal: AbortSignal.timeout(10_000) });
  const tj = (await tr.json().catch(() => null)) as Record<string, unknown> | null;
  const access = tj && str(tj.access_token);
  if (!tr.ok || !access) throw new OAuthError('token', `${tr.status} ${str(tj?.error) || ''}`.trim());
  const pr = await fetchImpl(spec.profile, { headers: { authorization: `Bearer ${access}`, accept: 'application/json', ...(spec.headers ?? {}) }, signal: AbortSignal.timeout(10_000) });
  const pj = (await pr.json().catch(() => null)) as Record<string, unknown> | null;
  const profile = pr.ok && pj ? spec.parse(pj) : null;
  if (!profile) throw new OAuthError('profile', String(pr.status));
  return { uid: profile.uid.slice(0, 200), name: profile.name.slice(0, 100) };
}
