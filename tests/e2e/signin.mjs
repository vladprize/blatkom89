// Sign-in with a provider, end to end (v0.3), on a server that has every provider's keys set — fake ones:
// no provider is ever contacted (their pages are stubbed in the browser, the provider's answers are
// played by the test).
//  • A phone (English): the welcome window offers Google · Telegram · Discord · Facebook · Reddit and fits
//    the screen. «Google» leaves for Google's page with the client id, the callback address and a signed
//    state; coming back cancelled, the page says so and the guest is still the guest.
//  • «Telegram» leaves for Telegram's page with the bot's id and the way back; Telegram's signed answer
//    (signed here with the server's test bot token) links Telegram to the guest: the welcome window is not
//    asked again and the account panel shows «✓ Telegram».
//  • A desktop (Russian) opens a one-time Discord hand-over (written straight into the test database, as
//    the server writes it after the provider's callback) and lands in the same account without the alias
//    or welcome questions; the panel lists both ways in; the hand-over works once.
//  • Optionally a server without keys: the welcome window has no provider buttons.
//
// Usage: DATABASE_URL=… E2E_TG_BOT_TOKEN=… node tests/e2e/signin.mjs <baseUrl> <outDir> [<baseUrlWithoutProviders>]
import { chromium } from 'playwright';
import postgres from 'postgres';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const [base, outDir, plainBase] = process.argv.slice(2);
const botToken = process.env.E2E_TG_BOT_TOKEN ?? '';
if (!base || !outDir || !process.env.DATABASE_URL || !botToken) {
  console.error('usage: DATABASE_URL=… E2E_TG_BOT_TOKEN=… node tests/e2e/signin.mjs <baseUrl> <outDir> [<baseUrlWithoutProviders>]');
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
const STUB = (name) => `<!doctype html><meta charset="utf-8"><title>${name} (stub)</title><p>${name} sign-in page — stubbed by the test</p>`;

async function open(name, lang, viewport, url) {
  const phone = viewport.width < 600;
  const ctx = await browser.newContext({ viewport, locale: lang === 'ru' ? 'ru-RU' : 'en-GB', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem('blatkom89.lang.v1', l);
      localStorage.setItem('blatkom89.tutorial.v1', '1');
    } catch {}
  }, lang);
  // Telegram's page is opened by the game itself: stubbed. Google's comes as the server's redirect, which
  // the browser follows without asking the test's routes — that request is only watched (and goes nowhere).
  await ctx.route('https://oauth.telegram.org/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: STUB('Telegram') }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${name} pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org|status of 401/.test(m.text())) problems.push(`[${name} console] ${m.text()}`);
  });
  await boot(page, url);
  return { ctx, page };
}

async function boot(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => {
    const b = document.getElementById('boot');
    return !b || b.classList.contains('boot--hidden') || !!document.querySelector('[data-testid=boot-play]');
  }, null, { timeout: 90000 });
  if (await page.getByTestId('boot-play').count()) await page.getByTestId('boot-play').click();
}

const me = (page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/me', { headers: { authorization: `Bearer ${localStorage.getItem('blatkom89.token')}` } });
    return r.ok ? r.json() : null;
  });
const toastSeen = (page, text) =>
  page
    .locator('.toast', { hasText: text })
    .first()
    .waitFor({ timeout: 30000 })
    .then(() => true)
    .catch(() => false);
const providerLabels = (page, testid) => page.locator(`[data-testid=${testid}] button`).allInnerTexts();

