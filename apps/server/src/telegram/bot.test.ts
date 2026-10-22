import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { botAnswer, setupBot, webhookSecret, webhookUrl, registerTelegramRoutes, BOT_SETTINGS_VERSION } from './bot.js';
import type { TelegramUpdate } from './bot.js';
import { KeepAwake } from '../services/keepAwake.js';
import { createApp } from '../app.js';
import { testEnv, TEST_BOT_TOKEN } from '../admin/testkit.js';
import { silentLogger } from '../logging/logger.js';
import type { Services } from '../services/contracts.js';
import type { RoomManager } from '../rooms/RoomManager.js';

const URL_ = 'https://blatkom89.example';
const msg = (text: string, o: { lang?: string; chat?: string; bot?: boolean; id?: number } = {}): TelegramUpdate => ({
  update_id: o.id ?? 1,
  message: { text, chat: { id: 42, type: o.chat ?? 'private' }, from: { id: 7, is_bot: o.bot ?? false, ...(o.lang ? { language_code: o.lang } : {}) } },
});

test('bot: /start in a private chat answers with the Mini App button and the browser link, in the player’s language', () => {
  const ru = botAnswer(msg('/start', { lang: 'ru' }), URL_)!;
  assert.equal(ru.method, 'sendMessage');
  assert.equal(ru.chat_id, 42);
  assert.match(ru.text, /прогрет/);
  assert.deepEqual(ru.reply_markup.inline_keyboard, [[{ text: '🎮 Играть в Telegram', web_app: { url: `${URL_}/` } }], [{ text: '🌐 Открыть в браузере', url: `${URL_}/` }]]);
  const en = botAnswer(msg('/start', { lang: 'en-GB' }), `${URL_}/`)!;
  assert.match(en.text, /warmed up/);
  assert.equal(en.reply_markup.inline_keyboard[0]![0]!.web_app!.url, `${URL_}/`, 'no double slash');
  assert.match(botAnswer(msg('/start', { lang: 'kk' }), URL_)!.text, /прогрет/, 'Kazakh Telegram gets Russian, like the game');
  assert.match(botAnswer(msg('/start'), URL_)!.text, /warmed up/, 'no language: English');
  assert.match(botAnswer(msg('hello?'), URL_)!.text, /BLATKOM/, 'any message in a private chat gets the link');
});

test('bot: /start <room code> answers with a «join the room» button; junk payloads are ignored', () => {
  const a = botAnswer(msg('/start AB12cd34', { lang: 'ru' }), URL_)!;
  assert.match(a.text, /<code>AB12cd34<\/code>/);
  assert.equal(a.reply_markup.inline_keyboard[0]![0]!.text, '🎮 Войти в комнату');
  assert.equal(a.reply_markup.inline_keyboard[0]![0]!.web_app!.url, `${URL_}/?invite=AB12cd34`);
  assert.equal(a.reply_markup.inline_keyboard[1]![0]!.url, `${URL_}/?invite=AB12cd34`);
  const junk = botAnswer(msg('/start <script>'), URL_)!;
  assert.doesNotMatch(junk.text, /<code>|script/);
  assert.equal(junk.reply_markup.inline_keyboard[0]![0]!.web_app!.url, `${URL_}/`);
});

test('bot: /start ref_<code> (V2.0 referral link) opens the game with ?ref= — not a room', () => {
  const a = botAnswer(msg('/start ref_Ab12Cd34', { lang: 'ru' }), URL_)!;
  const urls = a.reply_markup.inline_keyboard.flat().map((b) => b.web_app?.url ?? b.url);
  assert.deepEqual(urls, [`${URL_}/?ref=Ab12Cd34`, `${URL_}/?ref=Ab12Cd34`]);
  assert.match(a.text, /позвали в район/);
  assert.doesNotMatch(a.text, /комнату/);
  const en = botAnswer(msg('/start ref_streamer_vasya'), URL_)!;
  assert.match(en.text, /called you into the district/);
  assert.ok(en.reply_markup.inline_keyboard.flat().every((b) => (b.web_app?.url ?? b.url)!.endsWith('?ref=streamer_vasya')));
});

