// v0.2.18 part 3 end to end, on the server with a bot set up (a fake token; Telegram is played by the test and a
// stand-in answers the Bot API — tests/e2e/fake-botapi.mjs):
//  • Inside Telegram (a Russian phone): the BLATS banner sells for Stars («Купить →», «⭐ 75»), the Arsenal's
//    packs have their prices in Stars and the terms of purchase; a cancelled invoice credits nothing; a paid one —
//    Telegram's pre-checkout question answered «yes» by the bot, the successful payment reported — puts 199 BLATS
//    on the account once (the payment row: XTR, 150 Stars, Telegram's charge id) and the bot thanks the player.
//  • The bot answers /paysupport and /terms; the website (English) shows no Stars, «coming soon» without a web
//    provider, and the terms pages in both languages.
//
// Usage: DATABASE_URL=… E2E_TG_BOT_TOKEN=… node tests/e2e/v0218c.mjs <baseUrl> <outDir> <fakeBotApiUrl>
import { chromium } from 'playwright';
import postgres from 'postgres';
import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const [base, outDir, botApi] = process.argv.slice(2);
const botToken = process.env.E2E_TG_BOT_TOKEN ?? '';
if (!base || !outDir || !botApi || !process.env.DATABASE_URL || !botToken) {
  console.error('usage: DATABASE_URL=… E2E_TG_BOT_TOKEN=… node tests/e2e/v0218c.mjs <baseUrl> <outDir> <fakeBotApiUrl>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const checks = [];
const check = (ok, what) => {
  checks.push({ ok: !!ok, what });
  console.log(ok ? '✔' : '✖', what);
};
const RUN = Math.random().toString(36).slice(2, 6);
const TG = 890_000_000 + Math.floor(Math.random() * 9_000_000);
const secret = createHmac('sha256', botToken).update('blatkom89 telegram webhook').digest('base64url');
const hook = (update) => fetch(`${base}/api/telegram/webhook?v=2`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(update) }).then((r) => r.json());

function signInit(user) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: `E2EC${RUN}${user.id}`, user: JSON.stringify(user) };
  const dcs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const key = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return new URLSearchParams({ ...fields, hash: createHmac('sha256', key).update(dcs).digest('hex') }).toString();
}

