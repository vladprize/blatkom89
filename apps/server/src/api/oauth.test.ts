/**
 * Sign-in with Google, Facebook, Discord, Reddit and Telegram on the website (v0.3 part 3), against
 * PostgreSQL with a fake provider: the redirect to the provider, the state and its cookie, the code traded
 * for a profile, a new account / the same account next time / a guest who links the provider, the
 * one-time hand-over to the page, refusals; Telegram Login data signed with the bot token.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import type { AuthResponse } from '@blatkom/shared';
import { startTestApp, api, devLogin, TEST_BOT_TOKEN } from '../admin/testkit.js';
import type { TestApp } from '../admin/testkit.js';
import { readState } from '../auth/oauth.js';
import { signInitData } from '../auth/telegram.js';

const ENV = {
  PUBLIC_URL: 'https://game.test',
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  REDDIT_CLIENT_ID: 'reddit-id',
  REDDIT_CLIENT_SECRET: 'reddit-secret',
  TELEGRAM_WEB_LOGIN: true,
};
let app: TestApp;
const realFetch = globalThis.fetch;
/** What the fake providers answer: uid and name by the code the test sends back. */
const people = new Map<string, { uid: string; name: string }>();
let tokenStatus = 200;
const seen: Array<{ url: string; init?: RequestInit }> = [];

before(async () => {
  app = await startTestApp(ENV);
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (/^https:\/\/(oauth2\.googleapis\.com|openidconnect\.googleapis\.com|www\.reddit\.com|oauth\.reddit\.com)/.test(url)) {
      seen.push({ url, init });
      if (/token$/.test(url)) {
        const code = new URLSearchParams(String(init?.body)).get('code') ?? '';
        if (tokenStatus !== 200) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: tokenStatus });
        return new Response(JSON.stringify({ access_token: `at-${code}`, token_type: 'Bearer' }));
      }
      const auth = new Headers(init?.headers).get('authorization') ?? '';
      const p = people.get(auth.replace(/^Bearer at-/, ''));
      if (!p) return new Response('{}', { status: 401 });
      return new Response(JSON.stringify(url.includes('reddit') ? { id: p.uid, name: p.name } : { sub: p.uid, given_name: p.name.split(' ')[0], name: p.name }));
    }
    return realFetch(input, init);
  }) as typeof fetch;
});
after(async () => {
  globalThis.fetch = realFetch;
  await app.close();
});

/** Plays the browser: intent → start (cookie) → the provider's redirect back → the page's hand-over. */
async function signIn(provider: 'google' | 'reddit', code: string, token?: string) {
  const intent = (await api(app.base, '/api/auth/oauth/intent', { method: 'POST', token, body: {} })).body.intent as string;
  const start = await realFetch(`${app.base}/api/auth/oauth/${provider}/start?intent=${encodeURIComponent(intent)}`, { redirect: 'manual' });
  assert.equal(start.status, 302);
  const to = new URL(start.headers.get('location')!);
  const cookie = /blk_oauth=([^;]+)/.exec(start.headers.get('set-cookie') ?? '')?.[1] ?? '';
  const state = to.searchParams.get('state')!;
  const cb = await realFetch(`${app.base}/api/auth/oauth/${provider}/callback?code=${code}&state=${encodeURIComponent(state)}`, { redirect: 'manual', headers: { cookie: `blk_oauth=${cookie}` } });
  const back = cb.headers.get('location') ?? '';
  return { to, cookie, state, back, status: cb.status };
}

async function finish(back: string) {
  const code = /#login=([A-Za-z0-9_-]+)/.exec(back)?.[1] ?? '';
  return api<AuthResponse & { linked: boolean; provider: string }>(app.base, '/api/auth/oauth/finish', { method: 'POST', body: { code, platform: 'browser_desktop' } });
}

test('oauth: only the providers set up are offered; Telegram on the website when switched on', async () => {
  const r = await api(app.base, '/api/auth/providers');
  assert.deepEqual(r.body.providers, ['google', 'reddit']);
  assert.deepEqual(r.body.telegram, { botId: TEST_BOT_TOKEN.split(':')[0] });
  const off = await realFetch(`${app.base}/api/auth/oauth/discord/start?intent=x`, { redirect: 'manual' });
  assert.match(off.headers.get('location') ?? '', /login_error=not_configured/);
  assert.equal((await realFetch(`${app.base}/api/auth/oauth/myspace/start`, { redirect: 'manual' })).status, 404);
});