try {
  // ── a phone: the welcome window with the providers ───────────────────────
  const A = await open('Phone', 'en', { width: 390, height: 844 }, base + '/');
  await A.page.getByTestId('welcome').waitFor({ timeout: 60000 });
  await A.page.locator('[data-testid=welcome-providers] button').nth(4).waitFor({ timeout: 20000 });
  const labels = await providerLabels(A.page, 'welcome-providers');
  check(labels.join(' · ') === 'Google · Telegram · Discord · Facebook · Reddit', `the welcome window offers ${labels.join(' · ')}`);
  const fit = await A.page.evaluate(() => {
    const modal = document.querySelector('[data-testid=welcome] .modal').getBoundingClientRect();
    const btns = [...document.querySelectorAll('[data-testid=welcome-providers] button')].map((b) => b.getBoundingClientRect());
    return {
      inside: btns.every((b) => b.left >= modal.left - 0.5 && b.right <= modal.right + 0.5 && b.height >= 36),
      modal: modal.left >= 0 && modal.right <= innerWidth,
      page: document.scrollingElement.scrollWidth <= innerWidth,
      rows: new Set(btns.map((b) => Math.round(b.top))).size,
    };
  });
  check(fit.inside && fit.modal && fit.page, `390×844: the window and its ${labels.length} buttons fit the screen, tappable height, ${fit.rows} rows (${JSON.stringify(fit)})`);
  await A.page.screenshot({ path: `${outDir}/welcome_phone_en.png` });
  const guest = await me(A.page);
  check(guest && guest.id && !guest.telegramLinked && (guest.identities ?? []).length === 0, `a guest account (${guest?.displayName})`);

  // ── Google: leave with the client id, the way back and a state; come back cancelled ──
  const toGoogle = new Promise((resolve, reject) => {
    A.page.on('request', (r) => r.url().startsWith('https://accounts.google.com/') && resolve(r.url()));
    setTimeout(() => reject(new Error('no request to Google')), 20000);
  });
  await A.page.locator('[data-testid=welcome-providers] [data-provider=google]').click();
  const g = new URL(await toGoogle);
  const state = g.searchParams.get('state') ?? '';
  check(
    g.searchParams.get('client_id') === 'e2e-google-id' &&
      g.searchParams.get('redirect_uri') === `${base}/api/auth/oauth/google/callback` &&
      g.searchParams.get('scope') === 'openid profile' &&
      g.searchParams.get('response_type') === 'code' &&
      state.length > 40,
    `«Google» leaves for ${g.origin}${g.pathname} with the client id, ${g.searchParams.get('redirect_uri')} and a signed state`,
  );
  check(!/secret/.test(g.href), 'no client secret in the address');
  const nonce = !(await A.ctx.cookies(base)).some((c) => c.name === 'blk_oauth') && (await A.ctx.cookies(`${base}/api/auth/oauth/google/callback`)).some((c) => c.name === 'blk_oauth' && c.httpOnly);
  check(nonce, 'the sign-in cookie: HttpOnly, only for /api/auth/oauth');
  await A.page.waitForTimeout(500);
  await boot(A.page, `${base}/api/auth/oauth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`);
  check(await toastSeen(A.page, 'Sign-in cancelled'), 'cancelled on Google’s page: «Sign-in cancelled»');
  const after = await me(A.page);
  check(after?.id === guest.id && !/login_error/.test(A.page.url()), `still the same guest, the address cleaned (${new URL(A.page.url()).pathname}${new URL(A.page.url()).search})`);

  // ── Telegram: leave for Telegram, come back signed: Telegram is linked to the guest ──
  await A.page.getByTestId('welcome').waitFor({ timeout: 20000 });
  await A.page.locator('[data-testid=welcome-providers] [data-provider=telegram]').click();
  await A.page.waitForURL(/oauth\.telegram\.org/, { timeout: 20000 });
  const tgu = new URL(A.page.url());
  check(
    tgu.searchParams.get('bot_id') === botToken.split(':')[0] && tgu.searchParams.get('origin') === base && tgu.searchParams.get('return_to') === `${base}/`,
    `«Telegram» leaves for oauth.telegram.org with the bot id ${tgu.searchParams.get('bot_id')} and the way back`,
  );
  const tgId = 7_700_000_000 + Math.floor(Math.random() * 99_999_999);
  const fields = { id: tgId, first_name: 'Тест', last_name: 'Проверкин', username: `e2e_${RUN}`, auth_date: Math.floor(Date.now() / 1000) };
  const dcs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const hash = createHmac('sha256', createHash('sha256').update(botToken).digest()).update(dcs).digest('hex');
  const tgAuthResult = Buffer.from(JSON.stringify({ ...fields, hash }), 'utf8').toString('base64url');
  await boot(A.page, `${base}/#tgAuthResult=${tgAuthResult}`);
  check(await toastSeen(A.page, 'Telegram is linked — your progress is safe'), 'Telegram’s signed answer: «Telegram is linked — your progress is safe»');
  const linked = await me(A.page);
  const [row] = await sql`SELECT telegram_id::text AS tg FROM users WHERE id = ${guest.id}`;
  check(linked?.id === guest.id && linked.telegramLinked && row?.tg === String(tgId) && A.page.url() === `${base}/`, `the guest’s own account got the Telegram id ${row?.tg}; the address cleaned`);
  // the alias, then no welcome window any more
  const nick = A.page.getByRole('textbox', { name: 'Alias' });
  await nick.waitFor({ timeout: 20000 });
  check((await A.page.getByTestId('welcome').count()) === 0, 'with Telegram linked the welcome window is not asked again');
  const alias = `Signin ${RUN}`;
  await nick.fill(alias);
  await A.page.getByRole('button', { name: 'Done' }).click();
  await A.page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  await A.page.getByTestId('menu-nick').click();
  await A.page.getByTestId('account-providers').waitFor({ state: 'visible', timeout: 20000 });
  const panelA = await A.page.evaluate(() => ({
    text: document.querySelector('[data-testid=account-providers] .muted')?.textContent ?? '',
    email: [...document.querySelectorAll('.panel div')].some((d) => d.textContent === 'An email and a password: one more way into this account, on any device.'),
    done: [...document.querySelectorAll('[data-testid=account-provider-buttons] button[disabled]')].map((b) => b.textContent),
    open: [...document.querySelectorAll('[data-testid=account-provider-buttons] button:not([disabled])')].map((b) => b.textContent),
  }));
  check(panelA.text.startsWith('Signs in with: Telegram') && panelA.done.join() === '✓ Telegram' && panelA.open.length === 4, `the account panel: «${panelA.text}» [${panelA.done}] + ${panelA.open.join(', ')}`);
  check(panelA.email, 'the email offered as one more way in (the account is already safe)');
  await A.page.getByTestId('account-providers').scrollIntoViewIfNeeded();
  await A.page.screenshot({ path: `${outDir}/account_phone_en.png` });

  // ── a desktop in Russian: a Discord hand-over opens the same account ─────
  await sql`INSERT INTO user_identities (provider, provider_uid, user_id) VALUES ('discord', ${`e2e-discord-${RUN}`}, ${guest.id})`;
  const code = randomBytes(24).toString('base64url');
  await sql`INSERT INTO auth_handoffs (code_hash, user_id, provider, is_new, linked) VALUES (${createHash('sha256').update(code).digest('hex')}, ${guest.id}, 'discord', false, false)`;
  const B = await open('Desktop', 'ru', { width: 1280, height: 760 }, `${base}/#login=${code}`);
  check(await toastSeen(B.page, 'Вход через Discord'), 'the hand-over: «Вход через Discord»');
  await B.page.getByTestId('menu-nick').waitFor({ timeout: 30000 });
  const nickB = (await B.page.getByTestId('menu-nick').innerText()).trim();
  const meB = await me(B.page);
  check(meB?.id === guest.id && nickB === alias && B.page.url() === `${base}/`, `the same account on the desktop («${nickB}»), the code gone from the address`);
  await B.page.waitForTimeout(1500);
  const asked = await B.page.evaluate(() => ({ welcome: !!document.querySelector('[data-testid=welcome]'), alias: !!document.querySelector('input[aria-label="Кличка"]') }));
  check(!asked.welcome && !asked.alias, `no welcome window and no alias question on the second device (${JSON.stringify(asked)})`);
  await B.page.getByTestId('menu-nick').click();
  await B.page.getByTestId('account-providers').waitFor({ state: 'visible', timeout: 20000 });
  const panelB = await B.page.evaluate(() => ({
    text: document.querySelector('[data-testid=account-providers] .muted')?.textContent ?? '',
    done: [...document.querySelectorAll('[data-testid=account-provider-buttons] button[disabled]')].map((b) => b.textContent),
  }));
  check(panelB.text.startsWith('Вход через: Discord, Telegram') && panelB.done.join() === '✓ Telegram,✓ Discord', `the panel in Russian: «${panelB.text}» [${panelB.done}]`);
  await B.page.getByTestId('account-providers').scrollIntoViewIfNeeded();
  await B.page.screenshot({ path: `${outDir}/account_desktop_ru.png` });
  const reuse = await B.page.evaluate(async (c) => (await fetch('/api/auth/oauth/finish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: c }) })).status, code);
  check(reuse === 401, `the hand-over works once (again: ${reuse})`);

  // ── a desktop's welcome window (Russian): the same five, inside the window ─
  const D = await open('Desktop welcome', 'ru', { width: 1280, height: 760 }, base + '/');
  await D.page.getByTestId('welcome').waitFor({ timeout: 60000 });
  await D.page.locator('[data-testid=welcome-providers] button').nth(4).waitFor({ timeout: 20000 });
  const dfit = await D.page.evaluate(() => {
    const modal = document.querySelector('[data-testid=welcome] .modal').getBoundingClientRect();
    const btns = [...document.querySelectorAll('[data-testid=welcome-providers] button')].map((b) => b.getBoundingClientRect());
    return { inside: btns.every((b) => b.left >= modal.left && b.right <= modal.right), rows: new Set(btns.map((b) => Math.round(b.top))).size, lead: document.querySelector('.welcome__or')?.textContent };
  });
  check(dfit.inside && dfit.lead === 'В одно касание через', `1280×760 in Russian: «${dfit.lead}» and the five buttons inside the window in ${dfit.rows} rows`);
  await D.page.screenshot({ path: `${outDir}/welcome_desktop_ru.png` });
  await D.ctx.close();

  // ── a server without keys: no provider buttons ───────────────────────────
  if (plainBase) {
    const C = await open('Plain', 'en', { width: 390, height: 844 }, plainBase + '/');
    await C.page.getByTestId('welcome').waitFor({ timeout: 60000 });
    await C.page.waitForTimeout(1500);
    const none = await C.page.evaluate(() => ({ buttons: document.querySelectorAll('[data-testid=welcome] [data-provider]').length, hidden: document.querySelector('.welcome__providers')?.hidden ?? true }));
    check(none.buttons === 0 && none.hidden, 'a server without keys: the welcome window shows no provider buttons');
    await C.ctx.close();
  }
  await A.ctx.close();
  await B.ctx.close();
} catch (e) {
  console.error('[signin] failed:', e);
  checks.push({ ok: false, what: `exception: ${e.message}` });
} finally {
  await browser.close();
  await sql.end({ timeout: 5 });
}
for (const p of problems) console.log('!', p);
const bad = checks.filter((c) => !c.ok);
console.log(`[signin] ${checks.length - bad.length}/${checks.length} checks passed${problems.length ? `, ${problems.length} page problems` : ''}`);
process.exit(bad.length || problems.length ? 1 : 0);