/** Telegram's WebApp object (Bot API 8.0, Android) with `openInvoice` handed to the test. */
function tgStub({ initData, user }) {
  const handlers = {};
  const calls = (window.__tgCalls = []);
  const wa = {
    initData,
    initDataUnsafe: { user },
    version: '8.0',
    platform: 'android',
    colorScheme: 'dark',
    isExpanded: true,
    isFullscreen: false,
    isActive: true,
    viewportHeight: innerHeight,
    viewportStableHeight: innerHeight,
    safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    ready: () => calls.push('ready'),
    expand: () => {},
    close: () => {},
    isVersionAtLeast: (v) => parseFloat(v) <= 8.0,
    setHeaderColor: () => {},
    setBackgroundColor: () => {},
    setBottomBarColor: () => {},
    enableClosingConfirmation: () => {},
    disableClosingConfirmation: () => {},
    disableVerticalSwipes: () => {},
    enableVerticalSwipes: () => {},
    requestFullscreen: () => {},
    exitFullscreen: () => {},
    lockOrientation: () => {},
    unlockOrientation: () => {},
    showConfirm: (_m, cb) => cb(true),
    openTelegramLink: (u) => calls.push(`openTelegramLink:${u}`),
    openLink: (u) => calls.push(`openLink:${u}`),
    // Telegram's payment sheet: the test decides what the player does in it
    openInvoice: (url, cb) => {
      calls.push(`openInvoice:${url}`);
      window.__payStars(url).then((status) => cb(status));
    },
    onEvent: (n, cb) => (handlers[n] = handlers[n] || []).push(cb),
    offEvent: (n, cb) => (handlers[n] = (handlers[n] || []).filter((x) => x !== cb)),
    BackButton: { isVisible: false, show() {}, hide() {}, onClick() {}, offClick() {} },
    HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
  };
  window.Telegram = { WebApp: wa };
}
function watchToasts() {
  window.__toasts = [];
  const watch = () =>
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('toast')) window.__toasts.push(n.textContent);
    }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.documentElement) watch();
  else document.addEventListener('DOMContentLoaded', watch);
}
async function boot(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => {
    const b = document.getElementById('boot');
    return !b || b.classList.contains('boot--hidden') || !!document.querySelector('[data-testid=boot-play]');
  }, null, { timeout: 90000 });
  if (await page.getByTestId('boot-play').count()) await page.getByTestId('boot-play').click();
}
const listen = (name, page) => {
  page.on('pageerror', (e) => problems.push(`[${name} pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org|WebSocket|status of 40[19]/.test(m.text())) problems.push(`[${name} console] ${m.text()}`);
  });
};

// what the player does in Telegram's payment sheet, and what Telegram and the bot said meanwhile
let sheet = 'pay';
const said = [];
async function payStars(url) {
  if (sheet === 'cancel') return 'cancelled';
  const inv = await fetch(`${botApi}/last-invoice`).then((r) => r.json());
  // Telegram asks the bot first…
  const pre = await hook({ update_id: Math.floor(Math.random() * 1e9), pre_checkout_query: { id: `pcq${RUN}`, from: { id: TG, language_code: 'ru' }, currency: inv.currency, total_amount: inv.amount, invoice_payload: inv.payload } });
  said.push({ url, inv, pre });
  if (!pre.ok) return 'failed';
  // …then the money arrives
  const msg = await hook({ update_id: Math.floor(Math.random() * 1e9), message: { message_id: 9, chat: { id: TG, type: 'private' }, from: { id: TG, language_code: 'ru' }, successful_payment: { currency: 'XTR', total_amount: inv.amount, invoice_payload: inv.payload, telegram_payment_charge_id: `stxE2E${RUN}`, provider_payment_charge_id: '' } } });
  said.push({ msg });
  return 'paid';
}

let shotPage = null;
try {
  // ── inside Telegram: Stars ────────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.route('https://telegram.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* the Telegram SDK: played by the test */' }));
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('blatkom89.lang.v1', 'ru');
      localStorage.setItem('blatkom89.tutorial.v1', '1');
    } catch {}
  });
  await ctx.addInitScript(watchToasts);
  const user = { id: TG, first_name: 'Звездочёт', last_name: RUN, language_code: 'ru' };
  await ctx.addInitScript(tgStub, { initData: signInit(user), user });
  const page = await ctx.newPage();
  shotPage = page;
  listen('Telegram', page);
  await page.exposeFunction('__payStars', payStars);
  await boot(page, `${base}/`);
  const welcome = page.getByTestId('tg-welcome-new');
  await welcome.waitFor({ timeout: 60000 }).catch(() => {});
  if (await welcome.count()) await welcome.click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 30000 });
  // the alias offered from the Telegram name: keep it
  const alias = page.getByRole('textbox', { name: 'Кличка' });
  await alias.waitFor({ timeout: 8000 }).catch(() => {});
  if (await alias.count()) await page.getByRole('button', { name: 'Готово' }).click();
  await page.waitForFunction(() => !document.querySelector('input[aria-label="Кличка"]'), null, { timeout: 15000 }).catch(() => {});
  const me = await page.evaluate(() => window.__blatkom?.app?.online?.profile ?? null);
  check(!!me?.id, `a new player in Telegram (${me?.displayName})`);

  // the banner sells for Stars
  const ban = page.getByTestId('blats-banner-menu');
  await page.waitForFunction(() => /⭐/.test(document.querySelector('[data-testid=blats-banner-menu] .blatsban__from')?.textContent ?? ''), null, { timeout: 20000 }).catch(() => {});
  const banner = await ban.evaluate((b) => ({ sale: b.dataset.sale, cta: b.querySelector('.blatsban__cta')?.textContent, from: b.querySelector('.blatsban__from')?.textContent }));
  check(banner.sale === 'stars' && banner.cta === 'Купить →' && /⭐\s*75/.test(banner.from ?? ''), `the menu's banner sells for Stars: «${banner.cta}» · «${banner.from}»`);
  await ban.click();
  await page.getByTestId('blats-tab').waitFor({ timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=blats-tab] .packrow').length >= 6, null, { timeout: 15000 }).catch(() => {});
  const rows = await page.locator('[data-testid=blats-tab] .packrow').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  const prices = await page.locator('[data-testid=blats-tab] [data-testid^=stars-b]').allInnerTexts();
  check(prices.join('|') === ['⭐ 75', '⭐ 150', '⭐ 375', '⭐ 750', '⭐ 1 500', '⭐ 3 750'].join('|') || prices.map((p) => p.replace(/\s/g, '')).join('|') === '⭐75|⭐150|⭐375|⭐750|⭐1500|⭐3750', `six packs priced in Stars: ${prices.join(', ')}`);
  check(rows.every((r) => !/\$/.test(r)), 'no dollar price inside Telegram');
  const terms = await page.getByTestId('terms-link').getAttribute('href');
  check(/terms-ru\.html(\?|$)/.test(terms ?? ''), `the terms of purchase are a tap away (${terms})`);
  check((await page.getByTestId('pay-soon').count()) === 0 && (await page.getByTestId('pay-stars').count()) === 1, 'no «coming soon»: «Оплата звёздами Telegram — в окне самого Telegram»');
  const fit = await page.evaluate(() => ({ side: document.documentElement.scrollWidth - innerWidth }));
  check(fit.side <= 0, 'the tab fits the phone sideways');
  await page.screenshot({ path: `${outDir}/stars_tab_phone.png` });

  // a cancelled invoice: nothing credited, the payment stays open
  sheet = 'cancel';
  await page.getByTestId('stars-b99').click();
  await page.waitForFunction(() => (window.__tgCalls || []).some((c) => c.startsWith('openInvoice:')), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const [c1] = await sql`SELECT status, stars FROM payments WHERE user_id = ${me.id} AND pack_id = 'b99' ORDER BY created_at DESC LIMIT 1`;
  const bal0 = (await sql`SELECT diamonds FROM profiles WHERE user_id = ${me.id}`)[0]?.diamonds;
  check(c1?.status === 'created' && c1?.stars === 75 && bal0 === 0, `a cancelled invoice credits nothing (${JSON.stringify(c1)}, ${bal0} BLATS)`);
  const opened = (await page.evaluate(() => window.__tgCalls)).filter((c) => c.startsWith('openInvoice:'));
  check(/^openInvoice:https:\/\/t\.me\/\$e2e-invoice-/.test(opened[0] ?? ''), `the Mini App opened Telegram's invoice (${opened[0]})`);

  // a paid one
  sheet = 'pay';
  await page.getByTestId('stars-b199').click();
  const credited = await page
    .waitForFunction(() => (window.__toasts || []).some((t) => /199/.test(t)), null, { timeout: 40000 })
    .then(() => true)
    .catch(() => false);
  const toasts = await page.evaluate(() => window.__toasts);
  check(credited, `the game says the BLATS arrived (${toasts.slice(-2).join(' | ')})`);
  const pre = said.find((s) => s.pre)?.pre;
  const inv = said.find((s) => s.inv)?.inv;
  check(inv?.currency === 'XTR' && inv?.amount === 150 && inv?.providerToken === '' && /199/.test(inv?.title ?? ''), `the invoice: XTR, 150 Stars, no provider token («${inv?.title}»)`);
  check(pre?.method === 'answerPreCheckoutQuery' && pre?.ok === true, `the bot said «yes» to Telegram's pre-checkout question (${JSON.stringify(pre)})`);
  const msg = said.find((s) => s.msg)?.msg;
  check(msg?.method === 'sendMessage' && /\+199 БЛАТ/.test(msg?.text ?? ''), `the bot thanks the player: «${(msg?.text ?? '').replace(/<[^>]+>/g, '')}»`);
  const [paid] = await sql`SELECT status, stars, currency, charge_ref FROM payments WHERE user_id = ${me.id} AND pack_id = 'b199'`;
  const bal = (await sql`SELECT diamonds FROM profiles WHERE user_id = ${me.id}`)[0]?.diamonds;
  const led = await sql`SELECT delta FROM currency_ledger WHERE user_id = ${me.id} AND reason = 'topup'`;
  check(paid?.status === 'paid' && paid?.stars === 150 && paid?.currency === 'xtr' && paid?.charge_ref === `stxE2E${RUN}` && bal === 199 && led.length === 1, `199 BLATS once (${JSON.stringify(paid)}, balance ${bal}, ${led.length} top-up)`);
  // Telegram repeats the payment report: still once
  await hook({ update_id: Math.floor(Math.random() * 1e9), message: { message_id: 10, chat: { id: TG, type: 'private' }, from: { id: TG }, successful_payment: { currency: 'XTR', total_amount: 150, invoice_payload: inv?.payload, telegram_payment_charge_id: `stxE2E${RUN}` } } });
  check((await sql`SELECT diamonds FROM profiles WHERE user_id = ${me.id}`)[0]?.diamonds === 199, 'a repeated payment report changes nothing');
  await page.waitForFunction(() => /199/.test(document.querySelector('[data-testid=blats-balance], .arswallet, .wallet')?.textContent ?? document.body.textContent), null, { timeout: 10000 }).catch(() => {});
  await page.screenshot({ path: `${outDir}/stars_paid_phone.png` });
  await ctx.close();

  // ── the bot's commands for sellers ─────────────────────────────────────────
  const ps = await hook({ update_id: Math.floor(Math.random() * 1e9), message: { message_id: 1, text: '/paysupport', chat: { id: TG, type: 'private' }, from: { id: TG, language_code: 'ru' } } });
  check(/Помощь с оплатой/.test(ps.text ?? '') && /Поддержка Telegram/.test(ps.text ?? ''), '/paysupport: who to write to; Telegram support can’t help with these purchases');
  const tm = await hook({ update_id: Math.floor(Math.random() * 1e9), message: { message_id: 2, text: '/terms', chat: { id: TG + 1, type: 'private' }, from: { id: TG + 1, language_code: 'en' } } });
  check(/Terms of purchase/.test(tm.text ?? '') && /terms\.html/.test(tm.text ?? ''), '/terms: the link to the terms');

  // ── the website: no Stars; the terms pages ─────────────────────────────────
  const w = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-GB' });
  await w.addInitScript(() => {
    try {
      localStorage.setItem('blatkom89.lang.v1', 'en');
      localStorage.setItem('blatkom89.tutorial.v1', '1');
      localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
    } catch {}
  });
  const wp = await w.newPage();
  listen('Website', wp);
  await boot(wp, `${base}/`);
  const nick = wp.getByRole('textbox', { name: 'Alias' });
  await nick.waitFor({ timeout: 60000 });
  await nick.fill(`Webby ${RUN}`);
  await wp.getByRole('button', { name: 'Done' }).click();
  await wp.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  await wp.getByTestId('blats-banner-menu').click();
  await wp.getByTestId('blats-tab').waitFor({ timeout: 20000 });
  await wp.waitForFunction(() => document.querySelectorAll('[data-testid=blats-tab] .pack').length >= 6, null, { timeout: 15000 }).catch(() => {});
  const wtab = await wp.getByTestId('blats-tab').innerText();
  check(!/⭐/.test(wtab) && (await wp.getByTestId('pay-soon').count()) === 1 && /\$0\.99/.test(wtab), 'the website: dollar prices, no Stars, «Payments are being connected — coming soon» without a web provider');
  for (const [path, title] of [
    ['/terms.html', 'BLATKOM ’89 — terms of purchase'],
    ['/terms-ru.html', 'БЛАТКОМ ’89 — условия покупки'],
  ]) {
    await wp.goto(base + path);
    const t = await wp.title();
    const text = await wp.locator('main').innerText();
    check(t === title && /Telegram/.test(text) && /(18\+)/.test(text), `${path}: «${t}», the cases 18+, Telegram's support line`);
  }
  await wp.screenshot({ path: `${outDir}/terms_page.png`, fullPage: true });
  await w.close();
} catch (e) {
  check(false, `flow failed: ${e.message.split('\n')[0]}`);
  await shotPage?.screenshot({ path: `${outDir}/v0218c_fail.png` }).catch(() => {});
}
for (const p of problems) console.log('  problem:', p);
await browser.close();
await sql.end({ timeout: 5 });
const failed = checks.filter((c) => !c.ok).length + problems.length;
console.log(failed ? `[v0218c] ${failed} problem(s)` : `[v0218c] all ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
