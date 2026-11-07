// v0.2.21 — the usability pass (7 Nov 2026), end to end on the production bundle:
//   a phone: the first launch asks the alias only (no registration window); the browser's «back» steps back
//   inside the game (a screen back, the menu says once more leaves, a match pauses and resumes); the match's HUD
//   is zoomed so no caption is under 11 px; the first match shows a hint over each stick, gone once the player
//   has moved and aimed; the aim assist leans towards an enemy next to the stick's line (and the settings have
//   its switch); after the first match the menu offers to keep the progress (+199 BLATS) without popping the
//   keyboard; a computer: a laptop's browser window (1366 × 625, 1280 × 600) shows every main screen without
//   scrolling, the settings show the keys only, a match hides the system cursor and shows the key line.
// Usage: node tests/e2e/v0221.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('usage: node tests/e2e/v0221.mjs <baseUrl> <outDir>');
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

/** A brand-new guest (nothing in the browser but the language). */
async function open(viewport, o = {}) {
  const phone = !!o.phone;
  const ctx = await browser.newContext({ viewport, locale: 'ru-RU', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('blatkom89.lang.v1', 'ru');
      localStorage.setItem('blatkom89.story.prologue.v1', '1');
    } catch {}
    window.__toasts = [];
    const watch = () =>
      new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('toast')) window.__toasts.push({ text: n.textContent, top: n.classList.contains('toast--top') });
      }).observe(document.documentElement, { childList: true, subtree: true });
    if (document.documentElement) watch();
    else document.addEventListener('DOMContentLoaded', watch);
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${viewport.width}x${viewport.height}: ${e.message}`));
  await page.goto(base + '/');
  await page.waitForFunction(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('boot--hidden'); }, null, { timeout: 90000 });
  return { ctx, page };
}
const screen = (page) => page.evaluate(() => window.__blatkom.app.screen);
const overflow = (page) => page.evaluate(() => { const s = document.querySelector('.ui .screen'); return s ? s.scrollHeight - s.clientHeight : 0; });
const active = (page) => page.waitForFunction(() => window.__blatkom.app.screen === 'game' && window.__blatkom.game.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 60000 });

try {
  // ── a phone held upright, a brand-new guest ──────────────────────────────
  const P = await open({ width: 390, height: 844 }, { phone: true });
  const nick = P.page.getByRole('textbox', { name: 'Кличка' });
  await nick.waitFor({ timeout: 60000 });
  check((await P.page.getByTestId('welcome').count()) === 0, 'first launch: no registration window — the alias only');
  await nick.fill(`v21_${RUN}`);
  await P.page.getByRole('button', { name: 'Готово' }).click();
  await P.page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  await P.page.waitForTimeout(800);

  // the browser's «back»: a screen back, then on the menu a note (a second «back» would leave)
  await P.page.evaluate(() => window.__blatkom.app.open('settings'));
  await P.page.waitForTimeout(500);
  const url0 = P.page.url();
  await P.page.goBack({ timeout: 5000 }).catch(() => null);
  await P.page.waitForTimeout(600);
  check((await screen(P.page)) === 'menu' && P.page.url() === url0, `«back» on the settings: the menu, the page stays (${await screen(P.page)})`);
  await P.page.goBack({ timeout: 5000 }).catch(() => null);
  await P.page.waitForTimeout(600);
  const notes = await P.page.evaluate(() => window.__toasts.map((t) => t.text));
  check((await screen(P.page)) === 'menu' && notes.some((t) => /ещё раз/.test(t)), `«back» on the menu: the game stays and says a second one leaves (${notes.at(-1)})`);

  // a practice match: the zoomed HUD, the hints
  await P.page.evaluate(() => window.__blatkom.app.startPractice({ mapId: 'factory', bots: 2, difficulty: 'easy', gameMode: 'ffa' }));
  await active(P.page);
  await P.page.waitForTimeout(2000);
  const hud = await P.page.evaluate(() => {
    const g = window.__blatkom.game;
    const h = g.scene.getScene('hud');
    const k = (g.canvas.clientWidth / g.scale.width) * (h.uiZoom ?? 1);
    const texts = [];
    const walk = (o) => { if (o.type === 'Text') texts.push(o); else if (o.list && o.visible) o.list.forEach(walk); };
    h.children.list.forEach(walk);
    const shown = texts.filter((t) => t.visible && t.text && t.alpha > 0.1);
    const sizes = shown.map((t) => parseFloat(t.style.fontSize) * (t.scaleY || 1) * k);
    return { zoom: h.uiZoom, smallest: +Math.min(...sizes).toFixed(1), hints: h.hints.map((x) => x.kind), hintText: shown.map((t) => String(t.text)).filter((s) => /ТЯНИ/.test(s)) };
  });
  check(hud.zoom > 1 && hud.smallest >= 11, `the phone HUD is zoomed (×${hud.zoom}); its smallest caption ${hud.smallest} px`);
  check(hud.hints.includes('move') && hud.hints.includes('aim') && hud.hintText.length >= 2, `the first match shows a hint over each stick (${hud.hintText.join(' | ')})`);
  await P.page.screenshot({ path: `${outDir}/phone_hints.png` });

  // «back» in a match pauses it; again — it goes on
  await P.page.goBack({ timeout: 5000 }).catch(() => null);
  await P.page.waitForTimeout(600);
  const paused = await P.page.evaluate(() => !!document.querySelector('[data-testid=pause-leave]'));
  await P.page.goBack({ timeout: 5000 }).catch(() => null);
  await P.page.waitForTimeout(600);
  const resumed = await P.page.evaluate(() => !document.querySelector('[data-testid=pause-leave]') && window.__blatkom.app.screen === 'game');
  check(paused && resumed, `«back» in a match: the pause, and back again: the match goes on (${paused}, ${resumed})`);

  // the thumbs: move with the left stick, aim with the right one — the hints go
  const geo = await P.page.evaluate(() => {
    const g = window.__blatkom.game;
    const h = g.scene.getScene('hud');
    const c = g.canvas;
    const k = (c.clientWidth / g.scale.width) * (h.uiZoom ?? 1);
    const rot = document.documentElement.classList.contains('rot');
    const toPage = (x, y) => { const lx = c.offsetLeft + x * k; const ly = c.offsetTop + y * k; return rot ? { x: innerWidth - ly, y: lx } : { x: lx, y: ly }; };
    return { move: toPage(h.stickRest[0].x, h.stickRest[0].y), aim: toPage(h.stickRest[1].x, h.stickRest[1].y), R: h.stickRadius() * k, rot };
  });
  const cdp = await P.ctx.newCDPSession(P.page);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  // «right» in the game is «down» on the turned page
  const dir = geo.rot ? [0, 1] : [1, 0];
  await T('touchStart', [{ x: geo.move.x, y: geo.move.y, id: 1 }]);
  for (let i = 1; i <= 12; i++) {
    await T('touchMove', [{ x: geo.move.x + dir[0] * geo.R * 0.7, y: geo.move.y + dir[1] * geo.R * 0.7, id: 1 }]);
    await P.page.waitForTimeout(90);
  }
  await T('touchEnd', []);
  await T('touchStart', [{ x: geo.aim.x, y: geo.aim.y, id: 2 }]);
  for (let i = 1; i <= 12; i++) {
    await T('touchMove', [{ x: geo.aim.x - dir[0] * geo.R * 0.6, y: geo.aim.y - dir[1] * geo.R * 0.6, id: 2 }]);
    await P.page.waitForTimeout(90);
  }
  await T('touchEnd', []);
  await P.page.waitForTimeout(900);
  const hintsLeft = await P.page.evaluate(() => window.__blatkom.game.scene.getScene('hud').hints.length);
  check(hintsLeft === 0, `moved and aimed: the hints are gone (${hintsLeft} left)`);

  // the aim assist: an enemy 6° off the stick's line, in sight, pulls the aim towards it
  const assist = await P.page.evaluate(() => {
    const scene = window.__blatkom.game.scene.getScene('game');
    const me = scene.lastPlayers.find((p) => p.isLocal);
    const enemy = scene.lastPlayers.find((p) => !p.isLocal);
    if (!me || !enemy) return null;
    const saved = { x: enemy.x, y: enemy.y, alive: enemy.alive };
    let out = null;
    for (let i = 0; i < 16 && !out; i++) {
      const a = (i / 16) * Math.PI * 2;
      const x = me.x + Math.cos(a) * 110;
      const y = me.y + Math.sin(a) * 110;
      if (!scene.collision.lineOfSight(me.x, me.y, x, y)) continue;
      Object.assign(enemy, { x, y, alive: true });
      const stick = a - (6 * Math.PI) / 180;
      const got = scene.aimAssist(stick, { x: me.x, y: me.y });
      const far = scene.aimAssist(a + Math.PI, { x: me.x, y: me.y });
      out = { pull: +(((got - stick) * 180) / Math.PI).toFixed(2), untouched: Math.abs(far - (a + Math.PI)) < 1e-9 };
    }
    Object.assign(enemy, saved);
    return out;
  });
  check(!!assist && assist.pull > 0.5 && assist.pull <= 7.01 && assist.untouched, `the aim assist leans the aim towards an enemy next to the line, nothing when none is (${JSON.stringify(assist)})`);

  await P.page.evaluate(() => window.__blatkom.app.session.world.finish('time'));
  await P.page.waitForFunction(() => window.__blatkom.app.screen === 'results', null, { timeout: 20000 });
  await P.page.waitForTimeout(1500);
  const btn = await P.page.evaluate(() => { const r = document.querySelector('[data-testid=results-menu]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await P.page.touchscreen.tap(btn.x, btn.y);
  await P.page.waitForFunction(() => window.__blatkom.app.screen === 'menu', null, { timeout: 10000 });
  // after the first match: the window to keep the progress, the bonus on it, no keyboard popping up
  await P.page.getByTestId('welcome').waitFor({ timeout: 15000 }).catch(() => {});
  const welcome = await P.page.evaluate(() => ({
    shown: !!document.querySelector('[data-testid=welcome]'),
    bonus: document.querySelector('[data-testid=welcome-bonus]')?.textContent ?? '',
    focused: document.activeElement?.getAttribute('data-testid') ?? null,
  }));
  check(welcome.shown && /\+199/.test(welcome.bonus) && welcome.focused !== 'welcome-email', `after the first match: «keep your progress» with +199 BLATS, the email field not focused on a phone (${JSON.stringify(welcome)})`);
  await P.page.screenshot({ path: `${outDir}/phone_welcome_after_match.png` });
  await P.page.getByTestId('welcome-guest').click();
  await P.page.evaluate(() => window.__blatkom.app.open('settings'));
  await P.page.waitForTimeout(600);
  await P.page.locator('.panetabs button').nth(1).click().catch(() => {});
  await P.page.waitForTimeout(400);
  const ctl = await P.page.evaluate(() => document.querySelector('.settings__controls')?.innerText ?? '');
  check(/Помощь в прицеливании/.test(ctl) && /Размер стик/i.test(ctl) && !/WASD/.test(ctl), 'the phone\'s settings: the aim assist\'s switch and the sticks, not the keys');
  check((await overflow(P.page)) <= 0, 'the phone\'s controls settings fit the screen');
  await P.ctx.close();

  // ── a computer: a laptop's browser window ───────────────────────────────
  for (const vp of [{ width: 1366, height: 625 }, { width: 1280, height: 600 }]) {
    const C = await open(vp);
    const n2 = C.page.getByRole('textbox', { name: 'Кличка' });
    await n2.waitFor({ timeout: 60000 });
    await n2.fill(`v21pc_${RUN}_${vp.height}`);
    await C.page.getByRole('button', { name: 'Готово' }).click();
    await C.page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
    await C.page.waitForTimeout(800);
    const over = {};
    for (const s of ['menu', 'characters', 'arsenal', 'settings', 'practice', 'profile']) {
      if (s === 'menu') await C.page.evaluate(() => window.__blatkom.app.goMenu());
      else await C.page.evaluate((x) => window.__blatkom.app.open(x), s);
      await C.page.waitForTimeout(s === 'arsenal' || s === 'characters' ? 1500 : 800);
      over[s] = await overflow(C.page);
      if (s === 'characters' || s === 'arsenal') await C.page.screenshot({ path: `${outDir}/pc_${vp.width}x${vp.height}_${s}.png` });
    }
    check(Object.values(over).every((v) => v <= 0), `${vp.width}×${vp.height}: the menu, characters, Arsenal, settings, practice and profile without scrolling (${JSON.stringify(over)})`);
    if (vp.height === 625) {
      const keys = await C.page.evaluate(() => { window.__blatkom.app.open('settings'); return document.querySelector('.settings__controls')?.innerText ?? ''; });
      check(/WASD/.test(keys) && !/Размер стик|Помощь в прицеливании/i.test(keys), 'a computer\'s settings: the keys only, no sticks');
      await C.page.evaluate(() => window.__blatkom.app.startPractice({ mapId: 'factory', bots: 1, difficulty: 'easy', gameMode: 'ffa' }));
      await active(C.page);
      const box = await C.page.locator('canvas').first().boundingBox();
      await C.page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4);
      await C.page.waitForTimeout(1500);
      const pc = await C.page.evaluate(() => {
        const h = window.__blatkom.game.scene.getScene('hud');
        const texts = [];
        const walk = (o) => { if (o.type === 'Text') texts.push(String(o.text)); else if (o.list) o.list.forEach(walk); };
        h.children.list.forEach(walk);
        return { cursor: getComputedStyle(window.__blatkom.game.canvas).cursor, keys: texts.some((t) => /WASD/.test(t)), zoom: h.uiZoom };
      });
      check(pc.cursor === 'none' && pc.zoom === 1, `a computer's match: the system cursor hidden over the crosshair, the HUD as before (${JSON.stringify(pc)})`);
      check(pc.keys, 'the first match on a computer shows the line of keys');
      await C.page.screenshot({ path: `${outDir}/pc_match_keys.png` });
    }
    await C.ctx.close();
  }
} catch (e) {
  check(false, `flow failed: ${e.message.split('\n')[0]}`);
}
for (const p of problems) console.log('  problem:', p);
await browser.close();
const failed = checks.filter((c) => !c.ok).length + problems.length;
console.log(failed ? `[v0221] ${failed} problem(s)` : `[v0221] all ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
