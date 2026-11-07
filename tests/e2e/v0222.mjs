// v0.2.22 — above 9 (7 Nov 2026), end to end on the production bundle:
//   a match keeps one light map (it was made anew on every frame since the first release: Phaser rounds a dynamic
//   texture up to even sizes) and redraws the HUD's texts only when they change (a colour set every frame redrew
//   and re-uploaded four of them) — on a phone held sideways and on a computer; a computer's short window
//   (1280 × 600): the twelve maps in two rows of chips with names of 12 px and more, the Arsenal's dressing room
//   whole — its «Test in practice» in view, nothing scrolling inside it; a phone: the menu's eight corner buttons
//   44 px wide and tall to a finger (upright on a 390 px phone, sideways), the small captions at 12 px.
// Usage: node tests/e2e/v0222.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('usage: node tests/e2e/v0222.mjs <baseUrl> <outDir>');
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

/** A guest who has played before (no first-match hints or windows), with an alias. */
async function open(viewport, o = {}) {
  const phone = !!o.phone;
  const ctx = await browser.newContext({ viewport, locale: 'ru-RU', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('blatkom89.lang.v1', 'ru');
      localStorage.setItem('blatkom89.story.prologue.v1', '1');
      localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
      localStorage.setItem('blatkom89.matches-done.v1', '3');
      localStorage.setItem('blatkom89.hints.v1', '9');
    } catch {}
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${viewport.width}x${viewport.height}: ${e.message}`));
  await page.goto(base + '/');
  await page.waitForFunction(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('boot--hidden'); }, null, { timeout: 90000 });
  const nick = page.getByRole('textbox', { name: 'Кличка' });
  await nick.waitFor({ timeout: 60000 });
  await nick.fill(`v22_${RUN}_${viewport.width}`);
  await page.getByRole('button', { name: 'Готово' }).click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}
const active = (page) => page.waitForFunction(() => window.__blatkom.app.screen === 'game' && window.__blatkom.game.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 90000 });

/** Over 60 frames of a match: how many light maps were made, how many texts redrawn per second. */
const frameWork = (page) =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const g = window.__blatkom.game;
        const scene = g.scene.getScene('game');
        const hud = g.scene.getScene('hud');
        let anyText = null;
        const walk = (l) => l.forEach((o) => { if (!anyText && o.type === 'Text') anyText = o; if (o.list) walk(o.list); });
        walk(hud.children.list);
        const P = Object.getPrototypeOf(anyText);
        const f = P.updateText;
        let redraws = 0;
        P.updateText = function (...a) { redraws++; return f.apply(this, a); };
        let rt = scene.lighting.rt;
        let made = 0;
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames++;
          if (scene.lighting.rt !== rt) { made++; rt = scene.lighting.rt; }
          if (frames < 60) return void requestAnimationFrame(tick);
          P.updateText = f;
          const s = (performance.now() - t0) / 1000;
          res({ frames, lightMapsMade: made, textRedrawsPerSec: +(redraws / s).toFixed(1), rt: [rt?.width, rt?.height] });
        };
        requestAnimationFrame(tick);
      }),
  );

try {
  // ── a phone held sideways: a match's frame work; the menu's corner ───────────
  const L = await open({ width: 844, height: 390 }, { phone: true });
  const cornerOf = (page) =>
    page.evaluate(() => {
      const corner = document.querySelector('.wrap--menu > .corner') ?? document.querySelector('.corner');
      return [...corner.querySelectorAll('a, button')]
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => {
          const r = e.getBoundingClientRect();
          const a = getComputedStyle(e, '::after');
          const ins = a.content !== 'none' && a.position === 'absolute' ? [a.top, a.right, a.bottom, a.left].map((v) => parseFloat(v) || 0) : [0, 0, 0, 0];
          return { w: Math.round(r.width - ins[1] - ins[3]), h: Math.round(r.height - ins[0] - ins[2]) };
        });
    });
  const cl = await cornerOf(L.page);
  check(cl.length >= 8 && cl.every((c) => c.w >= 44 && c.h >= 44), `a phone sideways: the menu's ${cl.length} corner buttons take a finger — 44 px and more (${JSON.stringify([...new Set(cl.map((c) => `${c.w}x${c.h}`))])})`);
  const xp = await L.page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.tile--profile .xp')).fontSize));
  check(xp >= 12, `a phone sideways: the dossier's XP caption ${xp} px`);
  await L.page.evaluate(() => window.__blatkom.app.startPractice({ mapId: 'factory', bots: 3, difficulty: 'easy', gameMode: 'ffa' }));
  await active(L.page);
  await L.page.waitForTimeout(2000);
  const wl = await frameWork(L.page);
  check(wl.lightMapsMade === 0, `a phone sideways: one light map for the whole match, none made anew in ${wl.frames} frames (${wl.rt.join('×')})`);
  check(wl.textRedrawsPerSec <= 8, `a phone sideways: the HUD's texts redrawn only when they change — ${wl.textRedrawsPerSec} a second (four every frame before)`);
  await L.page.screenshot({ path: `${outDir}/phone_match.png` });
  await L.ctx.close();

  // ── a phone held upright: the corner ────────────────────────────────────
  const U = await open({ width: 390, height: 844 }, { phone: true });
  const cu = await cornerOf(U.page);
  check(cu.length >= 8 && cu.every((c) => c.w >= 44 && c.h >= 44), `a 390 px phone upright: the corner's ${cu.length} buttons 44 px and more (${JSON.stringify([...new Set(cu.map((c) => `${c.w}x${c.h}`))])})`);
  await U.page.screenshot({ path: `${outDir}/phone_menu.png` });
  await U.ctx.close();

  // ── a computer's short window ───────────────────────────────────────────
  const C = await open({ width: 1280, height: 600 });
  await C.page.evaluate(() => window.__blatkom.app.open('practice'));
  await C.page.waitForTimeout(1200);
  const maps = await C.page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.screen--practice .maptile')].filter((t) => t.getBoundingClientRect().width > 0);
    const names = tiles.map((t) => t.querySelector('.maptile__name'));
    const s = document.querySelector('.ui .screen');
    return {
      n: tiles.length,
      rows: new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top))).size,
      px: Math.min(...names.map((e) => parseFloat(getComputedStyle(e).fontSize))),
      cut: names.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length,
      over: s.scrollHeight - s.clientHeight,
    };
  });
  check(maps.n === 12 && maps.rows === 2 && maps.px >= 12 && maps.cut === 0 && maps.over <= 0, `1280×600: the twelve maps in two rows, every name whole at ${maps.px} px, the practice one screen (${JSON.stringify(maps)})`);
  await C.page.screenshot({ path: `${outDir}/pc_practice.png` });
  await C.page.evaluate(() => window.__blatkom.app.open('arsenal'));
  await C.page.waitForTimeout(2000);
  const dress = await C.page.evaluate(() => {
    const g = document.querySelector('.dressing__grid');
    const tryBtn = [...document.querySelectorAll('.dressing__game .btn--red')][0];
    const r = tryBtn?.getBoundingClientRect();
    const gr = g.getBoundingClientRect();
    return { inner: g.scrollHeight - g.clientHeight, tryVisible: !!r && r.bottom <= gr.bottom + 1 && r.top >= gr.top - 1 && r.bottom <= innerHeight, doll: Math.round(document.querySelector('.dressing__doll')?.getBoundingClientRect().width ?? 0) };
  });
  check(dress.inner <= 1 && dress.tryVisible && dress.doll > 0, `1280×600: the dressing room whole — nothing scrolls inside it, «Test in practice» and the in-game view in sight (${JSON.stringify(dress)})`);
  await C.page.screenshot({ path: `${outDir}/pc_arsenal.png` });
  await C.page.evaluate(() => window.__blatkom.app.startPractice({ mapId: 'garages', bots: 3, difficulty: 'easy', gameMode: 'ffa' }));
  await active(C.page);
  await C.page.waitForTimeout(2000);
  const wc = await frameWork(C.page);
  check(wc.lightMapsMade === 0 && wc.textRedrawsPerSec <= 8, `a computer's match: one light map, the HUD's texts redrawn ${wc.textRedrawsPerSec} a second (${JSON.stringify(wc)})`);
  await C.ctx.close();
} catch (e) {
  check(false, `flow failed: ${e.message.split('\n')[0]}`);
}
for (const p of problems) console.log('  problem:', p);
await browser.close();
const failed = checks.filter((c) => !c.ok).length + problems.length;
console.log(failed ? `[v0222] ${failed} problem(s)` : `[v0222] all ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