test('bot: groups get commands only (their own or bare), with a plain link; bots get nothing', () => {
  assert.equal(botAnswer(msg('hello', { chat: 'group' }), URL_), null);
  assert.equal(botAnswer(msg('/start@other_bot', { chat: 'supergroup' }), URL_, 'blatkom_bot'), null);
  const own = botAnswer(msg('/play@Blatkom_Bot', { chat: 'supergroup' }), URL_, 'blatkom_bot')!;
  assert.deepEqual(own.reply_markup.inline_keyboard, [[{ text: 'Open the game', url: `${URL_}/` }]], 'no Mini App button outside private chats');
  assert.ok(botAnswer(msg('/start', { chat: 'group' }), URL_, 'blatkom_bot'));
  assert.equal(botAnswer(msg('/start', { bot: true }), URL_), null);
  assert.equal(botAnswer({ update_id: 3 }, URL_), null, 'an update without a message');
});

test('bot: the webhook checks Telegram’s secret header, answers in its response, once per update, and keeps the server awake', async () => {
  const env = testEnv({ PUBLIC_URL: URL_ });
  const extended: number[] = [];
  const keepAwake = { extend: (ms: number) => extended.push(ms) } as unknown as KeepAwake;
  const handler = createApp({ env, sql: null, log: silentLogger, services: {} as Services, rooms: { count: () => 0 } as unknown as RoomManager, keepAwake }, [registerTelegramRoutes]);
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: unknown, secret?: string) =>
    fetch(`${base}/api/telegram/webhook?v=${BOT_SETTINGS_VERSION}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await post(msg('/start'))).status, 401, 'no secret');
    assert.equal((await post(msg('/start'), webhookSecret('another:token'))).status, 401, 'another bot’s secret');
    const secret = webhookSecret(TEST_BOT_TOKEN);
    assert.match(secret, /^[A-Za-z0-9_-]{20,256}$/, 'characters Telegram allows in secret_token');
    const r = await post(msg('/start', { lang: 'ru', id: 100 }), secret);
    assert.equal(r.status, 200);
    const a = (await r.json()) as { method: string; chat_id: number; text: string };
    assert.equal(a.method, 'sendMessage');
    assert.equal(a.chat_id, 42);
    assert.deepEqual(extended, [20 * 60_000], 'awake for BOT_WARM_MINUTES after an answer');
    assert.deepEqual(await (await post(msg('/start', { id: 100 }), secret)).json(), {}, 'a repeated delivery is answered once');
    assert.deepEqual(await (await post({ update_id: 101, edited_message: { text: 'x' } }, secret)).json(), {}, 'other updates: acknowledged, nothing sent');
    assert.equal((await post({ nonsense: true }, secret)).status, 200, 'unreadable updates are acknowledged too (no retries)');
    for (let i = 0; i < 10; i++) await post(msg('spam', { id: 200 + i }), secret);
    assert.deepEqual(await (await post(msg('spam', { id: 300 }), secret)).json(), {}, 'a flooding chat stops getting answers');
  } finally {
    server.close();
  }
  // without a token the address doesn't exist
  const off = createApp({ env: testEnv({ TELEGRAM_BOT_TOKEN: undefined }), sql: null, log: silentLogger, services: {} as Services, rooms: { count: () => 0 } as unknown as RoomManager }, [registerTelegramRoutes]);
  const s2 = createServer((req, res) => void off(req, res));
  await new Promise<void>((r) => s2.listen(0, '127.0.0.1', r));
  try {
    const res = await fetch(`http://127.0.0.1:${(s2.address() as AddressInfo).port}/api/telegram/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 404);
  } finally {
    s2.close();
  }
});

