// The Telegram Mini App end to end (V2.0 part E), on the server with a bot set up — a fake token: Telegram
// itself is played by the test. A stand-in for Telegram's WebApp object carries launch data signed with the
// bot's token the way Telegram signs it, records what the game asks of Telegram and fires Telegram's events.
//  • The website: a guest with progress presses «Link Telegram» and gets the bot's one-time link; the bot
//    (its webhook, called with Telegram's secret header) answers `/start link_<code>` with «Link and play»;
//    the game opened from that button in Telegram signs in to the very same account — no second profile —
//    and says so; the website notices by itself; the next launch in Telegram is the same account again.
//  • Inside Telegram: a new player is asked whether they already have an account; an email sign-in there
//    attaches this Telegram to the email's account (the empty profile of the first launch stays, merged).
//  • A Kon 1×1 between the two Telegram phones: fullscreen at the start, the landscape lock only while held
//    sideways, the safe areas move the HUD; minimised with a socket that died quietly and back: the game
//    reconnects at once, in the same room, the music and the held stick stop meanwhile; the orientation is
//    let go after the match.
//
// Usage: DATABASE_URL=… E2E_TG_BOT_TOKEN=… node tests/e2e/telegram.mjs <baseUrl> <outDir> <botUsername>
import { chromium } from 'playwright';
import postgres from 'postgres';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const [base, outDir, botUsername] = process.argv.slice(2);
const botToken = process.env.E2E_TG_BOT_TOKEN ?? '';
if (!base || !outDir || !botUsername || !process.env.DATABASE_URL || !botToken) {
  console.error('usage: DATABASE_URL=… E2E_TG_BOT_TOKEN=… node tests/e2e/telegram.mjs <baseUrl> <outDir> <botUsername>');
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
// Telegram user ids of this run (random, far from real-looking ones)
const TG_A = 880_000_000 + Math.floor(Math.random() * 9_000_000);
const TG_B = TG_A + 1;

/** Launch data signed the way Telegram signs it (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). */
function signInit(user) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: `E2E${RUN}${user.id}`, user: JSON.stringify(user) };
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return new URLSearchParams({ ...fields, hash: createHmac('sha256', secret).update(check).digest('hex') }).toString();
}

/** Telegram's WebApp object as the game sees it inside Telegram (Bot API 8.0, an Android phone). */
function tgStub({ initData, user, insets }) {
  const handlers = {};
  const calls = (window.__tgCalls = []);
  const fire = (name) => (handlers[name] || []).slice().forEach((cb) => cb());
  window.__tgFire = fire;
  const wa = {
    initData,
    initDataUnsafe: { user },
    version: '8.0',
    platform: 'android',
    colorScheme: 'dark',
    isExpanded: true,
    isFullscreen: false,
    isOrientationLocked: false,
    isActive: true,
    viewportHeight: innerHeight,
    viewportStableHeight: innerHeight,
    safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    ready: () => calls.push('ready'),
    expand: () => calls.push('expand'),
    close: () => calls.push('close'),
    isVersionAtLeast: (v) => parseFloat(v) <= 8.0,
    setHeaderColor: () => {},
    setBackgroundColor: () => {},
    setBottomBarColor: () => {},
    enableClosingConfirmation: () => calls.push('closingOn'),
    disableClosingConfirmation: () => calls.push('closingOff'),
    disableVerticalSwipes: () => calls.push('noSwipes'),
    enableVerticalSwipes: () => {},
    // fullscreen: the phone's safe area and Telegram's own buttons over the app
    requestFullscreen: () => {
      calls.push('requestFullscreen');
      wa.isFullscreen = true;
      wa.safeAreaInset = { ...insets.safe };
      wa.contentSafeAreaInset = { ...insets.content };
      setTimeout(() => ['fullscreenChanged', 'safeAreaChanged', 'contentSafeAreaChanged'].forEach(fire), 30);
    },
    exitFullscreen: () => calls.push('exitFullscreen'),
    lockOrientation: () => {
      calls.push(`lockOrientation:${innerWidth > innerHeight ? 'landscape' : 'portrait'}`);
      wa.isOrientationLocked = true;
    },
    unlockOrientation: () => {
      calls.push('unlockOrientation');
      wa.isOrientationLocked = false;
    },
    showConfirm: (_m, cb) => cb(true),
    openTelegramLink: (u) => calls.push(`openTelegramLink:${u}`),
    openLink: (u) => calls.push(`openLink:${u}`),
    onEvent: (n, cb) => (handlers[n] = handlers[n] || []).push(cb),
    offEvent: (n, cb) => (handlers[n] = (handlers[n] || []).filter((x) => x !== cb)),
    BackButton: { isVisible: false, show() {}, hide() {}, onClick() {}, offClick() {} },
    HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
  };
  window.Telegram = { WebApp: wa };
  // every socket the page opens (the minimise check kills one quietly)
  const Orig = window.WebSocket;
  window.__sockets = [];
  window.WebSocket = class extends Orig {
    constructor(...a) {
      super(...a);
      window.__sockets.push(this);
    }
  };
}