test('oauth: the redirect to the provider carries the client id, the callback address and a signed state bound to a cookie', async () => {
  people.set('c-new', { uid: 'g-1001', name: 'Иван Петров' });
  const s = await signIn('google', 'c-new');
  assert.equal(s.to.origin + s.to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(s.to.searchParams.get('client_id'), 'google-client-id');
  assert.equal(s.to.searchParams.get('redirect_uri'), 'https://game.test/api/auth/oauth/google/callback');
  assert.equal(s.to.searchParams.get('scope'), 'openid profile');
  assert.equal(s.to.searchParams.get('response_type'), 'code');
  const st = readState(app.env.SESSION_SECRET, s.state)!;
  assert.equal(st.p, 'google');
  assert.equal(st.u, null, 'signed out: no account in the state');
  assert.equal(st.n, s.cookie);
  assert.match(s.back, /^https:\/\/game\.test\/#login=/);
  // the secret went to the provider in the token request, never to the page
  const tokenCall = seen.find((c) => c.url === 'https://oauth2.googleapis.com/token')!;
  assert.equal(new URLSearchParams(String(tokenCall.init?.body)).get('client_secret'), 'google-client-secret');
  assert.doesNotMatch(s.back, /secret|at-/);
  const f = await finish(s.back);
  assert.equal(f.status, 200, f.text);
  assert.equal(f.body.isNew, true);
  assert.equal(f.body.profile.displayName, 'Ivan', 'a new account named after the first name, in Latin letters');
  const [idn] = await app.db.sql<Array<{ user_id: string }>>`SELECT user_id FROM user_identities WHERE provider = 'google' AND provider_uid = 'g-1001'`;
  assert.equal(idn!.user_id, f.body.profile.id);
  // the hand-over works once
  assert.equal((await finish(s.back)).status, 401);
  // next time: the same account
  people.set('c-again', { uid: 'g-1001', name: 'Ivan' });
  const again = await finish((await signIn('google', 'c-again')).back);
  assert.deepEqual([again.body.profile.id, again.body.isNew], [f.body.profile.id, false]);
});

test('oauth: a guest links the provider to the account they play on; another browser signs in to it', async () => {
  const guest = await devLogin(app.base, 'Linking Guest');
  people.set('c-link', { uid: 'r-77', name: 'redditor77' });
  const s = await signIn('reddit', 'c-link', guest.token);
  assert.equal(readState(app.env.SESSION_SECRET, s.state)!.u, guest.userId);
  const f = await finish(s.back);
  assert.deepEqual([f.body.profile.id, f.body.linked, f.body.isNew], [guest.userId, true, false]);
  const tokenCall = seen.find((c) => c.url === 'https://www.reddit.com/api/v1/access_token')!;
  assert.match(new Headers(tokenCall.init?.headers).get('authorization') ?? '', /^Basic /, 'Reddit: client credentials in Basic auth');
  // another browser (a fresh guest) signs in with the same Reddit account: the linked account
  const other = await devLogin(app.base, 'Other Device');
  people.set('c-link2', { uid: 'r-77', name: 'redditor77' });
  const g = await finish((await signIn('reddit', 'c-link2', other.token)).back);
  assert.deepEqual([g.body.profile.id, g.body.linked], [guest.userId, false], 'switched to the linked account');
  // a second Reddit account can't be linked to the same player
  people.set('c-second', { uid: 'r-88', name: 'second' });
  const second = await signIn('reddit', 'c-second', guest.token);
  assert.match(second.back, /login_error=already_linked/);
});

test('oauth: a wrong or missing state, a cancelled sign-in, a refused code and an old hand-over all fail cleanly', async () => {
  people.set('c-x', { uid: 'g-2002', name: 'X' });
  const s = await signIn('google', 'c-x');
  const replay = await realFetch(`${app.base}/api/auth/oauth/google/callback?code=c-x&state=${encodeURIComponent(s.state)}`, { redirect: 'manual' });
  assert.match(replay.headers.get('location') ?? '', /login_error=state/, 'no cookie: refused');
  const wrong = await realFetch(`${app.base}/api/auth/oauth/reddit/callback?code=c-x&state=${encodeURIComponent(s.state)}`, { redirect: 'manual', headers: { cookie: `blk_oauth=${s.cookie}` } });
  assert.match(wrong.headers.get('location') ?? '', /login_error=state/, 'a state made for another provider');
  const forged = await realFetch(`${app.base}/api/auth/oauth/google/callback?code=c-x&state=abc.def`, { redirect: 'manual', headers: { cookie: 'blk_oauth=abc' } });
  assert.match(forged.headers.get('location') ?? '', /login_error=state/);
  const cancelled = await realFetch(`${app.base}/api/auth/oauth/google/callback?error=access_denied&state=${encodeURIComponent(s.state)}`, { redirect: 'manual' });
  assert.match(cancelled.headers.get('location') ?? '', /login_error=cancelled/);
  assert.equal((await realFetch(`${app.base}/api/auth/oauth/google/start?intent=forged.intent`, { redirect: 'manual' })).headers.get('location')?.includes('login_error=expired'), true);
  tokenStatus = 400;
  try {
    people.set('c-bad', { uid: 'g-3003', name: 'Bad' });
    assert.match((await signIn('google', 'c-bad')).back, /login_error=provider/);
  } finally {
    tokenStatus = 200;
  }
  people.set('c-old', { uid: 'g-4004', name: 'Old' });
  const old = await signIn('google', 'c-old');
  await app.db.sql`UPDATE auth_handoffs SET created_at = now() - interval '6 minutes'`;
  assert.equal((await finish(old.back)).status, 401, 'a hand-over older than 5 minutes');
});

test('oauth: deleting the account deletes its provider sign-ins; the provider then makes a new account', async () => {
  people.set('c-del', { uid: 'g-5005', name: 'Leaving' });
  const first = await finish((await signIn('google', 'c-del')).back);
  assert.equal(first.status, 200, first.text);
  const del = await api(app.base, '/api/me', { method: 'DELETE', token: first.body.token });
  assert.equal(del.status, 200, del.text);
  const left = await app.db.sql`SELECT 1 FROM user_identities WHERE provider_uid = 'g-5005' UNION ALL SELECT 1 FROM auth_handoffs WHERE user_id = ${first.body.profile.id}`;
  assert.equal(left.length, 0, 'no identity, no hand-over left');
  people.set('c-del2', { uid: 'g-5005', name: 'Leaving' });
  const next = await finish((await signIn('google', 'c-del2')).back);
  assert.equal(next.body.isNew, true);
  assert.notEqual(next.body.profile.id, first.body.profile.id);
});

function signedTelegram(fields: Record<string, string | number>, token = TEST_BOT_TOKEN) {
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const hash = createHmac('sha256', createHash('sha256').update(token).digest()).update(check).digest('hex');
  return { ...fields, hash };
}

test('telegram on the website: signed data signs in, links a guest, finds the Mini App account; forgeries and old data are refused', async () => {
  const now = Math.floor(Date.now() / 1000);
  const fresh = signedTelegram({ id: 5550001, first_name: 'Вася', last_name: 'Пупкин', username: 'vasya', auth_date: now });
  const r = await api(app.base, '/api/auth/telegram/web', { method: 'POST', body: { data: fresh } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.body.isNew, r.body.profile.displayName, r.body.profile.telegramLinked], [true, 'Vasya Pupkin', true]);
  const again = await api(app.base, '/api/auth/telegram/web', { method: 'POST', body: { data: signedTelegram({ id: 5550001, first_name: 'Вася', auth_date: now }) } });
  assert.equal(again.body.profile.id, r.body.profile.id, 'the same Telegram account, the same profile');
  // the Mini App signs in to the very same account
  const init = signInitData({ user: JSON.stringify({ id: 5550001, first_name: 'Вася', language_code: 'ru' }), auth_date: String(now) }, TEST_BOT_TOKEN);
  const mini = await api(app.base, '/api/auth/telegram', { method: 'POST', body: { initData: init } });
  assert.equal(mini.status, 200, mini.text);
  assert.equal(mini.body.profile.id, r.body.profile.id, 'one profile in Telegram and in the browser');
  // a guest links Telegram: the Mini App will sign in to this account too
  const guest = await devLogin(app.base, 'Telegram Linker');
  const link = await api(app.base, '/api/auth/telegram/web', { method: 'POST', token: guest.token, body: { data: signedTelegram({ id: 5550002, first_name: 'Linker', auth_date: now }) } });
  assert.deepEqual([link.body.profile.id, link.body.linked], [guest.userId, true]);
  const [u] = await app.db.sql<Array<{ telegram_id: string }>>`SELECT telegram_id::text FROM users WHERE id = ${guest.userId}`;
  assert.equal(u!.telegram_id, '5550002');
  // refusals
  const tampered = { ...fresh, first_name: 'Someone Else' };
  assert.equal((await api(app.base, '/api/auth/telegram/web', { method: 'POST', body: { data: tampered } })).status, 401);
  assert.equal((await api(app.base, '/api/auth/telegram/web', { method: 'POST', body: { data: signedTelegram({ id: 5550003, first_name: 'X', auth_date: now }, '1234567:another-bot') } })).status, 401, 'another bot’s signature');
  assert.equal((await api(app.base, '/api/auth/telegram/web', { method: 'POST', body: { data: signedTelegram({ id: 5550003, first_name: 'X', auth_date: now - 3 * 86400 }) } })).status, 401, 'stale');
});

test('telegram on the website is off unless switched on', async () => {
  const off = await startTestApp({ PUBLIC_URL: 'https://game.test' });
  try {
    const p = await api(off.base, '/api/auth/providers');
    assert.deepEqual([p.body.providers, p.body.telegram], [[], null]);
    assert.equal((await api(off.base, '/api/auth/telegram/web', { method: 'POST', body: { data: { id: 1, hash: 'x' } } })).status, 503);
  } finally {
    await off.close();
  }
});
