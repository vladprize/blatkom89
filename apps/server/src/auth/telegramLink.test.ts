/**
 * V2.0 part E against PostgreSQL: Telegram is attached to an account that already exists, so the Mini App
 * never makes a second profile. The website's code through the bot (linked, used once, already linked,
 * ran out), an empty account an earlier Telegram launch made lets its Telegram id go (kept, marked
 * merged), an account with progress keeps it (conflict), and an email sign-in inside Telegram.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AuthResponse, TelegramLinkCodeResponse } from '@blatkom/shared';
import { startTestApp, api, devLogin, TEST_BOT_TOKEN } from '../admin/testkit.js';
import type { TestApp } from '../admin/testkit.js';
import { signInitData } from './telegram.js';
import { botAnswer } from '../telegram/bot.js';
import { purgeExpired } from '../analytics/retention.js';

let app: TestApp;
before(async () => {
  app = await startTestApp();
});
after(async () => {
  await app.close();
});

const nowSec = () => Math.floor(Date.now() / 1000);
/** Server events are written in batches: write the pending ones now. */
const flushEvents = () => (app.persistence.services.analytics as unknown as { flush(): Promise<void> }).flush();
const initData = (id: number, first = 'Тестер') => signInitData({ user: JSON.stringify({ id, first_name: first, language_code: 'ru' }), auth_date: String(nowSec()) }, TEST_BOT_TOKEN);
const tgSignIn = (id: number, link?: string) => api<AuthResponse>(app.base, '/api/auth/telegram', { method: 'POST', body: { initData: initData(id), ...(link ? { link } : {}) } });
const userRow = async (id: string) =>
  (await app.db.sql<Array<{ telegram_id: string | null; merged_into: string | null }>>`SELECT telegram_id::text, merged_into FROM users WHERE id = ${id}`)[0];
/** The website asks for the bot's link; the code is its `start` parameter. */
async function linkCode(token: string): Promise<string> {
  const r = await api<TelegramLinkCodeResponse>(app.base, '/api/auth/telegram/link-code', { method: 'POST', token });
  assert.equal(r.status, 200, r.text);
  const m = /^https:\/\/t\.me\/blatkom_test_bot\?start=link_([A-Za-z0-9_-]{16})$/.exec(r.body.url);
  assert.ok(m, r.body.url);
  assert.ok(Date.parse(r.body.expiresAt) - Date.now() > 9 * 60_000, 'valid for 10 minutes');
  return m[1]!;
}

test('Telegram link: the website’s code through the bot attaches Telegram to the same account, once', async () => {
  const site = await devLogin(app.base, 'Site Veteran');
  await app.db.sql`UPDATE profiles SET xp = 900, matches_played = 7 WHERE user_id = ${site.userId}`;
  assert.equal((await api(app.base, '/api/auth/telegram/link-code', { method: 'POST' })).status, 401, 'signed-in players only');
  const code = await linkCode(site.token);
  // the bot answers `/start link_<code>` with the Mini App button that carries the code
  const answer = botAnswer({ update_id: 1, message: { text: `/start link_${code}`, chat: { id: 77, type: 'private' }, from: { id: 5550001, language_code: 'ru' } } }, 'https://game.example');
  assert.deepEqual(answer?.reply_markup.inline_keyboard, [[{ text: '🔗 Привязать и играть', web_app: { url: `https://game.example/?tglink=${code}` } }]]);
  assert.match(answer!.text, /привязка Telegram/);
  // in a group the code is never answered with (it is a plain hello there)
  const group = botAnswer({ update_id: 2, message: { text: `/start link_${code}`, chat: { id: -5, type: 'group' }, from: { id: 5550001 } } }, 'https://game.example');
  assert.ok(group && !JSON.stringify(group).includes(code));
  // the Mini App signs in with Telegram's signed data and the code: the website's account, not a new one
  const users0 = (await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM users`)[0]!.n;
  const r = await tgSignIn(5550001, code);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.body.profile.id, r.body.isNew, r.body.telegramLink, r.body.profile.telegramLinked, r.body.profile.xp], [site.userId, false, 'linked', true, 900]);
  assert.equal((await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM users`)[0]!.n, users0, 'no second profile');
  assert.equal((await userRow(site.userId))!.telegram_id, '5550001');
  // the code works once; Telegram keeps opening the account
  const again = await tgSignIn(5550001, code);
  assert.deepEqual([again.body.profile.id, again.body.telegramLink], [site.userId, 'invalid']);
  assert.equal((await tgSignIn(5550001)).body.profile.id, site.userId);
  assert.equal((await api(app.base, '/api/auth/telegram/link-code', { method: 'POST', token: site.token })).status, 409, 'already linked');
  await flushEvents();
  const [ev] = await app.db.sql<Array<{ props: { provider: string; via: string; merged: boolean } }>>`SELECT props FROM analytics_events WHERE name = 'identity_linked' AND user_id = ${site.userId}`;
  assert.deepEqual(ev?.props, { provider: 'telegram', via: 'code', merged: false });
});

