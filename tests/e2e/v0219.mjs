// v0.2.19 — the owner's pre-final edits (3 Nov 2026), end to end on the production bundle:
//   the menu: Instagram left of X, full screen labelled on a computer, the gear whole, the owner's BLAT banner
//   and Arsenal tile in the page's language, the District Tournament's name where the others' start, the
//   smallest phones' menu one screen; an alias typed in Cyrillic with a space and capitals comes out one
//   word of small Latin letters (and the server refuses two words); no tutorial card at the start of a
//   match; the touch sticks mirrored, every button clear of its stick; the Arsenal's «Cases» button and
//   the bright «Skins» button on a phone, the skins' sheet of picture cards; the story's prologue covering
//   a phone's screen, its characters in their own colours; the menu music is «Hurt» again (4 Nov).
// Usage: node tests/e2e/v0219.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('usage: node tests/e2e/v0219.mjs <baseUrl> <outDir>');
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

async function open(lang, viewport, phone) {
  const ctx = await browser.newContext({ viewport, locale: lang === 'ru' ? 'ru-RU' : 'en-GB', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem('blatkom89.lang.v1', l);
      localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
    } catch {}
    // the toasts the page shows, for the checks
    window.__toasts = [];
    const watch = () =>
      new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('toast')) window.__toasts.push(n.textContent);
      }).observe(document.documentElement, { childList: true, subtree: true });
    if (document.documentElement) watch();
    else document.addEventListener('DOMContentLoaded', watch);
  }, lang);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${lang} ${viewport.width}: ${e.message}`));
  await page.goto(base + '/');
  await page.waitForFunction(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('boot--hidden') || !!document.querySelector('[data-testid=boot-play]'); }, null, { timeout: 90000 });
  if (await page.getByTestId('boot-play').count()) await page.getByTestId('boot-play').click();
  const nick = page.getByRole('textbox', { name: lang === 'ru' ? 'Кличка' : 'Alias' });
  await nick.waitFor({ timeout: 60000 });
  return { ctx, page, nick };
}

const art = (page, testid) => page.getByTestId(testid).evaluate((el) => { const i = el.tagName === 'IMG' ? el : el.querySelector('img'); return { src: i?.getAttribute('src') ?? '', ok: !!i && i.complete && i.naturalWidth > 0 }; });

try {
  // ── a computer, English ────────────────────────────────────────────────
  const A = await open('en', { width: 1280, height: 720 }, false);
  await A.nick.fill(`Tester ${RUN}`);
  check((await A.nick.inputValue()) === `tester_${RUN}`, `an alias typed with a capital and a space is written as one word («${await A.nick.inputValue()}»)`);
  check(/a–z/.test(await A.page.getByTestId('name-rule').innerText()), 'the rule is under the field');
  await A.page.getByRole('button', { name: 'Done' }).click();
  await A.page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  await A.page.waitForTimeout(1200);
  const corner = await A.page.evaluate(() => {
    const r = (id) => document.querySelector(`[data-testid=${id}]`)?.getBoundingClientRect() ?? null;
    const ig = r('corner-instagram');
    const x = r('corner-x');
    const fs = document.querySelector('[data-testid=corner-fullscreen]');
    const gear = document.querySelector('[data-testid=corner-settings] svg path');
    return { ig: !!ig, left: !!ig && !!x && ig.right <= x.left + 0.5, fsLabel: fs?.querySelector('.fsbtn__label') ? getComputedStyle(fs.querySelector('.fsbtn__label')).display !== 'none' && fs.textContent.trim() : null, gear: !!gear };
  });
  check(corner.ig && corner.left, 'the corner has Instagram, left of X');
  check(/full screen/i.test(corner.fsLabel ?? ''), `on a computer the full-screen button says so («${corner.fsLabel}»)`);
  await A.page.getByTestId('corner-instagram').click();
  await A.page.waitForFunction(() => (window.__toasts ?? []).some((t) => /Instagram/.test(t)), null, { timeout: 5000 }).catch(() => {});
  check(await A.page.evaluate(() => (window.__toasts ?? []).some((t) => /Instagram/.test(t))), 'Instagram without an address yet says «coming soon»');
  const bannerEn = await art(A.page, 'blats-banner-art');
  check(bannerEn.ok && /blats_banner_en\.jpg/.test(bannerEn.src), `the owner's BLAT banner in English (${bannerEn.src})`);
  const tileEn = await art(A.page, 'arsenal-tile');
  check(tileEn.ok && /arsenal_tile_en\.jpg/.test(tileEn.src), `the owner's Arsenal tile in English (${tileEn.src})`);
  const kon = await A.page.evaluate(() => {
    const hot = document.querySelector('.menu__kon--hot');
    const other = [...document.querySelectorAll('.menu__play > .btn')].find((b) => b !== hot && !b.classList.contains('btn--red'));
    // where a button's name starts: its first piece of text
    const txt = (b) => {
      if (!b) return null;
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        return Math.round(r.getBoundingClientRect().left);
      }
      return null;
    };
    return { hot: !!hot, name: txt(hot), other: txt(other) };
  });
  check(kon.hot && kon.name !== null && kon.other !== null && Math.abs(kon.name - kon.other) <= 3, `the District Tournament's name starts where the other buttons' names start (${kon.name} / ${kon.other})`);
  // the menu music is «Hurt» again (4 Nov, the owner's choice): the file served and the credits name it
  const theme = await fetch(`${base}/assets/audio/theme.mp3`);
  const themeLen = theme.ok ? (await theme.arrayBuffer()).byteLength : 0;
  check(theme.ok && /audio\/mpeg/.test(theme.headers.get('content-type') ?? '') && themeLen === 2077406, `the menu music is the phonk «Hurt» (${theme.status}, ${theme.headers.get('content-type')}, ${themeLen} bytes)`);
  await A.page.locator('.footer button.linkish').click();
  const creditsMusic = await A.page.getByTestId('credits-music').innerText({ timeout: 10000 }).catch(() => '');
  check(/«Hurt»/.test(creditsMusic) && /Infraction/.test(creditsMusic), `the credits name it («${creditsMusic}»)`);
  await A.page.locator('.credits .btn--red').click();
  await A.page.screenshot({ path: `${outDir}/menu_en_1280.png` });
  // the server: one word of small letters only
  const token = await A.page.evaluate(() => localStorage.getItem('blatkom89.token'));
  const patch = async (displayName) => (await fetch(`${base}/api/me`, { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ displayName }) })).status;
  const codes = { twoWords: await patch(`Two Words ${RUN}`), caps: await patch(`Caps${RUN}`), short: await patch('ab'), good: await patch(`ok.name-${RUN}`) };
  check(codes.twoWords === 400 && codes.caps === 400 && codes.short === 400 && codes.good === 200, `the server takes one word of small letters, digits and _ . - only (${JSON.stringify(codes)})`);

  // the Arsenal: the Cases tab stands out, the dressing room's strip of skin cards and «All skins»
  await A.page.evaluate(() => window.__blatkom.app.showArsenal(true, 'loadout'));
  await A.page.getByTestId('skin-pick').waitFor({ timeout: 20000 });
  const ars = await A.page.evaluate(() => {
    const strip = document.querySelector('.skinpick--room .skingrid');
    const room = document.querySelector('[data-testid=dressing-room]');
    return { caseTab: !!document.querySelector('[data-testid=tab-case] .caseico'), cards: document.querySelectorAll('.skinpick--room .skincard').length, inside: !!strip && !!room && strip.getBoundingClientRect().right <= room.getBoundingClientRect().right + 1, all: !!document.querySelector('[data-testid=skins-all]') };
  });
  check(ars.caseTab && ars.cards === 42 && ars.inside && ars.all, `the Arsenal: «Cases» with its chest; the dressing room's 42 skin cards scroll inside it; «All skins» (${JSON.stringify(ars)})`);
  await A.page.getByTestId('skins-all').click();
  await A.page.getByTestId('skin-sheet').waitFor({ timeout: 5000 });
  await A.page.waitForTimeout(800);
  const grid = await A.page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid=skin-sheet] .skincard')];
    const r = cards.map((c) => c.getBoundingClientRect());
    return { n: cards.length, rowH: Math.round(r[0]?.height ?? 0), cols: new Set(r.slice(0, 8).map((x) => Math.round(x.top))).size === 2 ? 4 : null, pic: Math.round(cards[0]?.querySelector('img')?.getBoundingClientRect().width ?? 0) };
  });
  check(grid.n === 42 && grid.rowH > 90 && grid.rowH < 220 && grid.pic >= 120, `the skins' dialog: a grid of picture cards (${JSON.stringify(grid)})`);
  await A.page.screenshot({ path: `${outDir}/skins_dialog_en.png` });
  await A.ctx.close();

  // ── the smallest phone, Russian ────────────────────────────────────────
  const P = await open('ru', { width: 360, height: 640 }, true);
  await P.nick.fill(`Тест ${RUN.toUpperCase()}`);
  check((await P.nick.inputValue()) === `test_${RUN}`, `Cyrillic, a space and capitals typed: one word of small Latin letters («${await P.nick.inputValue()}»)`);
  await P.page.getByRole('button', { name: 'Готово' }).click();
  await P.page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  await P.page.waitForTimeout(1200);
  const fit = await P.page.evaluate(() => { const s = document.querySelector('.ui .screen'); return { over: s.scrollHeight - s.clientHeight, side: document.documentElement.scrollWidth - innerWidth }; });
  check(fit.over <= 1 && fit.side <= 0, `360×640: the menu is one screen with the new banner (${JSON.stringify(fit)})`);
  const bannerRu = await art(P.page, 'blats-banner-art');
  const tileRu = await art(P.page, 'arsenal-tile');
  check(bannerRu.ok && /blats_banner_ru\.jpg/.test(bannerRu.src) && tileRu.ok && /arsenal_tile_ru\.jpg/.test(tileRu.src), 'the banner and the Arsenal tile in Russian');
  const fsPhone = await P.page.evaluate(() => { const l = document.querySelector('[data-testid=corner-fullscreen] .fsbtn__label'); return !l || getComputedStyle(l).display === 'none'; });
  check(fsPhone, 'on a phone the full-screen button is the bare icon');
  await P.page.screenshot({ path: `${outDir}/menu_ru_360.png` });
  // the Arsenal on a phone: «Кейсы» in the top row, the bright «Скины» with the count, the sheet of cards
  await P.page.getByTestId('arsenal-tile').click();
  await P.page.getByTestId('kit-skins').waitFor({ timeout: 20000 });
  const top = await P.page.evaluate(() => ({ cases: !!document.querySelector('[data-testid=ars-case] .caseico'), skins: document.querySelector('[data-testid=kit-skins]')?.classList.contains('btn--skins'), n: document.querySelector('.btn--skins__n')?.textContent }));
  check(top.cases && top.skins && /^\d+\/41$/.test(top.n ?? ''), `phone Arsenal: «Кейсы» next to the two halves, the bright «Скины» (${JSON.stringify(top)})`);
  await P.page.getByTestId('kit-skins').click();
  await P.page.getByTestId('skin-sheet').waitFor({ timeout: 5000 });
  await P.page.waitForTimeout(800);
  const sheet = await P.page.evaluate(() => { const c = [...document.querySelectorAll('[data-testid=skin-sheet] .skincard')]; const r = c.map((x) => x.getBoundingClientRect()); return { n: c.length, two: r.length > 2 && Math.abs(r[0].top - r[1].top) <= 3 && r[2].top > r[0].top + 40, w: Math.round(r[0]?.width ?? 0) }; });
  check(sheet.n === 42 && sheet.two && sheet.w >= 140, `the skins' sheet on a phone: two big cards a row (${JSON.stringify(sheet)})`);
  await P.page.screenshot({ path: `${outDir}/skins_sheet_ru_360.png` });
  await P.page.getByTestId('sheet-close').click();
  await P.page.getByTestId('ars-case').click();
  await P.page.getByTestId('skin-case').waitFor({ timeout: 10000 });
  check(true, '«Кейсы» opens the cases');
  await P.ctx.close();

  // ── a phone held sideways: practice — no tutorial card, the sticks mirrored, the buttons clear ─
  const L = await open('ru', { width: 844, height: 390 }, true);
  await L.nick.fill(`palec_${RUN}`);
  await L.page.getByRole('button', { name: 'Готово' }).click();
  await L.page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  await L.page.evaluate(() => window.__blatkom.app.startPractice({ mapId: 'factory', bots: 3, difficulty: 'normal' }));
  await L.page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 40000 });
  await L.page.waitForTimeout(2500);
  const hud = await L.page.evaluate(() => {
    const h = window.__blatkom.game.scene.getScene('hud');
    const texts = h.children.list.filter((o) => typeof o.text === 'string').map((o) => o.text).join(' | ');
    const [fire, reload, swap, , gadget] = h.buttons;
    const rest = h.stickRest;
    const W = h.lw ?? h.scale.width; // v0.2.21: the HUD's own units (its camera is zoomed on touch screens)
    const ring = 78 * Math.min(1, h.btnScaleY);
    const clear = (b, s) => Math.hypot(b.x - s.x, b.y - s.y) - ring - b.r;
    return {
      tutorial: /HOW BUSINESS|КАК ДЕЛАЮТСЯ|Left stick|Левый стик/i.test(texts),
      mirrored: Math.abs(rest[0].x + rest[1].x - (W - h.inset.right + h.inset.left)) <= 1 && Math.abs(gadget.x + fire.x - (W - h.inset.right + h.inset.left)) <= 1 && Math.abs(swap.x + reload.x - (W - h.inset.right + h.inset.left)) <= 1,
      gaps: [clear(fire, rest[1]), clear(reload, rest[1]), clear(gadget, rest[0]), clear(swap, rest[0])].map((g) => Math.round(g)),
    };
  });
  check(!hud.tutorial, 'no tutorial card at the start of the match');
  check(hud.mirrored && hud.gaps.every((g) => g >= 12), `the sticks and their buttons mirrored, every button clear of its stick's ring (gaps ${hud.gaps.join(', ')})`);
  await L.page.screenshot({ path: `${outDir}/touch_landscape.png` });
  await L.ctx.close();

  // ── the story's prologue on an upright phone: the picture covers the screen, the characters in colour ─
  const S = await open('ru', { width: 390, height: 844 }, true);
  await S.nick.fill(`chitatel_${RUN}`);
  await S.page.getByRole('button', { name: 'Готово' }).click();
  await S.page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  await S.page.getByTestId('menu-story').click();
  await S.page.getByTestId('comic').waitFor({ timeout: 20000 });
  let portrait = null;
  for (let i = 0; i < 10 && !portrait; i++) {
    await S.page.waitForTimeout(1200);
    portrait = await S.page.evaluate(() => {
      const a = document.querySelector('.comic__art');
      return a ? getComputedStyle(a).filter : null;
    });
    const cover = await S.page.evaluate(() => {
      const s = [...document.querySelectorAll('.comic__scene')].find((e) => getComputedStyle(e).opacity !== '0');
      if (!s) return true;
      const r = s.getBoundingClientRect();
      return r.left <= 0.5 && r.top <= 0.5 && r.right >= innerWidth - 0.5 && r.bottom >= innerHeight - 0.5;
    });
    if (!cover) {
      check(false, `the prologue's picture covers the phone's screen (beat ${i})`);
      break;
    }
    if (!portrait) await S.page.mouse.click(195, 420);
  }
  check(portrait === 'none', `the prologue's characters keep their own colours (filter: ${portrait})`);
  await S.page.screenshot({ path: `${outDir}/story_prologue_phone.png` });
  await S.ctx.close();
} catch (e) {
  check(false, `flow failed: ${e.message.split('\n')[0]}`);
}
for (const p of problems) console.log('  problem:', p);
await browser.close();
const failed = checks.filter((c) => !c.ok).length + problems.length;
console.log(failed ? `[v0219] ${failed} problem(s)` : `[v0219] all ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
