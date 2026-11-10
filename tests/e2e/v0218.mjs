// v0.2.18 end-to-end — the owner's pre-release edits. A: English, desktop; B: Russian, phone.
//
//  • the phone opens straight into the loading window and the menu — no «▶ PLAY» screen;
//  • no crypto anywhere: no $BLAT, BLAT DROP, Solana or stakes on the menu; the BLATS tile (0 at sign-up);
//  • full screen: the corner's button on a computer and on a phone (on, then off); over a match and in the
//    pause menu; an iPhone's browser (no Fullscreen API) gets the «Add to Home Screen» note;
//  • BLATS for levels: a player at level 3 gets 2 × 10 BLATS once (told on the menu), never twice;
//  • the menu's BLATS banner (desktop and phone, the menu still one screen; «on sale soon» while no payment
//    provider is set) opens the Arsenal's «Buy BLATS» section: its banner, the balance, «1 BLATS = 1 cent»,
//    six packs from 99 ($0.99), each with what it is enough for; on the phone in Russian on one screen;
//  • a weapon skin bought right in the dressing room for its grade's price (regular 99); the free finishes
//    are the player's without buying;
//  • a character bought right on the character screen (rare 399; v0.2.24: 299); «Try in practice» on a locked one plays
//    as them and the pause menu's «Back to the characters» returns to the same character; the Arsenal's
//    «Test in practice» and its character card's «Try in practice» come back to the Arsenal;
//  • the score by mode: free-for-all — «YOU» and «LEADER» (no red and blue); teams — red and blue, no labels;
//  • a phone held sideways (804×290 and 844×390): the game fills the whole window;
//  • the story: a speaker's portrait and line sit in the middle of the screen (computer and phone);
//  • the founder (with an admin login): level 87 and its BLATS (86 × 10) in the Dossier, the badge, the ★;
//  • after a match, the letters W, A, S, D (and the others the game uses) type into a gang's name.
//
// Usage: DATABASE_URL=… node tests/e2e/v0218.mjs <baseUrl> <outDir> [adminUser] [adminPass]
import { chromium } from 'playwright';
import postgres from 'postgres';
import { mkdirSync } from 'node:fs';

const [base, outDir, adminUser, adminPass] = process.argv.slice(2);
if (!base || !outDir || !process.env.DATABASE_URL) {
  console.error('usage: DATABASE_URL=… node tests/e2e/v0218.mjs <baseUrl> <outDir> [adminUser] [adminPass]');
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
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function player(name, lang, viewport, o = {}) {
  const phone = viewport.width < 600 || viewport.height < 450;
  const ctx = await browser.newContext({ viewport, locale: lang === 'ru' ? 'ru-RU' : 'en-GB', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}), ...(o.ua ? { userAgent: o.ua } : {}) });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await ctx.addInitScript(
    ([l, noFullscreen]) => {
      try {
        localStorage.setItem('blatkom89.lang.v1', l);
        localStorage.setItem('blatkom89.tutorial.v1', '1');
        localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
      } catch {}
      // an iPhone's browser: pages get no Fullscreen API
      if (noFullscreen) {
        for (const k of ['fullscreenEnabled', 'webkitFullscreenEnabled']) Object.defineProperty(Document.prototype, k, { get: () => false, configurable: true });
        for (const k of ['requestFullscreen', 'webkitRequestFullscreen']) Object.defineProperty(Element.prototype, k, { value: undefined, configurable: true, writable: true });
      }
      window.__toasts = [];
      window.__sawPlay = false;
      const watch = () =>
        new MutationObserver((ms) => {
          for (const m of ms)
            for (const n of m.addedNodes) {
              if (n.nodeType !== 1) continue;
              if (n.classList.contains('toast')) window.__toasts.push(n.textContent);
              if (n.dataset?.testid === 'boot-play' || n.classList.contains('boot__play')) window.__sawPlay = true;
            }
        }).observe(document.documentElement, { childList: true, subtree: true });
      if (document.documentElement) watch();
      else document.addEventListener('DOMContentLoaded', watch);
      document.addEventListener('DOMContentLoaded', () => (window.__bootWindow = !!document.getElementById('boot')));
    },
    [lang, !!o.noFullscreen],
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${name} pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org|WebSocket/.test(m.text())) problems.push(`[${name} console] ${m.text()}`);
  });
  await page.goto(base + (o.path ?? '/'), { waitUntil: 'domcontentloaded', timeout: 90000 });
  // nothing is tapped: the loading window goes away by itself
  await page.waitForFunction(() => {
    const boot = document.getElementById('boot');
    return !boot || boot.classList.contains('boot--hidden');
  }, null, { timeout: 90000 });
  if (o.path) return { name, ctx, page, phone };
  const nick = page.getByRole('textbox', { name: lang === 'ru' ? 'Кличка' : 'Alias' });
  await nick.waitFor({ timeout: 60000 });
  await nick.fill(`${name} ${RUN}`);
  await page.getByRole('button', { name: lang === 'ru' ? 'Готово' : 'Done' }).click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  const me = await page.evaluate(() => fetch('/api/me', { headers: { authorization: `Bearer ${localStorage.getItem('blatkom89.token')}` } }).then((r) => r.json()));
  return { name, ctx, page, id: me.id, phone };
}
const toMenu = async (page) => {
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => {
    const boot = document.getElementById('boot');
    return !boot || boot.classList.contains('boot--hidden');
  }, null, { timeout: 60000 });
  await page.getByTestId('menu-nick').waitFor({ timeout: 60000 });
};
const fits = (page) =>
  page.evaluate(() => ({
    v: Math.max(document.scrollingElement.scrollHeight - innerHeight, ...[...document.querySelectorAll('.screen')].map((e) => e.scrollHeight - e.clientHeight)),
    h: document.scrollingElement.scrollWidth - innerWidth,
  }));
