// v0.2.20 — the owner's final edits (5 Nov 2026), end to end on the production bundle:
//   a computer: the menu's two columns end on one line, practice is one centred column, «Play with friends» sits
//   in the middle of a tall window, four «?» cards finish the crew's last row, the dressing room shows the weapon's
//   numbers by the portrait, «Skins» is violet like the cases, the full-screen button is there; a guest's welcome
//   window offers +199 BLATS and registering an email pays them; the promo code BLATNOY (typed «блатной») gives 500
//   once; a phone held upright: the logo under the switches, «Пролог» without ▶, a long alias on one line, the story's
//   two speakers top and bottom inside the screen; a phone held sideways: every menu screen without scrolling; a
//   match started upright is sideways at once — the move stick stays put, pulled hard it sprints, a drag down the
//   glass moves the player right — and the results stay sideways until the menu.
// Usage: node tests/e2e/v0220.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('usage: node tests/e2e/v0220.mjs <baseUrl> <outDir>');
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

/** A page signed in as a new guest; `welcome`: the guest's welcome window is wanted (not skipped). */
async function open(viewport, o = {}) {
  const phone = !!o.phone;
  const ctx = await browser.newContext({ viewport, locale: 'ru-RU', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript((welcome) => {
    try {
      localStorage.setItem('blatkom89.lang.v1', 'ru');
      localStorage.setItem('blatkom89.tutorial.v1', '1');
      localStorage.setItem('blatkom89.story.prologue.v1', '1');
      if (!welcome) localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
      // v0.2.21: the welcome window comes after the first match — this guest has played one already
      else localStorage.setItem('blatkom89.matches-done.v1', '1');
    } catch {}
    window.__toasts = [];
    const watch = () =>
      new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('toast')) window.__toasts.push(n.textContent);
      }).observe(document.documentElement, { childList: true, subtree: true });
    if (document.documentElement) watch();
    else document.addEventListener('DOMContentLoaded', watch);
  }, !!o.welcome);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${viewport.width}x${viewport.height}: ${e.message}`));
  await page.goto(base + '/');
  await page.waitForFunction(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('boot--hidden') || !!document.querySelector('[data-testid=boot-play]'); }, null, { timeout: 90000 });
  if (await page.getByTestId('boot-play').count()) await page.getByTestId('boot-play').click();
  if (!o.welcome) {
    const nick = page.getByRole('textbox', { name: 'Кличка' });
    await nick.waitFor({ timeout: 60000 });
    await nick.fill(o.alias ?? `e2e_${RUN}_${Math.random().toString(36).slice(2, 5)}`);
    await page.getByRole('button', { name: 'Готово' }).click();
    await page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
  }
  return { ctx, page };
}
const go = (page, route, arg) =>
  page.evaluate(async ([n, a]) => {
    const app = window.__blatkom.app;
    if (n === 'menu') return app.goMenu();
    if (n === 'arsenal') return app.showArsenal(true, a);
    if (n === 'story') return app.story.show(true);
    return app.open(n, true);
  }, [route, arg]);
const overflow = (page) => page.evaluate(() => { const s = document.querySelector('.ui .screen'); return s ? s.scrollHeight - s.clientHeight : 0; });
const toasts = (page) => page.evaluate(() => window.__toasts.slice());

try {
  // ── a computer ─────────────────────────────────────────────────────────
  const A = await open({ width: 1440, height: 900 });
  const cols = await A.page.evaluate(() => {
    const l = document.querySelector('.menu__play').getBoundingClientRect();
    const side = [...document.querySelector('.menu__side').children].map((e) => e.getBoundingClientRect().bottom);
    return { left: Math.round(l.bottom), right: Math.round(Math.max(...side)) };
  });
  check(Math.abs(cols.left - cols.right) <= 2, `the menu's two columns end on one line (${cols.left} / ${cols.right})`);
  check(await A.page.getByTestId('corner-fullscreen').isVisible(), 'the full-screen button is in the corner');
  await go(A.page, 'characters');
  await A.page.waitForTimeout(800);
  const soon = await A.page.evaluate(() => { const s = [...document.querySelectorAll('.chars__soon')]; const all = [...document.querySelectorAll('.charsel > .chars > *')]; return { n: s.filter((e) => getComputedStyle(e).display !== 'none').length, cells: all.length, text: s[0]?.textContent ?? '' }; });
  check(soon.n === 4 && soon.cells % 8 === 0 && soon.text.includes('?'), `four «?» cards finish the crew's last row (${soon.n}, ${soon.cells} cells)`);
  await A.page.screenshot({ path: `${outDir}/pc_characters.png` });
  await go(A.page, 'practice');
  await A.page.waitForTimeout(800);
  const pr = await A.page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const m = r('.practice__mode'), p = r('.practice__map'), b = r('.practice__bots'), st = r('.practice__start'), top = r('.practice > .topbar');
    return { order: m.top < p.top && p.top < b.top && b.top < st.top, sameEdges: Math.abs(m.left - p.left) < 2 && Math.abs(m.right - p.right) < 2 && Math.abs(b.left - m.left) < 2, centred: Math.abs(m.left - (innerWidth - m.right)) < 4, gaps: [Math.round(top.top), Math.round(innerHeight - st.bottom)] };
  });
  check(pr.order && pr.sameEdges && pr.centred, 'practice is one centred column: the mode, the map, the opponents, «Start»');
  check(Math.abs(pr.gaps[0] - pr.gaps[1]) < 40, `…in the middle of the window (top ${pr.gaps[0]}, bottom ${pr.gaps[1]})`);
  await A.page.screenshot({ path: `${outDir}/pc_practice.png` });
  await go(A.page, 'arsenal');
  await A.page.waitForTimeout(1500);
  const ars = await A.page.evaluate(() => ({ rows: document.querySelectorAll('.dressing__stats .wstat').length, bg: getComputedStyle(document.querySelector('[data-testid=skins-all]')).backgroundImage }));
  check(ars.rows >= 5, `the dressing room shows the weapon's numbers by the portrait (${ars.rows} rows)`);
  check(/122, 62, 180/.test(ars.bg), '«All skins» is violet and gold like the cases');
  check((await overflow(A.page)) <= 0, 'the Arsenal fits the window');
  await A.page.screenshot({ path: `${outDir}/pc_arsenal.png` });
  // the promo code, typed in Russian letters
  await go(A.page, 'arsenal', 'diamonds');
  await A.page.getByTestId('promo-input').waitFor({ timeout: 15000 });
  await A.page.getByTestId('promo-input').fill('блатной');
  await A.page.getByTestId('promo-apply').click();
  await A.page.waitForFunction(() => window.__toasts.some((t) => t.includes('BLATNOY')), null, { timeout: 15000 }).catch(() => {});
  const bal = await A.page.getByTestId('blats-balance').textContent();
  check((await toasts(A.page)).some((t) => /BLATNOY: \+500/.test(t)) && bal?.trim() === '500', `«блатной» is the promo code BLATNOY: +500 BLATS (balance ${bal})`);
  await A.page.getByTestId('promo-input').fill('BLATNOY');
  await A.page.getByTestId('promo-apply').click();
  await A.page.waitForTimeout(1500);
  check((await toasts(A.page)).some((t) => t.includes('уже активирован')), 'the same code a second time: «already used on your account»');
  await A.page.screenshot({ path: `${outDir}/pc_promo.png` });
  await A.ctx.close();

  // «Play with friends» on a tall window sits in its middle
  const T = await open({ width: 1512, height: 1080 });
  await go(T.page, 'friends');
  await T.page.waitForTimeout(800);
  const fr = await T.page.evaluate(() => { const w = document.querySelector('.friendsroom'); const kids = [...w.children].map((e) => e.getBoundingClientRect()); return [Math.round(kids[0].top), Math.round(innerHeight - kids[kids.length - 1].bottom)]; });
  check(Math.abs(fr[0] - fr[1]) < 40, `«Play with friends» sits in the middle of a tall window (top ${fr[0]}, bottom ${fr[1]})`);
  await T.page.screenshot({ path: `${outDir}/pc_friends_tall.png` });
  await T.ctx.close();

  // ── a guest's welcome window: +199 BLATS for registering ──────────────
  const W = await open({ width: 1280, height: 800 }, { welcome: true });
  await W.page.getByTestId('welcome').waitFor({ timeout: 60000 });
  const ribbon = await W.page.getByTestId('welcome-bonus').textContent().catch(() => '');
  check(/\+199/.test(ribbon ?? ''), `the welcome window offers the bonus («${(ribbon ?? '').replace(/\s+/g, ' ').trim()}»)`);
  await W.page.getByTestId('welcome-email').fill(`v0220.${RUN}@example.com`);
  await W.page.getByTestId('welcome-password').fill('long-enough-pass');
  await W.page.getByTestId('welcome-password2').fill('long-enough-pass');
  await W.page.getByTestId('welcome-register').click();
  await W.page.waitForFunction(() => window.__toasts.some((t) => t.includes('бонус за регистрацию')), null, { timeout: 20000 }).catch(() => {});
  check((await toasts(W.page)).some((t) => /\+199 БЛАТ — бонус за регистрацию/.test(t)), 'registering the email pays +199 BLATS and says so');
  const meBlats = await W.page.evaluate(() => window.__blatkom.app.online.profile?.diamonds);
  check(meBlats === 199, `the account has the 199 BLATS (${meBlats})`);
  await W.page.screenshot({ path: `${outDir}/welcome_paid.png` });
  await W.ctx.close();

  // ── a phone held upright ───────────────────────────────────────────────
  const P = await open({ width: 390, height: 844 }, { phone: true, alias: 'seasoned_badger_' + RUN.slice(0, 3) });
  const logo = await P.page.evaluate(() => Math.round(document.querySelector('.wrap--menu .logo').getBoundingClientRect().top - document.querySelector('.wrap--menu > .corner').getBoundingClientRect().bottom));
  check(logo < 60, `the logo sits close under the switches (${logo} px)`);
  check((await overflow(P.page)) <= 0, 'the phone menu fits the screen');
  await go(P.page, 'story');
  await P.page.getByTestId('story-prologue').waitFor({ timeout: 20000 });
  const pro = (await P.page.getByTestId('story-prologue').textContent()) ?? '';
  check(!/[▶►]/.test(pro) && pro.trim() === 'Пролог', `«Пролог» without the ▶ («${pro.trim()}»)`);
  await go(P.page, 'profile');
  await P.page.getByTestId('profile-name').waitFor({ timeout: 20000 });
  await P.page.waitForTimeout(800);
  const nm = await P.page.getByTestId('profile-name').evaluate((el) => { const t = el.querySelector('.fit-text'); const cs = getComputedStyle(t); return { h: t.getBoundingClientRect().height, fs: parseFloat(cs.fontSize), text: t.textContent }; });
  check(nm.h < nm.fs * 1.8, `a long alias stays on one line in the profile («${nm.text}», ${Math.round(nm.h)} px at ${nm.fs} px)`);
  await P.page.screenshot({ path: `${outDir}/phone_profile.png` });
  await go(P.page, 'arsenal');
  await P.page.getByTestId('kit-skins').waitFor({ timeout: 15000 });
  await P.page.waitForTimeout(800);
  const sk = await P.page.getByTestId('kit-skins').evaluate((el) => getComputedStyle(el).backgroundImage);
  check(/122, 62, 180/.test(sk), `«Skins» on a phone is violet and gold like «Cases» (${sk.slice(0, 60)})`);
  await P.ctx.close();

  // the story's pair of speakers on a phone: the first on top, the reply mirrored below, both on the screen
  const S = await open({ width: 390, height: 844 }, { phone: true });
  await S.page.evaluate(() => localStorage.removeItem('blatkom89.story.prologue.v1'));
  await S.page.getByTestId('menu-story').click();
  await S.page.getByTestId('comic').waitFor({ timeout: 20000 });
  let pair = null;
  for (let i = 0; i < 12 && !pair; i++) {
    await S.page.waitForTimeout(1500);
    pair = await S.page.evaluate(() => {
      const panels = [...document.querySelectorAll('.comic__panel:not(.comic__panel--caption)')].filter((p) => getComputedStyle(p).opacity !== '0');
      if (panels.length < 2) return null;
      const [a, b] = panels.map((p) => ({ box: p.getBoundingClientRect(), art: p.querySelector('.comic__art')?.getBoundingClientRect(), bub: p.querySelector('.comic__bubble')?.getBoundingClientRect(), right: p.classList.contains('comic__panel--right') }));
      return { firstAbove: a.box.bottom <= b.box.top + 1, mirrored: !a.right && b.right && a.art.left < a.bub.left && b.art.left > b.bub.left, inside: [a, b].every((x) => x.box.left >= -1 && x.box.right <= innerWidth + 1 && x.art.right <= innerWidth + 1) };
    });
    if (!pair) await S.page.mouse.click(195, 420);
  }
  check(pair && pair.firstAbove && pair.mirrored && pair.inside, `the story's two speakers: the first on top, the reply mirrored below, both on the screen (${JSON.stringify(pair)})`);
  await S.page.screenshot({ path: `${outDir}/phone_story_pair.png` });
  await S.ctx.close();

  // ── a phone held sideways: every menu screen without scrolling ────────
  for (const vp of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
    const L = await open(vp, { phone: true });
    await L.page.addStyleTag({ content: 'html { --tg-left: 47px !important; --tg-right: 47px !important; --tg-bottom: 21px !important; }' });
    const bad = [];
    for (const [route, arg] of [['menu'], ['characters'], ['arsenal'], ['arsenal', 'weapons'], ['practice'], ['friends'], ['profile'], ['settings'], ['kon'], ['clubs'], ['top'], ['social'], ['story']]) {
      try {
        await go(L.page, route, arg);
        await L.page.waitForTimeout(1300);
        const o = await overflow(L.page);
        const side = await L.page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
        if (o > 0 || side > 0) bad.push(`${route}${arg ? ':' + arg : ''} ${o}/${side}`);
        if (route === 'menu' || route === 'arsenal' || route === 'practice') await L.page.screenshot({ path: `${outDir}/land_${vp.width}_${route}${arg ? '_' + arg : ''}.png` });
      } catch (e) {
        bad.push(`${route}: ${e.message.split('\n')[0]}`);
      }
    }
    check(bad.length === 0, `sideways ${vp.width}×${vp.height}: the menu screens fit without scrolling${bad.length ? ' — ' + bad.join(', ') : ''}`);
    await L.ctx.close();
  }

  // ── a match started with the phone upright ─────────────────────────────
  const R = await open({ width: 390, height: 844 }, { phone: true });
  check(!(await R.page.evaluate(() => document.documentElement.classList.contains('rot'))), 'the menu is upright');
  await R.page.evaluate(() => window.__blatkom.app.startPractice({ mapId: 'factory', bots: 1, difficulty: 'easy', gameMode: 'ffa' }));
  await R.page.waitForFunction(() => window.__blatkom.app.screen === 'game' && window.__blatkom.app.session?.world, null, { timeout: 30000 });
  await R.page.waitForTimeout(3500);
  const turned = await R.page.evaluate(() => { const c = window.__blatkom.game.canvas; return { rot: document.documentElement.classList.contains('rot'), w: c.clientWidth, h: c.clientHeight, m: [c.style.marginLeft, c.style.marginTop] }; });
  check(turned.rot && turned.w > turned.h && turned.m.every((v) => v === '0px'), `the match is sideways at once, the picture filling the screen (${JSON.stringify(turned)})`);
  const geo = await R.page.evaluate(() => {
    const g = window.__blatkom.game;
    const hud = g.scene.getScene('hud');
    const c = g.canvas;
    const rest = hud.stickRest[0];
    // v0.2.21: HUD units → canvas pixels (the HUD camera's zoom) → CSS pixels
    const k = (c.clientWidth / g.scale.width) * (hud.uiZoom ?? 1);
    const lx = c.offsetLeft + rest.x * k;
    const ly = c.offsetTop + rest.y * k;
    return { rest, R: hud.stickRadius() * k, page: { x: innerWidth - ly, y: lx } };
  });
  const cdp = await R.ctx.newCDPSession(R.page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const me = () => R.page.evaluate(() => { const w = window.__blatkom.app.session.world; const p = [...w.players.values()].find((q) => !q.bot) ?? [...w.players.values()][0]; return { x: p.x, y: p.y, sprinting: p.sprinting, stamina: p.stamina }; });
  const p0 = await me();
  await touch('touchStart', geo.page.x, geo.page.y);
  for (let i = 1; i <= 6; i++) {
    await touch('touchMove', geo.page.x, geo.page.y + (geo.R * 0.8 * i) / 6);
    await R.page.waitForTimeout(30);
  }
  await R.page.waitForTimeout(900);
  const p1 = await me();
  const base1 = await R.page.evaluate(() => { const s = window.__blatkom.game.scene.getScene('hud').sticks[0]; return { x: s.base.x, y: s.base.y }; });
  check(p1.x - p0.x > 15 && Math.abs(p1.y - p0.y) < p1.x - p0.x, `a drag down the glass moves the player right (dx ${Math.round(p1.x - p0.x)}, dy ${Math.round(p1.y - p0.y)})`);
  check(Math.abs(base1.x - geo.rest.x) < 1 && Math.abs(base1.y - geo.rest.y) < 1 && !p1.sprinting, 'the move stick stays where it rests; a moderate pull runs');
  for (let i = 1; i <= 4; i++) {
    await touch('touchMove', geo.page.x, geo.page.y + geo.R * 0.8 + (geo.R * 0.7 * i) / 4);
    await R.page.waitForTimeout(30);
  }
  await R.page.waitForTimeout(500);
  const p2 = await me();
  check(p2.sprinting && p2.stamina < 100, `pulled past its ring the stick sprints, the breath going down (${Math.round(p2.stamina)})`);
  await R.page.screenshot({ path: `${outDir}/turned_match.png` });
  await touch('touchEnd', 0, 0);
  await R.page.evaluate(() => window.__blatkom.app.session.world.finish('time'));
  await R.page.waitForFunction(() => window.__blatkom.app.screen === 'results', null, { timeout: 15000 });
  await R.page.waitForTimeout(1200);
  const res = await R.page.evaluate(() => { const s = document.querySelector('.ui .screen'); return { rot: document.documentElement.classList.contains('rot'), over: s.scrollHeight - s.clientHeight, w: s.clientWidth, h: s.clientHeight }; });
  check(res.rot && res.over <= 0 && res.w > res.h, `the results stay sideways and fit (${JSON.stringify(res)})`);
  await R.page.screenshot({ path: `${outDir}/turned_results.png` });
  const btn = await R.page.evaluate(() => { const r = document.querySelector('[data-testid=results-menu]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await R.page.touchscreen.tap(btn.x, btn.y);
  await R.page.waitForFunction(() => window.__blatkom.app.screen === 'menu', null, { timeout: 10000 }).catch(() => {});
  const back = await R.page.evaluate(() => ({ screen: window.__blatkom.app.screen, rot: document.documentElement.classList.contains('rot') }));
  check(back.screen === 'menu' && !back.rot, '«To menu» tapped where it is drawn on the turned page; the menu is upright again');
  await R.ctx.close();
} catch (e) {
  check(false, `flow failed: ${e.message.split('\n')[0]}`);
}
for (const p of problems) console.log('  problem:', p);
await browser.close();
const failed = checks.filter((c) => !c.ok).length + problems.length;
console.log(failed ? `[v0220] ${failed} problem(s)` : `[v0220] all ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
