// v0.2.17 end-to-end — the owner's last edits before the release. A: English, desktop; B: Russian, phone.
//
//  • the menu: the BLAT DROP banner under the Dossier and the Arsenal counts down live to the owner's
//    date (8 February 2027, 23:00 in Cyprus) by the server's clock and opens BLAT DROP; «Drop on Solana»;
//    the X and Telegram buttons in the corner; the Dossier shows the $BLAT;
//  • BLAT DROP: the Solana line, Play-to-Earn and the year's plans, the tokenomics (2 000 000 000 by
//    pools), the project's wallet with «Copy» (the clipboard gets the address); on the phone three tabs
//    and nothing to scroll; the $BLAT tab has the second banner under «For levels»;
//  • the founder (with an admin login): «Make founder» → the gold badge, 320 000 000 $BLAT in the Dossier,
//    the ★ in the corner leads to /admin;
//  • the $BLAT Tournament with a stake: two accounts older than a day (made so in the database), A picks
//    100 and creates a 1×1 room (confirming the stake), B comes through the invitation and confirms it too;
//    A starts, B leaves — A wins the pool: the results say +100, the balances moved by exactly the pool,
//    the history shows it;
//  • the story: a caption page sits in the middle of the screen; Arkadich speaks Arkadia's line on his
//    card with the building site behind him;
//  • after a match, the letters W, A, S, D (and the others the game uses) type into a gang's name.
//
// Usage: DATABASE_URL=… node tests/e2e/v0217.mjs <baseUrl> <outDir> [adminUser] [adminPass]
import { chromium } from 'playwright';
import postgres from 'postgres';
import { mkdirSync } from 'node:fs';

const [base, outDir, adminUser, adminPass] = process.argv.slice(2);
if (!base || !outDir || !process.env.DATABASE_URL) {
  console.error('usage: DATABASE_URL=… node tests/e2e/v0217.mjs <baseUrl> <outDir> [adminUser] [adminPass]');
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
const WALLET = '7ktcRxxhp9gijH4Pbbr4HBckP8HocFN8YzngvTqBArJ1';
const DROP_AT = Date.parse('2027-02-08T21:00:00.000Z');

async function player(name, lang, viewport) {
  const phone = viewport.width < 600;
  const ctx = await browser.newContext({ viewport, locale: lang === 'ru' ? 'ru-RU' : 'en-GB', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem('blatkom89.lang.v1', l);
      localStorage.setItem('blatkom89.tutorial.v1', '1');
      localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
    } catch {}
    window.__toasts = [];
    const watch = () =>
      new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('toast')) window.__toasts.push(n.textContent);
      }).observe(document.documentElement, { childList: true, subtree: true });
    if (document.documentElement) watch();
    else document.addEventListener('DOMContentLoaded', watch);
  }, lang);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${name} pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org|WebSocket/.test(m.text())) problems.push(`[${name} console] ${m.text()}`);
  });
  await page.goto(base + '/');
  await page.waitForFunction(() => {
    const boot = document.getElementById('boot');
    return !boot || boot.classList.contains('boot--hidden') || !!document.querySelector('[data-testid=boot-play]');
  }, null, { timeout: 90000 });
  if (await page.getByTestId('boot-play').count()) await page.getByTestId('boot-play').click();
  const nick = page.getByRole('textbox', { name: lang === 'ru' ? 'Кличка' : 'Alias' });
  await nick.waitFor({ timeout: 60000 });
  await nick.fill(`${name} ${RUN}`);
  await page.getByRole('button', { name: lang === 'ru' ? 'Готово' : 'Done' }).click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  const me = await page.evaluate(() => fetch('/api/me', { headers: { authorization: `Bearer ${localStorage.getItem('blatkom89.token')}` } }).then((r) => r.json()));
  return { name, ctx, page, id: me.id, phone };
}
const toMenu = async (page) => {
  await page.goto(base + '/');
  await page.getByTestId('menu-nick').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => {
    const boot = document.getElementById('boot');
    return !boot || boot.classList.contains('boot--hidden');
  }, null, { timeout: 60000 });
};
const fits = (page) =>
  page.evaluate(() => ({
    v: Math.max(document.scrollingElement.scrollHeight - innerHeight, ...[...document.querySelectorAll('.screen')].map((e) => e.scrollHeight - e.clientHeight)),
    h: document.scrollingElement.scrollWidth - innerWidth,
  }));
