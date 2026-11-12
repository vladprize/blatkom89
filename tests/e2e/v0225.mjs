// v0.2.25 — the owner's pre-release edits of 12 November 2026, end to end on the production bundle:
//   the menu — the fighter card without a cell, as tall as the menu and as close to it as the right column, the
//   menu in the middle; the corner's switches small, top right; the «18+» mark; a tap on the card opens every
//   character beside it (a free one taken at once, a locked one greyed with its price and «Buy»; ✕ / Escape
//   close it); a phone sideways — the menu smaller, in the middle, the logo whole;
//   the copy — swearing with one letter hidden by default, «No swearing» in the settings brings the plain texts
//   back (and «18+» opens the settings); the personal file's black humour («Distinguishing marks»); every
//   sentence of a description on a line of its own; the hidden comic «Flower Loser» (typed «flowers», or five
//   taps on Borka's portrait);
//   the loading screen — the controls for this device and a tip; the BLATS tab — the referral strip (+50 BLATS);
//   a phone — the settings, the menu and the personal file in one screen, the file's buttons inside it.
// The quick lobby's 30 seconds and its «Weapons» are in tests/e2e/fill.mjs (they need the bots' fill).
// Usage: node tests/e2e/v0225.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('usage: node tests/e2e/v0225.mjs <baseUrl> <outDir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const checks = [];
const problems = [];
const check = (ok, what) => {
  checks.push({ ok: !!ok, what });
  console.log(ok ? '✔' : '✖', what);
};
const RUN = Math.random().toString(36).slice(2, 6);
let n = 0;
const quiet = new WeakSet();
async function shot(page, name) {
  if (!quiet.has(page)) {
    quiet.add(page);
    await page.addStyleTag({ content: '.toast { visibility: hidden !important; }' }).catch(() => {});
  }
  await page.mouse.move(1, 1).catch(() => {});
  await page.screenshot({ path: `${outDir}/${name}` });
}