test('Telegram link: the empty account of an earlier Telegram launch lets the id go (kept, marked merged); an account with progress keeps it', async () => {
  // a player opened the Mini App first: an empty Telegram account
  const empty = await tgSignIn(5550002);
  assert.equal(empty.body.isNew, true);
  const site = await devLogin(app.base, 'Site Owner Two');
  const r = await tgSignIn(5550002, await linkCode(site.token));
  assert.deepEqual([r.body.profile.id, r.body.telegramLink], [site.userId, 'linked']);
  const left = await userRow(empty.body.profile.id);
  assert.deepEqual(left, { telegram_id: null, merged_into: site.userId }, 'the empty account stays, without Telegram, marked merged');
  assert.equal((await api(app.base, '/api/me', { token: empty.body.token })).status, 200, 'nothing is deleted');
  await flushEvents();
  const [ev] = await app.db.sql<Array<{ props: { merged: boolean } }>>`SELECT props FROM analytics_events WHERE name = 'identity_linked' AND user_id = ${site.userId}`;
  assert.equal(ev?.props.merged, true);

  // a Telegram account with progress: nothing changes, Telegram keeps opening it
  const busy = await tgSignIn(5550003);
  await app.db.sql`UPDATE profiles SET xp = 40, matches_played = 1 WHERE user_id = ${busy.body.profile.id}`;
  const other = await devLogin(app.base, 'Site Owner Three');
  const c = await tgSignIn(5550003, await linkCode(other.token));
  assert.deepEqual([c.body.profile.id, c.body.telegramLink], [busy.body.profile.id, 'conflict']);
  assert.equal((await userRow(other.userId))!.telegram_id, null);
  assert.equal((await userRow(busy.body.profile.id))!.telegram_id, '5550003');
  // owning something, a gang or a friend also counts as progress
  const owner = await tgSignIn(5550004);
  await app.db.sql`INSERT INTO user_items (user_id, item_id, kind, source) VALUES (${owner.body.profile.id}, 'obrez', 'weapon', 'grant')`;
  const third = await devLogin(app.base, 'Site Owner Four');
  assert.equal((await tgSignIn(5550004, await linkCode(third.token))).body.telegramLink, 'conflict');
});