const left = (s) => s.split(':').map(Number);
const balance = async (id) => (await sql`SELECT blat FROM profiles WHERE user_id = ${id}`)[0].blat;

try {
  const A = await player('Dropper', 'en', { width: 1440, height: 900 });
  const B = await player('Dropych', 'ru', { width: 390, height: 844 });

  // ── the menu ────────────────────────────────────────────────────────────
  for (const P of [A, B]) {
    const banner = P.page.getByTestId('drop-banner-menu');
    await banner.waitFor({ timeout: 20000 });
    await P.page.waitForFunction(() => document.querySelector('[data-testid=drop-banner-menu]')?.dataset.left, null, { timeout: 20000 });
    const t1 = await banner.getAttribute('data-left');
    await P.page.waitForTimeout(2100);
    const t2 = await banner.getAttribute('data-left');
    const [d, h] = left(t1);
    const days = Math.floor((DROP_AT - Date.now()) / 86_400_000);
    check(Math.abs(d - days) <= 1 && h >= 0 && h < 24 && t1 !== t2, `${P.name}: the menu's banner counts down to 8 February 2027 (${t1} → ${t2}, ≈${days} days)`);
    const fit = await fits(P.page);
    check(fit.v <= 0 && fit.h <= 0, `${P.name}: the menu with the banner fits the screen (${JSON.stringify(fit)})`);
  }
  check(/Drop on Solana/i.test(await A.page.getByTestId('drop-banner-menu').innerText()), 'the banner says «Drop on Solana»');
  const corner = await A.page.evaluate(() => ({ x: !!document.querySelector('[data-testid=corner-x]'), tg: !!document.querySelector('[data-testid=corner-telegram]'), hq: !!document.querySelector('[data-testid=corner-hq]') }));
  check(corner.x && corner.tg && !corner.hq, `the corner: X and Telegram, no ★ for a player (${JSON.stringify(corner)})`);
  await A.page.getByTestId('corner-x').click();
  await A.page.waitForFunction(() => window.__toasts.some((t) => /X/.test(t)), null, { timeout: 5000 }).catch(() => {});
  check(await A.page.evaluate(() => window.__toasts.some((t) => /Our X/.test(t))), 'X: «coming soon» while the server has no link');
  check(/300/.test(await A.page.getByTestId('dossier-blat').innerText()), `the Dossier shows the $BLAT («${(await A.page.getByTestId('dossier-blat').innerText()).trim()}»)`);
  await A.page.screenshot({ path: `${outDir}/menu_A.png` });
  await B.page.screenshot({ path: `${outDir}/menu_B_phone.png` });

  // ── BLAT DROP ───────────────────────────────────────────────────────────
  await A.page.getByTestId('drop-banner-menu').click();
  await A.page.getByTestId('blat-drop').waitFor({ timeout: 20000 });
  check(/solana/i.test(await A.page.getByTestId('drop-solana').innerText()), 'BLAT DROP: the drop is planned in the Solana network');
  const plans = (await A.page.getByTestId('drop-plans').innerText()).replace(/\s+/g, ' ');
  check(/Play-to-Earn/i.test(plans) && /Invite friends/.test(plans) && /\$BLAT Tournament/.test(plans) && /2027/.test(plans) && /plans, not promises/.test(plans), 'BLAT DROP: Play-to-Earn, how to earn, the year’s plans (plans, not promises)');
  const tok = (await A.page.getByTestId('drop-tokenomics').innerText()).replace(/\s+/g, ' ');
  check(/2,000,000,000/.test(tok) && /63%/.test(tok) && /16%/.test(tok) && /15%/.test(tok) && /5%/.test(tok) && /1%/.test(tok), 'the tokenomics: 2 000 000 000, players 63 / founder 16 / influencers 15 / friends 5 / reserve 1 %');
  check((await A.page.getByTestId('drop-wallet-address').innerText()).trim() === WALLET, 'the project’s wallet address');
  const walletText = (await A.page.getByTestId('drop-wallet').innerText()).replace(/\s+/g, ' ');
  check(/solana/i.test(walletText) && /phantom/i.test(walletText) && !/presale|pre-order|не начисляют/i.test(walletText), `the wallet: the Solana and Phantom logos, no caption («${walletText}»)`);
  await A.page.getByTestId('drop-wallet-copy').click();
  await A.page.waitForTimeout(400);
  check((await A.page.evaluate(() => navigator.clipboard.readText())) === WALLET, '«Copy» puts the address on the clipboard');
  const aFit = await fits(A.page);
  check(aFit.v <= 0 && aFit.h <= 0, `A’s BLAT DROP: three columns, nothing to scroll (${JSON.stringify(aFit)})`);
  await A.page.screenshot({ path: `${outDir}/drop_A.png` });
  await B.page.getByTestId('drop-banner-menu').click();
  await B.page.getByTestId('blat-drop').waitFor({ timeout: 20000 });
  const tabs = [];
  for (const pane of ['count', 'plans', 'tokens']) {
    await B.page.getByTestId(`drop-pane-${pane}`).click();
    await B.page.waitForTimeout(200);
    const vis = await B.page.evaluate(() => ['blat-drop', 'drop-plans', 'drop-tokenomics'].map((id) => getComputedStyle(document.querySelector(`[data-testid=${id}]`)).display !== 'none'));
    const fit = await fits(B.page);
    tabs.push({ pane, vis, fit });
    await B.page.screenshot({ path: `${outDir}/drop_B_phone_${pane}.png` });
  }
  check(tabs.every((t, i) => t.vis.filter(Boolean).length === 1 && t.vis[i] && t.fit.v <= 0 && t.fit.h <= 0), `B’s phone: one pane at a time, nothing to scroll (${JSON.stringify(tabs)})`);
  // the $BLAT tab: the second banner under «For levels»
  await B.page.getByTestId('blat-tab-balance').click();
  await B.page.getByTestId('drop-banner-section').waitFor({ timeout: 20000 });
  check(true, 'the $BLAT tab has the BLAT DROP banner');
  await B.page.getByTestId('drop-banner-section').click();
  await B.page.getByTestId('blat-drop').waitFor({ timeout: 20000 });
  check(true, 'the $BLAT tab’s banner opens BLAT DROP');

  // ── the founder ─────────────────────────────────────────────────────────
  let founder = false;
  if (adminUser) {
    const login = await A.page.request.post(`${base}/api/admin/login`, { data: { username: adminUser, password: adminPass ?? '' } });
    const body = await login.json();
    const r = await A.page.request.post(`${base}/api/admin/players/${A.id}/founder`, { headers: { 'x-csrf-token': body.csrfToken } });
    check(r.ok(), `the administrator made A the founder (${r.status()})`);
    const res = r.ok() ? await r.json() : {};
    check(res.level === 87 && res.blat === 320_000_000, `level 87, 320 000 000 $BLAT (${JSON.stringify(res)})`);
    await toMenu(A.page);
    const nick = await A.page.getByTestId('menu-nick').innerText();
    check((await A.page.getByTestId('menu-nick').getByTestId('founder-tag').count()) === 1, `the gold badge by A’s alias («${nick.replace(/\s+/g, ' ')}»)`);
    check(/320,000,000/.test(await A.page.getByTestId('dossier-blat').innerText()), 'the Dossier: 320,000,000 $BLAT');
    const hq = A.page.getByTestId('corner-hq');
    await hq.waitFor({ timeout: 15000 }).catch(() => {});
    check((await hq.count()) === 1 && (await hq.getAttribute('href')) === '/admin', 'the ★ in the corner leads to /admin');
    await A.page.screenshot({ path: `${outDir}/founder_menu_A.png` });
    founder = true;
  } else {
    await sql`UPDATE profiles SET blat = blat + 1000 WHERE user_id = ${A.id}`;
    check(true, 'no admin login: A gets 1 000 $BLAT in the database instead of the founder’s share');
  }

  // ── the $BLAT Tournament with a stake ───────────────────────────────────
  await sql`UPDATE users SET created_at = now() - interval '2 days' WHERE id IN ${sql([A.id, B.id])}`;
  await sql`UPDATE profiles SET blat = 500 WHERE user_id = ${B.id}`;
  await toMenu(A.page);
  const a0 = await balance(A.id);
  const b0 = await balance(B.id);
  await A.page.getByTestId('menu-kon').click();
  await A.page.getByTestId('kon').waitFor({ timeout: 20000 });
  await A.page.getByTestId('kon-format-1x1').click();
  await A.page.getByTestId('kon-stake-100').click();
  check(/today you can still stake 20,000/.test(await A.page.getByTestId('kon-stake-note').innerText()), `A may stake (${(await A.page.getByTestId('kon-stake-note').innerText()).trim()})`);
  await A.page.screenshot({ path: `${outDir}/kon_stake_A.png`, fullPage: true });
  await A.page.getByTestId('kon-create').click();
  await A.page.getByTestId('stake-confirm').waitFor({ timeout: 10000 });
  const rules = (await A.page.getByTestId('stake-confirm').innerText()).replace(/\s+/g, ' ');
  check(/pool 200/.test(rules) && /draw/i.test(rules) && /stays in the pool/.test(rules), `A confirms the stake: the pool and the rules («${rules.slice(0, 160)}…»)`);
  await A.page.getByTestId('stake-yes').click();
  await A.page.getByTestId('lobby-stake').waitFor({ timeout: 20000 });
  check(/Stake 100 \$BLAT each/.test(await A.page.getByTestId('lobby-stake').innerText()), `A’s lobby: «${(await A.page.getByTestId('lobby-stake').innerText()).replace(/\s+/g, ' ')}»`);
  const link = (await A.page.locator('.lobby__link').innerText()).trim();
  await B.page.goto(link);
  await B.page.getByTestId('stake-confirm').waitFor({ timeout: 60000 });
  check(/100/.test(await B.page.getByTestId('stake-confirm').innerText()), 'B, through the invitation, is asked to confirm the stake of 100');
  await B.page.screenshot({ path: `${outDir}/kon_stake_confirm_B_phone.png` });
  await B.page.getByTestId('stake-yes').click();
  await B.page.getByTestId('lobby-stake').waitFor({ timeout: 30000 });
  check(/Ставка 100 \$BLAT с каждого/.test(await B.page.getByTestId('lobby-stake').innerText()), 'B’s lobby (Russian): «Ставка 100 $BLAT с каждого»');
  await A.page.waitForFunction(() => document.querySelectorAll('.teamcol .player:not(.player--free)').length === 2, null, { timeout: 15000 });
  await A.page.screenshot({ path: `${outDir}/kon_stake_lobby_A.png` });
  await A.page.getByTestId('lobby-start').click();
  await A.page.waitForFunction(() => !document.querySelector('[data-testid=lobby-kon]'), null, { timeout: 30000 });
  const reserved = await sql`SELECT user_id, delta FROM currency_ledger WHERE currency = 'blat' AND reason = 'stake' AND user_id IN ${sql([A.id, B.id])} ORDER BY id DESC LIMIT 2`;
  check(reserved.length === 2 && reserved.every((r) => r.delta === -100), `both stakes are taken at the start (${JSON.stringify(reserved.map((r) => r.delta))})`);
  await A.page.waitForTimeout(4000);
  await B.ctx.close();
  await A.page.getByTestId('stake-line').waitFor({ timeout: 90000 });
  const sline = (await A.page.getByTestId('stake-line').innerText()).replace(/\s+/g, ' ');
  check(/\+100/.test(sline) && /share of the pool \(200\)/.test(sline), `A’s results: «${sline}»`);
  await A.page.screenshot({ path: `${outDir}/kon_stake_results_A.png` });
  const a1 = await balance(A.id);
  const b1 = await balance(B.id);
  check(a1 - a0 === 100 && b0 - b1 === 100, `the balances moved by exactly the pool: A ${a0} → ${a1}, B ${b0} → ${b1}`);
  await A.page.getByRole('button', { name: 'To menu' }).click();
  await A.page.getByTestId('menu-nick').waitFor({ timeout: 30000 });
  await A.page.getByTestId('menu-kon').click();
  await A.page.getByTestId('kon-history').waitFor({ timeout: 20000 });
  const hist = (await A.page.locator('.konhist__row').first().innerText()).replace(/\s+/g, ' ');
  check(/\+100 \$BLAT/.test(hist) && /win/.test(hist), `A’s tournament history: «${hist}»`);

  // ── the story: the caption in the middle, Arkadich on his building site ──
  await toMenu(A.page);
  await A.page.getByTestId('menu-story').click();
  await A.page.waitForFunction(() => !!document.querySelector('[data-testid=comic]') || !!document.querySelector('[data-testid=story-prologue]'), null, { timeout: 20000 });
  if (!(await A.page.getByTestId('comic').count())) await A.page.getByTestId('story-prologue').click();
  await A.page.getByTestId('comic').waitFor({ timeout: 20000 });
  await A.page.waitForTimeout(700);
  const cap = await A.page.evaluate(() => {
    const r = document.querySelector('.comic__caption').getBoundingClientRect();
    return { dx: Math.round(r.left + r.width / 2 - innerWidth / 2), dy: Math.round(r.top + r.height / 2 - innerHeight / 2), w: Math.round(r.width) };
  });
  check(Math.abs(cap.dx) <= 30 && Math.abs(cap.dy) <= 60 && cap.w >= 500, `a caption page sits in the middle, big (${JSON.stringify(cap)})`);
  await A.page.screenshot({ path: `${outDir}/story_caption_A.png` });
  let arkady = null;
  for (let i = 0; i < 9 && !arkady; i++) {
    await A.page.keyboard.press('ArrowRight');
    await A.page.waitForTimeout(250);
    arkady = await A.page.evaluate(() => {
      const p = document.querySelector('[data-testid=comic-panel][data-who=arkady]');
      return p ? { art: p.querySelector('.comic__art')?.getAttribute('src') ?? '', text: p.textContent } : null;
    });
  }
  check(arkady && /arkady_stroyka/.test(arkady.art) && /Arkadia Development/.test(arkady.text), `Arkadich speaks Arkadia’s line on his building-site card (${JSON.stringify(arkady)})`);
  await A.page.waitForTimeout(800);
  await A.page.screenshot({ path: `${outDir}/story_arkady_A.png` });
  await A.page.keyboard.press('Escape');

  // ── the keys after a match ──────────────────────────────────────────────
  await toMenu(A.page);
  await A.page.locator('.menu__play .btn', { hasText: 'Practice' }).first().click();
  await A.page.getByRole('button', { name: '1', exact: true }).click();
  await A.page.getByTestId('practice-start').click();
  await A.page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 60000 });
  await A.page.keyboard.down('KeyW');
  await A.page.waitForTimeout(400);
  await A.page.keyboard.up('KeyW');
  await A.page.keyboard.press('Escape');
  await A.page.getByRole('button', { name: 'Back to menu' }).click();
  await A.page.getByTestId('menu-nick').waitFor({ timeout: 30000 });
  await A.page.getByTestId('menu-clubs').click();
  await A.page.getByTestId('club-found').click();
  await A.page.getByTestId('club-editor').waitFor({ timeout: 10000 });
  await A.page.getByTestId('club-name').click();
  await A.page.keyboard.type('WASD wasd RQEG');
  const typed = await A.page.getByTestId('club-name').inputValue();
  check(typed === 'WASD wasd RQEG', `after a match the game’s keys type into a gang’s name («${typed}»)`);

  check(problems.length === 0, `no page errors (${problems.join(' | ')})`);
  await A.ctx.close();
} catch (e) {
  check(false, `v0.2.17 flow: ${e.message}`);
} finally {
  await browser.close();
  await sql.end({ timeout: 5 });
}
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `[v0217] ${failed.length} of ${checks.length} checks failed` : `[v0217] all ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