/** A guest who has played before (no first-match hints or windows), with an alias. */
async function open(viewport, o = {}) {
  const phone = !!o.phone;
  const ctx = await browser.newContext({ viewport, locale: o.lang === 'en' ? 'en-GB' : 'ru-RU', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript((lang) => {
    try {
      localStorage.setItem('blatkom89.lang.v1', lang);
      localStorage.setItem('blatkom89.story.prologue.v1', '1');
      localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
      localStorage.setItem('blatkom89.matches-done.v1', '3');
      localStorage.setItem('blatkom89.hints.v1', '9');
      localStorage.setItem('blatkom89.tutorial.v1', '1');
    } catch {}
  }, o.lang ?? 'ru');
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${viewport.width}x${viewport.height}: ${e.message}`));
  await page.goto(base + '/');
  await page.waitForFunction(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('boot--hidden'); }, null, { timeout: 90000 });
  const nick = page.locator('.modal input.input').first();
  await nick.waitFor({ timeout: 60000 });
  await nick.fill(`v25_${RUN}_${++n}`);
  await page.locator('.modal .btn--red').last().click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}
const box = (page, sel) =>
  page.evaluate((s) => {
    const e = [...document.querySelectorAll(s)].find((x) => x.getBoundingClientRect().width > 0);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
  }, sel);
const fits = (page) =>
  page.evaluate(() => {
    const s = document.querySelector('.ui .screen');
    return { v: s ? s.scrollHeight - s.clientHeight : 0, h: document.documentElement.scrollWidth - innerWidth };
  });
/** The text of the first visible element, its sentence breaks kept. */
const text = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].find((x) => x.getBoundingClientRect().width > 0)?.textContent ?? null, sel);

let failed = false;
try {
  // ── a computer: the menu ─────────────────────────────────────────────────────────────────────────
  const A = await open({ width: 1440, height: 790 });
  const mf = await fits(A.page);
  check(mf.v <= 0 && mf.h <= 0, `a computer's menu fits the window (${JSON.stringify(mf)})`);
  const card = await box(A.page, '[data-testid=menu-hero] canvas[data-testid=fighter-card]');
  const menu = await box(A.page, '.menu__play');
  const side = await box(A.page, '.menu__side');
  check(card && menu && Math.abs(card.t - menu.t) <= 4 && Math.abs(card.b - menu.b) <= 4, `the card is as tall as the menu, edge to edge (card ${JSON.stringify(card)}, menu ${JSON.stringify(menu)})`);
  check(card && menu && side && Math.abs(menu.l - card.r - (side.l - menu.r)) <= 4, `the card as close to the menu as the right column (${menu.l - card.r} / ${side.l - menu.r} px)`);
  const corner = await A.page.evaluate(() => {
    const c = document.querySelector('.wrap--menu > .corner');
    const r = c.getBoundingClientRect();
    const btns = [...c.querySelectorAll('.iconbtn')].map((b) => Math.round(b.getBoundingClientRect().height));
    return { right: Math.round(innerWidth - r.right), top: Math.round(r.top), tallest: Math.max(...btns) };
  });
  check(corner.right <= 20 && corner.top <= 16 && corner.tallest <= 30, `the switches small, top right (${JSON.stringify(corner)})`);
  const age = await box(A.page, '[data-testid=age-18]');
  check(!!age && age.w > 0, 'the «18+» mark is in the menu');
  const tag = (await text(A.page, '.menu__play > .tag')) ?? '';
  const sub = (await text(A.page, '.menu__play .btn--red .sub')) ?? '';
  check(/бл\*ть/.test(tag) && /долбо\*б/.test(sub), `the menu swears with a letter hidden: «${tag}», «${sub}»`);
  await shot(A.page, 'pc_menu.png');

  // the picker: every character beside the card
  await A.page.getByTestId('menu-hero').click();
  await A.page.getByTestId('card-viewer').waitFor({ timeout: 10000 });
  const cells = await A.page.locator('.cardpick__cell').count();
  check(cells === 36, `a tap on the card: all ${cells} characters beside it`);
  await A.page.locator('.cardpick__cell[data-character=svinya]').click();
  await A.page.waitForTimeout(300);
  const locked = { buy: await A.page.getByTestId('cardpick-buy').isVisible(), price: (await A.page.getByTestId('cardpick-price').innerText().catch(() => '')).trim(), share: await A.page.getByTestId('card-share').isVisible() };
  check(locked.buy && /99/.test(locked.price) && !locked.share, `a locked one: greyed, its price and «Buy» (${JSON.stringify(locked)})`);
  await A.page.locator('.cardpick__cell[data-character=valuta]').click();
  await A.page.waitForTimeout(300);
  check((await A.page.getByTestId('card-share').isVisible()) && !(await A.page.getByTestId('cardpick-buy').isVisible()), 'a free one: taken at once, «Share» back');
  await shot(A.page, 'pc_picker.png');
  await A.page.keyboard.press('Escape');
  await A.page.waitForTimeout(800);
  const now = await A.page.evaluate(() => document.querySelector('[data-testid=menu-hero] canvas')?.dataset.character);
  check((await A.page.getByTestId('card-viewer').count()) === 0 && now === 'valuta', `Escape closes it; the menu's card is the one taken (${now})`);

  // the swearing off and on again: «18+» opens the settings
  await A.page.getByTestId('age-18').click();
  await A.page.getByTestId('settings-swear').waitFor({ timeout: 5000 });
  await A.page.locator('[data-testid=settings-swear] [data-swear=off]').click();
  await A.page.evaluate(() => window.__blatkom.app.goMenu());
  await A.page.waitForTimeout(600);
  const clean = (await text(A.page, '.menu__play > .tag')) ?? '';
  check(clean.trim() === 'Районные дела', `«No swearing»: the plain texts back («${clean}»)`);
  await A.page.evaluate(() => window.__blatkom.app.showSettings());
  await A.page.locator('[data-testid=settings-swear] [data-swear=on]').click();
  await A.page.evaluate(() => window.__blatkom.app.goMenu());
  await A.page.waitForTimeout(500);
  check(/бл\*ть/.test((await text(A.page, '.menu__play > .tag')) ?? ''), 'and the swearing on again');

  // the hidden comic: «flowers» typed in the menu
  await A.page.mouse.click(4, 4);
  await A.page.keyboard.type('flowers', { delay: 30 });
  await A.page.getByTestId('comic').waitFor({ timeout: 8000 });
  await A.page.waitForTimeout(1200);
  const page1 = (await text(A.page, '.comic')) ?? '';
  for (let i = 0; i < 3; i++) {
    await A.page.keyboard.press('Enter');
    await A.page.waitForTimeout(700);
  }
  const page2 = (await text(A.page, '.comic')) ?? '';
  check(/ларька|camcorder/i.test(page1) && /Лох цветочный/.test(page2), `«flowers» opens the hidden comic, Gosha and Borka («${page2.replace(/\s+/g, ' ').slice(0, 90)}…»)`);
  await shot(A.page, 'pc_flowers.png');
  await A.page.getByTestId('comic-skip').click();
  await A.page.waitForTimeout(600);
  check((await A.page.getByTestId('comic').count()) === 0, 'the comic closes');

  // the personal file: black humour, every sentence on its own line
  await A.page.evaluate(() => window.__blatkom.app.showCharacters(true, 'svinya'));
  await A.page.getByTestId('dossier-marks').first().waitFor({ timeout: 8000 });
  const marks = (await text(A.page, '[data-testid=dossier-marks]')) ?? '';
  const lore = (await text(A.page, '.dossier .lore')) ?? '';
  check(/Особые приметы/.test(marks) && /Докторской/.test(marks), `the file's «Distinguishing marks» («${marks.replace(/\s+/g, ' ').slice(0, 80)}»)`);
  check(lore.split('\n').length >= 3, `the lore: a sentence a line (${lore.split('\n').length} lines)`);
  const cf = await fits(A.page);
  check(cf.v <= 0, `the character screen still fits (${JSON.stringify(cf)})`);
  await shot(A.page, 'pc_characters.png');
  // five quick clicks on Borka's portrait — the comic again
  for (let i = 0; i < 5; i++) await A.page.locator('.dossier [data-testid=flowers-hero]').first().click({ force: true });
  await A.page.getByTestId('comic').waitFor({ timeout: 8000 });
  check(true, 'five quick taps on Borka\'s portrait open the comic too');
  await A.page.getByTestId('comic-skip').click();

  // the BLATS tab: the referral strip
  await A.page.evaluate(() => window.__blatkom.app.showArsenal(true, 'diamonds'));
  await A.page.getByTestId('ref-strip').waitFor({ timeout: 10000 });
  const strip = (await A.page.getByTestId('ref-strip').innerText()).replace(/\s+/g, ' ');
  check(/50/.test(strip) && /БЛАТ/.test(strip), `the BLATS tab says friends bring BLATS («${strip}»)`);

  // the loading screen: the controls for this device and a tip
  await A.page.evaluate(() => window.__blatkom.app.startPractice({ mapId: 'factory', bots: 3, difficulty: 'easy', gameMode: 'ffa' }));
  await A.page.getByTestId('loadscreen').waitFor({ timeout: 10000 });
  const load = await A.page.evaluate(() => ({ guide: document.querySelector('[data-testid=loadscreen] [data-testid=controls-guide]')?.className ?? null, tip: document.querySelector('[data-testid=loadscreen] [data-testid=load-tip]')?.textContent ?? null }));
  check(/cguide--keys/.test(load.guide ?? '') && (load.tip ?? '').length > 10, `the loading screen: the keys and a tip («${(load.tip ?? '').slice(0, 70)}»)`);
  await shot(A.page, 'pc_loading.png');
  await A.ctx.close();

  // ── English: the same swearing, in English ─────────────────────────────────────────────────────────
  const E = await open({ width: 1280, height: 720 }, { lang: 'en' });
  const etag = (await text(E.page, '.menu__play > .tag')) ?? '';
  check(/f\*ck/i.test(etag), `English swears too, a letter hidden («${etag}»)`);
  await E.ctx.close();

  // ── a phone upright ──────────────────────────────────────────────────────────────────────────────────
  const P = await open({ width: 390, height: 844 }, { phone: true });
  const pf = await fits(P.page);
  const pcard = await box(P.page, '[data-testid=menu-card] canvas[data-testid=fighter-card]');
  check(pf.v <= 0 && pf.h <= 0 && pcard && pcard.w >= 110, `a phone's menu fits, its card big (${JSON.stringify({ ...pf, card: pcard })})`);
  await shot(P.page, 'phone_menu.png');
  await P.page.evaluate(() => window.__blatkom.app.showSettings());
  await P.page.waitForTimeout(600);
  const sf = await fits(P.page);
  const seg = await P.page.evaluate(() => { const a = document.querySelector('.settings__langseg')?.getBoundingClientRect(); const b = document.querySelector('[data-testid=settings-swear]')?.getBoundingClientRect(); return a && b ? { sameRow: Math.abs(a.top - b.top) < 4, right: Math.round(b.right), vw: innerWidth } : null; });
  check(sf.v <= 0 && seg?.sameRow && seg.right <= seg.vw, `a phone's settings fit: the language and the swearing side by side (${JSON.stringify({ ...sf, seg })})`);
  await shot(P.page, 'phone_settings.png');
  await P.page.evaluate(() => window.__blatkom.app.showCharacters(true, 'svinya'));
  await P.page.getByTestId('dossier-open').click();
  await P.page.getByTestId('dossier-sheet').waitFor({ timeout: 5000 });
  await P.page.waitForTimeout(500);
  const sheet = await P.page.evaluate(() => {
    const body = document.querySelector('[data-testid=dossier-sheet] .sheet__body') ?? document.querySelector('.sheet__body');
    const btns = [...document.querySelectorAll('.sheet .btn')].map((b) => Math.round(b.getBoundingClientRect().right));
    return { over: body ? body.scrollHeight - body.clientHeight : null, right: Math.max(...btns), vw: innerWidth };
  });
  check(sheet.over !== null && sheet.over <= 0 && sheet.right <= sheet.vw, `a phone's personal file in one screen, its buttons inside it (${JSON.stringify(sheet)})`);
  await shot(P.page, 'phone_dossier.png');
  await P.ctx.close();

  // ── a phone sideways: the menu smaller, in the middle, the logo whole ───────────────────────────────────
  const L = await open({ width: 844, height: 390 }, { phone: true });
  const lf = await fits(L.page);
  const lay = await L.page.evaluate(() => {
    // the side column is `display: contents` sideways — its tiles stand in the menu's grid themselves
    const kids = [...document.querySelectorAll('.menu__play, [data-testid=menu-card], .menu__side, .menu__side > *')].filter((e) => e.getBoundingClientRect().width > 0);
    const l = Math.min(...kids.map((e) => e.getBoundingClientRect().left));
    const r = Math.max(...kids.map((e) => e.getBoundingClientRect().right));
    const logo = document.querySelector('.wrap--menu .logo').getBoundingClientRect();
    return { left: Math.round(l), right: Math.round(innerWidth - r), logoTop: Math.round(logo.top), logoH: Math.round(logo.height) };
  });
  check(lf.v <= 0 && lf.h <= 0 && Math.abs(lay.left - lay.right) <= 12 && lay.logoTop >= 0 && lay.logoH >= 40, `a phone sideways: the menu in the middle, the logo whole (${JSON.stringify({ ...lf, ...lay })})`);
  await shot(L.page, 'phone_sideways_menu.png');
  await L.ctx.close();
} catch (e) {
  failed = true;
  console.error('✖ crashed:', e);
} finally {
  await browser.close();
}
const bad = checks.filter((c) => !c.ok);
for (const p of problems) console.log('⚠ page error:', p);
console.log(`\n${checks.length - bad.length}/${checks.length} checks passed`);
process.exit(failed || bad.length || problems.length ? 1 : 0);