test('bot: set-up registers the webhook with its secret and the bot’s texts once per address; never throws', async () => {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  let current = '';
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    const method = String(url).split('/').pop()!;
    assert.ok(String(url).startsWith(`https://api.telegram.org/bot${TEST_BOT_TOKEN}/`));
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ method, body });
    if (method === 'getWebhookInfo') return new Response(JSON.stringify({ ok: true, result: { url: current } }));
    if (method === 'setWebhook') current = String(body.url);
    return new Response(JSON.stringify({ ok: true, result: true }));
  }) as typeof fetch;
  const env = { TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN, PUBLIC_URL: URL_, NODE_ENV: 'production' as const };
  assert.equal(await setupBot(env, silentLogger, fake), 'registered');
  const set = calls.find((c) => c.method === 'setWebhook')!;
  assert.equal(set.body.url, webhookUrl(URL_));
  assert.equal(set.body.url, `${URL_}/api/telegram/webhook?v=${BOT_SETTINGS_VERSION}`);
  assert.equal(set.body.secret_token, webhookSecret(TEST_BOT_TOKEN));
  assert.deepEqual(set.body.allowed_updates, ['message']);
  const names = calls.map((c) => c.method);
  for (const m of ['setMyCommands', 'setMyShortDescription', 'setMyDescription', 'setChatMenuButton']) assert.ok(names.includes(m), m);
  assert.ok(calls.some((c) => c.method === 'setMyCommands' && c.body.language_code === 'ru'), 'Russian commands');
  for (const c of calls.filter((c) => c.method === 'setMyShortDescription')) assert.ok(String(c.body.short_description).length <= 120);
  for (const c of calls.filter((c) => c.method === 'setMyDescription')) assert.ok(String(c.body.description).length <= 512);
  calls.length = 0;
  assert.equal(await setupBot(env, silentLogger, fake), 'unchanged', 'the next start: nothing to register');
  assert.deepEqual(calls.map((c) => c.method), ['getWebhookInfo']);
  // switched off: no token, an http address, tests
  assert.equal(await setupBot({ ...env, TELEGRAM_BOT_TOKEN: undefined }, silentLogger, fake), 'off');
  assert.equal(await setupBot({ ...env, PUBLIC_URL: 'http://localhost:8080' }, silentLogger, fake), 'off');
  assert.equal(await setupBot({ ...env, NODE_ENV: 'test' }, silentLogger, fake), 'off');
  // Telegram refuses or can't be reached: reported, not thrown
  const broken = (async () => new Response(JSON.stringify({ ok: false, description: 'Unauthorized' }), { status: 401 })) as typeof fetch;
  assert.equal(await setupBot(env, silentLogger, broken), 'failed');
  const down = (async () => {
    throw new Error('network down');
  }) as typeof fetch;
  assert.equal(await setupBot(env, silentLogger, down), 'failed');
});

test('keep-awake: asks the own address while the window is open, then stops; «always» never stops; local addresses are left alone', async () => {
  let now = 1_000_000;
  const asked: string[] = [];
  const fake = (async (u: string | URL | Request) => {
    asked.push(String(u));
    return new Response('{}');
  }) as typeof fetch;
  const k = new KeepAwake(`${URL_}/`, { always: false, log: silentLogger, fetchImpl: fake, now: () => now, everyMs: 3_600_000 });
  assert.equal(k.active, false);
  k.extend(20 * 60_000);
  assert.equal(k.active, true);
  assert.equal(await k.tick(), true);
  assert.deepEqual(asked, [`${URL_}/api/health`]);
  now += 21 * 60_000;
  assert.equal(await k.tick(), false, 'the window has closed');
  assert.equal(k.active, false);
  assert.equal(asked.length, 1);
  const always = new KeepAwake(URL_, { always: true, log: silentLogger, fetchImpl: fake, now: () => now, everyMs: 3_600_000 });
  always.start();
  now += 10 ** 9;
  assert.equal(await always.tick(), true);
  always.stop();
  const local = new KeepAwake('http://localhost:8080', { always: true, log: silentLogger, fetchImpl: fake });
  local.start();
  local.extend(60_000);
  assert.equal(local.active, false);
  const failing = new KeepAwake(URL_, { always: true, log: silentLogger, fetchImpl: (async () => { throw new Error('asleep'); }) as typeof fetch });
  assert.equal(await failing.tick(), true, 'a failed request is not an error');
});