const isFs = (page) => page.evaluate(() => !!document.fullscreenElement);
const blats = async (id) => (await sql`SELECT diamonds FROM profiles WHERE user_id = ${id}`)[0].diamonds;
const active = (page) => page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 60000 });
const hudScore = (page) =>
  page.evaluate(() => {
    const h = window.__blatkom.game.scene.getScene('hud');
    return { style: h.scoreStyle, my: h.myLabel.visible ? h.myLabel.text : null, lead: h.leadLabel.visible ? h.leadLabel.text : null, mode: h.mode.text };
  });
const localCharacter = (page) => page.evaluate(() => window.__blatkom.game.scene.getScene('game').session.players().find((p) => p.isLocal)?.character ?? null);
const NO_CRYPTO = /\$BLAT|BLAT DROP|Solana|Phantom|stake|ставк|токен|token/i;

try {
  const A = await player('Blatsman', 'en', { width: 1440, height: 900 });
  const B = await player('Blatych', 'ru', { width: 390, height: 844 });

  // ── the loading window, no PLAY screen; no crypto; the BLATS tile ─────────
  for (const P of [A, B]) {
    const boot = await P.page.evaluate(() => ({ boot: window.__bootWindow, play: window.__sawPlay }));
    check(boot.boot && !boot.play, `${P.name}: the loading window, then the menu — no «PLAY» screen (${JSON.stringify(boot)})`);
    const text = await P.page.locator('.wrap--menu').innerText();
    check(!NO_CRYPTO.test(text), `${P.name}: the menu says nothing about $BLAT, BLAT DROP, Solana, stakes or tokens`);
    check((await P.page.getByTestId('menu-blats-balance').innerText()).trim() === '0', `${P.name}: the BLATS tile shows 0 after sign-up`);
    check((await P.page.getByTestId('menu-blats').locator('img').count()) === 1, `${P.name}: the BLATS tile has the red coin`);
  }
  check(/БЛАТ|BLATS/.test(await B.page.getByTestId('menu-blats').innerText()), 'B’s tile is named');
  await A.page.screenshot({ path: `${outDir}/menu_A.png` });
  await B.page.screenshot({ path: `${outDir}/menu_B_phone.png` });

  // ── full screen from the corner ─────────────────────────────────────────
  for (const P of [A, B]) {
    const btn = P.page.getByTestId('corner-fullscreen');
    check((await btn.count()) === 1 && (await btn.getAttribute('aria-pressed')) === 'false', `${P.name}: the corner has the full-screen button («${await btn.getAttribute('aria-label')}»)`);
    await btn.click();
    await P.page.waitForFunction(() => !!document.fullscreenElement && document.querySelector('[data-testid=corner-fullscreen]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5000 }).catch(() => {});
    const on = await isFs(P.page);
    const pressed = await btn.getAttribute('aria-pressed');
    check(on && pressed === 'true', `${P.name}: full screen on (${on}, the button pressed: ${pressed}, «${await btn.getAttribute('aria-label')}»)`);
    await btn.click();
    await P.page.waitForFunction(() => !document.fullscreenElement && document.querySelector('[data-testid=corner-fullscreen]')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5000 }).catch(() => {});
    check(!(await isFs(P.page)) && (await btn.getAttribute('aria-pressed')) === 'false', `${P.name}: and off again («${await btn.getAttribute('aria-label')}»)`);
  }
  check((await B.page.getByTestId('corner-fullscreen').getAttribute('aria-label')) === 'Полный экран', 'B’s button says «Полный экран»');

  // ── an iPhone's browser: the home-screen note ─────────────────────────────
  {
    const I = await player('Ifon', 'ru', { width: 390, height: 844 }, { ua: IPHONE_UA, noFullscreen: true });
    await I.page.getByTestId('corner-fullscreen').click();
    await I.page.getByTestId('homescreen-hint').waitFor({ timeout: 10000 });
    const hint = (await I.page.getByTestId('homescreen-hint').innerText()).replace(/\s+/g, ' ');
    check(/«Домой»/.test(hint) && /Поделиться/.test(hint) && (await I.page.locator('.fshint__steps li').count()) === 3, `an iPhone: «Share → Add to Home Screen» in three steps («${hint.slice(0, 120)}…»)`);
    const manifest = await I.page.evaluate(async () => {
      const href = document.querySelector('link[rel=manifest]')?.getAttribute('href');
      if (!href) return null;
      const m = await fetch(href).then((r) => r.json());
      return { display: m.display, icons: m.icons?.length ?? 0, apple: !!document.querySelector('meta[name=apple-mobile-web-app-capable]') };
    });
    check(manifest?.display === 'fullscreen' && manifest.icons >= 2 && manifest.apple, `the web app manifest: opened from the home screen the game is full screen (${JSON.stringify(manifest)})`);
    await I.page.screenshot({ path: `${outDir}/iphone_hint.png` });
    await I.ctx.close();
  }

  // ── BLATS for levels ─────────────────────────────────────────────────────
  await sql`UPDATE profiles SET xp = 350, level = 3 WHERE user_id = ${A.id}`;
  await toMenu(A.page);
  await A.page.waitForFunction(() => window.__toasts.some((t) => /\+20 BLATS for the levels you reached/.test(t)), null, { timeout: 15000 }).catch(() => {});
  const lt = await A.page.evaluate(() => window.__toasts);
  check(lt.some((t) => /\+20 BLATS for the levels you reached/.test(t)), `A (level 3) is told: «+20 BLATS for the levels you reached» (${lt.join(' | ')})`);
  await A.page.waitForFunction(() => document.querySelector('[data-testid=menu-blats-balance]')?.textContent === '20', null, { timeout: 15000 }).catch(() => {});
  check((await A.page.getByTestId('menu-blats-balance').innerText()).trim() === '20', 'the BLATS tile: 20');
  await toMenu(A.page);
  const lv = await sql`SELECT ref, delta FROM currency_ledger WHERE user_id = ${A.id} AND currency = 'diamonds' AND reason = 'level' ORDER BY id`;
  check(lv.map((r) => `${r.ref}:${r.delta}`).join(',') === 'level:2:10,level:3:10' && (await blats(A.id)) === 20, `each level paid once (${lv.map((r) => `${r.ref}:${r.delta}`).join(', ')}; balance ${await blats(A.id)})`);
  check((await A.page.getByTestId('dossier-blats').innerText()).includes('20'), `the Dossier shows the BLATS («${(await A.page.getByTestId('dossier-blats').innerText()).trim()}»)`);

  // ── the BLATS banner on the menu (the owner: «рекламный баннер, что их можно купить») ──
  for (const P of [A, B]) {
    const ban = P.page.getByTestId('blats-banner-menu');
    await ban.waitFor({ timeout: 15000 });
    await P.page.waitForFunction(() => /99/.test(document.querySelector('[data-testid=blats-banner-menu] .blatsban__from')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
    // v0.2.19: the banner is the owner's art (the coins and the title in the picture) in the page's language
    await P.page.waitForFunction(() => { const i = document.querySelector('[data-testid=blats-banner-menu] .blatsart__img'); return !!i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 }).catch(() => {});
    const info = await P.page.evaluate(() => {
      const b = document.querySelector('[data-testid=blats-banner-menu]');
      const r = b.getBoundingClientRect();
      const img = b.querySelector('.blatsart__img');
      return { sale: b.dataset.sale, text: b.textContent.replace(/\s+/g, ' ').trim(), art: img && img.complete && img.naturalWidth > 0 ? img.getAttribute('src') : null, inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth };
    });
    const ru = P === B;
    check(info.sale === 'soon' && !!info.art && (ru ? /blats_banner_ru/ : /blats_banner_en/).test(info.art) && info.inView && (ru ? /Наборы от 99 · \$0\.99 · скоро в продаже/.test(info.text) : /Packs from 99 · \$0\.99 · on sale soon/.test(info.text)), `${P.name}: the menu's BLATS banner — the owner's art, the packs from 99 ($0.99), «on sale soon» while no payment provider is connected, in view («${info.text}», ${info.art?.replace(/^.*\//, '')})`);
    const fit = await fits(P.page);
    check(fit.v <= 0 && fit.h <= 0, `${P.name}: the menu with the banner still fits one screen (${JSON.stringify(fit)})`);
  }
  await A.page.screenshot({ path: `${outDir}/menu_banner_A.png` });
  await B.page.screenshot({ path: `${outDir}/menu_banner_B_phone.png` });

  // ── the BLATS tab («Buy BLATS») — A comes from the banner ─────────────────
  await A.page.getByTestId('blats-banner-menu').click();
  await A.page.getByTestId('blats-tab').waitFor({ timeout: 20000 });
  const tabBtn = A.page.getByTestId('tab-blats');
  check((await tabBtn.getAttribute('aria-pressed')) === 'true' && /Buy BLATS/i.test(await tabBtn.innerText()) && (await tabBtn.locator('img.blatcoin').count()) === 1, `the banner opens the Arsenal's «Buy BLATS» section (the tab with the coin: «${(await tabBtn.innerText()).trim()}»)`);
  check((await A.page.getByTestId('blats-banner-section').count()) === 1, 'the section opens with its own BLATS banner');
  const tabA = await A.page.getByTestId('blats-tab').innerText();
  check((await A.page.getByTestId('blats-balance').innerText()).trim() === '20', 'the BLATS tab: 20 on the account');
  check(/1 BLATS = 1 cent/.test(tabA) && /every new level gives 10 BLATS/.test(tabA), 'the BLATS tab explains: 1 BLATS = 1 cent, 10 BLATS a level');
  check((await A.page.getByTestId('pay-soon').count()) === 1, 'no payment provider on this server: «Payments are being connected — coming soon»');
  await A.page.waitForFunction(() => document.querySelectorAll('[data-testid=blats-tab] .pack').length >= 10, null, { timeout: 15000 }).catch(() => {});
  const packs = await A.page.locator('[data-testid=blats-tab] .pack').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  check(packs.length === 10 && /99/.test(packs[0]) && /\$0\.99/.test(packs[0]) && /4,999|4999/.test(packs[9]) && /\$49\.99/.test(packs[9]), `ten packs (v0.2.24) from 99 ($0.99) to 4,999 ($49.99) (${packs.join(' / ')})`);
  check(!NO_CRYPTO.test(tabA) && !/diamond/i.test(tabA), 'the tab says nothing about diamonds, $BLAT or tokens');
  const hints = await A.page.locator('[data-testid=blats-tab] [data-testid=pack-hint]').allInnerTexts();
  check(hints.length === 6 && /regular skin/i.test(hints[0]) && /epic character/i.test(hints[3]) && /4 × legendary character/i.test(hints[5]), `every pack says what it is enough for (${hints.map((x) => x.replace(/\s+/g, ' ')).join(' / ')})`);
  await A.page.screenshot({ path: `${outDir}/blats_tab_A.png` });
  await B.page.getByTestId('menu-blats').click();
  await B.page.getByTestId('blats-tab').waitFor({ timeout: 20000 });
  await B.page.waitForFunction(() => document.querySelectorAll('[data-testid=blats-tab] .packrow').length >= 6, null, { timeout: 15000 }).catch(() => {});
  const tabB = await B.page.getByTestId('blats-tab').innerText();
  check(/1 БЛАТ = 1 цент/.test(tabB) && (await B.page.locator('[data-testid=blats-tab] .packrow').count()) === 6, 'B’s phone: «1 БЛАТ = 1 цент», six packs');
  const bFit = await fits(B.page);
  check(bFit.v <= 0 && bFit.h <= 0, `B’s BLATS tab fits the phone (${JSON.stringify(bFit)})`);
  await B.page.screenshot({ path: `${outDir}/blats_tab_B_phone.png` });

  // ── a skin bought in the dressing room ───────────────────────────────────
  await sql`UPDATE profiles SET diamonds = diamonds + 2000 WHERE user_id = ${A.id}`;
  await toMenu(A.page);
  await A.page.getByTestId('arsenal-tile').click();
  await A.page.getByTestId('skin-pick').waitFor({ timeout: 20000 });
  const free = await A.page.locator('[data-testid=skin-pick] .skinchip[data-finish=akulka]').innerText();
  check(/✓/.test(free) && /🎁/.test(free), `the welcome gift is the player’s without buying («${free.trim()}»)`);
  await A.page.locator('[data-testid=skin-pick] .skinchip[data-finish=haki]').click();
  await A.page.getByTestId('skin-buy-row').waitFor({ timeout: 10000 });
  const buyRow = (await A.page.getByTestId('skin-buy-row').innerText()).replace(/\s+/g, ' ');
  check(/Regular/i.test(buyRow) && /99/.test(buyRow) && /\$0\.99/.test(buyRow), `the dressing room offers the regular skin for 99 BLATS ($0.99) («${buyRow}»)`);
  const before = await blats(A.id);
  await A.page.getByTestId('skin-buy').click();
  await A.page.waitForFunction(() => window.__toasts.some((t) => /Skin on:/.test(t)), null, { timeout: 15000 });
  await A.page.waitForFunction(() => !document.querySelector('[data-testid=skin-buy-row]'), null, { timeout: 10000 });
  const after = await blats(A.id);
  const owned = await sql`SELECT item_id FROM user_items WHERE user_id = ${A.id} AND kind = 'skin'`;
  check(before - after === 99 && owned.length === 1 && /haki/.test(owned[0].item_id), `bought: −99 BLATS (${before} → ${after}), the skin is A’s (${owned.map((r) => r.item_id).join(', ')})`);
  check(/✓/.test(await A.page.locator('[data-testid=skin-pick] .skinchip[data-finish=haki]').innerText()), 'the chip is ticked');
  await A.page.screenshot({ path: `${outDir}/skin_bought_A.png` });

  // ── the Arsenal's practice comes back to the Arsenal ─────────────────────
  await A.page.locator('.dressing__game .btn--red', { hasText: 'Test in practice' }).click();
  await active(A.page);
  const ffa = await hudScore(A.page);
  check(ffa.style === 'ffa' && ffa.my === 'YOU' && (ffa.lead === 'LEADER' || ffa.lead === '2ND'), `free-for-all: «YOU» and «LEADER» — no red and blue (${JSON.stringify(ffa)})`);
  const mfs = A.page.getByTestId('match-fullscreen');
  check((await mfs.count()) === 1, 'over the match: the full-screen button');
  await mfs.click();
  await A.page.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 5000 }).catch(() => {});
  await A.page.waitForTimeout(500);
  check(await isFs(A.page), 'the match goes full screen');
  const fsCanvas = await A.page.evaluate(() => {
    const c = window.__blatkom.game.canvas.getBoundingClientRect();
    return { w: Math.round(c.width), h: Math.round(c.height), W: screen.width, H: screen.height, iw: innerWidth, ih: innerHeight };
  });
  check(Math.abs(fsCanvas.w - fsCanvas.iw) <= 1 && Math.abs(fsCanvas.h - fsCanvas.ih) <= 1, `full screen: the game fills it (${JSON.stringify(fsCanvas)})`);
  await A.page.screenshot({ path: `${outDir}/practice_ffa_fullscreen_A.png` });
  await mfs.click();
  await A.page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 5000 }).catch(() => {});
  check(!(await isFs(A.page)), 'and the same button takes it back');
  await A.page.keyboard.press('Escape');
  await A.page.getByTestId('pause-leave').waitFor({ timeout: 10000 });
  check((await A.page.getByTestId('pause-fullscreen').count()) === 1, `the pause menu has «${(await A.page.getByTestId('pause-fullscreen').innerText()).trim()}»`);
  const leave1 = (await A.page.getByTestId('pause-leave').innerText()).trim();
  check(/^Back to the Arsenal$/i.test(leave1), `the pause menu’s way out: «${leave1}»`);
  await A.page.getByTestId('pause-leave').click();
  await A.page.getByTestId('skin-pick').waitFor({ timeout: 20000 });
  check(true, 'back in the Arsenal’s dressing room');

  // ── a character bought on the character screen; «Try in practice» comes back ─
  await toMenu(A.page);
  await A.page.locator('.menu__charbtn').click();
  await A.page.locator('.chars button', { hasText: 'Bugai' }).click();
  const buyBtn = (await A.page.getByTestId('char-buy').innerText()).replace(/\s+/g, ' ');
  const grade = (await A.page.locator('.dossier__grade').innerText()).trim();
  check(/299/.test(buyBtn) && /\$2\.99/.test(buyBtn) && /Rare/i.test(grade), `a locked character is bought right here (v0.2.24: 299): «${buyBtn}», grade «${grade}»`);
  const b0 = await blats(A.id);
  await A.page.getByTestId('char-buy').click();
  await A.page.waitForFunction(() => window.__toasts.some((t) => /joins the business/.test(t)), null, { timeout: 15000 });
  const b1 = await blats(A.id);
  const chars = await sql`SELECT item_id FROM user_items WHERE user_id = ${A.id} AND kind = 'character'`;
  check(b0 - b1 === 299 && chars.some((r) => r.item_id === 'buyvol'), `bought: −299 BLATS (${b0} → ${b1}), Bugai is in the crew`);
  check((await A.page.getByTestId('char-buy').count()) === 0 && (await A.page.locator('.charsel__actions .btn', { hasText: 'Choose' }).count()) === 1, 'the screen offers «Choose» now');
  const tal = (await A.page.locator('.chars button', { hasText: 'Uchastkovy' }).count()) ? 'Uchastkovy' : null;
  if (tal) {
    await A.page.locator('.chars button', { hasText: tal }).click();
    const tb = (await A.page.getByTestId('char-buy').innerText()).replace(/\s+/g, ' ');
    const coin = await A.page.getByTestId('char-buy').locator('.cur--tokens').count();
    check(/150/.test(tb) && coin === 1 && !/\$/.test(tb), `a talons character: «${tb}» with the talon coin, no dollars`);
  }
  await A.page.locator('.chars button', { hasText: 'Arkadich' }).click();
  const legend = (await A.page.locator('.dossier__grade').innerText()).trim();
  check(/Legendary/i.test(legend) && /699/.test(await A.page.getByTestId('char-buy').innerText()), `Arkadich: «${legend}», 699 BLATS (v0.2.24)`);
  await A.page.screenshot({ path: `${outDir}/characters_A.png` });
  await A.page.getByTestId('char-try').click();
  await active(A.page);
  check((await localCharacter(A.page)) === 'lev', `«Try in practice» plays as Arkadich (${await localCharacter(A.page)})`);
  await A.page.keyboard.press('Escape');
  await A.page.getByTestId('pause-leave').waitFor({ timeout: 10000 });
  const leave2 = (await A.page.getByTestId('pause-leave').innerText()).trim();
  check(/^Back to the characters$/i.test(leave2), `the pause menu’s way out: «${leave2}»`);
  await A.page.getByTestId('pause-leave').click();
  await A.page.locator('.chars').waitFor({ timeout: 20000 });
  const sel = await A.page.locator('.chars button[aria-pressed=true]').innerText();
  check(/Arkadich/i.test(sel) && (await A.page.getByTestId('char-try').count()) === 1, `back on the character screen with Arkadich selected («${sel.trim()}»)`);

  // ── the Arsenal's characters tab: «Try in practice» comes back to the Arsenal ──
  await toMenu(A.page);
  await A.page.getByTestId('arsenal-tile').click();
  await A.page.locator('.tabs button', { hasText: 'Characters' }).click();
  await A.page.locator('[data-char=popugay]').first().click();
  await A.page.getByTestId('char-sheet-try').click();
  await active(A.page);
  check((await localCharacter(A.page)) === 'popugay', `the Arsenal's character card: «Try in practice» plays as Gosha (${await localCharacter(A.page)})`);
  await A.page.keyboard.press('Escape');
  await A.page.getByTestId('pause-leave').waitFor({ timeout: 10000 });
  const leaveArs = (await A.page.getByTestId('pause-leave').innerText()).trim();
  check(/^Back to the Arsenal$/i.test(leaveArs), `its way out: «${leaveArs}»`);
  await A.page.getByTestId('pause-leave').click();
  await A.page.locator('[data-char=popugay]').first().waitFor({ timeout: 20000 });
  check(true, 'back in the Arsenal, on the characters tab');

  // ── teams: red and blue ──────────────────────────────────────────────────
  await toMenu(A.page);
  await A.page.locator('.menu__play .btn', { hasText: 'Practice' }).first().click();
  await A.page.locator('.practice__mode button[data-mode=teams]').click();
  await A.page.getByTestId('practice-start').click();
  await active(A.page);
  const teams = await hudScore(A.page);
  check(teams.style === 'teams' && teams.my === null && teams.lead === null && /RED VS BLUE/.test(teams.mode), `teams: red and blue boxes, no «YOU»/«LEADER» (${JSON.stringify(teams)})`);
  await A.page.screenshot({ path: `${outDir}/practice_teams_A.png` });
  await A.page.keyboard.press('Escape');
  const leave3 = (await A.page.getByTestId('pause-leave').innerText()).trim();
  check(/^Back to menu$/i.test(leave3), `a practice from the menu goes back to the menu («${leave3}»)`);
  await A.page.getByTestId('pause-leave').click();
  await A.page.getByTestId('menu-nick').waitFor({ timeout: 30000 });

  // ── a phone held sideways: the whole window ──────────────────────────────
  for (const vp of [{ width: 804, height: 290 }, { width: 844, height: 390 }]) {
    const L = await player('Side', 'ru', vp, { path: '/?play=offline&map=factory&bots=1' });
    await active(L.page);
    await L.page.waitForTimeout(600);
    const r = await L.page.evaluate(() => {
      const c = window.__blatkom.game.canvas.getBoundingClientRect();
      return { x: Math.round(c.left), y: Math.round(c.top), w: Math.round(c.width), h: Math.round(c.height), W: innerWidth, H: innerHeight };
    });
    check(Math.abs(r.x) <= 1 && Math.abs(r.y) <= 1 && Math.abs(r.w - r.W) <= 1 && Math.abs(r.h - r.H) <= 1, `${vp.width}×${vp.height} sideways: the game fills the window edge to edge (${JSON.stringify(r)})`);
    await L.page.screenshot({ path: `${outDir}/landscape_${vp.width}x${vp.height}.png` });
    await L.ctx.close();
  }

  // ── the story: the speaker in the middle ─────────────────────────────────
  for (const P of [A, B]) {
    await toMenu(P.page);
    await P.page.getByTestId('menu-story').click();
    await P.page.waitForFunction(() => !!document.querySelector('[data-testid=comic]') || !!document.querySelector('[data-testid=story-prologue]'), null, { timeout: 20000 });
    if (!(await P.page.getByTestId('comic').count())) await P.page.getByTestId('story-prologue').click();
    await P.page.getByTestId('comic').waitFor({ timeout: 20000 });
    let spot = null;
    for (let i = 0; i < 12 && !spot; i++) {
      await P.page.keyboard.press('ArrowRight');
      await P.page.waitForTimeout(350);
      spot = await P.page.evaluate(() => {
        const p = document.querySelector('[data-testid=comic-panel][data-who]');
        if (!p || !document.querySelector('.comic--scene')) return null;
        const b = p.querySelector('.comic__bubble').getBoundingClientRect();
        const a = p.querySelector('.comic__art').getBoundingClientRect();
        const mid = (r) => Math.round(r.top + r.height / 2 - innerHeight / 2);
        return { who: p.dataset.who, bubble: mid(b), art: mid(a), H: innerHeight };
      });
    }
    await P.page.waitForTimeout(400);
    check(spot && Math.abs(spot.bubble) <= spot.H * 0.12 && Math.abs(spot.art) <= spot.H * 0.12, `${P.name}: in the story the speaker’s portrait and line sit in the middle of the screen, not at the bottom (${JSON.stringify(spot)})`);
    await P.page.screenshot({ path: `${outDir}/story_speaker_${P.name}.png` });
    await P.page.keyboard.press('Escape');
  }

  // ── the founder ──────────────────────────────────────────────────────────
  if (adminUser) {
    // the end-to-end database is used again and again: an earlier run's founder steps down
    await sql`UPDATE users SET founder = false WHERE founder`;
    const login = await A.page.request.post(`${base}/api/admin/login`, { data: { username: adminUser, password: adminPass ?? '' } });
    const body = await login.json();
    const r = await A.page.request.post(`${base}/api/admin/players/${A.id}/founder`, { headers: { 'x-csrf-token': body.csrfToken } });
    check(r.ok(), `the administrator made A the founder (${r.status()})`);
    const res = r.ok() ? await r.json() : {};
    check(res.level === 87 && res.items > 0, `level 87, everything granted (${JSON.stringify(res)})`);
    const bal = await blats(A.id);
    await toMenu(A.page);
    const nick = await A.page.getByTestId('menu-nick').innerText();
    check((await A.page.getByTestId('menu-nick').getByTestId('founder-tag').count()) === 1, `the gold badge by A’s alias («${nick.replace(/\s+/g, ' ')}»)`);
    const levelBlats = await sql`SELECT COALESCE(sum(delta), 0)::int AS s FROM currency_ledger WHERE user_id = ${A.id} AND currency = 'diamonds' AND reason = 'level'`;
    check(levelBlats[0].s === 86 * 10, `the levels’ BLATS: 86 × 10 = ${levelBlats[0].s}, as for anybody`);
    check((await A.page.getByTestId('dossier-blats').innerText()).replace(/[^\d]/g, '') === String(bal), `the Dossier: ${bal} BLATS`);
    const hq = A.page.getByTestId('corner-hq');
    await hq.waitFor({ timeout: 15000 }).catch(() => {});
    check((await hq.count()) === 1 && (await hq.getAttribute('href')) === '/admin', 'the ★ in the corner leads to /admin');
    await A.page.screenshot({ path: `${outDir}/founder_menu_A.png` });
  }

  // ── the keys after a match ──────────────────────────────────────────────
  await toMenu(A.page);
  await A.page.locator('.menu__play .btn', { hasText: 'Practice' }).first().click();
  await A.page.locator('.practice__mode button[data-mode=ffa]').click();
  await A.page.getByRole('button', { name: '1', exact: true }).click();
  await A.page.getByTestId('practice-start').click();
  await active(A.page);
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
  await B.ctx.close();
} catch (e) {
  check(false, `v0.2.18 flow: ${e.message}`);
} finally {
  await browser.close();
  await sql.end({ timeout: 5 });
}
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `[v0218] ${failed.length} of ${checks.length} checks failed` : `[v0218] all ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