const INSETS = { safe: { top: 0, bottom: 12, left: 28, right: 28 }, content: { top: 36, bottom: 0, left: 0, right: 0 } };

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

/** Every page of the run (screenshots when something throws). */
const pages = new Map();
function listen(name, page) {
  pages.set(name, page);
  page.on('pageerror', (e) => problems.push(`[${name} pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org|WebSocket|status of 40[19]/.test(m.text())) problems.push(`[${name} console] ${m.text()}`);
  });
}

/** The website in a desktop browser (a guest). */
async function website(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, locale: 'en-GB' });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('blatkom89.lang.v1', 'en');
      localStorage.setItem('blatkom89.tutorial.v1', '1');
      localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
    } catch {}
  });
  await ctx.addInitScript(watchToasts);
  const page = await ctx.newPage();
  listen(name, page);
  await boot(page, base + '/');
  return { ctx, page };
}

/** The game opened inside Telegram on a phone, as Telegram user `tgUser`. */
async function telegram(name, tgUser, url, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, locale: 'en-GB', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.route('https://telegram.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* the Telegram SDK: played by the test */' }));
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('blatkom89.lang.v1', 'en');
      localStorage.setItem('blatkom89.tutorial.v1', '1');
    } catch {}
  });
  await ctx.addInitScript(watchToasts);
  await ctx.addInitScript(tgStub, { initData: signInit(tgUser), user: tgUser, insets: INSETS });
  const page = await ctx.newPage();
  listen(name, page);
  await boot(page, url);
  return { ctx, page };
}

const toastSeen = (page, text, timeout = 30000) =>
  page
    .waitForFunction((x) => (window.__toasts || []).some((t) => t.includes(x)), text, { timeout })
    .then(() => true)
    .catch(() => false);
const profileOf = (page) => page.evaluate(() => window.__blatkom?.app?.online?.profile ?? null);
const tgCalls = (page) => page.evaluate(() => window.__tgCalls ?? []);
/** The bot's webhook as Telegram calls it: the secret header, an update; the answer rides in the response. */
async function botSays(text, fromId) {
  const secret = createHmac('sha256', botToken).update('blatkom89 telegram webhook').digest('base64url');
  const update = { update_id: Math.floor(Math.random() * 1e9), message: { message_id: 1, text, chat: { id: fromId, type: 'private' }, from: { id: fromId, is_bot: false, language_code: 'en' } } };
  const r = await fetch(`${base}/api/telegram/webhook?v=1`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(update) });
  return r.json();
}

try {
  // ── the website: a guest with progress links Telegram ─────────────────────
  const W = await website('Website');
  const nick = W.page.getByRole('textbox', { name: 'Alias' });
  await nick.waitFor({ timeout: 60000 });
  const aliasW = `Linker ${RUN}`;
  await nick.fill(aliasW);
  await W.page.getByRole('button', { name: 'Done' }).click();
  await W.page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  const meW = await profileOf(W.page);
  // progress made on the website (as a few matches would)
  await sql`UPDATE profiles SET xp = 650, matches_played = 2 WHERE user_id = ${meW.id}`;
  await W.page.getByTestId('menu-nick').click();
  await W.page.getByTestId('account-tglink-start').waitFor({ timeout: 20000 });
  await W.page.getByTestId('account-tglink').scrollIntoViewIfNeeded();
  await W.page.screenshot({ path: `${outDir}/tglink_website_before.png` });
  await W.page.getByTestId('account-tglink-start').click();
  await W.page.getByTestId('account-tglink-open').waitFor({ timeout: 20000 });
  const href = await W.page.getByTestId('account-tglink-open').getAttribute('href');
  const m = new RegExp(`^https://t\\.me/${botUsername}\\?start=link_([A-Za-z0-9_-]{16})$`).exec(href ?? '');
  check(!!m && (await W.page.getByTestId('account-tglink-wait').isVisible()), `«Link Telegram» gives the bot’s one-time link (${href}) and waits for Telegram`);
  await W.page.screenshot({ path: `${outDir}/tglink_website_waiting.png` });
  const code = m?.[1] ?? 'missing';
  // the bot: «/start link_<code>» → the Mini App button with the code
  const answer = await botSays(`/start link_${code}`, TG_A);
  const button = answer?.reply_markup?.inline_keyboard?.[0]?.[0];
  check(button?.text === '🔗 Link and play' && button?.web_app?.url === `${base}/?tglink=${code}` && answer.reply_markup.inline_keyboard.length === 1, `the bot answers with «${button?.text}» → ${button?.web_app?.url}`);
  const usersBefore = (await sql`SELECT count(*)::int AS n FROM users`)[0].n;
  // Telegram opens the game from that button
  const userA = { id: TG_A, first_name: 'Тест', last_name: 'Телеграмов', language_code: 'en' };
  const TA = await telegram('Telegram A', userA, button?.web_app?.url ?? `${base}/?tglink=${code}`);
  check(await toastSeen(TA.page, 'Telegram is linked — your progress from the website is here'), 'in Telegram: «Telegram is linked — your progress from the website is here»');
  await TA.page.getByTestId('menu-nick').waitFor({ timeout: 30000 });
  const meTA = await profileOf(TA.page);
  const nickTA = (await TA.page.getByTestId('menu-nick').innerText()).trim();
  check(meTA?.id === meW.id && meTA.xp === 650 && nickTA === aliasW, `Telegram opens the website’s account: «${nickTA}», ${meTA?.xp} XP`);
  const [rowA] = await sql`SELECT telegram_id::text AS tg FROM users WHERE id = ${meW.id}`;
  const usersAfter = (await sql`SELECT count(*)::int AS n FROM users`)[0].n;
  check(rowA?.tg === String(TG_A) && usersAfter === usersBefore, `the Telegram id is on that account, no second profile (${usersBefore} → ${usersAfter} accounts)`);
  check(!new URL(TA.page.url()).searchParams.has('tglink'), 'the code is taken out of the address');
  const asked = await TA.page.evaluate(() => ({ tg: !!document.querySelector('[data-testid=tg-welcome]'), alias: !!document.querySelector('input[aria-label="Alias"]') }));
  check(!asked.tg && !asked.alias, `no «already have an account?» and no alias question for the linked account (${JSON.stringify(asked)})`);
  await TA.page.screenshot({ path: `${outDir}/tglink_telegram_menu.png` });
  // the website notices by itself
  check(await toastSeen(W.page, 'Telegram is linked — the game in Telegram opens this account', 20000), 'the website notices: «Telegram is linked — the game in Telegram opens this account»');
  await W.page.waitForFunction(() => !document.querySelector('[data-testid=account-tglink-start]') && !document.querySelector('[data-testid=account-tglink-wait]'), null, { timeout: 10000 }).catch(() => {});
  const wPanel = await W.page.evaluate(() => ({ block: !!document.querySelector('[data-testid=account-tglink]:not([hidden])'), providers: document.querySelector('[data-testid=account-providers] .muted')?.textContent ?? '' }));
  check(!wPanel.block, `the website’s panel no longer offers the link (${JSON.stringify(wPanel)})`);
  await W.page.screenshot({ path: `${outDir}/tglink_website_after.png` });
  // three pages drawing the game in software GL slow each other down: the website is done
  await W.ctx.close();
  pages.delete('Website');
  // the code works once
  const reuse = await fetch(`${base}/api/auth/telegram`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: signInit({ id: TG_A + 7, first_name: 'Other' }), link: code }) }).then((r) => r.json());
  check(reuse.telegramLink === 'invalid' && reuse.profile?.id !== meW.id, `the code works once (another Telegram with it: ${reuse.telegramLink})`);
  // the next launch in Telegram: the same account
  await TA.ctx.close();
  const TA2 = await telegram('Telegram A again', userA, `${base}/`, { width: 844, height: 390 });
  await TA2.page.getByTestId('menu-nick').waitFor({ timeout: 30000 });
  const again = await profileOf(TA2.page);
  check(again?.id === meW.id && (await TA2.page.getByTestId('tg-welcome').count()) === 0, 'the next launch in Telegram is the same account, nothing asked');

  // ── inside Telegram: a new player brings the email account ────────────────
  const email = `tg-e2e-${RUN}@example.com`;
  const guest = await fetch(`${base}/api/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Mailer ${RUN}`, deviceId: randomBytes(16).toString('hex') }) }).then((r) => r.json());
  const linkedMail = await fetch(`${base}/api/auth/email/link`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${guest.token}` }, body: JSON.stringify({ email, password: 'district-1989' }) });
  check(linkedMail.status === 200, `an email account on the website (${guest.profile?.displayName})`);
  await sql`UPDATE profiles SET xp = 300, matches_played = 3 WHERE user_id = ${guest.profile.id}`;
  const userB = { id: TG_B, first_name: 'Почтальон', language_code: 'en' };
  const TB = await telegram('Telegram B', userB, `${base}/`);
  await TB.page.getByTestId('tg-welcome').waitFor({ timeout: 60000 });
  const emptyId = (await profileOf(TB.page))?.id;
  check(!!emptyId && emptyId !== guest.profile.id, 'a new player in Telegram: «Welcome to the district — already playing on the website?»');
  await TB.page.screenshot({ path: `${outDir}/tg_welcome_phone.png` });
  await TB.page.getByTestId('tg-welcome-login').click();
  const dialog = TB.page.locator('.overlay--top .modal').last();
  await dialog.getByRole('textbox', { name: 'Email' }).fill(email);
  await dialog.getByRole('textbox', { name: 'Password' }).fill('district-1989');
  const note = await dialog.locator('.muted').first().innerText();
  check(/Telegram opens that account from now on/.test(note), `the sign-in says what happens in Telegram («${note}»)`);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  check(await toastSeen(TB.page, 'Signed in — from now on Telegram opens this account'), '«Signed in — from now on Telegram opens this account»');
  await TB.page.waitForFunction((id) => window.__blatkom?.app?.online?.profile?.id === id && !!document.querySelector('[data-testid=menu-nick]'), guest.profile.id, { timeout: 20000 });
  const [rowB] = await sql`SELECT telegram_id::text AS tg FROM users WHERE id = ${guest.profile.id}`;
  const [left] = await sql`SELECT telegram_id::text AS tg, merged_into FROM users WHERE id = ${emptyId}`;
  check(rowB?.tg === String(TG_B) && left?.tg === null && left?.merged_into === guest.profile.id, 'the email’s account got this Telegram; the empty first-launch profile stays, marked merged');
  await TB.ctx.close();
  const TB2 = await telegram('Telegram B again', userB, `${base}/`);
  await TB2.page.getByTestId('menu-nick').waitFor({ timeout: 30000 });
  check((await profileOf(TB2.page))?.id === guest.profile.id && (await TB2.page.getByTestId('tg-welcome').count()) === 0, 'the next launch in Telegram opens the email’s account');

  // ── a Kon 1×1 between the two Telegram phones: fullscreen, orientation, safe areas, minimise ──
  await TA2.page.getByTestId('menu-kon').click();
  await TA2.page.getByTestId('kon').waitFor({ timeout: 20000 });
  await TA2.page.getByTestId('kon-format-1x1').click();
  await TA2.page.getByTestId('kon-create').click();
  await TA2.page.getByTestId('lobby-kon').waitFor({ timeout: 20000 });
  const roomCode = (await TA2.page.locator('.lobby__invite .code').innerText()).trim();
  await boot(TB2.page, `${base}/?invite=${roomCode}`);
  await TB2.page.getByTestId('lobby-kon').waitFor({ timeout: 60000 });
  await TA2.page.waitForFunction(() => document.querySelectorAll('.teamcol .player:not(.player--free)').length === 2, null, { timeout: 20000 });
  await TA2.page.getByTestId('lobby-start').click();
  await TA2.page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 30000 });
  await TB2.page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 30000 });
  await TA2.page.waitForTimeout(600);
  const callsA = await tgCalls(TA2.page);
  const callsB = await tgCalls(TB2.page);
  check(callsA.includes('requestFullscreen') && callsA.includes('lockOrientation:landscape') && callsA.includes('closingOn'), `held sideways: fullscreen, the landscape lock, the closing confirmation (${callsA.filter((c) => !/ready|expand|noSwipes/.test(c)).join(', ')})`);
  check(callsB.includes('requestFullscreen') && !callsB.some((c) => c.startsWith('lockOrientation')), 'held upright: fullscreen, but no lock — an upright lock would keep the game upright');
  await TB2.page.setViewportSize({ width: 844, height: 390 });
  await TB2.page.waitForFunction(() => window.__tgCalls.includes('lockOrientation:landscape'), null, { timeout: 5000 }).catch(() => {});
  check((await tgCalls(TB2.page)).includes('lockOrientation:landscape'), 'turned sideways: now the landscape lock');
  // the safe areas reach the HUD: Telegram's buttons over the top, the phone's edges at the sides
  const hud = await TA2.page.evaluate(() => {
    const h = window.__blatkom.game.scene.getScene('hud');
    const k = h.scale.displayScale.x;
    const css = getComputedStyle(document.documentElement);
    const fire = h.buttons[0];
    return { inset: h.inset, k, tgTop: css.getPropertyValue('--tg-top').trim(), tgLeft: css.getPropertyValue('--tg-left').trim(), mmY: h.mm.y, fireX: fire?.x ?? null, W: h.scale.width };
  });
  check(hud.tgTop === '36px' && hud.tgLeft === '28px' && hud.inset.top === Math.round(36 * hud.k) && hud.inset.left === Math.round(28 * hud.k), `the safe areas reach the page and the HUD (${JSON.stringify(hud.inset)}, ×${hud.k.toFixed(2)})`);
  check(hud.mmY >= 14 + hud.inset.top && hud.fireX !== null && hud.fireX <= hud.W - hud.inset.right - 88 + 0.5, `the minimap clears Telegram’s buttons (y ${hud.mmY}), the fire button clears the edge (x ${hud.fireX} of ${hud.W})`);
  // the pushed-down top leaves less room: the buttons stay apart and under the minimap with its status line
  const geo = await TA2.page.evaluate(() => {
    const h = window.__blatkom.game.scene.getScene('hud');
    const bs = h.buttons.filter((b) => b.visible);
    const overlaps = [];
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (Math.hypot(bs[i].x - bs[j].x, bs[i].y - bs[j].y) < bs[i].r + bs[j].r) overlaps.push(`${i}-${j}`);
    const mmBottom = h.mm.y + h.mmH + 4 + 22;
    const clear = bs.every((b) => b.y - b.r >= mmBottom - 0.5 || b.x + b.r <= h.mm.x);
    const inside = bs.every((b) => b.y + b.r <= h.scale.height - h.inset.bottom + 0.5 && b.x + b.r <= h.scale.width - h.inset.right + 0.5);
    return { overlaps, clear, inside, squeeze: +h.btnScaleY.toFixed(2) };
  });
  check(geo.overlaps.length === 0 && geo.clear && geo.inside, `the touch buttons keep apart, under the minimap and inside the safe area (${JSON.stringify(geo)})`);
  await TA2.page.screenshot({ path: `${outDir}/tg_match_landscape_insets.png` });
  // minimised with a socket that died quietly, then back
  const roomBefore = await TA2.page.evaluate(() => window.__blatkom.app.online.currentRoomId());
  const n0 = await TA2.page.evaluate(() => {
    const s = window.__sockets.filter((w) => /\/ws$/.test(w.url) && w.readyState === 1).pop();
    s.onmessage = () => {}; // from now on nothing arrives: dead, though it looks open
    const h = window.__blatkom.game.scene.getScene('hud');
    Object.assign(h.sticks[0], { id: 77, x: 0.9, y: 0 }); // a finger on the move stick
    window.__tgFire('deactivated');
    return window.__sockets.length;
  });
  await TA2.page.waitForTimeout(3500);
  const away = await TA2.page.evaluate(() => {
    const h = window.__blatkom.game.scene.getScene('hud');
    return { sockets: window.__sockets.length, music: window.__blatkom.music.hidden, stick: h.sticks[0].id === null && h.sticks[0].x === 0 };
  });
  check(away.sockets === n0 && away.music && away.stick, `minimised: the music stops, the held stick is let go, nothing reconnects meanwhile (${JSON.stringify(away)})`);
  const t0 = Date.now();
  await TA2.page.evaluate(() => window.__tgFire('activated'));
  const back = await TA2.page
    .waitForFunction((n) => window.__sockets.length > n && window.__blatkom.game.scene.getScene('game')?.session?.status === 'online', n0, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  const ms = Date.now() - t0;
  const after = await TA2.page.evaluate(() => ({ room: window.__blatkom.app.online.currentRoomId(), status: window.__blatkom.game.scene.getScene('game')?.session?.status, music: window.__blatkom.music.hidden }));
  check(back && ms < 4000 && after.room === roomBefore, `back in the app: a new line in ${ms} ms, the same room (${after.room}), «${after.status}»`);
  await TA2.page.waitForTimeout(1500);
  const moving = await TA2.page.evaluate(() => window.__blatkom.game.scene.getScene('game')?.session?.status);
  check(moving === 'online', `the match goes on online after the return (${moving})`);
  // the match ends by its timer: the orientation is let go when the player leaves for the menu
  await TA2.page.getByTestId('kon-line').waitFor({ timeout: 90000 });
  check(/Tournament rating|Рейтинг турнира/.test(await TA2.page.getByTestId('kon-line').innerText()), 'the tournament match finishes normally after the return');
  await TA2.page.screenshot({ path: `${outDir}/tg_results.png` });
  await TA2.page.getByRole('button', { name: 'To menu' }).click();
  await TA2.page.getByTestId('menu-nick').waitFor({ timeout: 30000 });
  const end = await tgCalls(TA2.page);
  check(end.includes('unlockOrientation') && end.includes('closingOff'), 'after the match the orientation is free again and closing needs no confirmation');
  check(problems.length === 0, `no page errors (${problems.join(' | ')})`);
  for (const c of [TA2, TB2]) await c.ctx.close();
} catch (e) {
  console.error('[telegram] failed:', e);
  checks.push({ ok: false, what: `exception: ${e.message}` });
  for (const [name, page] of pages) await page.screenshot({ path: `${outDir}/failed_${name.replace(/\W+/g, '_')}.png` }).catch(() => {});
} finally {
  await browser.close();
  await sql.end({ timeout: 5 });
}
for (const p of problems) console.log('!', p);
const bad = checks.filter((c) => !c.ok);
console.log(bad.length ? `[telegram] ${bad.length} of ${checks.length} checks failed` : `[telegram] all ${checks.length} checks passed`);
process.exit(bad.length ? 1 : 0);
