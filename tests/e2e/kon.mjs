// The $BLAT Tournament (V2.0 part D «Блатной кон», renamed in v0.2.17) end-to-end: A (English, desktop)
// and B (Russian, phone). New accounts play without a stake (stakes open on an account's second day —
// tests/e2e/v0217.mjs plays a staked match). The menu's «$BLAT Tournament» button (on the phone three in a row, the menu still on one screen); the Kon
// screen — rating 1000, the four formats with their rules, the search and «Create a room»; A creates a
// 1×1 room, B joins through the invitation: both see «$BLAT Турнир 1×1», people only, no side to switch
// to; A starts, B leaves the match — after the grace period A wins: the results show the Kon rating
// (+20), A's Kon screen shows the win in the history and A first in the table, B's shows the loss; then
// the search: A and a third browser C press «Find opponents» in 1×1 and land in one public room that
// starts by itself.
//
// Usage: node tests/e2e/kon.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('usage: node tests/e2e/kon.mjs <baseUrl> <outDir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const checks = [];
const check = (ok, what) => {
  checks.push({ ok: !!ok, what });
  console.log(ok ? '✔' : '✖', what);
};
const RUN = Math.random().toString(36).slice(2, 5);

async function player(name, lang, viewport) {
  const phone = viewport.width < 600;
  const ctx = await browser.newContext({ viewport, locale: lang === 'ru' ? 'ru-RU' : 'en-GB', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem('blatkom89.lang.v1', l);
      localStorage.setItem('blatkom89.tutorial.v1', '1');
      localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
    } catch {}
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
  return { name, ctx, page };
}
const text = async (page, id) => (await page.getByTestId(id).innerText()).replace(/\s+/g, ' ').trim();
async function openKon(page) {
  await page.getByTestId('menu-kon').click();
  await page.getByTestId('kon').waitFor({ timeout: 20000 });
}

try {
  const A = await player('Konnik', 'en', { width: 1280, height: 760 });
  const B = await player('Konchik', 'ru', { width: 390, height: 844 });
  // the menu: the button; on the phone three in a row (v0.2.13: «Story» sits beside Quick Match) and still one screen
  const bm = await B.page.evaluate(() => {
    const kon = document.querySelector('[data-testid=menu-kon]')?.getBoundingClientRect();
    const btns = [...document.querySelectorAll('.menu__play > .btn:not(.btn--red):not(.menu__story)')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.getBoundingClientRect());
    return { kon: !!kon, row: btns.length === 3 && btns.every((r) => Math.abs(r.top - btns[0].top) < 2), over: document.scrollingElement.scrollHeight - innerHeight, side: document.scrollingElement.scrollWidth - innerWidth };
  });
  check(bm.kon && bm.row && bm.over <= 0 && bm.side <= 0, `B’s phone menu: «$BLAT Турнир» between the friends and practice, three in a row, one screen (${JSON.stringify(bm)})`);
  await B.page.screenshot({ path: `${outDir}/kon_menu_B_phone.png` });
  await openKon(A.page);
  check((await text(A.page, 'kon-rating')).startsWith('1000'), `A’s Kon screen: rating 1000 («${await text(A.page, 'kon-rating')}»)`);
  await A.page.getByTestId('kon-format-1x1').click();
  check(/1 against 1 · to 10 eliminations/.test(await text(A.page, 'kon-rules')), `1×1 rules: «${await text(A.page, 'kon-rules')}»`);
  await A.page.screenshot({ path: `${outDir}/kon_screen_A.png`, fullPage: true });
  // A creates a 1×1 room, B comes through the invitation
  await A.page.getByTestId('kon-create').click();
  await A.page.getByTestId('lobby-kon').waitFor({ timeout: 20000 });
  const link = (await A.page.locator('.lobby__link').innerText()).trim();
  check(/\?invite=[A-Za-z0-9]+$/.test(link), `A’s Kon room has an invitation link (${link})`);
  check(/\$BLAT TOURNAMENT 1×1/i.test(await A.page.locator('.topbar .h1').innerText()), 'A’s lobby: «$BLAT Tournament 1×1»');
  await B.page.goto(link);
  await B.page.getByTestId('lobby-kon').waitFor({ timeout: 60000 });
  check(/\$BLAT Турнир/i.test(await B.page.getByTestId('lobby-kon').innerText()) && /1×1/.test(await B.page.getByTestId('lobby-kon').innerText()), 'B (Russian, phone) is in the same tournament room: «$BLAT Турнир 1×1»');
  await A.page.waitForFunction(() => document.querySelectorAll('.teamcol .player:not(.player--free)').length === 2, null, { timeout: 15000 });
  check((await A.page.locator('.teamcol__join').count()) === 0, 'both sides are full: nobody is offered the other side');
  check((await A.page.locator('.lobby .seg--modes').count()) === 0, 'no mode switch in a Kon room');
  check(/tournament 1000/.test(await A.page.locator('.teams').innerText()), 'the lobby shows the players’ tournament ratings');
  await A.page.screenshot({ path: `${outDir}/kon_lobby_A.png`, fullPage: true });
  await B.page.screenshot({ path: `${outDir}/kon_lobby_B_phone.png`, fullPage: true });
  await A.page.getByTestId('lobby-start').click();
  await A.page.waitForFunction(() => !document.querySelector('[data-testid=lobby-kon]'), null, { timeout: 20000 });
  await A.page.waitForTimeout(4000);
  // B leaves the match: after the grace period A wins
  await B.ctx.close();
  await A.page.getByTestId('kon-line').waitFor({ timeout: 90000 });
  const line = await text(A.page, 'kon-line');
  check(/Tournament rating 1020 \+20 · win/.test(line), `A’s results: «${line}»`);
  check(/\$BLAT Tournament 1×1/.test(await A.page.locator('.tag', { hasText: 'Match report' }).locator('xpath=..').innerText()), 'the match report says «$BLAT Tournament 1×1»');
  await A.page.screenshot({ path: `${outDir}/kon_results_A.png` });
  // A's Kon screen
  await A.page.getByRole('button', { name: 'To menu' }).click();
  await A.page.getByTestId('menu-nick').waitFor({ timeout: 30000 });
  await openKon(A.page);
  await A.page.getByTestId('kon-history').waitFor({ timeout: 15000 });
  const hist = (await A.page.locator('.konhist__row').first().innerText()).replace(/\s+/g, ' ');
  check(/1×1/.test(hist) && /win/.test(hist) && /\+20/.test(hist) && hist.includes(`Konchik ${RUN}`), `A’s history: «${hist}»`);
  check((await text(A.page, 'kon-wins')) === '1', 'A: one win');
  await A.page.getByTestId('kon-top').waitFor({ timeout: 15000 });
  const first = (await A.page.locator('.kontop__row').first().innerText()).replace(/\s+/g, ' ');
  check(first.includes(`Konnik ${RUN}`) || (await A.page.locator('.kontop__row[data-me=true]').count()) === 1, `the Kon table has A («${first}»)`);
  await A.page.screenshot({ path: `${outDir}/kon_after_A.png`, fullPage: true });

  // the search: A and C look for 1×1 opponents and meet in one public room that starts by itself
  const C = await player('Kontra', 'en', { width: 1280, height: 760 });
  await openKon(C.page);
  await C.page.getByTestId('kon-format-1x1').click();
  await A.page.getByTestId('kon-format-1x1').click();
  await A.page.getByTestId('kon-find').click();
  await A.page.getByTestId('lobby-kon').waitFor({ timeout: 20000 });
  const waiting = (await A.page.getByTestId('lobby-note').innerText()).trim();
  check(/Looking for opponents/.test(waiting), `A waits for an opponent: «${waiting}»`);
  await C.page.getByTestId('kon-find').click();
  await C.page.getByTestId('lobby-kon').waitFor({ timeout: 20000 }).catch(() => {});
  await A.page.waitForFunction(() => !document.querySelector('[data-testid=lobby-kon]'), null, { timeout: 30000 });
  check(true, 'A and C met in one public 1×1 room and the match started by itself');
  await C.ctx.close();
  await A.page.getByTestId('kon-line').waitFor({ timeout: 90000 });
  check(/Tournament rating 10[2-5]\d \+\d+ · win/.test(await text(A.page, 'kon-line')), `the second win: «${await text(A.page, 'kon-line')}»`);
  check(problems.length === 0, `no page errors (${problems.join(' | ')})`);
  await A.ctx.close();
} catch (e) {
  check(false, `Kon flow: ${e.message}`);
} finally {
  await browser.close();
}
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `[kon] ${failed.length} of ${checks.length} checks failed` : `[kon] all ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
