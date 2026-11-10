/**
 * v0.2.18 part 3: Telegram Stars (inside the Mini App) and Xsolla (the website). A local stand-in plays the
 * Bot API (TELEGRAM_API_BASE); Xsolla's token call goes to an injected fetch; webhooks are signed as the
 * providers sign them. Nothing reaches a real provider.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { createHash } from 'node:crypto';
import { DIAMOND_PACKS } from '@blatkom/shared';
import { startTestApp, api, cookieFrom, devLogin, TEST_BOT_TOKEN } from '../admin/testkit.js';
import type { TestApp } from '../admin/testkit.js';
import { ADMIN_COOKIE } from '../admin/auth.js';
import { signInitData } from '../auth/telegram.js';
import { webhookSecret } from '../telegram/bot.js';
import { pgContext } from '../services/persistence.js';
import { silentLogger } from '../logging/logger.js';
import { MemoryAnalytics } from '../services/memory.js';
import { PaymentService } from './service.js';
import { XsollaProvider } from './providers.js';
import type { FetchLike } from './providers.js';

let app: TestApp;
let bot: Server;
const botCalls: Array<{ method: string; params: Record<string, unknown> }> = [];
let refuseRefund = false;

before(async () => {
  // the Bot API stand-in: invoice links and refunds
  bot = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const method = (req.url ?? '').split('/').pop() ?? '';
      const params = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      botCalls.push({ method, params });
      res.setHeader('content-type', 'application/json');
      if (method === 'createInvoiceLink') return res.end(JSON.stringify({ ok: true, result: `https://t.me/$invoice-${String(params.payload).slice(0, 8)}` }));
      if (method === 'refundStarPayment') return res.end(JSON.stringify(refuseRefund ? { ok: false, description: 'Bad Request: CHARGE_ALREADY_REFUNDED' } : { ok: true, result: true }));
      res.end(JSON.stringify({ ok: false, description: 'unknown method' }));
    });
  });
  await new Promise<void>((r) => bot.listen(0, '127.0.0.1', () => r()));
  const port = (bot.address() as { port: number }).port;
  app = await startTestApp({ TELEGRAM_API_BASE: `http://127.0.0.1:${port}`, ADMIN_BOOTSTRAP_USERNAME: 'kassir', ADMIN_BOOTSTRAP_PASSWORD: 'correct-horse-battery-staple-89' });
});

after(async () => {
  await app?.close();
  await new Promise<void>((r) => bot.close(() => r()));
});

const ctx = () => pgContext(app.db.sql, app.env, silentLogger);
const hook = (update: Record<string, unknown>) => api(app.base, '/api/telegram/webhook', { method: 'POST', body: update, headers: { 'x-telegram-bot-api-secret-token': webhookSecret(TEST_BOT_TOKEN) } });
let updateId = 9000;
const tgLogin = async (id: number, name: string) => {
  const init = signInitData({ user: JSON.stringify({ id, first_name: name, language_code: 'ru' }), auth_date: String(Math.floor(Date.now() / 1000)) }, TEST_BOT_TOKEN);
  const r = await api(app.base, '/api/auth/telegram', { method: 'POST', body: { initData: init, platform: 'telegram_android' } });
  assert.equal(r.status, 200, r.text);
  return { token: r.body.token as string, userId: r.body.profile.id as string };
};

test('stars: the shop config lists each pack in Stars (75 per dollar, rounded to 5); no card on this server', async () => {
  const cfg = await api(app.base, '/api/shop/config');
  assert.equal(cfg.body.card, false);
  assert.equal(cfg.body.provider, null);
  assert.deepEqual(cfg.body.stars, { b99: 75, b199: 150, b299: 225, b499: 375, b599: 450, b699: 525, b799: 600, b999: 750, b1999: 1500, b4999: 3750 });
  assert.equal(Object.keys(cfg.body.stars).length, DIAMOND_PACKS.length);
});

test('stars: an invoice in XTR, Telegram’s questions answered, the BLATS credited once, a refund takes them back', async () => {
  const me = await tgLogin(818181, 'Звездочёт');
  // a browser session cannot pay in Stars
  const web = await devLogin(app.base, 'Браузерный');
  const r0 = await api(app.base, '/api/pay/stars', { method: 'POST', token: web.token, body: { packId: 'b199' } });
  assert.equal(r0.status, 403);
  assert.equal(r0.body.error.code, 'stars_in_telegram');
  // the invoice
  botCalls.length = 0;
  const inv = await api(app.base, '/api/pay/stars', { method: 'POST', token: me.token, body: { packId: 'b199' }, headers: { 'accept-language': 'ru-RU' } });
  assert.equal(inv.status, 200, inv.text);
  assert.equal(inv.body.stars, 150);
  assert.match(inv.body.invoiceUrl, /^https:\/\/t\.me\/\$invoice-/);
  const call = botCalls.find((c) => c.method === 'createInvoiceLink')!;
  assert.equal(call.params.currency, 'XTR');
  assert.equal(call.params.provider_token, '');
  assert.equal(call.params.payload, inv.body.paymentId);
  assert.deepEqual(call.params.prices, [{ label: '199 БЛАТ', amount: 150 }]);
  assert.ok(String(call.params.title).length <= 32 && String(call.params.description).length <= 255);
  const pid = inv.body.paymentId as string;
  assert.equal((await api(app.base, `/api/pay/${pid}`, { token: me.token })).body.status, 'created');

  // Telegram's pre-checkout questions: the wrong price, another player, an unknown invoice — no; the right one — yes
  const pre = (over: Record<string, unknown>) => hook({ update_id: ++updateId, pre_checkout_query: { id: `q${updateId}`, from: { id: 818181, language_code: 'ru' }, currency: 'XTR', total_amount: 150, invoice_payload: pid, ...over } });
  let a = await pre({ total_amount: 100 });
  assert.equal(a.body.method, 'answerPreCheckoutQuery');
  assert.equal(a.body.ok, false);
  assert.match(a.body.error_message, /Цена изменилась/);
  a = await pre({ from: { id: 111, language_code: 'en' } });
  assert.equal(a.body.ok, false);
  assert.match(a.body.error_message, /another player/);
  a = await pre({ invoice_payload: '00000000-0000-0000-0000-000000000000' });
  assert.equal(a.body.ok, false);
  a = await pre({ currency: 'USD' });
  assert.equal(a.body.ok, false);
  a = await pre({});
  assert.deepEqual(a.body, { method: 'answerPreCheckoutQuery', pre_checkout_query_id: `q${updateId}`, ok: true });

  // the money: an underpaid charge credits nothing, the real one once — even when Telegram repeats it
  const paid = (stars: number, charge = 'stxChargeA1') => ({ update_id: ++updateId, message: { message_id: 5, chat: { id: 818181, type: 'private' }, from: { id: 818181, language_code: 'ru' }, successful_payment: { currency: 'XTR', total_amount: stars, invoice_payload: pid, telegram_payment_charge_id: charge, provider_payment_charge_id: '' } } });
  a = await hook(paid(10, 'stxCheap'));
  assert.deepEqual(a.body, {});
  assert.equal((await ctx().economy.inventory(me.userId)).diamonds, 0);
  const upd = paid(150);
  a = await hook(upd);
  assert.equal(a.body.method, 'sendMessage');
  assert.match(a.body.text, /\+199 БЛАТ/);
  assert.deepEqual(await hook(upd).then((x) => x.body), {}, 'the same update again: nothing');
  assert.deepEqual(await hook(paid(150)).then((x) => x.body), {}, 'the same charge in a new update: nothing');
  assert.equal((await ctx().economy.inventory(me.userId)).diamonds, 199);
  assert.equal((await api(app.base, `/api/pay/${pid}`, { token: me.token })).body.status, 'paid');
  const [row] = await app.db.sql<Array<{ stars: number; charge_ref: string; currency: string; amount_cents: number }>>`SELECT stars, charge_ref, currency, amount_cents FROM payments WHERE id = ${pid}`;
  assert.deepEqual({ ...row }, { stars: 150, charge_ref: 'stxChargeA1', currency: 'xtr', amount_cents: 150 });
  // once paid, the invoice is closed for another payment
  a = await pre({});
  assert.equal(a.body.ok, false);

  // the admin's refund: Telegram is asked, then the unspent BLATS go back
  const login = await api(app.base, '/api/admin/login', { method: 'POST', body: { username: 'kassir', password: 'correct-horse-battery-staple-89' } });
  const cookie = cookieFrom(login.headers, ADMIN_COOKIE)!;
  const csrf = login.body.csrfToken as string;
  await ctx().economy.grant(me.userId, 'diamonds', -50, null, 'spent some');
  botCalls.length = 0;
  const rf = await api(app.base, `/api/admin/payments/${pid}/refund`, { method: 'POST', cookie, csrf, body: {} });
  assert.equal(rf.status, 200, rf.text);
  assert.deepEqual(rf.body, { refunded: true });
  const refundCall = botCalls.find((c) => c.method === 'refundStarPayment')!;
  assert.deepEqual(refundCall.params, { user_id: 818181, telegram_payment_charge_id: 'stxChargeA1' });
  assert.equal((await ctx().economy.inventory(me.userId)).diamonds, 0, '149 unspent taken back, never below zero');
  assert.equal((await api(app.base, `/api/pay/${pid}`, { token: me.token })).body.status, 'refunded');
  // Telegram reports the refund afterwards: nothing more happens
  a = await hook({ update_id: ++updateId, message: { message_id: 6, chat: { id: 818181, type: 'private' }, from: { id: 818181, language_code: 'en' }, refunded_payment: { currency: 'XTR', total_amount: 150, invoice_payload: pid, telegram_payment_charge_id: 'stxChargeA1' } } });
  assert.match(a.body.text, /given back/);
  const audit = await app.db.sql<Array<{ action: string }>>`SELECT action FROM admin_audit_log WHERE target = ${pid}`;
  assert.deepEqual(audit.map((x) => x.action), ['stars_refund']);
  // a second refund is refused
  assert.equal((await api(app.base, `/api/admin/payments/${pid}/refund`, { method: 'POST', cookie, csrf, body: {} })).status, 409);
});

test('stars: a refund Telegram reports by itself takes back the unspent BLATS', async () => {
  const me = await tgLogin(828282, 'Возвратный');
  const inv = await api(app.base, '/api/pay/stars', { method: 'POST', token: me.token, body: { packId: 'b499' } });
  const pid = inv.body.paymentId as string;
  await hook({ update_id: ++updateId, message: { message_id: 1, chat: { id: 828282, type: 'private' }, from: { id: 828282 }, successful_payment: { currency: 'XTR', total_amount: 375, invoice_payload: pid, telegram_payment_charge_id: 'stxB2' } } });
  assert.equal((await ctx().economy.inventory(me.userId)).diamonds, 499);
  await hook({ update_id: ++updateId, message: { message_id: 2, chat: { id: 828282, type: 'private' }, from: { id: 828282 }, refunded_payment: { currency: 'XTR', total_amount: 375, invoice_payload: pid, telegram_payment_charge_id: 'stxB2' } } });
  assert.equal((await ctx().economy.inventory(me.userId)).diamonds, 0);
  const led = await app.db.sql<Array<{ reason: string; delta: number }>>`SELECT reason, delta FROM currency_ledger WHERE user_id = ${me.userId} ORDER BY id`;
  assert.deepEqual(led.map((l) => [l.reason, l.delta]), [['topup', 499], ['refund', -499]]);
});

test('stars: the bot answers /paysupport and /terms (Telegram requires them of a seller)', async () => {
  let a = await hook({ update_id: ++updateId, message: { message_id: 3, text: '/paysupport', chat: { id: 77, type: 'private' }, from: { id: 77, language_code: 'ru' } } });
  assert.match(a.body.text, /Помощь с оплатой/);
  assert.match(a.body.text, /Поддержка Telegram/);
  a = await hook({ update_id: ++updateId, message: { message_id: 4, text: '/terms', chat: { id: 77, type: 'private' }, from: { id: 77, language_code: 'en' } } });
  assert.match(a.body.text, /Terms of purchase/);
  assert.match(a.body.text, /\/terms\.html/);
});

test('xsolla: token with the pack’s SKU, signed webhooks — validation, a paid order once, a cancelled one taken back', async () => {
  const me = await devLogin(app.base, 'Покупатель');
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const fakeFetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return { ok: true, status: 201, json: async () => ({ token: 'tok_ABC', order_id: 4242 }), text: async () => '' };
  };
  const xsolla = new XsollaProvider({ merchantId: '12345', projectId: '777', apiKey: 'api-key-xyz', webhookSecret: 'whs-secret', sandbox: true, skuPrefix: 'blats_' }, fakeFetch);
  const svc = new PaymentService(app.db.sql, silentLogger, new MemoryAnalytics(), 'https://blatkom.example', null, { xsolla });
  assert.equal(svc.webProvider, 'xsolla');
  const co = await svc.checkout(me.userId, 'b999', 'card', { ip: '203.0.113.9', lang: 'ru', alias: 'Покупатель' });
  assert.equal(co.url, 'https://sandbox-secure.xsolla.com/paystation4/?token=tok_ABC');
  assert.equal(calls[0]!.url, 'https://store.xsolla.com/api/v3/project/777/admin/payment/token');
  assert.equal(calls[0]!.headers.authorization, `Basic ${Buffer.from('12345:api-key-xyz').toString('base64')}`);
  assert.equal(calls[0]!.headers['x-user-ip'], '203.0.113.9');
  const sent = JSON.parse(calls[0]!.body);
  assert.deepEqual(sent.purchase.items, [{ sku: 'blats_999', quantity: 1 }]);
  assert.equal(sent.user.id.value, me.userId);
  assert.equal(sent.sandbox, true);
  assert.equal(sent.custom_parameters.payment_id, co.paymentId);
  assert.equal(sent.settings.return_url, `https://blatkom.example/?pay=success&pid=${co.paymentId}`);

  // the signature: sha1(raw body + secret)
  const sign = (b: string) => `Signature ${createHash('sha1').update(b).update('whs-secret').digest('hex')}`;
  const body = JSON.stringify({ notification_type: 'user_validation', user: { id: me.userId } });
  assert.equal(xsolla.verifyWebhook(Buffer.from(body), sign(body)), true);
  assert.equal(xsolla.verifyWebhook(Buffer.from(body.replace('user', 'usr')), sign(body)), false, 'a tampered body');
  assert.equal(xsolla.verifyWebhook(Buffer.from(body), 'Signature ' + '0'.repeat(40)), false);
  assert.equal(xsolla.verifyWebhook(Buffer.from(body), undefined), false);

  assert.deepEqual(await svc.onXsollaWebhook({ notification_type: 'user_validation', user: { id: me.userId } }), { status: 204 });
  assert.equal((await svc.onXsollaWebhook({ notification_type: 'user_validation', user: { id: '00000000-0000-0000-0000-000000000000' } })).status, 400);
  const order = (over: Record<string, unknown> = {}) => ({ notification_type: 'order_paid', items: [{ sku: 'blats_999', type: 'virtual_good', quantity: 1, amount: '9.99' }], order: { id: 4242, mode: 'sandbox', currency_type: 'real', currency: 'EUR', amount: '9.49', status: 'paid' }, user: { external_id: me.userId }, ...over });
  let r = await svc.onXsollaWebhook(order({ items: [{ sku: 'blats_99', quantity: 1 }] }));
  assert.deepEqual(r, { status: 400, code: 'INCORRECT_AMOUNT', message: 'The order’s item is not this pack' });
  r = await svc.onXsollaWebhook(order({ user: { external_id: '00000000-0000-0000-0000-000000000000' } }));
  assert.equal(r.status, 400);
  r = await svc.onXsollaWebhook(order({ order: { id: 999999, mode: 'sandbox' } }));
  assert.equal(r.status === 400 && r.code, 'INCORRECT_INVOICE');
  assert.deepEqual(await svc.onXsollaWebhook(order()), { status: 204 });
  assert.deepEqual(await svc.onXsollaWebhook(order()), { status: 204 }, 'Xsolla repeats it: acknowledged');
  assert.equal((await ctx().economy.inventory(me.userId)).diamonds, 999, 'credited once');
  assert.deepEqual(await svc.onXsollaWebhook({ notification_type: 'payment', transaction: { id: 1 } }), { status: 204 }, 'older accounts also send «payment»: acknowledged');
  // a live server refuses sandbox orders
  const live = new PaymentService(app.db.sql, silentLogger, new MemoryAnalytics(), 'https://blatkom.example', null, { xsolla: new XsollaProvider({ ...xsolla.cfg, sandbox: false }, fakeFetch) });
  assert.equal((await live.onXsollaWebhook(order())).status, 400);
  // the order is cancelled (a refund): the unspent BLATS go back
  assert.deepEqual(await svc.onXsollaWebhook({ notification_type: 'order_canceled', order: { id: 4242 }, user: { external_id: me.userId } }), { status: 204 });
  assert.equal((await ctx().economy.inventory(me.userId)).diamonds, 0);
  assert.equal((await svc.status(me.userId, co.paymentId)).status, 'refunded');
});

test('xsolla: the webhook route checks the signature before anything (404 while Xsolla is not set up here)', async () => {
  assert.equal((await api(app.base, '/api/pay/xsolla/webhook', { method: 'POST', body: { notification_type: 'user_validation' } })).status, 404);
});

test('xsolla: on a server with its keys the webhook route takes signed calls only (Xsolla’s 204 / INVALID_SIGNATURE)', async () => {
  const x = await startTestApp({ XSOLLA_MERCHANT_ID: '12345', XSOLLA_PROJECT_ID: '777', XSOLLA_API_KEY: 'api-key-xyz', XSOLLA_WEBHOOK_SECRET: 'whs-secret-2' });
  try {
    const cfg = await api(x.base, '/api/shop/config');
    assert.equal(cfg.body.card, true);
    assert.equal(cfg.body.provider, 'xsolla');
    const me = await devLogin(x.base, 'Проверяемый');
    const body = JSON.stringify({ notification_type: 'user_validation', user: { id: me.userId } });
    const post = (b: string, sig: string) => fetch(`${x.base}/api/pay/xsolla/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: sig }, body: b });
    const good = `Signature ${createHash('sha1').update(body).update('whs-secret-2').digest('hex')}`;
    let r = await post(body, good);
    assert.equal(r.status, 204);
    r = await post(body, `Signature ${'1'.repeat(40)}`);
    assert.equal(r.status, 400);
    assert.equal(((await r.json()) as { error: { code: string } }).error.code, 'INVALID_SIGNATURE');
    const unknown = JSON.stringify({ notification_type: 'user_validation', user: { id: '00000000-0000-0000-0000-000000000000' } });
    r = await post(unknown, `Signature ${createHash('sha1').update(unknown).update('whs-secret-2').digest('hex')}`);
    assert.equal(r.status, 400);
    assert.equal(((await r.json()) as { error: { code: string } }).error.code, 'INVALID_USER');
  } finally {
    await x.close();
  }
});