test('Telegram link: a code that ran out, a made-up one, a newer code replaces the older', async () => {
  const site = await devLogin(app.base, 'Site Owner Five');
  const old = await linkCode(site.token);
  const code = await linkCode(site.token);
  assert.equal((await tgSignIn(5550005, old)).body.telegramLink, 'invalid', 'a newer code replaces the older one');
  // the attempt above made an empty Telegram account; the running code still attaches (and releases it)
  await app.db.sql`UPDATE telegram_link_codes SET expires_at = now() - interval '1 minute' WHERE user_id = ${site.userId} AND used_at IS NULL`;
  const late = await tgSignIn(5550005, code);
  assert.equal(late.body.telegramLink, 'expired');
  assert.notEqual(late.body.profile.id, site.userId);
  assert.equal((await tgSignIn(5550005, 'NotARealCode0000')).body.telegramLink, 'invalid');
  assert.equal((await api(app.base, '/api/auth/telegram', { method: 'POST', body: { initData: initData(5550005), link: 'bad code!' } })).status, 400);
  // used and run-out codes are purged a day after they ran out
  const purged = await purgeExpired(app.db.sql, new Date(Date.now() + 2 * 86_400_000));
  assert.ok(purged.telegramLinkCodes >= 2);
  assert.equal((await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM telegram_link_codes WHERE user_id = ${site.userId}`)[0]!.n, 0);
});

test('Telegram link: an email sign-in inside Telegram attaches this Telegram to the email’s account', async () => {
  // a fresh server: sign-ins are limited per network address, and the tests above used them up
  await app.close();
  app = await startTestApp();
  const site = await devLogin(app.base, 'Mail Holder');
  const linked = await api(app.base, '/api/auth/email/link', { method: 'POST', token: site.token, body: { email: 'mail.holder@example.com', password: 'correct horse 1' } });
  assert.equal(linked.status, 200, linked.text);
  // the player opened the Mini App first (an empty account), then signs in with the email there
  const first = await tgSignIn(5550006);
  const r = await api<AuthResponse>(app.base, '/api/auth/email/login', { method: 'POST', body: { email: 'mail.holder@example.com', password: 'correct horse 1', initData: initData(5550006) } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.body.profile.id, r.body.telegramLink, r.body.profile.telegramLinked], [site.userId, 'linked', true]);
  assert.equal((await userRow(first.body.profile.id))!.merged_into, site.userId);
  assert.equal((await tgSignIn(5550006)).body.profile.id, site.userId, 'the next launch in Telegram opens the email’s account');
  // a wrong password attaches nothing
  const busy = await tgSignIn(5550007);
  const wrong = await api(app.base, '/api/auth/email/login', { method: 'POST', body: { email: 'mail.holder@example.com', password: 'wrong password', initData: initData(5550007) } });
  assert.equal(wrong.status, 401);
  assert.equal((await userRow(busy.body.profile.id))!.telegram_id, '5550007');
  // another Telegram with progress: the sign-in works, Telegram stays where it was
  await app.db.sql`UPDATE profiles SET matches_played = 3, xp = 120 WHERE user_id = ${busy.body.profile.id}`;
  const site2 = await devLogin(app.base, 'Mail Holder Two');
  await api(app.base, '/api/auth/email/link', { method: 'POST', token: site2.token, body: { email: 'mail.holder2@example.com', password: 'correct horse 2' } });
  const c = await api<AuthResponse>(app.base, '/api/auth/email/login', { method: 'POST', body: { email: 'mail.holder2@example.com', password: 'correct horse 2', initData: initData(5550007) } });
  assert.deepEqual([c.status, c.body.profile.id, c.body.telegramLink], [200, site2.userId, 'conflict']);
  assert.equal((await userRow(busy.body.profile.id))!.telegram_id, '5550007');
  // forged launch data: the sign-in still works, nothing is attached
  const forged = signInitData({ user: JSON.stringify({ id: 5550008, first_name: 'X' }), auth_date: String(nowSec()) }, '1:not-the-bot-token');
  const f = await api<AuthResponse>(app.base, '/api/auth/email/login', { method: 'POST', body: { email: 'mail.holder2@example.com', password: 'correct horse 2', initData: forged } });
  assert.deepEqual([f.status, f.body.telegramLink], [200, undefined]);
  assert.equal((await app.db.sql`SELECT 1 FROM users WHERE telegram_id = 5550008`).length, 0);
});

test('Telegram link: without the bot’s username the website gets a clear answer', async () => {
  const noBot = await startTestApp({ TELEGRAM_BOT_USERNAME: undefined });
  try {
    const u = await devLogin(noBot.base, 'No Bot Here');
    const r = await api(noBot.base, '/api/auth/telegram/link-code', { method: 'POST', token: u.token });
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'telegram_not_configured');
    assert.equal((await api(noBot.base, '/api/auth/providers')).body.telegramLink, false);
  } finally {
    await noBot.close();
  }
  assert.equal((await api(app.base, '/api/auth/providers')).body.telegramLink, true);
});
