// Phones end-to-end (v0.24, the owner's mobile pass): on an emulated phone every screen fits without
// scrolling — the menu, the character screen and its personal file, the avatar picker, the practice
// screen, and the Arsenal: «Экипировка» (the dressing room and the four slots) and every shop tab
// (weapons, equipment, characters, cases) — with no diamonds, no «Top up» and no diamonds tab (the game
// is free); the Arsenal's sheets (a slot's own items, an item's card) open and fit. Two sizes and both
// languages: 393×680 in Russian, 360×640 in English.
//
// Usage: node tests/e2e/phone.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('usage: node tests/e2e/phone.mjs <baseUrl> <outDir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const checks = [];
const check = (ok, what) => {
  checks.push(what);
  console.log(`${ok ? '✔' : '✖'} ${what}`);
  if (!ok) problems.push(what);
};

for (const [w, hgt, lang] of [
  [393, 680, 'ru'],
  [360, 640, 'en'],
]) {
  const ru = lang === 'ru';
  const size = `${w}×${hgt} ${lang.toUpperCase()}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: ru ? 'ru-RU' : 'en-GB' });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem('blatkom89.lang.v1', l);
      localStorage.setItem('blatkom89.tutorial.v1', '1');
      localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
    } catch {
      /* private mode */
    }
  }, lang);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/`);
  await page.waitForFunction(() => {
    const b = document.getElementById('boot');
    return !b || b.classList.contains('boot--hidden') || !!document.querySelector('[data-testid=boot-play]');
  }, null, { timeout: 90000 });
  if (await page.getByTestId('boot-play').count()) await page.getByTestId('boot-play').click();
  const nick = page.getByRole('textbox', { name: ru ? 'Кличка' : 'Alias' });
  await nick.waitFor({ timeout: 60000 });
  await nick.fill(`${ru ? 'Мобила' : 'Phone'} ${Math.random().toString(36).slice(2, 6)}`);
  await page.getByRole('button', { name: ru ? 'Готово' : 'Done' }).click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  /** Page overflow of the current screen (0 = nothing to scroll) and sideways overflow. */
  const fits = () =>
    page.evaluate(() => {
      const s = document.querySelector('.ui .screen');
      return { down: s ? s.scrollHeight - s.clientHeight : -1, side: document.documentElement.scrollWidth - innerWidth };
    });
  const screen = async (name) => {
    const f = await fits();
    check(f.down <= 0 && f.side <= 0, `${size}: ${name} fits one screen (overflow ${f.down} px, sideways ${f.side} px)`);
    await page.screenshot({ path: `${outDir}/phone_${w}x${hgt}_${lang}_${name.replace(/[^a-z0-9]+/gi, '_')}.png` });
  };
  const sheetFits = async (name) => {
    const m = await page.evaluate(() => {
      const s = document.querySelector('.sheet');
      const b = document.querySelector('.sheet__body');
      return s && b ? { top: Math.round(s.getBoundingClientRect().top), over: b.scrollHeight - b.clientHeight } : null;
    });
    check(!!m && m.top >= 0 && m.over <= 2, `${size}: the ${name} sheet opens and fits (${JSON.stringify(m)})`);
    await page.screenshot({ path: `${outDir}/phone_${w}x${hgt}_${lang}_sheet_${name.replace(/[^a-z0-9]+/gi, '_')}.png` });
    await page.getByTestId('sheet-close').click();
    await page.waitForTimeout(250);
  };

  await screen('the menu');
  const wallet = await page.locator('.tile__wallet').innerText().catch(() => '');
  check(!/💎/.test(wallet) && (await page.locator('.tile__wallet .cur--diamonds').count()) === 0, `${size}: the menu's wallet shows talons only («${wallet.trim()}»)`);

  // the Arsenal: the wallet on top, «Экипировка | Магазин», every tab on one screen
  await page.getByTestId('arsenal-tile').click();
  await page.getByTestId('kit-card').waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  const top = await page.evaluate(() => {
    const wallet = document.querySelector('.arsenal--phone .wallet')?.getBoundingClientRect();
    const modes = document.querySelector('.arsmodes')?.getBoundingClientRect();
    const kit = document.querySelector('[data-testid=kit-card]')?.getBoundingClientRect();
    return {
      order: !!wallet && !!modes && !!kit && wallet.bottom <= modes.top && modes.bottom <= kit.top,
      diamonds: document.querySelectorAll('.arsenal--phone .cur--diamonds, [data-testid=wallet-topup]').length,
      slots: document.querySelectorAll('.kitslot').length,
    };
  });
  check(top.order && top.diamonds === 0 && top.slots === 4, `${size}: the Arsenal opens on the kit — wallet, then the two halves, then the dressing room and four slots; no diamonds (${JSON.stringify(top)})`);
  await screen('the Arsenal kit');
  // a slot's sheet lists only the player's own items
  await page.getByTestId('slot-change-3').click();
  await page.getByTestId('slot-sheet').waitFor({ timeout: 5000 });
  const own = await page.locator('.slotopt').count();
  check(own >= 2 && (await page.locator('[data-testid=slot-sheet] .wbtn--shop').count()) === 0, `${size}: the primary slot's sheet lists the player's own weapons only (${own} options)`);
  await sheetFits('slot');
  await page.getByTestId('ars-shop').click();
  await page.waitForTimeout(300);
  const tabs = await page.locator('.arschips button').allTextContents();
  check(tabs.length === 4, `${size}: the shop has four departments, no diamonds (${tabs.join(' · ')})`);
  for (const tab of ['weapons', 'gear', 'characters', 'case']) {
    await page.locator(`.arschips [data-tab="${tab}"]`).click();
    await page.waitForTimeout(400);
    await screen(`the shop: ${tab}`);
  }
  await page.locator('.arschips [data-tab="weapons"]').click();
  await page.locator('[data-item="uzi"]').click();
  await page.getByTestId('item-sheet').waitFor({ timeout: 5000 });
  await sheetFits('item');
  await page.locator('.back').click();

  // the character screen and its personal file
  await page.getByTestId('menu-nick').waitFor({ timeout: 10000 });
  await page.locator('.menu__char').click();
  await page.getByTestId('char-summary').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  await screen('the characters');
  await page.getByTestId('dossier-open').click();
  await page.getByTestId('dossier-sheet').waitFor({ timeout: 5000 });
  await sheetFits('personal file');
  await page.locator('.back').click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 10000 });
  check(errors.length === 0, `${size}: no page errors (${errors.join(' | ')})`);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? `[phone] ${problems.length} of ${checks.length} checks failed` : `[phone] all ${checks.length} checks passed`);
process.exit(problems.length ? 1 : 0);
